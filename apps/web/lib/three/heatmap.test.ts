import { describe, expect, it } from 'vitest';
import type { StructuralCheck } from '@chalecad/engine';
import { buildHeatIndex, heatColor, heatLevel, HEAT, pieceHeat } from './heatmap';

const check = (id: string, ratio: number, pieceIds: string[], hostIds: string[]): StructuralCheck => ({
  id, kind: 'stud', label: id, pieceIds, hostIds, demand: ratio, capacity: 1, unit: 'kN', ratio, status: 'ok', detail: '',
});

describe('heatLevel', () => {
  it('limites: verde < 0,7, amarelo <= 1,0, vermelho > 1,0', () => {
    expect(heatLevel(0.69)).toBe('ok');
    expect(heatLevel(0.7)).toBe('warn');
    expect(heatLevel(1.0)).toBe('warn');
    expect(heatLevel(1.01)).toBe('fail');
    expect(heatLevel(undefined)).toBe('none');
    expect(heatLevel(NaN)).toBe('none');
    expect(heatColor(undefined)).toBe(HEAT.none);
  });
});

describe('buildHeatIndex / pieceHeat', () => {
  const idx = buildHeatIndex([check('a', 0.5, ['p1', 'p2'], ['w1']), check('b', 1.2, ['p2'], ['w2']), check('c', 0.9, [], ['w3'])]);
  it('mantém a maior taxa por peça', () => {
    expect(idx.pieceRatio.get('p2')).toBe(1.2);
    expect(idx.pieceCheck.get('p2')?.id).toBe('b');
  });
  it('peça sem verificação própria herda a do host; sem nada fica nula', () => {
    expect(pieceHeat({ id: 'p9', hostId: 'w3' }, idx)?.ratio).toBe(0.9);
    expect(pieceHeat({ id: 'p1', hostId: 'w3' }, idx)?.ratio).toBe(0.5);
    expect(pieceHeat({ id: 'p9', hostId: 'zz' }, idx)).toBeNull();
  });
  it('sem checks não quebra', () => {
    expect(buildHeatIndex(undefined).pieceRatio.size).toBe(0);
  });
});
