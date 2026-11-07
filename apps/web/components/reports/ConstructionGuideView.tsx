'use client';
import { Clock, Hammer, ShoppingCart, Wrench } from 'lucide-react';
import type { ConstructionGuide, QuantityLine } from '@chalecad/engine';
import { formatKg, formatNumber } from '../../lib/format';
import { PHASE_LABEL } from './labels';

const hh = (n: number) => `${formatNumber(n, 1)} h`;

/** Roteiro de obra do motor: o que comprar primeiro, ferramentas e passos numerados. */
export function ConstructionGuideView({ guide, lines }: { guide: ConstructionGuide; lines: QuantityLine[] }) {
  const byId = new Map(lines.map((l) => [l.id, l]));
  return (
    <article className="report space-y-6 text-sm text-stone-800">
      <header className="space-y-1">
        <p className="text-[11px] font-semibold tracking-wide text-accent-hover uppercase">Roteiro de obra</p>
        <h2 className="text-2xl font-semibold tracking-tight text-stone-900">{guide.projectName}</h2>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-stone-600">
          <span className="flex items-center gap-1.5"><Clock className="size-4 text-stone-400" /> {hh(guide.totalManHours)} de esforço estimado (homem-hora)</span>
          <span className="flex items-center gap-1.5"><Hammer className="size-4 text-stone-400" /> {guide.steps.length} passos</span>
        </p>
      </header>

      <section className="break-inside-avoid rounded-xl border border-amber-200 bg-accent-soft/50 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-stone-900"><ShoppingCart className="size-4 text-accent" /> Compre primeiro</h3>
        <p className="mt-0.5 text-xs text-stone-600">Fundação e estrutura, os de maior prazo de entrega no topo.</p>
        {guide.buyFirst.length === 0 ? (
          <p className="mt-2 text-stone-600">Nenhum item de prazo longo.</p>
        ) : (
          <ul className="mt-3 divide-y divide-amber-200/70">
            {guide.buyFirst.map((b) => (
              <li key={b.lineId} className="flex items-baseline justify-between gap-3 py-1.5">
                <span className="min-w-0">
                  <span className="font-medium text-stone-900">{b.name}</span>
                  <span className="ml-2 text-xs text-stone-500">{b.leadTimeNote}</span>
                </span>
                <span className="shrink-0 text-right tabular-nums">
                  {formatNumber(b.purchaseQty, 0)} {b.unit} <span className="ml-1 rounded-full bg-white px-2 py-0.5 text-xs text-stone-600">{b.leadTimeDays} dias</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="break-inside-avoid space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-stone-900"><Wrench className="size-4 text-stone-500" /> Ferramentas da obra</h3>
        <ul className="flex flex-wrap gap-1.5">
          {guide.tools.map((t) => (
            <li key={t} className="rounded-full border border-border bg-stone-50 px-2.5 py-0.5 text-xs text-stone-700">{t}</li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-stone-900">Passo a passo</h3>
        <ol className="space-y-3">
          {guide.steps.map((s) => {
            const mats = s.materials.map((id) => byId.get(id)).filter((l): l is QuantityLine => !!l);
            return (
              <li key={s.id} className="flex break-inside-avoid gap-3 rounded-xl border border-border bg-white p-4">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-stone-900 text-sm font-semibold text-white tabular-nums">{s.order}</span>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <h4 className="text-base font-semibold text-stone-900">{s.title}</h4>
                    <span className="flex items-center gap-2 text-xs text-stone-500">
                      <span className="rounded-full bg-stone-100 px-2 py-0.5 font-medium text-stone-700">{PHASE_LABEL[s.phase]}</span>
                      <span className="tabular-nums">{hh(s.manHours)}</span>
                    </span>
                  </div>
                  <p className="leading-relaxed text-stone-700">{s.description}</p>
                  {s.pieceCount !== undefined ? (
                    <p className="text-xs text-stone-500 tabular-nums">
                      {s.pieceCount} peças{s.weightKg !== undefined ? `, ${formatKg(s.weightKg)}` : ''}
                      {s.panels ? `, ${s.panels} painel(is) de montagem` : ''}
                    </p>
                  ) : null}
                  {s.tools.length > 0 ? (
                    <p className="flex flex-wrap items-center gap-1.5 text-xs">
                      <Wrench className="size-3.5 text-stone-400" aria-label="Ferramentas" />
                      {s.tools.map((t) => (
                        <span key={t} className="rounded-full border border-border bg-stone-50 px-2 py-0.5 text-stone-600">{t}</span>
                      ))}
                    </p>
                  ) : null}
                  {mats.length > 0 ? (
                    <details className="text-xs text-stone-600 print:open">
                      <summary className="cursor-pointer select-none font-medium text-stone-700 print:hidden">Materiais deste passo ({mats.length})</summary>
                      <ul className="mt-1.5 grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
                        {mats.map((l) => (
                          <li key={l.id} className="flex justify-between gap-2">
                            <span className="truncate">{l.name}</span>
                            <span className="shrink-0 tabular-nums text-stone-500">{formatNumber(l.purchaseQty, 0)} {l.unit}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </section>
      <p className="border-t border-border pt-3 text-xs text-stone-500">{guide.disclaimer}</p>
    </article>
  );
}
