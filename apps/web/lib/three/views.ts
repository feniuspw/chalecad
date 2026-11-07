/** Vistas de câmera e camadas do modo explodido (puro, cena y-up). */
import type { Vec3 } from '@chalecad/engine';
import type { CameraView } from '../store/types';
import type { ViewPreset } from './convert';

/** Altura do corte da planta baixa, a partir da base do nível ativo. */
export const PLAN_CUT_HEIGHT = 1.2;

export interface ViewSpec {
  ortho: boolean;
  /** Direção (unitária) do alvo para a câmera, na cena y-up. */
  dir: Vec3;
}

const n3 = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

export function viewSpec(v: CameraView): ViewSpec {
  switch (v) {
    case 'plan':
      return { ortho: true, dir: [0, 1, 0.0001] }; // levíssimo desvio: mantém +y do motor para cima na tela
    case 'front': // lado y mínimo do motor = +z na cena
      return { ortho: true, dir: [0, 0, 1] };
    case 'back':
      return { ortho: true, dir: [0, 0, -1] };
    case 'left':
      return { ortho: true, dir: [-1, 0, 0] };
    case 'right':
      return { ortho: true, dir: [1, 0, 0] };
    default:
      return { ortho: false, dir: n3([0.95, 0.7, 1.15]) };
  }
}

export const presetToCameraView = (p: ViewPreset): CameraView => (p === 'top' ? 'plan' : p === 'side' ? 'left' : p);

/** Zoom ortográfico (px por metro) para caber a caixa `size` (cena) na vista, com margem. */
export function orthoZoom(size: Vec3, view: CameraView, px: { width: number; height: number }, margin = 1.35): number {
  let sx: number;
  let sy: number;
  if (view === 'plan') [sx, sy] = [size[0], size[2]];
  else if (view === 'front' || view === 'back') [sx, sy] = [size[0], size[1]];
  else [sx, sy] = [size[2], size[1]];
  const zx = px.width / Math.max(0.5, sx * margin);
  const zy = px.height / Math.max(0.5, sy * margin);
  return Math.max(2, Math.min(zx, zy));
}

export type ExplodeLayer = 'radier' | 'structure' | 'closure' | 'roof';
export const EXPLODE_ORDER: ExplodeLayer[] = ['radier', 'structure', 'closure', 'roof'];
export const EXPLODE_LABELS: Record<ExplodeLayer, string> = {
  radier: 'Radier',
  structure: 'Estrutura',
  closure: 'Fechamento',
  roof: 'Cobertura',
};

/** Espaçamento vertical (m) entre camadas. */
export const explodeGap = (ridgeHeight: number) => Math.min(4, Math.max(1.5, ridgeHeight * 0.55));
/** Deslocamento em z (motor) da camada. A estrutura sobe um passo, o fechamento dois, a cobertura três. */
export const layerOffset = (layer: ExplodeLayer, gap: number) => EXPLODE_ORDER.indexOf(layer) * gap;
