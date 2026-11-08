import { describe, expect, test } from 'vitest';
import { avgLux, gridPositions, luminairesNeeded, roomIndex, utilization } from '../../../src/installations/electrical/lighting';
import { testCatalog } from '../../helpers/catalog';
import { computeAll } from '../../../src/compute';
import { house } from './house';

const k = testCatalog.constants.electrical;
const room = (w: number, d: number, use = 'living', avg = 2.6) => ({ use, area: w * d, ceiling: { min: avg, avg, max: avg }, polygon: [[0, 0], [w, 0], [w, d], [0, d]] }) as never;

describe('luminotécnica', () => {
  test('índice do recinto K = c·l / (h·(c+l)) e Fu por interpolação', () => {
    expect(roomIndex(4, 5, 1.85)).toBeCloseTo(1.2012, 3);
    expect(utilization(1.0, k)).toBe(0.5);
    expect(utilization(1.125, k)).toBeCloseTo(0.53, 6);
    expect(utilization(0.1, k)).toBe(0.36); // abaixo da tabela vale a ponta
    expect(utilization(9, k)).toBe(0.8);
  });

  test('E = Φ·Fu·Fm/A', () => {
    expect(avgLux(7200, 0.55, 0.8, 20)).toBeCloseTo(158.4, 6);
  });

  test('número de luminárias para o alvo: sala 4 x 5 com 1.800 lm', () => {
    // K = 1,2; Fu ≈ 0,55; 150 lx x 20 m² / (1.800 x 0,548 x 0,8) = 3,8 → 4
    expect(luminairesNeeded(room(4, 5), 1800, k)).toBe(4);
    // cozinha pede 250 lx e plano a 0,90 m
    expect(luminairesNeeded(room(3, 4, 'kitchen'), 1600, k)).toBeGreaterThanOrEqual(3);
  });

  test('grade: Nx ≈ √(n·c/l), primeira luminária a metade do espaçamento da parede', () => {
    const poly: [number, number][] = [[0, 0], [4, 0], [4, 5], [0, 5]];
    const g = gridPositions(poly, 4, [2, 2.5]);
    expect(g).toHaveLength(4);
    expect(g.map((p) => p[0])).toEqual([1, 3, 1, 3]);
    expect(g.map((p) => p[1])).toEqual([1.25, 1.25, 3.75, 3.75]);
    expect(gridPositions(poly, 1, [2, 2.5])).toEqual([[2, 2.5]]);
  });

  test('cômodo em L descarta posições fora do polígono', () => {
    const L: [number, number][] = [[0, 0], [6, 0], [6, 2], [2, 2], [2, 6], [0, 6]];
    const g = gridPositions(L, 9, [1, 1]);
    expect(g.length).toBeLessThan(9);
    expect(g.length).toBeGreaterThan(0);
  });

  test('no projeto gerado, cada cômodo passa do mínimo e a densidade fica razoável (W/m²)', () => {
    const e = computeAll(house(), testCatalog).installations!.electrical!;
    for (const l of e.lighting) {
      expect(l.avgLux).toBeGreaterThanOrEqual(l.minLux);
      expect(l.watts / l.area).toBeLessThan(10);
      expect(l.lumens).toBeGreaterThan(0);
    }
  });
});
