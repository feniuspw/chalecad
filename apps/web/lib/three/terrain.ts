/** Terreno: atributos de render a partir da malha do motor (z para cima, relativa ao natural no centro). */
import type { TerrainReport } from '@chalecad/engine';

export const TERRAIN_COLORS = {
  grass: [0.43, 0.6, 0.31],
  earth: [0.55, 0.4, 0.27],
  sand: [0.84, 0.75, 0.54],
} as const;

type RGB = readonly [number, number, number];
const mix = (a: RGB, b: RGB, t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * Cor por vértice: corte (`cut` > 0) em tom terra, aterro (`cut` < 0) em tom areia, neutro verde.
 * A transição é suave até `full` metros de corte/aterro.
 */
export function terrainColor(cut: number, full = 1.5): [number, number, number] {
  const dead = 0.03;
  if (Math.abs(cut) <= dead) return [...TERRAIN_COLORS.grass];
  const t = Math.min(1, (Math.abs(cut) - dead) / full);
  return mix(TERRAIN_COLORS.grass, cut > 0 ? TERRAIN_COLORS.earth : TERRAIN_COLORS.sand, Math.min(1, 0.25 + t * 0.75));
}

export interface TerrainBuffers {
  positions: Float32Array;
  indices: Uint32Array;
  colors: Float32Array;
  uvs: Float32Array;
}

export function buildTerrainBuffers(mesh: TerrainReport['mesh'], uvScale = 0.25): TerrainBuffers {
  const n = mesh.positions.length / 3;
  const positions = Float32Array.from(mesh.positions);
  const colors = new Float32Array(n * 3);
  const uvs = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const c = terrainColor(mesh.cut[i] ?? 0);
    colors[i * 3] = c[0];
    colors[i * 3 + 1] = c[1];
    colors[i * 3 + 2] = c[2];
    uvs[i * 2] = positions[i * 3]! * uvScale;
    uvs[i * 2 + 1] = positions[i * 3 + 1]! * uvScale;
  }
  return { positions, indices: Uint32Array.from(mesh.indices), colors, uvs };
}

/** Deslocamento em z (motor) do grupo do terreno: o platô fica em z = 0, 3 cm abaixo do topo do radier. */
export const terrainZOffset = (platformZ: number) => -platformZ - 0.03;

/** Retângulo do platô (a partir do footprint e das folgas) para o contorno desenhado sobre a malha. */
export function plateauRect(
  bbox: { min: [number, number]; max: [number, number] },
  margin: { front: number; back: number; left: number; right: number },
): [number, number][] {
  const x0 = bbox.min[0] - margin.left;
  const x1 = bbox.max[0] + margin.right;
  const y0 = bbox.min[1] - margin.front;
  const y1 = bbox.max[1] + margin.back;
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}
