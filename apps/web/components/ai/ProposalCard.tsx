'use client';
import { ArrowDown, ArrowUp, Check, CircleCheck, Minus, Undo2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button, cn } from '@chalecad/ui';
import { useChat } from '@/lib/ai/chat-store';
import type { MetricKey, Proposal } from '@/lib/ai/types';
import { formatBRL, formatKg, formatNumber } from '@/lib/format';

const ROWS: { key: MetricKey; label: string; fmt: (n: number) => string }[] = [
  { key: 'total', label: 'Custo total', fmt: (n) => formatBRL(n, 0) },
  { key: 'perM2', label: 'Custo por m²', fmt: (n) => `${formatBRL(n, 0)}/m²` },
  { key: 'weightKg', label: 'Peso', fmt: (n) => formatKg(n) },
  { key: 'steelKgPerM2', label: 'Aço', fmt: (n) => `${formatNumber(n, 1)} kg/m²` },
  { key: 'woodM3PerM2', label: 'Madeira', fmt: (n) => `${formatNumber(n, 3)} m³/m²` },
  { key: 'worstRatio', label: 'Pior taxa estrutural', fmt: (n) => formatNumber(n, 2) },
  { key: 'warnings', label: 'Alertas', fmt: (n) => String(n) },
];

/** Tabela antes/depois com variação colorida (menor é melhor em todas as métricas). */
export function DiffTable({ preview }: { preview: Proposal['preview'] }) {
  return (
    <dl className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-white text-xs">
      {ROWS.map(({ key, label, fmt }) => {
        const d = preview[key];
        if (!d || d.after === null) return null;
        const delta = d.delta ?? 0;
        const same = Math.abs(delta) < 1e-9;
        const tone = same ? 'text-stone-400' : delta < 0 ? 'text-emerald-700' : 'text-red-700';
        const Icon = same ? Minus : delta < 0 ? ArrowDown : ArrowUp;
        return (
          <div key={key} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
            <dt className="text-stone-600">{label}</dt>
            <dd className="flex items-center gap-2 tabular-nums">
              <span className="text-stone-400">{d.before === null ? '' : fmt(d.before)}</span>
              <span className="font-medium text-stone-900">{fmt(d.after)}</span>
              <span className={cn('flex w-[4.5rem] items-center justify-end gap-0.5 font-medium', tone)}>
                <Icon className="size-3" aria-hidden />
                {same ? '–' : `${delta > 0 ? '+' : '−'}${fmt(Math.abs(delta)).replace('/m²', '')}`}
              </span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export function ProposalCard({ proposal }: { proposal: Proposal }) {
  const state = useChat((s) => s.proposalState[proposal.id] ?? 'pending');
  const apply = useChat((s) => s.apply);
  const discard = useChat((s) => s.discard);

  const onApply = () => {
    const err = apply(proposal);
    if (err) toast.error(err);
    else toast.success(`“${proposal.label}” aplicado.`, { description: 'Use Desfazer na barra superior para voltar.' });
  };

  return (
    <article className={cn('space-y-2.5 rounded-xl border bg-white p-3 shadow-sm', state === 'pending' ? 'border-amber-300' : 'border-border opacity-80')} aria-label={`Proposta: ${proposal.label}`}>
      <header>
        <p className="text-[10px] font-semibold tracking-wide text-accent-hover uppercase">Proposta de edição</p>
        <h4 className="text-sm font-semibold text-stone-900">{proposal.label}</h4>
        <p className="mt-0.5 text-xs leading-relaxed text-stone-600">{proposal.rationale}</p>
      </header>
      <DiffTable preview={proposal.preview} />
      <details className="group text-xs text-stone-500">
        <summary className="cursor-pointer select-none hover:text-stone-800">Ver patch ({proposal.patch.length} {proposal.patch.length === 1 ? 'operação' : 'operações'})</summary>
        <pre className="mt-1.5 max-h-40 overflow-auto rounded-md bg-stone-50 p-2 font-mono text-[11px] leading-snug text-stone-700">{JSON.stringify(proposal.patch, null, 2)}</pre>
      </details>
      {state === 'pending' ? (
        <div className="flex gap-2">
          <Button size="sm" className="h-8 flex-1" onClick={onApply}>
            <Check /> Aplicar
          </Button>
          <Button size="sm" variant="outline" className="h-8" onClick={() => discard(proposal.id)}>
            <X /> Descartar
          </Button>
        </div>
      ) : state === 'applied' ? (
        <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
          <CircleCheck className="size-3.5" /> Aplicada ao projeto <Undo2 className="ml-1 size-3 text-stone-400" aria-hidden /> <span className="font-normal text-stone-500">desfazível</span>
        </p>
      ) : (
        <p className="text-xs text-stone-500">Descartada.</p>
      )}
    </article>
  );
}
