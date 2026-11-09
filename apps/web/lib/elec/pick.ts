/**
 * Escolha de símbolo sob o cursor e encaixe do eletroduto (puro). Tolerâncias em metros (o chamador converte px).
 */
import type { Vec2 } from '@chalecad/engine';
import { closestOnSegment, dist } from '../tools/geom';
import type { ElecPlanModel } from './symbols';

export type PickHit = { kind: 'point'; id: string } | { kind: 'conduit'; id: string };

/** Ponto mais próximo dentro de `tol` (prioridade para pontos; depois eletrodutos). */
export function pickElec(p: Vec2, plan: ElecPlanModel, tol: number, only?: 'point' | 'conduit'): PickHit | null {
  if (only !== 'conduit') {
    let best: { id: string; d: number } | null = null;
    for (const it of plan.points) {
      if (it.id === 'panel') continue;
      const at = it.point?.position ?? it.shape.center;
      const d = Math.min(dist(p, it.shape.center), dist(p, at));
      if (d <= tol && (!best || d < best.d)) best = { id: it.id, d };
    }
    if (best) return { kind: 'point', id: best.id };
  }
  if (only !== 'point') {
    let best: { id: string; d: number } | null = null;
    for (const c of plan.conduits) {
      for (let i = 1; i < c.path.length; i++) {
        const d = closestOnSegment(p, c.path[i - 1]!, c.path[i]!).dist;
        if (d <= tol * 0.7 && (!best || d < best.d)) best = { id: c.id, d };
      }
    }
    if (best) return { kind: 'conduit', id: best.id };
  }
  return null;
}

export type ConduitSnapKind = 'point' | 'panel' | 'vertex' | 'segment' | 'grid' | 'none';
export interface ConduitSnap {
  point: Vec2;
  kind: ConduitSnapKind;
}

const grid = (v: number, step: number) => Math.round(Math.round(v / step) * step * 1000) / 1000;

/**
 * Encaixe do eletroduto: caixas (pontos e quadro) > vértices de outros eletrodutos > ponto mais próximo de um
 * eletroduto > grade de 5 cm. `anchor` + `ortho` (Shift) trava a direção em 0°/90°.
 */
export function snapConduit(p: Vec2, plan: ElecPlanModel, tol: number, o: { anchor?: Vec2 | null; ortho?: boolean; noSnap?: boolean; step?: number } = {}): ConduitSnap {
  const step = o.step ?? 0.05;
  if (o.noSnap) return { point: p, kind: 'none' };
  let q = p;
  if (o.ortho && o.anchor) q = Math.abs(p[0] - o.anchor[0]) >= Math.abs(p[1] - o.anchor[1]) ? [p[0], o.anchor[1]] : [o.anchor[0], p[1]];
  let best: (ConduitSnap & { d: number; rank: number }) | null = null;
  const consider = (point: Vec2, kind: ConduitSnapKind, rank: number) => {
    const d = dist(q, point);
    if (d <= tol && (!best || rank < best.rank || (rank === best.rank && d < best.d))) best = { point, kind, d, rank };
  };
  for (const it of plan.points) {
    if (it.id === 'panel') consider(it.point?.position ?? it.shape.center, 'panel', 0);
    else consider(it.point!.position, 'point', 0);
  }
  for (const c of plan.conduits) for (const v of c.path) consider(v, 'vertex', 1);
  for (const c of plan.conduits)
    for (let i = 1; i < c.path.length; i++) {
      const h = closestOnSegment(q, c.path[i - 1]!, c.path[i]!);
      consider([Math.round(h.point[0] * 1000) / 1000, Math.round(h.point[1] * 1000) / 1000], 'segment', 2);
    }
  if (best) {
    const b: { point: Vec2; kind: ConduitSnapKind } = best;
    return { point: b.point, kind: b.kind };
  }
  return { point: [grid(q[0], step), grid(q[1], step)], kind: 'grid' };
}
