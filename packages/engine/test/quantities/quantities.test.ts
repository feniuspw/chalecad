import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { findPriceItem, getPriceBook } from '@chalecad/catalog';
import { buildModel } from '../../src/model';
import { loadProject } from '../../src/load';
import { computeQuantities } from '../../src/quantities';
import { computeWeight } from '../../src/weight';
import type { Project } from '../../src/schema';
import { testCatalog } from '../helpers/catalog';
import { syntheticPieces } from '../helpers/pieces';

const dir = join(import.meta.dirname, '../../fixtures');
const load = (f: string): Project => {
  const r = loadProject(JSON.parse(readFileSync(join(dir, f), 'utf8')));
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.project;
};

const project = load('gable-6.5x8.5-mezzanine.json');
const model = buildModel(project, testCatalog);
const pieces = syntheticPieces(model, project);
const q = computeQuantities(model, pieces, project, testCatalog);
const line = (itemId: string, stage?: string) => q.lines.find((l) => l.itemId === itemId && (!stage || l.stage === stage))!;

describe('computeQuantities: fixture 6,5 x 8,5', () => {
  test('linhas em todas as etapas esperadas', () => {
    const stages = new Set(q.lines.map((l) => l.stage));
    for (const s of ['foundation', 'structure', 'closure', 'roof', 'floor', 'finishing']) expect(stages.has(s as never)).toBe(true);
  });

  test('sem negativos/NaN e preços existem no price book', () => {
    const book = getPriceBook(testCatalog, 'default-2026-11');
    for (const l of q.lines) {
      for (const v of [l.purchaseQty, l.netQty, l.wastePct, l.weightKg]) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
      expect(findPriceItem(book, l.priceItemId), `${l.itemId} -> ${l.priceItemId}`).toBeDefined();
    }
    expect(new Set(q.lines.map((l) => l.id)).size).toBe(q.lines.length);
  });

  test('concreto do radier conferido à mão', () => {
    // Radier: polígono = footprint (6,5 + 0,1331 de espessura de parede) afastado 0,15 por lado.
    const t = model.walls[0]!.thickness;
    const side = (x: number) => x + t + 2 * 0.15;
    const A = side(6.5) * side(8.5);
    const P = 2 * (side(6.5) + side(8.5));
    const expected = A * 0.12 + P * 0.25 * (0.3 - 0.12);
    const c = line('concrete_fck25');
    expect(c.stage).toBe('foundation');
    expect(c.netQty).toBeCloseTo(expected, 6);
    expect(c.purchaseQty).toBeCloseTo(expected * 1.05, 6);
    expect(q.areas.radier).toBeCloseTo(A, 6);
    expect(line('edge_form').netQty).toBeCloseTo(P, 6);
    expect(line('gravel_1').netQty).toBeCloseTo(A * 0.05, 6);
    expect(line('mesh_q138').netQty).toBeCloseTo(A * 1.15, 6);
  });

  test('telha: 2 águas de uLength 9,1 → 10 telhas por água', () => {
    const l = line('sandwich_eps30');
    const v = model.roofPlanes[0]!.vLength;
    expect(model.roofPlanes[0]!.uLength).toBeCloseTo(9.1, 9);
    expect(l.note).toBe(`10 telhas de ${v.toFixed(2).replace('.', ',')} m; 10 telhas de ${v.toFixed(2).replace('.', ',')} m`);
    expect(l.purchaseQty).toBeCloseTo(2 * 10 * v, 9);
    expect(l.hostIds).toEqual(['roof-a', 'roof-b']);
  });

  test('cobertura: cumeeira, rufos, calhas e parafusos', () => {
    expect(line('ridge_cap').netQty).toBeCloseTo(9.1, 9);
    const v = model.roofPlanes[0]!.vLength;
    expect(line('flashing').netQty).toBeCloseTo(4 * v, 9);
    expect(line('flashing').purchaseQty).toBe(Math.ceil((4 * v * 1.1) / 3));
    expect(line('gutter').netQty).toBeCloseTo(2 * 9.1, 9);
    expect(line('screw_roof').netQty).toBeCloseTo(q.areas.roof * 4, 6);
  });

  test('estrutura: barras, emendas e fixações', () => {
    const track = q.lines.filter((l) => l.itemId === 'U90x40x0.95');
    expect(track.length).toBeGreaterThan(0);
    expect(track.some((l) => l.note)).toBe(true); // guia de 8,5 m emendada
    const plan = q.cutPlans.find((p) => p.profileId === 'U90x40x0.95')!;
    expect(plan.totalBars).toBe(track.reduce((s, l) => s + l.purchaseQty, 0));
    for (const l of q.lines.filter((x) => x.stage === 'structure' && x.unit.startsWith('barra'))) {
      expect(l.priceItemId).toMatch(/^bar-/);
    }
    const studs = pieces.filter((p) => ['stud', 'jack'].includes(p.role)).length;
    expect(line('screw_frame').netQty).toBeGreaterThanOrEqual(studs * 4);
    // 2 hold-downs por parede externa (4) + 2 por abertura > 1,5 m (as duas janelas de 1,5 m não passam)
    expect(line('hold_down').netQty).toBe(8);
    expect(line('anchor_bolt').netQty).toBeGreaterThan(20);
  });

  test('fechamentos, mezanino, aberturas e piso', () => {
    expect(line('osb_18', 'structure').hostIds).toEqual(['slab-L1']);
    expect(line('guardrail').netQty).toBeCloseTo(6.5, 6);
    expect(line('door_ext').netQty).toBe(1);
    expect(line('door_int').netQty).toBe(1);
    expect(line('window_alu').netQty).toBeCloseTo(1.8 * 2 + 1.2 * 2 + 0.36, 6);
    expect(line('floor_hardener').stage).toBe('floor');
    expect(line('stair_tread').netQty).toBe(15);
    // 21,5 m de corte de junta (1 linha em x, 2 em y)
    expect(line('joint_cut').netQty).toBeCloseTo(1 * 8.5 + 2 * 6.5, 9);
    expect(line('pvc_sewer_100').netQty).toBeGreaterThan(1);
  });

  test('áreas e índice de aço', () => {
    expect(q.areas.built).toBeCloseTo(6.5 * 8.5 + 6.5 * 3.5, 9);
    expect(q.areas.mezzanine).toBeCloseTo(22.75, 9);
    expect(q.areas.roof).toBeCloseTo(model.roofPlanes[0]!.area * 2, 9);
    expect(q.areas.exteriorWallsNet).toBeGreaterThan(0);
    expect(q.steelKg).toBeGreaterThan(0);
    expect(q.steelKgPerM2).toBeCloseTo(q.steelKg / q.areas.built, 9);
  });

  test('desempenho: quantitativos + peso < 40 ms', () => {
    computeWeight(model, pieces, q, project, testCatalog);
    const t0 = performance.now();
    const n = 20;
    for (let i = 0; i < n; i++) {
      const qq = computeQuantities(model, pieces, project, testCatalog);
      computeWeight(model, pieces, qq, project, testCatalog);
    }
    expect((performance.now() - t0) / n).toBeLessThan(40);
  });
});

describe('computeQuantities: a-frame', () => {
  const p = load('aframe-minimal.json');
  const m = buildModel(p, testCatalog);
  const r = computeQuantities(m, syntheticPieces(m, p), p, testCatalog);
  test('águas isWall recebem fechamento interno e empena envidraçada gera vidro', () => {
    expect(r.lines.find((l) => l.itemId === 'drywall_st_12')!.hostIds).toContain('roof-a');
    expect(r.lines.find((l) => l.itemId === 'glass_gable')!.hostIds).toContain('ext-front');
    for (const l of r.lines) expect(Number.isFinite(l.purchaseQty)).toBe(true);
  });
});
