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

export const BRACING_LABELS = { osb: 'OSB estrutural nas faces externas', strap: 'Fitas de aço em X' } as const;
