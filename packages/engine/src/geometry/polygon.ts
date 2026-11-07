import type { Vec2, Vec3 } from './vec';

/** Área com sinal (shoelace): positiva se anti-horário. */
export function signedArea(poly: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

export const polygonArea = (poly: Vec2[]): number => Math.abs(signedArea(poly));

/** Distância de um ponto a um segmento. */
export function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Ponto dentro do polígono; pontos na borda (até `eps`) contam como dentro. */
export function pointInPolygon(p: Vec2, poly: Vec2[], eps = 1e-6): boolean {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    if (distToSegment(p, poly[i]!, poly[(i + 1) % n]!) <= eps) return true;
  }
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) {
      inside = !inside;
    }
  }
  return inside;
}

export function bbox2(points: Vec2[]): { min: Vec2; max: Vec2 } {
  const min: Vec2 = [Infinity, Infinity];
  const max: Vec2 = [-Infinity, -Infinity];
  for (const p of points) {
    min[0] = Math.min(min[0], p[0]);
    min[1] = Math.min(min[1], p[1]);
    max[0] = Math.max(max[0], p[0]);
    max[1] = Math.max(max[1], p[1]);
  }
  return { min, max };
}

export function bbox3(points: Vec3[]): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of points) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, p[k]!);
      max[k] = Math.max(max[k]!, p[k]!);
    }
  }
  return { min, max };
}

/** Comprimento de uma polilinha (fechada ou não). */
export function polylineLength(points: Vec2[], closed = false): number {
  let s = 0;
  const n = points.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    s += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return s;
}

/**
 * Offset de polígono convexo (ou retangular): `d > 0` expande, `d < 0` contrai.
 * Mantém a orientação de entrada.
 */
export function offsetPolygon(poly: Vec2[], d: number): Vec2[] {
  const n = poly.length;
  if (n < 3) return poly.map((p) => [p[0], p[1]] as Vec2);
  const ccw = signedArea(poly) >= 0;
  // normal externa e ponto de cada aresta deslocada
  const lines = poly.map((a, i) => {
    const b = poly[(i + 1) % n]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    const nx = (ccw ? dy : -dy) / l;
    const ny = (ccw ? -dx : dx) / l;
    return { p: [a[0] + nx * d, a[1] + ny * d] as Vec2, dir: [dx / l, dy / l] as Vec2, n: [nx, ny] as Vec2 };
  });
  return poly.map((v, i) => {
    const prev = lines[(i + n - 1) % n]!;
    const next = lines[i]!;
    const den = prev.dir[0] * next.dir[1] - prev.dir[1] * next.dir[0];
    if (Math.abs(den) < 1e-12) return [v[0] + next.n[0] * d, v[1] + next.n[1] * d] as Vec2;
    const t = ((next.p[0] - prev.p[0]) * next.dir[1] - (next.p[1] - prev.p[1]) * next.dir[0]) / den;
    return [prev.p[0] + prev.dir[0] * t, prev.p[1] + prev.dir[1] * t] as Vec2;
  });
}
