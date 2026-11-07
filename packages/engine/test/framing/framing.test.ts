import { describe, expect, test } from 'vitest';
import { buildModel } from '../../src/model';
import { generatePieces, framers } from '../../src/framing';
import type { Piece } from '../../src/schema';
import { testCatalog } from '../helpers/catalog';
import { loadFixture } from '../helpers/load';

const GABLE = 'gable-6.5x8.5-mezzanine.json';
const AFRAME = 'aframe-minimal.json';
const cos35 = Math.cos((35 * Math.PI) / 180);

const run = (file: string, mut?: (p: any) => void) => { // eslint-disable-line @typescript-eslint/no-explicit-any
  const project = loadFixture(file, mut);
  const model = buildModel(project, testCatalog);
  return { project, model, pieces: generatePieces(model, project, testCatalog) };
};
const count = (ps: Piece[], host: string, role: string) => ps.filter((p) => p.hostId === host && p.role === role).length;

describe('generatePieces: gable 6,5 x 8,5', () => {
  const { model, pieces } = run(GABLE);

  test('sanidade: > 300 peças (card pedia > 400, ver dúvidas), comprimentos válidos, perfis no catálogo, IDs únicos', () => {
    expect(pieces.length).toBeGreaterThan(300);
    const ids = new Set(testCatalog.profiles.map((p) => p.id));
    for (const p of pieces) {
      expect(Number.isFinite(p.length) && p.length > 0).toBe(true);
      expect(p.start.every(Number.isFinite) && p.end.every(Number.isFinite)).toBe(true);
      expect(ids.has(p.profileId)).toBe(true);
      expect(Math.hypot(...p.webNormal)).toBeCloseTo(1, 6);
    }
    expect(new Set(pieces.map((p) => p.id)).size).toBe(pieces.length);
  });

  test('ext-left (8,5 m, s = 0,6, janela 1,2 m em [2,3,2]): montantes conferidos à mão', () => {
    // Painéis: 8,5 > 6 -> 2 painéis, divisão em u = 4,25.
    // Modulação: 0; 0,6; ...; 8,4 = 15 posições, + fim (8,5) = 16, + divisão (4,25) = 17.
    // Janela remove a modulação em [2,0 - 0,06; 3,2 + 0,06]: 2,4 e 3,0 -> 15.
    // Montante duplo na divisão: +1 -> 16. Cantos (stud_corner): 2.
    expect(count(pieces, 'ext-left', 'stud')).toBe(16);
    expect(count(pieces, 'ext-left', 'stud_corner')).toBe(2);
    expect(count(pieces, 'ext-left', 'king')).toBe(2);
    expect(count(pieces, 'ext-left', 'jack')).toBe(2);
    expect(count(pieces, 'ext-left', 'header')).toBe(2);
    expect(count(pieces, 'ext-left', 'sill')).toBe(1);
    const header = pieces.find((p) => p.hostId === 'ext-left' && p.role === 'header')!;
    expect(header.length).toBeCloseTo(1.2 + 2 * testCatalog.constants.lsf.headerBearing, 9);
  });

  test('porta interrompe a guia inferior da ext-front', () => {
    const tb = pieces.filter((p) => p.hostId === 'ext-front' && p.role === 'track_bottom');
    expect(tb.length).toBeGreaterThanOrEqual(2);
    const total = tb.reduce((s, p) => s + p.length, 0);
    expect(total).toBeCloseTo(6.5 - 0.9, 6);
  });

  test('empena ext-front: montante em x = 3,25 chega à cumeeira', () => {
    const top = pieces
      .filter((p) => p.hostId === 'ext-front' && Math.abs(p.start[0] - 3.25) < 0.01 && Math.abs(p.end[0] - 3.25) < 0.01)
      .map((p) => Math.max(p.start[2], p.end[2]));
    expect(Math.max(...top)).toBeCloseTo(model.ridgeHeight, 1);
    expect(Math.abs(Math.max(...top) - model.ridgeHeight)).toBeLessThan(0.02);
  });

  test('mezanino: joists na direção x (vão 6,5)', () => {
    const joists = pieces.filter((p) => p.role === 'joist');
    // y de 5 a 8,5 (3,5 m): 5,0; 5,6; ...; 8,0 = 6 posições + borda 8,5 = 7.
    expect(joists).toHaveLength(7);
    for (const j of joists) {
      expect(j.length).toBeCloseTo(6.5, 6);
      expect(j.start[1]).toBeCloseTo(j.end[1], 9);
    }
    expect(pieces.filter((p) => p.role === 'rim')).toHaveLength(4);
    // vão 6,5 > 3 m: bloqueadores entre cada par de vigas
    expect(pieces.filter((p) => p.hostId === 'slab-L1' && p.role === 'blocking')).toHaveLength(6);
  });

  test('caibros: comprimento (3,25 + 0,6) / cos 35°', () => {
    const r = pieces.filter((p) => p.role === 'rafter');
    expect(r.length).toBeGreaterThan(20);
    for (const p of r) expect(Math.abs(p.length - (3.25 + 0.6) / cos35)).toBeLessThan(0.01);
    expect(pieces.filter((p) => p.role === 'ridge')).toHaveLength(1);
  });

  test('travessas só onde não há mezanino sob o par', () => {
    const ties = pieces.filter((p) => p.role === 'collar_tie');
    expect(ties.length).toBeGreaterThan(0);
    for (const t of ties) expect(Math.min(t.start[1], t.end[1])).toBeLessThan(5);
  });

  test('terças: comprimento = uLength', () => {
    const pl = model.roofPlanes[0]!;
    const pur = pieces.filter((p) => p.hostId === pl.id && p.role === 'purlin');
    expect(pur).toHaveLength(5);
    for (const p of pur) expect(p.length).toBeCloseTo(pl.uLength, 6);
  });

  test('escada: 2 banzos com a hipotenusa do lance', () => {
    const st = pieces.filter((p) => p.role === 'stair_stringer');
    expect(st).toHaveLength(2);
    const rs = model.stairs[0]!;
    const hyp = Math.hypot((rs.steps - 1) * rs.going, rs.steps * rs.riser);
    expect(st[0]!.length).toBeCloseTo(hyp, 6);
  });

  test('massa de aço por área construída entre 15 e 35 kg/m²', () => {
    const kg = pieces.reduce((s, p) => s + p.length * testCatalog.profiles.find((x) => x.id === p.profileId)!.massPerM, 0);
    const idx = kg / model.builtArea;
    console.info(`aço do fixture: ${kg.toFixed(1)} kg, ${idx.toFixed(2)} kg/m² (${pieces.length} peças)`);
    expect(idx).toBeGreaterThan(15);
    expect(idx).toBeLessThan(35);
  });

  test('determinístico e rápido (< 30 ms em média)', () => {
    const project = loadFixture(GABLE);
    const a = generatePieces(model, project, testCatalog);
    expect(generatePieces(model, project, testCatalog)).toEqual(a);
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) generatePieces(model, project, testCatalog);
    const avg = (performance.now() - t0) / 20;
    console.info(`generatePieces: ${avg.toFixed(2)} ms`);
    expect(avg).toBeLessThan(30);
  });
});

describe('generatePieces: variações', () => {
  test('bracing strap gera fitas em X; osb só a horizontal', () => {
    const strap = run(GABLE, (p) => (p.system.bracing = 'strap')).pieces.filter((p) => p.role === 'strap');
    const osb = run(GABLE).pieces.filter((p) => p.role === 'strap');
    expect(strap.length).toBeGreaterThan(osb.length);
    // fitas inclinadas existem só com strap
    const diag = (p: Piece) => Math.abs(p.end[2] - p.start[2]) > 0.1;
    expect(strap.some(diag)).toBe(true);
    expect(osb.some(diag)).toBe(false);
    expect(osb.length).toBeGreaterThan(0);
  });

  test('studSpacing 0,4 gera mais montantes que 0,6', () => {
    const n = (s: number) => run(GABLE, (p) => (p.system.studSpacing = s)).pieces.filter((p) => p.role === 'stud').length;
    expect(n(0.4)).toBeGreaterThan(n(0.6));
  });

  test('A-frame: caibros chegam a z = 0 em x = 0 e x = w', () => {
    const { pieces } = run(AFRAME);
    const r = pieces.filter((p) => p.role === 'rafter');
    expect(r.length).toBeGreaterThan(0);
    const xs = (p: Piece) => (p.start[2] < p.end[2] ? p.start : p.end);
    expect(r.some((p) => Math.abs(xs(p)[0]) < 1e-6 && Math.abs(xs(p)[2]) < 1e-6)).toBe(true);
    expect(r.some((p) => Math.abs(xs(p)[0] - 6) < 1e-6 && Math.abs(xs(p)[2]) < 1e-6)).toBe(true);
    for (const p of pieces) expect(p.length).toBeGreaterThan(0);
    expect(pieces.filter((p) => p.role === 'collar_tie').length).toBeGreaterThan(0);
  });

  test('empena envidraçada: só guias e montantes a cada 1,2 m', () => {
    const { pieces } = run(AFRAME);
    const roles = new Set(pieces.filter((p) => p.hostId === 'ext-front').map((p) => p.role));
    expect([...roles].every((r) => ['track_bottom', 'track_top', 'stud'].includes(r))).toBe(true);
  });

  test('tipologia sem framer: sem peças de cobertura e sem erro', () => {
    expect(framers.shed).toBeUndefined();
    const { project, model } = run(GABLE);
    const fake = { ...model, typology: 'shed' as const };
    const out = generatePieces(fake, project, testCatalog);
    expect(out.some((p) => p.role === 'rafter')).toBe(false);
  });
});
