'use client';
import type { CutPlan } from '@chalecad/engine';
import { formatLength, formatNumber } from '@/lib/format';

const CUT_COLORS = ['#f59e0b', '#14b8a6', '#fb923c', '#0ea5e9', '#a3a3a3', '#84cc16'];
const WASTE_BG = 'repeating-linear-gradient(135deg, #d6d3d1 0 3px, #f5f5f4 3px 6px)';
const MAX_BARS = 40;

/** Plano de corte: cada barra é uma faixa proporcional ao comprimento; cortes coloridos e sobra hachurada. */
export function CutPlanView({ plan, barLength }: { plan: CutPlan; barLength: number }) {
  const bars = plan.bars.filter((b) => b.barLength === barLength);
  if (bars.length === 0) return null;
  const waste = bars.reduce((s, b) => s + b.waste, 0);
  const total = bars.length * barLength;
  return (
    <div className="space-y-2 rounded-lg bg-stone-50 p-2.5">
      <p className="text-[11px] text-stone-500 tabular-nums">
        {bars.length} {bars.length === 1 ? 'barra' : 'barras'} de {formatLength(barLength, 1)} · sobra {formatNumber((waste / total) * 100, 1)}% ({formatLength(waste, 1)})
      </p>
      <ol className="space-y-1" aria-label="Barras e cortes">
        {bars.slice(0, MAX_BARS).map((bar, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-right text-[10px] text-stone-400 tabular-nums">{i + 1}</span>
            <div className="flex h-4 flex-1 overflow-hidden rounded-sm bg-stone-200 ring-1 ring-stone-300">
              {bar.cuts.map((c, j) => (
                <span
                  key={`${c.pieceId}-${j}`}
                  title={`${formatLength(c.length)} · ${c.pieceId}`}
                  className="h-full border-r border-white/80"
                  style={{ width: `${(c.length / barLength) * 100}%`, background: CUT_COLORS[(i + j) % CUT_COLORS.length] }}
                />
              ))}
              {bar.waste > 0.0005 ? <span title={`Sobra ${formatLength(bar.waste)}`} className="h-full flex-1" style={{ background: WASTE_BG }} /> : null}
            </div>
          </li>
        ))}
      </ol>
      {bars.length > MAX_BARS ? <p className="text-[11px] text-stone-500">+ {bars.length - MAX_BARS} barras semelhantes não exibidas</p> : null}
    </div>
  );
}
