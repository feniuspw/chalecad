import { describe, expect, it } from 'vitest';
import { angleDeg, formatTyped, parseMeasure, pointAtLength, rectCorner } from './measureInput';

describe('parseMeasure', () => {
  it('aceita ponto e vírgula decimais', () => {
    expect(parseMeasure('3.5')).toEqual({ kind: 'length', length: 3.5 });
    expect(parseMeasure('3,5')).toEqual({ kind: 'length', length: 3.5 });
    expect(parseMeasure(' 3 ')).toEqual({ kind: 'length', length: 3 });
  });
  it('comprimento e ângulo', () => {
    expect(parseMeasure('3.5;90')).toEqual({ kind: 'length', length: 3.5, angleDeg: 90 });
    expect(parseMeasure('2,25;-45')).toEqual({ kind: 'length', length: 2.25, angleDeg: -45 });
  });
  it('retângulo', () => {
    expect(parseMeasure('3x4')).toEqual({ kind: 'size', width: 3, height: 4 });
    expect(parseMeasure('3,5X4.25')).toEqual({ kind: 'size', width: 3.5, height: 4.25 });
  });
  it('rejeita lixo', () => {
    for (const bad of ['', ' ', 'abc', '3x', 'x4', '0', '-2', '3;', '3;a', '1;2;3', '3x4x5', '3..5', '3,5,5']) expect(parseMeasure(bad), bad).toBeNull();
  });
});

describe('geometria da medida', () => {
  it('ponto na direção do cursor', () => {
    expect(pointAtLength([1, 1], 3, { toward: [10, 1] })).toEqual([4, 1]);
    expect(pointAtLength([1, 1], 2, { toward: [1, -5] })).toEqual([1, -1]);
  });
  it('ponto por ângulo absoluto, ignorando o cursor', () => {
    const p = pointAtLength([0, 0], 3.5, { angleDeg: 90, toward: [10, 0] });
    expect(p[0]).toBeCloseTo(0, 6);
    expect(p[1]).toBeCloseTo(3.5, 6);
  });
  it('sem direção usa +X', () => {
    expect(pointAtLength([0, 0], 2, {})).toEqual([2, 0]);
  });
  it('ângulo', () => {
    expect(angleDeg([0, 0], [0, 2])).toBe(90);
    expect(angleDeg([0, 0], [-1, 0])).toBe(180);
    expect(angleDeg([0, 0], [1, -1])).toBe(315);
  });
  it('canto do retângulo no quadrante do cursor', () => {
    expect(rectCorner([1, 1], 3, 4)).toEqual([4, 5]);
    expect(rectCorner([1, 1], 3, 4, [0, 0])).toEqual([-2, -3]);
  });
  it('formata', () => {
    expect(formatTyped('3.5;90')).toBe('3,5 ; 90');
    expect(formatTyped('3x4')).toBe('3 x 4');
  });
});
