/** Símbolos e rótulos da camada hidráulica na planta (puro). */
import type { Pipe, PlumbingReport } from '@chalecad/engine';
import { dist2, isVertical, planLength, SYSTEM_SHORT, type V2, type V3 } from './geometry';

/** Lado do quadrado da caixa d'água na planta (m), crescente com o volume. */
export const tankSide = (liters: number): number => Math.max(0.5, Math.min(1.2, 0.5 + (liters - 500) / 2500));

/** DN e declividade de cada tubo, vindos dos resultados. */
export function pipeInfo(report: PlumbingReport): Map<string, { dn: number; slope?: number }> {
  const m = new Map<string, { dn: number; slope?: number }>();
  for (const p of report.water.pipes) m.set(p.pipeId, { dn: p.dn });
  for (const p of report.sewer.pipes) m.set(p.pipeId, { dn: p.dn, ...(p.system === 'sewer' ? { slope: p.slope } : {}) });
  return m;
}

/** Texto do tubo junto ao traçado: "Ø25", ou "Ø100 · 1%" no esgoto. */
export function pipeTag(pipe: Pick<Pipe, 'system'>, info: { dn: number; slope?: number } | undefined): string | null {
  if (!info) return null;
  const pct = pipe.system === 'sewer' && info.slope !== undefined && info.slope > 0 ? ` · ${(info.slope * 100).toFixed(1).replace('.', ',').replace(',0', '')}%` : '';
  return `Ø${info.dn}${pct}`;
}

/** Trecho horizontal mais longo (para o rótulo e as setas): índice e comprimento em planta. */
export function longestSegment(path: readonly V3[]): { index: number; length: number } | null {
  let best: { index: number; length: number } | null = null;
  for (let i = 0; i + 1 < path.length; i++) {
    const l = dist2(path[i]!, path[i + 1]!);
    if (l > 1e-3 && (!best || l > best.length)) best = { index: i, length: l };
  }
  return best;
}

export interface Arrow {
  at: V2;
  /** Direção unitária do escoamento em planta. */
  dir: V2;
}

/** Setas de escoamento: uma por trecho horizontal de pelo menos `minLen`, no meio, no sentido da queda (ou do desenho). */
export function flowArrows(path: readonly V3[], forward: boolean, minLen = 0.6): Arrow[] {
  const out: Arrow[] = [];
  const dirSign = forward ? 1 : -1;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const l = dist2(a, b);
    if (l < minLen) continue;
    out.push({ at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], dir: [(dirSign * (b[0] - a[0])) / l, (dirSign * (b[1] - a[1])) / l] });
  }
  return out;
}

/** Rótulo da prumada: "AF ↓" (água fria que desce), "TQ ↓" (queda de esgoto), "TV ↑" (ventilação). */
export function stackTag(pipe: Pick<Pipe, 'system' | 'path'>): string {
  const path = pipe.path as V3[];
  const down = path[path.length - 1]![2] < path[0]![2];
  const code = pipe.system === 'sewer' ? 'TQ' : pipe.system === 'vent' ? 'TV' : SYSTEM_SHORT[pipe.system];
  return `${code} ${down ? '↓' : '↑'}`;
}

export { isVertical, planLength };
