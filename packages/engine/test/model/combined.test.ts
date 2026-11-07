import { describe, expect, test } from 'vitest';
import { cross3, polygonArea } from '../../src/geometry';
import { combinedGeometry } from '../../src/model/combined';
import { computeAll } from '../../src/compute';
import { testCatalog } from '../helpers/catalog';
import { mk, run } from '../helpers/inline';

const DEG = Math.PI / 180;
const comb = (shape: 'L' | 'T', wing: object = {}, extra: object = {}) =>
  mk({
    kind: 'combined', shape, width: 6, depth: 8, wallHeight: 2.6, roofPitchDeg: 30, eave: 0.5, rake: 0.3,
    wing: { width: 4, depth: 4, offset: 0, ...wing }, ...extra,
  });

describe('combined L 6 x 8 + ala 4 x 4, offset 0', () => {
  const project = comb('L');
  const { model, pieces, quantities } = run(project);

  test('área construída = 48 + 16, footprint e radier em L', () => {
    expect(model.builtArea).toBeCloseTo(64, 9);
    expect(model.footprint).toHaveLength(6);
    const radier = model.slabs.find((s) => s.kind === 'radier')!;
    expect(radier.polygon).toHaveLength(6);
    expect(radier.area).toBeCloseTo(polygonArea(radier.polygon), 9);
    expect(radier.area).toBeGreaterThan(model.footprintArea);
    expect(model.footprintArea).toBeGreaterThan(64);
    expect(quantities.areas.radier).toBeCloseTo(radier.area, 9);
  });

  test('paredes: ext-back dividida (sem parede sob a ala), paredes da ala', () => {
    const ids = model.walls.map((w) => w.id);
    expect(ids).toEqual(expect.arrayContaining(['ext-front', 'ext-right', 'ext-back', 'ext-left', 'wing-left', 'wing-right', 'wing-back']));
    const back = model.walls.find((w) => w.id === 'ext-back')!;
    expect(back.from).toEqual([6, 8]);
    expect(back.to).toEqual([4, 8]);
    expect(back.length).toBeCloseTo(2, 9);
    expect(model.walls.some((w) => w.id === 'ext-back-2')).toBe(false);
    expect(model.walls.find((w) => w.id === 'wing-back')!.outline).toHaveLength(5);
    expect(model.walls.find((w) => w.id === 'wing-left')!.length).toBe(4);
  });

  test('4 águas, a ala termina no rincão e a área é a real', () => {
    expect(model.roofPlanes.map((p) => p.id)).toEqual(['roof-a', 'roof-b', 'wing-roof-a', 'wing-roof-b']);
    for (const p of model.roofPlanes) {
      expect(p.slopeDeg).toBeCloseTo(30, 9);
      expect(cross3(p.uAxis, p.vAxis)[2]).toBeGreaterThan(0);
    }
    const g = combinedGeometry(project.typology as never);
    // rincão: diagonal 45° em planta de (xl, D+e) até o ápice (xm, D - wW/2)
    expect(g.valleys).toHaveLength(2);
    const dx = 2 + 0.5;
    const tan = Math.tan(30 * DEG);
    expect(g.valleys[0]!.length).toBeCloseTo(Math.hypot(dx, dx, dx * tan), 9);
    // ala (a): trapézio com lados paralelos (yB - ye) e (yB - ápice), largura (2 + 0,5)
    const yB = 8 + 4 + 0.3;
    const wingPlan = (2.5 * ((yB - 8.5) + (yB - 6))) / 2;
    const wa = model.roofPlanes.find((p) => p.id === 'wing-roof-a')!;
    expect(wa.area).toBeCloseTo(wingPlan / Math.cos(30 * DEG), 9);
    // fundo: retângulo menos o entalhe em V (triângulo de base 5 e altura 2,5 em x; recortado pelo rake à esquerda)
    const b = model.roofPlanes.find((p) => p.id === 'roof-b')!;
    expect(b.area).toBeLessThan((6.6 * (4 + 0.5)) / Math.cos(30 * DEG));
    expect(b.vertices.length).toBeGreaterThan(4);
    // topo da ala abaixo da cumeeira principal
    expect(model.ridgeHeight).toBeCloseTo(2.6 + 4 * tan, 9);
  });

  test('peças: caibros da ala partem do beiral e terminam no rincão; cumeeira e terças da ala', () => {
    const n = (h: string, r: string) => pieces.filter((p) => p.hostId === h && p.role === r).length;
    expect(n('wing-roof-a', 'rafter')).toBeGreaterThan(4);
    expect(n('wing-roof-b', 'rafter')).toBeGreaterThan(4);
    expect(n('wing-roof-a', 'ridge')).toBe(1);
    expect(n('wing-roof-a', 'purlin')).toBeGreaterThan(2);
    expect(n('roof-b', 'rafter')).toBeGreaterThan(8);
    // caibros do fundo no entalhe são mais curtos que os fora dele
    const lens = pieces.filter((p) => p.hostId === 'roof-b' && p.role === 'rafter').map((p) => p.length);
    expect(Math.min(...lens)).toBeLessThan(Math.max(...lens));
    // nenhum caibro da ala mais longo que a água
    const wa = model.roofPlanes.find((p) => p.id === 'wing-roof-a')!;
    for (const p of pieces.filter((x) => x.hostId === 'wing-roof-a' && x.role === 'rafter')) {
      expect(p.length).toBeLessThanOrEqual(wa.vLength + 1e-6);
    }
  });

  test('quantitativos: telha real, rincão como rufo de água-furtada', () => {
    const roof = quantities.lines.find((x) => x.itemId === 'sandwich_eps30')!;
    expect(roof.netQty).toBeCloseTo(model.roofPlanes.reduce((s, p) => s + p.area, 0), 6);
    expect(quantities.areas.roof).toBeCloseTo(roof.netQty, 6);
    const fl = quantities.lines.find((x) => x.itemId === 'flashing' && x.stage === 'roof')!;
    expect(fl.note).toContain('rincão');
    expect(fl.netQty).toBeGreaterThan(2 * 3.5);
  });

  test('computeAll roda sem alertas typology.partial', () => {
    const r = computeAll(project, testCatalog);
    expect(r.model.typology).toBe('combined');
    expect(r.warnings.some((w) => w.code === 'typology.partial')).toBe(false);
    expect(r.budget.total).toBeGreaterThan(0);
  });
});

describe('combined T e variações', () => {
  test('T: ala centralizada, ext-back em dois trechos, contorno de 8 vértices', () => {
    const { model } = run(comb('T', { width: 2, offset: 3 }));
    expect(model.footprint).toHaveLength(8);
    expect(model.slabs.find((s) => s.kind === 'radier')!.polygon).toHaveLength(8);
    expect(model.builtArea).toBeCloseTo(48 + 8, 9);
    const w = (id: string) => model.walls.find((x) => x.id === id)!;
    expect(w('wing-left').from[0]).toBeCloseTo(2, 9);
    expect(w('wing-right').from[0]).toBeCloseTo(4, 9);
    expect(w('ext-back').length).toBeCloseTo(2, 9);
    expect(w('ext-back-2').length).toBeCloseTo(2, 9);
    // simetria das águas da ala
    const [wa, wb] = [model.roofPlanes.find((p) => p.id === 'wing-roof-a')!, model.roofPlanes.find((p) => p.id === 'wing-roof-b')!];
    expect(wa.area).toBeCloseTo(wb.area, 9);
    expect(computeAll(comb('T', { width: 2, offset: 3 }), testCatalog).model.roofPlanes).toHaveLength(4);
  });

  test('T ignora offset', () => {
    const a = run(comb('T', { width: 2, offset: 0 })).model;
    expect(a.walls.find((w) => w.id === 'wing-left')!.from[0]).toBeCloseTo(2, 9);
  });

  test('L com ala encostada à direita: 6 vértices', () => {
    const { model } = run(comb('L', { width: 4, offset: 2 }));
    expect(model.footprint).toHaveLength(6);
    expect(model.walls.some((w) => w.id === 'ext-back-2')).toBe(false);
    expect(model.walls.find((w) => w.id === 'ext-back')!.length).toBeCloseTo(2, 9);
  });

  test('ala que não cabe lança erro claro', () => {
    expect(() => run(comb('L', { width: 4, offset: 3 }))).toThrow(/ala/);
  });

  test('abertura em ext-back-2 e em wing-back são resolvidas', () => {
    const p = comb('T', { width: 2, offset: 3 }, {
      openings: [
        { id: 'w1', host: 'ext-back-2', type: 'window', offset: 0.5, width: 1, height: 1, sill: 1 },
        { id: 'w2', host: 'wing-back', type: 'window', offset: 0.3, width: 1, height: 1, sill: 1 },
      ],
    });
    const { model } = run(p);
    expect(model.openings.every((o) => o.valid)).toBe(true);
  });
});
