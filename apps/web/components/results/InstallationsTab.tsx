'use client';
import { Zap } from 'lucide-react';
import type { InstallationsReport, Results } from '@chalecad/engine';
import { formatBRL, formatNumber } from '@/lib/format';
import { circuitRows, INSTALLATIONS_NOTICE, pipeTotals, wireTotals } from '@/lib/three/installations';
import { Block, EmptyState, KV, SectionTitle } from './shared';

/** Custo da etapa de instalações do orçamento (material + mão de obra). */
export function installationsCost(results: Pick<Results, 'budget'>): { material: number; labor: number; total: number } | null {
  const st = results.budget.byStage.find((s) => s.stage === 'installations');
  return st ? { material: st.material, labor: st.labor, total: st.material + st.labor } : null;
}

export function InstallationsTab({ report, results }: { report: InstallationsReport | null; results: Pick<Results, 'budget'> }) {
  if (!report) {
    return (
      <EmptyState icon={<Zap />} title="Sem instalações calculadas">
        Marque os cômodos do chalé e as instalações são estimadas por eles.
      </EmptyState>
    );
  }
  const rows = circuitRows(report);
  const wires = wireTotals(report);
  const cost = installationsCost(results);
  return (
    <div className="space-y-3 p-3">
      <Block className="p-0">
        <div className="px-3 pt-3">
          <SectionTitle aside={`${formatNumber(report.demandKw, 1)} kW · ${report.voltage} V`}>Circuitos</SectionTitle>
        </div>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[26rem] text-left text-xs">
            <thead className="text-[11px] text-stone-500">
              <tr className="border-y border-border bg-stone-50">
                <th className="px-3 py-1.5 font-medium">Nº</th>
                <th className="px-2 py-1.5 font-medium">Tipo</th>
                <th className="px-2 py-1.5 font-medium">Rótulo</th>
                <th className="px-2 py-1.5 text-right font-medium">Pontos</th>
                <th className="px-2 py-1.5 text-right font-medium">Potência</th>
                <th className="px-2 py-1.5 text-right font-medium">Cabo</th>
                <th className="px-3 py-1.5 text-right font-medium">Disjuntor</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-1.5 text-stone-500 tabular-nums">{r.n}</td>
                  <td className="px-2 py-1.5 text-stone-700">{r.kind}</td>
                  <td className="px-2 py-1.5 font-medium text-stone-900">{r.label}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.points}</td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">{formatNumber(r.powerVA, 0)} VA</td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">{formatNumber(r.wire, 1)} mm²</td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap tabular-nums">{r.breaker} A</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Block>

      <Block>
        <SectionTitle>Totais</SectionTitle>
        <dl className="mt-1 divide-y divide-border/60">
          <KV label="Demanda estimada" value={`${formatNumber(report.demandKw, 1)} kW`} strong />
          {wires.map((w) => (
            <KV key={w.wire} label={`Cabo ${formatNumber(w.wire, 1)} mm²`} value={`${formatNumber(w.length, 1)} m`} />
          ))}
          <KV label="Eletroduto" value={`${formatNumber(report.conduit, 1)} m`} />
          {pipeTotals(report).map((p) => (
            <KV key={p.id} label={p.label} value={`${formatNumber(p.length, 1)} m`} />
          ))}
          <KV label="Caixa d'água" value={`${formatNumber(report.tankLiters, 0)} L`} hint={`${report.occupants} moradores · ${formatNumber(report.dailyLiters, 0)} L/dia`} />
        </dl>
      </Block>

      {cost ? (
        <Block>
          <SectionTitle>Custo da etapa Instalações</SectionTitle>
          <dl className="mt-1 divide-y divide-border/60">
            <KV label="Material" value={formatBRL(cost.material)} />
            <KV label="Mão de obra" value={formatBRL(cost.labor)} />
            <KV label="Total" value={formatBRL(cost.total)} strong />
          </dl>
        </Block>
      ) : null}

      <p className="px-1 text-[11px] leading-snug text-stone-500">{INSTALLATIONS_NOTICE}</p>
    </div>
  );
}
