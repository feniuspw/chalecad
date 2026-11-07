import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { buildModel } from '../../src/model';
import { loadProject } from '../../src/load';
import { cross3, dot3, sub3, polygonArea, type Vec3 } from '../../src/geometry';
import type { Project } from '../../src/schema';
import { testCatalog } from '../helpers/catalog';

const dir = join(import.meta.dirname, '../../fixtures');
const load = (f: string, mut?: (p: any) => void): Project => { // eslint-disable-line @typescript-eslint/no-explicit-any
  const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  mut?.(j);
  const r = loadProject(j);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.project;
};
const GABLE = 'gable-6.5x8.5-mezzanine.json';
const AFRAME = 'aframe-minimal.json';
const tan35 = Math.tan((35 * Math.PI) / 180);
const cos35 = Math.cos((35 * Math.PI) / 180);

describe('buildModel: gable 6,5 x 8,5', () => {
  const p = load(GABLE);
  const m = buildModel(p, testCatalog);

  test('cumeeira, áreas e águas', () => {
    expect(m.ridgeHeight).toBeCloseTo(2.8 + 3.25 * tan35, 3);
    expect(m.roofPlanes).toHaveLength(2);
    for (const r of m.roofPlanes) {
      const expected = ((3.25 + 0.6) / cos35) * (8.5 + 0.6);
      expect(Math.abs(r.area - expected) / expected).toBeLessThan(0.01);
      expect(r.isWall).toBe(false);
      expect(r.slopeDeg).toBeCloseTo(35, 9);
    }
  });

  test('referencial das águas: u x v aponta para fora e vértices anti-horários', () => {
    const [a, b] = m.roofPlanes;
    for (const [r, outward] of [[a!, [-1, 0]], [b!, [1, 0]]] as const) {
      const n = cross3(r.uAxis, r.vAxis);
      expect(Math.sign(n[0])).toBe(outward[0]);
      expect(n[2]).toBeGreaterThan(0);
      const [v0, v1, v2] = r.vertices as [Vec3, Vec3, Vec3];
      const vn = cross3(sub3(v1, v0), sub3(v2, v1));
      expect(dot3(vn, n)).toBeGreaterThan(0);
      expect(r.origin).toEqual(v0);
    }
    // beiral de roof-a: x = -0,6, z = 2,8 - 0,6 tan35
    expect(m.roofPlanes[0]!.origin[0]).toBeCloseTo(-0.6, 9);
    expect(m.roofPlanes[0]!.origin[2]).toBeCloseTo(2.8 - 0.6 * tan35, 9);
  });

  test('paredes: 4 externas + 2 internas, empena pentagonal', () => {
    expect(m.walls).toHaveLength(6);
    expect(m.walls.filter((w) => w.kind === 'exterior')).toHaveLength(4);
    expect(m.walls.filter((w) => w.kind === 'interior')).toHaveLength(2);
    const front = m.walls.find((w) => w.id === 'ext-front')!;
    expect(front.outline).toHaveLength(5);
    expect(front.exteriorSide).toBe('right');
    expect(front.loadBearing).toBe(true);
    expect(front.from).toEqual([0, 0]);
    expect(front.to).toEqual([6.5, 0]);
    expect(m.walls.find((w) => w.id === 'ext-left')!.outline).toHaveLength(4);
    expect(m.walls.find((w) => w.id === 'ext-left')!.from).toEqual([0, 8.5]);
  });

  test('espessura = alma + camadas (core fora, both x2)', () => {
    const ext = m.walls.find((w) => w.id === 'ext-front')!;
    expect(ext.thickness).toBeCloseTo((90 + 10 + 11.1 + 12.5) / 1000, 9);
    const bath = m.walls.find((w) => w.id === 'w-bath-1')!;
    expect(bath.assemblyId).toBe('wet_cement_drywall_rh');
    expect(bath.wet).toBe(true);
    expect(bath.thickness).toBeCloseTo((90 + 12.5 + 10) / 1000, 9);
    expect(bath.outline[2]![1]).toBeCloseTo(2.8, 9); // até o mezanino
    expect(bath.baseZ).toBe(0);
    expect(bath.exteriorSide).toBeNull();
    expect(bath.loadBearing).toBe(false);
  });

  test('lajes, áreas e bbox', () => {
    const radier = m.slabs.find((s) => s.kind === 'radier')!;
    const h = m.walls[0]!.thickness / 2;
    expect(radier.thickness).toBe(0.12);
    expect(radier.topZ).toBe(0);
    expect(radier.polygon[0]![0]).toBeCloseTo(-h - 0.15, 9);
    const mezz = m.slabs.find((s) => s.kind === 'mezzanine')!;
    expect(mezz.area).toBeCloseTo(6.5 * 3.5, 9);
    expect(mezz.topZ).toBe(2.8);
    expect(mezz.thickness).toBeCloseTo(0.218, 9);
    expect(m.builtArea).toBeCloseTo(6.5 * 8.5 + 6.5 * 3.5, 9);
    expect(m.footprintArea).toBeCloseTo(polygonArea(m.footprint), 9);
    expect(m.bbox.min[0]).toBeCloseTo(-0.6, 9);
    expect(m.bbox.min[1]).toBeCloseTo(-0.3, 9);
    expect(m.bbox.min[2]).toBeCloseTo(-0.12, 9);
    expect(m.bbox.max[0]).toBeCloseTo(7.1, 9);
    expect(m.bbox.max[2]).toBeCloseTo(m.ridgeHeight, 9);
  });

  test('todas as aberturas válidas', () => {
    expect(m.openings).toHaveLength(7);
    expect(m.openings.every((o) => o.valid)).toBe(true);
    const door = m.openings.find((o) => o.id === 'o-door')!;
    expect([door.u0, door.v0, door.v1]).toEqual([2.8, 0, 2.1]);
    expect(door.u1).toBeCloseTo(3.7, 9);
    const win = m.openings.find((o) => o.id === 'o-win-f1')!;
    expect(win.v0).toBe(0.9);
    expect(win.v1).toBeCloseTo(2.1, 9);
  });

  test('escada: 16 espelhos de 0,175', () => {
    const s = m.stairs[0]!;
    expect(s.steps).toBe(16);
    expect(s.riser).toBeCloseTo(0.175, 9);
    expect(s.treads).toHaveLength(15);
    expect(s.going).toBe(0.27);
    expect(s.blondel).toBeCloseTo(0.62, 9);
    expect(s.treads[0]!.size).toEqual([0.8, 0.27, 0.04]);
    expect(s.treads[0]!.rotationZDeg).toBe(0);
    expect(s.treads[0]!.center[0]).toBeCloseTo(0.6, 9);
    expect(s.treads[0]!.center[1]).toBeCloseTo(0.6 + 0.135, 9);
    expect(s.treads[0]!.center[2]).toBeCloseTo(0.175 - 0.02, 9);
    expect(s.footprint).toHaveLength(4);
    expect(polygonArea(s.footprint)).toBeCloseTo(0.8 * 15 * 0.27, 9);
  });

  test('JSON-serializável e sem -0', () => {
    expect(JSON.parse(JSON.stringify(m))).toEqual(m);
    expect(JSON.stringify(m)).not.toContain('-0,');
  });

  test('desempenho: média < 5 ms', () => {
    buildModel(p, testCatalog);
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) buildModel(p, testCatalog);
    expect((performance.now() - t0) / 100).toBeLessThan(5);
  });

  test('ridgeAxis width inverte empenas e águas', () => {
    const q = load(GABLE, (j) => (j.roof.ridgeAxis = 'width'));
    const w = buildModel(q, testCatalog);
    expect(w.ridgeHeight).toBeCloseTo(2.8 + 4.25 * tan35, 3);
    expect(w.walls.find((x) => x.id === 'ext-front')!.outline).toHaveLength(4);
    expect(w.walls.find((x) => x.id === 'ext-right')!.outline).toHaveLength(5);
    for (const r of w.roofPlanes) {
      expect(r.area).toBeCloseTo(((4.25 + 0.6) / cos35) * (6.5 + 0.6), 6);
      const n = cross3(r.uAxis, r.vAxis);
      expect(n[2]).toBeGreaterThan(0);
      const [v0, v1, v2] = r.vertices as [Vec3, Vec3, Vec3];
      expect(dot3(cross3(sub3(v1, v0), sub3(v2, v1)), n)).toBeGreaterThan(0);
    }
    expect(Math.sign(cross3(w.roofPlanes[0]!.uAxis, w.roofPlanes[0]!.vAxis)[1])).toBe(-1);
  });
});

describe('buildModel: aberturas inválidas', () => {
  test('fora do host, host inexistente, tipo incompatível', () => {
    const p = load(GABLE, (j) => {
      j.openings = [
        { id: 'a', host: 'ext-left', type: 'window', offset: 2, width: 1, height: 1, sill: 2.2 }, // passa de 2,8
        { id: 'b', host: 'ext-wing', type: 'door', offset: 0, width: 1, height: 2 },
        { id: 'c', host: 'ext-front', type: 'skylight', offset: 1, width: 1, height: 1 },
        { id: 'd', host: 'roof-a', type: 'window', offset: 1, width: 1, height: 1 },
        { id: 'e', host: 'roof-a', type: 'skylight', offset: 1, width: 1, height: 1, sill: 1 },
        { id: 'f', host: 'ext-front', type: 'window', offset: 0.1, width: 1, height: 1.2, sill: 2.0 }, // canto sobe pelo beiral da empena
        { id: 'g', host: 'ext-front', type: 'window', offset: 2.9, width: 0.6, height: 1, sill: 2.3 }, // dentro da empena (acima de 2,8 no meio)
      ];
    });
    const m = buildModel(p, testCatalog);
    const valid = Object.fromEntries(m.openings.map((o) => [o.id, o.valid]));
    expect(valid).toEqual({ a: false, b: false, c: false, d: false, e: true, f: false, g: true });
    expect(m.openings.find((o) => o.id === 'e')!.hostKind).toBe('roof');
  });
});

describe('buildModel: a-frame', () => {
  const p = load(AFRAME);
  const m = buildModel(p, testCatalog);

  test('águas isWall, empenas e porta', () => {
    expect(m.roofPlanes).toHaveLength(2);
    expect(m.roofPlanes.every((r) => r.isWall)).toBe(true);
    expect(m.ridgeHeight).toBe(6);
    const slope = Math.atan2(6, 3);
    expect(m.roofPlanes[0]!.vLength).toBeCloseTo(Math.hypot(3, 6), 9);
    expect(m.roofPlanes[0]!.uLength).toBeCloseTo(7 + 0.8, 9);
    expect(m.roofPlanes[0]!.slopeDeg).toBeCloseTo((slope * 180) / Math.PI, 9);
    const front = m.walls.find((w) => w.id === 'ext-front')!;
    expect(front.assemblyId).toBe('gable_glazed');
    expect(front.kind).toBe('gable');
    expect(front.outline).toHaveLength(3);
    const back = m.walls.find((w) => w.id === 'ext-back')!;
    expect(back.assemblyId).toBe('ext_cement_osb_wool_drywall');
    expect(m.walls).toHaveLength(2);
    expect(m.openings[0]!.valid).toBe(true);
    expect(m.bbox.min[0]).toBeCloseTo(-back.thickness / 2 - 0.15, 9);
  });

  test('mureta: paredes knee e empena com 5 vértices', () => {
    const k = buildModel(load(AFRAME, (j) => (j.typology.kneeWallHeight = 0.8)), testCatalog);
    expect(k.walls.filter((w) => w.kind === 'knee').map((w) => w.id).sort()).toEqual(['ext-left', 'ext-right']);
    expect(k.walls.find((w) => w.id === 'ext-front')!.outline).toHaveLength(5);
    expect(k.roofPlanes[0]!.vLength).toBeCloseTo(Math.hypot(3, 5.2), 9);
    expect(k.roofPlanes[0]!.origin[2]).toBeCloseTo(0.8, 9);
  });

  test('empena open não gera parede e abertura nela fica inválida', () => {
    const o = buildModel(load(AFRAME, (j) => (j.typology.frontGable = 'open')), testCatalog);
    expect(o.walls.find((w) => w.id === 'ext-front')).toBeUndefined();
    expect(o.openings[0]!.valid).toBe(false);
  });

  test('porta alta demais para o triângulo é inválida', () => {
    const o = buildModel(load(AFRAME, (j) => { j.openings[0].offset = 0.05; j.openings[0].height = 2.1; }), testCatalog);
    expect(o.openings[0]!.valid).toBe(false);
  });
});

describe('escadas', () => {
  test('L: patamar, giro e footprint', () => {
    const p = load(GABLE, (j) => { j.stairs[0].type = 'l_shape'; j.stairs[0].rotationDeg = 90; });
    const s = buildModel(p, testCatalog).stairs[0]!;
    expect(s.steps).toBe(16);
    expect(s.treads).toHaveLength(15);
    const landing = s.treads[7]!;
    expect(landing.size).toEqual([0.8, 0.8, 0.04]);
    expect(landing.center[2]).toBeCloseTo(8 * 0.175 - 0.02, 9);
    expect(s.treads[8]!.rotationZDeg).toBeCloseTo(-180, 9);
    expect(s.footprint).toHaveLength(6);
  });

  test('marinheiro usa largura 0,5 e passo da escada de mão', () => {
    const p = load(GABLE, (j) => (j.stairs[0].type = 'ladder'));
    const s = buildModel(p, testCatalog).stairs[0]!;
    expect(s.going).toBe(0.2);
    expect(s.treads[0]!.size[0]).toBe(0.5);
  });
});

describe('paredes do usuário', () => {
  test('altura, assembly e carga', () => {
    const p = load(GABLE, (j) => {
      j.levels.push({ id: 'L2', elevation: 5 });
      j.walls = [
        { id: 'x1', level: 'L1', from: [0, 5], to: [6.5, 5] }, // sobre a borda do mezanino
        { id: 'x2', level: 'L1', from: [1, 6], to: [3, 6], height: 1.1, assembly: 'ext_cement_osb_wool_drywall' },
        { id: 'x3', level: 'L2', from: [0.1, 6], to: [0.5, 6] },
      ];
      j.openings = [];
    });
    const m = buildModel(p, testCatalog);
    const w = Object.fromEntries(m.walls.map((x) => [x.id, x]));
    expect(w.x1!.outline[2]![1]).toBeCloseTo(2.2, 9); // até L2 (5 - 2.8)
    expect(w.x1!.loadBearing).toBe(true);
    expect(w.x1!.baseZ).toBe(2.8);
    expect(w.x2!.outline[2]![1]).toBe(1.1);
    expect(w.x2!.assemblyId).toBe('ext_cement_osb_wool_drywall');
    expect(w.x3!.outline[2]![1]).toBeLessThanOrEqual(2.8);
  });

  test('assembly ou perfil ausentes lançam erro em pt-BR', () => {
    const p = load(GABLE, (j) => (j.walls[0].assembly = 'nao_existe'));
    expect(() => buildModel(p, testCatalog)).toThrow(/Assembly não encontrada/);
    const q = load(GABLE, (j) => (j.system = { profiles: { wallStud: 'Ue1x1x1' } }));
    expect(() => buildModel(q, testCatalog)).toThrow(/Perfil não encontrado/);
  });
});
