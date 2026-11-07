import { length3, sub3, type Vec2, type Vec3 } from '../geometry';
import type { Typology } from '../schema/project';
import type { HostWall, RoofPlane } from '../schema/results';
import { makePlane } from './planes';

type Combined = Extract<Typology, { kind: 'combined' }>;
type WallSpec = Pick<HostWall, 'id' | 'kind' | 'from' | 'to' | 'outline'>;

const DEG = Math.PI / 180;
const EPS = 1e-9;
const rect = (l: number, h: number): Vec2[] => [[0, 0], [l, 0], [l, h], [0, h]];

export interface Valley {
  from: Vec3;
  to: Vec3;
  length: number;
}

export interface CombinedGeometry {
  roofPlanes: RoofPlane[];
  walls: WallSpec[];
  /** Contorno em planta dos eixos das paredes externas (anti-horário), L ou T. */
  axisPolygon: Vec2[];
  /** Retângulos (eixo a eixo) do volume principal e da ala. */
  mainRect: { x0: number; x1: number; y0: number; y1: number };
  wingRect: { x0: number; x1: number; y0: number; y1: number };
  ridgeHeight: number;
  wingRidgeHeight: number;
  /** Linhas de rincão (água-furtada) entre as águas da ala e a água de fundo do volume principal. */
  valleys: Valley[];
  /** Comprimento de beiral (calha) por água. */
  eaveLengths: Record<string, number>;
  roofZ: (x: number, y: number) => number;
}

/**
 * Módulo combinado L/T. Interpretação adotada (o card tem uma inconsistência, ver relatório): a cumeeira do volume
 * principal corre em x (empenas em ext-left/ext-right, águas roof-a na frente e roof-b no fundo); a ala sai da
 * parede do fundo com cumeeira em y, empena em `wing-back` e águas `wing-roof-a` (-x) e `wing-roof-b` (+x), mesma
 * inclinação. Com inclinações iguais, o rincão é a diagonal de 45° em planta.
 */
export function combinedGeometry(t: Combined): CombinedGeometry {
  const W = t.width;
  const D = t.depth;
  const H = t.wallHeight;
  const wW = t.wing.width;
  const wD = t.wing.depth;
  const x0 = t.shape === 'T' ? (W - wW) / 2 : t.wing.offset;
  const x1 = x0 + wW;
  if (x0 < -EPS || x1 > W + EPS) {
    throw new Error('A ala não cabe na largura do volume principal (offset + largura da ala > largura).');
  }
  if (wW > D + EPS) {
    throw new Error('A ala é mais larga que a profundidade do volume principal: a cumeeira da ala ficaria acima da principal.');
  }
  const e = t.eave;
  const k = t.rake;
  const slope = t.roofPitchDeg * DEG;
  const tan = Math.tan(slope);
  const xm = x0 + wW / 2;
  const xl = x0 - e;
  const xr = x1 + e;
  const xa = -k;
  const xb = W + k;
  const ye = D + e;
  const yB = D + wD + k;
  const yMid = D / 2;
  const apex: Vec2 = [xm, D - wW / 2];
  const ridgeHeight = H + (D / 2) * tan;
  const wingRidgeHeight = H + (wW / 2) * tan;

  // --- Águas ---------------------------------------------------------------
  const planeA = makePlane({
    id: 'roof-a',
    plan: [[xa, -e], [xb, -e], [xb, yMid], [xa, yMid]],
    rising: [0, 1],
    slopeRad: slope,
    refPoint: [0, 0],
    refZ: H,
  });
  // Água de fundo: retângulo menos o entalhe em V sob a ala (limitado em x pelo rake).
  const yvL = (x: number) => D + (x0 - x);
  const yvR = (x: number) => D + (x - x1);
  const backPlan: Vec2[] = [[xa, yMid], [xb, yMid]];
  if (xr >= xb) backPlan.push([xb, yvR(xb)]);
  else backPlan.push([xb, ye], [xr, ye]);
  backPlan.push(apex);
  if (xl <= xa) backPlan.push([xa, yvL(xa)]);
  else backPlan.push([xl, ye], [xa, ye]);
  const planeB = makePlane({
    id: 'roof-b',
    plan: backPlan,
    rising: [0, -1],
    slopeRad: slope,
    refPoint: [0, D],
    refZ: H,
  });
  const wingA = makePlane({
    id: 'wing-roof-a',
    plan: [[xl, ye], apex, [xm, yB], [xl, yB]],
    rising: [1, 0],
    slopeRad: slope,
    refPoint: [x0, 0],
    refZ: H,
  });
  const wingB = makePlane({
    id: 'wing-roof-b',
    plan: [[xr, ye], [xr, yB], [xm, yB], apex],
    rising: [-1, 0],
    slopeRad: slope,
    refPoint: [x1, 0],
    refZ: H,
  });

  // --- Rincões -------------------------------------------------------------
  const zEave = H - e * tan;
  const zApex = wingRidgeHeight;
  const mkValley = (a: Vec3, b: Vec3): Valley => ({ from: a, to: b, length: length3(sub3(b, a)) });
  const valleys = [
    mkValley([xl, ye, zEave], [apex[0], apex[1], zApex]),
    mkValley([apex[0], apex[1], zApex], [xr, ye, zEave]),
  ];

  const overlap = Math.max(0, Math.min(xr, xb) - Math.max(xl, xa));
  const eaveLengths: Record<string, number> = {
    'roof-a': planeA.uLength,
    'roof-b': planeB.uLength - overlap,
    'wing-roof-a': yB - ye,
    'wing-roof-b': yB - ye,
  };

  // --- Paredes -------------------------------------------------------------
  const gable = (len: number, top: number): Vec2[] => [[0, 0], [len, 0], [len, H], [len / 2, top], [0, H]];
  const walls: WallSpec[] = [
    { id: 'ext-front', kind: 'exterior', from: [0, 0], to: [W, 0], outline: rect(W, H) },
    { id: 'ext-right', kind: 'exterior', from: [W, 0], to: [W, D], outline: gable(D, ridgeHeight) },
  ];
  // ext-back dividida: trecho à direita da ala (ext-back, parte de x = W para baixo) e à esquerda (ext-back-2).
  const rightLen = W - x1;
  const leftLen = x0;
  let backName = 'ext-back';
  if (rightLen > 0.05) {
    walls.push({ id: backName, kind: 'exterior', from: [W, D], to: [x1, D], outline: rect(rightLen, H) });
    backName = 'ext-back-2';
  }
  if (leftLen > 0.05) {
    walls.push({ id: backName, kind: 'exterior', from: [x0, D], to: [0, D], outline: rect(leftLen, H) });
  }
  walls.push(
    { id: 'ext-left', kind: 'exterior', from: [0, D], to: [0, 0], outline: gable(D, ridgeHeight) },
    { id: 'wing-right', kind: 'exterior', from: [x1, D], to: [x1, D + wD], outline: rect(wD, H) },
    { id: 'wing-back', kind: 'gable', from: [x1, D + wD], to: [x0, D + wD], outline: gable(wW, wingRidgeHeight) },
    { id: 'wing-left', kind: 'exterior', from: [x0, D + wD], to: [x0, D], outline: rect(wD, H) },
  );

  // --- Contorno -------------------------------------------------------------
  const poly: Vec2[] = [[0, 0], [W, 0]];
  if (rightLen <= EPS) poly.push([W, D + wD]);
  else poly.push([W, D], [x1, D], [x1, D + wD]);
  poly.push([x0, D + wD]);
  if (leftLen > EPS) poly.push([x0, D], [0, D]);

  const zMain = (y: number) => {
    const a = Math.min(Math.max(y, 0), D);
    return H + (D / 2 - Math.abs(a - D / 2)) * tan;
  };
  const roofZ = (x: number, y: number): number => {
    const z = zMain(y);
    if (x >= x0 && x <= x1 && y >= D - wW / 2) return Math.max(z, H + (wW / 2 - Math.abs(x - xm)) * tan);
    return z;
  };

  return {
    roofPlanes: [planeA, planeB, wingA, wingB],
    walls,
    axisPolygon: poly,
    mainRect: { x0: 0, x1: W, y0: 0, y1: D },
    wingRect: { x0, x1, y0: D, y1: D + wD },
    ridgeHeight,
    wingRidgeHeight,
    valleys,
    eaveLengths,
    roofZ,
  };
}
