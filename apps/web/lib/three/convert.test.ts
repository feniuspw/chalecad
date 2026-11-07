import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BuildingModel, HostWall, ResolvedOpening } from '@chalecad/engine';
import {
  bboxToThree,
  freeSlabEdges,
  guardrailLayout,
  openingFits,
  openingPlacement,
  roofZAt,
  roofSlabParams,
  slabExtrusion,
  toThree,
  viewDirection,
  wallBasis,
  wallShapeParams,
} from './convert';

const model = JSON.parse(
  readFileSync(resolve(__dirname, '../../fixtures/model-gable.json'), 'utf8'),
) as BuildingModel;

const wall = (id: string) => model.walls.find((w) => w.id === id) as HostWall;

describe('toThree', () => {
  it('converte z-up em y-up: [x, z, -y]', () => {
    expect(toThree([1, 2, 3])).toEqual([1, 3, -2]);
  });
  it('bboxToThree recalcula min/max', () => {
    const b = bboxToThree({ min: [0, 0, 0], max: [2, 4, 6] });
    expect(b.min).toEqual([0, 0, -4]);
    expect(b.max).toEqual([2, 6, 0]);
    expect(b.center).toEqual([1, 3, -2]);
    expect(b.radius).toBeCloseTo(Math.hypot(2, 6, 4) / 2);
  });
});

describe('wallBasis', () => {
  it('é destro e u x v = w', () => {
    const b = wallBasis({ from: [0, 0], to: [6.5, 0], baseZ: 0 });
    expect(b.u).toEqual([1, 0, 0]);
    expect(b.v).toEqual([0, 0, 1]);
    // u x v para u=+x, v=+z é -y (direita de from→to)
    expect(b.w[0]).toBeCloseTo(0);
    expect(b.w[1]).toBeCloseTo(-1);
  });
  it('respeita from, to e baseZ', () => {
    const b = wallBasis({ from: [1, 1], to: [1, 5], baseZ: 2.8 });
    expect(b.origin).toEqual([1, 1, 2.8]);
    expect(b.u).toEqual([0, 1, 0]);
  });
});

describe('wallShapeParams', () => {
  it('gera um furo por abertura válida da parede', () => {
    const p = wallShapeParams(wall('ext-front'), model.openings);
    expect(p.holes).toHaveLength(3);
    expect(p.depth).toBe(0.14);
    expect(p.outline).toHaveLength(5);
  });
  it('ignora inválidas, de outro hospedeiro e que não cabem', () => {
    const w = wall('ext-front');
    const base: ResolvedOpening = {
      id: 'x', hostId: 'ext-front', hostKind: 'wall', type: 'window', u0: 1, u1: 2, v0: 1, v1: 2, valid: true,
    };
    const ops: ResolvedOpening[] = [
      { ...base, id: 'a', valid: false },
      { ...base, id: 'b', hostId: 'ext-back' },
      { ...base, id: 'c', u1: 9 },
      { ...base, id: 'd', hostKind: 'roof' },
      { ...base, id: 'e' },
    ];
    expect(wallShapeParams(w, ops).openings.map((o) => o.id)).toEqual(['e']);
  });
  it('rejeita vão fora da empena (acima do telhado)', () => {
    const w = wall('ext-front');
    expect(openingFits({ u0: 0.1, u1: 0.8, v0: 3.5, v1: 4.5 }, w.outline as [number, number][])).toBe(false);
    expect(openingFits({ u0: 3, u1: 3.5, v0: 3.5, v1: 4.5 }, w.outline as [number, number][])).toBe(true);
  });
});

describe('openingPlacement', () => {
  it('centro e tamanho', () => {
    expect(openingPlacement({ u0: 1, u1: 2, v0: 0, v1: 2.1 })).toEqual({ center: [1.5, 1.05], size: [1, 2.1] });
  });
});

describe('roofSlabParams', () => {
  it('normal aponta para fora e contorno local cobre uLength x vLength', () => {
    for (const plane of model.roofPlanes) {
      const p = roofSlabParams(plane);
      const us = p.outline.map((q) => q[0]);
      const vs = p.outline.map((q) => q[1]);
      expect(Math.max(...us) - Math.min(...us)).toBeCloseTo(plane.uLength, 2);
      expect(Math.max(...vs) - Math.min(...vs)).toBeCloseTo(plane.vLength, 2);
      // a normal externa tem componente z positiva (água inclinada para cima)
      expect(p.normal[2]).toBeGreaterThan(0);
      // e aponta para longe do centro da edificação
      const cx = (model.bbox.min[0] + model.bbox.max[0]) / 2;
      const side = plane.origin[0] < cx ? -1 : 1;
      expect(p.normal[0] * side).toBeGreaterThan(0);
    }
  });
});

describe('slabExtrusion', () => {
  it('radier é extrudado para baixo a partir do topo', () => {
    const radier = model.slabs.find((s) => s.kind === 'radier')!;
    const e = slabExtrusion(radier);
    expect(e.zBottom).toBeCloseTo(radier.topZ - radier.thickness);
    expect(e.depth).toBe(radier.thickness);
  });
});

describe('freeSlabEdges', () => {
  it('mezanino do chalé: só a borda voltada para o vão é livre', () => {
    const mezz = model.slabs.find((s) => s.kind === 'mezzanine')!;
    const free = freeSlabEdges(mezz, model.walls);
    expect(free).toHaveLength(1);
    const [a, b] = free[0]!;
    expect(a[1]).toBeCloseTo(5);
    expect(b[1]).toBeCloseTo(5);
  });
});

describe('guardrailLayout', () => {
  it('postes nos extremos e espaçamento <= spacing', () => {
    const g = guardrailLayout([0, 5], [6.5, 5], 1.2);
    expect(g.posts[0]).toEqual([0, 5]);
    expect(g.posts.at(-1)).toEqual([6.5, 5]);
    expect(g.posts).toHaveLength(7);
    expect(g.rail.length).toBeCloseTo(6.5);
    expect(g.rail.angle).toBeCloseTo(0);
  });
});

describe('viewDirection', () => {
  it('vista de topo aponta para +y da cena', () => {
    expect(viewDirection('top')[1]).toBeCloseTo(1);
  });
  it('frente olha o lado y mínimo do motor (+z na cena)', () => {
    expect(viewDirection('front')[2]).toBeGreaterThan(0.9);
  });
});

describe('roofZAt', () => {
  it('beiral, cumeeira e fora do telhado', () => {
    const tan35 = Math.tan((35 * Math.PI) / 180);
    expect(roofZAt(model.roofPlanes, 0, 2)).toBeCloseTo(2.8, 2); // sobre a parede lateral
    expect(roofZAt(model.roofPlanes, 3.25, 2)).toBeCloseTo(2.8 + 3.25 * tan35, 2); // cumeeira
    expect(roofZAt(model.roofPlanes, 6.5, 2)).toBeCloseTo(2.8, 2);
    expect(roofZAt(model.roofPlanes, 20, 2)).toBe(Infinity);
  });
});
