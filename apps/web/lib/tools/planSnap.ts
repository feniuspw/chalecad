/**
 * Snap de planta para o desenho de paredes (puro). Prioridade:
 * ponta/canto > interseção > meio > perpendicular (a partir da âncora) > modulação dos montantes (sobre uma parede) >
 * alinhado (com pontas e a âncora) > grade de 5 cm. Com Shift e âncora: ângulos de 15°.
 * O resultado traz linhas-guia tracejadas para o feedback visual.
 */
import { closestOnSegment, dist, mid, round, sub, type V2 } from './geom';
import type { SnapContext, SnapKind, SnapResult, SnapSegment } from './snap';

export const PLAN_GRID_STEP = 0.05;
export const ANGLE_STEP_DEG = 15;

export interface Guide {
  from: V2;
  to: V2;
}

export interface PlanSnapResult extends SnapResult {
  guides: Guide[];
}

export interface PlanSnapInput {
  ctx: SnapContext;
  /** Início do trecho em desenho (habilita perpendicular, alinhamento com a âncora e ângulo de 15°). */
  anchor?: V2 | null;
  /** Shift: trava o ângulo em múltiplos de 15°. */
  angleLock?: boolean;
  angleStep?: number;
}

const RANK: Record<SnapKind, number> = {
  corner: 0,
  endpoint: 0,
  intersection: 1,
  midpoint: 2,
  perpendicular: 3,
  modulation: 4,
  aligned: 5,
  grid: 6,
  none: 7,
};

/** Interseção própria (cruzamento no interior de ambos) de dois segmentos, ou null. */
export function segmentIntersection(a: SnapSegment, b: SnapSegment): V2 | null {
  const r = sub(a.to, a.from);
  const q = sub(b.to, b.from);
  const den = r[0] * q[1] - r[1] * q[0];
  if (Math.abs(den) < 1e-9) return null;
  const ap = sub(b.from, a.from);
  const t = (ap[0] * q[1] - ap[1] * q[0]) / den;
  const u = (ap[0] * r[1] - ap[1] * r[0]) / den;
  const e = 1e-6;
  if (t < -e || t > 1 + e || u < -e || u > 1 + e) return null;
  return [a.from[0] + r[0] * t, a.from[1] + r[1] * t];
}

const snapToStep = (v: number, step: number) => round(Math.round(v / step) * step, 6);

function pointCandidates(p: V2, ctx: SnapContext, anchor: V2 | null, radius: number) {
  const out: { point: V2; kind: SnapKind; ref?: string; guides: Guide[]; d: number }[] = [];
  const add = (point: V2, kind: SnapKind, ref?: string, guides: Guide[] = []) => {
    const d = dist(p, point);
    if (d <= radius) out.push({ point, kind, ref, guides, d });
  };
  for (const c of ctx.corners ?? []) add(c, 'corner');
  for (const s of ctx.segments) {
    add(s.from, 'endpoint', s.id);
    add(s.to, 'endpoint', s.id);
    add(mid(s.from, s.to), 'midpoint', s.id);
  }
  const near = ctx.segments.filter((s) => closestOnSegment(p, s.from, s.to).dist <= radius);
  for (let i = 0; i < near.length; i++)
    for (let j = i + 1; j < near.length; j++) {
      const x = segmentIntersection(near[i]!, near[j]!);
      if (x) add(x, 'intersection', near[i]!.id);
    }
  if (anchor) {
    for (const s of ctx.segments) {
      const h = closestOnSegment(anchor, s.from, s.to);
      // âncora sobre a própria parede: o pé da perpendicular seria ela mesma
      if (h.dist < 0.02) continue;
      if (h.t <= 0 || h.t >= 1) continue;
      add(h.point, 'perpendicular', s.id, [{ from: anchor, to: h.point }]);
    }
  }
  return out;
}

/** Alinhamento em X e/ou Y com pontas (e a âncora). Devolve o ponto ajustado e as guias, ou null. */
function alignment(p: V2, ctx: SnapContext, anchor: V2 | null, radius: number, step: number): { point: V2; guides: Guide[]; ref?: string } | null {
  const refs: { pt: V2; id?: string }[] = [];
  for (const c of ctx.corners ?? []) refs.push({ pt: c });
  for (const s of ctx.segments) {
    refs.push({ pt: s.from, id: s.id });
    refs.push({ pt: s.to, id: s.id });
  }
  if (anchor) refs.push({ pt: anchor });
  let bx: { pt: V2; dx: number; id?: string } | null = null;
  let by: { pt: V2; dy: number; id?: string } | null = null;
  for (const r of refs) {
    const dx = Math.abs(p[0] - r.pt[0]);
    const dy = Math.abs(p[1] - r.pt[1]);
    if (dx <= radius && (!bx || dx < bx.dx - 1e-9)) bx = { pt: r.pt, dx, id: r.id };
    if (dy <= radius && (!by || dy < by.dy - 1e-9)) by = { pt: r.pt, dy, id: r.id };
  }
  if (!bx && !by) return null;
  const g = ctx.options.grid;
  const point: V2 = [bx ? bx.pt[0] : g ? snapToStep(p[0], step) : p[0], by ? by.pt[1] : g ? snapToStep(p[1], step) : p[1]];
  const guides: Guide[] = [];
  if (bx) guides.push({ from: bx.pt, to: point });
  if (by) guides.push({ from: by.pt, to: point });
  return { point, guides, ref: (bx ?? by)?.id };
}

export function planSnap(p: V2, input: PlanSnapInput): PlanSnapResult {
  const { ctx } = input;
  const anchor = input.anchor ?? null;
  if (ctx.disabled) return { point: p, kind: 'none', guides: [] };
  const radius = ctx.radius ?? 0.25;
  const step = ctx.gridStep ?? PLAN_GRID_STEP;

  // Shift + âncora: direção em múltiplos de 15°; o comprimento segue o cursor (e a grade).
  if (input.angleLock && anchor) {
    const stepRad = ((input.angleStep ?? ANGLE_STEP_DEG) * Math.PI) / 180;
    const v = sub(p, anchor);
    const ang = Math.round(Math.atan2(v[1], v[0]) / stepRad) * stepRad;
    const dir: V2 = [Math.cos(ang), Math.sin(ang)];
    const proj = Math.max(0, v[0] * dir[0] + v[1] * dir[1]);
    const on = (len: number): V2 => [anchor[0] + dir[0] * len, anchor[1] + dir[1] * len];
    const q = on(proj);
    // pontos notáveis que cruzam a direção travada
    let best: { point: V2; kind: SnapKind; ref?: string; guides: Guide[]; d: number } | null = null;
    for (const c of pointCandidates(q, ctx, anchor, radius)) {
      if (c.kind === 'perpendicular') continue;
      const len = (c.point[0] - anchor[0]) * dir[0] + (c.point[1] - anchor[1]) * dir[1];
      const onRay = on(len);
      if (len <= 0 || dist(onRay, c.point) > radius) continue;
      if (!best || RANK[c.kind] < RANK[best.kind] || (RANK[c.kind] === RANK[best.kind] && c.d < best.d)) best = { ...c, point: onRay };
    }
    if (best) return { point: best.point, kind: best.kind, ref: best.ref, guides: [{ from: anchor, to: best.point }] };
    if (ctx.options.grid) return { point: on(snapToStep(proj, step)), kind: 'grid', guides: [{ from: anchor, to: q }] };
    return { point: q, kind: 'none', guides: [{ from: anchor, to: q }] };
  }

  const cands = pointCandidates(p, ctx, anchor, radius);
  let best: (typeof cands)[number] | null = null;
  for (const c of cands) {
    if (!best || RANK[c.kind] < RANK[best.kind] || (RANK[c.kind] === RANK[best.kind] && c.d < best.d - 1e-9)) best = c;
  }
  if (best && RANK[best.kind] <= RANK.perpendicular) return { point: best.point, kind: best.kind, ref: best.ref, guides: best.guides };

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
        const k = u / hit.len;
        const point: V2 = [hit.seg.from[0] + (hit.seg.to[0] - hit.seg.from[0]) * k, hit.seg.from[1] + (hit.seg.to[1] - hit.seg.from[1]) * k];
        return { point, kind: 'modulation', ref: hit.seg.id, guides: [] };
      }
    }
  }

  const al = alignment(p, ctx, anchor, radius, step);
  if (al) return { point: al.point, kind: 'aligned', ref: al.ref, guides: al.guides };

  if (ctx.options.grid) return { point: [snapToStep(p[0], step), snapToStep(p[1], step)], kind: 'grid', guides: [] };
  return { point: p, kind: 'none', guides: [] };
}
