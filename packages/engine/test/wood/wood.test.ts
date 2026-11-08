import { describe, expect, test } from 'vitest';
import { getProfile } from '@chalecad/catalog';
import { computeAll, WOOD_PROFILES } from '../../src';
import { structuralCapacity as cap } from '../../src/structure';
import { suggest } from '../../src/structure/suggest';
import { buildEngineerPackage } from '../../src/reports';
import { testCatalog as catalog } from '../helpers/catalog';
import { loadFixture } from '../helpers/load';

const GABLE = 'gable-6.5x8.5-mezzanine.json';
const toWood = (j: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
  j.system = { ...(j.system ?? {}), structure: 'wood', profiles: { ...WOOD_PROFILES } };
};

const lsf = computeAll(loadFixture(GABLE), catalog);
const woodProject = loadFixture(GABLE, toWood);
const wood = computeAll(woodProject, catalog);
const w = catalog.constants.wood;

describe('wood frame: peças', () => {
  test('peças de madeira, guia superior dupla (2x o LSF), sem fita de aço fora as de contraventamento', () => {
    const woodIds = new Set(wood.pieces.filter((p) => getProfile(catalog, p.profileId).material === 'wood').map((p) => p.profileId));
    expect([...woodIds].every((id) => id.startsWith('W'))).toBe(true);
    const tops = (r: typeof wood, host: string) => r.pieces.filter((p) => p.hostId === host && p.role === 'track_top').length;
    expect(tops(wood, 'ext-left')).toBe(2 * tops(lsf, 'ext-left'));
    const bottoms = (r: typeof wood, host: string) => r.pieces.filter((p) => p.hostId === host && p.role === 'track_bottom').length;
    expect(bottoms(wood, 'ext-left')).toBe(bottoms(lsf, 'ext-left'));
    expect(wood.pieces.some((p) => p.role === 'purlin' && p.profileId === 'W25x50')).toBe(true);
  });

  test('verga: duas peças de altura lado a lado', () => {
    const h = wood.pieces.filter((p) => p.hostId === 'ext-left' && p.role === 'header');
    expect(h).toHaveLength(2);
    expect(h.every((p) => p.profileId === WOOD_PROFILES.wallStud)).toBe(true);
  });
});

describe('wood frame: quantitativos', () => {
  test('pregos no lugar de parafusos de estrutura; volume e peso', () => {
    const ids = wood.quantities.lines.map((l) => l.itemId);
    expect(ids).toContain('nail_wood');
    expect(ids).not.toContain('screw_frame');
    expect(ids).toContain('screw_board');
    expect(lsf.quantities.lines.map((l) => l.itemId)).not.toContain('nail_wood');
    const idx = wood.quantities.woodM3PerM2;
    expect(idx).toBeGreaterThanOrEqual(0.03);
    expect(idx).toBeLessThanOrEqual(0.2);
    expect(wood.quantities.woodM3PerM2).toBeCloseTo(wood.quantities.woodM3 / wood.model.builtArea, 9);
    // aço só das fitas
    expect(wood.quantities.steelKg).toBeLessThan(0.1 * lsf.quantities.steelKg);
    expect(lsf.quantities.woodM3).toBe(0);
    const woodKg = wood.pieces
      .filter((p) => getProfile(catalog, p.profileId).material === 'wood')
      .reduce((a, p) => a + p.length * getProfile(catalog, p.profileId).massPerM, 0);
    expect(woodKg).toBeCloseTo(wood.quantities.woodM3 * w.density, 0);
    expect(wood.weight.byStage.structure ?? 0).toBeGreaterThan(woodKg * 0.99);
  });

  test('pregos = m de madeira x kg/m + m² de OSB x kg/m² (com arredondamento para cima)', () => {
    const woodLen = wood.pieces.filter((p) => getProfile(catalog, p.profileId).material === 'wood').reduce((a, p) => a + p.length, 0);
    const nail = wood.quantities.lines.find((l) => l.itemId === 'nail_wood')!;
    expect(nail.netQty).toBeGreaterThanOrEqual(woodLen * w.nailKgPerM);
    expect(nail.netQty).toBeLessThan(woodLen * w.nailKgPerM + 400 * w.nailKgPerM2Board);
  });
});

describe('wood frame: NBR 7190', () => {
  test('verificações com nota NBR 7190 e taxas finitas', () => {
    const woodChecks = wood.structure!.checks.filter((c) => ['stud', 'gable_stud', 'joist', 'rafter', 'purlin', 'header'].includes(c.kind));
    expect(woodChecks.length).toBeGreaterThan(3);
    for (const c of woodChecks) {
      expect(c.detail).toContain('NBR 7190');
      expect(Number.isFinite(c.ratio)).toBe(true);
    }
    expect(lsf.structure!.checks.some((c) => c.detail.includes('NBR 7190'))).toBe(false);
  });

  test('montante 38 x 89 de 2,7 m: λ ≈ 105 e Nrd contra cálculo manual (2%)', () => {
    const p = getProfile(catalog, 'W38x89');
    const r = cap.woodCompression(p, 2.7, w);
    expect(r.lambda).toBeCloseTo(105.1, 0);
    // manual, em kN e cm: fc0d = 0,56·25/1,4 = 10 MPa = 1 kN/cm²; E0ef = 0,56·8500 = 4760 MPa = 476 kN/cm²
    const A = 3.8 * 8.9;
    const I = (3.8 * 8.9 ** 3) / 12;
    const W = I / 4.45;
    const L = 270;
    const f = 1;
    const Fe = (Math.PI ** 2 * 476 * I) / (L * L);
    const e = 8.9 / 30 + L / 300;
    // N/A + N·e·Fe/(Fe − N)/W = f, por bissecção
    let lo = 0;
    let hi = Fe * 0.999999;
    for (let i = 0; i < 200; i++) {
      const N = (lo + hi) / 2;
      const s = N / A + (N * e * Fe) / (Fe - N) / W;
      if (s > f) hi = N;
      else lo = N;
    }
    expect(Math.abs(r.NcRd - lo) / lo).toBeLessThan(0.02);
    expect(r.NcRd).toBeLessThan(A * f); // reduzida pela esbeltez
  });

  test('esbeltez: λ ≤ 40 sem redução e λ > 140 reprovado', () => {
    const p = getProfile(catalog, 'W38x89');
    expect(cap.woodCompression(p, 0.9, w).NcRd).toBeCloseTo(p.area * 1, 6);
    expect(cap.woodCompression(p, 4, w).NcRd).toBeLessThan(1e-6);
  });

  test('caibro 38 x 140 de 3 m: flexão, cisalhamento e flecha contra cálculo manual', () => {
    const p = getProfile(catalog, 'W38x140');
    const E0ef = cap.woodDesign(p, w).E0ef;
    expect(E0ef).toBeCloseTo(0.56 * 8500, 6);
    const r = cap.simpleBeam({ profile: p, L: 3, wUls: 2, wServ: 1, deflDen: 250, E: E0ef, factors: catalog.constants.structureFactors, wood: w });
    const Wx = (3.8 * 14 ** 2) / 6;
    const Ix = (3.8 * 14 ** 3) / 12;
    const Mrd = (Wx * 1) / 100; // fc0d = 1 kN/cm²
    expect(r.M).toBeCloseTo(2.25, 9);
    expect(r.Mrd / Mrd).toBeCloseTo(1, 6);
    const Vrd = (3.8 * 14 * 0.56 * 5 / 1.8 / 10) / 1.5;
    expect(r.Vrd / Vrd).toBeCloseTo(1, 6);
    const delta = (5 * 0.01 * 300 ** 4) / (384 * 476 * Ix);
    expect(r.delta / delta).toBeCloseTo(1, 6);
    expect(r.deltaLim).toBeCloseTo(300 / 250, 9);
  });

  test('sugestões em wood só usam a família Wood', () => {
    const p = getProfile(catalog, 'W38x89');
    const s = suggest(
      { pieces: [], profile: p, spacing: 0.6, ratioFn: (q, sp) => 1.4 * (p.Ix / q.Ix) * (sp / 0.6), currentRatio: 1.4, allowSpacing: true },
      woodProject,
      catalog,
    );
    expect(s?.profileId?.startsWith('W')).toBe(true);
    expect(s?.profileId).toBe('W38x140');
    for (const c of wood.structure!.checks) {
      if (c.suggestion?.profileId) expect(getProfile(catalog, c.suggestion.profileId).family).toBe('Wood');
    }
  });
});

describe('wood frame: alertas e pacote', () => {
  test('perfil de aço em wood: system.profile_mismatch citando o campo', () => {
    const r = computeAll(loadFixture(GABLE, (j) => { j.system = { ...(j.system ?? {}), structure: 'wood' }; }), catalog);
    const m = r.warnings.find((x) => x.code === 'system.profile_mismatch');
    expect(m?.severity).toBe('warn');
    expect(m?.message).toContain('system.profiles.wallStud');
    expect(wood.warnings.some((x) => x.code === 'system.profile_mismatch')).toBe(false);
  });

  test('madeira em lsf também avisa', () => {
    const r = computeAll(loadFixture(GABLE, (j) => { j.system = { ...(j.system ?? {}), profiles: { ...WOOD_PROFILES } }; }), catalog);
    expect(r.warnings.some((x) => x.code === 'system.profile_mismatch')).toBe(true);
  });

  test('wood: alerta de tratamento e sem índice de aço; lsf sem o de tratamento', () => {
    expect(wood.warnings.some((x) => x.code === 'wood.treatment' && x.severity === 'info')).toBe(true);
    expect(wood.warnings.some((x) => x.code === 'steel.index')).toBe(false);
    expect(lsf.warnings.some((x) => x.code === 'wood.treatment' || x.code === 'wood.index')).toBe(false);
  });

  test('pacote do engenheiro: premissas e perguntas de madeira', () => {
    const pkg = buildEngineerPackage(woodProject, wood, catalog);
    expect(pkg.summary.structure).toBe('Wood frame, pinus tratado C25, NBR 7190');
    const rules = pkg.openQuestions.map((q) => q.rule);
    expect(rules).toEqual(expect.arrayContaining(['wood-class', 'wood-joints', 'wood-anchorage']));
    const lsfPkg = buildEngineerPackage(loadFixture(GABLE), lsf, catalog);
    expect(lsfPkg.summary.structure).toBeUndefined();
    expect(lsfPkg.openQuestions.some((q) => q.rule.startsWith('wood-'))).toBe(false);
  });
});
