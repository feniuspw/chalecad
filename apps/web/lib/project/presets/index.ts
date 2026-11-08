/**
 * Modelos prontos do "Novo projeto": projetos completos (cômodos, acabamentos, móveis), validados por `Project.parse`.
 * Área e custo são constantes só para exibição nos cartões; o teste os confere com o motor (custo: tolerância de 15%).
 */
import type { Project, TypologyKind } from '@chalecad/engine';
import type { IdGen } from '../ids';
import { aframeCompact } from './aframe-compact';
import { aframeWings } from './aframe-wings';
import { gableLoft } from './gable-loft';
import { gambrelCabin } from './gambrel-cabin';
import { lHouse } from './l-house';

export interface Preset {
  id: string;
  name: string;
  /** Uma frase para o cartão. */
  description: string;
  kind: TypologyKind;
  /** Área construída (m²), para exibição. */
  area: number;
  bedrooms: number;
  /** Total do orçamento (R$, base de preços padrão), para exibição. Conferido em teste. */
  estimatedCost: number;
  /** Projeto novo a cada chamada (IDs sequenciais, sem estado compartilhado). */
  build: () => Project;
}

const seq = (): IdGen => {
  const n: Record<string, number> = {};
  return (p) => `${p}-${(n[p] = (n[p] ?? 0) + 1)}`;
};

export const PRESETS: readonly Preset[] = [
  {
    id: 'aframe-compact',
    name: 'A-frame compacto 6 × 8',
    description: 'Fachada de vidro, mezanino com a cama, cozinha e banheiro sob ele e forro de lambri.',
    kind: 'a_frame',
    area: 60.8,
    bedrooms: 1,
    estimatedCost: 172000,
    build: () => aframeCompact(seq()),
  },
  {
    id: 'aframe-wings',
    name: 'A-frame com cômodos laterais',
    description: 'Quarto de um lado, cozinha e banheiro do outro, sala no vão central e mezanino.',
    kind: 'a_frame',
    area: 87.1,
    bedrooms: 2,
    estimatedCost: 247000,
    build: () => aframeWings(seq()),
  },
  {
    id: 'gable-loft',
    name: 'Chalé duas águas 6,5 × 8,5',
    description: 'Sala e cozinha na frente, quarto e banheiro nos fundos, mezanino de estar e deck coberto.',
    kind: 'gable_mezzanine',
    area: 78,
    bedrooms: 1,
    estimatedCost: 189000,
    build: () => gableLoft(seq()),
  },
  {
    id: 'gambrel-cabin',
    name: 'Cabana gambrel 6 × 7',
    description: 'Telhado de celeiro com loft para dormir, sala e cozinha integradas e banheiro.',
    kind: 'gambrel',
    area: 57.6,
    bedrooms: 1,
    estimatedCost: 147000,
    build: () => gambrelCabin(seq()),
  },
  {
    id: 'l-house',
    name: 'Casa em L de 2 quartos',
    description: 'Sala e cozinha no corpo principal e ala com dois quartos e corredor.',
    kind: 'combined',
    area: 71.3,
    bedrooms: 2,
    estimatedCost: 214000,
    build: () => lHouse(seq()),
  },
];

export const findPreset = (id: string): Preset | undefined => PRESETS.find((p) => p.id === id);
