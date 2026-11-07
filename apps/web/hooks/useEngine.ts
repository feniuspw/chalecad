'use client';
import { useEffect } from 'react';
import { getEngine } from '@/lib/engine/client';
import { useEditor } from '@/lib/store/editor';

/**
 * Recalcula no Web Worker a cada nova revisão do projeto. Só uma chamada fica em voo; se o projeto
 * mudar durante o cálculo, ao terminar roda de novo com o estado mais recente (o último vence) e
 * a resposta antiga é descartada. Projetos inválidos não recalculam (mantêm o último resultado).
 */
export function useEngine() {
  useEffect(() => {
    let inFlight = false;
    let cancelled = false;

    const run = async () => {
      if (inFlight || cancelled) return;
      const s = useEditor.getState();
      if (s.revision === s.computedRevision) return;
      if (s.issues.length > 0) {
        s.setComputing(false);
        return;
      }
      inFlight = true;
      const rev = s.revision;
      s.setComputing(true);
      try {
        const r = await getEngine().compute(s.project);
        if (!cancelled && useEditor.getState().revision === rev) {
          if (r.ok) {
            useEditor.getState().setResults(rev, { ...r.results, timingsMs: { ...r.results.timingsMs, worker: r.ms } });
          } else {
            const msg = r.error ?? r.issues[0]?.message ?? 'Não foi possível calcular o projeto.';
            useEditor.getState().setResults(rev, null, msg);
          }
        }
      } catch (e) {
        if (!cancelled && useEditor.getState().revision === rev) {
          useEditor.getState().setResults(rev, null, e instanceof Error ? e.message : String(e));
        }
      } finally {
        inFlight = false;
        const now = useEditor.getState();
        if (!cancelled && now.revision !== now.computedRevision) void run();
      }
    };

    const unsub = useEditor.subscribe((s, prev) => {
      if (s.revision !== prev.revision) void run();
    });
    void run();
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);
}
