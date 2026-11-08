/**
 * Contrato do estado do editor (Zustand + Immer). Escrito pelo orquestrador: os cards da web
 * implementam `lib/store/editor.ts` seguindo exatamente estes tipos. Mudanças aqui só pela sessão orquestradora.
 */
import type { Patch } from 'immer';
import type { EngineWarning, Project, Results } from '@chalecad/engine';

/** Modo de visualização da cena. `heatmap` só depois do motor estrutural (Fase 2). */
export type ViewMode = 'finished' | 'skeleton' | 'exploded' | 'heatmap' | 'presentation';

/** Sol do modo apresentação: data (AAAA-MM-DD) e hora local em minutos desde 0h. */
export interface SunState {
  date: string;
  minutes: number;
}

/** Câmera: 3D orbital ou ortográficas 2D. `plan` mostra o nível ativo em planta. */
export type CameraView = '3d' | 'plan' | 'front' | 'back' | 'left' | 'right';

export type Tool = 'select' | 'wall' | 'opening' | 'stair' | 'mezzanine' | 'measure' | 'dimension' | 'room' | 'furniture';

export type SelectionKind = 'host' | 'opening' | 'wall' | 'stair' | 'level' | 'extra' | 'piece' | 'roof' | 'slab' | 'room' | 'furniture';
export interface Selection {
  kind: SelectionKind;
  id: string;
}

/** Destaque vindo do painel de resultados (linha de material, alerta, verificação estrutural). */
export interface Highlight {
  pieceIds: string[];
  hostIds: string[];
  /** Origem, para o painel saber qual linha está ativa. */
  source: string;
}

export interface HistoryEntry {
  label: string;
  patches: Patch[];
  inversePatches: Patch[];
  at: number;
}

export interface ToolOptions {
  openingType: 'door' | 'window' | 'sliding_door' | 'skylight';
  openingWidth: number;
  openingHeight: number;
  openingSill: number;
  stairType: 'straight' | 'l_shape' | 'ladder';
  wallWet: boolean;
  /** Snap: grade de 10 cm e modulação dos montantes. */
  snapGrid: boolean;
  snapModulation: boolean;
  /** Ferramenta Móvel: item do catálogo a posicionar (`furn_*`). */
  furnitureItem: string;
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface EditorState {
  /** Projeto atual (sempre o último estado editado, mesmo se inválido). */
  project: Project;
  /** Problemas de validação do último estado (vazio = válido). */
  issues: ValidationIssue[];
  /** Resultado do último cálculo válido. */
  results: Results | null;
  computing: boolean;
  computeError: string | null;
  /** Revisão do projeto (incrementa a cada mudança) e a última revisão calculada. */
  revision: number;
  computedRevision: number;

  selection: Selection | null;
  hoverId: string | null;
  highlight: Highlight | null;

  viewMode: ViewMode;
  sun: SunState;
  /** Câmera em primeira pessoa (andar por dentro) no modo apresentação. */
  walk: boolean;
  cameraView: CameraView;
  activeLevelId: string;
  tool: Tool;
  toolOptions: ToolOptions;

  past: HistoryEntry[];
  future: HistoryEntry[];

  /** ID do projeto no armazenamento (IndexedDB/SQLite); null = ainda não salvo. */
  projectId: string | null;
  dirty: boolean;
  lastSavedAt: number | null;
}

export interface EditorActions {
  /** Substitui o projeto inteiro (abrir, novo, importar). Limpa histórico. */
  loadProject(project: Project, opts?: { projectId?: string | null }): void;
  /** Edição com histórico: a receita muta um rascunho Immer. Label aparece no undo ("Mover parede"). */
  update(label: string, recipe: (draft: Project) => void): void;
  /** Igual a update, mas funde com a última entrada se tiver o mesmo label e < 600 ms (arrastar slider). */
  updateCoalesced(label: string, recipe: (draft: Project) => void): void;
  /** Aplica patches JSON (Immer) vindos da IA, com histórico. */
  applyPatches(label: string, patches: Patch[]): void;
  undo(): void;
  redo(): void;

  select(sel: Selection | null): void;
  setHover(id: string | null): void;
  setHighlight(h: Highlight | null): void;
  setViewMode(m: ViewMode): void;
  setSun(sun: Partial<SunState>): void;
  setWalk(on: boolean): void;
  setCameraView(v: CameraView): void;
  setActiveLevel(id: string): void;
  setTool(t: Tool): void;
  setToolOptions(o: Partial<ToolOptions>): void;

  /** Chamado pelo orquestrador de cálculo (hook useEngine) com o resultado do worker. */
  setResults(revision: number, results: Results | null, error?: string | null): void;
  setComputing(v: boolean): void;
  markSaved(projectId: string, at: number): void;
}

export type EditorStore = EditorState & EditorActions;

/** API exposta pelo Web Worker via Comlink (`workers/engine.worker.ts`). */
export interface EngineWorkerApi {
  /** Valida e calcula. Nunca lança: erros voltam em `issues` ou `error`. */
  compute(
    project: unknown,
    opts?: { today?: string },
  ): Promise<
    | { ok: true; results: Results; ms: number }
    | { ok: false; issues: ValidationIssue[]; error?: string }
  >;
  /** Valida sem calcular (abrir arquivo). */
  validate(json: unknown): Promise<{ ok: true; project: Project } | { ok: false; issues: ValidationIssue[] }>;
  /** Calcula variantes (comparação, IA): devolve resultados resumidos na mesma ordem. */
  computeMany(projects: unknown[]): Promise<({ ok: true; results: Results } | { ok: false; issues: ValidationIssue[] })[]>;
}

export type { EngineWarning };
