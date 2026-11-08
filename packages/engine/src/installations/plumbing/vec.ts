/** Geometria 3D mínima do traçado hidráulico. Coordenadas do motor: [x, y, z] com z para cima, em metros. */
export type V3 = [number, number, number];
export type P2 = [number, number];

export const dist3 = (a: V3, b: V3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const dist2 = (a: P2 | V3, b: P2 | V3): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const manhattan2 = (a: P2, b: P2): number => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

/** Comprimento 3D de uma polilinha. */
export function length3(path: V3[]): number {
  let s = 0;
  for (let i = 1; i < path.length; i++) s += dist3(path[i - 1]!, path[i]!);
  return s;
}

/** Comprimento em planta e queda vertical (m, positiva quando desce) de uma polilinha. */
export function horizontalLength(path: V3[]): number {
  let s = 0;
  for (let i = 1; i < path.length; i++) s += dist2(path[i - 1]!, path[i]!);
  return s;
}

/** Soma das descidas dos trechos verticais (xy parado). */
export function verticalDrop(path: V3[]): number {
  let s = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    if (dist2(a, b) < 1e-6 && a[2] > b[2]) s += a[2] - b[2];
  }
  return s;
}

export function unit(a: V3, b: V3): V3 | null {
  const d = dist3(a, b);
  if (d < 1e-9) return null;
  return [(b[0] - a[0]) / d, (b[1] - a[1]) / d, (b[2] - a[2]) / d];
}

/** Desvio (graus) entre duas direções unitárias: 0 = segue reto, 90 = cotovelo. */
export function deflection(d1: V3, d2: V3): number {
  const c = Math.max(-1, Math.min(1, d1[0] * d2[0] + d1[1] * d2[1] + d1[2] * d2[2]));
  return (Math.acos(c) * 180) / Math.PI;
}

/** Remove vértices repetidos e colineares (não geram joelho). */
export function cleanPath(path: V3[], eps = 1e-6): V3[] {
  const out: V3[] = [];
  for (const p of path) {
    const last = out[out.length - 1];
    if (last && dist3(last, p) < eps) continue;
    out.push([p[0], p[1], p[2]]);
  }
  for (let i = out.length - 2; i >= 1; i--) {
    const d1 = unit(out[i - 1]!, out[i]!);
    const d2 = unit(out[i]!, out[i + 1]!);
    if (d1 && d2 && deflection(d1, d2) < 1e-3) out.splice(i, 1);
  }
  return out;
}

/** Caminho em L (primeiro x, depois y) entre dois pontos de planta, na cota z. */
export function manhattanPath(a: P2, b: P2, z: number): V3[] {
  return cleanPath([
    [a[0], a[1], z],
    [b[0], a[1], z],
    [b[0], b[1], z],
  ]);
}

/**
 * Cota de cada vértice de `path2d` descendo `slope` m/m a partir de `zStart` (esgoto): z cai com o comprimento
 * acumulado em planta.
 */
export function slopedPath(path2d: P2[], zStart: number, slope: number): V3[] {
  const out: V3[] = [];
  let acc = 0;
  path2d.forEach((p, i) => {
    if (i > 0) acc += dist2(path2d[i - 1]!, p);
    out.push([p[0], p[1], zStart - slope * acc]);
  });
  return out;
}
