/** Geometria 2D de planta (coordenadas do motor, metros). Puro: sem React nem three. */
export type V2 = [number, number];

export const round = (n: number, d = 2) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};
export const dist = (a: V2, b: V2) => Math.hypot(b[0] - a[0], b[1] - a[1]);
export const sub = (a: V2, b: V2): V2 => [a[0] - b[0], a[1] - b[1]];
export const add = (a: V2, b: V2): V2 => [a[0] + b[0], a[1] + b[1]];
export const scale = (a: V2, k: number): V2 => [a[0] * k, a[1] * k];
export const dot = (a: V2, b: V2) => a[0] * b[0] + a[1] * b[1];
export const lerp = (a: V2, b: V2, t: number): V2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const mid = (a: V2, b: V2): V2 => lerp(a, b, 0.5);
export const unit = (a: V2): V2 => {
  const l = Math.hypot(a[0], a[1]) || 1;
  return [a[0] / l, a[1] / l];
};
/** Normal à direita de a→b (mesma convenção de `wallBasis`: w = u x z). */
export const rightNormal = (a: V2, b: V2): V2 => {
  const u = unit(sub(b, a));
  return [u[1], -u[0]];
};

export interface SegmentHit {
  /** Parâmetro 0..1 ao longo do segmento. */
  t: number;
  /** Distância ao longo do segmento (m). */
  u: number;
  point: V2;
  /** Distância do ponto ao segmento (m). */
  dist: number;
}

export function closestOnSegment(p: V2, a: V2, b: V2): SegmentHit {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  const point = lerp(a, b, t);
  return { t, u: t * Math.sqrt(l2), point, dist: dist(p, point) };
}

export function pointInPolygon(p: V2, poly: V2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function polygonArea(poly: V2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

export function bounds(pts: V2[]): { min: V2; max: V2 } {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { min: [Math.min(...xs), Math.min(...ys)], max: [Math.max(...xs), Math.max(...ys)] };
}
