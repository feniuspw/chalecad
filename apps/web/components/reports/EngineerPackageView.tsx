'use client';
import { CircleCheck, CircleHelp, OctagonAlert, TriangleAlert } from 'lucide-react';
import { cn } from '@chalecad/ui';
import type { CheckRow, EngineerPackage } from '@chalecad/engine';
import { formatArea, formatKg, formatNumber } from '../../lib/format';
import { CHECK_KIND_LABEL, SEVERITY_LABEL, STATUS_LABEL } from './labels';

const STATUS_STYLE = {
  ok: { chip: 'border-emerald-200 bg-emerald-50 text-emerald-800', bar: 'bg-ok', icon: CircleCheck },
  warn: { chip: 'border-amber-200 bg-amber-50 text-amber-800', bar: 'bg-warn', icon: TriangleAlert },
  fail: { chip: 'border-red-200 bg-red-50 text-red-800', bar: 'bg-fail', icon: OctagonAlert },
} as const;

function H({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[11px] font-semibold tracking-wide text-stone-500 uppercase">{children}</h3>;
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-white px-3 py-2">
      <dt className="text-[11px] text-stone-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-stone-900 tabular-nums">{value}</dd>
    </div>
  );
}

function CheckTable({ checks }: { checks: CheckRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-white">
      <table className="w-full min-w-[34rem] text-left text-xs">
        <thead className="border-b border-border bg-stone-50 text-stone-500">
          <tr>
            <th className="px-3 py-2 font-medium">Verificação</th>
            <th className="px-3 py-2 text-right font-medium">Demanda</th>
            <th className="px-3 py-2 text-right font-medium">Capacidade</th>
            <th className="px-3 py-2 font-medium">Taxa de uso</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {checks.map((c) => {
            const st = STATUS_STYLE[c.status];
            const Icon = st.icon;
            return (
              <tr key={c.id} className="break-inside-avoid">
                <td className="px-3 py-2">
                  <span className="mr-1.5 text-stone-400">{CHECK_KIND_LABEL[c.kind] ?? c.kind}</span>
                  <span className="font-medium text-stone-800">{c.label}</span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(c.demand)} {c.unit}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(c.capacity)} {c.unit}</td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2">
                    <span className="relative h-1.5 w-16 rounded-full bg-stone-200" aria-hidden>
                      <span className={cn('absolute inset-y-0 left-0 rounded-full', st.bar)} style={{ width: `${Math.min(c.ratio / 1.5, 1) * 100}%` }} />
                    </span>
                    <span className="font-medium tabular-nums">{formatNumber(c.ratio)}</span>
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium', st.chip)}>
                    <Icon className="size-3" aria-hidden /> {STATUS_LABEL[c.status]}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Pacote para levar ao engenheiro: premissas, verificações do motor e perguntas em aberto. */
export function EngineerPackageView({ pkg }: { pkg: EngineerPackage }) {
  const s = pkg.summary;
  const a = pkg.loadAssumptions;
  return (
    <article className="report space-y-6 text-sm text-stone-800">
      <header className="space-y-1">
        <p className="text-[11px] font-semibold tracking-wide text-accent-hover uppercase">Pacote do engenheiro</p>
        <h2 className="text-2xl font-semibold tracking-tight text-stone-900">{s.projectName}</h2>
        <p className="text-stone-600">{s.typology} · {s.region}</p>
        <p className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> {pkg.artNotice}
        </p>
      </header>

      <section className="space-y-2">
        <H>Resumo do projeto</H>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Object.entries(s.dimensions).map(([k, v]) => (
            <Fact key={k} label={k} value={typeof v === 'number' ? formatNumber(v) : v} />
          ))}
          <Fact label="Área construída" value={formatArea(s.areas.built)} />
          <Fact label="Implantação" value={formatArea(s.areas.footprint)} />
          <Fact label="Telhado" value={formatArea(s.areas.roof)} />
          <Fact label="Radier" value={`${formatArea(s.areas.radier)} · ${formatNumber(s.foundation.thickness * 100, 0)} cm`} />
          <Fact label="Montantes" value={`${s.profiles.wallStud ?? '–'} a cada ${formatNumber(s.studSpacing * 100, 0)} cm`} />
          <Fact label="Contraventamento" value={s.bracing} />
          <Fact label="Aço" value={formatKg(s.steelKg)} />
          <Fact label="Peso total" value={formatKg(s.totalWeightKg)} />
        </dl>
      </section>

      <section className="space-y-2">
        <H>Premissas de carga</H>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Fact label="Vento V0" value={`${a.windV0} m/s`} />
          <Fact label="Categoria do terreno" value={a.terrainCategory} />
          <Fact label="Solo" value={<>{a.soilBearingKPa} kPa{a.soilIsDefault ? <span className="ml-1 text-xs font-normal text-amber-700">(padrão, sem sondagem)</span> : null}</>} />
          {a.loads ? (
            <>
              <Fact label="Cobertura (perm. / acid.)" value={`${a.loads.deadRoofKPa} / ${a.loads.liveRoofKPa} kPa`} />
              <Fact label="Piso (perm. / acid.)" value={`${a.loads.deadFloorKPa} / ${a.loads.liveFloorKPa} kPa`} />
              <Fact label="Vento q / sucção" value={`${a.loads.windQKPa} / ${a.loads.windRoofUpliftKPa} kPa`} />
            </>
          ) : null}
        </dl>
      </section>

      <section className="space-y-2">
        <H>Verificações do pré-dimensionamento</H>
        {pkg.checks.length === 0 ? <p className="text-stone-500">Verificação estrutural indisponível.</p> : <CheckTable checks={pkg.checks} />}
      </section>

      <section className="space-y-2">
        <H>Pontos de atenção</H>
        {pkg.attentionPoints.length === 0 ? (
          <p className="text-stone-500">Nenhum ponto de atenção.</p>
        ) : (
          <ul className="space-y-1.5">
            {pkg.attentionPoints.map((p, i) => (
              <li key={i} className="flex break-inside-avoid items-start gap-2 rounded-lg border border-border bg-white px-3 py-2">
                <span className={cn('mt-0.5 shrink-0 rounded-full border px-2 py-px text-[11px] font-medium', p.severity === 'fail' ? STATUS_STYLE.fail.chip : p.severity === 'warn' ? STATUS_STYLE.warn.chip : 'border-sky-200 bg-sky-50 text-sky-800')}>
                  {SEVERITY_LABEL[p.severity]}
                </span>
                <span>{p.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <H>Perguntas em aberto para o engenheiro</H>
        {pkg.openQuestions.length === 0 ? (
          <p className="text-stone-500">Nenhuma.</p>
        ) : (
          <ol className="space-y-1.5">
            {pkg.openQuestions.map((q, i) => (
              <li key={q.id} className="flex break-inside-avoid gap-2.5 rounded-lg border border-border bg-white px-3 py-2">
                <CircleHelp className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                <span><span className="mr-1 font-semibold tabular-nums">{i + 1}.</span>{q.text}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
      <p className="border-t border-border pt-3 text-xs text-stone-500">{pkg.disclaimer}</p>
    </article>
  );
}
