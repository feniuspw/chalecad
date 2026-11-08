/** Respostas do assistente "Me ajude a montar" e os valores padrão (dá para clicar "Próximo" sem pensar). */
import type { UF } from '@chalecad/engine';

export type Purpose = 'weekend' | 'live' | 'rent';
export type StyleChoice = 'aframe' | 'gable' | 'gambrel' | 'modern' | 'auto';
/** Estilo de fato usado pelo gerador (o "moderno" vira meia-água ou telhado plano). */
export type StyleKind = 'aframe' | 'gable' | 'gambrel' | 'shed' | 'flat';
export type MezzChoice = 'none' | 'sleep' | 'living';
export type WingsChoice = 'none' | 'one' | 'two';
export type KitchenChoice = 'integrated' | 'separate';
export type LaundryChoice = 'inside' | 'outside' | 'none';
export type DeckChoice = 'none' | 'front' | 'covered';
export type TerrainChoice = 'flat' | 'gentle' | 'steep' | 'custom';
export type StructureChoice = 'steel' | 'wood' | 'any';
export type BudgetBand = 'upto150' | 'b150_250' | 'b250_400' | 'over400' | 'unknown';

export interface WizardAnswers {
  purpose: Purpose;
  /** Pessoas que vão dormir (1 a 10). */
  people: number;
  /** Quartos (1 a 4). */
  bedrooms: number;
  style: StyleChoice;
  /** Quando o estilo é "moderno": meia-água ou telhado plano. */
  modernRoof: 'shed' | 'flat';
  mezzanine: MezzChoice;
  /** Banheiros no térreo (1 ou 2). */
  bathrooms: 1 | 2;
  /** Um banheiro a mais no mezanino (leva a torre da caixa d'água). */
  bathUp: boolean;
  wings: WingsChoice;
  kitchen: KitchenChoice;
  laundry: LaundryChoice;
  deck: DeckChoice;
  terrain: TerrainChoice;
  /** Inclinação do terreno em % (0 a 60), usada quando `terrain` é 'custom'. */
  slopePct?: number;
  uf: UF;
  mountain: boolean;
  structure: StructureChoice;
  solar: boolean;
  rainwater: boolean;
  furnish: boolean;
  installations: boolean;
  budget: BudgetBand;
  /** Nome do projeto (opcional; o gerador sugere um). */
  name?: string;
}

export const MAX_BEDROOMS = 4;
export const MAX_PEOPLE = 10;
export const MAX_SLOPE_PCT = 60;
/** Inclinação padrão sugerida ao escolher "Eu sei a inclinação". */
export const DEFAULT_CUSTOM_SLOPE_PCT = 12;

/** % para graus (12% ≈ 6,8°). */
export const pctToDeg = (pct: number): number => (Math.atan(pct / 100) * 180) / Math.PI;
/** Graus para %. */
export const degToPct = (deg: number): number => Math.tan((deg * Math.PI) / 180) * 100;

export const BUDGET_BANDS: { value: BudgetBand; label: string; max: number | null }[] = [
  { value: 'upto150', label: 'Até R$ 150 mil', max: 150_000 },
  { value: 'b150_250', label: 'R$ 150 a 250 mil', max: 250_000 },
  { value: 'b250_400', label: 'R$ 250 a 400 mil', max: 400_000 },
  { value: 'over400', label: 'Acima de R$ 400 mil', max: Infinity },
  { value: 'unknown', label: 'Não sei ainda', max: null },
];

/** Teto da faixa (R$) ou null quando a pessoa não sabe. */
export const budgetCeiling = (b: BudgetBand): number | null => BUDGET_BANDS.find((x) => x.value === b)?.max ?? null;

/** Quartos sugeridos para o número de pessoas (2 por quarto). */
export const suggestedBedrooms = (people: number): number => Math.min(MAX_BEDROOMS, Math.max(1, Math.ceil(people / 2)));

export const DEFAULT_ANSWERS: WizardAnswers = {
  purpose: 'weekend',
  people: 2,
  bedrooms: 1,
  style: 'auto',
  modernRoof: 'shed',
  mezzanine: 'sleep',
  bathrooms: 1,
  bathUp: false,
  wings: 'none',
  kitchen: 'integrated',
  laundry: 'none',
  deck: 'front',
  terrain: 'flat',
  uf: 'SP',
  mountain: false,
  structure: 'any',
  solar: false,
  rainwater: false,
  furnish: true,
  installations: true,
  budget: 'unknown',
};

/** Ajusta respostas incoerentes (número de quartos, limites) sem mudar o que a pessoa escolheu de propósito. */
export function normalizeAnswers(a: WizardAnswers): WizardAnswers {
  const clampI = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number.isFinite(n) ? n : lo)));
  const slope = a.slopePct === undefined || !Number.isFinite(a.slopePct) ? undefined : Math.min(MAX_SLOPE_PCT, Math.max(0, a.slopePct));
  const { slopePct: _drop, ...rest } = a;
  void _drop;
  return { ...rest, people: clampI(a.people, 1, MAX_PEOPLE), bedrooms: clampI(a.bedrooms, 1, MAX_BEDROOMS), ...(slope === undefined ? {} : { slopePct: slope }) };
}
