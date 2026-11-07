import { describe, expect, it } from 'vitest';
import { clampPoint, insertVertex, moveEdge, moveVertex, nextLevelId, rectFromDrag, removeVertex } from './mezzanine';
import type { V2 } from './geom';

const rect: V2[] = [[0, 5], [6.5, 5], [6.5, 8.5], [0, 8.5]];

describe('mezanino', () => {
  it('move vértice sem mutar', () => {
    const r = moveVertex(rect, 1, [6, 4.5]);
    expect(r[1]).toEqual([6, 4.5]);
    expect(rect[1]).toEqual([6.5, 5]);
  });
  it('move aresta só na perpendicular', () => {
    const r = moveEdge(rect, 0, [3, -1]); // aresta de baixo (0,5)-(6.5,5); só a componente em y conta
    expect(r[0]![1]).toBeCloseTo(4);
    expect(r[1]![1]).toBeCloseTo(4);
    expect(r[0]![0]).toBeCloseTo(0);
    expect(r[1]![0]).toBeCloseTo(6.5);
    expect(r[2]).toEqual(rect[2]);
  });
  it('insere e remove vértice (mínimo 3)', () => {
    const r = insertVertex(rect, 0, [3, 5]);
    expect(r).toHaveLength(5);
    expect(r[1]).toEqual([3, 5]);
    expect(removeVertex(r, 1)).toHaveLength(4);
    expect(removeVertex([[0, 0], [1, 0], [0, 1]], 0)).toHaveLength(3);
  });
  it('retângulo por arraste, anti-horário, rejeita pequeno', () => {
    expect(rectFromDrag([4, 6], [1, 2])).toEqual([[1, 2], [4, 2], [4, 6], [1, 6]]);
    expect(rectFromDrag([0, 0], [0.4, 3])).toBeNull();
  });
  it('limita ao retângulo da edificação e gera id novo', () => {
    expect(clampPoint([9, -1], [0, 0], [6.5, 8.5])).toEqual([6.5, 0]);
    expect(nextLevelId(['L0'])).toBe('L1');
    expect(nextLevelId(['L0', 'L1'])).toBe('L2');
  });
});
