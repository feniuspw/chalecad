import { describe, expect, test } from 'vitest';
import { computeAll } from '../../src/compute';
import { buildEngineerPackage } from '../../src/reports';
import { testCatalog } from '../helpers/catalog';
import { mk } from '../helpers/inline';

const gable = { kind: 'gable_mezzanine', width: 6, depth: 8, wallHeight: 2.8, roofPitchDeg: 20 };
const run = (extra: Record<string, unknown> = {}, ty: object = gable) => computeAll(mk(ty, extra), testCatalog);
const perf = (extra: Record<string, unknown> = {}, ty: object = gable) => run(extra, ty).performance!;
const wallOf = (p: ReturnType<typeof perf>) => p.thermal.find((e) => e.kind === 'wall')!;
const roofOf = (p: ReturnType<typeof perf>) => p.thermal.find((e) => e.kind === 'roof')!;

describe('térmico', () => {
  test('parede LSF padrão: U e CT contra cálculo manual, com câmara de ar de 40 mm', () => {
    const w = wallOf(perf());
    // R = 0,01/0,35 + 0,0111/0,13 + 0,05/0,045 + 0,0125/0,25 + 0,16 (ar) + 0,13 + 0,04
    const R = 0.01 / 0.35 + 0.0111 / 0.13 + 0.05 / 0.045 + 0.0125 / 0.25 + 0.16 + 0.13 + 0.04;
    expect(Math.abs(w.U - 1 / R) / (1 / R)).toBeLessThan(0.02);
    // CT = Σ e ρ c
    const CT = 0.01 * 1300 * 0.84 + 0.0111 * 600 * 1.7 + 0.05 * 20 * 1.3 + 0.0125 * 750 * 0.84;
    expect(Math.abs(w.CT - CT) / CT).toBeLessThan(0.02);
    expect(w.label).toContain('seção corrente, sem ponte térmica');
  });

  test('sem câmara de ar quando o isolante enche a alma (wood 140 usa câmara; LSF 90 também: 40 mm)', () => {
    const lsf = wallOf(perf()).U;
    const wood = wallOf(
      perf({ system: { structure: 'wood', profiles: { wallStud: 'W38x140', wallTrack: 'W38x140', joist: 'W38x235', rafter: 'W38x184', purlin: 'W25x50' } } }),
    ).U;
    expect(wood).toBeCloseTo(lsf, 3); // ambos com câmara de ar: mesma R
  });

  test('zona 1 (PR) vs zona 8 (RJ): limites mudam; CT sem exigência na zona 8', () => {
    const pr = perf({ meta: { name: 't', region: 'PR' } });
    const rj = perf({ meta: { name: 't', region: 'RJ' } });
    expect(pr.zone).toBe(1);
    expect(pr.zoneSource).toBe('uf');
    expect(rj.zone).toBe(8);
    expect(wallOf(pr).limitU).toBe(2.5);
    expect(wallOf(rj).limitU).toBe(3.7);
    expect(wallOf(pr).limitCT).toBe(130);
    expect(wallOf(rj).limitCT).toBeNull();
    expect(wallOf(rj).okCT).toBe(true);
    expect(wallOf(pr).okCT).toBe(false);
  });

  test('zona do projeto vence a da UF', () => {
    const p = perf({ meta: { name: 't', region: 'PR' }, performance: { zone: 8 } });
    expect(p.zone).toBe(8);
    expect(p.zoneSource).toBe('project');
  });

  test('telha preta vs branca na zona 3: α muda o limite da cobertura', () => {
    const black = roofOf(perf({ finishes: { roofColor: 'black' } }));
    const white = roofOf(perf({ finishes: { roofColor: 'white' } }));
    expect(black.alpha).toBe(0.9);
    expect(white.alpha).toBe(0.25);
    expect(black.limitU).toBe(1.5);
    expect(white.limitU).toBe(2.3);
    // sanduíche EPS 30: R = 0,03/0,035 + 0,21 = 1,067, U ≈ 0,94
    expect(black.U).toBeCloseTo(1 / (0.03 / 0.035 + 0.21), 2);
    expect(black.okU).toBe(true);
  });

  test('forro soma câmara de ar e reduz U da cobertura', () => {
    const sem = roofOf(perf()).U;
    const com = roofOf(perf({ finishes: { interiorRoof: 'finish_ceiling_wood' } })).U;
    expect(com).toBeLessThan(sem);
  });

  test('alertas: CT baixa é info; U acima do limite é warn', () => {
    const r = run({ meta: { name: 't', region: 'PR' } });
    const ct = r.warnings.find((w) => w.code === 'thermal.wall_ct')!;
    expect(ct.severity).toBe('info');
    expect(ct.message).toContain('simulação');
    // fachada com tijolo aparente (α 0,65) na zona 3 mantém limite 2,5, e U ~0,6 passa: sem alerta de U
    expect(r.warnings.some((w) => w.code === 'thermal.wall_u')).toBe(false);
  });
});

describe('solar', () => {
  const four = { installations: { enabled: false, waterHeater: 'electric_shower', occupants: 4 }, performance: { solar: true } };

  test('SP, 4 moradores e chuveiro elétrico: 340 kWh/mês, kWp e módulos', () => {
    const s = perf(four).solar!;
    expect(s.monthlyKWh).toBe(4 * 55 + 4 * 30);
    const kWp = ((340 - 50) * 12) / (4.9 * 365 * 0.78);
    expect(s.kWp).toBeCloseTo(kWp, 2);
    expect(s.modules).toBe(Math.ceil((kWp * 1000) / 550));
    expect(s.areaM2).toBeCloseTo(s.modules * 2.58, 2);
    expect(s.cost).toBeCloseTo(s.modules * 550 * 3.0, 1);
    expect(s.costMax).toBeCloseTo(s.modules * 550 * 4.2, 1);
    expect(s.paybackYears).toBeGreaterThan(0);
  });

  test('sem chuveiro elétrico, o consumo cai', () => {
    const s = perf({ ...four, installations: { enabled: false, waterHeater: 'gas', occupants: 4 } }).solar!;
    expect(s.monthlyKWh).toBe(220);
  });

  test('água orientada ao norte no duas águas com cumeeira leste-oeste', () => {
    const ew = { kind: 'gable_mezzanine', width: 6, depth: 8, wallHeight: 2.8, roofPitchDeg: 20 };
    const proj = (north: number) => perf({ ...four, roof: { cladding: 'sandwich_eps30', ridgeAxis: 'width', gutters: true }, meta: { name: 't', northDeg: north } }, ew).solar!;
    expect(proj(180).roofPlaneId).toBe('roof-a'); // roof-a olha para -y; norte em -y
    expect(proj(0).roofPlaneId).toBe('roof-b');
  });

  test('não couber: fits falso e alerta solar.area (info)', () => {
    const r = run({ ...four, installations: { enabled: false, waterHeater: 'electric_shower', occupants: 20 } });
    expect(r.performance!.solar!.fits).toBe(false);
    const w = r.warnings.find((x) => x.code === 'solar.area')!;
    expect(w.severity).toBe('info');
  });

  test('item pv_system em Wp na etapa instalações, sem mão de obra % por cima (já vem instalado)', () => {
    const r = run(four);
    const line = r.quantities.lines.find((l) => l.itemId === 'pv_system')!;
    expect(line.unit).toBe('Wp');
    expect(line.purchaseQty).toBe(r.performance!.solar!.modules * 550);
    expect(line.stage).toBe('installations');
    const st = r.budget.byStage.find((s) => s.stage === 'installations')!;
    const pv = r.budget.lines.filter((l) => l.itemId === 'pv_system').reduce((s, l) => s + l.material, 0);
    const others = st.material - pv;
    // mão de obra = 90% do material sem o sistema fotovoltaico
    expect(st.labor).toBeCloseTo(others * 0.9, 0);
  });
});

describe('chuva', () => {
  const rain = { performance: { rainwater: true }, installations: { enabled: false, waterHeater: 'gas', occupants: 4 } };

  test('60 m² de telhado em SP: volume anual ≈ 60 × 1450 × 0,8 L (área em planta × mm × 0,8)', () => {
    const flat = { kind: 'flat_roof', width: 6, depth: 10, wallHeight: 2.8 };
    const r = perf(rain, flat).rain!;
    expect(r.roofAreaM2).toBeGreaterThan(55);
    expect(r.roofAreaM2).toBeGreaterThanOrEqual(60); // 6 x 10 m + beirais
    expect(r.annualLiters).toBeCloseTo(r.roofAreaM2 * 1450 * 0.8, -1);
    expect(r.annualLiters / (60 * 1450 * 0.8)).toBeGreaterThanOrEqual(1);
    expect(r.annualLiters / (60 * 1450 * 0.8)).toBeLessThan(1.35);
  });

  test('reservatório, demanda, cobertura e itens', () => {
    const res = run(rain);
    const r = res.performance!.rain!;
    expect(r.demandLitersYear).toBe(4 * 150 * 0.4 * 365);
    // 4 × 150 × 0,4 × 15 dias = 3.600 L, limitado por volume mensal captado, arredondado para o tamanho comercial
    const cap = r.annualLiters / 12;
    const need = Math.min(3600, cap);
    const sizes = [310, 500, 1000, 1500, 2000, 3000];
    expect(r.tankLiters).toBe(sizes.find((s) => s >= need) ?? 3000);
    expect(r.coverage).toBeCloseTo(Math.min(1, r.annualLiters / r.demandLitersYear), 3);
    const ids = res.quantities.lines.filter((l) => l.stage === 'installations').map((l) => l.itemId);
    expect(ids).toContain(`water_tank_${r.tankLiters}`);
    expect(ids).toContain('rain_filter');
    expect(ids).toContain('pump_small');
  });

  test('calhas: não duplica com roof.gutters; entra quando não há', () => {
    const withG = run(rain).quantities.lines.filter((l) => l.itemId === 'gutter');
    expect(withG).toHaveLength(1);
    const noG = run({ ...rain, roof: { cladding: 'sandwich_eps30', ridgeAxis: 'depth', gutters: false } }).quantities.lines.filter((l) => l.itemId === 'gutter');
    expect(noG).toHaveLength(1);
    const none = run({ roof: { cladding: 'sandwich_eps30', ridgeAxis: 'depth', gutters: false } }).quantities.lines.filter((l) => l.itemId === 'gutter');
    expect(none).toHaveLength(0);
  });
});

describe('sem flags', () => {
  test('solar e rain nulos, sem itens novos', () => {
    const r = run();
    expect(r.performance!.solar).toBeNull();
    expect(r.performance!.rain).toBeNull();
    const ids = r.quantities.lines.map((l) => l.itemId);
    for (const id of ['pv_system', 'rain_filter', 'pump_small']) expect(ids).not.toContain(id);
    expect(ids.some((id) => id.startsWith('water_tank_'))).toBe(false);
  });
});

describe('pacote do engenheiro', () => {
  test('zona, U, CT e pergunta de simulação', () => {
    const p = mk(gable, {});
    const res = computeAll(p, testCatalog);
    const pkg = buildEngineerPackage(p, res, testCatalog);
    expect(pkg.summary.thermal?.zone).toBe(3);
    expect(pkg.summary.thermal?.elements).toHaveLength(2);
    expect(pkg.openQuestions.some((q) => q.rule === 'thermal' && q.text.includes('Desempenho térmico: confirmar por simulação (CT baixa em sistema leve)?'))).toBe(true);
  });
});
