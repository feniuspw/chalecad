import { describe, expect, test } from 'vitest';
import { computeAll } from '../../src/compute';
import { placePoints } from '../../src/installations';
import { buildModel } from '../../src/model';
import { buildEngineerPackage } from '../../src/reports';
import { testCatalog } from '../helpers/catalog';
import { mk } from '../helpers/inline';

const gable = { kind: 'gable_mezzanine', width: 6, depth: 8, wallHeight: 2.8, roofPitchDeg: 20 };
type V = [number, number];
const wall = (id: string, from: V, to: V) => ({ id, level: 'L0', from, to });
const room = (id: string, seed: V, use: string) => ({ id, level: 'L0', use, seed });
const door = (host: string, offset: number) => ({ id: `d-${host}`, host, type: 'door', offset, width: 0.8, height: 2.1 });
const item = (id: string, kind: string, position: V, rotation = 0) => ({ id, level: 'L0', item: kind, position, rotation });
const inst = (extra: object = {}) => ({ enabled: true, waterHeater: 'electric_shower', ...extra });
const run = (extra: Record<string, unknown>) => computeAll(mk(gable, extra), testCatalog);
const place = (extra: Record<string, unknown>) => {
  const p = mk(gable, extra);
  return placePoints(p, buildModel(p, testCatalog), testCatalog);
};
const sumLoad = (pts: { kind: string; load: number }[], kind: string) =>
  pts.filter((p) => p.kind === kind).reduce((s, p) => s + p.load, 0);

const bedroom = {
  walls: [wall('w1', [3, 0], [3, 3]), wall('w2', [0, 3], [3, 3])],
  rooms: [room('q', [1.5, 1.5], 'bedroom')],
  openings: [door('w2', 1)],
  installations: inst(),
};

describe('instalações: pontos', () => {
  test('quarto 3 x 3: 3 tomadas, 1 luz de 100 VA, 1 interruptor ao lado da porta', () => {
    const { points } = place(bedroom);
    expect(points.filter((p) => p.kind === 'outlet')).toHaveLength(3);
    const lights = points.filter((p) => p.kind === 'light');
    expect(lights).toHaveLength(1);
    expect(lights[0]!.load).toBe(100);
    expect(lights[0]!.position[0]).toBeCloseTo(1.5, 6);
    const sw = points.filter((p) => p.kind === 'switch');
    expect(sw).toHaveLength(1);
    expect(sw[0]!.height).toBe(1.1);
    expect(sw[0]!.hostId).toBe('w2');
    // porta de x = 1 a 1,8: o interruptor fica a 15 cm do batente
    expect(Math.min(Math.abs(sw[0]!.position[0] - 1), Math.abs(sw[0]!.position[0] - 1.8))).toBeCloseTo(0.15, 6);
    // lado de dentro (y < 3)
    expect(sw[0]!.position[1]).toBeLessThan(3);
    expect(points.filter((p) => p.kind === 'outlet').every((p) => p.height === 0.3)).toBe(true);
  });

  test('sala 4 x 5: luz de 280 VA em 2 pontos e 4 tomadas', () => {
    const { points } = place({ walls: [wall('w1', [4, 0], [4, 5]), wall('w2', [0, 5], [4, 5])], rooms: [room('s', [2, 2.5], 'living')], installations: inst() });
    expect(points.filter((p) => p.kind === 'light')).toHaveLength(2);
    expect(sumLoad(points, 'light')).toBeCloseTo(280, 6);
    expect(points.filter((p) => p.kind === 'outlet')).toHaveLength(4);
  });

  test('cozinha 2,5 x 3: 4 tomadas, 3 altas de 600 VA e 1 de 100 VA, circuito próprio', () => {
    const r = run({ walls: [wall('w1', [2.5, 0], [2.5, 3]), wall('w2', [0, 3], [2.5, 3])], rooms: [room('c', [1, 1], 'kitchen')], installations: inst() });
    const pts = r.installations!.points;
    expect(pts.filter((p) => p.kind === 'outlet_high')).toHaveLength(3);
    expect(pts.filter((p) => p.kind === 'outlet')).toHaveLength(1);
    const { points } = place({ walls: [wall('w1', [2.5, 0], [2.5, 3]), wall('w2', [0, 3], [2.5, 3])], rooms: [room('c', [1, 1], 'kitchen')], installations: inst() });
    expect(points.filter((p) => p.kind === 'outlet_high').map((p) => p.load)).toEqual([600, 600, 600]);
    expect(points.find((p) => p.kind === 'outlet')!.load).toBe(100);
    const k = r.installations!.circuits.find((c) => c.kind === 'kitchen')!;
    expect(k.power).toBe(1900);
    expect(pts.filter((p) => p.kind === 'outlet' || p.kind === 'outlet_high').every((p) => p.circuitId === k.id)).toBe(true);
  });
});

const bath = (waterHeater: string) => ({
  walls: [wall('w1', [2, 0], [2, 2]), wall('w2', [0, 2], [2, 2])],
  rooms: [room('b', [1, 1], 'bathroom')],
  furniture: [item('ch', 'furn_shower', [0.45, 0.45]), item('lv', 'furn_bath_sink', [1.5, 0.3], 180), item('vs', 'furn_toilet', [1.5, 1.7])],
  openings: [door('w2', 1)],
  installations: inst({ waterHeater }),
});

describe('instalações: banheiro', () => {
  test('chuveiro elétrico 5.500 W em 220 V: 25 A, cabo 4 mm², disjuntor 25 A', () => {
    const r = run(bath('electric_shower'));
    const c = r.installations!.circuits.find((x) => x.kind === 'tue')!;
    expect(c.power).toBe(5500);
    expect(c.wire).toBe(4);
    expect(c.breaker).toBe(25);
    expect(r.installations!.points.some((p) => p.kind === 'water_hot')).toBe(false);
    const shower = r.installations!.points.find((p) => p.kind === 'tue')!;
    expect(shower.height).toBe(2.1);
    // uma única tomada alta junto ao lavatório
    expect(r.installations!.points.filter((p) => p.kind === 'outlet_high')).toHaveLength(1);
    expect(r.installations!.points.filter((p) => p.kind === 'drain')).toHaveLength(1);
  });

  test('com gás: sem TUE, água quente no chuveiro e no lavatório; aquecedor orçado', () => {
    const r = run(bath('gas'));
    const pts = r.installations!.points;
    expect(pts.some((p) => p.kind === 'tue')).toBe(false);
    expect(pts.filter((p) => p.kind === 'water_hot').map((p) => p.label).sort()).toEqual([
      'Água quente: Box de chuveiro 90 x 90',
      'Água quente: Lavatório com gabinete',
    ]);
    expect(r.installations!.pipes.hot).toBeGreaterThan(0);
    const ids = r.quantities.lines.filter((l) => l.stage === 'installations').map((l) => l.itemId);
    expect(ids).toContain('gas_heater');
    expect(ids).toContain('ppr_hot_25');
  });

  test('vaso: esgoto de 100 mm; pia e lavatório: 40 mm', () => {
    const { points } = place({ ...bath('gas'), walls: [wall('w1', [2.5, 0], [2.5, 3]), wall('w2', [0, 3], [2.5, 3])], rooms: [room('b', [1, 1], 'bathroom')] });
    const sewer = points.filter((p) => p.kind === 'sewer');
    expect(sewer.find((p) => p.label.includes('Vaso'))!.dia).toBe(100);
    expect(sewer.find((p) => p.label.includes('Lavatório'))!.dia).toBe(40);
    const k = place({
      walls: [wall('w1', [2.5, 0], [2.5, 3]), wall('w2', [0, 3], [2.5, 3])],
      rooms: [room('c', [1, 1], 'kitchen')],
      furniture: [item('p', 'furn_kitchen_sink', [1, 0.4], 180)],
      installations: inst(),
    });
    expect(k.points.find((p) => p.kind === 'sewer')!.dia).toBe(40);
    expect(k.points.some((p) => p.kind === 'water_cold')).toBe(true);
  });
});

describe('instalações: caixa d água, vazio e orçamento', () => {
  const house = {
    walls: [wall('wa', [3, 0], [3, 8]), wall('wb', [0, 4], [3, 4])],
    rooms: [room('q1', [1.5, 2], 'bedroom'), room('q2', [1.5, 6], 'bedroom'), room('bn', [4.5, 4], 'bathroom')],
  };

  test('2 quartos: 4 pessoas x 150 x 2 = 1.200 L -> 1.500 L; com occupants 2 -> 1.000 L', () => {
    const r = run({ ...house, installations: inst() });
    expect(r.installations!.occupants).toBe(4);
    expect(r.installations!.tankLiters).toBe(1500);
    expect(r.installations!.dailyLiters).toBe(600);
    const w = r.warnings.find((x) => x.code === 'install.tank_load')!;
    expect(w.severity).toBe('info');
    expect(w.message).toContain('1.500 L');
    const t = r.installations!.points.find((p) => p.kind === 'tank')!;
    expect(t.roomId).toBe('bn');
    expect(run({ ...house, installations: inst({ occupants: 2 }) }).installations!.tankLiters).toBe(1000);
    expect(r.quantities.lines.some((l) => l.itemId === 'water_tank_1500' && l.stage === 'installations')).toBe(true);
  });

  test('sem cômodos: relatório vazio e install.no_rooms', () => {
    const r = run({ installations: inst() });
    expect(r.installations!.points).toEqual([]);
    expect(r.installations!.circuits).toEqual([]);
    const w = r.warnings.find((x) => x.code === 'install.no_rooms')!;
    expect(w.severity).toBe('info');
    expect(r.quantities.lines.some((l) => l.stage === 'installations')).toBe(false);
  });

  test('desligado: installations null, nada na etapa e nenhum alerta install.*', () => {
    const r = run({ ...house });
    expect(r.installations).toBeNull();
    expect(r.quantities.lines.some((l) => l.stage === 'installations')).toBe(false);
    expect(r.budget.byStage.some((s) => s.stage === 'installations')).toBe(false);
    expect(r.warnings.some((w) => w.code.startsWith('install.'))).toBe(false);
    expect(r.timingsMs.installations).toBeUndefined();
  });

  test('orçamento: etapa installations com mão de obra de 90% do material (mín.)', () => {
    const r = run({ ...house, furniture: [item('vs', 'furn_toilet', [4.5, 7.5])], installations: inst() });
    const s = r.budget.byStage.find((x) => x.stage === 'installations')!;
    expect(s.material).toBeGreaterThan(0);
    expect(s.labor).toBeCloseTo(s.material * 0.9, 6);
    expect(r.budget.missingPrices).toEqual([]);
    // fora do peso estrutural
    const off = run({ ...house });
    expect(r.weight.totalKg).toBeCloseTo(off.weight.totalKg, 6);
  });

  test('quantitativos: breaker = circuitos + 1, panel_box, caixas e fios por bitola', () => {
    const r = run({ ...bedroom, installations: inst() });
    const line = (id: string) => r.quantities.lines.find((l) => l.stage === 'installations' && l.itemId === id);
    expect(line('breaker')!.netQty).toBe(r.installations!.circuits.length + 1);
    expect(line('panel_box')!.netQty).toBe(1);
    expect(line('box_4x2')!.netQty).toBe(4); // 3 tomadas + 1 interruptor
    expect(line('outlet_2pt')!.netQty).toBe(3);
    expect(line('light_fixture')!.netQty).toBe(1);
    expect(line('wire_1_5')!.netQty).toBeGreaterThan(0);
    expect(line('wire_2_5')!.netQty).toBeGreaterThan(0);
    expect(line('breaker_dr')!.netQty).toBe(1);
  });

  test('desempenho: instalações em poucos ms e computeAll abaixo de 300 ms', () => {
    const t0 = performance.now();
    const r = run({ ...house, installations: inst() });
    expect(performance.now() - t0).toBeLessThan(300);
    expect(r.timingsMs.installations).toBeLessThan(50);
  });

  test('demanda e pacote do engenheiro', () => {
    const p = mk(gable, { ...house, installations: inst() });
    const r = computeAll(p, testCatalog);
    expect(r.installations!.demandKw).toBeGreaterThan(0);
    const pkg = buildEngineerPackage(p, r, testCatalog);
    expect(pkg.summary.installations!.tankLiters).toBe(1500);
    expect(pkg.openQuestions.some((q) => q.text.startsWith("Confirmar apoio da caixa d'água de 1500 L"))).toBe(true);
    const off = buildEngineerPackage(mk(gable, house), computeAll(mk(gable, house), testCatalog), testCatalog);
    expect(off.summary.installations).toBeUndefined();
  });
});
