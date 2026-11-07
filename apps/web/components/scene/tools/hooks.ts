'use client';
import { useEffect, useRef } from 'react';
import { useEditor } from '@/lib/store/editor';
import { useSceneInfo } from '../sceneInfo';

export const isTypingTarget = (t: EventTarget | null) => {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
};

/**
 * Tecla com prioridade sobre os atalhos globais (fase de captura). `handler` devolve true se consumiu:
 * nesse caso o evento não chega aos atalhos do editor (ex.: Esc que cancela o desenho, R que gira a escada).
 */
export function useKey(keys: string[], handler: (e: KeyboardEvent) => boolean, enabled = true) {
  const h = useRef(handler);
  h.current = handler;
  const list = keys.join('|');
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey) return;
      if (!list.split('|').includes(e.key.toLowerCase()) && !list.split('|').includes(e.key)) return;
      if (h.current(e)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [list, enabled]);
}

/** Dica contextual da ferramenta no rodapé do viewport. */
export function useHint(text: string | null) {
  useEffect(() => {
    useSceneInfo.getState().setHint(text);
    return () => useSceneInfo.getState().setHint(null);
  }, [text]);
}

export const useEditorActions = () => ({
  update: useEditor.getState().update,
  updateCoalesced: useEditor.getState().updateCoalesced,
  select: useEditor.getState().select,
});
