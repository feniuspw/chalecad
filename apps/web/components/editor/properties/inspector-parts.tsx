'use client';
import type { ReactNode } from 'react';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Kbd } from '@chalecad/ui';
import { deleteSelection } from '@/lib/project/selection';
import { useEditor } from '@/lib/store/editor';

export function Header({ title, subtitle, onDelete, actions }: { title: string; subtitle?: string; onDelete?: () => void; actions?: ReactNode }) {
  const select = useEditor((s) => s.select);
  const deleteButton = onDelete ? (
    <Button variant="outline" size="sm" onClick={onDelete} className="text-fail hover:text-red-700">
      <Trash2 /> Excluir
    </Button>
  ) : null;
  return (
    <div className="sticky top-0 z-10 border-b border-border bg-white px-3 py-2.5">
      <button
        type="button"
        onClick={() => select(null)}
        className="mb-1.5 flex items-center gap-1 rounded text-[11px] font-medium text-stone-500 outline-none hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        <ArrowLeft className="size-3" /> Propriedades do projeto <Kbd className="ml-1">Esc</Kbd>
      </button>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-stone-900">{title}</h2>
          {subtitle ? <p className="truncate text-xs text-stone-500">{subtitle}</p> : null}
        </div>
        {actions ? null : deleteButton}
      </div>
      {actions ? (
        <div className="mt-2 flex gap-2">
          {actions}
          {deleteButton}
        </div>
      ) : null}
    </div>
  );
}

export function Body({ children }: { children: ReactNode }) {
  return <div className="space-y-4 p-4">{children}</div>;
}

export function useDelete() {
  const select = useEditor((s) => s.select);
  return () => {
    const s = useEditor.getState();
    const r = deleteSelection(s.selection, s.project, s.update);
    if (!r.ok) return toast.info(r.message);
    select(null);
    toast(r.message, { action: { label: 'Desfazer', onClick: () => useEditor.getState().undo() } });
  };
}

export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-xs">
      <dt className="text-stone-600">{label}</dt>
      <dd className="font-medium text-stone-900 tabular-nums">{value}</dd>
    </div>
  );
}

