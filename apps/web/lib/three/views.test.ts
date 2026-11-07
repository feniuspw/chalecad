import { describe, expect, it } from 'vitest';
import { EXPLODE_ORDER, explodeGap, layerOffset, orthoZoom, presetToCameraView, viewSpec } from './views';

describe('views', () => {
  it('só o 3D é perspectiva', () => {
    expect(viewSpec('3d').ortho).toBe(false);
    for (const v of ['plan', 'front', 'back', 'left', 'right'] as const) expect(viewSpec(v).ortho).toBe(true);
  });
  it('planta olha de cima; frente olha de +z da cena (y mínimo do motor)', () => {
    expect(viewSpec('plan').dir[1]).toBeCloseTo(1);
    expect(viewSpec('front').dir).toEqual([0, 0, 1]);
    expect(viewSpec('left').dir).toEqual([-1, 0, 0]);
  });
  it('presets do shell mapeiam para o store', () => {
    expect(presetToCameraView('top')).toBe('plan');
    expect(presetToCameraView('side')).toBe('left');
    expect(presetToCameraView('front')).toBe('front');
  });
  it('zoom ortográfico enquadra a maior dimensão', () => {
    const z = orthoZoom([8, 5, 10], 'plan', { width: 1000, height: 500 });
    expect(z).toBeCloseTo(500 / (10 * 1.35));
    expect(orthoZoom([8, 5, 10], 'front', { width: 1000, height: 500 })).toBeCloseTo(Math.min(1000 / (8 * 1.35), 500 / (5 * 1.35)));
  });
  it('camadas do explodido sobem em passos', () => {
    const g = explodeGap(5);
    expect(g).toBeCloseTo(2.75);
    expect(EXPLODE_ORDER.map((l) => layerOffset(l, g))).toEqual([0, g, 2 * g, 3 * g]);
    expect(explodeGap(20)).toBe(4);
  });
});
