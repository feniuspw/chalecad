import { describe, expect, test } from 'vitest';
import { cutPlan, paginateSheets } from '../../src/quantities';

const mk = (ls: number[]) => ls.map((length, i) => ({ id: `c${i}`, length }));

describe('cutPlan', () => {
  test('caso clássico: [2.5, 2.5, 1, 4, 3] em barras de 6 → 3 barras', () => {
    const bars = cutPlan(mk([2.5, 2.5, 1, 4, 3]), [6], 0);
    expect(bars).toHaveLength(3);
    expect(bars.flatMap((b) => b.cuts).reduce((s, c) => s + c.length, 0)).toBeCloseTo(13, 9);
    expect(bars.reduce((s, b) => s + b.waste, 0)).toBeCloseTo(18 - 13, 9);
  });

  test('com barras [3, 6] a barra só com 2,5 vira de 3 m', () => {
    const bars = cutPlan(mk([2.5, 2.5, 1, 4, 3]), [3, 6], 0);
    expect(bars.map((b) => b.barLength).sort()).toEqual([3, 6, 6]);
    const small = bars.find((b) => b.barLength === 3)!;
    expect(small.cuts.map((c) => c.length)).toEqual([2.5]);
    expect(small.waste).toBeCloseTo(0.5, 9);
  });

  test('nenhum corte maior que a barra; peça longa é emendada', () => {
    const bars = cutPlan([{ id: 'long', length: 8.5 }, { id: 'a', length: 1 }], [3, 6], 0.003);
    for (const b of bars) {
      const used = b.cuts.reduce((s, c) => s + c.length, 0) + 0.003 * (b.cuts.length - 1);
      expect(used).toBeLessThanOrEqual(b.barLength + 1e-9);
      for (const c of b.cuts) expect(c.length).toBeLessThanOrEqual(b.barLength);
    }
    const segs = bars.flatMap((b) => b.cuts).filter((c) => c.pieceId.startsWith('long#'));
    expect(segs.length).toBe(2);
    expect(segs.reduce((s, c) => s + c.length, 0)).toBeCloseTo(8.5, 9);
  });

  test('kerf é contabilizado: 2 x 2,999 não cabe em 6 m com kerf de 3 mm', () => {
    expect(cutPlan(mk([2.999, 2.999]), [6], 0)).toHaveLength(1);
    expect(cutPlan(mk([2.999, 2.999]), [6], 0.003)).toHaveLength(2);
  });
});

describe('paginateSheets', () => {
  const wall = (l: number, h: number) => [[0, 0], [l, 0], [l, h], [0, h]] as [number, number][];

  test('parede 3 x 2,8 com placa 1,2 x 2,4: 3 colunas x 2 linhas = 6', () => {
    expect(paginateSheets(wall(3, 2.8), [], 1.2, 2.4)).toBe(6);
  });

  test('janela que contém uma placa inteira: 5', () => {
    expect(paginateSheets(wall(3, 2.8), [{ u0: 0, u1: 1.2, v0: 0, v1: 2.4 }], 1.2, 2.4)).toBe(5);
  });

  test('janela pequena não elimina placa', () => {
    expect(paginateSheets(wall(3, 2.8), [{ u0: 0.5, u1: 1, v0: 1, v1: 1.5 }], 1.2, 2.4)).toBe(6);
  });

  test('triângulo de empena não conta placas fora do contorno', () => {
    const tri: [number, number][] = [[0, 0], [2.4, 0], [1.2, 2.4]];
    // colunas 2, linhas 1: ambas intersectam
    expect(paginateSheets(tri, [], 1.2, 2.4)).toBe(2);
    const tall: [number, number][] = [[0, 0], [2.4, 0], [1.2, 3.6]];
    expect(paginateSheets(tall, [], 1.2, 2.4)).toBe(4);
  });
});
