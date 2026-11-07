/** Escada: prévia de implantação em planta (mesma geometria do motor, simplificada ao contorno). Puro. */
import { add, scale, type V2 } from './geom';
import type { Stair } from '@chalecad/engine';

export interface StairConstants {
  idealRiser: number;
  going: number;
  ladderGoing: number;
}

export type StairDraft = Pick<Stair, 'type' | 'position' | 'rotationDeg' | 'width' | 'turnRight'>;

/** Vetores (para frente, para a direita) da escada com rotação `deg` (0 = +y, 90 = +x). */
export function stairAxes(deg: number): { fwd: V2; right: V2 } {
  const r = (deg * Math.PI) / 180;
  return { fwd: [Math.sin(r), Math.cos(r)], right: [Math.cos(r), -Math.sin(r)] };
}

/** Contorno em planta; segue `buildStair` do motor. `rise` = desnível entre os níveis. */
export function stairFootprint(s: StairDraft, rise: number, c: StairConstants): V2[] {
  const n = Math.max(1, Math.ceil(Math.max(rise, 0) / c.idealRiser - 1e-9));
  const ladder = s.type === 'ladder';
  const going = ladder ? c.ladderGoing : c.going;
  const w = ladder ? 0.5 : s.width;
  const { fwd, right } = stairAxes(s.rotationDeg);
  const at = (a: number, f: number): V2 => add(s.position, add(scale(right, a), scale(fwd, f)));
  if (s.type === 'l_shape' && n >= 3) {
    const m = Math.floor(n / 2);
    const run1 = (m - 1) * going;
    const run2 = (n - 1 - m) * going;
    const pts: V2[] = s.turnRight
      ? [[0, 0], [w, 0], [w, run1], [w + run2, run1], [w + run2, run1 + w], [0, run1 + w]]
      : [[0, 0], [w, 0], [w, run1 + w], [-run2, run1 + w], [-run2, run1], [0, run1]];
    return pts.map(([a, f]) => at(a, f));
  }
  const run = (n - 1) * going;
  return [at(0, 0), at(w, 0), at(w, run), at(0, run)];
}

/** `position` = canto esquerdo do pé; o cursor fica no meio da largura do pé da escada. */
export function positionForCursor(cursor: V2, rotationDeg: number, width: number): V2 {
  const { right } = stairAxes(rotationDeg);
  return add(cursor, scale(right, -width / 2));
}

export const nextRotation = (deg: number) => (Math.round(deg) + 90) % 360;
