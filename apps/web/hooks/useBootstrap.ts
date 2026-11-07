'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { createProject } from '@/lib/project/templates';
import { getStorage } from '@/lib/storage';
import { useEditor } from '@/lib/store/editor';

export interface BootstrapState {
  ready: boolean;
  /** Nenhum projeto salvo: mostra o assistente de novo projeto. */
  firstAccess: boolean;
}

/**
 * Abre o projeto ao entrar em /editor: `?id=` -> aquele; senão o último editado; senão o template
 * do chalé 6,5 x 8,5 (e o assistente de novo projeto, no primeiro acesso).
 */
export function useBootstrap(): BootstrapState {
  const [state, setState] = useState<BootstrapState>({ ready: false, firstAccess: false });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const storage = getStorage();
      const id = new URLSearchParams(window.location.search).get('id');
      try {
        if (id) {
          const rec = await storage.getProject(id);
          if (cancelled) return;
          if (rec) {
            useEditor.getState().loadProject(rec.project, { projectId: id });
            setState({ ready: true, firstAccess: false });
            return;
          }
          toast.error('Projeto não encontrado neste navegador. Abrindo o mais recente.');
        }
        const list = await storage.listProjects();
        if (cancelled) return;
        const last = list[0];
        if (last) {
          const rec = await storage.getProject(last.id);
          if (cancelled) return;
          if (rec) {
            useEditor.getState().loadProject(rec.project, { projectId: last.id });
            window.history.replaceState(null, '', `/editor?id=${encodeURIComponent(last.id)}`);
            setState({ ready: true, firstAccess: false });
            return;
          }
        }
        useEditor.getState().loadProject(createProject('gable_mezzanine'));
        setState({ ready: true, firstAccess: true });
      } catch (e) {
        if (cancelled) return;
        console.warn('[storage] IndexedDB indisponível:', e);
        toast.warning('Não foi possível acessar o armazenamento local: as alterações não serão salvas.');
        useEditor.getState().loadProject(createProject('gable_mezzanine'));
        setState({ ready: true, firstAccess: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
