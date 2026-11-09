import { describe, expect, test } from 'vitest';
import { computeAll } from '../../src/compute';
import { buildModel } from '../../src/model';
import { autoRetainingType, computeTerrain, meshZ, retainingItems, terrainProfile } from '../../src/terrain';
import type { Project } from '../../src/schema';
import { testCatalog } from '../helpers/catalog';
import { mk } from '../helpers/inline';

const house = { kind: 'gable_mezzanine', width: 6.5, depth: 8.5, wallHeight: 2.8, roofPitchDeg: 35 };
/** Pegada da casa (m): x de -0,0618 a 6,5618, y de -0,0618 a 8,5618. */
const X0 = -0.0618;
const X1 = 6.5618;
const Y0 = -0.0618;
const Y1 = 8.5618;
const zero = { front: 0, back: 0, left: 0, right: 0 };
const mkSite = (o: Record<string, unknown> = {}) => ({
  type: 'sloped',
  slopePct: 10,
  downhillAzimuthDeg: 0,
  platformMargin: zero,
  platformElevation: 0,
  cutSlopeHV: 0.5,
  fillSlopeHV: 1,
  disposalDistanceKm: 10,
  ...o,
});
const proj = (o: Record<string, unknown> = {}, extra: Record<string, unknown> = {}): Project => mk(house, { site: mkSite(o), ...extra });
const run = (p: Project, cat = testCatalog) => computeTerrain(p, buildModel(p, cat), cat)!;
const rectPad = (id: string, x0: number, y0: number, x1: number, y1: number, level = 0, edges = 'auto') => ({
  id, name: id, polygon: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], level, edges,
});

describe('compatibilidade (sem pads, bordas em talude)', () => {
  test('volumes e malha iguais aos do motor anterior', () => {
    const a = run(proj({ edges: 'slope', platformMargin: { front: 3, back: 1.5, left: 1.5, right: 1.5 } })).report;
    expect(a.platformZ).toBe(0);
    expect(a.cutVolume).toBeCloseTo(27.69518893228325, 6);
    expect(a.fillVolume).toBeCloseTo(18.91682580672617, 6);
    expect(a.slopeArea).toBeCloseTo(36.20528315346755, 6);
    expect(a.mesh.positions).toHaveLength(5640);
    expect(a.mesh.positions[2]).toBeCloseTo(1.2124222222222223, 9);
    expect(a.walls).toEqual([]);
    expect(a.pads.map((p) => p.id)).toEqual(['house']);
    const b = run(proj({ edges: 'slope', slopePct: 25, platformElevation: 'auto', platformMargin: { front: 3, back: 1.5, left: 1.5, right: 1.5 } })).report;
    expect(b.platformZ).toBeCloseTo(0.12454739061227511, 9);
    expect(b.cutVolume).toBeCloseTo(67.91167159671545, 6);
    expect(b.fillVolume).toBeCloseTo(72.15615107150971, 6);
    expect(b.mesh.positions).toHaveLength(7614);
    expect(b.mesh.positions[2]).toBeCloseTo(3.478782463537425, 9);
  });
});

describe('pads', () => {
  test('pad isolado em terreno plano, nível -1: cava = área × 1 (borda em muro)', () => {
    const p = proj({ slopePct: 0 }, {});
    const q = proj({ slopePct: 0, pads: [rectPad('p1', X0 + 10, Y0 + 1, X0 + 14, Y0 + 6, -1, 'wall')], edges: 'slope' });
    expect(run(p).report.cutVolume).toBe(0);
    const r = run(q);
    expect(r.report.cutVolume).toBeCloseTo(20, 6);
    expect(r.report.fillVolume).toBeCloseTo(0, 6);
    expect(r.report.pads.map((x) => x.id)).toEqual(['house', 'p1']);
    expect(r.report.pads[1]!.z).toBeCloseTo(-1, 9);
    expect(r.report.pads[1]!.area).toBeCloseTo(20, 9);
    // cota na malha dentro do pad e superfície
    expect(meshZ(r.report.mesh, X0 + 12, Y0 + 3)).toBeCloseTo(-1, 6);
    expect(r.surface.groundZ(X0 + 12, Y0 + 3)).toBeCloseTo(-1 - 0.03, 9);
    expect(r.surface.groundZ(0, 0)).toBeCloseTo(-0.03, 9);
    // muro forçado em toda a volta: perímetro 18 m, altura 1
    expect(r.report.walls).toHaveLength(1);
    expect(r.report.walls[0]!.length).toBeCloseTo(18, 6);
    expect(r.report.walls[0]!.area).toBeCloseTo(18, 6);
    expect(r.report.walls[0]!.side).toBe('cut');
    // com talude, escava além do pad
    const s = run(proj({ slopePct: 0, pads: [rectPad('p1', X0 + 10, Y0 + 1, X0 + 14, Y0 + 6, -1, 'slope')], edges: 'slope' }));
    expect(s.report.cutVolume).toBeGreaterThan(20);
    expect(s.report.walls).toEqual([]);
  });

  test('pad colado à frente da casa, 1 m abaixo: cota na malha', () => {
    const r = run(proj({ slopePct: 0 }, {}));
    expect(r.report.pads).toHaveLength(1);
    const q = proj({ slopePct: 0, pads: [rectPad('f', X0, Y0 - 4, X1, Y0, -1)] });
    const t = run(q);
    expect(meshZ(t.report.mesh, 3, Y0 - 2)).toBeCloseTo(-1, 6);
    expect(meshZ(t.report.mesh, 3, 4)).toBeCloseTo(0, 6);
    // a borda em comum fica oculta nas duas faces e vira muro do pad mais baixo (encontro)
    const w = t.report.walls.find((x) => x.reason === 'overlap');
    expect(w).toBeDefined();
    expect(w!.maxHeight).toBeCloseTo(1, 6);
  });

  test('pad dentro de pad: o mais recente vence', () => {
    const q = proj({ slopePct: 0, pads: [rectPad('a', 1, 1, 5, 5, 1)] });
    const t = run(q);
    expect(t.surface.groundZ(3, 3)).toBeCloseTo(1 - 0.03, 9);
    expect(t.surface.groundZ(0, 0)).toBeCloseTo(-0.03, 9);
  });

  test('auto equilibra o volume de todos os pads (swell = compaction = 1)', () => {
    const cat = { ...testCatalog, constants: { ...testCatalog.constants, terrain: { ...testCatalog.constants.terrain, swellFactor: 1, compactionFactor: 1 } } };
    const q = proj({ slopePct: 20, platformElevation: 'auto', edges: 'slope', platformMargin: { front: 2, back: 2, left: 2, right: 2 }, cutSlopeHV: 1, fillSlopeHV: 1.5, pads: [rectPad('a', X1 + 4, 1, X1 + 8, 6, -0.5, 'slope')] });
    const r = run(q, cat).report;
    expect(r.cutVolume).toBeGreaterThan(1);
    expect(Math.abs(r.cutVolume - r.fillVolume) / r.cutVolume).toBeLessThan(0.02);
    expect(r.pads[1]!.z).toBeCloseTo(r.platformZ - 0.5, 9);
  });

  test('polígono inválido e autointerseção geram avisos e são ignorados', () => {
    const q = proj({
      pads: [
        { id: 'z', name: 'Z', polygon: [[0, 0], [0, 0], [1, 1]], level: 0, edges: 'auto' },
        { id: 'x', name: 'X', polygon: [[10, 0], [14, 4], [14, 0], [10, 4]], level: 0, edges: 'auto' },
      ],
    });
    const r = run(q);
    expect(r.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['terrain.pad_invalid', 'terrain.pad_self_intersect']));
    expect(r.report.pads.map((x) => x.id)).toEqual(['house']);
  });
});

describe('muros de arrimo automáticos', () => {
  const steep = (edges: string, extra: Record<string, unknown> = {}) =>
    proj({ slopePct: 30, downhillAzimuthDeg: 180, platformElevation: 'auto', platformMargin: { front: 2, back: 8, left: 2, right: 2 }, edges, ...extra });

  test('30%: auto tem muro de corte nos fundos; slope nenhum; wall em toda a volta', () => {
    const auto = run(steep('auto'));
    const back = auto.report.walls.find((w) => w.side === 'cut');
    expect(back).toBeDefined();
    expect(back!.maxHeight).toBeGreaterThan(1.5);
    expect(back!.reason).toBe('height');
    expect(back!.padId).toBe('house');
    const ys = back!.path.map((p) => p[1]);
    expect(Math.min(...ys)).toBeGreaterThan(4); // fundos = y positivo (o terreno sobe para +y)
    expect(back!.heights.every((h) => h > 0 && Number.isFinite(h))).toBe(true);
    expect(back!.topZ).toHaveLength(back!.path.length);
    expect(auto.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['terrain.retaining_suggested']));
    expect(run(steep('slope')).report.walls).toEqual([]);
    const forced = run(steep('wall')).report.walls;
    expect(forced.length).toBeGreaterThanOrEqual(1);
    expect(forced.every((w) => w.reason === 'forced')).toBe(true);
    const perimeter = 2 * (X1 - X0 + 4 + (Y1 - Y0) + 10);
    const total = forced.reduce((s, w) => s + w.length, 0);
    expect(total).toBeCloseTo(perimeter, 6);
  });

  test('muro acima de cutWarnHeight avisa projeto geotécnico (NBR 11682)', () => {
    const r = run(steep('auto', { platformMargin: { front: 2, back: 14, left: 2, right: 2 } }));
    const tall = r.warnings.find((w) => w.code === 'terrain.retaining_tall');
    expect(tall).toBeDefined();
    expect(tall!.severity).toBe('warn');
    expect(tall!.message).toContain('NBR 11682');
    expect(Math.max(...r.report.walls.map((w) => w.maxHeight))).toBeGreaterThan(testCatalog.constants.terrainRules.cutWarnHeight);
  });

  test('tipo auto pela altura e quantitativos = retainingItems com a área integrada', () => {
    expect(autoRetainingType(1.8, testCatalog)).toBe('block');
    expect(autoRetainingType(3, testCatalog)).toBe('concrete');
    expect(autoRetainingType(4.5, testCatalog)).toBe('gabion');
    const r = run(steep('auto'));
    for (const w of r.report.walls) {
      expect(w.type).toBe(autoRetainingType(w.maxHeight, testCatalog));
      const expected = retainingItems(w.length, w.area, w.type, w.side === 'cut', testCatalog);
      const got = r.items.filter((i) => i.hostId === w.id);
      expect(got.map((i) => [i.itemId, i.net])).toEqual(expected.map((i) => [i.itemId, i.net]));
      expect(got.every((i) => i.stage === 'terrain')).toBe(true);
    }
    expect(r.report.walls[0]!.id).toBe('terrain-wall-1');
    const fixed = run(steep('auto', { retaining: { type: 'gabion', drainage: false } }));
    expect(fixed.report.walls.every((w) => w.type === 'gabion')).toBe(true);
    expect(fixed.items.some((i) => i.hostId.startsWith('terrain-wall') && i.itemId === 'drain_pipe')).toBe(false);
  });

  test('retainingItems com altura constante = fórmulas do RetainingExtra', () => {
    const g = retainingItems(10, 20, 'gabion', true, testCatalog);
    expect(g.find((i) => i.itemId === 'gabion')!.net).toBeCloseTo(10 * 2 * 0.7, 9);
    expect(g.find((i) => i.itemId === 'geotextile')!.net).toBeCloseTo(25, 9);
    const c = retainingItems(10, 20, 'concrete', false, testCatalog);
    expect(c.find((i) => i.itemId === 'concrete_fck25')!.net).toBeCloseTo(5.8, 9);
  });

  test('superfície: cota do pad dentro; natural atrás do muro de corte', () => {
    const r = run(steep('auto'));
    const back = r.report.walls.find((w) => w.side === 'cut')!;
    const yb = Math.max(...back.path.map((p) => p[1]));
    const zp = r.report.platformZ;
    expect(r.surface.groundZ(3, 4)).toBeCloseTo(-0.03, 9);
    const y = yb + 0.3;
    expect(r.surface.groundZ(3, y)).toBeCloseTo(r.surface.naturalZ(3, y), 9);
    expect(r.surface.naturalZ(3, y)).toBeGreaterThan(1);
    // malha vertical: do lado do pad a cota é zp; atrás, o natural
    expect(meshZ(r.report.mesh, 3, yb - 0.6)).toBeCloseTo(zp, 6);
    expect(zp).toBeLessThan(5);
  });

  test('lote estreito: talude sairia do lote -> muro reason lot; em slope só avisa', () => {
    const lot = { front: 7.5, depth: 20, buildingOffset: [0.44, 6], rotationDeg: 0, streetName: '' };
    const base = { slopePct: 10, cutSlopeHV: 3, fillSlopeHV: 3 };
    const auto = run(proj({ ...base }, { legal: { lot } }));
    const w = auto.report.walls.find((x) => x.reason === 'lot');
    expect(w).toBeDefined();
    expect(w!.maxHeight).toBeLessThan(1.5);
    const none = run(proj({ ...base }, {}));
    expect(none.report.walls).toEqual([]);
    const sl = run(proj({ ...base, edges: 'slope' }, { legal: { lot } }));
    expect(sl.report.walls).toEqual([]);
    expect(sl.warnings.map((x) => x.code)).toContain('terrain.slope_outside_lot');
  });
});

describe('aprovação', () => {
  test('terrain.retaining: manual, norma NBR 11682, altura máxima e tipo no valor; ausente sem muros', () => {
    const p = proj({ slopePct: 30, downhillAzimuthDeg: 180, platformElevation: 'auto', platformMargin: { front: 2, back: 8, left: 2, right: 2 } });
    const item = computeAll(p, testCatalog).approval!.compliance.find((c) => c.id === 'terrain.retaining');
    expect(item).toBeDefined();
    expect(item!.status).toBe('manual');
    expect(item!.norm).toContain('11682');
    expect(item!.value).toMatch(/altura máx\. \d/);
    expect(item!.value).toMatch(/concreto|bloco|gabião/);
    const none = computeAll(proj({ edges: 'slope' }), testCatalog).approval!.compliance.find((c) => c.id === 'terrain.retaining');
    expect(none).toBeUndefined();
  });
});

describe('perfil e desempenho', () => {
  test('terrainProfile insere degrau vertical no muro', () => {
    const r = run(proj({ slopePct: 0, pads: [rectPad('p1', X0 + 10, Y0 + 1, X0 + 14, Y0 + 6, -1, 'wall')] }));
    const prof = terrainProfile(r.report, [X0 + 6, Y0 + 3], [X0 + 18, Y0 + 3]);
    expect(prof.walls).toHaveLength(2);
    const w = prof.walls[0]!;
    expect(w.s).toBeCloseTo(4, 6);
    expect(w.topZ).toBeCloseTo(0, 6);
    expect(w.bottomZ).toBeCloseTo(-1, 6);
    const steps = prof.points.filter((p) => Math.abs(p[0] - 4) < 1e-9);
    expect(steps.map((p) => p[1])).toEqual([0, -1]);
    expect(prof.points.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))).toBe(true);
  });

  test('computeAll com 2 pads: terreno < 60 ms', () => {
    const p = proj({ slopePct: 20, platformElevation: 'auto', platformMargin: { front: 2, back: 2, left: 2, right: 2 }, cutSlopeHV: 1, fillSlopeHV: 1.5, pads: [rectPad('a', X1 + 4, 1, X1 + 8, 6, -0.5), rectPad('b', X0 - 8, 1, X0 - 4, 6, 0.5)] });
    computeAll(p, testCatalog);
    const res = computeAll(p, testCatalog);
    expect(res.timingsMs.terrain).toBeLessThan(60);
    expect(res.terrain!.pads).toHaveLength(3);
  });
});
