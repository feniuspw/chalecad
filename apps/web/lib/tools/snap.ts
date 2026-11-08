/**
 * Snap de planta (puro). Prioridade: pontos notáveis (cantos, extremidades, meio de paredes) >
 * modulação dos montantes ao longo de uma parede > grade de 10 cm. O resultado traz o tipo do snap
 * para o feedback visual (marcador e rótulo).
 */
import { closestOnSegment, dist, lerp, mid, round, sub, type V2 } from './geom';

export type SnapKind = 'corner' | 'endpoint' | 'midpoint' | 'intersection' | 'perpendicular' | 'aligned' | 'modulation' | 'grid' | 'none';

export interface SnapSegment {
  id: string;
  from: V2;
  to: V2;
}

export interface SnapContext {
  /** Eixos de parede (externas e internas do nível). */
  segments: SnapSegment[];
  /** Cantos da edificação e vértices de mezanino. */
  corners?: V2[];
  studSpacing: number;
  options: { grid: boolean; modulation: boolean };
  /** Alt pressionado: desliga o snap temporariamente. */
  disabled?: boolean;
  /** Raio de captura (m); a cena passa ~12 px convertidos para metros. */
  radius?: number;
  gridStep?: number;
}

export interface SnapResult {
  point: V2;
  kind: SnapKind;
  /** Segmento de referência (modulação, extremidade, meio). */
  ref?: string;
}

export const GRID_STEP = 0.1;
export const DEFAULT_SNAP_RADIUS = 0.25;

export const SNAP_LABELS: Record<SnapKind, string> = {
  corner: 'Canto',
  endpoint: 'Ponta',
  midpoint: 'Meio',
  intersection: 'Interseção',
  perpendicular: 'Perpendicular',
  aligned: 'Alinhado',
  modulation: 'Modulação dos montantes',
  grid: 'Grade',
  none: '',
};

const snapToGrid = (v: number, step: number) => round(Math.round(v / step) * step, 6);

export function snapPoint(p: V2, ctx: SnapContext): SnapResult {
  if (ctx.disabled) return { point: p, kind: 'none' };
  const radius = ctx.radius ?? DEFAULT_SNAP_RADIUS;

  let best: SnapResult | null = null;
  let bestD = radius;
  const consider = (q: V2, kind: SnapKind, ref?: string) => {
    const d = dist(p, q);
    if (d < bestD) {
      bestD = d;
      best = { point: q, kind, ref };
    }
  };
  // Ordem = desempate: canto > extremidade > ponto médio.
  for (const c of ctx.corners ?? []) consider(c, 'corner');
  for (const s of ctx.segments) {
    consider(s.from, 'endpoint', s.id);
    consider(s.to, 'endpoint', s.id);
  }
  for (const s of ctx.segments) consider(mid(s.from, s.to), 'midpoint', s.id);
  if (best) return best;

  if (ctx.options.modulation && ctx.studSpacing > 0) {
    let hit: { seg: SnapSegment; u: number; len: number; d: number } | null = null;
    for (const s of ctx.segments) {
      const len = dist(s.from, s.to);
      if (len < 1e-6) continue;
      const h = closestOnSegment(p, s.from, s.to);
      if (h.dist <= radius && (!hit || h.dist < hit.d)) hit = { seg: s, u: h.u, len, d: h.dist };
    }
    if (hit) {
      const u = Math.min(hit.len, Math.max(0, Math.round(hit.u / ctx.studSpacing) * ctx.studSpacing));
      if (Math.abs(u - hit.u) <= radius) {
        return { point: lerp(hit.seg.from, hit.seg.to, u / hit.len), kind: 'modulation', ref: hit.seg.id };
      }
    }
  }

  if (ctx.options.grid) {
    const step = ctx.gridStep ?? GRID_STEP;
    return { point: [snapToGrid(p[0], step), snapToGrid(p[1], step)], kind: 'grid' };
  }
  return { point: p, kind: 'none' };
}

/** Restringe a direção anchor→p ao eixo dominante (Shift). */
export function orthoPoint(anchor: V2, p: V2): V2 {
  const d = sub(p, anchor);
  return Math.abs(d[0]) >= Math.abs(d[1]) ? [p[0], anchor[1]] : [anchor[0], p[1]];
}

/** Snap de um valor escalar (ao longo de um hospedeiro): modulação dos montantes, senão grade. */
export function snapScalar(
  v: number,
  o: { grid: boolean; modulation: boolean; studSpacing: number; disabled?: boolean; step?: number },
): number {
  if (o.disabled) return v;
  if (o.modulation && o.studSpacing > 0) return round(Math.round(v / o.studSpacing) * o.studSpacing, 6);
  if (o.grid) return snapToGrid(v, o.step ?? GRID_STEP);
  return v;
}
