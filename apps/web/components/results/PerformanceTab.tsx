'use client';
import { Leaf, Sun, Droplets, TriangleAlert, ThermometerSun } from 'lucide-react';
import { getCatalog } from '@chalecad/catalog';
import type { PerformanceReport, Project, Results, ThermalElement } from '@chalecad/engine';
import { formatBRL, formatBRLRange, formatNumber } from '@/lib/format';
import { LIMIT_MARK, STATUS_COLOR, STATUS_LABEL, THERMAL_NOTICE, barFill, coveragePct, ctStatus, elementStatus, hasPerformance, solarPlacement, thermalAdvice, uStatus, type Status } from '@/lib/three/performance';
import { Block, Dot, EmptyState, KV, SectionTitle } from './shared';

/** Barra com o valor, a marca do limite e a cor do status. */
function Meter({ label, value, unit, limit, limitLabel, status, fill }: { label: string; value: string; unit: string; limit: number | null; limitLabel: string; status: Status; fill: number; }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-stone-700">{label}</span>
        <span className="tabular-nums text-stone-900">
          <strong className="font-semibold">{value}</strong> <span className="text-stone-500">{unit}</span>
          <span className="ml-1.5 text-stone-500">({limitLabel})</span>
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-stone-100" role="meter" aria-label={label} aria-valuenow={Number.parseFloat(value.replace(',', '.')) || 0} aria-valuetext={`${value} ${unit}, ${STATUS_LABEL[status]}`}>
        <div className="h-full rounded-full" style={{ width: `${Math.max(2, fill * 100)}%`, background: STATUS_COLOR[status] }} />
        {limit !== null ? <div className="absolute -top-0.5 h-3 w-0.5 rounded bg-stone-700" style={{ left: `${LIMIT_MARK * 100}%` }} aria-hidden /> : null}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: STATUS_COLOR[status] }}>
      <Dot color={STATUS_COLOR[status]} /> {STATUS_LABEL[status]}
    </span>
  );
}

function ThermalCard({ el }: { el: ThermalElement }) {
  const status = elementStatus(el);
  return (
    <Block className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-stone-900">{el.label}</h4>
        <StatusBadge status={status} />
      </div>
      <Meter label="Transmitância (U)" value={formatNumber(el.U, 2)} unit="W/m²K" limit={el.limitU} limitLabel={`limite ${formatNumber(el.limitU, 2)}`} status={uStatus(el)} fill={barFill(el.U, el.limitU)} />
      {el.limitCT !== null ? (
        <Meter label="Capacidade térmica (CT)" value={formatNumber(el.CT, 0)} unit="kJ/m²K" limit={el.limitCT} limitLabel={`mín. ${formatNumber(el.limitCT, 0)}`} status={ctStatus(el)} fill={barFill(el.CT, el.limitCT)} />
      ) : (
        <p className="text-xs text-stone-500">
          CT {formatNumber(el.CT, 0)} kJ/m²K · sem exigência de capacidade térmica nesta zona.
        </p>
      )}
      <p className="text-xs text-stone-500">Absortância solar (α): {formatNumber(el.alpha, 2)}</p>
    </Block>
  );
}

function Thermal({ report }: { report: PerformanceReport }) {
  const advice = thermalAdvice(report.thermal);
  return (
    <section className="space-y-2">
      <SectionTitle aside={`zona ${report.zone}${report.zoneSource === 'uf' ? ' (capital)' : ''}`}>Desempenho térmico</SectionTitle>
      {report.thermal.map((el) => (
        <ThermalCard key={el.id + el.kind} el={el} />
      ))}
      {advice.length > 0 ? (
        <Block className="space-y-1.5 border-amber-200 bg-amber-50">
          <p className="text-xs font-semibold text-amber-900">O que fazer</p>
          <ul className="list-disc space-y-1 pl-4 text-xs text-amber-900">
            {advice.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          <p className="text-xs text-amber-900">Na serra, confira também se a zona bioclimática escolhida está certa.</p>
        </Block>
      ) : null}
      <p className="flex items-start gap-1.5 text-[11px] text-stone-500">
        <TriangleAlert className="mt-0.5 size-3 shrink-0" /> {THERMAL_NOTICE}
      </p>
    </section>
  );
}

function Solar({ report, results }: { report: PerformanceReport; results: Pick<Results, 'model'> }) {
  const s = report.solar;
  if (!s) return null;
  const moduleArea = getCatalog().constants.performance.solar.moduleArea;
  const placed = solarPlacement(results.model, s, moduleArea);
  const missing = placed ? placed.layout.missing : 0;
  return (
    <section className="space-y-2">
      <SectionTitle aside={`${formatNumber(s.kWp, 2)} kWp`}>
        <span className="inline-flex items-center gap-1">
          <Sun className="size-3" /> Energia solar
        </span>
      </SectionTitle>
      <Block>
        <dl className="divide-y divide-border/60">
          <KV label="Consumo estimado" value={`${formatNumber(s.monthlyKWh, 0)} kWh/mês`} />
          <KV label="Módulos" value={`${s.modules} (${formatNumber(s.areaM2, 1)} m²)`} />
          <KV label="Cabe no telhado" value={s.fits && missing === 0 ? 'Sim' : 'Não'} />
          <KV label="Geração anual" value={`${formatNumber(s.annualKWh, 0)} kWh`} />
          <KV label="Custo (faixa)" value={formatBRLRange(s.cost, s.costMax)} />
          <KV label="Economia por ano" value={formatBRL(s.savingsPerYear, 0)} strong />
          <KV label="Retorno" value={`${formatNumber(s.paybackYears, 1)} anos`} strong />
        </dl>
      </Block>
      {!s.fits || missing > 0 ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
          {missing > 0 ? `${missing} de ${s.modules} módulos não couberam na água do telhado e não aparecem no 3D. ` : 'Os módulos não cabem todos na água indicada. '}
          Aumente o telhado ou reduza o consumo (menos moradores).
        </p>
      ) : null}
    </section>
  );
}

function Rain({ report }: { report: PerformanceReport }) {
  const r = report.rain;
  if (!r) return null;
  return (
    <section className="space-y-2">
      <SectionTitle aside={`${formatNumber(r.tankLiters, 0)} L`}>
        <span className="inline-flex items-center gap-1">
          <Droplets className="size-3" /> Água de chuva
        </span>
      </SectionTitle>
      <Block>
        <dl className="divide-y divide-border/60">
          <KV label="Área de captação" value={`${formatNumber(r.roofAreaM2, 1)} m²`} />
          <KV label="Chuva captada" value={`${formatNumber(r.annualLiters, 0)} L/ano`} />
          <KV label="Demanda não potável" value={`${formatNumber(r.demandLitersYear, 0)} L/ano`} />
          <KV label="Reservatório" value={`${formatNumber(r.tankLiters, 0)} L`} />
          <KV label="Demanda atendida" value={coveragePct(r)} strong />
        </dl>
      </Block>
    </section>
  );
}

export function PerformanceTab({ report, results, project }: { report: PerformanceReport | null; results: Pick<Results, 'model'>; project: Pick<Project, 'performance'> }) {
  if (!hasPerformance(report)) {
    return (
      <EmptyState icon={<ThermometerSun />} title="Sem desempenho calculado">
        {project.performance.solar || project.performance.rainwater ? 'Calculando o desempenho…' : 'O motor ainda não devolveu o desempenho térmico deste projeto. Ligue energia solar ou água de chuva na seção Desempenho das propriedades.'}
      </EmptyState>
    );
  }
  return (
    <div className="space-y-4 p-3">
      <Thermal report={report} />
      <Solar report={report} results={results} />
      <Rain report={report} />
      {!report.solar && !report.rain ? (
        <p className="flex items-center gap-1.5 text-xs text-stone-500">
          <Leaf className="size-3.5" /> Ligue energia solar e água de chuva na seção Desempenho das propriedades.
        </p>
      ) : null}
    </div>
  );
}
