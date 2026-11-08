'use client';
import { cn } from '@chalecad/ui';
import type { Results } from '@chalecad/engine';
import { materialKpi } from './kpi';
import { formatArea, formatBRL, formatBRLRange, formatKg, formatNumber } from '@/lib/format';

/** Mini-barra do índice do material (aço ou madeira): faixa usual em verde, marcador verde dentro / âmbar fora. */
export function MaterialBar({ value, range, unit, label, digits }: { value: number; range: readonly [number, number]; unit: string; label: string; digits: number }) {
  const [lo, hi] = range;
  const min = lo * 0.6;
  const max = hi * 1.4;
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100))}%`;
  const inside = value >= lo && value <= hi;
  return (
    <div
      role="img"
      aria-label={`${label} ${formatNumber(value, digits)} ${unit}. Faixa usual de ${formatNumber(lo, digits)} a ${formatNumber(hi, digits)}: ${inside ? 'dentro' : 'fora'}.`}
      className="relative mt-1.5 h-1.5 w-full rounded-full bg-stone-200"
    >
      <span className="absolute inset-y-0 rounded-full bg-emerald-200" style={{ left: pos(lo), width: `calc(${pos(hi)} - ${pos(lo)})` }} />
      <span
        className={cn('absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white', inside ? 'bg-ok' : 'bg-warn')}
        style={{ left: pos(value) }}
      />
    </div>
  );
}

function Small({ label, value, children, title }: { label: string; value: string; children?: React.ReactNode; title?: string }) {
  return (
    <div className="min-w-0" title={title}>
      <p className="truncate text-[11px] font-medium text-stone-500">{label}</p>
      <p className="truncate text-sm font-semibold text-stone-900 tabular-nums">{value}</p>
      {children}
    </div>
  );
}

/** Cabeçalho fixo: custo total em destaque e indicadores principais. */
export function Kpis({ results, structure = 'lsf' }: { results: Results; structure?: 'lsf' | 'wood' }) {
  const b = results.budget;
  const mat = materialKpi(results, structure);
  return (
    <div className="space-y-3 border-b border-border bg-gradient-to-b from-amber-50/60 to-white px-4 pt-3 pb-3.5">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-stone-500">Custo total estimado</p>
          <p className="text-[26px] leading-8 font-semibold tracking-tight text-stone-900 tabular-nums">{formatBRL(b.total, 0)}</p>
          <p className="truncate text-xs text-stone-500 tabular-nums">Faixa {formatBRLRange(b.total, b.totalMax)}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] font-medium text-stone-500">por m²</p>
          <p className="text-lg font-semibold text-stone-900 tabular-nums">{formatBRL(b.perM2, 0)}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 border-t border-border pt-3">
        <Small label="Área construída" value={formatArea(results.model.builtArea)} />
        <Small label="Peso (sem fund.)" value={formatKg(results.weight.superstructureKg)} title="Peso total sem a fundação" />
        <Small label={mat.label} value={mat.value} title={mat.title}>
          {mat.index !== null ? <MaterialBar value={mat.index} range={mat.range} unit={mat.unit} label={mat.label} digits={structure === 'wood' ? 3 : 1} /> : null}
        </Small>
      </div>
    </div>
  );
}

export function KpisSkeleton() {
  return (
    <div className="space-y-3 border-b border-border px-4 pt-3 pb-3.5" aria-busy="true" aria-label="Calculando resultados">
      <div className="flex items-end justify-between">
        <div className="space-y-2">
          <div className="h-3 w-28 animate-pulse rounded bg-stone-200" />
          <div className="h-7 w-44 animate-pulse rounded bg-stone-200" />
          <div className="h-3 w-36 animate-pulse rounded bg-stone-100" />
        </div>
        <div className="h-8 w-16 animate-pulse rounded bg-stone-200" />
      </div>
      <div className="grid grid-cols-3 gap-3 border-t border-border pt-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-2.5 w-16 animate-pulse rounded bg-stone-100" />
            <div className="h-4 w-14 animate-pulse rounded bg-stone-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
