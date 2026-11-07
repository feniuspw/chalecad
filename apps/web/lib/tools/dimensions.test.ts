import { describe, expect, it } from 'vitest';
import type { HostWall, ResolvedOpening } from '@chalecad/engine';
import { dimGeometry, formatMeters, solidIntervals, wallDimensions } from './dimensions';

const front: HostWall = {
  id: 'ext-front', kind: 'exterior', level: 'L0', from: [0, 0], to: [6, 0], baseZ: 0, length: 6,
  outline: [[0, 0], [6, 0], [6, 3], [0, 3]], thickness: 0.12, assemblyId: 'x', exteriorSide: 'right', loadBearing: true, wet: false,
};
const op = (id: string, u0: number, u1: number, v0 = 0, v1 = 2.1, valid = true): ResolvedOpening => ({ id, hostId: 'ext-front', hostKind: 'wall', type: 'door', u0, u1, v0, v1, valid });

describe('wallDimensions', () => {
  it('gera cota total e corrente do lado externo', () => {
    const d = wallDimensions([front], [op('a', 1, 2), op('b', 4, 5)], 'L0');
    const chain = d.filter((x) => x.kind === 'chain');
    expect(chain.map((x) => x.value)).toEqual([1, 1, 2, 1, 1]);
    expect(d.find((x) => x.kind === 'overall')?.label).toBe('6,00');
    expect(chain[0]!.normal).toEqual([0, -1]); // frente (y = 0) é voltada para -y
    const g = dimGeometry(chain[0]!);
    expect(g.p0[1]).toBeCloseTo(-0.55);
  });
  it('ignora paredes internas, outros níveis e vãos inválidos', () => {
    expect(wallDimensions([{ ...front, kind: 'interior', exteriorSide: null }], [], 'L0')).toHaveLength(0);
    expect(wallDimensions([front], [], 'L1')).toHaveLength(0);
    expect(wallDimensions([front], [op('a', 1, 2, 0, 2.1, false)], 'L0')).toHaveLength(1);
  });
  it('formata pt-BR', () => expect(formatMeters(1.5)).toBe('1,50'));
});

describe('solidIntervals', () => {
  it('abre vãos que cruzam a altura de corte (porta sim, janela alta não)', () => {
    const r = solidIntervals(6, [op('d', 1, 2), { u0: 3, u1: 4, v0: 1.6, v1: 2.2, valid: true }, { u0: 4.5, u1: 5, v0: 0.9, v1: 2.1, valid: true }], 1.2);
    expect(r).toEqual([[0, 1], [2, 4.5], [5, 6]]);
  });
});
