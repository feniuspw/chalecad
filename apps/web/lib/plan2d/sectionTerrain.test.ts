// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { getCatalog } from '@chalecad/catalog';
import { computeAll, meshZ } from '@chalecad/engine';
import { createProject } from '../project/templates';
import { makeSlopedSite } from '../project/terrain';
import { defaultSectionAt, sectionSvg, terrainProfile } from './section';

function setup() {
  const p = createProject('gable_mezzanine', { name: 'Corte' });
  p.site = makeSlopedSite({ slopePct: 30, downhillAzimuthDeg: 180, platformMargin: { front: 2, back: 8, left: 2, right: 2 } });
  const r = computeAll(p, getCatalog());
  return { p, r };
}

describe('corte 2D usa o perfil do motor', () => {
  const { p, r } = setup();
  const t = r.terrain!;
  const xs = r.model.footprint.map((v) => v[0]);
  const ys = r.model.footprint.map((v) => v[1]);
  const fpb = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  const cx = (fpb.x0 + fpb.x1) / 2;
  const point = (h: number): [number, number] => [cx, h]; // corte B: plano em x = cx, horizontal = y

  it('o perfil final bate com a malha do motor e traz o muro dos fundos', () => {
    const prof = terrainProfile(fpb, p.site, t.platformZ, point, fpb.y0 - 4, fpb.y1 + 12, t);
    expect(t.walls.length).toBeGreaterThan(0);
    expect(prof.walls!.length).toBeGreaterThan(0);
    for (const [h, z] of prof.final) {
      expect(Number.isFinite(h) && Number.isFinite(z)).toBe(true);
    }
    // longe de muros, o ponto do perfil é a cota da malha (relativa ao platô)
    const near = (h: number) => prof.walls!.some((w) => Math.abs(w.h - h) < 0.8);
    let checked = 0;
    for (const [h, z] of prof.final) {
      if (near(h)) continue;
      expect(z).toBeCloseTo(meshZ(t.mesh, cx, h) - t.platformZ, 6);
      checked++;
    }
    expect(checked).toBeGreaterThan(20);
    // degrau vertical: dois pontos com o mesmo h no muro
    const w = prof.walls![0]!;
    const step = prof.final.filter((q) => Math.abs(q[0] - w.h) < 1e-9);
    expect(step).toHaveLength(2);
    expect(Math.abs(step[0]![1] - step[1]![1])).toBeCloseTo(w.height, 6);
  });

  it('sem o relatório, mantém o perfil antigo (sem muros)', () => {
    const prof = terrainProfile(fpb, p.site, t.platformZ, point, fpb.y0, fpb.y1);
    expect(prof.walls).toBeUndefined();
    expect(prof.final).toHaveLength(81);
  });

  it('sectionSvg desenha o muro de arrimo cortado', () => {
    const at = defaultSectionAt(r.model, 'B');
    const doc = sectionSvg(r.model, 'B', at, { site: p.site, platformZ: t.platformZ, terrain: t });
    expect(doc.body).toContain('data-role="terrain-wall"');
    expect(doc.body).not.toMatch(/NaN/);
    const flat = sectionSvg(r.model, 'B', at, { site: p.site, platformZ: t.platformZ });
    expect(flat.body).not.toContain('data-role="terrain-wall"');
  });
});
