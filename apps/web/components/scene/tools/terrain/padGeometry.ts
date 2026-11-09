/** Geometria pura da ferramenta "Aplainar área" (sem React nem three): retângulo, validação, snap e previsão das bordas. */
import { polygonSelfIntersects, type Project, type TerrainReport } from '@chalecad/engine';
import { lotInProject } from '@chalecad/engine';
import type { V2 } from '@/lib/tools/geom';

const DEG = Math.PI / 180;
export const MIN_PAD_SIDE = 0.5;
export const MIN_PAD_AREA = 1;
export const SNAP_GRID = 0.05;

/** Retângulo por dois cantos opostos, em sentido anti-horário a partir do canto inferior esquerdo. */
export function rectToPolygon(a: V2, b: V2): V2[] {
  const x0 = Math.min(a[0], b[0]);
  const x1 = Math.max(a[0], b[0]);
  const y0 = Math.min(a[1], b[1]);
  const y1 = Math.max(a[1], b[1]);
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}

export const polygonAreaAbs = (poly: readonly V2[]): number => {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
};

export const polygonCentroid = (poly: readonly V2[]): V2 => {
  const n = poly.length || 1;
  return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
};

export type PadCheck = { ok: true } | { ok: false; reason: string };

/** Polígono aceitável para uma área aplainada: 3+ vértices, sem cruzar, com tamanho mínimo. */
export function validatePadPolygon(poly: readonly V2[]): PadCheck {
  if (poly.length < 3) return { ok: false, reason: 'A área precisa de pelo menos 3 pontos.' };
  if (poly.length > 64) return { ok: false, reason: 'No máximo 64 pontos por área.' };
  if (poly.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return { ok: false, reason: 'Ponto inválido.' };
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.05) return { ok: false, reason: 'Há dois pontos praticamente no mesmo lugar.' };
  }
  if (polygonSelfIntersects(poly as V2[])) return { ok: false, reason: 'O contorno não pode se cruzar.' };
  if (polygonAreaAbs(poly) < MIN_PAD_AREA) return { ok: false, reason: 'A área precisa ter pelo menos 1 m².' };
  return { ok: true };
}

export interface SnapSeg {
  a: V2;
  b: V2;
}
export interface PadSnapTargets {
  corners: V2[];
  segments: SnapSeg[];
}

const loop = (poly: readonly V2[]): SnapSeg[] => poly.map((a, i) => ({ a, b: poly[(i + 1) % poly.length]! }));

/** Quinas e faces da casa, do platô, do lote e das outras áreas (`skipId` = a área em edição). */
export function padSnapTargets(project: Project, footprint: readonly V2[], terrain: TerrainReport | null, skipId?: string): PadSnapTargets {
  const corners: V2[] = [];
  const segments: SnapSeg[] = [];
  const add = (poly: readonly V2[]) => {
    corners.push(...poly);
    segments.push(...loop(poly));
  };
  add(footprint);
  for (const p of terrain?.pads ?? []) if (p.id !== skipId) add(p.polygon as V2[]);
  const lot = project.legal.lot;
  if (lot) add(lotInProject(lot) as V2[]);
  return { corners, segments };
}

export type PadSnapKind = 'corner' | 'perpendicular' | 'grid' | 'none';

export function closestOnSeg(p: V2, a: V2, b: V2): V2 {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return [a[0] + t * dx, a[1] + t * dy];
}

/** Snap: quinas primeiro, depois faces, depois grade de 5 cm. `radius` em metros; `off` (Alt) desliga tudo. */
export function snapPadPoint(raw: V2, t: PadSnapTargets, radius: number, off = false): { point: V2; kind: PadSnapKind } {
  if (off) return { point: raw, kind: 'none' };
  let best: V2 | null = null;
  let bd = radius;
  for (const c of t.corners) {
    const d = Math.hypot(c[0] - raw[0], c[1] - raw[1]);
    if (d <= bd) {
      bd = d;
      best = c;
    }
  }
  if (best) return { point: [best[0], best[1]], kind: 'corner' };
  let face: V2 | null = null;
  bd = radius;
  for (const s of t.segments) {
    const q = closestOnSeg(raw, s.a, s.b);
    const d = Math.hypot(q[0] - raw[0], q[1] - raw[1]);
    if (d <= bd) {
      bd = d;
      face = q;
    }
  }
  if (face) return { point: face, kind: 'perpendicular' };
  return { point: [Math.round(raw[0] / SNAP_GRID) * SNAP_GRID, Math.round(raw[1] / SNAP_GRID) * SNAP_GRID], kind: 'grid' };
}

/** Índice do vértice a menos de `radius` do ponto, ou -1. */
export function hitVertex(poly: readonly V2[], p: V2, radius: number): number {
  let best = -1;
  let bd = radius;
  poly.forEach((v, i) => {
    const d = Math.hypot(v[0] - p[0], v[1] - p[1]);
    if (d <= bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

export const translatePolygon = (poly: readonly V2[], dx: number, dy: number): V2[] => poly.map((p) => [p[0] + dx, p[1] + dy] as V2);

/** Nível com arraste vertical (Shift): subir na tela sobe o nível; passo de 5 cm, limitado a ±10 m (schema). */
export function levelFromDrag(startLevel: number, dyPixels: number, mpp: number): number {
  const v = startLevel - dyPixels * mpp;
  return Math.max(-10, Math.min(10, Math.round(v * 20) / 20));
}

export interface EdgeForecast {
  from: V2;
  to: V2;
  /** Desnível em relação ao terreno natural no meio da aresta (corte > 0, aterro < 0), m. */
  h: number;
  kind: 'slope' | 'wall';
}

export interface ForecastRules {
  cutHeight: number;
  fillHeight: number;
}

/**
 * Previsão (leve, para o desenho ao vivo) do que acontece em cada aresta de uma área: muro onde as bordas são "muro"
 * ou, em "auto", onde o desnível passa do limite do catálogo. O motor decide de verdade (lote, encontro com outras
 * áreas, união de trechos); isto só dá a cor enquanto o usuário arrasta.
 */
export function forecastEdges(
  poly: readonly V2[],
  zPad: number,
  site: { slopePct: number; downhillAzimuthDeg: number },
  center: V2,
  edges: 'auto' | 'slope' | 'wall',
  rules: ForecastRules,
): EdgeForecast[] {
  const t = site.slopePct / 100;
  const az = site.downhillAzimuthDeg * DEG;
  const natural = (x: number, y: number) => -t * ((x - center[0]) * Math.sin(az) + (y - center[1]) * Math.cos(az));
  return loop(poly).map(({ a, b }) => {
    const h = natural((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) - zPad;
    const wall = edges === 'wall' || (edges === 'auto' && (h > 0 ? h > rules.cutHeight : -h > rules.fillHeight));
    return { from: a, to: b, h, kind: wall ? 'wall' : 'slope' };
  });
}
