// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { getCatalog } from '@chalecad/catalog';
import { computeAll, type Project } from '@chalecad/engine';
import { createProject } from '../project/templates';
import { bboxToThree } from './convert';
import { distToRect } from './foliage';
import { buildGroundBuffers, groundHeight } from './landscape';
import { buildLandscapeData, getLandscapeData, placeOnSurface, SINK, type LandscapeOptions } from './landscapeData';
import { slopeHeight, slopeSurfaceFrom, surfaceY } from './slopedSite';
import { terrainZOffset } from './terrain';

function sloped(azimuth = 180, pct = 10) {
  const project = createProject('gable_mezzanine', { name: 'Terreno' });
  project.site = { type: 'sloped', slopePct: pct, downhillAzimuthDeg: azimuth, platformMargin: { front: 3, back: 1.5, left: 1.5, right: 1.5 }, platformElevation: 'auto', cutSlopeHV: 1, fillSlopeHV: 1.5, disposalDistanceKm: 10, pads: [], edges: 'auto', retaining: { type: 'auto', drainage: true } };
  const r = computeAll(project, getCatalog());
  return { project, model: r.model, terrain: r.terrain! };
}

function options(project: Project, model: ReturnType<typeof sloped>['model'], terrain: ReturnType<typeof sloped>['terrain'] | null, scenario: LandscapeOptions['scenario'] = 'field'): LandscapeOptions {
  const b = bboxToThree(model.bbox);
  return { model, terrain, site: project.site, projectName: project.meta.name, center: [b.center[0], b.center[2]], radius: b.radius, groundY: b.min[1], scenario, vegetation: true, quality: 'high' };
}

describe('terreno inclinado na apresentação', () => {
  const { project, model, terrain } = sloped();
  const slope = slopeSurfaceFrom(project.site, model.footprint, terrain)!;

  it('plano não tem superfície inclinada', () => {
    expect(slopeSurfaceFrom({ type: 'flat' }, model.footprint, terrain)).toBeNull();
    expect(slopeSurfaceFrom(project.site, model.footprint, null)).toBeNull();
  });

  it('a altura é a da malha do motor em todos os vértices (mesmo declive, platô, corte e aterro)', () => {
    const p = terrain.mesh.positions;
    let worst = 0;
    for (let i = 0; i < p.length; i += 3) worst = Math.max(worst, Math.abs(slopeHeight(slope, p[i]!, p[i + 1]!) - (p[i + 2]! + terrainZOffset(terrain.platformZ))));
    expect(worst).toBeLessThan(1e-9);
  });

  it('o platô fica 3 cm abaixo do piso e o terreno inclina 10% (desce para a frente)', () => {
    const [cx, cy] = slope.center;
    expect(slopeHeight(slope, cx, cy)).toBeCloseTo(-0.03, 6);
    // longe do platô, o declive natural: 10 m para baixo no sentido do declive (-y) cai 1 m
    const far = slopeHeight(slope, cx, slope.platform.minY - 20) - slopeHeight(slope, cx, slope.platform.minY - 30);
    expect(far).toBeCloseTo(1, 1);
  });

  it('é contínua na borda do lote e na do platô (sem degrau)', () => {
    const edges = [slope.meshRect, slope.platform];
    for (const r of edges) {
      for (let t = 0; t <= 1; t += 0.1) {
        const x = r.minX + (r.maxX - r.minX) * t;
        const y = r.minY + (r.maxY - r.minY) * t;
        for (const [ax, ay, bx, by] of [
          [x, r.minY - 0.01, x, r.minY + 0.01],
          [x, r.maxY - 0.01, x, r.maxY + 0.01],
          [r.minX - 0.01, y, r.minX + 0.01, y],
          [r.maxX - 0.01, y, r.maxX + 0.01, y],
        ] as const) {
          expect(Math.abs(slopeHeight(slope, ax, ay) - slopeHeight(slope, bx, by))).toBeLessThan(0.03);
        }
      }
    }
  });

  it('a inclinação se dissolve longe do lote, sem descontinuidade', () => {
    const [cx, cy] = slope.center;
    let prev = slopeHeight(slope, cx, cy - 20);
    for (let d = 21; d < 700; d++) {
      const h = slopeHeight(slope, cx, cy - d);
      expect(Math.abs(h - prev)).toBeLessThan(0.15);
      prev = h;
    }
    expect(Math.abs(slopeHeight(slope, cx, cy - 900))).toBeLessThan(0.05);
  });

  it('as árvores ficam a ±0,05 m da superfície', () => {
    const data = getLandscapeData(options(project, model, terrain));
    expect(data.placements.length).toBeGreaterThan(30);
    const groups = placeOnSurface(data.placements, data.surface);
    let n = 0;
    for (const g of groups) {
      for (const it of g.items) {
        n++;
        expect(Math.abs(it.y - surfaceY(data.surface, it.x, it.z))).toBeLessThanOrEqual(0.05);
        expect(surfaceY(data.surface, it.x, it.z) - it.y).toBeCloseTo(SINK, 6);
      }
    }
    expect(n).toBeGreaterThan(30);
    expect(groups.some((g) => g.sprite.startsWith('tree_'))).toBe(true);
  });

  it('nenhuma planta fica dentro do platô + 1 m, nem dos cortes e aterros, nem da casa', () => {
    for (const scenario of ['field', 'mountain', 'beach'] as const) {
      for (const [az, pct] of [[180, 10], [90, 25], [0, 40]] as const) {
        const s = sloped(az, pct);
        const sl = slopeSurfaceFrom(s.project.site, s.model.footprint, s.terrain)!;
        const data = buildLandscapeData(options(s.project, s.model, s.terrain, scenario));
        expect(data.placements.length).toBeGreaterThan(10);
        for (const p of data.placements) {
          expect(distToRect(sl.platform, p.x, p.y)).toBeGreaterThan(1);
          expect(distToRect(sl.lotRect, p.x, p.y)).toBeGreaterThan(1 - 1e-9);
          expect(distToRect({ minX: s.model.bbox.min[0], minY: s.model.bbox.min[1], maxX: s.model.bbox.max[0], maxY: s.model.bbox.max[1] }, p.x, p.y)).toBeGreaterThan(1);
        }
      }
    }
  });

  it('o chão da paisagem acompanha o declive e deixa um buraco sob a malha do lote', () => {
    const data = getLandscapeData(options(project, model, terrain, 'mountain'));
    const [cx, cz] = options(project, model, terrain).center;
    const m = data.slope!.meshRect;
    const inRect = (x: number, z: number) => cx + x >= m.minX && cx + x <= m.maxX && -(cz + z) >= m.minY && -(cz + z) <= m.maxY;
    const base = (x: number, z: number) => slopeHeight(data.slope!, cx + x, -(cz + z));
    const withHole = buildGroundBuffers(data.shape, [1, 1, 1], [1, 1, 1], 760, 44, 128, { base, hole: inRect });
    const full = buildGroundBuffers(data.shape, [1, 1, 1], [1, 1, 1], 760, 44, 128, { base });
    expect(withHole.indices.length).toBeLessThan(full.indices.length);
    // vértice a vértice, a altura é o declive mais o relevo (sem relevo dentro do lote)
    for (let i = 0; i < full.positions.length; i += 3 * 37) {
      const x = full.positions[i]!, z = full.positions[i + 2]!;
      expect(full.positions[i + 1]!).toBeCloseTo(groundHeight(x, z, data.shape) + base(x, z), 4);
    }
    // sem relevo no lote: a superfície combinada é só o declive
    expect(groundHeight(m.minX - cx + 1, -(m.minY + 1) - cz, data.shape)).toBe(0);
  });

  it('terreno plano mantém a altura de antes (cota do chão mais relevo)', () => {
    const flat = createProject('gable_mezzanine', { name: 'Plano' });
    const r = computeAll(flat, getCatalog());
    const d = buildLandscapeData({ ...options(flat, r.model, null), site: flat.site });
    expect(d.slope).toBeNull();
    expect(surfaceY(d.surface, 3, 4)).toBeCloseTo(d.surface.groundY + groundHeight(3 - d.surface.center[0], 4 - d.surface.center[1], d.shape), 9);
  });
});
