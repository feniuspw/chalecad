import { describe, expect, test } from 'vitest';
import { computeAll } from '../../src/compute';
import { buildConstructionGuide, buildEngineerPackage } from '../../src/reports';
import type { Results } from '../../src/schema';
import { DISCLAIMER } from '../../src/schema';
import { testCatalog } from '../helpers/catalog';
import { loadFixture } from '../helpers/load';

const project = loadFixture('gable-6.5x8.5-mezzanine.json');
const results = computeAll(project, testCatalog);

describe('buildConstructionGuide (fixture gable 6,5 x 8,5)', () => {
  const guide = buildConstructionGuide(project, results, testCatalog);
  const idx = (id: string) => guide.steps.findIndex((s) => s.id === id);

  test('etapas em ordem, numeradas, JSON serializável', () => {
    expect(guide.steps.map((s) => s.order)).toEqual(guide.steps.map((_, i) => i + 1));
    const order = ['layout', 'embedded-utilities', 'radier', 'wall:ext-front', 'mezzanine', 'roof', 'exterior-closure', 'services', 'interior-closure', 'floor', 'finishing'];
    const pos = order.map(idx);
    expect(pos.every((p) => p >= 0)).toBe(true);
    expect([...pos].sort((a, b) => a - b)).toEqual(pos);
    expect(JSON.parse(JSON.stringify(guide))).toEqual(guide);
  });

  test('um passo por parede, externas (frente primeiro) antes das internas', () => {
    const walls = guide.steps.filter((s) => s.phase === 'walls');
    expect(walls.map((s) => s.hostIds[0]).sort()).toEqual(results.model.walls.map((w) => w.id).sort());
    expect(walls[0]!.id).toBe('wall:ext-front');
    const extN = results.model.walls.filter((w) => w.exteriorSide !== null).length;
    const kinds = walls.map((s) => results.model.walls.find((w) => w.id === s.hostIds[0])!.exteriorSide !== null);
    expect(kinds.slice(0, extN).every(Boolean)).toBe(true);
    expect(kinds.slice(extN).some(Boolean)).toBe(false);
    expect(idx('wall:ext-front')).toBeGreaterThan(idx('radier'));
    expect(idx('wall:w-bath-1')).toBeGreaterThan(idx('wall:ext-left'));
  });

  test('soma das peças dos passos de parede = peças das paredes', () => {
    const wallIds = new Set(results.model.walls.map((w) => w.id));
    const expected = results.pieces.filter((p) => wallIds.has(p.hostId)).length;
    const sum = guide.steps.filter((s) => s.phase === 'walls').reduce((a, s) => a + (s.pieceCount ?? 0), 0);
    expect(sum).toBe(expected);
    for (const s of guide.steps.filter((x) => x.phase === 'walls')) {
      expect(s.weightKg).toBeGreaterThan(0);
      expect(s.panels).toBeGreaterThanOrEqual(1);
    }
  });

  test('materiais referenciam linhas de quantidade existentes; durações positivas', () => {
    const lineIds = new Set(results.quantities.lines.map((l) => l.id));
    for (const s of guide.steps) {
      for (const m of s.materials) expect(lineIds.has(m)).toBe(true);
      expect(s.manHours).toBeGreaterThan(0);
      expect(s.tools.length).toBeGreaterThan(0);
      expect(s.description.length).toBeGreaterThan(20);
    }
    expect(guide.steps.find((s) => s.id === 'roof')!.materials.some((m) => m.includes('sandwich'))).toBe(true);
    expect(guide.steps.find((s) => s.id === 'radier')!.materials).toContain('foundation:concrete_fck25');
    expect(guide.totalManHours).toBeCloseTo(guide.steps.reduce((a, s) => a + s.manHours, 0), 0);
  });

  test('compre primeiro: fundação e estrutura, maior prazo primeiro; ferramentas consolidadas', () => {
    expect(guide.buyFirst.length).toBeGreaterThan(5);
    expect(guide.buyFirst.every((b) => b.stage === 'foundation' || b.stage === 'structure')).toBe(true);
    const days = guide.buyFirst.map((b) => b.leadTimeDays);
    expect(days).toEqual([...days].sort((a, b) => b - a));
    expect(new Set(guide.tools).size).toBe(guide.tools.length);
    expect(guide.disclaimer).toBe(DISCLAIMER);
  });
});

describe('buildEngineerPackage', () => {
  test('sem structure (null): funciona e gera perguntas', () => {
    const pkg = buildEngineerPackage(project, { ...results, structure: null }, testCatalog);
    expect(pkg.checks).toEqual([]);
    expect(pkg.loadAssumptions.loads).toBeNull();
    expect(pkg.openQuestions.length).toBeGreaterThan(0);
    expect(pkg.openQuestions.some((q) => q.text.includes('Sondagem do solo') && q.text.includes('100 kPa'))).toBe(true);
    expect(pkg.openQuestions.some((q) => q.text.includes('Vento: V0 informado 35 m/s'))).toBe(true);
    expect(pkg.openQuestions.some((q) => q.text.startsWith('Validar vão de'))).toBe(true);
    expect(pkg.summary.typology).toBe('gable_mezzanine');
    expect(pkg.summary.dimensions.width).toBe(6.5);
    expect(pkg.artNotice).toContain('ART');
    expect(JSON.parse(JSON.stringify(pkg))).toEqual(pkg);
  });

  test('com structure e verificações warn/fail: tabela, pontos de atenção e perguntas', () => {
    const base = results.structure ?? {
      checks: [],
      loads: { deadRoofKPa: 0.2, liveRoofKPa: 0.25, deadFloorKPa: 0.5, liveFloorKPa: 1.5, windQKPa: 0.6, windWallKPa: 0.5, windRoofUpliftKPa: 0.7 },
      summary: { ok: 0, warn: 0, fail: 0, maxRatio: 0 },
      disclaimer: DISCLAIMER,
    };
    const mk = (id: string, ratio: number, status: 'ok' | 'warn' | 'fail') => ({
      id, kind: 'joist' as const, label: `Viga ${id}`, pieceIds: [], hostIds: ['slab-L1'], demand: ratio, capacity: 1, unit: 'kN.m', ratio, status, detail: 'detalhe',
    });
    const r: Results = {
      ...results,
      structure: { ...base, checks: [mk('a', 0.5, 'ok'), mk('b', 0.95, 'warn'), mk('c', 1.2, 'fail')] },
      warnings: [...results.warnings, { code: 'x.test', severity: 'warn', message: 'algo' }],
    };
    const pkg = buildEngineerPackage(project, r, testCatalog);
    expect(pkg.checks.map((c) => c.id)).toEqual(['c', 'b', 'a']);
    expect(pkg.attentionPoints[0]!.severity).toBe('fail');
    expect(pkg.attentionPoints.filter((p) => p.source === 'check')).toHaveLength(2);
    expect(pkg.attentionPoints.some((p) => p.text.includes('x.test'))).toBe(true);
    expect(pkg.openQuestions.length).toBeGreaterThan(0);
    expect(pkg.openQuestions.some((q) => q.rule === 'check-fail')).toBe(true);
    expect(pkg.loadAssumptions.loads?.windQKPa).toBe(base.loads.windQKPa);
  });

  test('solo informado não é tratado como padrão', () => {
    const p = loadFixture('gable-6.5x8.5-mezzanine.json', (j) => { j.design = { soilBearingKPa: 180 }; });
    const pkg = buildEngineerPackage(p, computeAll(p, testCatalog), testCatalog);
    expect(pkg.loadAssumptions.soilIsDefault).toBe(false);
    expect(pkg.openQuestions.some((q) => q.text.includes('180 kPa'))).toBe(true);
  });
});

describe('relatórios nas novas tipologias', () => {
  test('combined L e gambrel geram guia e pacote com perguntas específicas', () => {
    for (const typology of [
      { kind: 'combined', shape: 'L', width: 6, depth: 8, wallHeight: 2.6, roofPitchDeg: 30, wing: { width: 4, depth: 4, offset: 0 } },
      { kind: 'gambrel', width: 6, depth: 8, wallHeight: 2.5 },
    ]) {
      const p = loadFixture('gable-6.5x8.5-mezzanine.json', (j) => {
        j.typology = typology;
        j.openings = [];
        j.walls = [];
        j.stairs = [];
        j.levels = [{ id: 'L0', elevation: 0, floor: 'polished_concrete' }];
        j.utilities = [];
      });
      const r = computeAll(p, testCatalog);
      const guide = buildConstructionGuide(p, r, testCatalog);
      expect(guide.steps.filter((s) => s.phase === 'walls')).toHaveLength(r.model.walls.length);
      const pkg = buildEngineerPackage(p, r, testCatalog);
      expect(pkg.openQuestions.some((q) => q.rule === (typology.kind === 'combined' ? 'combined-valley' : 'gambrel-break'))).toBe(true);
    }
  });
});
