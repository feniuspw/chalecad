/** Seleção por clique na planta (puro): ponto de água > caixa > vértice do tubo selecionado > tubo. */
import type { PipeSystem, PlumbingLayout } from '@chalecad/engine';
import { dist2, type V2, type V3 } from './geometry';
import type { PlumbSel } from './store';

function distToSeg(p: V2, a: V3, b: V3): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return dist2(p, [a[0] + dx * t, a[1] + dy * t]);
}

export type Hit = { sel: PlumbSel; vertex?: number };

export function hitTest(layout: PlumbingLayout, level: string, p: V2, radius: number, visible: Record<PipeSystem, boolean>, selectedPipeId?: string | null, tankSize = 0.5): Hit | null {
  let best: { hit: Hit; d: number; rank: number } | null = null;
  const offer = (hit: Hit, d: number, rank: number) => {
    if (!best || rank < best.rank || (rank === best.rank && d < best.d)) best = { hit, d, rank };
  };
  for (const pt of layout.points) if (pt.level === level && dist2(p, pt.position) <= radius * 1.2) offer({ sel: { kind: 'point', id: pt.id } }, dist2(p, pt.position), 0);
  const t = layout.tank;
  if (Math.abs(p[0] - t.position[0]) <= tankSize / 2 + radius * 0.3 && Math.abs(p[1] - t.position[1]) <= tankSize / 2 + radius * 0.3) offer({ sel: { kind: 'tank', id: 'tank' } }, dist2(p, t.position), 1);
  for (const pipe of layout.pipes) {
    if (pipe.level !== level || !visible[pipe.system]) continue;
    const path = pipe.path as V3[];
    if (pipe.id === selectedPipeId) {
      path.forEach((v, i) => {
        if (dist2(p, v) <= radius) offer({ sel: { kind: 'pipe', id: pipe.id }, vertex: i }, dist2(p, v), 2);
      });
    }
    for (let i = 0; i + 1 < path.length; i++) {
      const d = distToSeg(p, path[i]!, path[i + 1]!);
      if (d <= radius) offer({ sel: { kind: 'pipe', id: pipe.id } }, d, 3);
    }
    if (path.length >= 2 && path.every((v) => dist2(v, path[0]!) < 1e-3) && dist2(p, path[0]!) <= radius) offer({ sel: { kind: 'pipe', id: pipe.id } }, dist2(p, path[0]!), 3);
  }
  return best ? (best as { hit: Hit }).hit : null;
}
