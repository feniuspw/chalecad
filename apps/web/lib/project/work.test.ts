import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { computeAll, loadProject, type Project } from '@chalecad/engine';
import { getCatalog } from '@chalecad/catalog';
import fixture from '../../../../packages/engine/fixtures/gable-6.5x8.5-mezzanine.json';
import { exportWorkPurchaseCsv } from '../export/work-csv';
import {
  addDaysISO,
  buyBy,
  ganttRows,
  purchaseList,
  setBought,
  setDuration,
  setPaid,
  setStageDone,
  stageDurations,
  workProgress,
} from './work';

const catalog = getCatalog();
const loaded = loadProject(fixture);
if (!loaded.ok) throw new Error('fixture inválido');
const base: Project = loaded.project;
const results = computeAll(base, catalog, { today: '2026-11-07' });
const withProgress = (p: Partial<Project['progress']>): Project => produce(base, (d) => void Object.assign(d.progress, p));

describe('stageDurations', () => {
  it('estima pelas horas-homem em passos de 0,5, mínimo 0,5', () => {
    const d = stageDurations(base, results, catalog);
    for (const v of Object.values(d)) {
      expect(v!.source).toBe('estimado');
      expect(v!.weeks).toBeGreaterThanOrEqual(0.5);
      expect((v!.weeks * 2) % 1).toBe(0);
    }
    // Fundação: (18,7 + 10 + 55,6) h / 88 h/sem ≈ 0,95 -> 1
    expect(d.foundation!.weeks).toBe(1);
    expect(Object.keys(d)).toEqual(['foundation', 'structure', 'closure', 'roof', 'floor', 'finishing']);
  });
  it('usa a duração definida e marca a origem', () => {
    const p = produce(base, (d) => void (d.budget.durationsWeeks.structure = 3));
    const d = stageDurations(p, computeAll(p, catalog, { today: '2026-11-07' }), catalog);
    expect(d.structure).toEqual({ weeks: 3, source: 'definido' });
    expect(d.roof!.source).toBe('estimado');
  });
});

describe('ganttRows', () => {
  it('é sequencial e usa rótulos relativos sem startDate', () => {
    const rows = ganttRows(base, results, catalog);
    expect(rows[0]!.start).toBe(0);
    expect(rows[0]!.startDate).toBeNull();
    expect(rows[0]!.weekLabel).toMatch(/^Semana 1/);
    expect(rows[1]!.start).toBeCloseTo(rows[0]!.end);
  });
  it('calcula datas a partir de startDate', () => {
    const p = withProgress({ startDate: '2027-01-04' });
    const rows = ganttRows(p, results, catalog);
    expect(rows[0]!.startDate).toBe('2027-01-04');
    expect(rows[0]!.endDate).toBe(addDaysISO('2027-01-04', rows[0]!.weeks * 7));
  });
  it('sobreposição de Instalações com custo sintético', () => {
    const r = produce(results, (d) => {
      d.budget.byStage.push({ ...d.budget.byStage[0]!, stage: 'installations', total: 100 });
    });
    const p = produce(base, (d) => {
      d.budget.durationsWeeks.closure = 4;
      d.budget.durationsWeeks.installations = 2;
    });
    const rows = ganttRows(p, r, catalog);
    const by = (s: string) => rows.find((x) => x.stage === s)!;
    expect(by('installations').start).toBeCloseTo(by('closure').start + 2);
    expect(by('finishing').start).toBeGreaterThanOrEqual(by('installations').end);
  });
});

describe('purchaseList', () => {
  it('totaliza orçado, pago e falta comprar', () => {
    const empty = purchaseList(results, base.progress, catalog);
    const sum = results.budget.lines.reduce((s, l) => s + l.material, 0);
    expect(empty.totals.estimated).toBeCloseTo(sum);
    expect(empty.totals.remaining).toBeCloseTo(sum);
    expect(empty.totals.paid).toBe(0);

    const item = empty.groups[0]!.rows[0]!;
    const p = withProgress({ purchased: { [item.itemId]: { at: '2026-11-08', paid: item.estimated + 50 } } });
    const l = purchaseList(results, p.progress, catalog);
    const row = l.groups[0]!.rows[0]!;
    expect(row.bought).toBe(true);
    expect(row.diff).toBeCloseTo(50);
    expect(l.totals.paid).toBeCloseTo(item.estimated + 50);
    expect(l.totals.remaining).toBeCloseTo(sum - item.estimated);
    expect(l.groups[0]!.totals.boughtCount).toBe(1);
  });
  it('itens repetidos em outra etapa compartilham o status sem duplicar o valor pago', () => {
    const p = withProgress({ purchased: { screw_board: { at: '2026-11-08', paid: 100 } } });
    const rows = purchaseList(results, p.progress, catalog).groups.flatMap((g) => g.rows).filter((r) => r.itemId === 'screw_board');
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.bought)).toBe(true);
    expect(rows.filter((r) => r.paid !== null)).toHaveLength(1);
  });
});

describe('buyBy', () => {
  const lt = catalog.constants.leadTimes;
  it('perfil de aço: início − 21 dias, atrasado quando já passou', () => {
    const row = { leadKey: 'steelProfile' as const, bought: false };
    const b = buyBy(row, { start: 1, startDate: '2027-01-11' }, lt, '2027-01-01')!;
    expect(b.date).toBe('2026-12-21');
    expect(b.overdue).toBe(true);
    expect(buyBy({ ...row, bought: true }, { start: 1, startDate: '2027-01-11' }, lt, '2027-01-01')!.overdue).toBe(false);
    expect(buyBy(row, { start: 1, startDate: '2027-01-11' }, lt, '2026-12-01')!.overdue).toBe(false);
  });
  it('sem startDate: texto relativo, sem data', () => {
    const b = buyBy({ leadKey: 'concrete', bought: false }, { start: 2, startDate: null }, lt)!;
    expect(b.date).toBeNull();
    expect(b.days).toBe(3);
    expect(b.label).toContain('3 dias');
    expect(b.overdue).toBe(false);
  });
  it('categoria sem prazo devolve null', () => {
    expect(buyBy({ leadKey: null, bought: false }, { start: 0, startDate: null }, lt)).toBeNull();
  });
});

describe('receitas de edição', () => {
  it('marcar e desmarcar comprado altera só progress.purchased', () => {
    const on = produce(base, (d) => setBought(d.progress, 'concrete_fck25', true, '2026-11-08'));
    expect(on.progress.purchased).toEqual({ concrete_fck25: { at: '2026-11-08' } });
    expect({ ...on, progress: base.progress }).toEqual(base);
    const off = produce(on, (d) => setBought(d.progress, 'concrete_fck25', false));
    expect(off).toEqual(base);
  });
  it('valor pago marca como comprado e pode ser limpo', () => {
    const a = produce(base, (d) => setPaid(d.progress, 'gravel_1', 320, '2026-11-08'));
    expect(a.progress.purchased.gravel_1).toEqual({ at: '2026-11-08', paid: 320 });
    const b = produce(a, (d) => setPaid(d.progress, 'gravel_1', null));
    expect(b.progress.purchased.gravel_1).toEqual({ at: '2026-11-08' });
  });
  it('etapas concluídas ficam na ordem e sem repetição', () => {
    const a = produce(base, (d) => {
      setStageDone(d.progress, 'roof', true);
      setStageDone(d.progress, 'foundation', true);
      setStageDone(d.progress, 'roof', true);
    });
    expect(a.progress.stagesDone).toEqual(['foundation', 'roof']);
    expect(produce(a, (d) => setStageDone(d.progress, 'roof', false)).progress.stagesDone).toEqual(['foundation']);
  });
  it('duração grava em budget.durationsWeeks', () => {
    const a = produce(base, (d) => setDuration(d.budget, 'roof', 2));
    expect(a.budget.durationsWeeks.roof).toBe(2);
    expect(produce(a, (d) => setDuration(d.budget, 'roof', 0)).budget.durationsWeeks.roof).toBeUndefined();
  });
  it('progresso resume etapas e valores', () => {
    const p = withProgress({ stagesDone: ['foundation'], purchased: { gravel_1: { at: '2026-11-08', paid: 10 } } });
    const w = workProgress(results, p.progress, catalog);
    expect(w.stagesDone).toBe(1);
    expect(w.stagesTotal).toBe(6);
    expect(w.paid).toBe(10);
  });
});

describe('CSV de compras', () => {
  it('traz status e data limite', () => {
    const p = withProgress({ startDate: '2027-01-04', purchased: { gravel_1: { at: '2026-11-08', paid: 10 } } });
    const csv = exportWorkPurchaseCsv(results, p, catalog, '2027-01-01');
    expect(csv).toContain('Pago − orçado');
    expect(csv).toMatch(/Sim;08\/11\/2026;10,00/);
    expect(csv).toContain('Total pago');
  });
});

describe('página do PDF', () => {
  it('só existe com data de início ou compra marcada', async () => {
    const { buildWorkPdf } = await import('../pdf/work');
    expect(buildWorkPdf(base, results)).toBeNull();
    const w = buildWorkPdf(withProgress({ startDate: '2027-01-04', purchased: { gravel_1: { at: '2026-11-08' } } }), results, { catalog, today: '2027-01-01' })!;
    expect(w.schedule[0]!.start).toBe('04/01/2027');
    expect(w.toBuy.flatMap((g) => g.rows).some((r) => r.name.toLowerCase().includes('brita'))).toBe(false);
    expect(w.toBuy.flatMap((g) => g.rows).some((r) => r.overdue)).toBe(true);
  });
});
