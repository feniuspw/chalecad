'use client';
import { useState } from 'react';
import { Box, ChevronDown, ChevronRight, CircleCheck, Info, OctagonAlert, TriangleAlert } from 'lucide-react';
import { cn } from '@chalecad/ui';
import type { EngineWarning, Severity } from '@chalecad/engine';
import { PARTIAL_WARNING_CODE } from '@/lib/engine/compute';
import { useEditor } from '@/lib/store/editor';
import { GlossaryText } from '@/components/glossary/Term';
import { explainAlert } from '@/lib/glossary/alerts';
import { NormFixButton } from './NormFixButton';
import { EmptyState } from './shared';

export const SEVERITY_RANK: Record<Severity, number> = { error: 0, warn: 1, info: 2 };

const SEVERITY_STYLE: Record<
  Severity,
  { icon: typeof Info; label: string; box: string; tint: string }
> = {
  error: {
    icon: OctagonAlert,
    label: 'Erro',
    box: 'border-red-200 bg-red-50/70 hover:bg-red-50',
    tint: 'text-fail',
  },
  warn: {
    icon: TriangleAlert,
    label: 'Atenção',
    box: 'border-amber-200 bg-amber-50/70 hover:bg-amber-50',
    tint: 'text-amber-600',
  },
  info: {
    icon: Info,
    label: 'Informação',
    box: 'border-border bg-stone-50 hover:bg-stone-100',
    tint: 'text-sky-600',
  },
};

/** Avisos que o usuário deve ver (exclui o aviso técnico de cálculo parcial), do mais grave ao menos. */
export function visibleWarnings(ws: EngineWarning[]): EngineWarning[] {
  return ws
    .filter((w) => w.code !== PARTIAL_WARNING_CODE)
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

export function worstSeverity(ws: EngineWarning[]): Severity | null {
  let worst: Severity | null = null;
  for (const w of ws)
    if (worst === null || SEVERITY_RANK[w.severity] < SEVERITY_RANK[worst]) worst = w.severity;
  return worst;
}

export function AlertsTab({ warnings }: { warnings: EngineWarning[] }) {
  const project = useEditor((s) => s.project);
  const active = useEditor((s) => s.highlight?.source);
  const setHighlight = useEditor((s) => s.setHighlight);
  const select = useEditor((s) => s.select);

  if (warnings.length === 0) {
    return (
      <EmptyState icon={<CircleCheck className="text-ok" />} title="Nenhum alerta">
        O motor não encontrou problemas neste projeto.
      </EmptyState>
    );
  }

  const click = (w: EngineWarning, key: string) => {
    const refs = w.refs ?? [];
    if (active === key) {
      setHighlight(null);
      return;
    }
    setHighlight({ pieceIds: [], hostIds: refs, source: key });
    for (const r of refs) {
      if (project.openings.some((o) => o.id === r)) return select({ kind: 'opening', id: r });
      if (project.walls.some((x) => x.id === r)) return select({ kind: 'wall', id: r });
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <p className="text-[11px] leading-snug text-stone-500">
          Corrige estrutura, pé-direito e janelas de uma vez.
        </p>
        <NormFixButton className="shrink-0" />
      </div>
      <ul className="space-y-2 p-3">
        {warnings.map((w, i) => {
          const st = SEVERITY_STYLE[w.severity];
          const Icon = st.icon;
          const key = `${w.code}#${i}`;
          return <AlertItem key={key} w={w} st={st} Icon={Icon} on={active === key} onShow={() => click(w, key)} />;
        })}
      </ul>
    </div>
  );
}

function AlertItem({ w, st, Icon, on, onShow }: { w: EngineWarning; st: (typeof SEVERITY_STYLE)[Severity]; Icon: typeof Info; on: boolean; onShow: () => void }) {
  const [open, setOpen] = useState(false);
  const n = w.refs?.length ?? 0;
  const why = explainAlert(w.code);
  return (
    <li className={cn('rounded-lg border px-3 py-2.5', st.box.split(' ').filter((c) => !c.startsWith('hover:')).join(' '), on && 'ring-2 ring-accent/60')}>
      <div className="flex items-start gap-2.5">
        <Icon className={cn('mt-0.5 size-4 shrink-0', st.tint)} aria-label={st.label} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-stone-800">
            <GlossaryText>{w.message}</GlossaryText>
          </p>
          <p className="mt-1 text-[11px] text-stone-500">
            <span className="font-mono">{w.code}</span>
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-6.5">
        {why ? (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-white px-2 text-xs font-medium text-stone-700 outline-none hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />} Entender
          </button>
        ) : null}
        {n > 0 ? (
          <button
            type="button"
            aria-pressed={on}
            onClick={onShow}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-white px-2 text-xs font-medium text-stone-700 outline-none hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-accent/50 aria-pressed:border-amber-300 aria-pressed:bg-accent-soft"
          >
            <Box className="size-3.5" /> {on ? 'Esconder no 3D' : 'Mostrar no 3D'}
          </button>
        ) : null}
      </div>
      {open && why ? (
        <div className="mt-2 space-y-1.5 rounded-md bg-white/80 px-3 py-2 text-xs leading-relaxed text-stone-700">
          <p>
            <span className="font-semibold text-stone-900">O que quer dizer: </span>
            <GlossaryText>{why.meaning}</GlossaryText>
          </p>
          <p>
            <span className="font-semibold text-stone-900">O que fazer: </span>
            <GlossaryText>{why.action}</GlossaryText>
          </p>
        </div>
      ) : null}
    </li>
  );
}
