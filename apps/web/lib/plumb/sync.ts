'use client';
import { useEditor } from '../store/editor';
import { usePlumb } from './store';

/** Mantém a seleção e a ferramenta da hidráulica coerentes com as do editor. Devolve a função que desliga. */
export function installPlumbSync(): () => void {
  const offEditor = useEditor.subscribe((s, prev) => {
    if (s.tool !== prev.tool && s.tool !== 'select' && usePlumb.getState().tool) usePlumb.getState().setTool(null);
    if (s.selection && s.selection !== prev.selection && usePlumb.getState().sel) usePlumb.getState().select(null);
  });
  const offPlumb = usePlumb.subscribe((s, prev) => {
    if (s.tool && s.tool !== prev.tool && useEditor.getState().tool !== 'select') useEditor.getState().setTool('select');
    if (s.sel && s.sel !== prev.sel && useEditor.getState().selection) useEditor.getState().select(null);
  });
  return () => {
    offEditor();
    offPlumb();
  };
}
