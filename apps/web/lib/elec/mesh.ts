/**
 * Traços como triângulos com espessura em metros (a linha de 1 px do WebGL some na planta): quads por segmento,
 * pontas quadradas, tracejado e polígonos convexos. Puro (arrays de números), sem three.
 */
import type { Vec2 } from '@chalecad/engine';

/** Quad de um segmento com espessura `w` (m), pontas estendidas de w/2. Devolve 6 vértices (x, y, z). */
export function segmentQuad(a: Vec2, b: Vec2, w: number, z: number, out: number[]): void {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return;
  const ux = dx / len;
  const uy = dy / len;
  const h = w / 2;
  const ax = a[0] - ux * h;
  const ay = a[1] - uy * h;
  const bx = b[0] + ux * h;
  const by = b[1] + uy * h;
  const nx = -uy * h;
  const ny = ux * h;
  out.push(ax + nx, ay + ny, z, ax - nx, ay - ny, z, bx - nx, by - ny, z, ax + nx, ay + ny, z, bx - nx, by - ny, z, bx + nx, by + ny, z);
}

export function polylineQuads(pts: Vec2[], closed: boolean, w: number, z: number, out: number[]): void {
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) segmentQuad(pts[i]!, pts[(i + 1) % pts.length]!, w, z, out);
}

/** Trechos de um tracejado ao longo de uma polilinha (traço `dash`, vazio `gap`, em metros). */
export function dashSegments(path: Vec2[], dash: number, gap: number): [Vec2, Vec2][] {
  const out: [Vec2, Vec2][] = [];
  let on = true;
  let left = dash;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-9) continue;
    let t = 0;
    while (t < len - 1e-9) {
      const step = Math.min(left, len - t);
      if (on) out.push([[a[0] + ((b[0] - a[0]) * t) / len, a[1] + ((b[1] - a[1]) * t) / len], [a[0] + ((b[0] - a[0]) * (t + step)) / len, a[1] + ((b[1] - a[1]) * (t + step)) / len]]);
      t += step;
      left -= step;
      if (left <= 1e-9) {
        on = !on;
        left = on ? dash : gap;
      }
    }
  }
  return out;
}

/** Leque de triângulos de um polígono convexo. */
export function fanTriangles(poly: Vec2[], z: number, out: number[]): void {
  for (let i = 1; i + 1 < poly.length; i++) out.push(poly[0]![0], poly[0]![1], z, poly[i]![0], poly[i]![1], z, poly[i + 1]![0], poly[i + 1]![1], z);
}

/** Anel (para destaque): contorno circular de raio r e espessura w. */
export function ringQuads(c: Vec2, r: number, w: number, z: number, out: number[], n = 28): void {
  const pts: Vec2[] = Array.from({ length: n }, (_, i) => [c[0] + r * Math.cos((i / n) * Math.PI * 2), c[1] + r * Math.sin((i / n) * Math.PI * 2)]);
  polylineQuads(pts, true, w, z, out);
}
