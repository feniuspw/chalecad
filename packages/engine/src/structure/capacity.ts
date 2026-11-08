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

export type WoodConstants = TechnicalConstants['wood'];

/**
 * Madeira (NBR 7190, pré-dimensionamento). Entradas do catálogo em MPa; classe pelo `woodClass` do perfil (C25 se ausente).
 * fc0,d = kmod · fc0k / γc; fv,d = kmod · fvk / γv; E0,ef = kmod · E0m. Saídas em MPa.
 */
export function woodDesign(p: Profile, w: WoodConstants): { fc0d: number; fvd: number; E0ef: number } {
  const cls = w.classes[p.woodClass ?? 'C25'] ?? w.classes['C25']!;
  return {
    fc0d: (w.kmod * cls.fc0k) / w.gammaC,
    fvd: (w.kmod * cls.fvk) / w.gammaV,
    E0ef: w.kmod * cls.E0m,
  };
}

export interface Compression {
  /** Esbeltez λ (madeira, eixo forte). */
  lambda?: number;
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

/**
 * Compressão de montante de madeira (NBR 7190), eixo forte: o eixo fraco é travado pelas placas (OSB/cimentícia).
 * λ = L0 / i, com L0 = L (biapoiado) e i = rx.
 *  - λ ≤ 40 (curta): Nrd = A · fc0,d.
 *  - 40 < λ ≤ 140 (medianamente esbelta e esbelta, método simplificado): excentricidade e = h/30 + L0/300
 *    (mínima de projeto + acidental), ampliada pelo fator Fe/(Fe − N) com Fe = π² · E0,ef · I / L0².
 *    Nrd é a carga N que faz  N/A + N · e · Fe/(Fe − N) / W = fc0,d, isto é, a menor raiz de
 *    a·N² − (a·Fe + b·Fe + fc0,d)·N + fc0,d·Fe = 0, com a = 1/A e b = e/W.
 *    O efeito da fluência (ec) da peça esbelta não é somado: simplificação do pré-dimensionamento.
 *  - λ > 140: reprovada (Nrd ≈ 0).
 */
export function woodCompression(p: Profile, L_m: number, w: WoodConstants): Compression {
  const { fc0d, E0ef } = woodDesign(p, w);
  const A = p.area; // cm²
  const f = mpaToKNcm2(fc0d); // kN/cm²
  const L = L_m * 100; // cm
  const lambda = L / p.rx;
  const Fe = eulerLoadKN(E0ef, A, 1, L_m, p.rx);
  const squash = A * f;
  let NcRd: number;
  if (lambda <= 40) NcRd = squash;
  else if (lambda > 140) NcRd = 1e-9;
  else {
    const h = p.web / 10; // cm, altura da seção no eixo forte
    const e = h / 30 + L / 300;
    const a = 1 / A;
    const b = e / p.Wx;
    const B = a * Fe + b * Fe + f;
    NcRd = (B - Math.sqrt(Math.max(B * B - 4 * a * f * Fe, 0))) / (2 * a);
  }
  return { Ne: Fe, lambda, lambda0: lambda, chi: NcRd / squash, NcRd };
}

/** Mrd = Wx · fy / 1,1 (kN·m), com `n` perfis trabalhando juntos (caixa = 2). */
export function momentResistance(p: Profile, f: StructureFactors, n = 1, w?: WoodConstants): number {
  // madeira: σ = M / W ≤ fc0,d (bordo comprimido)
  if (p.material === 'wood' && w) return (n * p.Wx * mpaToKNcm2(woodDesign(p, w).fc0d)) / 100;
  return (n * p.Wx * mpaToKNcm2(p.fy)) / f.gammaA1 / 100;
}

/** Vrd = 0,6 · fy · (alma · t) / 1,1 (kN); alma e t em mm no catálogo. */
export function shearResistance(p: Profile, f: StructureFactors, n = 1, w?: WoodConstants): number {
  // madeira: τ = 1,5 V / A ≤ fv,d  →  Vrd = fv,d · A / 1,5
  if (p.material === 'wood' && w) return (n * p.area * mpaToKNcm2(woodDesign(p, w).fvd)) / 1.5;
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
  /** Constantes de madeira (NBR 7190). Para perfil de madeira, `E` deve ser E0,ef. */
  wood?: WoodConstants;
}): BeamResult {
  const n = args.n ?? 1;
  const { profile: p, L } = args;
  const M = (args.wUls * L * L) / 8;
  const V = (args.wUls * L) / 2;
  const Mrd = momentResistance(p, args.factors, n, args.wood);
  const Vrd = shearResistance(p, args.factors, n, args.wood);
  const delta = deflection(args.wServ, L, args.E, p.Ix * n);
  const deltaLim = (L * 100) / args.deflDen;
  const rM = M / Mrd;
  const rV = V / Vrd;
  const rD = delta / deltaLim;
  return { M, Mrd, V, Vrd, delta, deltaLim, rM, rV, rD, ratio: Math.max(rM, rV, rD) };
}
