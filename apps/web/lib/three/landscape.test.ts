// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { BuildingModel } from '@chalecad/engine';
import { distToRect } from './foliage';
import { autoExposure, buildGroundBuffers, buildPathStrip, clearRect, entryPath, groundHeight, houseRect, type TerrainShape } from './landscape';

const model = {
  bbox: { min: [0, 0, 0], max: [6, 8, 5] },
  extras: [{ id: 'deck', kind: 'deck', segments: [], posts: [], polygon: [[1, -2.2], [5.5, -2.2], [5.5, 0], [1, 0]] }],
  walls: [{ id: 'ext-front', kind: 'exterior', from: [0, 0], to: [6, 0], thickness: 0.2, exteriorSide: 'right' }],
  openings: [{ id: 'd1', hostId: 'ext-front', hostKind: 'wall', type: 'door', u0: 2.5, u1: 3.4, v0: 0, v1: 2.1, valid: true }],
} as unknown as BuildingModel;

describe('caminho da porta', () => {
  it('parte da porta de ext-front, sai para fora da casa e passa da folga', () => {
    const p = entryPath(model)!;
    expect(p).not.toBeNull();
    expect(p[0]![0]).toBeCloseTo(2.95, 1);
    expect(p[0]![1]).toBeLessThan(0.2); // junto à parede da frente
    expect(p[0]![1]).toBeGreaterThan(-0.2);
    // vai para -y (lado de fora) e termina fora da folga
    expect(p[p.length - 1]![1]).toBeLessThan(-8);
    expect(distToRect(clearRect(model), p[p.length - 1]![0], p[p.length - 1]![1])).toBeGreaterThan(4);
  });

  it('sem porta externa não há caminho', () => {
    expect(entryPath({ ...model, openings: [] })).toBeNull();
  });

  it('a folga inclui o deck', () => {
    expect(houseRect(model).minY).toBeCloseTo(-2.2);
    expect(clearRect(model).minY).toBeCloseTo(-6.2);
  });

  it('a faixa tem três colunas por ponto e some na ponta', () => {
    const line: [number, number][] = Array.from({ length: 20 }, (_, i) => [0, -i]);
    const s = buildPathStrip(line, 1.5, 0);
    expect(s.positions.length).toBe(20 * 3 * 3);
    expect(s.colors[(19 * 3 + 1) * 4 + 3]).toBeLessThan(0.05);
    expect(s.colors[(0 * 3 + 1) * 4 + 3]).toBe(1);
    expect(s.colors[(0 * 3) * 4 + 3]).toBeLessThan(0.2); // borda quase transparente
  });
});

describe('relevo do chão', () => {
  const shape: TerrainShape = { scenario: 'mountain', flatRadius: 40, seed: 7 };
  it('é plano em volta da casa e ondula longe dela', () => {
    for (const [x, z] of [[0, 0], [10, -12], [25, 25], [39, 0]] as const) expect(groundHeight(x, z, shape)).toBe(0);
    let max = 0;
    for (let a = 0; a < 6.28; a += 0.3) max = Math.max(max, Math.abs(groundHeight(Math.cos(a) * 250, Math.sin(a) * 250, shape)));
    expect(max).toBeGreaterThan(2);
  });

  it('sem cenário o chão é plano em toda parte', () => {
    expect(groundHeight(200, 100, { scenario: 'none', flatRadius: 40, seed: 1 })).toBe(0);
  });

  it('a malha polar tem vértices planos até o raio de folga', () => {
    const b = buildGroundBuffers(shape, [1, 1, 1], [1, 1, 1], 400, 20, 32);
    for (let i = 0; i < b.positions.length / 3; i++) {
      const x = b.positions[i * 3]!, y = b.positions[i * 3 + 1]!, z = b.positions[i * 3 + 2]!;
      if (Math.hypot(x, z) <= 40) expect(y).toBe(0);
    }
    expect(b.indices.length).toBe((32 + 19 * 32 * 2) * 3);
  });

  it('é determinístico', () => {
    expect(groundHeight(120, 80, shape)).toBe(groundHeight(120, 80, shape));
  });
});

describe('exposição pela hora', () => {
  it('menos ao meio-dia, mais ao entardecer', () => {
    expect(autoExposure(70)).toBeLessThan(autoExposure(30));
    expect(autoExposure(30)).toBeLessThan(autoExposure(5));
    expect(autoExposure(1)).toBeGreaterThan(autoExposure(60));
  });
  it('luzes acesas ao entardecer diminuem a exposição', () => {
    expect(autoExposure(2, true)).toBeLessThan(autoExposure(2, false));
    expect(autoExposure(60, true)).toBe(autoExposure(60, false));
  });
});
