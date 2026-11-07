'use client';
import { useEffect } from 'react';
import { create } from 'zustand';
import { getStorage } from '@/lib/storage';
import { useEditor } from '@/lib/store/editor';

export const AUTOSAVE_DELAY_MS = 1500;

interface SaveStatusState {
  saving: boolean;
  error: string | null;
}
export const useSaveStatus = create<SaveStatusState>(() => ({ saving: false, error: null }));

let chain: Promise<void> = Promise.resolve();

async function doSave(): Promise<void> {
  const s = useEditor.getState();
  if (!s.dirty && s.projectId) return;
  const revision = s.revision;
  const results = s.results;
  useSaveStatus.setState({ saving: true });
  try {
    const id = await getStorage().saveProject(s.projectId, s.project, {
      builtArea: results?.model.builtArea,
      total: results && results.budget.total > 0 ? results.budget.total : undefined,
    });
    const wasNew = s.projectId === null;
    useEditor.getState().markSaved(id, Date.now());
    // Houve edição durante o salvamento: continua sujo para o próximo ciclo.
    if (useEditor.getState().revision !== revision) useEditor.setState({ dirty: true });
    if (wasNew && typeof window !== 'undefined') {
      window.history.replaceState(null, '', `/editor?id=${encodeURIComponent(id)}`);
    }
    useSaveStatus.setState({ saving: false, error: null });
  } catch (e) {
    useSaveStatus.setState({ saving: false, error: e instanceof Error ? e.message : 'Falha ao salvar' });
  }
}

/** Salva agora (em fila, sem concorrência). Use antes de trocar de projeto. */
export function saveNow(): Promise<void> {
  chain = chain.then(doSave, doSave);
  return chain;
}

/** Autosave com debounce de 1,5 s. `paused` suspende (ex.: assistente de primeiro acesso aberto). */
export function useAutosave(paused: boolean) {
  useEffect(() => {
    if (paused) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      if (!useEditor.getState().dirty) return;
      timer = setTimeout(() => void saveNow(), AUTOSAVE_DELAY_MS);
    };
    const unsub = useEditor.subscribe((s, prev) => {
      if (s.revision !== prev.revision || s.dirty !== prev.dirty) schedule();
    });
    const flush = () => {
      if (document.visibilityState === 'hidden' && useEditor.getState().dirty) void saveNow();
    };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    schedule();
    return () => {
      clearTimeout(timer);
      unsub();
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
    };
  }, [paused]);
}
