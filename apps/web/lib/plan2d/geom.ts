/** Geometria 2D de apoio às plantas, cortes e implantação (funções puras, em metros). */
import type { HostWall, Site, Vec2 } from '@chalecad/engine';

/** Frame local de uma parede: ponto = from + d*u + n*s (n = normal à esquerda de from→to). */
export function wallFrame(w: Pick<HostWall, 'from' | 'to' | 'length'>) {
  const len = w.length || Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]) || 1;
  const dx = (w.to[0] - w.from[0]) / len;
  const dy = (w.to[1] - w.from[1]) / len;
  const d: Vec2 = [dx, dy];
  const n: Vec2 = [-dy, dx];
  const at = (u: number, s: number): Vec2 => [w.from[0] + d[0] * u + n[0] * s, w.from[1] + d[1] * u + n[1] * s];
  return { d, n, at };
}

/** Retângulo da parede em planta (faces), com a ponta estendida meia espessura (cantos fechados). */
export function wallRect(w: HostWall): Vec2[] {
  const { at } = wallFrame(w);
  const h = w.thickness / 2;
  return [at(-h, -h), at(w.length + h, -h), at(w.length + h, h), at(-h, h)];
}

export function bounds(pts: Vec2[]) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

export function polyArea(pts: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    s += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(s) / 2;
}

export function centroid(pts: Vec2[]): Vec2 {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    const f = p[0] * q[1] - q[0] * p[1];
    a += f;
    cx += (p[0] + q[0]) * f;
    cy += (p[1] + q[1]) * f;
  }
  if (Math.abs(a) < 1e-9) return pts[0] ?? [0, 0];
  return [cx / (3 * a), cy / (3 * a)];
}

export function pointInPoly(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Cruzamentos de um polígono com a reta `coord(p) = value` (eixo 0 = x, 1 = y): valores no outro eixo, ordenados. */
export function crossings(poly: Vec2[], axis: 0 | 1, value: number): number[] {
  const other = axis === 0 ? 1 : 0;
  const out: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    if (a[axis] > value !== b[axis] > value) {
      const t = (value - a[axis]) / (b[axis] - a[axis]);
      out.push(a[other] + t * (b[other] - a[other]));
    }
  }
  return out.sort((p, q) => p - q);
}

/** Distância de um ponto a um segmento. */
export function segDist(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

type Sloped = Extract<Site, { type: 'sloped' }>;

/** Terreno natural (z = 0 no centro da edificação), mesmo plano do motor de terraplenagem. */
export function naturalZ(site: Sloped, cx: number, cy: number): (x: number, y: number) => number {
  const t = site.slopePct / 100;
  const az = (site.downhillAzimuthDeg * Math.PI) / 180;
  return (x, y) => -t * ((x - cx) * Math.sin(az) + (y - cy) * Math.cos(az));
}

/** Superfície final (platô, taludes de corte e aterro) em um ponto. `zp`/`nat` na mesma referência. */
export function finalZ(nat: number, dist: number, zp: number, site: Sloped): number {
  const hi = zp + dist / site.cutSlopeHV;
  const lo = zp - dist / site.fillSlopeHV;
  return nat > hi ? hi : nat < lo ? lo : nat;
}
