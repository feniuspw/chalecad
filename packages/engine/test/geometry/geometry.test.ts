import { describe, expect, test } from 'vitest';
import {
  add2, add3, bbox2, bbox3, cross3, dot2, dot3, length2, length3, normalize3, normalizeZero,
  offsetPolygon, pointInPolygon, polygonArea, polylineLength, scale2, scale3, signedArea, sub2, sub3,
  type Vec2,
} from '../../src/geometry';

const sq: Vec2[] = [[0, 0], [4, 0], [4, 3], [0, 3]];

describe('geometria', () => {
  test('área (shoelace) e sinal', () => {
    expect(polygonArea(sq)).toBe(12);
    expect(signedArea(sq)).toBe(12);
    expect(signedArea([...sq].reverse())).toBe(-12);
    expect(polygonArea([[0, 0], [4, 0], [0, 3]])).toBe(6);
  });
  test('ponto em polígono (borda conta)', () => {
    expect(pointInPolygon([2, 1], sq)).toBe(true);
    expect(pointInPolygon([5, 1], sq)).toBe(false);
    expect(pointInPolygon([4, 1.5], sq)).toBe(true);
    expect(pointInPolygon([4.0000005, 1.5], sq)).toBe(true);
    expect(pointInPolygon([4.01, 1.5], sq)).toBe(false);
    const tri: Vec2[] = [[0, 0], [6, 0], [3, 6]];
    expect(pointInPolygon([0.5, 3], tri)).toBe(false);
    expect(pointInPolygon([3, 5], tri)).toBe(true);
  });
  test('bbox 2D e 3D', () => {
    expect(bbox2(sq)).toEqual({ min: [0, 0], max: [4, 3] });
    expect(bbox3([[1, 2, 3], [-1, 5, 0]])).toEqual({ min: [-1, 2, 0], max: [1, 5, 3] });
  });
  test('offset de retângulo, expandir e contrair, CCW e CW', () => {
    const o = offsetPolygon(sq, 0.5);
    expect(o).toEqual([[-0.5, -0.5], [4.5, -0.5], [4.5, 3.5], [-0.5, 3.5]]);
    expect(polygonArea(offsetPolygon(sq, -0.5))).toBeCloseTo(3 * 2, 9);
    expect(polygonArea(offsetPolygon([...sq].reverse(), 0.5))).toBeCloseTo(5 * 4, 9);
  });
  test('comprimentos', () => {
    expect(length2([0, 0], [3, 4])).toBe(5);
    expect(length2([3, 4])).toBe(5);
    expect(polylineLength([[0, 0], [3, 0], [3, 4]])).toBe(7);
    expect(polylineLength(sq, true)).toBe(14);
    expect(length3([2, 3, 6])).toBe(7);
  });
  test('vetores', () => {
    expect(add2([1, 2], [3, 4])).toEqual([4, 6]);
    expect(sub2([1, 2], [3, 4])).toEqual([-2, -2]);
    expect(scale2([1, 2], 2)).toEqual([2, 4]);
    expect(dot2([1, 2], [3, 4])).toBe(11);
    expect(add3([1, 2, 3], [1, 1, 1])).toEqual([2, 3, 4]);
    expect(sub3([1, 2, 3], [1, 1, 1])).toEqual([0, 1, 2]);
    expect(scale3([1, 2, 3], 2)).toEqual([2, 4, 6]);
    expect(dot3([1, 2, 3], [4, 5, 6])).toBe(32);
    expect(cross3([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1]);
    expect(normalize3([0, 3, 4])).toEqual([0, 0.6, 0.8]);
  });
  test('normalizeZero remove -0 recursivamente', () => {
    const r = normalizeZero({ a: -0, b: [[-0, 1]], c: { d: -0 } });
    expect(Object.is(r.a, 0)).toBe(true);
    expect(Object.is(r.b[0]![0], 0)).toBe(true);
    expect(Object.is(r.c.d, 0)).toBe(true);
  });
});
