/** Escolha do estilo: recomendação ("Me ajude a escolher") e o que cada estilo comporta. */
import type { MezzChoice, StyleKind, WizardAnswers } from './answers';
import { budgetCeiling } from './answers';

export const STYLE_NAMES: Record<StyleKind, string> = {
  aframe: 'A-frame',
  gable: 'Chalé tradicional',
  gambrel: 'Celeiro',
  shed: 'Moderno (uma água)',
  flat: 'Moderno (telhado plano)',
};

/** Estilos que comportam mezanino neste gerador. */
export const supportsMezzanine = (k: StyleKind) => k === 'aframe' || k === 'gable' || k === 'gambrel';

export interface StyleResolution {
  kind: StyleKind;
  /** Frase simples explicando a recomendação (só quando a pessoa pediu ajuda). */
  why?: string;
}

/** Estilo de fato usado. Em "Me ajude a escolher": pelo número de quartos e pelo orçamento. */
export function resolveStyle(a: Pick<WizardAnswers, 'style' | 'modernRoof' | 'bedrooms' | 'budget'>): StyleResolution {
  switch (a.style) {
    case 'aframe':
      return { kind: 'aframe' };
    case 'gable':
      return { kind: 'gable' };
    case 'gambrel':
      return { kind: 'gambrel' };
    case 'modern':
      return { kind: a.modernRoof };
    case 'auto': {
      const ceiling = budgetCeiling(a.budget);
      const tight = ceiling !== null && ceiling <= 150_000;
      if (a.bedrooms >= 3) return { kind: 'shed', why: `Com ${a.bedrooms} quartos, uma caixa retangular com telhado de uma água é o jeito mais simples e barato de ter todos os cômodos com janela.` };
      if (tight && a.bedrooms === 2) return { kind: 'shed', why: 'Para caber no orçamento com 2 quartos, a caixa retangular com uma água é a mais econômica: parede reta e telhado simples.' };
      if (a.bedrooms === 1 && !tight) return { kind: 'aframe', why: 'Para 1 quarto, o A-frame é o clássico de chalé: o telhado vai até o chão, a frente é toda de vidro e o quarto fica no mezanino.' };
      if (a.bedrooms === 1) return { kind: 'gambrel', why: 'Para 1 quarto com orçamento apertado, o celeiro dá bastante volume no alto (loft para dormir) com paredes simples.' };
      return { kind: 'gable', why: 'Para 2 quartos, o chalé de duas águas com mezanino é o equilíbrio clássico entre conforto e custo.' };
    }
  }
}

/** Mezanino que de fato entra no projeto (estilos sem mezanino ignoram a escolha). */
export function effectiveMezzanine(a: WizardAnswers): MezzChoice {
  return supportsMezzanine(resolveStyle(a).kind) ? a.mezzanine : 'none';
}
