'use client';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { deleteSelection } from '@/lib/project/selection';
import { useEditor } from '@/lib/store/editor';
import type { Tool } from '@/lib/store/types';

/** Letra -> ferramenta (exibidas nos tooltips do trilho). */
export const TOOL_KEYS: Record<string, Tool> = { v: 'select', w: 'wall', o: 'opening', e: 'stair', m: 'mezzanine', r: 'rect', t: 'measure', c: 'dimension' };

export const isTyping = (t: EventTarget | null) => {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.closest('[role="slider"]') !== null;
};

const dialogOpen = () => document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]') !== null;

/** Atalhos do editor. Não disparam dentro de campos de texto nem com diálogos/menus abertos. */
export function useShortcuts(onToolPicked?: (tool: Tool) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTyping(e.target) || dialogOpen()) return;
      const s = useEditor.getState();
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod && !e.altKey) {
        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) s.redo();
          else s.undo();
        } else if (key === 'y') {
          e.preventDefault();
          s.redo();
        }
        return;
      }
      if (e.altKey) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!s.selection) return;
        e.preventDefault();
        const r = deleteSelection(s.selection, s.project, s.update);
        if (r.ok) {
          s.select(null);
          toast(r.message, { action: { label: 'Desfazer', onClick: () => useEditor.getState().undo() } });
        } else toast.info(r.message);
      } else if (e.key === 'Escape') {
        if (s.selection) s.select(null);
        else if (s.tool !== 'select') s.setTool('select');
      } else if (!e.shiftKey && TOOL_KEYS[key]) {
        const tool = TOOL_KEYS[key]!;
        s.setTool(tool);
        onToolPicked?.(tool);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onToolPicked]);
}
