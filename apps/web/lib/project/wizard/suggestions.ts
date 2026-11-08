/**
 * Custo estimado do chalé do assistente e sugestões de corte. Cada sugestão é calculada de verdade: roda o gerador
 * sem aquela opção e o motor de orçamento, e a economia é a diferença dos totais.
 */
import { computeAll, type Project } from '@chalecad/engine';
import { getCatalog, type Catalog } from '@chalecad/catalog';
import { budgetCeiling, type WizardAnswers } from './answers';
import { generateProject } from './generate';
import { resolveStyle } from './style';

export interface CostRange {
  /** Total com contingência, preços mínimos (R$). */
  min: number;
  /** Total com contingência, preços máximos (R$). */
  max: number;
}

export function costOfProject(project: Project, catalog: Catalog = getCatalog()): CostRange {
  const r = computeAll(project, catalog);
  return { min: r.budget.total, max: r.budget.totalMax };
}

export interface CutSuggestion {
  id: string;
  /** Frase simples, com o valor calculado. */
  text: string;
  /** Economia no total (R$, preços mínimos). */
  saving: number;
  /** Respostas com o corte aplicado (para o botão "aplicar"). */
  answers: WizardAnswers;
}

export type BudgetStatus = 'unknown' | 'within' | 'over';

export function budgetStatus(a: WizardAnswers, cost: CostRange): { status: BudgetStatus; ceiling: number | null; over: number } {
  const ceiling = budgetCeiling(a.budget);
  if (ceiling === null) return { status: 'unknown', ceiling, over: 0 };
  if (!Number.isFinite(ceiling)) return { status: 'within', ceiling, over: 0 };
  // dentro da faixa se o preço mínimo cabe; "acima" quando nem o mínimo cabe
  return cost.min <= ceiling ? { status: 'within', ceiling, over: 0 } : { status: 'over', ceiling, over: cost.min - ceiling };
}

const brl = (n: number) => `R$ ${(Math.round(n / 1000) * 1000).toLocaleString('pt-BR')}`;

interface Cut {
  id: string;
  applies: (a: WizardAnswers) => boolean;
  apply: (a: WizardAnswers) => WizardAnswers;
  text: (saving: number, a: WizardAnswers) => string;
}

const CUTS: Cut[] = [
  {
    id: 'bathUp',
    applies: (a) => a.bathUp,
    apply: (a) => ({ ...a, bathUp: false }),
    text: (s) => `Tirar o banheiro de cima (e a torre da caixa d'água) economiza ~${brl(s)}.`,
  },
  {
    id: 'bath2',
    applies: (a) => a.bathrooms === 2,
    apply: (a) => ({ ...a, bathrooms: 1 }),
    text: (s) => `Ficar com 1 banheiro só economiza ~${brl(s)}.`,
  },
  {
    id: 'bedroom',
    applies: (a) => a.bedrooms > 1,
    apply: (a) => ({ ...a, bedrooms: a.bedrooms - 1 }),
    text: (s, a) => `Ter ${a.bedrooms - 1} ${a.bedrooms - 1 === 1 ? 'quarto' : 'quartos'} em vez de ${a.bedrooms} economiza ~${brl(s)}.`,
  },
  {
    id: 'laundry',
    applies: (a) => a.laundry === 'inside',
    apply: (a) => ({ ...a, laundry: 'outside' }),
    text: (s) => `Levar a lavanderia para uma área externa coberta economiza ~${brl(s)}.`,
  },
  {
    id: 'laundryNone',
    applies: (a) => a.laundry !== 'none',
    apply: (a) => ({ ...a, laundry: 'none' }),
    text: (s) => `Dispensar a lavanderia economiza ~${brl(s)}.`,
  },
  {
    id: 'deckRoof',
    applies: (a) => a.deck === 'covered',
    apply: (a) => ({ ...a, deck: 'front' }),
    text: (s) => `Deixar a varanda sem telhado economiza ~${brl(s)}.`,
  },
  {
    id: 'deck',
    applies: (a) => a.deck !== 'none',
    apply: (a) => ({ ...a, deck: 'none' }),
    text: (s) => `Tirar a varanda economiza ~${brl(s)}.`,
  },
  {
    id: 'wings',
    applies: (a) => a.wings === 'two',
    apply: (a) => ({ ...a, wings: 'one' }),
    text: (s) => `Usar só um lado do A-frame para os cômodos extras economiza ~${brl(s)}.`,
  },
  {
    id: 'kitchen',
    applies: (a) => a.kitchen === 'separate',
    apply: (a) => ({ ...a, kitchen: 'integrated' }),
    text: (s) => `Integrar a cozinha com a sala (sem parede) economiza ~${brl(s)}.`,
  },
  {
    id: 'mezz',
    applies: (a) => a.mezzanine !== 'none' && ['aframe', 'gable', 'gambrel'].includes(resolveStyle(a).kind),
    apply: (a) => ({ ...a, mezzanine: 'none', bathUp: false }),
    text: (s) => `Tirar o mezanino economiza ~${brl(s)}.`,
  },
  {
    id: 'solar',
    applies: (a) => a.solar,
    apply: (a) => ({ ...a, solar: false }),
    text: (s) => `Deixar a energia solar para depois economiza ~${brl(s)}.`,
  },
  {
    id: 'rain',
    applies: (a) => a.rainwater,
    apply: (a) => ({ ...a, rainwater: false }),
    text: (s) => `Deixar o aproveitamento da água da chuva para depois economiza ~${brl(s)}.`,
  },
  {
    id: 'modern',
    applies: (a) => resolveStyle(a).kind !== 'shed' && resolveStyle(a).kind !== 'flat',
    apply: (a) => ({ ...a, style: 'modern', modernRoof: 'shed', mezzanine: 'none', bathUp: false }),
    text: (s) => `Trocar para uma caixa moderna de uma água (sem mezanino) economiza ~${brl(s)}.`,
  },
];

/** Cortes que de fato baixam o custo, do que mais economiza para o que menos. Mínimo de R$ 1.000 de economia. */
export function cutSuggestions(a: WizardAnswers, base?: CostRange, catalog: Catalog = getCatalog(), limit = 4): CutSuggestion[] {
  const cost = base ?? costOfProject(generateProject(a, catalog).project, catalog);
  const out: CutSuggestion[] = [];
  for (const cut of CUTS) {
    if (!cut.applies(a)) continue;
    const next = cut.apply(a);
    let c: CostRange;
    try {
      c = costOfProject(generateProject(next, catalog).project, catalog);
    } catch {
      continue;
    }
    const saving = cost.min - c.min;
    if (saving >= 1000) out.push({ id: cut.id, text: cut.text(saving, a), saving, answers: next });
  }
  return out.sort((x, y) => y.saving - x.saving).slice(0, limit);
}
