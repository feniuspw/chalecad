/**
 * Passos do tour guiado. Cada passo aponta para um elemento da tela por `data-tour="..."` ou, quando o elemento está
 * num componente que o tour não edita, por seletor + texto. Funções puras: o componente `Tour` só desenha.
 */
export interface TourTarget {
  selector: string;
  /** Texto que o elemento precisa conter (sem acento e sem diferença de maiúsculas). */
  text?: string;
}

export interface TourStep {
  id: string;
  title: string;
  body: string;
  /** Alvos em ordem de preferência: vale o primeiro que existir na tela. */
  targets: TourTarget[];
  /** Lado preferido do balão em relação ao elemento. */
  side: 'right' | 'left' | 'top' | 'bottom';
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'properties',
    title: 'Propriedades',
    body: 'Mude medidas, telhado, mezanino, aberturas e acabamentos aqui e veja tudo recalcular na hora: peças, materiais, peso e custo.',
    targets: [{ selector: '[data-tour="properties"]' }],
    side: 'right',
  },
  {
    id: 'toolbar',
    title: 'Ferramentas',
    body: 'Desenhe parede, abertura, escada, mezanino, cômodos e móveis. Cada ferramenta tem uma tecla de atalho (passe o mouse para ver).',
    targets: [{ selector: '[data-tour="toolbar"]' }],
    side: 'right',
  },
  {
    id: 'modes',
    title: 'Modos de visualização',
    body: 'Alterne entre Acabado, Estrutura, Explodido e Apresentação (sol real, sombras e passeio por dentro).',
    targets: [{ selector: '[data-tour="modes"]' }],
    side: 'top',
  },
  {
    id: 'results',
    title: 'Resultados',
    body: 'Custo, lista de materiais, orçamento por etapa, peso, estrutura e alertas, sempre atualizados com o projeto.',
    targets: [{ selector: '[data-tour="results"]' }],
    side: 'left',
  },
  {
    id: 'norms',
    title: 'Alertas e “Ajustar às normas”',
    body: 'Os alertas mostram o que foge das normas. “Ajustar às normas” aplica as correções possíveis de uma vez, e você pode desfazer.',
    targets: [{ selector: 'button', text: 'Ajustar às normas' }, { selector: '[role="tab"]', text: 'Alertas' }],
    side: 'left',
  },
  {
    id: 'export',
    title: 'Exportar',
    body: 'Baixe o PDF com plantas e lista, as planilhas CSV de compras e orçamento, o DXF para AutoCAD ou o JSON do projeto.',
    targets: [{ selector: '[data-tour="export"]' }, { selector: 'header button', text: 'Exportar' }],
    side: 'bottom',
  },
];

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Primeiro elemento que casa com o alvo (seletor e, se houver, texto). */
export function findTarget(root: ParentNode, t: TourTarget): Element | null {
  const list = Array.from(root.querySelectorAll(t.selector));
  if (!t.text) return list[0] ?? null;
  const want = norm(t.text);
  return list.find((el) => norm(el.textContent ?? '').includes(want)) ?? null;
}

/** Elemento do passo: o primeiro alvo que existe. */
export function resolveStep(root: ParentNode, step: TourStep): Element | null {
  for (const t of step.targets) {
    const el = findTarget(root, t);
    if (el) return el;
  }
  return null;
}

/** Só os passos cujo elemento existe (e tem tamanho). `resolve` é injetável para teste. */
export function visibleSteps<S extends { id: string }>(steps: readonly S[], resolve: (step: S) => { width: number; height: number } | null): S[] {
  return steps.filter((s) => {
    const el = resolve(s);
    return el !== null && el.width > 0 && el.height > 0;
  });
}

// ---------------------------------------------------------------------------
// Primeira abertura
// ---------------------------------------------------------------------------

export const TOUR_FLAG = 'chalecad.tour.v1';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

const browserStore = (): Store | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

/** O tour abre sozinho? Só se há armazenamento, a flag não existe e não é navegador automatizado (e2e). */
export function shouldAutoStart(store: Store | null = browserStore(), automated = typeof navigator !== 'undefined' && navigator.webdriver === true): boolean {
  if (!store || automated) return false;
  try {
    return store.getItem(TOUR_FLAG) === null;
  } catch {
    return false;
  }
}

export function markTourSeen(store: Store | null = browserStore()): void {
  try {
    store?.setItem(TOUR_FLAG, new Date().toISOString().slice(0, 10));
  } catch {
    /* sem armazenamento: o tour não abre sozinho de qualquer forma */
  }
}

// ---------------------------------------------------------------------------
// Posição do balão
// ---------------------------------------------------------------------------

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Placement {
  left: number;
  top: number;
  side: TourStep['side'];
}

/** Balão ao lado do elemento (`side` preferido; inverte se não couber) e sempre dentro da janela. */
export function placePopover(target: Box, pop: { width: number; height: number }, view: { width: number; height: number }, side: TourStep['side'], gap = 14, margin = 12): Placement {
  const fits = (s: TourStep['side']) => {
    switch (s) {
      case 'right':
        return target.x + target.width + gap + pop.width <= view.width - margin;
      case 'left':
        return target.x - gap - pop.width >= margin;
      case 'bottom':
        return target.y + target.height + gap + pop.height <= view.height - margin;
      case 'top':
        return target.y - gap - pop.height >= margin;
    }
  };
  const opposite: Record<TourStep['side'], TourStep['side']> = { right: 'left', left: 'right', top: 'bottom', bottom: 'top' };
  const order: TourStep['side'][] = [side, opposite[side], 'bottom', 'top', 'right', 'left'];
  const chosen = order.find(fits) ?? side;
  const cx = target.x + target.width / 2;
  const cy = target.y + target.height / 2;
  let left: number;
  let top: number;
  switch (chosen) {
    case 'right':
      left = target.x + target.width + gap;
      top = cy - pop.height / 2;
      break;
    case 'left':
      left = target.x - gap - pop.width;
      top = cy - pop.height / 2;
      break;
    case 'bottom':
      left = cx - pop.width / 2;
      top = target.y + target.height + gap;
      break;
    case 'top':
      left = cx - pop.width / 2;
      top = target.y - gap - pop.height;
      break;
  }
  return {
    left: Math.round(Math.min(Math.max(margin, left), Math.max(margin, view.width - pop.width - margin))),
    top: Math.round(Math.min(Math.max(margin, top), Math.max(margin, view.height - pop.height - margin))),
    side: chosen,
  };
}
