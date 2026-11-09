'use client';
import { useMemo, useState } from 'react';
import { CircleCheck, Eye, Loader2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, cn } from '@chalecad/ui';
import type { ComplianceItem, ComplianceReview, ComplianceStatus, Discipline } from '@chalecad/engine';
import { DISCIPLINES, DISCIPLINE_LABEL, REVIEW_LABEL, STATUS_LABEL, formatDateBr, isPending, todayIso } from '@/lib/approval/labels';
import { useApprovalUi } from '@/lib/approval/ui';
import { useEditor } from '@/lib/store/editor';
import { inputCls } from './fields';

const STATUS_STYLE: Record<ComplianceStatus, string> = {
  ok: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  warn: 'bg-amber-50 text-amber-800 border-amber-200',
  fail: 'bg-red-50 text-red-800 border-red-200',
  manual: 'bg-sky-50 text-sky-800 border-sky-200',
  missing: 'bg-violet-50 text-violet-800 border-violet-200',
  na: 'bg-stone-100 text-stone-600 border-stone-200',
};
const STATUSES: ComplianceStatus[] = ['ok', 'warn', 'fail', 'manual', 'missing', 'na'];

function Chip({ status, n }: { status: ComplianceStatus | 'reviewed'; n: number }) {
  if (n === 0) return null;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] tabular-nums', status === 'reviewed' ? 'border-stone-300 bg-white text-stone-700' : STATUS_STYLE[status])}>
      <b>{n}</b> {status === 'reviewed' ? 'revisados' : STATUS_LABEL[status].toLowerCase()}
    </span>
  );
}

function showOnModel(item: ComplianceItem) {
  const s = useEditor.getState();
  s.setHighlight({ pieceIds: [], hostIds: item.refs, source: `compliance:${item.id}` });
  for (const r of item.refs) {
    if (s.project.openings.some((o) => o.id === r)) s.select({ kind: 'opening', id: r });
    else if (s.project.walls.some((w) => w.id === r)) s.select({ kind: 'wall', id: r });
    else continue;
    break;
  }
  useApprovalUi.getState().hide();
  toast.info('Destacado no modelo.', { description: 'Abra a Aprovação (Shift+A) para voltar.' });
}

function ReviewControls({ item }: { item: ComplianceItem }) {
  const review = useEditor((s) => s.project.legal.reviews[item.id]);
  const profs = useEditor((s) => s.project.legal.professionals);
  const set = (fn: (r: Record<string, ComplianceReview>) => void, label = 'parecer') => useEditor.getState().update(`Dados legais: ${label}`, (d) => fn(d.legal.reviews));
  const clear = () => set((r) => void delete r[item.id], 'tirar parecer');
  const pick = (status: 'accepted' | 'rejected' | 'na') => {
    if (review?.status === status) return clear();
    set((r) => {
      const prev = r[item.id];
      const by = prev?.by ?? (profs.length === 1 ? profs[0]!.id : undefined);
      r[item.id] = { status, note: prev?.note ?? '', ...(by ? { by } : {}), at: todayIso() };
    });
  };
  return (
    <div className="mt-2 rounded-md border border-border bg-stone-50 p-2" data-testid={`review-${item.id}`}>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`Parecer: ${item.title}`}>
        <span className="text-[11px] font-medium text-stone-600">Parecer:</span>
        {(['accepted', 'rejected', 'na'] as const).map((st) => (
          <button
            key={st}
            type="button"
            aria-pressed={review?.status === st}
            onClick={() => pick(st)}
            className="h-7 rounded-md border border-border bg-white px-2 text-xs font-medium text-stone-700 outline-none hover:bg-stone-100 focus-visible:ring-2 focus-visible:ring-accent/50 aria-pressed:border-accent/60 aria-pressed:bg-accent-soft aria-pressed:text-accent-hover"
          >
            {REVIEW_LABEL[st]}
          </button>
        ))}
        {review ? (
          <>
            <span className="text-[11px] text-stone-500">em {formatDateBr(review.at)}</span>
            <Button variant="ghost" size="sm" onClick={clear}>
              Tirar parecer
            </Button>
          </>
        ) : null}
      </div>
      {review ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_14rem]">
          <input
            aria-label={`Nota do parecer: ${item.title}`}
            placeholder="Nota do parecer (opcional)"
            maxLength={1000}
            value={review.note}
            onChange={(e) => useEditor.getState().updateCoalesced(`Dados legais: nota ${item.id}`, (d) => { const r = d.legal.reviews[item.id]; if (r) r.note = e.target.value; })}
            className={inputCls}
          />
          <Select value={review.by ?? '__none'} onValueChange={(v) => set((r) => { const x = r[item.id]; if (!x) return; if (v === '__none') delete x.by; else x.by = v; }, 'profissional do parecer')}>
            <SelectTrigger aria-label={`Profissional do parecer: ${item.title}`} className="h-8 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Sem profissional</SelectItem>
              {profs.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  );
}

function Item({ item }: { item: ComplianceItem }) {
  const goTo = useApprovalUi((s) => s.goToField);
  const needs = item.status === 'missing' ? (item.needs ?? []) : [];
  return (
    <li className="rounded-lg border border-border bg-white p-3" data-testid="compliance-item" data-id={item.id} data-status={item.status}>
      <div className="flex items-start gap-2">
        <span className={cn('mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium', STATUS_STYLE[item.status])}>{STATUS_LABEL[item.status]}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-stone-900">{item.title}</p>
          <p className="text-[11px] text-stone-500">
            {item.norm}
            {item.clause ? `, seção ${item.clause}` : ''}
          </p>
          <p className="mt-1 text-xs text-stone-700">{item.criterion}</p>
          {item.value || item.limit ? (
            <p className="mt-1 text-xs text-stone-700 tabular-nums">
              {item.value ? <>Valor: <b>{item.value}</b></> : null}
              {item.value && item.limit ? ' · ' : ''}
              {item.limit ? <>Limite: <b>{item.limit}</b></> : null}
            </p>
          ) : null}
          {item.detail ? <p className="mt-1 text-xs text-stone-500">{item.detail}</p> : null}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {item.refs.length > 0 ? (
              <Button variant="outline" size="sm" onClick={() => showOnModel(item)}>
                <Eye /> Mostrar no 3D/planta
              </Button>
            ) : null}
            {needs.map((k) => (
              <Button key={k} variant="outline" size="sm" onClick={() => goTo(k)}>
                Informar {k.replace(/^legal\./, '')}
              </Button>
            ))}
          </div>
        </div>
      </div>
      <ReviewControls item={item} />
    </li>
  );
}

export function ComplianceTab() {
  const ap = useEditor((s) => s.results?.approval);
  const computing = useEditor((s) => s.computing);
  const reviews = useEditor((s) => s.project.legal.reviews);
  const goTo = useApprovalUi((s) => s.goToField);
  const [status, setStatus] = useState<ComplianceStatus | 'all'>('all');
  const [discipline, setDiscipline] = useState<Discipline | 'all'>('all');
  const [onlyPending, setOnlyPending] = useState(false);

  const items = useMemo(
    () => (ap?.compliance ?? []).filter((c) => (status === 'all' || c.status === status) && (discipline === 'all' || c.discipline === discipline) && (!onlyPending || isPending(c.status, !!reviews[c.id]))),
    [ap, status, discipline, onlyPending, reviews],
  );

  if (!ap) {
    return (
      <div className="flex items-center justify-center gap-2 p-10 text-sm text-stone-500" data-testid="compliance-empty">
        <Loader2 className={cn('size-4', computing && 'animate-spin')} /> Calculando a verificação normativa…
      </div>
    );
  }
  const required = ap.missingInputs.filter((m) => m.required);
  const openFails = ap.compliance.filter((c) => c.status === 'fail' && !reviews[c.id]).length;
  return (
    <div className="space-y-4 p-4" data-testid="approval-compliance">
      <div className={cn('rounded-lg border p-3', ap.ready ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50')} data-testid="ready-seal">
        <p className={cn('flex items-center gap-2 text-sm font-semibold', ap.ready ? 'text-emerald-800' : 'text-amber-900')}>
          {ap.ready ? <CircleCheck className="size-4" /> : <TriangleAlert className="size-4" />}
          {ap.ready ? 'Pronto para exportar' : `${required.length + openFails} pendências`}
        </p>
        {required.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {required.map((m) => (
              <li key={m.key}>
                <button type="button" onClick={() => goTo(m.key)} className="rounded-full border border-amber-300 bg-white px-2.5 py-0.5 text-xs text-amber-900 outline-none hover:bg-amber-100 focus-visible:ring-2 focus-visible:ring-accent/50">
                  {m.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {!ap.ready ? <p className="mt-2 text-[11px] text-amber-900/80">Itens “não passa” precisam de parecer do profissional (aceito, rejeitado ou não se aplica).</p> : null}
      </div>

      {ap.urban ? (
        <div className="rounded-lg border border-border bg-white p-3" data-testid="urban-indices">
          <p className="text-xs font-semibold text-stone-800">Índices urbanísticos</p>
          <ul className="mt-2 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
            {ap.urban.checks.map((c) => (
              <li key={c.id} className="flex justify-between gap-2">
                <span className="text-stone-600">{c.label}</span>
                <span className="tabular-nums">
                  {c.value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                  {c.unit ? ` ${c.unit}` : ''}
                  {c.limit !== undefined ? ` / ${c.limit.toLocaleString('pt-BR')}` : ''}{' '}
                  <span className={c.status === 'fail' ? 'text-red-700' : c.status === 'missing' ? 'text-stone-400' : 'text-emerald-700'}>{c.status === 'ok' ? 'ok' : c.status === 'fail' ? 'não passa' : 'sem limite'}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border p-3 text-xs text-stone-500">
          Sem lote, o programa não calcula taxa de ocupação, aproveitamento, permeabilidade e recuos.{' '}
          <button type="button" className="text-accent-hover underline" onClick={() => goTo('legal.lot')}>
            Informar o lote
          </button>
        </p>
      )}

      <div className="space-y-1.5" data-testid="discipline-summary">
        {ap.summary.map((s) => (
          <div key={s.discipline} className="flex flex-wrap items-center gap-1.5">
            <span className="w-36 text-xs font-medium text-stone-800">{DISCIPLINE_LABEL[s.discipline]}</span>
            {STATUSES.map((st) => (
              <Chip key={st} status={st} n={s[st]} />
            ))}
            <Chip status="reviewed" n={s.reviewed} />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-y border-border py-2">
        <label className="flex items-center gap-1.5 text-xs text-stone-700">
          Situação
          <Select value={status} onValueChange={(v) => setStatus(v as ComplianceStatus | 'all')}>
            <SelectTrigger aria-label="Filtrar por situação" className="h-8 w-36 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {STATUSES.map((st) => (
                <SelectItem key={st} value={st}>
                  {STATUS_LABEL[st]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-stone-700">
          Disciplina
          <Select value={discipline} onValueChange={(v) => setDiscipline(v as Discipline | 'all')}>
            <SelectTrigger aria-label="Filtrar por disciplina" className="h-8 w-44 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {DISCIPLINES.map((d) => (
                <SelectItem key={d} value={d}>
                  {DISCIPLINE_LABEL[d]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-stone-700">
          <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} /> Só pendentes
        </label>
        <Badge className="ml-auto">
          {items.length} de {ap.compliance.length}
        </Badge>
      </div>

      {DISCIPLINES.map((d) => {
        const list = items.filter((c) => c.discipline === d);
        if (list.length === 0) return null;
        return (
          <section key={d} aria-label={DISCIPLINE_LABEL[d]}>
            <h3 className="mb-2 text-sm font-semibold text-stone-900">{DISCIPLINE_LABEL[d]}</h3>
            <ul className="space-y-2">
              {list.map((c) => (
                <Item key={c.id} item={c} />
              ))}
            </ul>
          </section>
        );
      })}
      {items.length === 0 ? <p className="py-6 text-center text-sm text-stone-500">Nenhum item com esses filtros.</p> : null}
    </div>
  );
}
