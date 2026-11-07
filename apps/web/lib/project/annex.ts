/**
 * Anexos laterais do A-frame: valores padrão, limites e ajuste para manter a geometria válida no motor
 * (`annexGeometry` em @chalecad/engine). Funções puras; as que mutam esperam um rascunho Immer.
 */
import type { AFrameAnnex, Project, Typology } from '@chalecad/engine';
import { clamp, round } from './geometry';

type AFrameT = Extract<Typology, { kind: 'a_frame' }>;
export type AnnexSide = AFrameAnnex['side'];
export type AnnexPatch = Partial<Omit<AFrameAnnex, 'side'>>;

const DEG = Math.PI / 180;
/** Folga para não encostar nos limites do motor (arredondamento). */
const M = 0.005;
const MIN_LOW = 2.0;

export const ANNEX_DEFAULT: Omit<AFrameAnnex, 'side' | 'offset' | 'length'> = { width: 3, height: 2.8, pitchDeg: 10, eave: 0.5 };

const tanOf = (t: AFrameT) => (t.ridgeHeight - t.kneeWallHeight) / (t.width / 2);

export interface AnnexLimits {
  pitchMax: number;
  heightMin: number;
  heightMax: number;
  widthMax: number;
  lengthMax: number;
  offsetMax: number;
}

/** Faixas válidas de cada campo do anexo, dados os demais. */
export function annexLimits(t: AFrameT, a: AFrameAnnex): AnnexLimits {
  const tanP = tanOf(t);
  const k = t.kneeWallHeight;
  const pitchMax = Math.min(25, Math.atan(Math.max(0.06, tanP - 0.06)) / DEG);
  const ta = Math.tan(Math.min(a.pitchDeg, pitchMax) * DEG);
  const heightMax = Math.min(4.5, k + (t.width / 2 - 0.3 - M) * (tanP - ta));
  const heightMin = Math.max(2.2, k + 0.3 + M, MIN_LOW + a.width * ta + M);
  const widthMax = Math.min(5, ta > 0 ? (heightMax - MIN_LOW - M) / ta : 5);
  const lengthMax = Math.min(30, t.depth);
  return { pitchMax, heightMin, heightMax, widthMax, lengthMax, offsetMax: Math.max(0, t.depth - a.length) };
}

/**
 * Ajusta o anexo para caber: inclinação, depois largura (o lado baixo precisa de 2 m), depois altura;
 * comprimento e posição dentro da profundidade. null quando o A-frame é baixo demais para qualquer anexo.
 */
export function fitAnnex(t: AFrameT, a: AFrameAnnex): AFrameAnnex | null {
  const out = { ...a };
  out.length = round(clamp(out.length, 2, Math.min(30, t.depth)), 3);
  out.offset = round(clamp(out.offset, 0, Math.max(0, t.depth - out.length)), 3);
  out.eave = round(clamp(out.eave, 0, 1.2), 3);
  let lim = annexLimits(t, out);
  out.pitchDeg = round(clamp(out.pitchDeg, 3, lim.pitchMax), 2);
  lim = annexLimits(t, out);
  if (lim.widthMax < 1.5) {
    out.pitchDeg = 3;
    lim = annexLimits(t, out);
    if (lim.widthMax < 1.5) return null;
  }
  out.width = round(clamp(out.width, 1.5, lim.widthMax), 3);
  lim = annexLimits(t, out);
  if (lim.heightMin > lim.heightMax) return null;
  out.height = round(clamp(out.height, lim.heightMin, lim.heightMax), 3);
  return out;
}

/** Ajusta todos os anexos do A-frame (remove os que não cabem). Devolve quantos foram removidos. */
export function fitAnnexes(t: AFrameT): number {
  const before = t.annexes.length;
  t.annexes = t.annexes.map((a) => fitAnnex(t, a)).filter((a): a is AFrameAnnex => a !== null);
  return before - t.annexes.length;
}

export const getAnnex = (p: Project, side: AnnexSide): AFrameAnnex | undefined =>
  p.typology.kind === 'a_frame' ? p.typology.annexes.find((a) => a.side === side) : undefined;

/** Novo anexo no meio da profundidade (5 m ou o que couber). false se não couber. */
export function addAnnex(draft: Project, side: AnnexSide): boolean {
  const t = draft.typology;
  if (t.kind !== 'a_frame' || t.annexes.some((a) => a.side === side)) return false;
  const length = Math.min(5, t.depth);
  const offset = round(Math.max(0, (t.depth - length) / 2), 2);
  const a = fitAnnex(t, { side, ...ANNEX_DEFAULT, length, offset });
  if (!a) return false;
  t.annexes.push(a);
  t.annexes.sort((x, y) => (x.side === 'left' ? -1 : 1) - (y.side === 'left' ? -1 : 1));
  return true;
}

export function removeAnnex(draft: Project, side: AnnexSide): void {
  const t = draft.typology;
  if (t.kind !== 'a_frame') return;
  t.annexes = t.annexes.filter((a) => a.side !== side);
  draft.openings = draft.openings.filter((o) => !o.host.startsWith(`annex-${side}-`));
}

export function patchAnnex(draft: Project, side: AnnexSide, patch: AnnexPatch): void {
  const t = draft.typology;
  if (t.kind !== 'a_frame') return;
  const i = t.annexes.findIndex((a) => a.side === side);
  if (i < 0) return;
  const next = fitAnnex(t, { ...t.annexes[i]!, ...patch });
  if (next) t.annexes[i] = next;
}

/** Medidas derivadas para mostrar no painel. */
export function annexInfo(t: AFrameT, a: AFrameAnnex) {
  const tanP = tanOf(t);
  const ta = Math.tan(a.pitchDeg * DEG);
  const reach = (a.height - t.kneeWallHeight) / (tanP - ta);
  return { lowHeight: a.height - a.width * ta, reach, meetZ: a.height + reach * ta, area: a.width * a.length };
}
