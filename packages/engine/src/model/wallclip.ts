import type { Vec2 } from '../geometry';
import type { RoofPlane } from '../schema/results';
import { roofBelowAt } from './rooms';

/** Folga entre o eixo do plano de telhado e a face de baixo (conjunto de cobertura). */
export const ROOF_UNDERSIDE_OFFSET = 0.05;
/** Altura mínima de uma parede cortada (mureta). */
export const MIN_CLIPPED_HEIGHT = 0.3;
/** Passo máximo de amostragem ao longo da parede. */
const STEP = 0.25;

/** Interseção de segmentos 2D: retorna t no segmento a-b (0..1) ou null. */
function segT(a: Vec2, b: Vec2, c: Vec2, d: Vec2): number | null {
  const r: Vec2 = [b[0] - a[0], b[1] - a[1]];
  const s: Vec2 = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 ? t : null;
}

/**
 * Contorno (u ao longo da parede, v para cima de `baseZ`) de uma parede interna,
 * com o topo = min(height, face de baixo do telhado - baseZ). Sem telhado acima
 * (ou telhado plano), mantém a altura. Retorna também `clipped` (houve corte).
 */
export function clippedWallOutline(
  from: Vec2,
  to: Vec2,
  baseZ: number,
  height: number,
  planes: RoofPlane[],
): { outline: Vec2[]; clipped: boolean; topAt: (u: number) => number } {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const sloped = planes.filter((p) => p.slopeDeg > 1e-6);
  const rect = (): Vec2[] => [[0, 0], [len, 0], [len, height], [0, height]];
  const flat = () => ({ outline: rect(), clipped: false, topAt: () => height });
  if (len < 1e-9 || height <= 0 || sloped.length === 0) return flat();

  const at = (u: number): Vec2 => [from[0] + ((to[0] - from[0]) * u) / len, from[1] + ((to[1] - from[1]) * u) / len];
  const topAt = (u: number): number => {
    // nas pontas o ponto pode cair exatamente na borda do plano: tenta deslocar para dentro
    for (const e of [0, 1e-4, -1e-4]) {
      const z = roofBelowAt(sloped, at(Math.min(Math.max(u + e, 0), len)));
      if (z !== null) return Math.min(height, Math.max(z - ROOF_UNDERSIDE_OFFSET - baseZ, MIN_CLIPPED_HEIGHT));
    }
    return height;
  };

  const us = new Set<number>([0, len]);
  const n = Math.ceil(len / STEP);
  for (let i = 1; i < n; i++) us.add((len * i) / n);
  for (const p of sloped) {
    const vs = p.vertices.map((v): Vec2 => [v[0], v[1]]);
    vs.forEach((v, i) => {
      const t = segT(from, to, v, vs[(i + 1) % vs.length]!);
      if (t !== null) us.add(Math.min(Math.max(t * len, 0), len));
    });
  }
  const sorted = [...us].sort((a, b) => a - b).filter((u, i, arr) => i === 0 || u - arr[i - 1]! > 1e-6);
  const top: Vec2[] = sorted.map((u) => [u, topAt(u)]);
  // remove colineares
  const keep = top.filter((p, i) => {
    if (i === 0 || i === top.length - 1) return true;
    const a = top[i - 1]!;
    const b = top[i + 1]!;
    return Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) > 1e-9;
  });
  const clipped = keep.some((p) => p[1] < height - 1e-9);
  if (!clipped) return { outline: rect(), clipped: false, topAt };
  return { outline: [[0, 0], [len, 0], ...keep.slice().reverse()], clipped: true, topAt };
}
