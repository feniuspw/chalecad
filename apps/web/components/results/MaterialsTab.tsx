'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Scissors, SearchX } from 'lucide-react';
import { cn } from '@chalecad/ui';
import { STAGE_LABELS, STAGE_ORDER } from '@chalecad/catalog';
import type { QuantityLine, Results } from '@chalecad/engine';
import { formatBRL, formatKg, formatNumber, formatPercent } from '@/lib/format';
import { useEditor } from '@/lib/store/editor';
import { CutPlanView } from './CutPlanView';
import { Dot, EmptyState, SearchBox, STAGE_COLORS } from './shared';

const VIRTUAL_THRESHOLD = 200;
const H_HEADER = 40;
const H_LINE = 60;

type Row =
  | { type: 'header'; stage: (typeof STAGE_ORDER)[number]; count: number; subtotal: number; collapsed: boolean }
  | { type: 'line'; line: QuantityLine };

const UNIT_LABEL: Record<QuantityLine['netUnit'], string> = { m: 'm', m2: 'm²', m3: 'm³', un: 'un', kg: 'kg' };
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function MaterialLine({
  line,
  price,
  active,
  expanded,
  canExpand,
  onToggleExpand,
  results,
}: {
  line: QuantityLine;
  price: number;
  active: boolean;
  expanded: boolean;
  canExpand: boolean;
  onToggleExpand: () => void;
  results: Results;
}) {
  const setHighlight = useEditor((s) => s.setHighlight);
  const plan = canExpand ? results.quantities.cutPlans.find((p) => p.profileId === line.itemId) : undefined;
  const barLength = Number(line.id.split(':').pop());
  const hasPlan = !!plan && Number.isFinite(barLength) && plan.bars.some((b) => b.barLength === barLength);
  const toggle = () => setHighlight(active ? null : { pieceIds: line.pieceIds, hostIds: line.hostIds, source: line.id });
  return (
    <div className={cn('border-b border-border transition-colors', active ? 'bg-accent-soft/70' : 'hover:bg-stone-50')}>
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={toggle}
          aria-pressed={active}
          title={line.note}
          className="min-w-0 flex-1 px-4 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-inset"
          style={{ minHeight: H_LINE - 1 }}
        >
          <span className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-sm font-medium text-stone-900">{line.name}</span>
            <span className="shrink-0 text-sm font-semibold text-stone-900 tabular-nums">{formatBRL(price, 2)}</span>
          </span>
          <span className="mt-0.5 flex items-baseline justify-between gap-3 text-xs text-stone-500 tabular-nums">
            <span className="min-w-0 truncate">
              <span className="font-medium text-stone-700">{formatNumber(line.purchaseQty, Number.isInteger(line.purchaseQty) ? 0 : 2)}</span> {line.unit}
              <span className="mx-1 text-stone-300">·</span>líq. {formatNumber(line.netQty, 2)} {UNIT_LABEL[line.netUnit]}
            </span>
            <span className="shrink-0">
              {formatPercent(line.wastePct, 1)} perda<span className="mx-1 text-stone-300">·</span>
              {formatKg(line.weightKg)}
            </span>
          </span>
          {line.note ? <span className="mt-0.5 block truncate text-[11px] text-amber-700">{line.note}</span> : null}
        </button>
        {hasPlan ? (
          <button
            type="button"
            onClick={onToggleExpand}
            aria-expanded={expanded}
            aria-label={`Plano de corte de ${line.name}`}
            title="Plano de corte"
            className="mr-2 my-2 grid w-8 shrink-0 place-items-center self-start rounded-md text-stone-500 outline-none hover:bg-stone-100 hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-accent/50 aria-expanded:bg-stone-100 aria-expanded:text-accent-hover"
            style={{ height: 32 }}
          >
            <Scissors className="size-4" />
          </button>
        ) : null}
      </div>
      {expanded && hasPlan ? (
        <div className="px-4 pb-3">
          <CutPlanView plan={plan} barLength={barLength} />
        </div>
      ) : null}
    </div>
  );
}

function StageHeader({ row, onToggle }: { row: Extract<Row, { type: 'header' }>; onToggle: () => void }) {
  const Icon = row.collapsed ? ChevronRight : ChevronDown;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!row.collapsed}
      className="flex w-full items-center gap-2 border-b border-border bg-stone-50 px-4 text-left outline-none hover:bg-stone-100 focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-inset"
      style={{ height: H_HEADER }}
    >
      <Icon className="size-3.5 text-stone-400" />
      <Dot color={STAGE_COLORS[row.stage]} />
      <span className="flex-1 truncate text-xs font-semibold tracking-wide text-stone-700 uppercase">
        {STAGE_LABELS[row.stage]} <span className="font-normal text-stone-400 normal-case">{row.count} {row.count === 1 ? 'item' : 'itens'}</span>
      </span>
      <span className="text-sm font-semibold text-stone-900 tabular-nums">{formatBRL(row.subtotal, 0)}</span>
    </button>
  );
}

export function MaterialsTab({ results }: { results: Results }) {
  const highlightSource = useEditor((s) => s.highlight?.source);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const priceByLine = useMemo(() => new Map(results.budget.lines.map((l) => [l.lineId, l.material])), [results]);
  const q = norm(query.trim());
  const filtered = useMemo(
    () => results.quantities.lines.filter((l) => !q || norm(`${l.name} ${l.itemId} ${STAGE_LABELS[l.stage]} ${l.unit}`).includes(q)),
    [results, q],
  );
  const virtual = filtered.length > VIRTUAL_THRESHOLD;

  const rows = useMemo(() => {
    const out: Row[] = [];
    for (const st of STAGE_ORDER) {
      const ls = filtered.filter((l) => l.stage === st);
      if (ls.length === 0) continue;
      const isCollapsed = !q && collapsed.has(st);
      out.push({ type: 'header', stage: st, count: ls.length, subtotal: ls.reduce((s, l) => s + (priceByLine.get(l.id) ?? 0), 0), collapsed: isCollapsed });
      if (!isCollapsed) for (const line of ls) out.push({ type: 'line', line });
    }
    return out;
  }, [filtered, collapsed, priceByLine, q]);

  const flip = (set: Set<string>, id: string) => {
    const n = new Set(set);
    if (!n.delete(id)) n.add(id);
    return n;
  };

  // Janela de virtualização (alturas fixas).
  const scroller = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, height: 640 });
  useEffect(() => {
    const el = scroller.current;
    if (!el || !virtual) return;
    const measure = () => setView({ top: el.scrollTop, height: el.clientHeight || 640 });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [virtual]);

  const renderRow = (r: Row) =>
    r.type === 'header' ? (
      <StageHeader row={r} onToggle={() => setCollapsed((c) => flip(c, r.stage))} />
    ) : (
      <MaterialLine
        line={r.line}
        price={priceByLine.get(r.line.id) ?? 0}
        active={highlightSource === r.line.id}
        expanded={expanded.has(r.line.id)}
        canExpand={!virtual}
        onToggleExpand={() => setExpanded((e) => flip(e, r.line.id))}
        results={results}
      />
    );

  const heights = rows.map((r) => (r.type === 'header' ? H_HEADER : H_LINE));
  const offsets: number[] = [];
  let acc = 0;
  for (const h of heights) {
    offsets.push(acc);
    acc += h;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-1.5 border-b border-border bg-white px-3 py-2.5">
        <SearchBox value={query} onChange={setQuery} placeholder="Buscar material, perfil ou etapa" />
        <p className="px-0.5 text-[11px] text-stone-500">Clique numa linha para ver as peças no 3D. O ícone de tesoura abre o plano de corte.</p>
      </div>
      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto"
        onScroll={virtual ? (e) => setView({ top: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight || 640 }) : undefined}
      >
        {rows.length === 0 ? (
          <EmptyState icon={<SearchX />} title="Nada encontrado">
            Nenhum item corresponde a “{query}”.
          </EmptyState>
        ) : virtual ? (
          <div className="relative" style={{ height: acc }}>
            {rows.map((r, i) => {
              const top = offsets[i]!;
              if (top + heights[i]! < view.top - 400 || top > view.top + view.height + 400) return null;
              return (
                <div key={r.type === 'header' ? `h-${r.stage}` : r.line.id} className="absolute inset-x-0 overflow-hidden" style={{ top, height: heights[i] }}>
                  {renderRow(r)}
                </div>
              );
            })}
          </div>
        ) : (
          rows.map((r) => <div key={r.type === 'header' ? `h-${r.stage}` : r.line.id}>{renderRow(r)}</div>)
        )}
      </div>
    </div>
  );
}
