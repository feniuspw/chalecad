'use client';
import { useMemo } from 'react';
import { Droplets, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@chalecad/ui';
import { useEditor } from '@/lib/store/editor';
import { exportPlumbingPdf } from '@/lib/pdf/plumbing';
import { getCatalog } from '@chalecad/catalog';
import { DISCLAIMER, type EngineWarning, type PlumbingReport, type Project } from '@chalecad/engine';
import { Term } from '@/components/glossary/Term';
import { GlossaryText } from '@/components/glossary/Term';
import { formatNumber } from '@/lib/format';
import { fmtM, SYSTEM_LABEL } from '@/lib/plumb/geometry';
import { showOnPlan } from '@/lib/plumb/actions';
import { pressureRows, waterPipeRows, worstMargin } from '@/lib/plumb/report';
import { Block, EmptyState, KV, SectionTitle } from './shared';

const th = 'px-2 py-1.5 font-medium';
const td = 'px-2 py-1.5';

function Table({ head, children, min = '28rem' }: { head: string[]; children: React.ReactNode; min?: string }) {
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-left text-xs" style={{ minWidth: min }}>
        <thead className="text-[11px] text-stone-500">
          <tr className="border-y border-border bg-stone-50">
            {head.map((h, i) => (
              <th key={h} className={`${th} ${i === 0 ? 'pl-3' : ''} ${i > 1 ? 'text-right' : ''}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const SEV: Record<EngineWarning['severity'], string> = { error: 'border-red-200 bg-red-50', warn: 'border-amber-200 bg-amber-50', info: 'border-sky-200 bg-sky-50' };

export function PlumbingTab({ report, warnings, project }: { report: PlumbingReport | null; warnings: EngineWarning[]; project: Project }) {
  const k = getCatalog().constants.plumbing;
  const rows = useMemo(() => (report ? pressureRows(report, project, k) : []), [report, project, k]);
  const pipes = useMemo(() => (report ? waterPipeRows(report) : []), [report]);
  if (!report) {
    return (
      <EmptyState icon={<Droplets />} title="Sem hidráulica calculada">
        Ligue as instalações e marque o banheiro (ou ponha a torre da caixa d’água) para ver pressão, tubos e esgoto.
      </EmptyState>
    );
  }
  const margin = worstMargin(rows);
  const fails = rows.filter((r) => !r.ok).length;
  const water = warnings.filter((w) => w.code.startsWith('water.') || w.code.startsWith('sewer.'));
  const sewer = report.sewer.pipes.filter((p) => p.system === 'sewer');
  const vent = report.sewer.pipes.filter((p) => p.system === 'vent');
  return (
    <div className="space-y-3 p-3" data-testid="plumbing-tab">
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const r = useEditor.getState().results;
            if (!r) return;
            exportPlumbingPdf(project, r).then(
              (name) => toast.success(`Arquivo ${name} baixado.`),
              (e: unknown) => toast.error(e instanceof Error ? e.message : 'Não foi possível gerar o PDF da hidráulica.'),
            );
          }}
        >
          <FileDown /> PDF da hidráulica
        </Button>
      </div>
      <Block className="p-0">
        <div className="px-3 pt-3">
          <SectionTitle aside={fails === 0 ? 'todos atendem' : `${fails} sem pressão`}>
            <Term id="coluna_agua">Pressão</Term> por ponto de água
          </SectionTitle>
        </div>
        <Table head={['Aparelho', 'Nível', 'm.c.a.', 'kPa', 'Mínimo', 'Situação', 'Ajuste']} min="36rem">
          {rows.map((r) => (
            <tr key={`${r.pointId}-${r.system}`} className="border-b border-border/60 last:border-0" data-testid="pressure-row" data-ok={r.ok ? '1' : '0'}>
              <td className="py-1.5 pr-2 pl-3">
                <button type="button" className="text-left font-medium text-stone-900 underline-offset-2 hover:underline" onClick={() => showOnPlan([r.pointId])} title="Mostrar na planta">
                  {r.fixture}
                </button>
                <span className="block text-[10px] text-stone-500">{SYSTEM_LABEL[r.system]}</span>
              </td>
              <td className={`${td} text-stone-700`}>{r.levelName}</td>
              <td className={`${td} text-right tabular-nums`} data-testid="row-mca">{fmtM(Math.max(0, r.mca))}</td>
              <td className={`${td} text-right tabular-nums`}>{fmtM(Math.max(0, r.kpa), 1)}</td>
              <td className={`${td} text-right whitespace-nowrap tabular-nums`}>{fmtM(r.minMca)} m.c.a.</td>
              <td className={`${td} text-right font-medium ${r.ok ? 'text-ok' : 'text-fail'}`}>{r.ok ? 'Atende' : 'Não atende'}</td>
              <td className={`${td} text-right whitespace-nowrap tabular-nums`}>{r.ok ? '—' : `subir caixa ${fmtM(r.rise)} m`}</td>
            </tr>
          ))}
        </Table>
        {margin !== null ? <p className="px-3 py-2 text-[11px] text-stone-500">Pior folga: {fmtM(margin)} m.c.a. acima do mínimo. 1 m.c.a. = {fmtM(k.kPaPerMca, 1)} kPa.</p> : null}
      </Block>

      <Block className="p-0">
        <div className="px-3 pt-3">
          <SectionTitle aside={`${pipes.length} trechos`}>Tubos de água</SectionTitle>
        </div>
        <Table head={['Tubo', 'Sistema', 'DN', 'Vazão', 'Velocidade', 'Perda']} min="32rem">
          {pipes.map((p) => (
            <tr key={p.pipeId} className="border-b border-border/60 last:border-0">
              <td className="py-1.5 pr-2 pl-3 font-medium text-stone-900">
                <button type="button" onClick={() => showOnPlan([p.pipeId])} className="underline-offset-2 hover:underline" title="Mostrar na planta">
                  {p.pipeId.replace(/^auto-/, '')}
                </button>
              </td>
              <td className={td}>{p.systemLabel}</td>
              <td className={`${td} text-right tabular-nums`}>{p.dn}</td>
              <td className={`${td} text-right whitespace-nowrap tabular-nums`}>{formatNumber(p.flowLps, 2)} L/s</td>
              <td className={`${td} text-right whitespace-nowrap tabular-nums ${p.velocity > k.water.maxVelocity ? 'text-fail' : ''}`}>{formatNumber(p.velocity, 2)} m/s</td>
              <td className={`${td} text-right whitespace-nowrap tabular-nums`}>{formatNumber(p.headLoss, 2)} m.c.a.</td>
            </tr>
          ))}
        </Table>
      </Block>

      <Block className="p-0">
        <div className="px-3 pt-3">
          <SectionTitle aside={`${formatNumber(report.sewer.totalUhc, 0)} UHC${report.sewer.vented ? ' · ventilado' : ' · sem ventilação'}`}>Esgoto e ventilação</SectionTitle>
        </div>
        <Table head={['Tubo', 'UHC', 'DN', 'Declividade', 'Cotas (m)']} min="30rem">
          {[...sewer, ...vent].map((p) => (
            <tr key={p.pipeId} className="border-b border-border/60 last:border-0">
              <td className="py-1.5 pr-2 pl-3 font-medium text-stone-900">
                <button type="button" onClick={() => showOnPlan([p.pipeId])} className="underline-offset-2 hover:underline" title="Mostrar na planta">
                  {p.pipeId.replace(/^auto-/, '')}
                </button>
                <span className="block text-[10px] font-normal text-stone-500">{p.system === 'vent' ? 'Ventilação' : 'Esgoto'}</span>
              </td>
              <td className={`${td} text-right tabular-nums`}>{formatNumber(p.uhc, 0)}</td>
              <td className={`${td} text-right tabular-nums`}>{p.dn}</td>
              <td className={`${td} text-right tabular-nums`}>{p.system === 'vent' ? '—' : `${formatNumber(p.slope * 100, 1)}%`}</td>
              <td className={`${td} text-right whitespace-nowrap tabular-nums`}>
                {fmtM(p.zFrom)} → {fmtM(p.zTo)}
              </td>
            </tr>
          ))}
        </Table>
        <p className="px-3 py-2 text-[11px] text-stone-500">Aparelhos de banho descarregam numa <Term id="caixa_sifonada">caixa sifonada</Term>; a pia passa por caixa de gordura.</p>
      </Block>

      <Block>
        <SectionTitle>Caixa d’água e fossa</SectionTitle>
        <dl className="mt-1 divide-y divide-border/60">
          <KV label="Caixa d’água" value={`${formatNumber(report.tank.liters, 0)} L`} strong hint={`cota do fundo ${fmtM(report.layout.tank.bottomZ)} m`} />
          <KV label="Reserva" value={`${formatNumber(report.tank.dailyLiters, 0)} L/dia`} hint={`${report.tank.occupants} moradores`} />
          <KV label="Peso da caixa cheia" value={`${formatNumber(report.tank.fullKg, 0)} kg`} />
          {report.septic ? <KV label="Fossa séptica (volume)" value={`${formatNumber(report.septic.tankLiters, 0)} L`} hint={`${formatNumber(report.septic.contributionLpd, 0)} L/dia de contribuição`} /> : <KV label="Esgoto" value="Rede pública" />}
        </dl>
      </Block>

      {water.length > 0 ? (
        <Block>
          <SectionTitle aside={`${water.length}`}>Avisos da hidráulica</SectionTitle>
          <ul className="mt-2 space-y-2">
            {water.map((w, i) => (
              <li key={`${w.code}-${i}`} className={`rounded-lg border px-3 py-2 ${SEV[w.severity]}`} data-testid="plumb-warning">
                <p className="text-xs text-stone-800">
                  <GlossaryText>{w.message}</GlossaryText>
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="font-mono text-[10px] text-stone-500">{w.code}</span>
                  {(w.refs ?? []).length > 0 ? (
                    <button type="button" onClick={() => showOnPlan(w.refs ?? [])} className="inline-flex h-6 items-center rounded-md border border-border bg-white px-2 text-[11px] font-medium text-stone-700 hover:bg-stone-50">
                      Mostrar na planta
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      <p className="px-1 text-[11px] leading-snug text-stone-500">{DISCLAIMER}</p>
    </div>
  );
}
