'use client';
import { useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';

/** Nome do projeto editável inline: clique para editar, Enter confirma, Esc cancela. */
export function ProjectName({ initial }: { initial: string }) {
  const [name, setName] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const commit = () => {
    const v = draft.trim();
    if (v) setName(v);
    else setDraft(name);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={input}
        value={draft}
        maxLength={60}
        aria-label="Nome do projeto"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(name);
            setEditing(false);
          }
        }}
        style={{ width: `${Math.max(12, draft.length + 2)}ch` }}
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
      className="group flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-stone-900 outline-none hover:bg-stone-100 focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      {name}
      <Pencil className="size-3 text-stone-400 opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}
