'use client';
import { useMemo, type ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@chalecad/ui';
import { findTerms, TERM_BY_ID } from '@/lib/glossary/terms';

/** Termo técnico com sublinhado pontilhado e explicação ao passar o mouse ou focar. */
export function Term({ id, children, focusable = true }: { id: string; children: ReactNode; /** false dentro de botões, para não aninhar foco. */ focusable?: boolean }) {
  const term = TERM_BY_ID[id];
  if (!term) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={focusable ? 0 : undefined}
          className="cursor-help underline decoration-stone-400 decoration-dotted underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="block max-w-64 text-left leading-snug font-normal normal-case">
        <span className="block font-semibold">{term.label}</span>
        <span className="block">{term.short}</span>
        {term.why ? <span className="mt-1 block text-stone-300">Por que importa: {term.why}</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}

/** Texto em que a primeira ocorrência de cada termo do glossário vira um `<Term>`. */
export function GlossaryText({ children, focusable = true }: { children: string; focusable?: boolean }) {
  const nodes = useMemo(() => {
    const out: ReactNode[] = [];
    let at = 0;
    for (const m of findTerms(children)) {
      if (m.start > at) out.push(children.slice(at, m.start));
      out.push(
        <Term key={m.start} id={m.id} focusable={focusable}>
          {m.text}
        </Term>,
      );
      at = m.end;
    }
    if (at < children.length) out.push(children.slice(at));
    return out;
  }, [children, focusable]);
  return <>{nodes}</>;
}
