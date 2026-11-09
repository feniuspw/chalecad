/**
 * Grade automática de luminárias pelo método dos lúmens (NBR 5413/ISO 8995, pesquisa §5.2).
 * Mesmas fórmulas do motor: K = c·l / (h·(c+l)), Fu por interpolação, N = E·A / (Φ·Fu·Fm).
 * As constantes vêm do catálogo (`constants.electrical.lighting`).
 */
import type { Catalog } from '@chalecad/catalog';
import type { Vec2 } from '@chalecad/engine';

type ElecK = Catalog['constants']['electrical'];

export interface GridRoom {
  polygon: Vec2[];
  area: number;
  use: string;
  /** Pé-direito médio (m). */
  ceilingAvg: number;
}

const MAX_LIGHTS = 30;

const bbox = (poly: Vec2[]) => {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of poly) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { x0, y0, x1, y1 };
};

export function pointInPoly(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function utilization(K: number, k: ElecK): number {
  const t = [...k.lighting.utilization].sort((a, b) => a[0] - b[0]);
  const first = t[0]!;
  const last = t[t.length - 1]!;
  if (K <= first[0]) return first[1];
  if (K >= last[0]) return last[1];
  for (let i = 1; i < t.length; i++) {
    const [k1, f1] = t[i]!;
    const [k0, f0] = t[i - 1]!;
    if (K <= k1) return f0 + ((f1 - f0) * (K - k0)) / (k1 - k0);
  }
  return last[1];
}

export function roomFactors(room: GridRoom, k: ElecK) {
  const b = bbox(room.polygon);
  const c = b.x1 - b.x0;
  const l = b.y1 - b.y0;
  const plane = k.lighting.workPlane[room.use] ?? k.lighting.workPlane.other ?? 0.75;
  const h = Math.max(room.ceilingAvg - plane, 0.5);
  const K = (c * l) / (Math.max(h, 0.1) * (c + l));
  const target = k.lighting.targetLux[room.use] ?? k.lighting.targetLux.other ?? 150;
  return { c, l, h, K, fu: utilization(K, k), target, fm: k.lighting.maintenanceFactor, b };
}

/** Quantas luminárias de `lumensEach` levam o cômodo ao lux alvo (no máximo 30). */
export function lightsNeeded(room: GridRoom, lumensEach: number, k: ElecK): number {
  const f = roomFactors(room, k);
  return Math.min(MAX_LIGHTS, Math.max(1, Math.ceil((f.target * room.area) / (lumensEach * f.fu * f.fm) - 1e-9)));
}

/** Iluminância média (lux) com `n` luminárias de `lumensEach`. */
export function luxWith(room: GridRoom, lumensEach: number, n: number, k: ElecK): number {
  const f = roomFactors(room, k);
  return room.area > 0 ? (n * lumensEach * f.fu * f.fm) / room.area : 0;
}

/** Grade de `n` posições no retângulo envolvente, mantendo as que caem dentro do polígono. */
export function gridPositions(poly: Vec2[], n: number, fallback: Vec2): Vec2[] {
  const b = bbox(poly);
  const c = b.x1 - b.x0;
  const l = b.y1 - b.y0;
  const nx = Math.max(1, Math.min(n, Math.round(Math.sqrt((n * c) / Math.max(l, 0.1)))));
  const ny = Math.max(1, Math.ceil(n / nx));
  const out: Vec2[] = [];
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const p: Vec2 = [b.x0 + ((i + 0.5) * c) / nx, b.y0 + ((j + 0.5) * l) / ny];
      if (pointInPoly(p, poly)) out.push([Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000]);
    }
  return out.length > 0 ? out : [fallback];
}

export interface AutoGrid {
  positions: Vec2[];
  /** Luminárias necessárias pelo método e iluminância média esperada com as posições que couberam. */
  needed: number;
  lux: number;
  target: number;
}

/** Posições da grade que levam o cômodo ao lux alvo com a luminária escolhida. */
export function autoGrid(room: GridRoom, lumensEach: number, k: ElecK, centroid: Vec2): AutoGrid {
  const needed = lightsNeeded(room, lumensEach, k);
  const positions = needed === 1 ? [centroid] : gridPositions(room.polygon, needed, centroid);
  const f = roomFactors(room, k);
  return { positions, needed, lux: luxWith(room, lumensEach, positions.length, k), target: f.target };
}
