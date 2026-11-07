import type { TechnicalConstants } from '@chalecad/catalog';
import type { Stair } from '../schema/project';
import type { ResolvedStair } from '../schema/results';
import type { Vec2, Vec3 } from '../geometry';

/** Constrói a escada a partir da diferença de cota entre os níveis. */
export function buildStair(stair: Stair, fromElev: number, toElev: number, c: TechnicalConstants): ResolvedStair {
  const height = Math.max(Math.abs(toElev - fromElev), 0);
  const baseZ = Math.min(fromElev, toElev);
  const n = Math.max(1, Math.ceil(height / c.stairs.idealRiser - 1e-9));
  const riser = height / n;
  const ladder = stair.type === 'ladder';
  // piso que deixa 2e + p no meio da faixa de conforto (Blondel)
  const target = (c.stairs.blondelMin + c.stairs.blondelMax) / 2 - 2 * riser;
  const going = ladder ? c.stairs.ladderGoing : Math.min(c.stairs.goingMax, Math.max(c.stairs.goingMin, target));
  const w = ladder ? 0.5 : stair.width;
  const th = c.stairs.treadThickness;
  const r = (stair.rotationDeg * Math.PI) / 180;
  const fwd: Vec2 = [Math.sin(r), Math.cos(r)];
  const right: Vec2 = [Math.cos(r), -Math.sin(r)];
  const [px, py] = stair.position;
  /** (s, f): s para a direita a partir do canto esquerdo do pé, f para frente (subida). */
  const toPlan = (s: number, f: number): Vec2 => [
    px + right[0] * s + fwd[0] * f,
    py + right[1] * s + fwd[1] * f,
  ];
  const treads: ResolvedStair['treads'] = [];
  const treadAt = (s: number, f: number, i: number, rotDeg: number): void => {
    const p = toPlan(s, f);
    const z: Vec3 = [p[0], p[1], baseZ + i * riser - th / 2];
    treads.push({ center: z, size: [w, going, th], rotationZDeg: rotDeg });
  };

  const treadCount = n - 1;
  let footprint: Vec2[];
  if (stair.type === 'l_shape' && n >= 3) {
    const m = Math.floor(n / 2); // índice do patamar
    const run1 = (m - 1) * going;
    const run2 = (n - 1 - m) * going;
    for (let i = 1; i < m; i++) treadAt(w / 2, (i - 0.5) * going, i, -stair.rotationDeg);
    // patamar quadrado
    treadAt(w / 2, run1 + w / 2, m, -stair.rotationDeg);
    treads[treads.length - 1]!.size = [w, w, th];
    const sign = stair.turnRight ? 1 : -1;
    const rot2 = -(stair.rotationDeg + sign * 90);
    for (let j = 1; j <= n - 1 - m; j++) {
      const s = stair.turnRight ? w + (j - 0.5) * going : -(j - 0.5) * going;
      treadAt(s, run1 + w / 2, m + j, rot2);
    }
    const pts: [number, number][] = stair.turnRight
      ? [[0, 0], [w, 0], [w, run1], [w + run2, run1], [w + run2, run1 + w], [0, run1 + w]]
      : [[0, 0], [w, 0], [w, run1 + w], [-run2, run1 + w], [-run2, run1], [0, run1]];
    footprint = pts.map(([s, f]) => toPlan(s, f));
  } else {
    for (let i = 1; i <= treadCount; i++) treadAt(w / 2, (i - 0.5) * going, i, -stair.rotationDeg);
    const run = treadCount * going;
    footprint = [toPlan(0, 0), toPlan(w, 0), toPlan(w, run), toPlan(0, run)];
  }

  return {
    id: stair.id,
    type: stair.type,
    treads,
    steps: n,
    riser,
    going,
    blondel: 2 * riser + going,
    footprint,
  };
}
