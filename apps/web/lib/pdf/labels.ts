/** Rótulos em pt-BR compartilhados pelo PDF e pela página de projetos. */
import type { Stage, TypologyKind } from '@chalecad/engine';

export const TYPOLOGY_LABELS: Record<TypologyKind, string> = {
  gable_mezzanine: 'Duas águas com mezanino',
  a_frame: 'A-frame',
  shed: 'Meia-água',
  flat_roof: 'Telhado plano',
  gambrel: 'Gambrel (celeiro)',
  combined: 'Módulo em L ou T',
};

export const STAGE_LABELS: Record<Stage, string> = {
  terrain: 'Terraplenagem',
  foundation: 'Fundação (radier)',
  structure: 'Estrutura em LSF',
  closure: 'Fechamentos',
  roof: 'Cobertura',
  floor: 'Pisos',
  finishing: 'Acabamentos',
  installations: 'Instalações elétricas e hidráulicas',
  extras: 'Extras externos',
};

export const STAGE_ORDER: Stage[] = ['terrain', 'foundation', 'structure', 'closure', 'roof', 'floor', 'finishing', 'extras'];

/** Rótulo de etapa conforme o sistema construtivo (a estrutura muda de nome). */
export const stageLabel = (stage: Stage, structure: 'lsf' | 'wood'): string =>
  stage === 'structure' && structure === 'wood' ? 'Estrutura em wood frame (madeira)' : STAGE_LABELS[stage];

export const SYSTEM_LABELS = { lsf: 'Light Steel Frame', wood: 'Wood frame' } as const;
export const SYSTEM_PREMISES = {
  lsf: 'Light Steel Frame (ZAR 230)',
  wood: 'Wood frame (pinus tratado C25, NBR 7190)',
} as const;

export const BRACING_LABELS = { osb: 'OSB estrutural nas faces externas', strap: 'Fitas de aço em X' } as const;
