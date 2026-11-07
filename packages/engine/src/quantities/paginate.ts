import { polygonArea, type Vec2 } from '../geometry';

export interface Rect {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

const EPS = 1e-6;

/** Sutherland-Hodgman contra um semiplano `keep(p) >= 0`. */
function clip(poly: Vec2[], f: (p: Vec2) => number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const fa = f(a);
    const fb = f(b);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) {
      const t = fa / (fa - fb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/** Área da interseção do polígono com o retângulo. */
export function clipArea(poly: Vec2[], r: Rect): number {
  let p = clip(poly, (q) => q[0] - r.u0);
  p = clip(p, (q) => r.u1 - q[0]);
  p = clip(p, (q) => q[1] - r.v0);
  p = clip(p, (q) => r.v1 - q[1]);
  return p.length < 3 ? 0 : polygonArea(p);
}

const overlap = (a: Rect, b: Rect): number =>
  Math.max(0, Math.min(a.u1, b.u1) - Math.max(a.u0, b.u0)) * Math.max(0, Math.min(a.v1, b.v1) - Math.max(a.v0, b.v0));

/**
 * Paginação de placas em um painel (uma face): grade de placas a partir da origem (0, 0) do
 * contorno, colunas = ceil(L / largura), linhas = ceil(Hmáx / altura). Conta as placas cujo retângulo
 * intersecta o contorno e que não ficam totalmente dentro de uma abertura.
 */
export function paginateSheets(outline: Vec2[], openings: Rect[], sheetW: number, sheetH: number): number {
  if (outline.length < 3) return 0;
  const L = Math.max(...outline.map((p) => p[0]));
  const H = Math.max(...outline.map((p) => p[1]));
  const cols = Math.ceil(L / sheetW - EPS);
  const rows = Math.ceil(H / sheetH - EPS);
  let count = 0;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const cell: Rect = { u0: i * sheetW, u1: (i + 1) * sheetW, v0: j * sheetH, v1: (j + 1) * sheetH };
      const inside = clipArea(outline, cell);
      if (inside <= EPS) continue;
      const cut = openings.reduce((s, o) => s + overlap(cell, o), 0);
      if (inside - cut > EPS) count++;
    }
  }
  return count;
}
