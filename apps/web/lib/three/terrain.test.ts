import { describe, expect, it } from 'vitest';
import { buildTerrainBuffers, plateauRect, terrainColor, TERRAIN_COLORS, terrainZOffset } from './terrain';

describe('terreno', () => {
  it('cor por corte/aterro', () => {
    expect(terrainColor(0)).toEqual([...TERRAIN_COLORS.grass]);
    const cut = terrainColor(3);
    expect(cut[0]).toBeCloseTo(TERRAIN_COLORS.earth[0]);
    const fill = terrainColor(-3);
    expect(fill[0]).toBeCloseTo(TERRAIN_COLORS.sand[0]);
    const half = terrainColor(0.5)[0];
    expect(half).toBeGreaterThan(TERRAIN_COLORS.grass[0]);
    expect(half).toBeLessThan(TERRAIN_COLORS.earth[0]);
  });
  it('buffers com cor, uv e índices', () => {
    const b = buildTerrainBuffers({ positions: [0, 0, 0, 1, 0, 0.5, 0, 1, 0], indices: [0, 1, 2], cut: [0, 2, -2] });
    expect(b.positions).toHaveLength(9);
    expect(b.colors).toHaveLength(9);
    expect(b.uvs).toHaveLength(6);
    expect(Array.from(b.indices)).toEqual([0, 1, 2]);
    expect(b.colors[3]).not.toBe(b.colors[6]);
  });
  it('platô em z = 0 (menos 3 cm sob o radier)', () => {
    expect(terrainZOffset(1.2)).toBeCloseTo(-1.23);
    expect(terrainZOffset(0)).toBeCloseTo(-0.03);
  });
  it('retângulo do platô usa as folgas por lado', () => {
    expect(plateauRect({ min: [0, 0], max: [6, 8] }, { front: 3, back: 1.5, left: 1.5, right: 1.5 })).toEqual([[-1.5, -3], [7.5, -3], [7.5, 9.5], [-1.5, 9.5]]);
  });
});
