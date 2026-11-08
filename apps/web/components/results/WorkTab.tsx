'use client';
import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, ChevronDown, FileSpreadsheet, HardHat } from 'lucide-react';
import { toast } from 'sonner';
import { Button, NumberInput, cn } from '@chalecad/ui';
import { STAGE_LABELS, getCatalog, type StageId } from '@chalecad/catalog';
import type { Results } from '@chalecad/engine';
import { exportWorkPurchaseCsv } from '@/lib/export/work-csv';
import { downloadText } from '@/lib/export/download';
import { formatBRL, formatNumber } from '@/lib/format';
import { slugify } from '@/lib/project/format';
import {
  addDaysISO,
  buyBy,
  diffDays,
  ganttRows,
  isoToBR,
  purchaseList,
  setBought,
  setDuration,
  setPaid,
  setStageDone,
  setStartDate,
  todayISO,
  totalWeeks,
  workProgress,
  type GanttRow,
  type PurchaseRow,
} from '@/lib/project/work';
import { useEditor } from '@/lib/store/editor';
import { Block, Chips, Dot, EmptyState, KV, SectionTitle, STAGE_COLORS } from './shared';

type Filter = 'all' | 'todo' | 'done';

const weeksText = (w: number) => `${formatNumber(w, w % 1 ? 1 : 0)} sem.`;

function Top({ rows, results }: { rows: GanttRow[]; results: Results }) {
  const progress = useEditor((s) => s.project.progress);
  const update = useEditor((s) => s.update);
  const total = totalWeeks(rows);
  const end = progress.startDate ? addDaysISO(progress.startDate, total * 7) : null;
  const w = workProgress(results, progress);
  const pct = w.estimated > 0 ? Math.min(100, (w.paid / w.estimated) * 100) : 0;
  return (
    <Block>
      <SectionTitle>Obra</SectionTitle>
      <label className="mt-2 flex items-center justify-between gap-3 text-sm text-stone-600">
        <span className="flex items-center gap-1.5">
          <CalendarDays className="size-4 text-stone-400" /> Data de início
        </span>
        <input
          type="date"
          aria-label="Data de início da obra"
          value={progress.startDate ?? ''}
          onChange={(e) => update('Início da obra', (d) => setStartDate(d.progress, e.target.value || undefined))}
          className="h-8 rounded-md border border-border bg-white px-2 text-sm text-stone-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        />
      </label>
      <dl className="mt-1 divide-y divide-border">
        <KV label="Duração total" value={rows.length ? weeksText(total) : '—'} />
        <KV label="Término previsto" value={end ? isoToBR(end) : 'informe a data de início'} />
        <KV label="Etapas concluídas" value={`${w.stagesDone} de ${w.stagesTotal}`} />
        <KV label="Pago / orçado (materiais)" value={`${formatBRL(w.paid, 0)} / ${formatBRL(w.estimated, 0)}`} />
      </dl>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100" role="progressbar" aria-label="Valor pago sobre o orçado" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </Block>
  );
}

function Gantt({ rows }: { rows: GanttRow[] }) {
  const project = useEditor((s) => s.project);
  const update = useEditor((s) => s.update);
  const updateCoalesced = useEditor((s) => s.updateCoalesced);
  const total = Math.max(totalWeeks(rows), 1);
  const done = new Set(project.progress.stagesDone);
  const sd = project.progress.startDate;
  const todayWeek = sd ? diffDays(sd, todayISO()) / 7 : null;
  const showToday = todayWeek !== null && todayWeek >= 0 && todayWeek <= total;
  const pos = (w: number) => `${(w / total) * 100}%`;
  const ticks = Array.from({ length: Math.floor(total) + 1 }, (_, i) => i).filter((i) => total <= 12 || i % Math.ceil(total / 12) === 0);

  return (
    <Block>
      <SectionTitle aside={sd ? `${isoToBR(sd)}` : 'datas relativas'}>Cronograma</SectionTitle>
      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-stone-500">Sem etapas com custo no orçamento.</p>
      ) : (
        <>
          <div className="mt-3 flex">
            <div className="w-24 shrink-0" />
            <div className="relative h-4 flex-1 text-[10px] text-stone-400 tabular-nums" aria-hidden>
              {ticks.map((t) => (
                <span key={t} className="absolute -translate-x-1/2" style={{ left: pos(t) }}>
                  {t + 1}
                </span>
              ))}
            </div>
          </div>
          <ul>
            {rows.map((r) => {
              const isDone = done.has(r.stage);
              const color = STAGE_COLORS[r.stage];
              return (
                <li key={r.stage} className="flex min-h-9 items-center border-t border-border py-1">
                  <span className="w-24 shrink-0 truncate pr-1 text-xs font-medium text-stone-800">{STAGE_LABELS[r.stage]}</span>
                  <div className="relative h-6 flex-1">
                    <div
                      data-testid={`bar-${r.stage}`}
                      data-done={isDone}
                      title={`${STAGE_LABELS[r.stage]}: ${r.weekLabel}${r.startDate ? ` (${isoToBR(r.startDate)} a ${isoToBR(r.endDate!)})` : ''}`}
                      className={cn('absolute top-0.5 flex h-5 items-center overflow-hidden rounded px-1 text-[10px] font-medium whitespace-nowrap text-white', isDone && 'opacity-45')}
                      style={{
                        left: pos(r.start),
                        width: pos(r.weeks),
                        minWidth: 6,
                        background: isDone ? `repeating-linear-gradient(135deg, ${color} 0 4px, ${color}99 4px 8px)` : color,
                      }}
                    >
                      {weeksText(r.weeks)}
                    </div>
                    {showToday ? <div aria-hidden className="absolute inset-y-0 w-px bg-red-500" style={{ left: pos(todayWeek!) }} /> : null}
                  </div>
                </li>
              );
            })}
          </ul>
          {showToday ? (
            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-stone-500">
              <span className="inline-block h-3 w-px bg-red-500" /> hoje
            </p>
          ) : null}
        </>
      )}
      <ul className="mt-2">
        {rows.map((r) => {
          const eff = project.budget.durationsWeeks[r.stage] ?? r.weeks;
          return (
            <li key={r.stage} className="flex min-h-11 items-center gap-2 border-t border-border py-1">
              <Dot color={STAGE_COLORS[r.stage]} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-stone-900">{STAGE_LABELS[r.stage]}</p>
                <p className="text-[11px] text-stone-500 tabular-nums">
                  {r.startDate ? `${isoToBR(r.startDate)} a ${isoToBR(r.endDate!)}` : r.weekLabel} · {r.source}
                </p>
              </div>
              <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-stone-600">
                <input
                  type="checkbox"
                  className="size-4 accent-amber-600"
                  checked={done.has(r.stage)}
                  onChange={(e) => update(e.target.checked ? `Concluir: ${STAGE_LABELS[r.stage]}` : `Reabrir: ${STAGE_LABELS[r.stage]}`, (d) => setStageDone(d.progress, r.stage, e.target.checked))}
                  aria-label={`Concluída: ${STAGE_LABELS[r.stage]}`}
                />
                Concluída
              </label>
              <NumberInput
                className="h-8 w-[5rem] shrink-0"
                aria-label={`Duração de ${STAGE_LABELS[r.stage]} em semanas`}
                value={eff}
                onValueChange={(v) => updateCoalesced(`Duração: ${STAGE_LABELS[r.stage]}`, (d) => setDuration(d.budget, r.stage, v))}
                min={0}
                max={52}
                step={0.5}
                decimals={1}
                unit="sem"
              />
            </li>
          );
        })}
      </ul>
      <p className="mt-1 text-[11px] text-stone-500">Duração 0 volta à estimativa pelas horas-homem do roteiro (2 pessoas, 44 h/semana).</p>
    </Block>
  );
}

function PurchaseItem({ row, start }: { row: PurchaseRow; start: { start: number; startDate: string | null } }) {
  const update = useEditor((s) => s.update);
  const updateCoalesced = useEditor((s) => s.updateCoalesced);
  const by = buyBy(row, start, getCatalog().constants.leadTimes);
  return (
    <li className="border-t border-border px-3 py-2">
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5 size-4 shrink-0 accent-amber-600"
          checked={row.bought}
          aria-label={`Comprado: ${row.name}`}
          onChange={(e) => update(e.target.checked ? `Comprado: ${row.name}` : `Desmarcar compra: ${row.name}`, (d) => setBought(d.progress, row.itemId, e.target.checked))}
        />
        <div className="min-w-0 flex-1">
          <p className={cn('text-sm text-stone-900', row.bought && 'text-stone-500 line-through')}>{row.name}</p>
          <p className="text-xs text-stone-500 tabular-nums">
            {formatNumber(row.qty, row.qty % 1 ? 2 : 0)} {row.unit} · estimado {formatBRL(row.estimated, 2)}
          </p>
          {by ? (
            <p className={cn('mt-0.5 flex items-center gap-1 text-xs tabular-nums', by.overdue ? 'font-semibold text-fail' : 'text-stone-500')}>
              {by.overdue ? <AlertTriangle className="size-3" /> : null}
              Comprar {by.label}
              {by.overdue ? ' (atrasado)' : ''}
            </p>
          ) : null}
          {row.shared && row.bought ? <p className="text-[11px] text-stone-400">Mesmo item de outra etapa: valor pago lançado lá.</p> : null}
        </div>
        {!row.shared ? (
          <div className="w-28 shrink-0">
            <NumberInput
              className="h-8"
              aria-label={`Pago (R$): ${row.name}`}
              value={row.paid ?? 0}
              onValueChange={(v) => updateCoalesced(`Valor pago: ${row.name}`, (d) => setPaid(d.progress, row.itemId, v > 0 ? v : null))}
              min={0}
              max={10_000_000}
              step={10}
              decimals={2}
              unit="R$"
            />
            {row.diff !== null ? (
              <p className={cn('mt-0.5 text-right text-[11px] tabular-nums', row.diff > 0.005 ? 'text-fail' : 'text-emerald-700')}>
                {row.diff > 0 ? '+' : ''}
                {formatBRL(row.diff, 2)} vs. orçado
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function Purchases({ results, rows }: { results: Results; rows: GanttRow[] }) {
  const project = useEditor((s) => s.project);
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<Set<StageId>>(new Set());
  const list = useMemo(() => purchaseList(results, project.progress), [results, project.progress]);
  const starts = useMemo(() => new Map(rows.map((r) => [r.stage, { start: r.start, startDate: r.startDate }])), [rows]);
  const t = list.totals;

  const exportCsv = () => {
    const name = `${slugify(project.meta.name)}-obra-compras.csv`;
    downloadText(name, exportWorkPurchaseCsv(results, project));
    toast.success(`Arquivo ${name} baixado.`);
  };
  const toggle = (st: StageId) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(st)) n.delete(st);
      else n.add(st);
      return n;
    });

  return (
    <Block className="px-0">
      <SectionTitle className="px-3" aside={`${t.boughtCount} de ${t.count} comprados`}>
        Compras
      </SectionTitle>
      <div className="px-3">
        <dl className="mt-1 divide-y divide-border">
          <KV label="Orçado" value={formatBRL(t.estimated, 0)} />
          <KV label="Pago" value={formatBRL(t.paid, 0)} />
          <KV label="Falta comprar" value={formatBRL(t.remaining, 0)} strong />
        </dl>
        <div className="mt-2">
          <Chips
            label="Filtrar compras"
            value={filter}
            onChange={setFilter}
            options={[
              { id: 'all', label: 'Tudo', count: t.count },
              { id: 'todo', label: 'Falta comprar', count: t.count - t.boughtCount },
              { id: 'done', label: 'Comprado', count: t.boughtCount },
            ]}
          />
        </div>
      </div>
      <ul className="mt-2">
        {list.groups.map((g) => {
          const rowsShown = g.rows.filter((r) => (filter === 'all' ? true : filter === 'todo' ? !r.bought : r.bought));
          if (rowsShown.length === 0) return null;
          const isOpen = open.has(g.stage);
          const start = starts.get(g.stage) ?? { start: 0, startDate: null };
          return (
            <li key={g.stage} className="border-t border-border">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => toggle(g.stage)}
                className="flex min-h-11 w-full items-center gap-2 px-3 text-left outline-none hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                <Dot color={STAGE_COLORS[g.stage]} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-stone-900">{STAGE_LABELS[g.stage]}</span>
                  <span className="block text-xs text-stone-500 tabular-nums">
                    {g.totals.boughtCount}/{g.totals.count} · falta {formatBRL(g.totals.remaining, 0)}
                  </span>
                </span>
                <ChevronDown className={cn('size-4 text-stone-400 transition-transform', isOpen && 'rotate-180')} />
              </button>
              {isOpen ? (
                <ul className="bg-stone-50/50">
                  {rowsShown.map((r) => (
                    <PurchaseItem key={r.lineId} row={r} start={start} />
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="border-t border-border px-3 pt-3 pb-1">
        <Button variant="outline" size="sm" className="w-full" onClick={exportCsv}>
          <FileSpreadsheet /> Exportar lista de compras (CSV)
        </Button>
      </div>
    </Block>
  );
}

export function WorkTab({ results }: { results: Results }) {
  const project = useEditor((s) => s.project);
  const rows = useMemo(() => ganttRows(project, results), [project, results]);
  if (results.budget.lines.length === 0) {
    return (
      <EmptyState icon={<HardHat />} title="Nada para acompanhar ainda">
        Desenhe o chalé para ver o cronograma e a lista de compras da obra.
      </EmptyState>
    );
  }
  return (
    <div className="space-y-3 p-3">
      <Top rows={rows} results={results} />
      <Gantt rows={rows} />
      <Purchases results={results} rows={rows} />
    </div>
  );
}
