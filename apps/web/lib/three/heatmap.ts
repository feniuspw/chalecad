/** Mapa de calor: taxa de uso da verificação estrutural -> cor, e índice peça/host -> verificação. */
import type { Piece, StructuralCheck } from '@chalecad/engine';

export const HEAT = {
  none: '#d6d3d1',
  ok: '#22c55e',
  warn: '#facc15',
  fail: '#ef4444',
} as const;

export type HeatLevel = 'none' | 'ok' | 'warn' | 'fail';

export function heatLevel(ratio: number | undefined): HeatLevel {
  if (ratio === undefined || !Number.isFinite(ratio)) return 'none';
  if (ratio < 0.7) return 'ok';
  if (ratio <= 1.0) return 'warn';
  return 'fail';
}

export const heatColor = (ratio: number | undefined): string => HEAT[heatLevel(ratio)];

export const HEAT_LEGEND: { level: HeatLevel; label: string }[] = [
  { level: 'ok', label: 'Uso < 70%' },
  { level: 'warn', label: '70% a 100%' },
  { level: 'fail', label: 'Uso > 100%' },
  { level: 'none', label: 'Sem verificação' },
];

export interface HeatIndex {
  pieceRatio: Map<string, number>;
  hostRatio: Map<string, number>;
  pieceCheck: Map<string, StructuralCheck>;
  hostCheck: Map<string, StructuralCheck>;
}

/** Maior taxa por peça e por hospedeiro (a verificação mais crítica vence). */
export function buildHeatIndex(checks: StructuralCheck[] | undefined): HeatIndex {
  const idx: HeatIndex = { pieceRatio: new Map(), hostRatio: new Map(), pieceCheck: new Map(), hostCheck: new Map() };
  for (const c of checks ?? []) {
    for (const id of c.pieceIds) {
      if ((idx.pieceRatio.get(id) ?? -Infinity) < c.ratio) {
        idx.pieceRatio.set(id, c.ratio);
        idx.pieceCheck.set(id, c);
      }
    }
    for (const id of c.hostIds) {
      if ((idx.hostRatio.get(id) ?? -Infinity) < c.ratio) {
        idx.hostRatio.set(id, c.ratio);
        idx.hostCheck.set(id, c);
      }
    }
  }
  return idx;
}

/** Taxa de uso da peça: verificação da própria peça; senão a do hospedeiro; senão indefinida. */
export function pieceHeat(piece: Pick<Piece, 'id' | 'hostId'>, idx: HeatIndex): { ratio: number; check: StructuralCheck } | null {
  const pc = idx.pieceCheck.get(piece.id);
  if (pc) return { ratio: idx.pieceRatio.get(piece.id)!, check: pc };
  const hc = idx.hostCheck.get(piece.hostId);
  if (hc) return { ratio: idx.hostRatio.get(piece.hostId)!, check: hc };
  return null;
}
