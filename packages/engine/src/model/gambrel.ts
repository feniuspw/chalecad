import type { Vec2 } from '../geometry';
import type { Typology } from '../schema/project';
import type { HostWall, RoofPlane } from '../schema/results';
import { makePlane } from './planes';

type Gambrel = Extract<Typology, { kind: 'gambrel' }>;
type WallSpec = Pick<HostWall, 'id' | 'kind' | 'from' | 'to' | 'outline'>;

const DEG = Math.PI / 180;
const rect = (l: number, h: number): Vec2[] => [[0, 0], [l, 0], [l, h], [0, h]];

export interface GambrelGeometry {
  roofPlanes: RoofPlane[];
  walls: WallSpec[];
  ridgeHeight: number;
  /** Cota da quebra (encontro das duas inclinações). */
  breakHeight: number;
  /** Distância horizontal da parede à quebra. */
  breakRun: number;
  roofZ: (x: number, y: number) => number;
}

/**
 * Gambrel: cada lado tem água inferior (`roof-a`/`roof-b`, inclinação inferior, projeção breakRatio × meia-largura)
 * e superior (`roof-a2`/`roof-b2`, até a cumeeira). Beiral só na inferior; rake em todas.
 */
export function gambrelGeometry(t: Gambrel, ridgeAxis: 'depth' | 'width'): GambrelGeometry {
  const W = t.width;
  const D = t.depth;
  const depthAxis = ridgeAxis === 'depth';
  const S = depthAxis ? W : D;
  const L = depthAxis ? D : W;
  const H = t.wallHeight;
  const half = S / 2;
  const bx = t.breakRatio * half;
  const t1 = t.lowerPitchDeg * DEG;
  const t2 = t.upperPitchDeg * DEG;
  const tan1 = Math.tan(t1);
  const tan2 = Math.tan(t2);
  const zb = H + bx * tan1;
  const ridge = zb + (half - bx) * tan2;
  const e = t.eave;
  const k = t.rake;

  const m = (a: number, l: number): Vec2 => (depthAxis ? [a, l] : [l, a]);
  const strip = (a0: number, a1: number): Vec2[] => [m(a0, -k), m(a1, -k), m(a1, L + k), m(a0, L + k)];
  const ra: Vec2 = depthAxis ? [1, 0] : [0, 1];
  const rb: Vec2 = [-ra[0], -ra[1]];

  const roofPlanes = [
    makePlane({ id: 'roof-a', plan: strip(-e, bx), rising: ra, slopeRad: t1, refPoint: m(0, 0), refZ: H }),
    makePlane({ id: 'roof-a2', plan: strip(bx, half), rising: ra, slopeRad: t2, refPoint: m(bx, 0), refZ: zb }),
    makePlane({ id: 'roof-b', plan: strip(S - bx, S + e), rising: rb, slopeRad: t1, refPoint: m(S, 0), refZ: H }),
    makePlane({ id: 'roof-b2', plan: strip(half, S - bx), rising: rb, slopeRad: t2, refPoint: m(S - bx, 0), refZ: zb }),
  ];

  /** Empena de 7 vértices, anti-horária. */
  const gOut = (len: number): Vec2[] => [
    [0, 0], [len, 0], [len, H], [len - bx, zb], [len / 2, ridge], [bx, zb], [0, H],
  ];
  const front: [Vec2, Vec2] = [[0, 0], [W, 0]];
  const right: [Vec2, Vec2] = [[W, 0], [W, D]];
  const back: [Vec2, Vec2] = [[W, D], [0, D]];
  const left: [Vec2, Vec2] = [[0, D], [0, 0]];
  const w = (id: string, [from, to]: [Vec2, Vec2], outline: Vec2[], kind: HostWall['kind']): WallSpec => ({
    id,
    kind,
    from,
    to,
    outline,
  });
  const walls: WallSpec[] = depthAxis
    ? [
        w('ext-front', front, gOut(W), 'exterior'),
        w('ext-right', right, rect(D, H), 'exterior'),
        w('ext-back', back, gOut(W), 'exterior'),
        w('ext-left', left, rect(D, H), 'exterior'),
      ]
    : [
        w('ext-front', front, rect(W, H), 'exterior'),
        w('ext-right', right, gOut(D), 'exterior'),
        w('ext-back', back, rect(W, H), 'exterior'),
        w('ext-left', left, gOut(D), 'exterior'),
      ];

  const roofZ = (x: number, y: number): number => {
    const a = Math.min(Math.max(depthAxis ? x : y, 0), S);
    const d = Math.min(a, S - a);
    return d <= bx ? H + d * tan1 : zb + (d - bx) * tan2;
  };

  return { roofPlanes, walls, ridgeHeight: ridge, breakHeight: zb, breakRun: bx, roofZ };
}
