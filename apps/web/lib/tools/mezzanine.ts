/** Edição do polígono do mezanino. Puro: devolve novos polígonos, sem mutar. */
import { add, dot, rightNormal, scale, sub, type V2 } from './geom';

export const MIN_MEZZANINE_SIZE = 1;

export function moveVertex(poly: V2[], i: number, p: V2): V2[] {
  return poly.map((v, k) => (k === i ? p : v));
}

/** Move a aresta i (i → i+1) pela componente de `delta` perpendicular a ela. Vizinhas continuam coladas. */
export function moveEdge(original: V2[], i: number, delta: V2): V2[] {
  const j = (i + 1) % original.length;
  const n = rightNormal(original[i]!, original[j]!);
  const shift = scale(n, dot(delta, n));
  return original.map((v, k) => (k === i || k === j ? add(v, shift) : v));
}

/** Insere um vértice na aresta i (entre i e i+1). */
export function insertVertex(poly: V2[], i: number, p: V2): V2[] {
  return [...poly.slice(0, i + 1), p, ...poly.slice(i + 1)];
}

export function removeVertex(poly: V2[], i: number): V2[] {
  return poly.length <= 3 ? poly : poly.filter((_, k) => k !== i);
}

/** Retângulo (anti-horário) a partir de dois cantos opostos; null se for pequeno demais. */
export function rectFromDrag(a: V2, b: V2, min = MIN_MEZZANINE_SIZE): V2[] | null {
  const x0 = Math.min(a[0], b[0]);
  const x1 = Math.max(a[0], b[0]);
  const y0 = Math.min(a[1], b[1]);
  const y1 = Math.max(a[1], b[1]);
  if (x1 - x0 < min || y1 - y0 < min) return null;
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}

export function clampPoint(p: V2, min: V2, max: V2): V2 {
  return [Math.min(max[0], Math.max(min[0], p[0])), Math.min(max[1], Math.max(min[1], p[1]))];
}

/** Id de nível que não colide com os existentes (L1, L2, …). */
export function nextLevelId(ids: string[]): string {
  let n = 1;
  while (ids.includes(`L${n}`)) n++;
  return `L${n}`;
}

/** Vetor de arraste projetado entre dois pontos (para mover aresta). */
export const dragDelta = (from: V2, to: V2): V2 => sub(to, from);
