import { describe, expect, test } from 'vitest';
import type { Catalog } from '@chalecad/catalog';
import { computeAll } from '../../src/compute';
import { buildGraph, rootTree, type AbsPipe } from '../../src/installations/plumbing/graph';
import { inferFittings } from '../../src/installations/plumbing/fittings';
import { designFlow, fwhJ } from '../../src/installations/plumbing/water';
import { makeCtx } from '../../src/installations/plumbing/context';
import { sizeSeptic } from '../../src/installations/plumbing/septic';
import { computePlumbing } from '../../src/installations/plumbing';
import { buildModel } from '../../src/model';
import { Plumbing } from '../../src/schema/project';
import type { Project } from '../../src/schema/project';
import type { EngineWarning, PlumbingReport } from '../../src/schema/results';
import { testCatalog } from '../helpers/catalog';
import { mk } from '../helpers/inline';

const gable = { kind: 'gable_mezzanine', width: 6, depth: 8, wallHeight: 2.8, roofPitchDeg: 20 };
const K = testCatalog.constants.plumbing;

/** Catálogo com a pia a 1,00 m (exemplo 2 da pesquisa) no lugar dos 0,60 m do padrão. */
const catalogSink100: Catalog = {
  ...testCatalog,
  constants: {
    ...testCatalog.constants,
    plumbing: {
      ...K,
      water: { ...K.water, fixtures: { ...K.water.fixtures, kitchen_sink: { ...K.water.fixtures.kitchen_sink!, waterH: 1 } } },
    },
  },
};

type V = [number, number, number];
const L1 = 2.8;
interface PipeIn {
  id: string;
  system?: 'cold' | 'hot' | 'sewer' | 'vent';
  level?: 'L0' | 'L1';
  /** Cotas absolutas; o helper converte para relativas ao piso do nível. */
  path: V[];
  dn?: number;
}
const pipe = (p: PipeIn) => ({
  id: p.id,
  system: p.system ?? 'cold',
  level: p.level ?? 'L0',
  path: p.path.map((v): V => [v[0], v[1], v[2] - (p.level === 'L1' ? L1 : 0)]),
  ...(p.dn ? { dn: p.dn } : {}),
});
const point = (id: string, fixture: string, level: 'L0' | 'L1', x: number, y: number) => ({ id, fixture, level, position: [x, y] as [number, number] });

const levels = [
  { id: 'L0', elevation: 0, floor: 'polished_concrete' },
  { id: 'L1', elevation: L1, polygon: [[0, 4], [6, 4], [6, 8], [0, 8]], deck: 'osb18' },
];

function manual(plumbing: Record<string, unknown>, waterHeater = 'electric_shower'): Project {
  return mk(gable, { levels, installations: { enabled: true, waterHeater, plumbing: { manual: true, ...plumbing } } });
}
function run(project: Project, catalog: Catalog = catalogSink100) {
  const r = computePlumbing(project, buildModel(project, catalog), catalog);
  if (!r) throw new Error('computePlumbing devolveu null');
  return r;
}
const pt = (r: PlumbingReport, id: string, system: 'cold' | 'hot' = 'cold') => r.water.points.find((p) => p.pointId === id && p.system === system)!;
const pp = (r: PlumbingReport, id: string) => r.water.pipes.find((p) => p.pipeId === id)!;
const codes = (w: EngineWarning[]) => w.map((x) => x.code);

// ---------------------------------------------------------------------------
// Chalé-modelo da seção 9 (torre com fundo em z = 6,40; mezanino em 2,80)
// ---------------------------------------------------------------------------
const ex1Pipes = (dn: Record<string, number | undefined>): PipeIn[] => [
  // B1: caixa -> N1 (1,5 m: 0,5 vertical + 1,0 horizontal, 1 joelho)
  { id: 'B1', path: [[0, 0, 6.4], [0, 0, 5.9], [1, 0, 5.9]], dn: dn.B1 },
  // C1: N1 -> N2 (3,0 m, 2 joelhos); tê lateral em N1
  { id: 'C1', path: [[1, 0, 5.9], [1, 0, 4.9], [1, 1, 4.9], [2, 1, 4.9]], dn: dn.C1 },
  // R1: N2 -> N3 (1,2 m, 1 joelho)
  { id: 'R1', path: [[2, 1, 4.9], [2.6, 1, 4.9], [2.6, 1.6, 4.9]], dn: dn.R1 },
  // S1: N3 -> chuveiro do mezanino (0,6 m, 1 joelho); tê lateral em N3
  { id: 'S1', path: [[2.6, 1.6, 4.9], [2.9, 1.6, 4.9], [2.9, 1.9, 4.9]], dn: dn.S1 },
  // ramal do banheiro de cima que segue reto: bacia e lavatório
  { id: 'Rb', path: [[2.6, 1.6, 4.9], [2.6, 2.2, 4.9]] },
  { id: 'Rbt', path: [[2.6, 2.2, 4.9], [2.6, 2.2, 3.05]] },
  { id: 'Rbl', path: [[2.6, 2.2, 4.9], [2.6, 2.2, 3.4]] },
  // C2: N1 -> N4 (4,8 m: 1,0 horizontal + 3,8 vertical, 1 joelho); passagem direta em N1
  { id: 'C2', path: [[1, 0, 5.9], [2, 0, 5.9], [2, 0, 2.1]], dn: dn.C2 },
  // R2: N4 -> N5 (4,0 m, 1 joelho); lateral em N4
  { id: 'R2', path: [[2, 0, 2.1], [5, 0, 2.1], [5, 1, 2.1]], dn: dn.R2 },
  // S2: N5 -> pia (2,0 m, 2 joelhos); lateral em N5
  { id: 'S2', path: [[5, 1, 2.1], [5.5, 1, 2.1], [5.5, 1, 1.0], [5.5, 1.4, 1.0]], dn: dn.S2 },
  // tanque e máquina (segue reto em N5)
  { id: 'Rm', path: [[5, 1, 2.1], [5, 3, 2.1]] },
  { id: 'Rmt', path: [[5, 3, 2.1], [5, 3, 1.0], [5, 3.2, 1.0]] },
  { id: 'Rmm', path: [[5, 3, 2.1], [4.8, 3, 2.1], [4.8, 3, 1.0]] },
  // banho do térreo (segue reto em N4): bacia, lavatório e chuveiro
  { id: 'Rg', path: [[2, 0, 2.1], [2, 0, 1.5]] },
  { id: 'Rgt', path: [[2, 0, 1.5], [2, 0, 0.25]] },
  { id: 'Rgl', path: [[2, 0, 1.5], [2.3, 0, 1.5], [2.3, 0, 0.6]] },
  { id: 'Rgs', path: [[2, 0, 1.5], [2.5, 0, 1.5], [2.5, 0, 2.1]] },
];
const ex1Points = [
  point('shower_up', 'shower_electric', 'L1', 2.9, 1.9),
  point('toilet_up', 'toilet_tank', 'L1', 2.6, 2.2),
  point('lav_up', 'lavatory', 'L1', 2.6, 2.2),
  point('sink', 'kitchen_sink', 'L0', 5.5, 1.4),
  point('tub', 'laundry_tub', 'L0', 5, 3.2),
  point('washer', 'washing_machine', 'L0', 4.8, 3),
  point('toilet_dn', 'toilet_tank', 'L0', 2, 0),
  point('lav_dn', 'lavatory', 'L0', 2.3, 0),
  point('shower_dn', 'shower_electric', 'L0', 2.5, 0),
];
const crit = { B1: 32, C1: 25, R1: 25, S1: 20, C2: 32, R2: 25, S2: 20 };
const ex1 = (dn: Record<string, number | undefined> = crit, bottomZ = 6.4) =>
  manual({ tank: { level: 'L0', position: [0, 0], bottomZ }, points: ex1Points, pipes: ex1Pipes(dn).map(pipe) });

describe('hidráulica: fórmulas (seção 9)', () => {
  test('FWH: J(0,1 L/s; DI 17,0) = 0,02210 e J(0,5848 L/s; DI 27,8) = 0,04700 m/m', () => {
    expect(fwhJ(K, 'cold', 0.1, 0.017)).toBeCloseTo(0.0221, 3);
    expect(Math.abs(fwhJ(K, 'cold', 0.1, 0.017) - 0.0221)).toBeLessThan(1e-4);
    expect(Math.abs(fwhJ(K, 'cold', 0.5848, 0.0278) - 0.047)).toBeLessThan(1e-4);
  });

  test('Q = máx(0,3·√ΣP, q máx.): chuveiro elétrico 0,10; ΣP 3,8 = 0,5848; ΣP 0,7 = 0,2510', () => {
    expect(designFlow(K, 0.1, 0.1)).toBeCloseTo(0.1, 6);
    expect(designFlow(K, 3.8, 0.3)).toBeCloseTo(0.5848, 4);
    expect(designFlow(K, 0.7, 0.15)).toBeCloseTo(0.251, 3);
  });

  test('conexões: polilinha com 2 vértices ortogonais = 2 joelhos 90°; 45° vira joelho 45°', () => {
    const pipes: AbsPipe[] = [
      { id: 'a', system: 'cold', level: 'L0', path: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
      { id: 'b', system: 'cold', level: 'L0', path: [[1, 1, 1], [2, 1, 1], [3, 2, 1]] },
    ];
    const g = buildGraph(pipes);
    const tree = rootTree(g, pipes, g.pipeNodes[0]!.start);
    const f = inferFittings({ tree, pointsAtNode: () => 0, pressureValveAt: () => false, gateAtLeaf: () => false, gateDepth: 0, entranceAtRoot: false });
    expect(f[0]!.elbow90).toBe(2);
    // junção a→b: sobe e vira (90°); vértice interno de b a 45°
    expect(f[1]!.elbow90).toBe(1);
    expect(f[1]!.elbow45).toBe(1);
  });
});

describe('hidráulica: exemplos 1 a 3 da pesquisa', () => {
  test('Exemplo 1: chuveiro do mezanino a 1,50 m da caixa: 0,619 m.c.a., falha e pede subir a caixa', () => {
    const r = run(ex1());
    const p = pt(r.report, 'shower_up');
    expect(p.staticHead).toBeCloseTo(1.5, 6);
    expect(p.headLoss).toBeCloseTo(0.8811, 2);
    expect(p.dynamicHead).toBeCloseTo(0.6189, 2);
    expect(p.dynamicKpa).toBeCloseTo(6.07, 1);
    expect(p.ok).toBe(false);
    // 10 kPa = 1,0197 m.c.a. (catálogo, 9,80665 kPa/m): a pesquisa arredonda para 1,00 m e pede 0,381 m
    expect(p.requiredTankRise).toBeCloseTo(0.4008, 2);
    expect(p.requiredTankRise).toBeGreaterThan(0.38 - 1e-6);
    expect(p.path).toEqual(['B1', 'C1', 'R1', 'S1']);
    const w = r.warnings.find((x) => x.code === 'water.pressure_low' && x.refs?.includes('shower_up'))!;
    expect(w.severity).toBe('warn'); // mezanino
    expect(w.message).toMatch(/suba a caixa 0,40 m ou aumente o tubo/);
  });

  test('Exemplo 1: perdas e conexões por trecho (tabela da seção 9)', () => {
    const r = run(ex1()).report;
    if (process.env.DBG) console.log(JSON.stringify(r.water.pipes.map((p) => [p.pipeId, p.dn, +p.sumWeights.toFixed(2), +p.flowLps.toFixed(4), +p.length.toFixed(2), p.leq, +p.headLoss.toFixed(4)])));
    const expected: [string, number, number, number][] = [
      // id, ΣLeq, hf, v
      ['B1', 2.3, 0.1786, 0.963],
      ['C1', 5.0, 0.2837, 0.685],
      ['R1', 1.2, 0.0851, 0.685],
      ['S1', 14.5, 0.3337, 0.441],
      ['C2', 2.7, 0.295, 0.87],
      ['R2', 3.6, 0.7922, 1.268],
      ['S2', 4.6, 0.7301, 1.106],
    ];
    for (const [id, leq, hf, v] of expected) {
      expect(pp(r, id).leq, `Leq ${id}`).toBeCloseTo(leq, 6);
      expect(Math.abs(pp(r, id).headLoss - hf), `hf ${id}`).toBeLessThan(0.005);
      expect(pp(r, id).velocity, `v ${id}`).toBeCloseTo(v, 2);
    }
    expect(pp(r, 'B1').flowLps).toBeCloseTo(0.5848, 4);
    expect(pp(r, 'S1').flowLps).toBeCloseTo(0.1, 6);
    expect(pp(r, 'C1').length).toBeCloseTo(3.0, 6);
    expect(pp(r, 'C2').length).toBeCloseTo(4.8, 6);
  });

  test('Exemplo 1b: C1 e R1 em DN 32 e S1 em DN 25: 1,082 m.c.a., ok', () => {
    const r = run(ex1({ ...crit, C1: 32, R1: 32, S1: 25 }));
    const p = pt(r.report, 'shower_up');
    expect(Math.abs(p.dynamicHead - 1.0815)).toBeLessThan(0.01);
    expect(p.ok).toBe(true);
    expect(p.requiredTankRise).toBe(0);
    expect(r.warnings.some((w) => w.code === 'water.pressure_low' && w.refs?.includes('shower_up'))).toBe(false);
  });

  test('Exemplo 2: pia do térreo (1,00 m) sob a torre: 3,404 m.c.a., ok; v máx. 1,268 m/s', () => {
    const r = run(ex1(), catalogSink100);
    const p = pt(r.report, 'sink');
    expect(p.staticHead).toBeCloseTo(5.4, 6);
    expect(Math.abs(p.headLoss - 1.9958)).toBeLessThan(0.01);
    expect(Math.abs(p.dynamicHead - 3.4042)).toBeLessThan(0.01);
    expect(p.ok).toBe(true);
    const vmax = Math.max(...r.report.water.pipes.filter((x) => ['B1', 'C2', 'R2', 'S2'].includes(x.pipeId)).map((x) => x.velocity));
    expect(vmax).toBeCloseTo(1.268, 2);
  });

  test('Exemplo 3: caixa no forro (fundo 3,20) e chuveiro a 2,10: 0,025 m.c.a., falha (só a estática daria ok)', () => {
    const pipes: PipeIn[] = [
      { id: 'A', path: [[0, 0, 3.2], [0, 0, 2.2], [1, 0, 2.2]], dn: 25 },
      { id: 'B', path: [[1, 0, 2.2], [1, 2, 2.2], [2, 2, 2.2]], dn: 25 },
      { id: 'C', path: [[2, 2, 2.2], [2, 2.7, 2.2], [2, 2.7, 2.1]], dn: 20 },
      { id: 'Rb', path: [[2, 2, 2.2], [3, 2, 2.2]] },
      { id: 'Rbt', path: [[3, 2, 2.2], [3, 2, 0.25]] },
      { id: 'Rbl', path: [[3, 2, 2.2], [3.2, 2, 2.2], [3.2, 2, 0.6]] },
      { id: 'K', path: [[1, 0, 2.2], [4, 0, 2.2]] },
      { id: 'K1', path: [[4, 0, 2.2], [4, 0, 1.0]] },
      { id: 'K2', path: [[4, 0, 2.2], [4.3, 0, 2.2], [4.3, 0, 1.0]] },
      { id: 'K3', path: [[4, 0, 2.2], [4, 0.3, 2.2], [4, 0.3, 1.0]] },
    ];
    const pts = [
      point('shower', 'shower_electric', 'L0', 2, 2.7),
      point('toilet', 'toilet_tank', 'L0', 3, 2),
      point('lav', 'lavatory', 'L0', 3.2, 2),
      point('sink', 'kitchen_sink', 'L0', 4, 0),
      point('tub', 'laundry_tub', 'L0', 4.3, 0),
      point('washer', 'washing_machine', 'L0', 4, 0.3),
    ];
    const r = run(manual({ tank: { level: 'L0', position: [0, 0], bottomZ: 3.2 }, points: pts, pipes: pipes.map(pipe) }));
    const p = pt(r.report, 'shower');
    expect(p.staticHead).toBeCloseTo(1.1, 6);
    expect(Math.abs(p.dynamicHead - 0.0252)).toBeLessThan(0.01);
    expect(p.ok).toBe(false);
    const w = r.warnings.find((x) => x.code === 'water.pressure_low' && x.refs?.includes('shower'))!;
    expect(w.severity).toBe('info'); // térreo
  });

  test('manual: descer a caixa 1 m reduz a pressão de todos os pontos em 1 m.c.a.', () => {
    const a = run(ex1(crit, 6.4)).report;
    const b = run(ex1(crit, 5.4)).report;
    expect(b.water.points).toHaveLength(a.water.points.length);
    for (const p of a.water.points) {
      const q = b.water.points.find((x) => x.pointId === p.pointId)!;
      expect(p.dynamicHead - q.dynamicHead, p.pointId).toBeCloseTo(1, 2);
    }
  });

  test('ponto sem tubo é "water.disconnected"; DN do sub-ramal abaixo do mínimo é "water.dn_min"; v > 3 m/s é erro', () => {
    const pipes: PipeIn[] = [
      { id: 'A', path: [[0, 0, 5], [0, 0, 1.0], [1, 0, 1.0]], dn: 20 },
      { id: 'T', path: [[1, 0, 1.0], [1, 1, 1.0]], dn: 20 },
    ];
    const pts = [point('tub', 'laundry_tub', 'L0', 1, 1), point('solto', 'lavatory', 'L0', 3, 3)];
    const r = run(manual({ tank: { level: 'L0', position: [0, 0], bottomZ: 5 }, points: pts, pipes: pipes.map(pipe) }));
    expect(codes(r.warnings)).toContain('water.disconnected');
    expect(r.warnings.find((w) => w.code === 'water.disconnected')!.refs).toEqual(['solto']);
    expect(codes(r.warnings)).toContain('water.dn_min'); // tanque pede DN 25
    expect(pp(r.report, 'A').dn).toBe(20);
  });

  test('velocidade acima da meta de 2 m/s com DN do usuário: aviso informativo (B1 em DN 20 = 2,58 m/s)', () => {
    const r = run(ex1({ ...crit, B1: 20 }));
    const w = r.warnings.find((x) => x.code === 'water.velocity_high' && x.refs?.includes('B1'))!;
    expect(w.severity).toBe('info');
    expect(pp(r.report, 'B1').velocity).toBeGreaterThan(2.5);
  });

  test('DN não informado: o motor dimensiona (velocidade-alvo, não diminui rumo à caixa) e sobe tubos até atender', () => {
    const r = run(ex1({}));
    const dn = (id: string) => pp(r.report, id).dn;
    expect(dn('B1')).toBeGreaterThanOrEqual(dn('C1'));
    expect(dn('C1')).toBeGreaterThanOrEqual(dn('R1'));
    expect(dn('R1')).toBeGreaterThanOrEqual(dn('S1'));
    expect(dn('S1')).toBeGreaterThanOrEqual(20);
    const p = pt(r.report, 'shower_up');
    expect(p.ok).toBe(true); // o dimensionamento sobe o DN dos trechos do caminho crítico (seção 10.3, item 8)
    for (const x of r.report.water.pipes) expect(x.velocity).toBeLessThanOrEqual(2 + 1e-6);
  });
});

// ---------------------------------------------------------------------------
// Esgoto: exemplo 4 (27 UHC) e vent
// ---------------------------------------------------------------------------
const sewerLayout = () => {
  const pts = [
    point('t_m', 'toilet_tank', 'L1', 2, 2),
    point('l_m', 'lavatory', 'L1', 3, 2),
    point('s_m', 'shower_electric', 'L1', 2.5, 2.6),
    point('t_g', 'toilet_tank', 'L0', 6, 2),
    point('l_g', 'lavatory', 'L0', 7, 2),
    point('s_g', 'shower_electric', 'L0', 6.5, 2.6),
    point('pia', 'kitchen_sink', 'L0', 9, 3.2),
    point('tub', 'laundry_tub', 'L0', 3.5, 4.5),
    point('maq', 'washing_machine', 'L0', 4.5, 4.5),
  ];
  const sew: PipeIn[] = [
    // mezanino: CS com lavatório e chuveiro, saída até a bacia, tubo de queda
    { id: 'm_cs', system: 'sewer', level: 'L1', path: [[2.5, 2, 2.36], [2, 2, 2.35]] },
    { id: 'm_lav', system: 'sewer', level: 'L1', path: [[3, 2, 2.37], [2.5, 2, 2.36]] },
    { id: 'm_chu', system: 'sewer', level: 'L1', path: [[2.5, 2.6, 2.372], [2.5, 2, 2.36]] },
    { id: 'queda', system: 'sewer', level: 'L1', path: [[2, 2, 2.35], [2, 2, -0.3]] },
    // térreo: coletor a 1% até a saída em x = 12
    { id: 'P1a', system: 'sewer', path: [[2, 2, -0.3], [4, 2, -0.32]] },
    { id: 'P1b', system: 'sewer', path: [[4, 2, -0.32], [6, 2, -0.34]] },
    { id: 'P2', system: 'sewer', path: [[6, 2, -0.34], [9, 2, -0.37]] },
    { id: 'P3', system: 'sewer', path: [[9, 2, -0.37], [12, 2, -0.4]] },
    // banho do térreo
    { id: 'g_cs', system: 'sewer', path: [[6.5, 2, -0.332], [6, 2, -0.34]] },
    { id: 'g_lav', system: 'sewer', path: [[7, 2, -0.322], [6.5, 2, -0.332]] },
    { id: 'g_chu', system: 'sewer', path: [[6.5, 2.6, -0.32], [6.5, 2, -0.332]] },
    // cozinha: pia -> caixa de gordura -> coletor
    { id: 'cg_out', system: 'sewer', path: [[9, 2.5, -0.36], [9, 2, -0.37]] },
    { id: 'pia_r', system: 'sewer', path: [[9, 3.2, -0.346], [9, 2.5, -0.36]] },
    // lavanderia: CS -> coletor
    { id: 'lv_cs', system: 'sewer', path: [[4, 4.5, -0.27], [4, 2, -0.32]] },
    { id: 'lv_tub', system: 'sewer', path: [[3.5, 4.5, -0.26], [4, 4.5, -0.27]] },
    { id: 'lv_maq', system: 'sewer', path: [[4.5, 4.5, -0.26], [4, 4.5, -0.27]] },
  ];
  const vent: PipeIn[] = [
    { id: 'v_m', system: 'vent', level: 'L1', path: [[2, 2, 2.35], [2, 2, 9]] },
    { id: 'v_g', system: 'vent', path: [[6, 2, -0.34], [6, 2, 9]] },
    { id: 'v_l', system: 'vent', path: [[4, 4.5, -0.27], [4, 4.5, 9]] },
    { id: 'v_k', system: 'vent', path: [[9, 2.5, -0.36], [9, 2.5, 9]] },
  ];
  return { pts, pipes: [...sew, ...vent].map(pipe) };
};

describe('esgoto (NBR 8160)', () => {
  const base = sewerLayout();
  const mkSewer = (pipes = base.pipes, extra: Record<string, unknown> = {}) =>
    manual({ tank: { level: 'L0', position: [0, 0], bottomZ: 6.4 }, points: base.pts, pipes, sewerDisposal: 'public', ...extra });

  test('Exemplo 4: subcoletor com 27 UHC em DN 100 a 1 %; ramal da bacia sempre DN 100; sem erros', () => {
    const r = run(mkSewer());
    const sw = (id: string) => r.report.sewer.pipes.find((p) => p.pipeId === id)!;
    if (process.env.DBG) console.log(JSON.stringify(r.report.sewer.pipes.map((p) => [p.pipeId, p.uhc, p.dn, p.slope])), JSON.stringify(r.warnings.map((w) => w.code + ' ' + w.message)));
    expect(r.report.sewer.totalUhc).toBe(27);
    expect(sw('P3').uhc).toBe(27);
    expect(sw('P3').dn).toBe(100);
    expect(sw('P3').slope).toBeCloseTo(0.01, 6);
    expect(sw('P2').dn).toBe(100); // ramal da bacia do térreo
    expect(sw('queda').dn).toBe(100);
    expect(sw('queda').uhc).toBe(9);
    // CS com lavatório + chuveiro = 3 UHC: saída DN 50 a 2 %
    expect(sw('m_cs').uhc).toBe(3);
    expect(sw('m_cs').dn).toBe(50);
    expect(sw('m_cs').slope).toBeCloseTo(0.02, 6);
    // pia: ramal DN 50, saída da caixa de gordura DN 75; tanque + máquina = 6 UHC em DN 50
    expect(sw('pia_r').dn).toBe(50);
    expect(sw('cg_out').dn).toBe(75);
    expect(sw('lv_cs').uhc).toBe(6);
    expect(sw('lv_cs').dn).toBe(50);
    expect(r.report.sewer.vented).toBe(true);
    const errors = r.warnings.filter((w) => w.severity === 'error' && /^sewer/.test(w.code));
    expect(errors.map((w) => `${w.code}: ${w.message}`)).toEqual([]);
    expect(codes(r.warnings)).not.toContain('sewer.grease_trap');
    expect(codes(r.warnings)).not.toContain('sewer.vent_distance');
  });

  test('cotas: a cota cai declividade x comprimento (3 m a 1 % = 0,03 m na saída)', () => {
    const r = run(mkSewer());
    const p3 = r.report.sewer.pipes.find((p) => p.pipeId === 'P3')!;
    expect(p3.zFrom - p3.zTo).toBeCloseTo(0.03, 6);
    const queda = r.report.sewer.pipes.find((p) => p.pipeId === 'queda')!;
    expect(queda.zFrom - queda.zTo).toBeCloseTo(2.65, 6); // tubo de queda vertical
  });

  test('itens: 3 caixas sifonadas, 1 de gordura, caixas de inspeção, tubos por DN e conexões', () => {
    const r = run(mkSewer());
    const q = (id: string) => r.items.filter((i) => i.itemId === id).reduce((s, i) => s + i.net, 0);
    expect(q('siphon_box')).toBe(3);
    expect(q('grease_trap')).toBe(1);
    expect(q('inspection_box')).toBeGreaterThanOrEqual(1);
    expect(q('pvc_sewer_100')).toBeGreaterThan(10);
    expect(q('pvc_sewer_50')).toBeGreaterThan(0);
    expect(q('pvc_sewer_75')).toBeGreaterThan(0);
    expect(q('fit_sewer_elbow')).toBeGreaterThan(0);
    expect(q('fit_sewer_tee')).toBeGreaterThan(0);
    expect(r.items.every((i) => i.stage === 'installations')).toBe(true);
  });

  test('erros: bacia em DN 75, UHC acima do DN, redução de DN, declividade e sem ventilação', () => {
    const lock = (id: string, dn: number) => base.pipes.map((p) => (p.id === id ? { ...p, dn } : p));
    const toilet = run(mkSewer(lock('P2', 75)));
    expect(codes(toilet.warnings)).toContain('sewer.toilet_dn');
    expect(codes(toilet.warnings)).toContain('sewer.dn_reduction'); // P2 (DN 75) recebe P1b (DN 100)
    const small = run(mkSewer(lock('lv_cs', 40)));
    expect(codes(small.warnings)).toContain('sewer.uhc_exceeded'); // 6 UHC em DN 40 (máx. 3)
    const flat = run(mkSewer(base.pipes.map((p) => (p.id === 'P3' ? { ...p, slope: 0.005 } : p))));
    const sl = flat.warnings.find((w) => w.code === 'sewer.slope')!;
    expect(sl.severity).toBe('error');
    const steep = run(mkSewer(base.pipes.map((p) => (p.id === 'P3' ? { ...p, slope: 0.08 } : p))));
    expect(steep.warnings.find((w) => w.code === 'sewer.slope')!.severity).toBe('warn');
    const noVent = run(mkSewer(base.pipes.filter((p) => p.system !== 'vent')));
    expect(codes(noVent.warnings)).toContain('sewer.no_vent');
    expect(noVent.report.sewer.vented).toBe(false);
  });

  test('distância ao ventilador: caixa sifonada a mais de 1,20 m; pia sem caixa de gordura', () => {
    const noKitchenVent = run(mkSewer(base.pipes.filter((p) => p.id !== 'v_k')));
    // pia/CG sem ventilador próprio: a CG fica a 0,5 m do coletor, que tem ventilador a 3 m (v_g): excede 1,80 m
    expect(codes(noKitchenVent.warnings)).toContain('sewer.vent_distance');
    // pia ligada direto no nó do coletor (sem caixa de gordura dedicada)
    const direct = base.pipes.map((p) => (p.id === 'pia_r' ? pipe({ id: 'pia_r', system: 'sewer', path: [[9, 3.2, -0.346], [9, 2, -0.37]] }) : p)).filter((p) => p.id !== 'cg_out');
    const r = run(mkSewer(direct));
    expect(codes(r.warnings)).toContain('sewer.grease_trap');
  });
});

describe('fossa séptica (NBR 7229)', () => {
  test('Exemplo 5: N = 6, médio, 2 anos, 10 a 20 °C: V = 2.410 L; filtro 1.248 L', () => {
    const p = mk(gable, { installations: { enabled: true } });
    const s = sizeSeptic(makeCtx(p, buildModel(p, testCatalog), testCatalog), 6);
    expect(s.dailyLiters).toBe(780);
    expect(s.detentionDays).toBe(1);
    expect(s.tankLiters).toBe(2410);
    expect(s.filterLiters).toBe(1248);
  });

  test('sewerDisposal septic gera a fossa e o filtro no relatório e no orçamento; public não', () => {
    const base = sewerLayout();
    const septic = run(manual({ tank: { level: 'L0', position: [0, 0], bottomZ: 6.4 }, points: base.pts, pipes: base.pipes, sewerDisposal: 'septic' }));
    // ocupantes = 2 por quarto (mínimo 2): sem quartos, N = 2 -> 1000 + 2·(130 + 105) = 1.470 L
    expect(septic.report.septic).toEqual({ tankLiters: 1470, contributionLpd: 260 });
    expect(septic.items.some((i) => i.itemId === 'septic_tank')).toBe(true);
    expect(septic.items.some((i) => i.itemId === 'anaerobic_filter')).toBe(true);
    const pub = run(manual({ tank: { level: 'L0', position: [0, 0], bottomZ: 6.4 }, points: base.pts, pipes: base.pipes, sewerDisposal: 'public' }));
    expect(pub.report.septic).toBeNull();
    expect(pub.items.some((i) => i.itemId === 'septic_tank')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Traçado gerado
// ---------------------------------------------------------------------------
type V2 = [number, number];
const item = (id: string, kind: string, position: V2, rotation = 0, level = 'L1') => ({ id, level, item: kind, position, rotation });
const mezzHouse = (extras: unknown[], heater = 'electric_shower') =>
  mk(gable, {
    levels,
    walls: [
      { id: 'w1', level: 'L1', from: [2.5, 5.5], to: [2.5, 8] },
      { id: 'w2', level: 'L1', from: [0, 5.5], to: [2.5, 5.5] },
      { id: 'g1', level: 'L0', from: [3, 0], to: [3, 4] },
      { id: 'g2', level: 'L0', from: [0, 4], to: [3, 4] },
    ],
    rooms: [
      { id: 'bm', level: 'L1', use: 'bathroom', seed: [1.2, 6.7] },
      { id: 'kz', level: 'L0', use: 'kitchen', seed: [1.5, 2] },
    ],
    furniture: [
      item('ch', 'furn_shower', [0.45, 7.5]),
      item('vs', 'furn_toilet', [1.9, 7.6]),
      item('lv', 'furn_bath_sink', [1.9, 6.1], 180),
      item('pia', 'furn_kitchen_sink', [1.5, 0.5], 0, 'L0'),
    ],
    installations: { enabled: true, waterHeater: heater },
    extras,
  });
const tower = (platformZ = 6) => ({ id: 't1', kind: 'water_tower', position: [1.2, 6.7], platformZ });

describe('traçado gerado (banheiro no mezanino com torre)', () => {
  const r = computeAll(mezzHouse([tower()]), testCatalog);
  const pl = r.installations!.plumbing!;

  test('o layout passa no Plumbing.parse (a interface o copia ao "editar à mão")', () => {
    const parsed = Plumbing.safeParse({ manual: true, tank: pl.layout.tank, points: pl.layout.points, pipes: pl.layout.pipes });
    expect(parsed.success, JSON.stringify(parsed.success ? '' : parsed.error.issues.slice(0, 3))).toBe(true);
    expect(pl.layout.pipes.every((p) => p.id.startsWith('auto-'))).toBe(true);
    expect(new Set(pl.layout.pipes.map((p) => p.id)).size).toBe(pl.layout.pipes.length);
    // determinístico
    const again = computeAll(mezzHouse([tower()]), testCatalog).installations!.plumbing!;
    expect(again.layout).toEqual(pl.layout);
  });

  test('caixa sobre a torre (fundo na platformZ); todos os pontos ligados à caixa com pressão calculada', () => {
    expect(pl.layout.tank.bottomZ).toBeCloseTo(6, 6);
    expect(pl.layout.tank.towerId).toBe('t1');
    expect(pl.layout.points.map((p) => p.fixture).sort()).toEqual(['kitchen_sink', 'lavatory', 'shower_electric', 'toilet_tank']);
    expect(r.warnings.some((w) => w.code === 'water.disconnected')).toBe(false);
    expect(pl.water.points).toHaveLength(4);
    for (const p of pl.water.points) {
      expect(Number.isFinite(p.dynamicHead)).toBe(true);
      expect(p.path.length).toBeGreaterThan(0);
      expect(p.headLoss).toBeGreaterThan(0);
    }
    const shower = pl.water.points.find((p) => p.fixture === 'shower_electric')!;
    expect(shower.z).toBeCloseTo(2.8 + 2.1, 6);
    expect(shower.staticHead).toBeCloseTo(6 - 4.9, 6);
    expect(shower.ok).toBe(true);
  });

  test('esgoto ligado, ventilado e sem erros; a pia tem caixa de gordura', () => {
    expect(pl.sewer.vented).toBe(true);
    expect(pl.sewer.totalUhc).toBe(12);
    const errors = r.warnings.filter((w) => w.severity === 'error');
    expect(errors.map((w) => `${w.code}: ${w.message}`)).toEqual([]);
    expect(r.warnings.some((w) => w.code === 'sewer.grease_trap' || w.code === 'sewer.disconnected')).toBe(false);
    // coletor em DN 100 a 1 %
    const exit = pl.sewer.pipes.find((p) => p.pipeId.startsWith('auto-esgoto-saida'))!;
    expect(exit.dn).toBe(100);
    expect(exit.slope).toBeCloseTo(0.01, 6);
  });

  test('o cálculo substitui a estimativa: itens novos, sem o kit antigo; install.pressure sai', () => {
    const ids = new Set(r.quantities.lines.filter((l) => l.stage === 'installations').map((l) => l.itemId));
    expect(ids.has('pipe_fittings')).toBe(false);
    expect(ids.has('fit_water_elbow')).toBe(true);
    expect(ids.has('siphon_box')).toBe(true);
    expect([...ids].some((id) => id.startsWith('pvc_water_'))).toBe(true);
    expect(ids.has('water_tank_1000') || ids.has('water_tank_500') || ids.has('water_tank_1500')).toBe(true);
    expect(r.warnings.some((w) => w.code === 'install.pressure')).toBe(false);
    expect(r.warnings.some((w) => w.code === 'install.tank_load')).toBe(true);
  });

  test('sem torre, caixa no forro: chuveiro do mezanino falha e pede subir a caixa (warn)', () => {
    const f = computeAll(mezzHouse([]), testCatalog);
    const w = f.warnings.filter((x) => x.code === 'water.pressure_low');
    expect(w.length).toBeGreaterThan(0);
    expect(w[0]!.severity).toBe('warn');
    expect(w[0]!.message).toMatch(/suba a caixa [\d,]+ m ou aumente o tubo/);
    const tank = f.installations!.plumbing!.layout.tank;
    expect(tank.towerId).toBeNull();
    expect(tank.bottomZ).toBeGreaterThan(2.8);
  });

  test('água quente (gás): rede quente ligada, com pontos quentes no lavatório e no chuveiro misturador', () => {
    const g = computeAll(mezzHouse([tower()], 'gas'), testCatalog).installations!.plumbing!;
    expect(g.layout.points.some((p) => p.fixture === 'shower_mixer')).toBe(true);
    const hot = g.water.points.filter((p) => p.system === 'hot');
    expect(hot.map((p) => p.fixture).sort()).toEqual(['kitchen_sink', 'lavatory', 'shower_mixer']);
    expect(g.water.pipes.some((p) => p.system === 'hot' && p.dn >= 20)).toBe(true);
    expect(g.layout.pipes.some((p) => p.system === 'hot')).toBe(true);
  });
});
