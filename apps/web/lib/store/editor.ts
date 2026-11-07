/**
 * Estado global do editor (Zustand + Immer). Implementa o contrato de `types.ts`.
 * Importações relativas de propósito: o módulo roda em Vitest (Node) sem alias do Next.
 */
import { useMemo } from 'react';
import { create } from 'zustand';
import { applyPatches as immerApplyPatches, enablePatches, produceWithPatches, type Patch } from 'immer';
import { loadProject, type Opening, type Project, type ResolvedOpening, type Stair, type Wall } from '@chalecad/engine';
import { createProject } from '../project/templates';
import { groundLevel } from '../project/edit';
import type {
  EditorStore,
  HistoryEntry,
  Selection,
  ToolOptions,
  ValidationIssue,
} from './types';

enablePatches();

export const COALESCE_MS = 600;

export const DEFAULT_TOOL_OPTIONS: ToolOptions = {
  openingType: 'window',
  openingWidth: 1.2,
  openingHeight: 1.0,
  openingSill: 1.0,
  stairType: 'straight',
  wallWet: false,
  snapGrid: true,
  snapModulation: true,
};

/** Valida o projeto e devolve problemas em pt-BR (vazio = válido). */
export function validateProject(project: unknown): ValidationIssue[] {
  const r = loadProject(project);
  return r.ok ? [] : r.issues;
}

/** Remove a seleção de objetos que deixaram de existir (excluídos, desfeitos). */
function pruneSelection(sel: Selection | null, project: Project): Selection | null {
  if (!sel) return null;
  switch (sel.kind) {
    case 'opening':
      return project.openings.some((o) => o.id === sel.id) ? sel : null;
    case 'wall':
      return project.walls.some((w) => w.id === sel.id) ? sel : null;
    case 'stair':
      return project.stairs.some((s) => s.id === sel.id) ? sel : null;
    case 'level':
      return project.levels.some((l) => l.id === sel.id) ? sel : null;
    case 'extra':
      return project.extras.some((e) => e.id === sel.id) ? sel : null;
    default:
      return sel;
  }
}

function initialState() {
  const project = createProject('gable_mezzanine');
  return {
    project,
    issues: [] as ValidationIssue[],
    results: null,
    computing: false,
    computeError: null,
    revision: 0,
    computedRevision: -1,
    selection: null,
    hoverId: null,
    highlight: null,
    viewMode: 'finished' as const,
    cameraView: '3d' as const,
    activeLevelId: groundLevel(project).id,
    tool: 'select' as const,
    toolOptions: DEFAULT_TOOL_OPTIONS,
    past: [] as HistoryEntry[],
    future: [] as HistoryEntry[],
    projectId: null,
    dirty: false,
    lastSavedAt: null,
  };
}

export const useEditor = create<EditorStore>()((set, get) => {
  /** Grava uma mudança de projeto no histórico (ou funde com a última entrada). */
  const commit = (label: string, next: Project, patches: Patch[], inverse: Patch[], coalesce: boolean) => {
    const s = get();
    const now = Date.now();
    const top = s.past[s.past.length - 1];
    let past: HistoryEntry[];
    if (coalesce && top && top.label === label && now - top.at < COALESCE_MS) {
      const merged: HistoryEntry = {
        label,
        patches: [...top.patches, ...patches],
        inversePatches: [...inverse, ...top.inversePatches],
        at: now,
      };
      past = [...s.past.slice(0, -1), merged];
    } else {
      past = [...s.past, { label, patches, inversePatches: inverse, at: now }];
    }
    const levelOk = next.levels.some((l) => l.id === s.activeLevelId);
    set({
      project: next,
      issues: validateProject(next),
      revision: s.revision + 1,
      past,
      future: [],
      dirty: true,
      selection: pruneSelection(s.selection, next),
      activeLevelId: levelOk ? s.activeLevelId : groundLevel(next).id,
    });
  };

  const edit = (label: string, recipe: (draft: Project) => void, coalesce: boolean) => {
    const [next, patches, inverse] = produceWithPatches(get().project, recipe);
    if (patches.length === 0) return;
    commit(label, next, patches, inverse, coalesce);
  };

  const travel = (patches: Patch[]) => {
    const s = get();
    const next = immerApplyPatches(s.project, patches);
    return {
      project: next,
      issues: validateProject(next),
      revision: s.revision + 1,
      dirty: true,
      selection: pruneSelection(s.selection, next),
      activeLevelId: next.levels.some((l) => l.id === s.activeLevelId) ? s.activeLevelId : groundLevel(next).id,
    };
  };

  return {
    ...initialState(),

    loadProject(project, opts) {
      const s = get();
      const projectId = opts?.projectId ?? null;
      set({
        project,
        issues: validateProject(project),
        results: null,
        computeError: null,
        computing: false,
        revision: s.revision + 1,
        selection: null,
        hoverId: null,
        highlight: null,
        activeLevelId: groundLevel(project).id,
        tool: 'select',
        past: [],
        future: [],
        projectId,
        // Projeto novo (sem id) ainda não está salvo: o autosave cria o registro.
        dirty: projectId === null,
        lastSavedAt: null,
      });
    },

    update(label, recipe) {
      edit(label, recipe, false);
    },
    updateCoalesced(label, recipe) {
      edit(label, recipe, true);
    },
    applyPatches(label, patches) {
      try {
        const [next, p, inv] = produceWithPatches(get().project, (d) => {
          immerApplyPatches(d, patches);
        });
        if (p.length === 0) return;
        commit(label, next, p, inv, false);
      } catch (e) {
        console.warn('[editor] patches inválidos ignorados:', e);
      }
    },

    undo() {
      const s = get();
      const entry = s.past[s.past.length - 1];
      if (!entry) return;
      const t = travel(entry.inversePatches);
      set({
        project: t.project,
        issues: t.issues,
        revision: t.revision,
        dirty: true,
        selection: t.selection,
        activeLevelId: t.activeLevelId,
        past: s.past.slice(0, -1),
        future: [...s.future, entry],
      });
    },
    redo() {
      const s = get();
      const entry = s.future[s.future.length - 1];
      if (!entry) return;
      const t = travel(entry.patches);
      set({
        project: t.project,
        issues: t.issues,
        revision: t.revision,
        dirty: true,
        selection: t.selection,
        activeLevelId: t.activeLevelId,
        future: s.future.slice(0, -1),
        past: [...s.past, entry],
      });
    },

    select: (selection) => set({ selection }),
    setHover: (hoverId) => set((s) => (s.hoverId === hoverId ? s : { hoverId })),
    setHighlight: (highlight) => set({ highlight }),
    setViewMode: (viewMode) => set({ viewMode }),
    setCameraView: (cameraView) => set({ cameraView }),
    setActiveLevel: (activeLevelId) => set({ activeLevelId }),
    setTool: (tool) => set({ tool }),
    setToolOptions: (o) => set((s) => ({ toolOptions: { ...s.toolOptions, ...o } })),

    setResults(revision, results, error = null) {
      const s = get();
      if (revision < s.computedRevision) return; // resposta antiga
      set({
        computedRevision: revision,
        results: results ?? s.results,
        computeError: error,
        computing: revision === s.revision ? false : s.computing,
      });
    },
    setComputing: (computing) => set({ computing }),
    markSaved: (projectId, at) => set({ projectId, lastSavedAt: at, dirty: false }),
  };
});

// ---------------------------------------------------------------------------
// Seletores
// ---------------------------------------------------------------------------

export const selectCanUndo = (s: EditorStore) => s.past.length > 0;
export const selectCanRedo = (s: EditorStore) => s.future.length > 0;
export const selectUndoLabel = (s: EditorStore) => s.past[s.past.length - 1]?.label ?? null;
export const selectRedoLabel = (s: EditorStore) => s.future[s.future.length - 1]?.label ?? null;
export const selectIsValid = (s: EditorStore) => s.issues.length === 0;

export type SelectedObject =
  | { kind: 'opening'; opening: Opening; resolved: ResolvedOpening | null }
  | { kind: 'wall'; wall: Wall }
  | { kind: 'stair'; stair: Stair }
  | { kind: 'host'; id: string }
  | { kind: 'roof'; id: string }
  | { kind: 'slab'; id: string }
  | { kind: 'level'; id: string }
  | { kind: 'extra'; id: string }
  | { kind: 'piece'; id: string };

/** Resolve a seleção para o objeto do projeto (ou null). Função pura, testável. */
export function resolveSelection(state: Pick<EditorStore, 'selection' | 'project' | 'results'>): SelectedObject | null {
  const sel = state.selection;
  if (!sel) return null;
  const { project } = state;
  switch (sel.kind) {
    case 'opening': {
      const opening = project.openings.find((o) => o.id === sel.id);
      if (!opening) return null;
      return { kind: 'opening', opening, resolved: state.results?.model.openings.find((o) => o.id === sel.id) ?? null };
    }
    case 'wall': {
      const wall = project.walls.find((w) => w.id === sel.id);
      return wall ? { kind: 'wall', wall } : null;
    }
    case 'stair': {
      const stair = project.stairs.find((s) => s.id === sel.id);
      return stair ? { kind: 'stair', stair } : null;
    }
    default:
      return { kind: sel.kind, id: sel.id };
  }
}

/** Objeto selecionado, estável entre renders enquanto nada muda. */
export function useSelectedObject(): SelectedObject | null {
  const selection = useEditor((s) => s.selection);
  const project = useEditor((s) => s.project);
  const results = useEditor((s) => s.results);
  return useMemo(() => resolveSelection({ selection, project, results }), [selection, project, results]);
}

/** IDs de hospedeiros a destacar no 3D para a seleção atual (abertura destaca a parede onde está). */
export function selectionHostId(sel: Selection | null, project: Project): string | null {
  if (!sel) return null;
  if (sel.kind === 'opening') return project.openings.find((o) => o.id === sel.id)?.host ?? null;
  if (sel.kind === 'level') return `slab-${sel.id}`;
  return sel.id;
}
