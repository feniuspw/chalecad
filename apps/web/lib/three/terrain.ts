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

// ---------------------------------------------------------------------------
// Muros de arrimo do terreno (F18-T)
// ---------------------------------------------------------------------------

type WallInput = Pick<TerrainReport['walls'][number], 'path' | 'heights' | 'topZ' | 'type' | 'maxHeight'>;

/** Espessura do corpo do muro (m): bloco e concreto 20 cm; gabião 50 cm + 10 cm por metro de altura. */
export function wallThickness(type: WallInput['type'], maxHeight: number): number {
  return type === 'gabion' ? 0.5 + 0.1 * maxHeight : 0.2;
}

export interface Prism {
  positions: Float32Array;
  indices: Uint32Array;
}

/**
 * Corpo do muro como prismas por trecho, no referencial do motor (z para cima, coordenadas do terreno). O muro fica do
 * lado de fora da área (à direita do sentido anti-horário do contorno), com topo `topZ` e base `topZ - altura` em cada
 * vértice. `grow` alarga o corpo (coroamento) e `lift` o eleva.
 */
export function buildWallPrisms(w: WallInput, thickness: number, opts: { grow?: number; lift?: number; capHeight?: number } = {}): Prism {
  const grow = opts.grow ?? 0;
  const capH = opts.capHeight;
  const pos: number[] = [];
  const idx: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => {
    const i = pos.length / 3;
    pos.push(...a, ...b, ...c, ...d);
    idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  };
  for (let k = 1; k < w.path.length; k++) {
    const p0 = w.path[k - 1]!;
    const p1 = w.path[k]!;
    const dx = p1[0] - p0[0];
    const dy = p1[1] - p0[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const nx = dy / len;
    const ny = -dx / len;
    const t0 = -grow;
    const t1 = thickness + grow;
    const top0 = w.topZ[k - 1]! + (opts.lift ?? 0);
    const top1 = w.topZ[k]! + (opts.lift ?? 0);
    const bot0 = capH !== undefined ? top0 - capH : w.topZ[k - 1]! - w.heights[k - 1]! - 0.05;
    const bot1 = capH !== undefined ? top1 - capH : w.topZ[k]! - w.heights[k]! - 0.05;
    const P = (p: [number, number], t: number, z: number) => [p[0] + nx * t, p[1] + ny * t, z];
    // topo, face externa, face interna e tampas
    quad(P(p0, t0, top0), P(p1, t0, top1), P(p1, t1, top1), P(p0, t1, top0));
    quad(P(p0, t1, bot0), P(p1, t1, bot1), P(p1, t1, top1), P(p0, t1, top0));
    quad(P(p1, t0, bot1), P(p0, t0, bot0), P(p0, t0, top0), P(p1, t0, top1));
    if (k === 1) quad(P(p0, t0, bot0), P(p0, t1, bot0), P(p0, t1, top0), P(p0, t0, top0));
    if (k === w.path.length - 1) quad(P(p1, t1, bot1), P(p1, t0, bot1), P(p1, t0, top1), P(p1, t1, top1));
  }
  return { positions: Float32Array.from(pos), indices: Uint32Array.from(idx) };
}

/** Coroamento (capa) de muro de bloco e concreto: faixa de 6 cm, 4 cm mais larga de cada lado. Gabião não tem. */
export const wallCoping = (w: WallInput, thickness: number): Prism | null =>
  w.type === 'gabion' ? null : buildWallPrisms(w, thickness, { grow: 0.04, lift: 0.06, capHeight: 0.06 });

/** Cor do corpo do muro por tipo (mesmas do `ExtrasView`: bloco claro, concreto cinza, gabião pedra). */
export const WALL_COLORS = { block: '#d6d3d1', concrete: '#a8a29e', gabion: '#8f8878' } as const;

/**
 * Previsão do desenho das bordas de um pad a partir das paredes do motor: segmentos de contorno em muro (laranja)
 * com a altura de cada vértice. O restante do contorno é talude.
 */
export function padOutlinePoints(polygon: readonly [number, number][], z: number): [number, number, number][] {
  return [...polygon, polygon[0]!].map(([x, y]) => [x, y, z] as [number, number, number]);
}
