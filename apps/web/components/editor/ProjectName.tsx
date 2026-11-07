'use client';
import { useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { useEditor } from '@/lib/store/editor';

/** Nome do projeto editável inline: clique para editar, Enter confirma, Esc cancela. Grava no store (com desfazer). */
export function ProjectName() {
  const name = useEditor((s) => s.project.meta.name);
  const update = useEditor((s) => s.update);
  const [draft, setDraft] = useState(name);
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const commit = () => {
    const v = draft.trim();
    if (v && v !== name) update('Renomear projeto', (d) => void (d.meta.name = v));
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={input}
        value={draft}
        maxLength={120}
        aria-label="Nome do projeto"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
        style={{ width: `${Math.min(48, Math.max(12, draft.length + 2))}ch` }}
        className="h-8 rounded-md border border-accent bg-white px-2 text-sm font-medium text-stone-900 outline-none ring-2 ring-accent/20"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setDraft(name);
        setEditing(true);
      }}
      title="Renomear projeto"
      className="group flex h-8 max-w-[22rem] items-center gap-1.5 rounded-md px-2 text-sm font-medium text-stone-900 outline-none hover:bg-stone-100 focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <span className="truncate">{name}</span>
      <Pencil className="size-3 shrink-0 text-stone-400 opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}
