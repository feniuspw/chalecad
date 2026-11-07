'use client';
import { useState } from 'react';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import { cn } from '@chalecad/ui';
import { issueTarget } from '@/lib/project/selection';
import { useEditor } from '@/lib/store/editor';
import { usePanelUi } from './properties/ui-state';

/** Faixa de problemas de validação. Cada item leva ao objeto ou à seção do painel responsável. */
export function ValidationBanner() {
  const issues = useEditor((s) => s.issues);
  const [open, setOpen] = useState(true);
  if (issues.length === 0) return null;

  const go = (path: string) => {
    const s = useEditor.getState();
    const t = issueTarget(path, s.project);
    if (t.selection) s.select(t.selection);
    else {
      s.select(null);
      if (t.section) usePanelUi.getState().reveal(t.section);
    }
  };

  return (
    <div role="alert" className="shrink-0 border-b border-red-200 bg-red-50 text-red-800">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-medium outline-none focus-visible:bg-red-100">
        <AlertTriangle className="size-4 shrink-0" />
        <span className="flex-1">
          {issues.length === 1 ? 'O projeto tem 1 problema' : `O projeto tem ${issues.length} problemas`}: o 3D e os resultados mostram o último estado válido. Corrija para atualizar.
        </span>
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <ul className="max-h-36 divide-y divide-red-100 overflow-y-auto border-t border-red-100 bg-white/60 px-2 py-1">
          {issues.map((i, k) => (
            <li key={`${i.path}-${k}`}>
              <button type="button" onClick={() => go(i.path)} className="flex w-full gap-3 rounded px-2 py-1.5 text-left text-xs outline-none hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-300">
                <code className="shrink-0 font-mono text-red-600">{i.path || 'projeto'}</code>
                <span className="text-stone-700">{i.message}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
