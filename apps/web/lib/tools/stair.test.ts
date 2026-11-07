import { describe, expect, it } from 'vitest';
import { nextRotation, positionForCursor, stairFootprint } from './stair';

const C = { idealRiser: 0.18, going: 0.27, ladderGoing: 0.2 };

describe('stairFootprint', () => {
  it('reta: igual ao contorno do motor (0,8 x 3,51 m a partir de 0,2/0,6)', () => {
    const f = stairFootprint({ type: 'straight', position: [0.2, 0.6], rotationDeg: 0, width: 0.8, turnRight: true }, 2.8, C);
    expect(f[0]).toEqual([0.2, 0.6]);
    expect(f[1]![0]).toBeCloseTo(1.0);
    expect(f[2]![1]).toBeCloseTo(0.6 + 15 * 0.27);
  });
  it('gira 90 graus: sobe para +x', () => {
    const f = stairFootprint({ type: 'straight', position: [0, 0], rotationDeg: 90, width: 1, turnRight: true }, 1.8, C);
    expect(f[2]![0]).toBeCloseTo(9 * 0.27);
    expect(f[2]![1]).toBeCloseTo(-1, 6);
  });
  it('em L tem 6 vértices', () => {
    expect(stairFootprint({ type: 'l_shape', position: [0, 0], rotationDeg: 0, width: 0.8, turnRight: true }, 2.8, C)).toHaveLength(6);
  });
});

describe('cursor e rotação', () => {
  it('centraliza o pé no cursor', () => {
    expect(positionForCursor([2, 3], 0, 0.8)).toEqual([1.6, 3]);
  });
  it('gira em passos de 90', () => {
    expect(nextRotation(0)).toBe(90);
    expect(nextRotation(270)).toBe(0);
  });
});
