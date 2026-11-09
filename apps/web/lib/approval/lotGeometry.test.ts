import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@chalecad/engine';
import { buildableRect, dashDotSegments, hatchLines, setbackBands, setbackDims, toLot, toProject } from './lotGeometry';

const footprint: Vec2[] = [[0, 0], [6, 0], [6, 8], [0, 8]];
const base = { front: 12, depth: 30 };
const val = (d: ReturnType<typeof setbackDims>, side: string) => d.find((x) => x.side === side)!.value;

describe('lote: recuos cotados', () => {
  it('rotação 0: distâncias às quatro divisas', () => {
    const d = setbackDims({ ...base, buildingOffset: [3, 5], rotationDeg: 0 }, footprint);
    expect(val(d, 'front')).toBeCloseTo(5);
    expect(val(d, 'left')).toBeCloseTo(3);
    expect(val(d, 'right')).toBeCloseTo(3);
    expect(val(d, 'back')).toBeCloseTo(17);
  });
  it('rotação 90°: a edificação gira (6 x 8 vira 8 x 6)', () => {
    // p(x, y) -> (-y, x) + offset: x de 2 a 10, y de 5 a 11
    const d = setbackDims({ ...base, buildingOffset: [10, 5], rotationDeg: 90 }, footprint);
    expect(val(d, 'left')).toBeCloseTo(2);
    expect(val(d, 'right')).toBeCloseTo(2);
    expect(val(d, 'front')).toBeCloseTo(5);
    expect(val(d, 'back')).toBeCloseTo(19);
  });
  it('recuo negativo quando passa da divisa', () => {
    const d = setbackDims({ ...base, buildingOffset: [-1, 5], rotationDeg: 0 }, footprint);
    expect(val(d, 'left')).toBeCloseTo(-1);
  });
  it('lote poligonal: menor distância às arestas de cada lado', () => {
    const polygon: Vec2[] = [[0, 0], [12, 0], [12, 30], [0, 30]];
    const d = setbackDims({ ...base, polygon, buildingOffset: [3, 5], rotationDeg: 0 }, footprint);
    expect(val(d, 'front')).toBeCloseTo(5);
    expect(val(d, 'left')).toBeCloseTo(3);
    expect(val(d, 'back')).toBeCloseTo(17);
  });
  it('toLot e toProject são inversas', () => {
    const lot = { buildingOffset: [4, 7] as Vec2, rotationDeg: 37 };
    const p = toProject(lot, toLot(lot, [2.5, -1]));
    expect(p[0]).toBeCloseTo(2.5);
    expect(p[1]).toBeCloseTo(-1);
  });
});

describe('lote: faixas de recuo', () => {
  it('marca a invasão e ignora lado sem exigência', () => {
    const bands = setbackBands({ ...base, buildingOffset: [3, 2], rotationDeg: 0 }, { setbackFront: 4, setbackSide: 1.5 }, footprint);
    expect(bands.map((b) => b.side).sort()).toEqual(['front', 'left', 'right']);
    expect(bands.find((b) => b.side === 'front')).toMatchObject({ invaded: true, required: 4 });
    expect(bands.find((b) => b.side === 'left')?.invaded).toBe(false);
    expect(bands.find((b) => b.side === 'front')?.rect).toEqual([0, 0, 12, 4]);
  });
  it('retângulo edificável', () => {
    expect(buildableRect(base, { setbackFront: 5, setbackSide: 1.5, setbackBack: 3 })).toEqual([1.5, 5, 10.5, 27]);
    expect(buildableRect({ front: 3, depth: 30 }, { setbackSide: 2 })).toBeNull();
  });
  it('hachura e traço-ponto produzem segmentos dentro da área', () => {
    const h = hatchLines([0, 0, 12, 4], 1);
    expect(h.length).toBeGreaterThan(8);
    for (const [a, b] of h) for (const p of [a, b]) expect(p[0] >= -1e-9 && p[0] <= 12 + 1e-9 && p[1] >= -1e-9 && p[1] <= 4 + 1e-9).toBe(true);
    const dd = dashDotSegments([[0, 0], [12, 0], [12, 30], [0, 30]]);
    expect(dd.length).toBeGreaterThan(50);
  });
});
