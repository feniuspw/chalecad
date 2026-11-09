/**
 * Tabela única dos atalhos do editor. O trilho de ferramentas, o registro de teclas do `EditorShell` e o diálogo
 * de ajuda (`ShortcutsDialog`) leem daqui. Um teste confere que não há tecla repetida no mesmo contexto e que as
 * letras das ferramentas batem com as registradas em `hooks/useShortcuts`.
 */
import type { Tool } from '@/lib/store/types';

export type ShortcutGroup = 'Ferramentas' | 'Edição' | 'Vista' | 'Móveis' | 'Apresentação';
/** Onde o atalho vale: `editor` = sempre; `furniture` = com a ferramenta Móveis; `presentation` = no modo Apresentação. */
export type ShortcutContext = 'editor' | 'furniture' | 'presentation';

export interface Shortcut {
  id: string;
  group: ShortcutGroup;
  context: ShortcutContext;
  /** Combinações alternativas, ex.: `['Mod+Z']`, `['Delete', 'Backspace']`. `Mod` = ⌘ no Mac, Ctrl nos demais. Mouse: texto livre. */
  keys: string[];
  label: string;
  /** Ferramenta ativada pela tecla (grupo Ferramentas). */
  tool?: Tool;
  /** Gesto de mouse (não entra na checagem de teclas repetidas). */
  mouse?: boolean;
  /** As teclas valem juntas (W, A, S e D), não como alternativas. */
  together?: boolean;
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = ['Ferramentas', 'Edição', 'Vista', 'Móveis', 'Apresentação'];

export const SHORTCUTS: readonly Shortcut[] = [
  // Ferramentas
  { id: 'tool-select', group: 'Ferramentas', context: 'editor', keys: ['V'], label: 'Selecionar', tool: 'select' },
  { id: 'tool-wall', group: 'Ferramentas', context: 'editor', keys: ['W'], label: 'Parede (digite a medida e Enter)', tool: 'wall' },
  { id: 'tool-rect', group: 'Ferramentas', context: 'editor', keys: ['R'], label: 'Retângulo (4 paredes e cômodo)', tool: 'rect' },
  { id: 'tool-opening', group: 'Ferramentas', context: 'editor', keys: ['O'], label: 'Abertura (porta, janela, claraboia)', tool: 'opening' },
  { id: 'tool-stair', group: 'Ferramentas', context: 'editor', keys: ['E'], label: 'Escada', tool: 'stair' },
  { id: 'tool-mezzanine', group: 'Ferramentas', context: 'editor', keys: ['M'], label: 'Mezanino', tool: 'mezzanine' },
  { id: 'tool-room', group: 'Ferramentas', context: 'editor', keys: ['A'], label: 'Cômodo (ambiente)', tool: 'room' },
  { id: 'tool-furniture', group: 'Ferramentas', context: 'editor', keys: ['F'], label: 'Móveis', tool: 'furniture' },
  { id: 'tool-dimension', group: 'Ferramentas', context: 'editor', keys: ['C'], label: 'Cota', tool: 'dimension' },
  { id: 'tool-terrain', group: 'Ferramentas', context: 'editor', keys: ['G'], label: 'Aplainar área no terreno inclinado (retângulo ou polígono; muros de arrimo sugeridos)', tool: 'terrain' },
  { id: 'tool-measure', group: 'Ferramentas', context: 'editor', keys: ['T'], label: 'Medir (trena)', tool: 'measure' },
  { id: 'plumb-layer', group: 'Ferramentas', context: 'editor', keys: ['H'], label: 'Camada Hidráulica na planta (tubos, pontos de água, pressão); a paleta tem ponto, caixa e tubos' },
  { id: 'lot-layer', group: 'Ferramentas', context: 'editor', keys: ['L'], label: 'Camada Lote na planta (contorno, recuos cotados, fossa e poço)' },
  { id: 'approval', group: 'Ferramentas', context: 'editor', keys: ['Shift+A'], label: 'Abrir a tela Aprovação (dados legais, verificação normativa, ART/RRT e pacote)' },
  // "E" já é a Escada: a camada Elétrica da planta usa Shift+E (não conflita: os atalhos de ferramenta ignoram o Shift)
  { id: 'elec-layer', group: 'Ferramentas', context: 'editor', keys: ['Shift+E'], label: 'Camada Elétrica na planta (tomadas, luz, interruptores, eletrodutos)' },

  // Edição
  { id: 'undo', group: 'Edição', context: 'editor', keys: ['Mod+Z'], label: 'Desfazer' },
  { id: 'redo', group: 'Edição', context: 'editor', keys: ['Shift+Mod+Z', 'Mod+Y'], label: 'Refazer' },
  { id: 'delete', group: 'Edição', context: 'editor', keys: ['Delete', 'Backspace'], label: 'Excluir a seleção' },
  { id: 'escape', group: 'Edição', context: 'editor', keys: ['Esc'], label: 'Cancelar o desenho, limpar a seleção ou voltar a Selecionar' },
  { id: 'ortho', group: 'Edição', context: 'editor', keys: ['Shift'], label: 'Trava o ângulo em múltiplos de 15° ao desenhar parede, retângulo (quadrado), caminho ou medida (segurar)' },
  { id: 'nosnap', group: 'Edição', context: 'editor', keys: ['Alt'], label: 'Desliga o encaixe (snap) ao desenhar ou arrastar (segurar)' },
  { id: 'finish', group: 'Edição', context: 'editor', keys: ['Enter'], label: 'Concluir o caminho de cerca/muro ou o encadeamento de paredes' },
  { id: 'typed', group: 'Edição', context: 'editor', keys: ['3,5', '3,5;90', '3x4'], together: true, label: 'Desenhando parede ou retângulo: digite comprimento, comprimento;ângulo ou LxA e Enter', mouse: true },
  { id: 'draw-close', group: 'Edição', context: 'editor', keys: ['Clique no ponto inicial'], label: 'Fecha o contorno de paredes e pergunta o uso do cômodo', mouse: true },
  { id: 'draw-drag', group: 'Edição', context: 'editor', keys: ['Arrastar alça'], label: 'Selecionar + parede: arrasta a ponta (ligadas acompanham) ou o meio (desloca em paralelo)', mouse: true },
  { id: 'elec-light-grid', group: 'Edição', context: 'editor', keys: ['Shift + clique'], label: 'Elétrica, ferramenta Luz: grade automática de luminárias no cômodo, até o lux alvo', mouse: true },
  { id: 'elec-control', group: 'Edição', context: 'editor', keys: ['Interruptor + clique na luz'], label: 'Elétrica: com um interruptor selecionado, clicar nas luzes liga e desliga o comando', mouse: true },
  { id: 'help', group: 'Edição', context: 'editor', keys: ['?'], label: 'Mostrar esta lista de atalhos' },

  // Vista
  { id: 'orbit', group: 'Vista', context: 'editor', keys: ['Arrastar'], label: 'Girar a câmera (3D)', mouse: true },
  { id: 'pan', group: 'Vista', context: 'editor', keys: ['Botão direito + arrastar'], label: 'Deslocar a vista', mouse: true },
  { id: 'zoom', group: 'Vista', context: 'editor', keys: ['Roda'], label: 'Aproximar e afastar (até o cursor)', mouse: true },
  { id: 'panel-left', group: 'Vista', context: 'editor', keys: ['['], label: 'Recolher/mostrar Propriedades' },
  { id: 'panel-right', group: 'Vista', context: 'editor', keys: [']'], label: 'Recolher/mostrar Resultados' },
  { id: 'panel-both', group: 'Vista', context: 'editor', keys: ['\\'], label: 'Esconder/mostrar os dois painéis (só o 3D)' },

  // Móveis
  { id: 'furn-rotate', group: 'Móveis', context: 'furniture', keys: ['R'], label: 'Girar 90° o móvel em colocação ou selecionado' },
  { id: 'furn-free', group: 'Móveis', context: 'furniture', keys: ['Alt'], label: 'Soltar sem encaixar na parede (segurar)' },
  { id: 'furn-duplicate', group: 'Móveis', context: 'furniture', keys: ['Mod+D'], label: 'Duplicar o móvel selecionado' },
  { id: 'furn-delete', group: 'Móveis', context: 'furniture', keys: ['Delete', 'Backspace'], label: 'Excluir o móvel selecionado' },
  { id: 'furn-end', group: 'Móveis', context: 'furniture', keys: ['Esc'], label: 'Encerrar a colocação' },

  // Apresentação
  { id: 'walk-move', group: 'Apresentação', context: 'presentation', keys: ['W', 'A', 'S', 'D'], together: true, label: 'Andar por dentro (também as setas)' },
  { id: 'walk-run', group: 'Apresentação', context: 'presentation', keys: ['Shift'], label: 'Correr (segurar)' },
  { id: 'walk-exit', group: 'Apresentação', context: 'presentation', keys: ['Esc'], label: 'Sair da visão em primeira pessoa' },
];

/** Letra (maiúscula) da ferramenta, para o tooltip do trilho. */
export function toolShortcut(tool: Tool): string {
  return SHORTCUTS.find((s) => s.tool === tool)?.keys[0] ?? '';
}

/** Letra minúscula -> ferramenta, para registrar as teclas. */
export const TOOL_KEY_MAP: Readonly<Record<string, Tool>> = Object.fromEntries(
  SHORTCUTS.flatMap((s) => (s.tool && s.keys[0] ? [[s.keys[0].toLowerCase(), s.tool] as const] : [])),
);

/** Combinações repetidas dentro de um mesmo contexto (vazio = tabela consistente). Gestos de mouse não contam. */
export function duplicateKeys(list: readonly Shortcut[] = SHORTCUTS): string[] {
  const seen = new Map<string, string>();
  const dups: string[] = [];
  for (const s of list) {
    if (s.mouse) continue;
    for (const k of s.keys) {
      const key = `${s.context}:${k.toLowerCase()}`;
      const prev = seen.get(key);
      if (prev) dups.push(`${s.context}: "${k}" em ${prev} e ${s.id}`);
      else seen.set(key, s.id);
    }
  }
  return dups;
}

/** Teclas como mostradas na tela: `Mod` vira ⌘ (Mac) ou Ctrl; `Shift` vira ⇧ no Mac. Devolve um item por tecla. */
export function keyCaps(combo: string, mac: boolean): string[] {
  return combo.split('+').map((k) => {
    if (k === 'Mod') return mac ? '⌘' : 'Ctrl';
    if (k === 'Shift' && mac) return '⇧';
    if (k === 'Alt' && mac) return '⌥';
    return k;
  });
}

export const groupShortcuts = (group: ShortcutGroup, list: readonly Shortcut[] = SHORTCUTS) => list.filter((s) => s.group === group);
