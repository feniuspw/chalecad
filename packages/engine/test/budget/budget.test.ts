import { describe, expect, test } from 'vitest';
import { buildModel } from '../../src/model';
import { loadProject } from '../../src/load';
import { computeBudget } from '../../src/budget';
import { computeWeight } from '../../src/weight';
import { computeQuantities } from '../../src/quantities';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { QuantityLine, QuantityReport, WeightReport } from '../../src/schema/results';
import { testCatalog } from '../helpers/catalog';
import { syntheticPieces } from '../helpers/pieces';

const r = loadProject(JSON.parse(readFileSync(join(import.meta.dirname, '../../fixtures/gable-6.5x8.5-mezzanine.json'), 'utf8')));
if (!r.ok) throw new Error('fixture');
const base = r.project;
const model = buildModel(base, testCatalog);
const book = testCatalog.priceBooks.find((b) => b.id === base.priceBookId)!;

const line = (id: string, stage: QuantityLine['stage'], priceItemId: string, qty: number, weightKg: number): QuantityLine => ({
  id, stage, itemId: priceItemId, name: id, unit: 'un', purchaseQty: qty, netQty: qty, netUnit: 'un',
  wastePct: 0, weightKg, priceItemId, pieceIds: [], hostIds: [],
});
const areas = { footprint: 50, built: 80, roof: 60, exteriorWallsNet: 70, interiorWallsNet: 10, openings: 5, radier: 55, mezzanine: 20 };
const q = (lines: QuantityLine[], steelKg = 100): QuantityReport => ({ lines, cutPlans: [], areas, steelKg, steelKgPerM2: 1, woodM3: 0, woodM3PerM2: 0 });
const w: WeightReport = { totalKg: 0, superstructureKg: 0, byStage: {}, byElement: [], kgPerM2: 0 };
const proj = (patch: Record<string, unknown>) => ({ ...base, budget: { ...base.budget, ...patch } });

const items = book.items.slice(0, 3);
const synth = q([
  line('a', 'foundation', items[0]!.itemId, 2, 1000),
  line('b', 'structure', items[1]!.itemId, 3, 500),
  line('c', 'structure', 'nao_existe', 1, 0),
]);

describe('computeBudget', () => {
  const p = proj({ contingencyPct: 10, freight: { distanceKm: 100, pricePerTonKm: 2 }, durationsWeeks: {} });
  const b = computeBudget(synth, w, model, p, testCatalog, '2026-11-07');
  const it0 = items[0]!;
  const it1 = items[1]!;

  test('material, labor, frete, contingência e total à mão', () => {
    const f = b.byStage.find((s) => s.stage === 'foundation')!;
    const s = b.byStage.find((s) => s.stage === 'structure')!;
    const matF = 2 * it0.price;
    const matS = 3 * it1.price;
    const lab = (stage: string) => book.labor.filter((l) => l.stage === stage);
    const rateF = lab('foundation').reduce((a, l) => a + l.rate * areas.radier, 0);
    const rateS = lab('structure').reduce((a, l) => a + l.rate * 100, 0);
    expect(f.material).toBeCloseTo(matF, 6);
    expect(f.labor).toBeCloseTo(rateF, 6);
    expect(f.freight).toBeCloseTo((1000 / 1000) * 100 * 2, 6);
    expect(s.freight).toBeCloseTo((500 / 1000) * 100 * 2, 6);
    expect(s.material).toBeCloseTo(matS, 6);
    expect(s.labor).toBeCloseTo(rateS, 6);
    const sub = matF + matS + rateF + rateS + 200 + 100;
    expect(b.subtotal).toBeCloseTo(sub, 6);
    expect(b.contingency).toBeCloseTo(sub * 0.1, 6);
    expect(b.total).toBeCloseTo(sub * 1.1, 6);
    expect(b.perM2).toBeCloseTo((sub * 1.1) / model.builtArea, 6);
    expect(b.totalMax).toBeGreaterThanOrEqual(b.total);
  });

  test('item inexistente: missing, preço 0', () => {
    const l = b.lines.find((x) => x.lineId === 'c')!;
    expect(l.missing).toBe(true);
    expect(l.material).toBe(0);
    expect(b.missingPrices).toEqual(['nao_existe']);
  });

  test('priceOverrides substitui o preço e marca overridden', () => {
    const o = computeBudget(synth, w, model, { ...p, priceOverrides: { [it0.itemId]: { price: 1000, date: '2026-11-01', source: 'x' } } }, testCatalog, '2026-11-07');
    const l = o.lines.find((x) => x.lineId === 'a')!;
    expect(l.overridden).toBe(true);
    expect(l.unitPrice).toBe(1000);
    expect(l.material).toBe(2000);
    expect(l.materialMax).toBe(2000);
    expect(b.lines.find((x) => x.lineId === 'a')!.overridden).toBe(false);
  });

  test('override resolve item sem preço na base', () => {
    const o = computeBudget(synth, w, model, { ...p, priceOverrides: { nao_existe: { price: 5, date: '2026-11-01', source: 'x' } } }, testCatalog, '2026-11-07');
    expect(o.lines.find((x) => x.lineId === 'c')!.missing).toBe(false);
    expect(o.missingPrices).toEqual([]);
  });

  test('diyStages zera a mão de obra da etapa', () => {
    const d = computeBudget(synth, w, model, proj({ diyStages: ['structure'] }), testCatalog, '2026-11-07');
    const s = d.byStage.find((x) => x.stage === 'structure')!;
    expect(s.labor).toBe(0);
    expect(s.diy).toBe(true);
    expect(d.byStage.find((x) => x.stage === 'foundation')!.labor).toBeGreaterThan(0);
  });

  test('preço antigo é stale', () => {
    const o = computeBudget(synth, w, model, { ...p, priceOverrides: { [it0.itemId]: { price: 1, date: '2026-01-01', source: 'x' } } }, testCatalog, '2026-11-07');
    expect(o.lines.find((x) => x.lineId === 'a')!.stale).toBe(true);
    expect(o.stalePrices).toContain(it0.itemId);
    const fresh = computeBudget(synth, w, model, { ...p, priceOverrides: { [it0.itemId]: { price: 1, date: '2026-11-01', source: 'x' } } }, testCatalog, '2026-11-07');
    expect(fresh.stalePrices).not.toContain(it0.itemId);
  });

  test('cronograma: 5 semanas, soma = total das duas etapas com contingência', () => {
    const s = computeBudget(synth, w, model, proj({ contingencyPct: 10, durationsWeeks: { foundation: 2, structure: 3 } }), testCatalog, '2026-11-07');
    expect(s.schedule.map((x) => x.week)).toEqual([1, 2, 3, 4, 5]);
    const sum = s.schedule.reduce((a, x) => a + x.amount, 0);
    const stages = s.byStage.reduce((a, x) => a + x.total, 0);
    expect(sum).toBeCloseTo(stages * 1.1, 6);
    expect(s.schedule[0]!.stages).toEqual(['foundation']);
    expect(s.schedule[4]!.stages).toEqual(['structure']);
  });

  test('integração com quantidades sintéticas do fixture', () => {
    const pieces = syntheticPieces(model, base);
    const qq = computeQuantities(model, pieces, base, testCatalog);
    const ww = computeWeight(model, pieces, qq, base, testCatalog);
    const bb = computeBudget(qq, ww, model, base, testCatalog, book.date);
    expect(bb.total).toBeGreaterThan(0);
    expect(bb.byStage.map((s) => s.stage)).toEqual(
      ['terrain', 'foundation', 'structure', 'closure', 'roof', 'floor', 'finishing', 'extras'].filter((s) => bb.byStage.some((x) => x.stage === s)),
    );
  });
});
