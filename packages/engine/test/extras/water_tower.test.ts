import { describe, expect, test } from 'vitest';
import { computeAll } from '../../src/compute';
import { buildEngineerPackage } from '../../src/reports';
import { testCatalog } from '../helpers/catalog';
import { mk } from '../helpers/inline';

type V = [number, number];
const aframe = { kind: 'a_frame', width: 6, depth: 9, ridgeHeight: 7.5, frontGable: 'glazed', backGable: 'closed' };
const gable = { kind: 'gable_mezzanine', width: 6, depth: 8, wallHeight: 2.8, roofPitchDeg: 20 };
const tower = (extra: object = {}) => ({ id: 't1', kind: 'water_tower', position: [3, 7.5] as V, width: 1.6, depth: 1.6, ...extra });

describe('torre da caixa d\'água: geometria', () => {
  const r = computeAll(mk(aframe, { extras: [tower()] }), testCatalog);
  const m = r.model.extras[0]!;

  test('A-frame 6 x 9, torre 1,6 x 1,6: paredes começam na cota do telhado, não em 0', () => {
    expect(m.kind).toBe('water_tower');
    expect(m.segments).toHaveLength(4);
    for (const s of m.segments) {
      expect(s.baseZ).toBeGreaterThan(1);
      expect(s.material).toBe('board');
      expect(s.baseZ + s.height).toBeCloseTo(5 + m.tank!.height + 0.3, 9);
    }
  });

  test('4 postes, duas águas e a caixa na platformZ', () => {
    expect(m.posts).toHaveLength(4);
    expect(m.roofs).toHaveLength(2);
    expect(m.tank!.baseZ).toBe(5);
    expect(m.tank!.liters).toBe(1000);
    expect(Math.PI * m.tank!.radius ** 2 * m.tank!.height * 1000).toBeCloseTo(1000, 6);
    expect(m.tank!.height).toBeCloseTo(0.75 * 2 * m.tank!.radius, 9);
  });

  test('meia-água: 1 água; plano: 1 água com 3% de caimento', () => {
    const shed = computeAll(mk(aframe, { extras: [tower({ roof: 'shed' })] }), testCatalog).model.extras[0]!;
    expect(shed.roofs).toHaveLength(1);
    const flat = computeAll(mk(aframe, { extras: [tower({ roof: 'flat' })] }), testCatalog).model.extras[0]!;
    expect(flat.roofs).toHaveLength(1);
    expect(Math.tan((flat.roofs![0]!.slopeDeg * Math.PI) / 180)).toBeCloseTo(0.03, 9);
  });

  test('torre ao lado da casa: paredes a partir de 0', () => {
    const m2 = computeAll(mk(aframe, { extras: [tower({ position: [10, 4] })] }), testCatalog).model.extras[0]!;
    expect(m2.segments.every((s) => s.baseZ === 0)).toBe(true);
  });

  test('tankLiters define o volume', () => {
    const m2 = computeAll(mk(aframe, { extras: [tower({ tankLiters: 500 })] }), testCatalog).model.extras[0]!;
    expect(m2.tank!.liters).toBe(500);
  });
});

describe('torre da caixa d\'água: quantitativos, estrutura e pacote', () => {
  const lines = (r: ReturnType<typeof computeAll>) => r.quantities.lines.filter((l) => l.stage === 'extras' && l.hostIds.includes('t1'));

  test('etapa extras: perfis, plataforma, fechamento, telhado e rufo', () => {
    const r = computeAll(mk(aframe, { extras: [tower()] }), testCatalog);
    const ids = lines(r).map((l) => l.itemId);
    for (const id of ['osb_18', 'membrane', 'sandwich_eps30', 'screw_roof', 'flashing', 'ridge_cap']) expect(ids).toContain(id);
    expect(ids).toContain(mk(aframe).system.profiles.wallStud);
    expect(ids).toContain(mk(aframe).system.profiles.joist);
    expect(lines(r).find((l) => l.itemId === 'osb_18')!.netQty).toBeCloseTo(1.6 * 1.6, 9);
  });

  test('a caixa não sai dobrada: sem instalações vem da torre; com instalações, só das instalações', () => {
    const off = computeAll(mk(aframe, { extras: [tower()] }), testCatalog);
    expect(off.quantities.lines.filter((l) => l.itemId.startsWith('water_tank_'))).toHaveLength(1);
    expect(off.quantities.lines.find((l) => l.itemId.startsWith('water_tank_'))!.stage).toBe('extras');
    const on = computeAll(
      mk(aframe, {
        extras: [tower()],
        walls: [{ id: 'w1', level: 'L0', from: [3, 6], to: [6, 6] }],
        rooms: [{ id: 'b', level: 'L0', use: 'bathroom', seed: [4.5, 7.5] }],
        installations: { enabled: true, waterHeater: 'electric_shower' },
      }),
      testCatalog,
    );
    const tanks = on.quantities.lines.filter((l) => l.itemId.startsWith('water_tank_'));
    expect(tanks).toHaveLength(1);
    expect(tanks[0]!.stage).toBe('installations');
  });

  test('check da plataforma (joist) e pergunta ao engenheiro', () => {
    const p = mk(aframe, { extras: [tower()] });
    const r = computeAll(p, testCatalog);
    const c = r.structure!.checks.find((x) => x.id === 'joist:t1')!;
    expect(c.kind).toBe('joist');
    expect(c.detail).toContain("Plataforma da caixa d'água");
    expect(c.demand).toBeGreaterThan(0);
    const pkg = buildEngineerPackage(p, r, testCatalog);
    const q = pkg.openQuestions.find((x) => x.rule === 'water-tower')!;
    expect(q.text).toMatch(/^Torre da caixa d'água: confirmar a estrutura de apoio \(\d+ kg cheia a 5,0 m\) e a vedação no encontro com o telhado/);
  });

  test('projeto sem torre não ganha linhas nem alertas de torre', () => {
    const r = computeAll(mk(aframe), testCatalog);
    expect(r.model.extras).toEqual([]);
    expect(r.structure!.checks.some((c) => c.id.startsWith('joist:t'))).toBe(false);
  });
});

describe('pressão nos pontos de água (NBR 5626)', () => {
  const mezz = (extras: unknown[]) =>
    mk(gable, {
      levels: [
        { id: 'L0', elevation: 0, floor: 'polished_concrete' },
        { id: 'L1', elevation: 2.6, polygon: [[0, 4], [6, 4], [6, 8], [0, 8]], deck: 'osb18' },
      ],
      walls: [
        { id: 'w1', level: 'L1', from: [2.5, 5.5], to: [2.5, 8] },
        { id: 'w2', level: 'L1', from: [0, 5.5], to: [2.5, 5.5] },
      ],
      rooms: [{ id: 'bm', level: 'L1', use: 'bathroom', seed: [1.2, 6.7] }],
      furniture: [{ id: 'ch', level: 'L1', item: 'furn_shower', position: [0.45, 7.5], rotation: 0 }],
      installations: { enabled: true, waterHeater: 'electric_shower' },
      extras,
    });
  const pressure = (r: ReturnType<typeof computeAll>) => r.warnings.filter((w) => w.code === 'install.pressure');

  test('banheiro no mezanino sem torre: install.pressure', () => {
    const r = computeAll(mezz([]), testCatalog);
    expect(r.installations!.points.some((p) => p.kind === 'water_cold' && p.level === 'L1')).toBe(true);
    const w = pressure(r);
    expect(w.length).toBeGreaterThan(0);
    expect(w[0]!.severity).toBe('warn');
    expect(w[0]!.message).toMatch(/Chuveiro do mezanino com só .* m de coluna d'água/);
  });

  test('com torre a 6,0 m: sem alerta (6,0 - (2,6 + 2,1) = 1,3 m)', () => {
    const r = computeAll(mezz([tower({ position: [1.2, 6.7], platformZ: 6 })]), testCatalog);
    expect(pressure(r)).toHaveLength(0);
    const tank = r.installations!.points.find((p) => p.kind === 'tank')!;
    expect(tank.position).toEqual([1.2, 6.7]);
    expect(tank.height).toBe(6);
    const load = r.warnings.find((w) => w.code === 'install.tank_load')!;
    expect(load.message).toContain('t1');
    expect(load.refs).toEqual(['t1']);
  });

  test('com torre a 5,0 m: 0,3 m de coluna, alerta', () => {
    const r = computeAll(mezz([tower({ position: [1.2, 6.7], platformZ: 5 })]), testCatalog);
    expect(pressure(r).length).toBeGreaterThan(0);
    expect(pressure(r)[0]!.message).toContain('0,3 m');
  });
});
