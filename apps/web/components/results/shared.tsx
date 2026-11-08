'use client';
import type { ReactNode } from 'react';
import { cn } from '@chalecad/ui';
import type { StageId } from '@chalecad/catalog';
import { GlossaryText } from '@/components/glossary/Term';

export const STAGE_COLORS: Record<StageId, string> = {
  terrain: '#8d7b68',
  foundation: '#64748b',
  structure: '#d97706',
  closure: '#0891b2',
  roof: '#b91c1c',
  floor: '#65a30d',
  finishing: '#7c3aed',
  installations: '#ca8a04',
  extras: '#db2777',
};

export const COST_COLORS = { material: '#d97706', labor: '#0f766e', freight: '#78716c' } as const;

/** Título de seção dentro de uma aba. */
export function SectionTitle({ children, aside, className }: { children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-2', className)}>
      <h3 className="text-[11px] font-semibold tracking-wide text-stone-500 uppercase">{typeof children === 'string' ? <GlossaryText>{children}</GlossaryText> : children}</h3>
      {aside ? <span className="text-xs text-stone-500 tabular-nums">{aside}</span> : null}
    </div>
  );
}

/** Bloco com borda e fundo branco. */
export function Block({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-xl border border-border bg-white p-3 shadow-sm', className)}>{children}</div>;
}

/** Linha rótulo/valor com valor alinhado à direita. */
export function KV({ label, value, strong, hint }: { label: ReactNode; value: ReactNode; strong?: boolean; hint?: ReactNode }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-3 text-sm">
      <dt className="min-w-0 text-stone-600">
        {typeof label === 'string' ? <GlossaryText>{label}</GlossaryText> : label}
        {hint ? <span className="ml-1.5 text-xs text-stone-400">{hint}</span> : null}
      </dt>
      <dd className={cn('shrink-0 text-right tabular-nums', strong ? 'font-semibold text-stone-900' : 'font-medium text-stone-800')}>{value}</dd>
    </div>
  );
}

export function Dot({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden className={cn('inline-block size-2.5 shrink-0 rounded-full', className)} style={{ background: color }} />;
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-stone-100 text-stone-500 [&_svg]:size-5">{icon}</span>
      <p className="text-sm font-medium text-stone-800">{title}</p>
      {children ? <p className="max-w-64 text-xs text-stone-500">{children}</p> : null}
    </div>
  );
}

/** Caixa de busca simples. */
export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="h-9 w-full rounded-md border border-border bg-white px-3 text-sm text-stone-900 shadow-sm outline-none placeholder:text-stone-400 hover:border-stone-300 focus-visible:ring-2 focus-visible:ring-accent/50"
    />
  );
}

/** Chips de filtro (radiogroup). */
export function Chips<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { id: T; label: string; count?: number }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-white px-2.5 text-xs font-medium text-stone-600 transition-colors outline-none hover:border-stone-300 hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-accent/50 aria-checked:border-amber-300 aria-checked:bg-accent-soft aria-checked:text-accent-hover"
        >
          {o.label}
          {o.count !== undefined ? <span className="text-[11px] opacity-70 tabular-nums">{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** Rótulo curto de campo para formulários compactos. */
export function MiniField({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block space-y-1', className)}>
      <span className="block text-[11px] font-medium text-stone-600">{label}</span>
      {children}
    </label>
  );
}

export const stageHeight = 'h-9';
