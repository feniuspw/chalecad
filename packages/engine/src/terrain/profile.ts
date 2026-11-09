import { pointInPoly, type Vec2 } from '../geometry';
import type { TerrainReport } from '../schema/results';

/** Perfil do terreno acabado ao longo de uma linha (coordenadas do terreno: mesma referência de `platformZ`). */
export interface TerrainProfile {
  /** Polilinha (distância ao longo da linha, cota). Degraus de muro aparecem como dois pontos com o mesmo `s`. */
  points: [number, number][];
  /** Muros cortados pela linha. */
  walls: {
    wallId: string;
    s: number;
    side: 'cut' | 'fill';
    type: 'gabion' | 'concrete' | 'block';
    height: number;
    topZ: number;
    bottomZ: number;
    /** Lado do pad: -1 antes de `s` (no sentido da linha), +1 depois. */
    padSide: -1 | 1;
  }[];
}

interface MeshGrid {
  x0: number;
  y0: number;
  step: number;
  w: number;
  h: number;
}

const grids = new WeakMap<TerrainReport['mesh'], MeshGrid>();

function meshGrid(mesh: TerrainReport['mesh']): MeshGrid {
  let g = grids.get(mesh);
  if (g) return g;
  const p = mesh.positions;
  const x0 = p[0]!;
  const y0 = p[1]!;
  const step = p[3]! - x0;
  let w = 1;
  while (w < p.length / 3 && Math.abs(p[3 * w + 1]! - y0) < 1e-9) w++;
  g = { x0, y0, step, w, h: p.length / 3 / w };
  grids.set(mesh, g);
  return g;
}

/** Cota da malha em (x, y), bilinear; fora da malha usa o nó mais próximo. */
export function meshZ(mesh: TerrainReport['mesh'], x: number, y: number): number {
  const g = meshGrid(mesh);
  const fx = Math.max(0, Math.min(g.w - 1, (x - g.x0) / g.step));
  const fy = Math.max(0, Math.min(g.h - 1, (y - g.y0) / g.step));
  const i = Math.min(g.w - 2, Math.floor(fx));
  const j = Math.min(g.h - 2, Math.floor(fy));
  const tx = fx - i;
  const ty = fy - j;
  const z = (ii: number, jj: number) => mesh.positions[3 * (jj * g.w + ii) + 2]!;
  return (
    z(i, j) * (1 - tx) * (1 - ty) + z(i + 1, j) * tx * (1 - ty) + z(i, j + 1) * (1 - tx) * ty + z(i + 1, j + 1) * tx * ty
  );
}

/**
 * Perfil do terreno acabado (malha do motor) e dos muros de arrimo cortados pela linha a→b.
 * Os degraus de muro são verticais: a malha os suaviza numa faixa de uma célula, que é substituída aqui.
 */
export function terrainProfile(terrain: TerrainReport, a: Vec2, b: Vec2, step = 0.1): TerrainProfile {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ux = L > 0 ? (b[0] - a[0]) / L : 1;
  const uy = L > 0 ? (b[1] - a[1]) / L : 0;
  const cell = meshGrid(terrain.mesh).step;
  const at = (s: number): Vec2 => [a[0] + ux * s, a[1] + uy * s];

  const walls: TerrainProfile['walls'] = [];
  for (const w of terrain.walls) {
    const pad = terrain.pads.find((p) => p.id === w.padId);
    for (let k = 1; k < w.path.length; k++) {
      const p0 = w.path[k - 1]!;
      const p1 = w.path[k]!;
      const ex = p1[0] - p0[0];
      const ey = p1[1] - p0[1];
      const den = ux * ey - uy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const qx = p0[0] - a[0];
      const qy = p0[1] - a[1];
      const s = (qx * ey - qy * ex) / den;
      const t = (qx * uy - qy * ux) / den;
      if (t < -1e-9 || t > 1 + 1e-9 || s < 0 || s > L) continue;
      const height = w.heights[k - 1]! + (w.heights[k]! - w.heights[k - 1]!) * t;
      const topZ = w.topZ[k - 1]! + (w.topZ[k]! - w.topZ[k - 1]!) * t;
      const eps = 0.05;
      const before = at(Math.max(0, s - eps));
      const insideBefore = pad ? pointInPoly(before[0], before[1], pad.polygon) : false;
      walls.push({
        wallId: w.id,
        s,
        side: w.side,
        type: w.type,
        height,
        topZ,
        bottomZ: topZ - height,
        padSide: insideBefore ? -1 : 1,
      });
    }
  }
  walls.sort((p, q) => p.s - q.s);

  const n = Math.max(1, Math.ceil(L / step));
  const points: [number, number][] = [];
  const near = (s: number) => walls.some((w) => Math.abs(w.s - s) < cell * 0.75);
  let wi = 0;
  const emitWalls = (upTo: number) => {
    while (wi < walls.length && walls[wi]!.s <= upTo) {
      const w = walls[wi++]!;
      // Lado do pad: cota do pad (topo no aterro, base no corte); outro lado: terreno natural encostado.
      const padZ = w.side === 'cut' ? w.bottomZ : w.topZ;
      const outZ = w.side === 'cut' ? w.topZ : w.bottomZ;
      const first = w.padSide === -1 ? padZ : outZ;
      const second = w.padSide === -1 ? outZ : padZ;
      points.push([w.s, first], [w.s, second]);
    }
  };
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * L;
    emitWalls(s - 1e-9);
    if (near(s)) continue;
    const p = at(s);
    points.push([s, meshZ(terrain.mesh, p[0], p[1])]);
  }
  emitWalls(Infinity);
  return { points, walls };
}
