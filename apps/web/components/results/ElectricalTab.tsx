'use client';
import { useState } from 'react';
import { ChevronDown, ChevronRight, MapPin, Zap } from 'lucide-react';
import { cn } from '@chalecad/ui';
import { getCatalog } from '@chalecad/catalog';
import { DISCLAIMER, type EngineWarning, type Results } from '@chalecad/engine';
import { Term } from '@/components/glossary/Term';
import { formatNumber } from '@/lib/format';
import { explainAlert } from '@/lib/glossary/alerts';
import { CIRCUIT_KIND_LABEL, circuitColor } from '@/lib/elec/kinds';
import { showOnPlan } from '@/lib/elec/focus';
import { Block, Dot, EmptyState, KV, SectionTitle } from './shared';

const K = getCatalog().constants.electrical;

type Report = NonNullable<NonNullable<Results['installations']>['electrical']>;

const sev = {
  error: 'border-red-200 bg-red-50/70',
  warn: 'border-amber-200 bg-amber-50/70',
  info: 'border-border bg-stone-50',
} as const;

function Th({ children, right, term }: { children: React.ReactNode; right?: boolean; term?: string }) {
  return <th className={cn('px-2 py-1.5 font-medium whitespace-nowrap', right && 'text-right')}>{term ? <Term id={term}>{children}</Term> : children}</th>;
}

/** Quadro de cargas: um circuito por linha; vermelho no que reprova (queda de tensão, ampacidade). */
function LoadTable({ report }: { report: Report }) {
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-[36rem] text-left text-xs" data-testid="elec-load-table">
        <thead className="text-[11px] text-stone-500">
          <tr className="border-y border-border bg-stone-50">
            <Th>Circuito</Th>
            <Th>Tipo</Th>
            <Th right>VA</Th>
            <Th right>A</Th>
            <Th right>Seção</Th>
            <Th right term="disjuntor">
              Disjuntor
            </Th>
            <Th right term="dr">
              DR
            </Th>
            <Th right term="queda_tensao">
              Queda
            </Th>
            <Th right>Comp.</Th>
          </tr>
        </thead>
        <tbody>
          {report.circuits.map((c, i) => {
            const bad = c.totalDropPct > K.voltageDrop.totalMaxPct + 1e-9 || c.voltageDropPct > K.voltageDrop.terminalMaxPct + 1e-9 || c.ib > c.breakerA + 1e-9;
            return (
              <tr key={c.id} className={cn('border-b border-border/60 last:border-0', bad && 'bg-red-50 text-red-800')} data-fail={bad ? 'true' : undefined}>
                <td className="px-2 py-1.5 font-medium">
                  <span className="flex items-center gap-1.5">
                    <Dot color={circuitColor(i)} />
                    <span className="tabular-nums text-stone-500">{i + 1}</span> {c.name}
                  </span>
                </td>
                <td className="px-2 py-1.5">{CIRCUIT_KIND_LABEL[c.kind]}</td>
                <td className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">{formatNumber(c.powerVA, 0)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(c.ib, 1)}</td>
                <td className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">{formatNumber(c.sectionMm2, 1)} mm²</td>
                <td className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">
                  {c.breakerA} A {c.curve}
                </td>
                <td className="px-2 py-1.5 text-right">{c.dr ? 'sim' : '—'}</td>
                <td className={cn('px-2 py-1.5 text-right whitespace-nowrap tabular-nums', bad && 'font-semibold')}>{formatNumber(c.voltageDropPct, 2)} %</td>
                <td className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">{formatNumber(c.lengthM, 1)} m</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function WarningItem({ w }: { w: EngineWarning }) {
  const [open, setOpen] = useState(false);
  const why = explainAlert(w.code);
  const refs = w.refs ?? [];
  return (
    <li className={cn('rounded-lg border px-3 py-2', sev[w.severity])}>
      <p className="text-[13px] leading-snug text-stone-800">{w.message}</p>
      <p className="mt-0.5 font-mono text-[11px] text-stone-500">{w.code}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {why ? (
          <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-white px-2 text-xs font-medium text-stone-700 outline-none hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-accent/50">
            {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />} Entender
          </button>
        ) : null}
        {refs.length > 0 ? (
          <button type="button" data-testid="elec-show-on-plan" onClick={() => showOnPlan(refs)} className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-white px-2 text-xs font-medium text-stone-700 outline-none hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-accent/50">
            <MapPin className="size-3.5" /> Mostrar na planta
          </button>
        ) : null}
      </div>
      {open && why ? (
        <div className="mt-2 space-y-1 rounded-md bg-white/80 px-3 py-2 text-xs leading-relaxed text-stone-700">
          <p>
            <span className="font-semibold">O que quer dizer:</span> {why.meaning}
          </p>
          <p>
            <span className="font-semibold">O que fazer:</span> {why.action}
          </p>
        </div>
      ) : null}
    </li>
  );
}

/** Aba "Elétrica": quadro de cargas, quadro e demanda, iluminação por cômodo, eletrodutos e avisos `elec.*`. */
export function ElectricalTab({ report, results }: { report: Report | null | undefined; results: Pick<Results, 'model' | 'warnings'> }) {
  if (!report) {
    return (
      <EmptyState icon={<Zap />} title="Sem projeto elétrico calculado">
        Marque os cômodos do chalé. O projeto elétrico (NBR 5410) é gerado por eles e você pode desenhá-lo na planta (Shift+E).
      </EmptyState>
    );
  }
  const rooms = new Map(results.model.rooms.map((r) => [r.id, r.name]));
  const warns = results.warnings.filter((w) => w.code.startsWith('elec.'));
  const p = report.panel;
  const dr = p.drs.length;
  return (
    <div className="space-y-3 p-3" data-testid="elec-tab">
      <Block className="p-0">
        <div className="px-3 pt-3">
          <SectionTitle aside={`${formatNumber(report.installedKw, 1)} kW · ${report.voltage} V`}>Quadro de cargas</SectionTitle>
        </div>
        <LoadTable report={report} />
      </Block>

      <Block>
        <SectionTitle>Quadro de distribuição e demanda</SectionTitle>
        <dl className="mt-1 divide-y divide-border/60">
          <KV label="Módulos" value={`${p.ways} usados · quadro de ${p.size}`} hint={`${p.reserves} reserva(s)`} />
          <KV label="Disjuntor geral" value={`${p.mainBreakerA} A`} />
          <KV label="DR de 30 mA" value={dr > 0 ? p.drs.map((d) => `${d.ratingA} A`).join(' + ') : 'nenhum'} hint={dr > 0 ? `${dr} dispositivo(s)` : undefined} />
          <KV label="DPS" value={`Uc ${p.dps.ucV} V · ${p.dps.inKa} kA`} />
          <KV label="Demanda" value={`${formatNumber(report.demandKw, 1)} kW`} hint={`instalada ${formatNumber(report.installedKw, 1)} kW`} strong />
          <KV label="Padrão de entrada" value={`${report.entrance.category} · ${report.entrance.phases} fase(s)`} hint={`${report.entrance.breakerA} A · ${formatNumber(report.entrance.cableMm2, 0)} mm²`} />
          <KV label="Alimentador" value={`${formatNumber(report.feeder.sectionMm2, 0)} mm²`} hint={`queda ${formatNumber(report.feeder.voltageDropPct, 2)} %`} />
        </dl>
      </Block>

      <Block>
        <SectionTitle>Iluminação por cômodo</SectionTitle>
        <ul className="mt-2 space-y-2" data-testid="elec-lighting">
          {report.lighting.map((l) => {
            const pct = Math.min(100, (l.avgLux / Math.max(1, l.targetLux * 2)) * 100);
            const tone = l.status === 'low' || l.status === 'none' ? 'bg-red-500' : l.status === 'high' ? 'bg-amber-500' : 'bg-emerald-500';
            return (
              <li key={l.roomId} className="text-xs">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-stone-800">{rooms.get(l.roomId) ?? l.roomId}</span>
                  <span className="tabular-nums text-stone-600">
                    {l.status === 'none' ? 'sem luz' : `${formatNumber(l.avgLux, 0)} lux`} <span className="text-stone-400">/ alvo {l.targetLux}</span>
                  </span>
                </div>
                <div className="relative mt-1 h-2 rounded-full bg-stone-100" role="img" aria-label={`${formatNumber(l.avgLux, 0)} lux, alvo ${l.targetLux}`}>
                  <div className={cn('h-2 rounded-full', tone)} style={{ width: `${pct}%` }} />
                  <div className="absolute top-[-2px] h-3 w-px bg-stone-700" style={{ left: '50%' }} title={`Alvo ${l.targetLux} lux`} />
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[11px] text-stone-500">
          Método dos lúmens, fator de manutenção {formatNumber(K.lighting.maintenanceFactor, 2)}. A marca no meio da barra é o <Term id="lux">lux</Term> alvo do cômodo.
        </p>
      </Block>

      <Block>
        <SectionTitle aside={`${report.conduits.length} trecho(s)`}>Eletrodutos</SectionTitle>
        <div className="mt-2 max-h-56 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] text-stone-500">
              <tr className="border-y border-border bg-stone-50">
                <Th>Trecho</Th>
                <Th right>DN</Th>
                <Th right>Comp.</Th>
                <Th right>Circuitos</Th>
                <Th right>Ocupação</Th>
              </tr>
            </thead>
            <tbody>
              {report.conduits.map((c, i) => {
                const bad = c.fillPct > c.fillLimitPct + 1e-9;
                return (
                  <tr key={c.id} className={cn('border-b border-border/60 last:border-0', bad && 'bg-red-50 text-red-800')}>
                    <td className="px-2 py-1 tabular-nums text-stone-500">{i + 1}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{c.dn} mm</td>
                    <td className="px-2 py-1 text-right whitespace-nowrap tabular-nums">{formatNumber(c.length, 1)} m</td>
                    <td className="px-2 py-1 text-right tabular-nums">{c.circuitIds.length}</td>
                    <td className={cn('px-2 py-1 text-right whitespace-nowrap tabular-nums', bad && 'font-semibold')}>
                      {formatNumber(c.fillPct, 0)} % <span className="text-stone-400">/ {formatNumber(c.fillLimitPct, 0)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Block>

      <Block>
        <SectionTitle aside={warns.length}>Avisos da elétrica</SectionTitle>
        {warns.length === 0 ? (
          <p className="mt-2 text-xs text-stone-500">Nenhum aviso: o traçado atende às verificações do motor.</p>
        ) : (
          <ul className="mt-2 space-y-2" data-testid="elec-warnings">
            {warns.map((w, i) => (
              <WarningItem key={`${w.code}#${i}`} w={w} />
            ))}
          </ul>
        )}
      </Block>

      <p className="px-1 text-[11px] leading-snug text-stone-500">{DISCLAIMER}</p>
    </div>
  );
}
