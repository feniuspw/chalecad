/**
 * Modelos prontos do "Novo projeto": projetos completos (cômodos, acabamentos, móveis), validados por `Project.parse`.
 * A estrutura vem de cada modelo; os móveis vão depois do ajuste às normas, pela busca do assistente (`autoFurnishProject`).
 * Área e custo são constantes só para exibição nos cartões; o teste os confere com o motor (custo: tolerância de 15%).
 */
import type { Project, TypologyKind } from '@chalecad/engine';
import { getCatalog } from '@chalecad/catalog';
import type { IdGen } from '../ids';
import { planNormFixes } from '../normfix';
import { ensureDaylight } from '../wizard/daylight';
import { autoFurnishProject } from './builder';
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

/**
 * Mesma conformidade do assistente: janelas pela área de cada cômodo (iluminação 1/6, ventilação 1/12) e o
 * "Ajustar às normas" nos perfis. Os móveis já estão na geometria final do modelo.
 */
function conformPreset(p: Project, ids: IdGen): Project {
  const catalog = getCatalog();
  let out = planNormFixes(p, catalog, ids).project;
  out = structuredClone(out);
  ensureDaylight(out, catalog, ids);
  return planNormFixes(out, catalog, ids).project;
}

/**
 * IDs sequenciais por chamada: o mesmo modelo gera sempre o mesmo projeto. Como a busca de móveis custa algumas
 * centenas de milissegundos, o primeiro resultado fica guardado e cada chamada devolve uma cópia nova.
 */
function withIds(make: (ids: IdGen) => Project): () => Project {
  let cached: Project | undefined;
  return () => {
    if (!cached) {
      const ids = seq();
      cached = autoFurnishProject(conformPreset(make(ids), ids), ids);
    }
    return structuredClone(cached);
  };
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
    area: 60.3,
    bedrooms: 1,
    estimatedCost: 180000,
    build: withIds(aframeCompact),
  },
  {
    id: 'aframe-wings',
    name: 'A-frame com cômodos laterais',
    description: 'Quarto de um lado, cozinha e banheiro do outro, sala no vão central e mezanino.',
    kind: 'a_frame',
    area: 86.7,
    bedrooms: 2,
    estimatedCost: 262000,
    build: withIds(aframeWings),
  },
  {
    id: 'gable-loft',
    name: 'Chalé duas águas 6,5 × 8,5',
    description: 'Sala e cozinha na frente, quarto e banheiro nos fundos, mezanino de estar e deck coberto.',
    kind: 'gable_mezzanine',
    area: 74.1,
    bedrooms: 1,
    estimatedCost: 192000,
    build: withIds(gableLoft),
  },
  {
    id: 'gambrel-cabin',
    name: 'Cabana gambrel 6 × 7',
    description: 'Telhado de celeiro com loft para dormir, sala e cozinha integradas e banheiro.',
    kind: 'gambrel',
    area: 57.6,
    bedrooms: 1,
    estimatedCost: 164000,
    build: withIds(gambrelCabin),
  },
  {
    id: 'l-house',
    name: 'Casa em L de 2 quartos',
    description: 'Sala e cozinha no corpo principal e ala com dois quartos e corredor.',
    kind: 'combined',
    area: 71.3,
    bedrooms: 2,
    estimatedCost: 223000,
    build: withIds(lHouse),
  },
];

export const findPreset = (id: string): Preset | undefined => PRESETS.find((p) => p.id === id);
