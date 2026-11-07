import { describe, expect, test } from 'vitest';
import { getCatalog, getProfile } from '@chalecad/catalog';
import { computeAll, computeStructure, DISCLAIMER, statusOf, structuralCapacity as cap, windPressure } from '../../src';
import { loadFixture } from '../helpers/load';

const catalog = getCatalog();
const testCatalog = catalog;
const fixture = () => loadFixture('gable-6.5x8.5-mezzanine.json');

describe('vento (NBR 6123 simplificada)', () => {
  test('V0 = 35, categoria 3: Vk = 32,9 m/s e q ≈ 0,664 kPa', () => {
    const { vk, qKPa } = windPressure(fixture(), catalog);
    // 35 · 1,0 · 0,94 · 1,0 = 32,9 m/s; 0,613 · 32,9² = 663,5 N/m²
    expect(vk).toBeCloseTo(32.9, 6);
    expect(qKPa).toBeCloseTo(0.664, 3);
    expect(Math.abs(qKPa - 0.664) / 0.664).toBeLessThan(0.01);
  });
});

describe('fórmulas de resistência (conferidas à mão)', () => {
  test('viga biapoiada Ue200x40x1.25, L = 3,5 m, q = 2,5 kN/m', () => {
    const p = getProfile(catalog, 'Ue200x40x1.25');
    // Propriedades do catálogo: Wx em cm³, Ix em cm⁴, fy = 230 MPa = 23 kN/cm².
    expect(p.Wx).toBeCloseTo(19.34, 1);
    expect(p.Ix).toBeCloseTo(193.4, 0);
    const r = cap.simpleBeam({ profile: p, L: 3.5, wUls: 2.5, wServ: 2.5, deflDen: 350, E: 200000, factors: testCatalog.constants.structureFactors });
    // M = qL²/8 = 2,5 · 12,25 / 8 = 3,828 kN·m
    expect(r.M).toBeCloseTo(3.828, 3);
    // Mrd = Wx · fy / 1,1 = 19,34 · 23 / 1,1 = 404,4 kN·cm = 4,044 kN·m
    expect(r.Mrd).toBeCloseTo((p.Wx * 23) / 1.1 / 100, 6);
    expect(r.Mrd).toBeCloseTo(4.044, 2);
    expect(r.rM).toBeCloseTo(0.9466, 3);
    // V = qL/2 = 4,375 kN; Vrd = 0,6 · 23 · (20 · 0,125) / 1,1 = 31,36 kN
    expect(r.V).toBeCloseTo(4.375, 3);
    expect(r.Vrd).toBeCloseTo(31.36, 1);
    // flecha = 5 q L⁴ / (384 E I) = 5 · 0,025 kN/cm · 350⁴ / (384 · 20000 · 193,4) = 1,263 cm; limite 350/350 = 1,0 cm
    expect(r.delta).toBeCloseTo(1.263, 2);
    expect(r.deltaLim).toBeCloseTo(1, 6);
    expect(r.rD).toBeCloseTo(1.263, 2);
    // taxa = máximo das três: governa a flecha
    expect(r.ratio).toBeCloseTo(r.rD, 9);
    expect(statusOf(r.ratio, catalog.constants.usage)).toBe('fail');
  });

  test('compressão do montante Ue90x40x0.95, L = 2,8 m', () => {
    const p = getProfile(catalog, 'Ue90x40x0.95');
    const c = cap.compression(p, 200000, 2.8, 1.4, testCatalog.constants.structureFactors);
    // Ne,x = π² · 20000 kN/cm² · A / (280 / rx)²; Ne,y com L = 1,4 m (bloqueadores) e ry
    const Nex = (Math.PI ** 2 * 20000 * p.area) / (280 / p.rx) ** 2;
    const Ney = (Math.PI ** 2 * 20000 * p.area) / (140 / p.ry) ** 2;
    expect(Ney).toBeLessThan(Nex);
    expect(c.Ne).toBeCloseTo(Ney, 9);
    expect(c.Ne).toBeCloseTo(38.6, 0);
    // λ0 = √(A · fy / Ne) = √(1,75 · 23 / 38,6) = 1,02 → χ = 0,658^(λ0²) = 0,646
    expect(c.lambda0).toBeCloseTo(Math.sqrt((p.area * 23) / Ney), 9);
    expect(c.lambda0).toBeCloseTo(1.02, 2);
    expect(c.chi).toBeCloseTo(0.658 ** (c.lambda0 ** 2), 9);
    expect(c.chi).toBeCloseTo(0.646, 2);
    // Nc,Rd = χ · 0,85 · A · fy / 1,2 = 0,646 · 0,85 · 40,25 / 1,2 = 18,4 kN
    expect(c.NcRd).toBeCloseTo((c.chi * 0.85 * p.area * 23) / 1.2, 9);
    expect(c.NcRd).toBeCloseTo(18.4, 0);
  });

  test('esbeltez alta usa χ = 0,877/λ0²', () => {
    const p = getProfile(catalog, 'Ue90x40x0.95');
    const c = cap.compression(p, 200000, 6, 6, testCatalog.constants.structureFactors);
    expect(c.lambda0).toBeGreaterThan(1.5);
    expect(c.chi).toBeCloseTo(0.877 / c.lambda0 ** 2, 9);
  });

  test('status pelas faixas de uso', () => {
    const u = { warn: 0.7, fail: 1 };
    expect(statusOf(0.69, u)).toBe('ok');
    expect(statusOf(0.7, u)).toBe('warn');
    expect(statusOf(1, u)).toBe('warn');
    expect(statusOf(1.01, u)).toBe('fail');
  });
});

describe('fixture 6,5 x 8,5 com mezanino', () => {
  const project = fixture();
  const results = computeAll(project, catalog);
  const s = results.structure!;
  const by = (id: string) => s.checks.find((c) => c.id === id)!;

  test('computeAll preenche structure, com aviso e tempo', () => {
    expect(s).not.toBeNull();
    expect(s.disclaimer).toBe(DISCLAIMER);
    expect(results.timingsMs.structure).toBeGreaterThanOrEqual(0);
  });

  test('todas as verificações aparecem', () => {
    const kinds = new Set(s.checks.map((c) => c.kind));
    for (const k of ['stud', 'joist', 'rafter', 'purlin', 'header', 'bracing', 'anchorage', 'soil'] as const) {
      expect(kinds.has(k), k).toBe(true);
    }
    expect(s.checks.filter((c) => c.kind === 'bracing').map((c) => c.id).sort()).toEqual(['bracing:x', 'bracing:y']);
    expect(s.checks.filter((c) => c.kind === 'stud').length).toBe(4);
  });

  test('cargas', () => {
    const l = s.loads;
    expect(l.windQKPa).toBeCloseTo(0.664, 3);
    expect(l.windWallKPa).toBeCloseTo(0.664 * 1.0, 3); // cpe 0,8 + |cpi| 0,2
    expect(l.windRoofUpliftKPa).toBeCloseTo(0.664 * 1.4, 2); // cpe 1,2 + cpi 0,2
    expect(l.liveRoofKPa).toBe(0.25);
    expect(l.liveFloorKPa).toBe(1.5);
    expect(l.deadRoofKPa).toBeGreaterThan(0.15);
    expect(l.deadRoofKPa).toBeLessThan(0.6);
    expect(l.deadFloorKPa).toBeGreaterThan(0.5);
    expect(l.deadFloorKPa).toBeLessThan(1.2);
  });

  test('vigas do mezanino de 6,5 m em Ue200x40x1.25 passam do limite e trazem sugestão', () => {
    const j = by('joist:slab-L1');
    expect(j.status).toBe('fail');
    expect(j.ratio).toBeGreaterThan(1);
    expect(j.pieceIds.length).toBeGreaterThan(5);
    expect(j.hostIds).toEqual(['slab-L1']);
    expect(j.suggestion?.text).toMatch(/Ue200x40x1\.25/);
    expect(j.suggestion?.profileId).toBe('Ue250x40x1.25');
    expect(j.suggestion?.deltaKg).toBeGreaterThan(0);
    expect(j.suggestion?.deltaCost).toBeGreaterThan(0);
    // conferência à mão: q de serviço = (g + 1,5) · 0,6; flecha 5qL⁴/(384EI)
    const g = s.loads.deadFloorKPa;
    const q = (g + 1.5) * 0.6;
    const p = getProfile(catalog, 'Ue200x40x1.25');
    const delta = (5 * (q / 100) * 650 ** 4) / (384 * 20000 * p.Ix);
    expect(j.ratio).toBeCloseTo(delta / (650 / 350), 2);
  });

  test('montantes sem mezanino ficam ok; os que recebem mezanino + telhado aparecem com taxa maior', () => {
    expect(by('stud:ext-front').status).toBe('ok');
    expect(by('stud:ext-back').status).toBe('ok');
    expect(by('stud:ext-left').ratio).toBeGreaterThan(by('stud:ext-front').ratio);
    expect(by('stud:ext-front').detail).toMatch(/Nc,Rd = \d+,\d+ kN \(χ = \d,\d+, λ0 = \d,\d+/);
  });

  test('contraventamento, ancoragem e solo ok', () => {
    expect(by('bracing:x').status).toBe('ok');
    expect(by('bracing:y').status).toBe('ok');
    expect(by('bracing:x').ratio).toBeCloseTo(0.3 / 0.5, 3); // 6,5 m de 13 m (parede dos fundos, sem aberturas)
    expect(by('anchorage').status).toBe('ok');
    expect(by('soil').status).toBe('ok');
    expect(by('soil').demand).toBeLessThan(project.design.soilBearingKPa);
  });

  test('todos os números são finitos e o resumo confere', () => {
    for (const c of s.checks) {
      for (const v of [c.demand, c.capacity, c.ratio]) expect(Number.isFinite(v), c.id).toBe(true);
      expect(c.detail).not.toMatch(/NaN|Infinity/);
      expect(c.status).toBe(statusOf(c.ratio, catalog.constants.usage));
      if (c.status === 'ok') expect(c.suggestion).toBeUndefined();
    }
    expect(s.summary.ok + s.summary.warn + s.summary.fail).toBe(s.checks.length);
    expect(s.summary.maxRatio).toBe(Math.max(...s.checks.map((c) => c.ratio)));
  });

  test('determinístico', () => {
    const again = computeAll(project, catalog).structure;
    expect(again).toEqual(s);
  });

  test('computeStructure < 20 ms', () => {
    const ctx = { project, model: results.model, pieces: results.pieces, weight: results.weight, catalog };
    computeStructure(ctx);
    const t0 = performance.now();
    computeStructure(ctx);
    expect(performance.now() - t0).toBeLessThan(20);
  });

  test('sem quantities, estima chumbadores pelo espaçamento do catálogo', () => {
    const r = computeStructure({ project, model: results.model, pieces: results.pieces, weight: results.weight, catalog });
    expect(r.checks.find((c) => c.id === 'anchorage')!.capacity).toBeGreaterThan(0);
  });
});

describe('variações', () => {
  test('viga mais robusta e espaçamento 0,4 baixam a taxa da viga', () => {
    const base = computeAll(fixture(), catalog).structure!.checks.find((c) => c.id === 'joist:slab-L1')!;
    const strong = computeAll(
      loadFixture('gable-6.5x8.5-mezzanine.json', (j) => {
        j.system.profiles.joist = 'Ue250x40x1.25';
        j.system.studSpacing = 0.4;
      }),
      catalog,
    ).structure!.checks.find((c) => c.id === 'joist:slab-L1')!;
    expect(strong.ratio).toBeLessThan(base.ratio);
  });

  test('ventos fortes aumentam a taxa de ancoragem; solo fraco reprova', () => {
    const a = computeAll(fixture(), catalog).structure!;
    const b = computeAll(loadFixture('gable-6.5x8.5-mezzanine.json', (j) => { j.design = { windV0: 50, terrainCategory: 1, soilBearingKPa: 30 }; }), catalog).structure!;
    const get = (r: typeof a, id: string) => r.checks.find((c) => c.id === id)!;
    expect(get(b, 'anchorage').ratio).toBeGreaterThan(get(a, 'anchorage').ratio);
    expect(get(b, 'soil').ratio).toBeCloseTo(get(a, 'soil').demand / 30, 6);
  });

  test('contraventamento por fitas usa as fitas das paredes', () => {
    const r = computeAll(loadFixture('gable-6.5x8.5-mezzanine.json', (j) => { j.system.bracing = 'strap'; }), catalog).structure!;
    const x = r.checks.find((c) => c.id === 'bracing:x')!;
    expect(x.pieceIds.length).toBeGreaterThan(0);
    expect(Number.isFinite(x.ratio)).toBe(true);
  });

  test('A-frame mínimo calcula sem NaN', () => {
    const r = computeAll(loadFixture('aframe-minimal.json'), catalog).structure!;
    expect(r.checks.length).toBeGreaterThan(0);
    for (const c of r.checks) expect(Number.isFinite(c.ratio), c.id).toBe(true);
  });
});
