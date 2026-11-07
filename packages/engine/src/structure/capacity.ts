import type { Profile, TechnicalConstants } from '@chalecad/catalog';

/**
 * Fórmulas de resistência simplificadas (NBR 14762, pré-dimensionamento). Unidades de entrada do catálogo:
 * cm, cm², cm³, cm⁴, MPa. Aqui tudo é convertido para kN e cm internamente; saídas em kN, kN·m, cm.
 */

/**
 * Fatores de resistência (γa1, γa2), área efetiva (flambagem local de chapas finas, simplificação do
 * pré-dimensionamento) e ψ0 (NBR 8681) vêm de `catalog.constants.structureFactors`.
 */
export type StructureFactors = TechnicalConstants['structureFactors'];
/** Aceleração da gravidade (m/s²): kg → kN. */
export const G = 9.81;

/** MPa → kN/cm². */
const mpaToKNcm2 = (mpa: number) => mpa / 10;

export function eulerLoadKN(E_MPa: number, A_cm2: number, K: number, L_m: number, r_cm: number): number {
  const slender = (K * L_m * 100) / r_cm;
  return (Math.PI ** 2 * mpaToKNcm2(E_MPa) * A_cm2) / (slender * slender);
}

export interface Compression {
  /** Menor carga de flambagem elástica entre os eixos (kN). */
  Ne: number;
  lambda0: number;
  chi: number;
  /** Nc,Rd = χ · 0,85·A · fy / 1,2 (kN). */
  NcRd: number;
}

/**
 * Compressão de montante. Eixo x (rx): L = altura. Eixo y (ry): L = `braceLength` (bloqueadores/placas), no máximo L.
 * λ0 usa a área bruta, como na NBR 14762; a área efetiva só entra em Nc,Rd.
 */
export function compression(
  p: Profile,
  E_MPa: number,
  L_m: number,
  braceLength_m: number,
  f: StructureFactors,
): Compression {
  const Nex = eulerLoadKN(E_MPa, p.area, 1, L_m, p.rx);
  const Ney = eulerLoadKN(E_MPa, p.area, 1, Math.min(L_m, braceLength_m), p.ry);
  const Ne = Math.min(Nex, Ney);
  const Ny = p.area * mpaToKNcm2(p.fy);
  const lambda0 = Math.sqrt(Ny / Ne);
  const chi = lambda0 <= 1.5 ? Math.pow(0.658, lambda0 * lambda0) : 0.877 / (lambda0 * lambda0);
  return { Ne, lambda0, chi, NcRd: (chi * f.effectiveAreaFactor * Ny) / f.gammaA2 };
}

/** Mrd = Wx · fy / 1,1 (kN·m), com `n` perfis trabalhando juntos (caixa = 2). */
export function momentResistance(p: Profile, f: StructureFactors, n = 1): number {
  return (n * p.Wx * mpaToKNcm2(p.fy)) / f.gammaA1 / 100;
}

/** Vrd = 0,6 · fy · (alma · t) / 1,1 (kN); alma e t em mm no catálogo. */
export function shearResistance(p: Profile, f: StructureFactors, n = 1): number {
  const aw = (p.web / 10) * (p.thickness / 10);
  return (n * f.shearYieldFactor * mpaToKNcm2(p.fy) * aw) / f.gammaA1;
}

/** Flecha de viga biapoiada com carga uniforme: 5qL⁴/(384EI) (cm). q em kN/m, L em m. */
export function deflection(qKNm: number, L_m: number, E_MPa: number, Ix_cm4: number): number {
  const q = qKNm / 100; // kN/cm
  const L = L_m * 100;
  return (5 * q * L ** 4) / (384 * mpaToKNcm2(E_MPa) * Ix_cm4);
}

export interface BeamResult {
  M: number;
  Mrd: number;
  V: number;
  Vrd: number;
  delta: number;
  deltaLim: number;
  rM: number;
  rV: number;
  rD: number;
  ratio: number;
}

/** Viga biapoiada: momento, cortante e flecha (carga de serviço) contra os limites. `n` perfis em caixa. */
export function simpleBeam(args: {
  profile: Profile;
  L: number;
  wUls: number;
  wServ: number;
  deflDen: number;
  E: number;
  factors: StructureFactors;
  n?: number;
}): BeamResult {
  const n = args.n ?? 1;
  const { profile: p, L } = args;
  const M = (args.wUls * L * L) / 8;
  const V = (args.wUls * L) / 2;
  const Mrd = momentResistance(p, args.factors, n);
  const Vrd = shearResistance(p, args.factors, n);
  const delta = deflection(args.wServ, L, args.E, p.Ix * n);
  const deltaLim = (L * 100) / args.deflDen;
  const rM = M / Mrd;
  const rV = V / Vrd;
  const rD = delta / deltaLim;
  return { M, Mrd, V, Vrd, delta, deltaLim, rM, rV, rD, ratio: Math.max(rM, rV, rD) };
}
