'use client';
import { CircleCheck, Info, OctagonAlert, TriangleAlert } from 'lucide-react';
import { cn } from '@chalecad/ui';
import type { EngineWarning, Severity } from '@chalecad/engine';
import { PARTIAL_WARNING_CODE } from '@/lib/engine/compute';
import { useEditor } from '@/lib/store/editor';
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
          const n = w.refs?.length ?? 0;
          const on = active === key;
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => click(w, key)}
                disabled={n === 0}
                aria-pressed={n > 0 ? on : undefined}
                className={cn(
                  'flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-default',
                  st.box,
                  on && 'ring-2 ring-accent/60',
                )}
              >
                <Icon className={cn('mt-0.5 size-4 shrink-0', st.tint)} aria-label={st.label} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-stone-800">{w.message}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-stone-500">
                    <span className="font-mono">{w.code}</span>
                    {n > 0 ? (
                      <span>
                        {n} {n === 1 ? 'elemento' : 'elementos'}: clique para ver no 3D
                      </span>
                    ) : null}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
