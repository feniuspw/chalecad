import { describe, expect, test } from 'vitest';
import { computeAll } from '../../src/compute';
import { buildModel } from '../../src/model';
import { computeTerrain } from '../../src/terrain';
import type { Project } from '../../src/schema';
import { testCatalog } from '../helpers/catalog';
import { mk } from '../helpers/inline';

const house = { kind: 'gable_mezzanine', width: 6.5, depth: 8.5, wallHeight: 2.8, roofPitchDeg: 35 };

type SiteOpts = Record<string, unknown>;
const site = (o: SiteOpts) => ({
  type: 'sloped',
  slopePct: 10,
  downhillAzimuthDeg: 0, // desce para +y
  platformMargin: { front: 0, back: 0, left: 0, right: 0 },
  platformElevation: 0,
  cutSlopeHV: 0.2,
  fillSlopeHV: 0.5,
  disposalDistanceKm: 10,
  ...o,
});

function footprintBox(p: Project) {
  const m = buildModel(p, testCatalog);
  const xs = m.footprint.map((v) => v[0]);
  const ys = m.footprint.map((v) => v[1]);
  return { W: Math.max(...xs) - Math.min(...xs), D: Math.max(...ys) - Math.min(...ys) };
}

/** Projeto com platô 10 x 12 m (margens ajustadas à pegada). */
function plat10x12(o: SiteOpts = {}): Project {
  const { W, D } = footprintBox(mk(house));
  const mx = (10 - W) / 2;
  const my = (12 - D) / 2;
  return mk(house, { site: site({ platformMargin: { front: my, back: my, left: mx, right: mx }, ...o }) });
}

const terrain = (p: Project) => computeTerrain(p, buildModel(p, testCatalog), testCatalog)!;

describe('terreno inclinado', () => {
  test('terreno plano: volumes 0 e machineDays 0', () => {
    const r = terrain(mk(house, { site: site({ slopePct: 0, platformElevation: 'auto' }) }));
    expect(r.report.cutVolume).toBe(0);
    expect(r.report.fillVolume).toBe(0);
    expect(r.report.machineDays).toBe(0);
    expect(r.report.truckLoads).toBe(0);
    expect(r.items).toEqual([]);
  });

  test('site flat: sem terreno', () => {
    const p = mk(house);
    expect(computeTerrain(p, buildModel(p, testCatalog), testCatalog)).toBeNull();
  });

  test('platô 10 x 12 a 10%, zp = 0: prisma (1/8)·L²·W·t + volumes dos taludes à mão (±3%)', () => {
    const { report } = terrain(plat10x12());
    const [L, W, t, g1, g2] = [12, 10, 0.1, 5, 2]; // g = 1/HV (corte, aterro)
    const prism = (L * L * W * t) / 8; // 18 m³
    const h0 = (t * L) / 2; // desnível no meio do platô, na borda a montante/jusante
    // Taludes na borda a montante/jusante: área da seção ½·r·h0, r = h0/(g - t); laterais: ∫ h²/(2g) dy, h = t·y, y ∈ [0, L/2]
    const wedge = (g: number) => W * 0.5 * (h0 / (g - t)) * h0 + 2 * ((t * t * (L / 2) ** 3) / 3 / (2 * g));
    const cut = prism + wedge(g1);
    const fill = prism + wedge(g2);
    expect(report.cutVolume).toBeGreaterThan(cut * 0.97);
    expect(report.cutVolume).toBeLessThan(cut * 1.03);
    expect(report.fillVolume).toBeGreaterThan(fill * 0.97);
    expect(report.fillVolume).toBeLessThan(fill * 1.03);
    expect(report.platformZ).toBe(0);
    expect(report.machineDays).toBe(1);
  });

  test('auto compensa: com swell = compaction = 1, corte = aterro (±2%)', () => {
    const p = plat10x12({ platformElevation: 'auto', cutSlopeHV: 1, fillSlopeHV: 1.5, slopePct: 25 });
    const cat = { ...testCatalog, constants: { ...testCatalog.constants, terrain: { ...testCatalog.constants.terrain, swellFactor: 1, compactionFactor: 1 } } };
    const r = computeTerrain(p, buildModel(p, cat), cat)!.report;
    expect(r.cutVolume).toBeGreaterThan(1);
    expect(Math.abs(r.cutVolume - r.fillVolume) / r.cutVolume).toBeLessThan(0.02);
    expect(r.exportVolume).toBeLessThan(r.cutVolume * 0.02);
    expect(r.importVolume).toBeLessThan(r.cutVolume * 0.02);
  });

  test('auto com fatores reais: corte·swell·compaction = aterro', () => {
    const p = plat10x12({ platformElevation: 'auto', cutSlopeHV: 1, fillSlopeHV: 1.5, slopePct: 25 });
    const r = terrain(p).report;
    const k = testCatalog.constants.terrain.swellFactor * testCatalog.constants.terrain.compactionFactor;
    expect(Math.abs(r.cutVolume * k - r.fillVolume) / r.fillVolume).toBeLessThan(0.02);
  });

  test('exportação positiva com zp fixado abaixo do natural; importação com zp acima', () => {
    const down = terrain(plat10x12({ platformElevation: -1 })).report;
    expect(down.exportVolume).toBeGreaterThan(0);
    expect(down.importVolume).toBe(0);
    const swell = testCatalog.constants.terrain.swellFactor;
    const comp = testCatalog.constants.terrain.compactionFactor;
    expect(down.exportVolume).toBeCloseTo(down.cutVolume * swell - down.fillVolume / comp, 6);
    expect(down.truckLoads).toBe(Math.ceil(down.exportVolume / testCatalog.constants.terrain.truckM3 - 1e-9));
    const up = terrain(plat10x12({ platformElevation: 1 })).report;
    expect(up.importVolume).toBeGreaterThan(0);
    expect(up.exportVolume).toBe(0);
  });

  test('malha: (nx+1)(ny+1) vértices, índices válidos, cut = natural - final', () => {
    const { mesh } = terrain(plat10x12()).report;
    const V = mesh.positions.length / 3;
    const C = mesh.indices.length / 6; // = nx·ny
    // nx + ny = V - C - 1 ; nx·ny = C
    const s = V - C - 1;
    const disc = Math.sqrt(s * s - 4 * C);
    const nx = Math.round((s + disc) / 2);
    const ny = Math.round((s - disc) / 2);
    expect((nx + 1) * (ny + 1)).toBe(V);
    expect(nx * ny).toBe(C);
    expect(mesh.cut).toHaveLength(V);
    expect(mesh.indices.every((i) => Number.isInteger(i) && i >= 0 && i < V)).toBe(true);
    expect(Math.max(...mesh.cut)).toBeGreaterThan(0);
    expect(Math.min(...mesh.cut)).toBeLessThan(0);
  });

  test('geotêxtil e dreno só com corte de talude > 1,5 m; alertas', () => {
    const lo = terrain(plat10x12({ platformElevation: 0 }));
    expect(lo.items.find((i) => i.itemId === 'geotextile')).toBeUndefined();
    const steep = terrain(plat10x12({ platformElevation: -2, slopePct: 40, cutSlopeHV: 1 }));
    expect(steep.items.find((i) => i.itemId === 'geotextile')!.net).toBeGreaterThan(0);
    expect(steep.items.find((i) => i.itemId === 'drain_pipe')!.net).toBeGreaterThan(0);
    const codes = steep.warnings.map((w) => w.code);
    expect(codes).toEqual(expect.arrayContaining(['terrain.steep', 'terrain.cut_height']));
    const fill = terrain(plat10x12({ platformElevation: 3 }));
    expect(fill.warnings.map((w) => w.code)).toContain('terrain.fill_under');
  });

  test('caminhão: viagens equivalentes = cargas · (1 + km/20)', () => {
    const r = terrain(plat10x12({ platformElevation: -1, disposalDistanceKm: 20 }));
    const trip = r.items.find((i) => i.itemId === 'truck_trip')!;
    expect(trip.net).toBe(r.report.truckLoads * 2);
    expect(r.items.find((i) => i.itemId === 'excavator_day')!.net).toBe(r.report.machineDays);
  });

  test('computeAll: preenche terrain, linhas terrain, sem site.sloped, < 60 ms', () => {
    const p = plat10x12({ platformElevation: 'auto', cutSlopeHV: 1, fillSlopeHV: 1.5, slopePct: 20 });
    computeAll(p, testCatalog);
    const t0 = performance.now();
    const res = computeAll(p, testCatalog);
    expect(performance.now() - t0).toBeLessThan(300); // pipeline inteiro
    expect(res.timingsMs.terrain).toBeLessThan(60);
    expect(res.terrain).not.toBeNull();
    expect(res.quantities.lines.some((l) => l.stage === 'terrain' && l.itemId === 'excavator_day')).toBe(true);
    expect(res.warnings.map((w) => w.code)).not.toContain('site.sloped');
    expect(computeAll(mk(house), testCatalog).terrain).toBeNull();
  });
});

describe('arrimo', () => {
  const ret = (type: string, drainage = true) =>
    mk(house, {
      site: site({}),
      extras: [{ id: 'r1', kind: 'retaining', path: [[0, 0], [10, 0]], height: 2, type, drainage }],
    });
  const line = (p: Project, id: string) =>
    computeAll(p, testCatalog).quantities.lines.find((l) => l.stage === 'extras' && l.itemId === id);

  test('gabião: L·H·(0,5 + 0,1·H); geotêxtil e dreno com drenagem', () => {
    expect(line(ret('gabion'), 'gabion')!.netQty).toBeCloseTo(10 * 2 * 0.7, 9);
    expect(line(ret('gabion'), 'geotextile')!.netQty).toBeCloseTo(10 * 2.5, 9);
    expect(line(ret('gabion'), 'drain_pipe')!.netQty).toBeCloseTo(10, 9);
    expect(line(ret('gabion', false), 'drain_pipe')).toBeUndefined();
  });

  test('concreto: 10·2·0,2 + 10·0,18 = 5,8 m³, aço 80 kg/m³', () => {
    expect(line(ret('concrete'), 'concrete_fck25')!.netQty).toBeCloseTo(5.8, 9);
    expect(line(ret('concrete'), 'rebar_ca50')!.netQty).toBeCloseTo(5.8 * 80, 9);
  });

  test('bloco: estrutural com graute dobrado', () => {
    expect(line(ret('block'), 'block_structural')!.netQty).toBeCloseTo(20 * 12.5, 9);
    expect(line(ret('block'), 'grout')!.netQty).toBeCloseTo(20 * 0.01 * 2, 9);
  });

  test('alerta retaining.engineer e sem extras.ignored', () => {
    const codes = computeAll(ret('block'), testCatalog).warnings.map((w) => w.code);
    expect(codes).toContain('retaining.engineer');
    expect(codes).not.toContain('extras.ignored');
  });
});
