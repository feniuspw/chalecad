'use client';
import { useMemo } from 'react';
import { ArrowLeft, ArrowUpToLine, Droplets, Trash2 } from 'lucide-react';
import { Button, Kbd } from '@chalecad/ui';
import { getCatalog } from '@chalecad/catalog';
import type { PipeSystem, PlumbingReport } from '@chalecad/engine';
import { formatNumber } from '@/lib/format';
import { Term } from '@/components/glossary/Term';
import { useEditor } from '@/lib/store/editor';
import { deletePlumbSelection, noteManual, raiseTankUntilOk } from '@/lib/plumb/actions';
import { fmtM, pathLength, SYSTEM_LABEL, SYSTEMS, type V3 } from '@/lib/plumb/geometry';
import { liveLayout, plumbingReportOf } from '@/lib/plumb/live';
import { horizontalRunZ, patchPipe, patchPoint, requiredRise, setPipeZ, setTankBottom } from '@/lib/plumb/ops';
import { pressureRows } from '@/lib/plumb/report';
import { usePlumb } from '@/lib/plumb/store';
import { Field, NumberField, SelectField } from './fields';
import { Body, Row } from './inspector-parts';

function PlumbHeader({ title, subtitle, onDelete }: { title: string; subtitle?: string; onDelete?: () => void }) {
  const select = usePlumb((s) => s.select);
  return (
    <div className="sticky top-0 z-10 border-b border-border bg-white px-3 py-2.5">
      <button type="button" onClick={() => select(null)} className="mb-1.5 flex items-center gap-1 rounded text-[11px] font-medium text-stone-500 outline-none hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-accent/50">
        <ArrowLeft className="size-3" /> Propriedades do projeto <Kbd className="ml-1">Esc</Kbd>
      </button>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-stone-900">{title}</h2>
          {subtitle ? <p className="truncate text-xs text-stone-500">{subtitle}</p> : null}
        </div>
        {onDelete ? (
          <Button variant="outline" size="sm" onClick={onDelete} className="text-fail hover:text-red-700">
            <Trash2 /> Excluir
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Cota do fundo, volume, peso cheia e "Subir até atender" da caixa d'água. */
export function TankFields({ report }: { report: PlumbingReport }) {
  const update = useEditor((s) => s.update);
  const rise = requiredRise(report);
  const t = report.layout.tank;
  return (
    <div className="space-y-2" data-testid="tank-fields">
      <NumberField
        label="Cota do fundo da caixa (m)"
        value={t.bottomZ}
        min={0}
        max={30}
        step={0.05}
        unit="m"
        hint="acima do piso do térreo"
        onChange={(v) => update("Cota da caixa d'água", (d) => setTankBottom(d, report.layout, v))}
      />
      <dl className="divide-y divide-border/60">
        <Row label="Volume" value={`${formatNumber(t.liters, 0)} L`} />
        <Row label="Peso cheia" value={`${formatNumber(report.tank.fullKg, 0)} kg`} />
        <Row label="Reserva" value={`${report.tank.occupants} moradores · ${formatNumber(report.tank.dailyLiters, 0)} L/dia`} />
      </dl>
      <Button size="sm" variant={rise > 0 ? 'default' : 'outline'} className="w-full" onClick={() => raiseTankUntilOk()} disabled={rise <= 0} data-testid="raise-tank">
        <ArrowUpToLine /> Subir até atender{rise > 0 ? ` (+${fmtM(rise)} m)` : ''}
      </Button>
      {rise <= 0 ? <p className="text-[11px] text-ok">Todos os pontos atendem a <Term id="coluna_agua">pressão</Term> mínima.</p> : null}
    </div>
  );
}

const DN_OPTIONS: Record<PipeSystem, number[]> = { cold: [20, 25, 32, 40, 50], hot: [20, 25, 32, 40], sewer: [40, 50, 75, 100, 150], vent: [40, 50, 75, 100] };

function PipePanel({ id, report }: { id: string; report: PlumbingReport }) {
  const update = useEditor((s) => s.update);
  const project = useEditor((s) => s.project);
  const layout = useMemo(() => liveLayout(project, report), [project, report]);
  const k = getCatalog().constants.plumbing;
  const pipe = layout?.pipes.find((p) => p.id === id);
  const w = report.water.pipes.find((p) => p.pipeId === id);
  const sw = report.sewer.pipes.find((p) => p.pipeId === id);
  if (!layout || !pipe) return null;
  const was = () => useEditor.getState().project.installations.plumbing.manual;
  const edit = (label: string, f: (d: Parameters<Parameters<typeof update>[1]>[0]) => void) => {
    const m = was();
    update(label, f);
    noteManual(m);
  };
  const path = pipe.path as V3[];
  const zs = path.map((v) => v[2]);
  const runZ = horizontalRunZ(path);
  const dnAuto = w?.dn ?? sw?.dn;
  const slopeDefault = sw?.slope;
  return (
    <Body>
      <SelectField<PipeSystem>
        label="Sistema"
        value={pipe.system}
        options={SYSTEMS.map((s) => ({ value: s, label: SYSTEM_LABEL[s] }))}
        onChange={(v) => edit('Sistema do tubo', (d) => patchPipe(d, layout, id, { system: v }))}
      />
      <SelectField<string>
        label="DN (diâmetro nominal, mm)"
        value={pipe.dn !== undefined ? String(pipe.dn) : 'auto'}
        options={[{ value: 'auto', label: `Automático${dnAuto ? ` (DN ${dnAuto})` : ''}` }, ...DN_OPTIONS[pipe.system].map((n) => ({ value: String(n), label: `DN ${n}${pipe.dn === n ? ' (travado)' : ''}` }))]}
        onChange={(v) => edit('DN do tubo', (d) => patchPipe(d, layout, id, { dn: v === 'auto' ? null : Number(v) }))}
      />
      {pipe.system === 'sewer' ? (
        <NumberField
          label="Declividade (%)"
          value={Math.round((pipe.slope ?? slopeDefault ?? k.sewer.slopeMin.upTo75) * 1000) / 10}
          min={0}
          max={20}
          step={0.5}
          unit="%"
          hint={pipe.slope === undefined ? 'automática pelo DN' : 'travada'}
          onChange={(v) => edit('Declividade do tubo', (d) => patchPipe(d, layout, id, { slope: v / 100 }))}
        />
      ) : null}
      {pipe.system === 'sewer' && pipe.slope !== undefined ? (
        <Button size="sm" variant="outline" onClick={() => edit('Declividade automática', (d) => patchPipe(d, layout, id, { slope: null }))}>
          Declividade automática
        </Button>
      ) : null}
      {runZ !== null ? (
        <NumberField label="Cota do trecho horizontal (m do piso)" value={runZ} min={-3} max={10} step={0.05} unit="m" hint={pipe.system === 'cold' || pipe.system === 'hot' ? 'padrão: forro − 0,1 m' : 'abaixo de 0 = sob o piso'} onChange={(v) => edit('Cota do tubo', (d) => void setPipeZ(d, layout, id, v))} />
      ) : (
        <Row label="Cota (m do piso)" value={`${fmtM(Math.min(...zs))} a ${fmtM(Math.max(...zs))}`} />
      )}
      <dl className="divide-y divide-border/60" data-testid="pipe-results">
        <Row label="Comprimento" value={`${fmtM(pathLength(path))} m`} />
        {w ? (
          <>
            <Row label="Vazão" value={`${formatNumber(w.flowLps, 2)} L/s`} />
            <Row label="Velocidade" value={`${formatNumber(w.velocity, 2)} m/s`} />
            <Row label="Perda de carga" value={`${formatNumber(w.headLoss, 2)} m.c.a.`} />
          </>
        ) : null}
        {sw ? (
          <>
            <Row label="UHC atendidas" value={formatNumber(sw.uhc, 0)} />
            <Row label="Cotas (montante → jusante)" value={`${fmtM(sw.zFrom)} → ${fmtM(sw.zTo)} m`} />
          </>
        ) : null}
      </dl>
    </Body>
  );
}

function PointPanel({ id, report }: { id: string; report: PlumbingReport }) {
  const update = useEditor((s) => s.update);
  const project = useEditor((s) => s.project);
  const k = getCatalog().constants.plumbing;
  const layout = liveLayout(project, report);
  const pt = layout?.points.find((p) => p.id === id);
  if (!layout || !pt) return null;
  const rows = pressureRows(report, project, k).filter((r) => r.pointId === id);
  const fixtures = Object.entries(k.water.fixtures);
  return (
    <Body>
      <SelectField<string>
        label="Aparelho"
        value={pt.fixture}
        options={fixtures.map(([key, f]) => ({ value: key, label: f.label }))}
        onChange={(v) => {
          const m = useEditor.getState().project.installations.plumbing.manual;
          update('Aparelho do ponto', (d) => patchPoint(d, layout, id, { fixture: v, label: k.water.fixtures[v]?.label ?? null }));
          noteManual(m);
        }}
      />
      {rows.length === 0 ? <p className="text-xs text-stone-500">Sem pressão calculada: ligue um tubo de água a este ponto.</p> : null}
      {rows.map((r) => (
        <div key={r.system} className="space-y-1" data-testid="point-pressure">
          <h4 className={`text-xs font-semibold tracking-wide uppercase ${r.ok ? 'text-ok' : 'text-fail'}`}>
            {r.system === 'hot' ? 'Água quente' : 'Água fria'}: {r.ok ? 'atende' : `faltam ${fmtM(r.rise)} m na caixa`}
          </h4>
          <dl className="divide-y divide-border/60">
            <Row label="Pressão dinâmica" value={`${fmtM(Math.max(0, r.mca))} m.c.a. · ${fmtM(Math.max(0, r.kpa), 1)} kPa`} />
            <Row label="Pressão estática" value={`${fmtM(r.staticMca)} m.c.a.`} />
            <Row label="Perdas no caminho" value={`${fmtM(r.lossMca)} m.c.a.`} />
            <Row label="Mínimo (NBR 5626)" value={`${fmtM(r.minMca)} m.c.a. · ${fmtM(r.minKpa, 1)} kPa`} />
          </dl>
        </div>
      ))}
      {rows.length > 0 ? <p className="text-[11px] text-stone-500">O caminho crítico (caixa até este ponto) está destacado em âmbar na planta.</p> : null}
    </Body>
  );
}

/** Inspetor do tubo, ponto ou caixa selecionado na camada Hidráulica. */
export function PlumbInspector() {
  const sel = usePlumb((s) => s.sel);
  const project = useEditor((s) => s.project);
  const results = useEditor((s) => s.results);
  const report = plumbingReportOf(project, results);
  if (!sel || !report) return null;
  const layout = liveLayout(project, report)!;
  if (sel.kind === 'tank') {
    return (
      <div>
        <PlumbHeader title="Caixa d'água" subtitle={`${formatNumber(layout.tank.liters, 0)} L`} />
        <Body>
          <TankFields report={report} />
          <p className="text-xs text-stone-500">Arraste a caixa na planta (ferramenta Selecionar e mover) para trocar a posição.</p>
        </Body>
      </div>
    );
  }
  if (sel.kind === 'point') {
    const pt = layout.points.find((p) => p.id === sel.id);
    return (
      <div>
        <PlumbHeader title={pt?.label ?? 'Ponto de água'} subtitle="Ponto de água" onDelete={() => void deletePlumbSelection()} />
        <PointPanel id={sel.id} report={report} />
      </div>
    );
  }
  const pipe = layout.pipes.find((p) => p.id === sel.id);
  return (
    <div>
      <PlumbHeader title={pipe ? `Tubo de ${SYSTEM_LABEL[pipe.system].toLowerCase()}` : 'Tubo'} subtitle={pipe?.id} onDelete={() => void deletePlumbSelection()} />
      <PipePanel id={sel.id} report={report} />
    </div>
  );
}

/** Bloco "Hidráulica" da seção Instalações: camada, modo do traçado e a caixa d'água. */
export function PlumbingBlock() {
  const project = useEditor((s) => s.project);
  const results = useEditor((s) => s.results);
  const layer = usePlumb((s) => s.layer);
  const setLayer = usePlumb((s) => s.setLayer);
  const report = plumbingReportOf(project, results);
  return (
    <div className="space-y-2" data-testid="plumbing-block">
      <h4 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-stone-700 uppercase">
        <Droplets className="size-3.5 text-sky-500" /> Hidráulica
      </h4>
      <Field label="Camada na planta" hint={<>atalho <Kbd>H</Kbd></>}>
        <Button size="sm" variant={layer ? 'default' : 'outline'} onClick={() => setLayer(!layer)} aria-pressed={layer}>
          {layer ? 'Ocultar tubos e pressão' : 'Mostrar tubos e pressão na planta'}
        </Button>
      </Field>
      {report ? (
        <>
          <p className="text-[11px] text-stone-500">{project.installations.plumbing.manual ? 'Traçado manual: você o desenhou. Em "Hidráulica" na planta, "Gerar automaticamente" volta ao do motor.' : 'Traçado gerado pelo motor. Edite na planta e ele vira seu.'}</p>
          <TankFields report={report} />
        </>
      ) : (
        <p className="text-[11px] text-stone-500">Sem traçado: marque o banheiro (ferramenta Cômodo) ou ponha a torre da caixa d’água.</p>
      )}
    </div>
  );
}
