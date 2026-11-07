import { add3, cross3, dot3, scale3, sub3, type Vec2, type Vec3 } from '../geometry';
import type { Typology } from '../schema/project';
import type { HostWall, RoofPlane } from '../schema/results';

type Shed = Extract<Typology, { kind: 'shed' }>;
type Flat = Extract<Typology, { kind: 'flat_roof' }>;

const DEG = Math.PI / 180;

export type HighSide = 'front' | 'back' | 'left' | 'right';

/** Eixo do vão (s: do lado baixo ao alto) e do comprimento (l) de uma água única, em planta. */
export interface SlopedFrame {
  highSide: HighSide;
  /** Vão (através da inclinação) e comprimento (ao longo do beiral). */
  S: number;
  L: number;
  /** Direção horizontal que sobe a água (unitária). */
  hDir: Vec2;
  /** Direção horizontal de l (a ao longo do beiral). */
  lDir: Vec2;
  /** Ponto de planta de coordenadas (s, l). */
  at: (s: number, l: number) => Vec2;
  /** Coordenada s de um ponto de planta (sem limitar). */
  sOf: (x: number, y: number) => number;
}

export function slopedFrame(highSide: HighSide, W: number, D: number): SlopedFrame {
  switch (highSide) {
    case 'front':
      return { highSide, S: D, L: W, hDir: [0, -1], lDir: [1, 0], at: (s, l) => [l, D - s], sOf: (_x, y) => D - y };
    case 'back':
      return { highSide, S: D, L: W, hDir: [0, 1], lDir: [1, 0], at: (s, l) => [l, s], sOf: (_x, y) => y };
    case 'left':
      return { highSide, S: W, L: D, hDir: [-1, 0], lDir: [0, 1], at: (s, l) => [W - s, l], sOf: (x) => W - x };
    case 'right':
      return { highSide, S: W, L: D, hDir: [1, 0], lDir: [0, 1], at: (s, l) => [s, l], sOf: (x) => x };
  }
}

/** Água única: z = zLow + s tanθ, s do lado baixo (eixo da parede) ao alto, com beiral `eave` em todos os lados. */
export function slopedPlane(id: string, f: SlopedFrame, zLow: number, slopeRad: number, eave: number): RoofPlane {
  const cos = Math.cos(slopeRad);
  const sin = Math.sin(slopeRad);
  const tan = Math.tan(slopeRad);
  const pt = (s: number, l: number): Vec3 => {
    const [x, y] = f.at(s, l);
    return [x, y, zLow + s * tan];
  };
  const vDir: Vec3 = [f.hDir[0] * cos, f.hDir[1] * cos, sin];
  const nDir: Vec3 = [-f.hDir[0] * sin, -f.hDir[1] * sin, cos];
  const uDir = cross3(vDir, nDir);
  const p0 = pt(-eave, -eave);
  const p1 = pt(-eave, f.L + eave);
  const origin = dot3(uDir, sub3(p1, p0)) > 0 ? p0 : p1;
  const uLength = f.L + 2 * eave;
  const vLength = (f.S + 2 * eave) / cos;
  const du = scale3(uDir, uLength);
  const dv = scale3(vDir, vLength);
  return {
    id,
    vertices: [origin, add3(origin, du), add3(add3(origin, du), dv), add3(origin, dv)],
    slopeDeg: slopeRad / DEG,
    area: uLength * vLength,
    origin,
    uAxis: uDir,
    vAxis: vDir,
    uLength,
    vLength,
    isWall: false,
  };
}

type WallSpec = Pick<HostWall, 'id' | 'kind' | 'from' | 'to' | 'outline'> & { baseZ?: number };

export interface SlopedGeometry {
  roofPlane: RoofPlane;
  ridgeHeight: number;
  roofZ: (x: number, y: number) => number;
  groundWallHeight: number;
  walls: WallSpec[];
}

const rect = (l: number, h: number): Vec2[] => [[0, 0], [l, 0], [l, h], [0, h]];

/** Geometria de meia-água (`shed`) e telhado plano (`flat_roof`): água única, paredes externas e platibandas. */
export function slopedGeometry(t: Shed | Flat): SlopedGeometry {
  const W = t.width;
  const D = t.depth;
  const sides: [string, Vec2, Vec2][] = [
    ['ext-front', [0, 0], [W, 0]],
    ['ext-right', [W, 0], [W, D]],
    ['ext-back', [W, D], [0, D]],
    ['ext-left', [0, D], [0, 0]],
  ];
  const len = (a: Vec2, b: Vec2) => Math.hypot(b[0] - a[0], b[1] - a[1]);

  if (t.kind === 'shed') {
    const f = slopedFrame(t.highSide, W, D);
    const tan = (t.highHeight - t.lowHeight) / f.S;
    const slope = Math.atan(tan);
    const zAt = (x: number, y: number) => t.lowHeight + Math.min(Math.max(f.sOf(x, y), 0), f.S) * tan;
    const walls: WallSpec[] = sides.map(([id, from, to]) => {
      const h0 = zAt(from[0], from[1]);
      const h1 = zAt(to[0], to[1]);
      const l = len(from, to);
      const outline: Vec2[] = Math.abs(h0 - h1) < 1e-9 ? rect(l, h0) : [[0, 0], [l, 0], [l, h1], [0, h0]];
      return { id, kind: 'exterior', from, to, outline };
    });
    return {
      roofPlane: slopedPlane('roof-a', f, t.lowHeight, slope, t.eave),
      ridgeHeight: t.highHeight,
      roofZ: zAt,
      groundWallHeight: t.lowHeight,
      walls,
    };
  }

  // flat_roof: água cai para o fundo (lado alto na frente), sem beiral, dentro da platibanda.
  const f = slopedFrame('front', W, D);
  const tan = t.slopePct / 100;
  const slope = Math.atan(tan);
  const walls: WallSpec[] = [];
  for (const [id, from, to] of sides) {
    walls.push({ id, kind: 'exterior', from, to, outline: rect(len(from, to), t.wallHeight) });
  }
  if (t.parapetHeight > 0) {
    for (const [id, from, to] of sides) {
      walls.push({
        id: `${id}-parapet`,
        kind: 'parapet',
        from,
        to,
        outline: rect(len(from, to), t.parapetHeight),
        baseZ: t.wallHeight,
      });
    }
  }
  return {
    roofPlane: slopedPlane('roof-a', f, t.wallHeight, slope, 0),
    ridgeHeight: Math.max(t.wallHeight + t.parapetHeight, t.wallHeight + D * tan),
    roofZ: (x, y) => t.wallHeight + Math.min(Math.max(f.sOf(x, y), 0), f.S) * tan,
    groundWallHeight: t.wallHeight,
    walls,
  };
}
