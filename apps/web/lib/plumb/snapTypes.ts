import type { V2 } from './geometry';

export type PipeSnapKind = 'point' | 'tank' | 'end' | 'segment' | 'wall' | 'grid' | 'free';

export interface PipeSnap {
  xy: V2;
  kind: PipeSnapKind;
  /** Cota (m do piso do nível ativo) quando o ponto liga a um nó existente; ausente = livre. */
  z?: number;
  pointId?: string;
  pipeId?: string;
  /** Índice do trecho do tubo (kind `segment`). */
  segIndex?: number;
}

export const SNAP_LABEL: Record<PipeSnapKind, string> = {
  point: 'Ponto de água',
  tank: "Caixa d'água",
  end: 'Ponta de tubo',
  segment: 'Trecho de tubo (divide)',
  wall: 'Parede',
  grid: 'Grade',
  free: '',
};

export const snapKindOf = (s: PipeSnap | undefined): PipeSnapKind => s?.kind ?? 'free';
