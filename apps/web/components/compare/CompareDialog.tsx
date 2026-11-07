'use client';
import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, Equal, Loader2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, cn } from '@chalecad/ui';
import { STAGE_LABELS, STAGE_ORDER } from '@chalecad/catalog';
import type { Project, Results, TypologyKind } from '@chalecad/engine';
import { ArtNotice } from '@/components/ArtNotice';
import { Viewport } from '@/components/scene/Viewport';
import { getEngine } from '@/lib/engine/client';
import { diffMetrics, makeVariant, metricsOf, stageDiffs, type DiffRow, type VariantSpec } from '@/lib/project/compare';
import { formatArea, formatBRL, formatBRLRange, formatKg, formatNumber } from '@/lib/format';
import { TEMPLATE_LABELS } from '@/lib/project/templates';
import { getStorage } from '@/lib/storage';
import type { ProjectVersion } from '@/lib/storage';
import { useEditor } from '@/lib/store/editor';
import { SelectField, type Option } from '@/components/editor/properties/fields';

type Source = 'typology' | 'spacing' | 'slope' | 'version';
type VersionInfo = Omit<ProjectVersion, 'project'>;

const SLOPES = [0, 5, 10, 15, 20, 30];

const SOURCES: { id: Source; title: string; hint: string }[] = [
  { id: 'typology', title: 'Outra tipologia', hint: 'Mesmas medidas, outro telhado' },
  { id: 'spacing', title: 'Espaçamento dos montantes', hint: '40 × 60 cm' },
  { id: 'slope', title: 'Inclinação do terreno', hint: 'Plano ou inclinado' },
  { id: 'version', title: 'Versão salva', hint: 'Compare com um ponto do histórico' },
];

interface Computed {
  a: Results;
  b: Results;
  bProject: Project;
}

const money = (n: number) => formatBRL(n, 0);

function fmtValue(row: DiffRow, v: number | null): string {
  if (v === null) return '—';
  switch (row.unit) {
    case 'brl':
      return money(v);
    case 'brl_m2':
      return `${money(v)}/m²`;
    case 'm2':
      return formatArea(v, 1);
    case 'kg':
      return formatKg(v);
    case 'kg_m2':
      return `${formatNumber(v, 1)} kg/m²`;
    case 'count':
      return formatNumber(v, 0);
    case 'ratio':
      return formatNumber(v, 2);
  }
}

function fmtDelta(row: DiffRow): string {
  if (row.delta === null) return '—';
  const sign = row.delta > 0 ? '+' : row.delta < 0 ? '−' : '';
  const abs = Math.abs(row.delta);
  const body = fmtValue(row, abs);
  const pct = row.deltaPct !== null && Math.abs(row.deltaPct) >= 0.05 ? ` (${row.deltaPct > 0 ? '+' : '−'}${formatNumber(Math.abs(row.deltaPct), 1)}%)` : '';
  return `${sign}${body}${pct}`;
}

function Arrow({ delta, winner }: { delta: number | null; winner: DiffRow['winner'] }) {
  if (delta === null || winner === 'tie') return <Equal className="size-3.5 text-stone-400" aria-hidden />;
  const Icon = delta > 0 ? ArrowUp : ArrowDown;
  // Verde = B melhor; vermelho = B pior; cinza = indiferente.
  const tone = winner === 'b' ? 'text-emerald-600' : winner === 'a' ? 'text-red-600' : 'text-stone-500';
  return <Icon className={cn('size-3.5', tone)} aria-hidden />;
}

function ratioTone(v: number | null) {
  if (v === null) return '';
  return v > 1 ? 'text-red-700' : v >= 0.7 ? 'text-amber-700' : '';
}

function MiniScene({ results, label, name, tone }: { results: Results | null; label: string; name: string; tone: 'a' | 'b' }) {
  return (
    <figure className="min-w-0 overflow-hidden rounded-xl border border-border bg-white">
      <div className="relative h-44 bg-surface-sunken">
        {results ? <Viewport model={results.model} showcase /> : <div className="grid h-full place-items-center text-stone-400"><Loader2 className="size-5 animate-spin" /></div>}
        <span className={cn('absolute top-2 left-2 grid size-6 place-items-center rounded-full text-xs font-bold text-white shadow', tone === 'a' ? 'bg-stone-800' : 'bg-accent')}>{label}</span>
      </div>
      <figcaption className="border-t border-border px-3 py-2">
        <p className="truncate text-sm font-semibold text-stone-900">{name}</p>
        <p className="text-xs text-stone-500 tabular-nums">
          {results ? `${formatArea(results.model.builtArea, 1)} construídos · cumeeira ${formatNumber(results.model.ridgeHeight, 2)} m` : 'Calculando…'}
        </p>
      </figcaption>
    </figure>
  );
}

function describeB(spec: VariantSpec, versionName?: string): string {
  switch (spec.kind) {
    case 'typology':
      return TEMPLATE_LABELS[spec.typology];
    case 'spacing':
      return `Montantes a cada ${spec.spacing === 0.4 ? '40' : '60'} cm`;
    case 'slope':
      return spec.pct <= 0 ? 'Terreno plano' : `Terreno com ${spec.pct}% de inclinação`;
    case 'project':
      return versionName ? `Versão “${versionName}”` : 'Versão salva';
  }
}

export function CompareDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const project = useEditor((s) => s.project);
  const projectId = useEditor((s) => s.projectId);
  const [source, setSource] = useState<Source>('spacing');
  const [typology, setTypology] = useState<TypologyKind>('gambrel');
  const [slopePct, setSlopePct] = useState(10);
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [versionProject, setVersionProject] = useState<{ id: string; name: string; project: Project } | null>(null);
  const [data, setData] = useState<Computed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Fotografia do projeto A ao abrir: editar atrás do diálogo não deve mudar a comparação.
  const [snapshot, setSnapshot] = useState<Project>(project);
  useEffect(() => {
    if (open) setSnapshot(useEditor.getState().project);
  }, [open]);

  // Padrões coerentes com o projeto atual.
  useEffect(() => {
    if (!open) return;
    const p = useEditor.getState().project;
    setTypology(p.typology.kind === 'gambrel' ? 'gable_mezzanine' : 'gambrel');
    setSlopePct(p.site.type === 'sloped' ? (p.site.slopePct >= 15 ? 5 : 20) : 10);
    setSource('spacing');
    setVersionId(null);
    setVersionProject(null);
  }, [open]);

  useEffect(() => {
    if (!open || !projectId) {
      setVersions([]);
      return;
    }
    let live = true;
    getStorage()
      .listVersions(projectId)
      .then((v) => live && setVersions([...v].sort((a, b) => b.createdAt - a.createdAt)))
      .catch(() => live && setVersions([]));
    return () => {
      live = false;
    };
  }, [open, projectId]);

  useEffect(() => {
    if (!versionId) {
      setVersionProject(null);
      return;
    }
    let live = true;
    getStorage()
      .getVersion(versionId)
      .then((v) => live && setVersionProject(v ? { id: v.id, name: v.name, project: v.project } : null))
      .catch(() => live && setVersionProject(null));
    return () => {
      live = false;
    };
  }, [versionId]);

  const spec = useMemo<VariantSpec | null>(() => {
    switch (source) {
      case 'typology':
        return typology === snapshot.typology.kind ? null : { kind: 'typology', typology };
      case 'spacing':
        return { kind: 'spacing', spacing: snapshot.system.studSpacing === 0.6 ? 0.4 : 0.6 };
      case 'slope':
        return { kind: 'slope', pct: slopePct };
      case 'version':
        return versionProject ? { kind: 'project', project: versionProject.project } : null;
    }
  }, [source, typology, slopePct, snapshot, versionProject]);

  // Calcula A e B no worker (último pedido vence).
  useEffect(() => {
    if (!open || !spec) {
      setData(null);
      return;
    }
    let live = true;
    setBusy(true);
    setError(null);
    const t = setTimeout(async () => {
      try {
        const bProject = makeVariant(snapshot, spec);
        const [ra, rb] = await getEngine().computeMany([snapshot, bProject]);
        if (!live) return;
        if (ra?.ok && rb?.ok) setData({ a: ra.results, b: rb.results, bProject });
        else {
          setData(null);
          const bad = !ra?.ok ? ra : rb;
          setError(bad && !bad.ok ? (bad.issues[0]?.message ?? 'A variante não pôde ser calculada.') : 'A variante não pôde ser calculada.');
        }
      } catch (e) {
        if (live) {
          setData(null);
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (live) setBusy(false);
      }
    }, 120);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [open, spec, snapshot]);

  const rows = useMemo(() => (data ? diffMetrics(metricsOf(data.a), metricsOf(data.b)) : []), [data]);
  const stages = useMemo(() => (data ? stageDiffs(data.a, data.b).filter((s) => s.a !== 0 || s.b !== 0).sort((x, y) => STAGE_ORDER.indexOf(x.stage) - STAGE_ORDER.indexOf(y.stage)) : []), [data]);

  const typologyOptions: Option<TypologyKind>[] = (Object.keys(TEMPLATE_LABELS) as TypologyKind[]).map((k) => ({
    value: k,
    label: TEMPLATE_LABELS[k],
    disabled: k === snapshot.typology.kind,
    hint: k === snapshot.typology.kind ? 'atual' : undefined,
  }));

  const bName = spec ? describeB(spec, versionProject?.name) : 'Escolha a variante B';
  const total = rows.find((r) => r.key === 'total');

  const useB = () => {
    if (!data) return;
    const next = JSON.parse(JSON.stringify(data.bProject)) as Project;
    useEditor.getState().update(`Usar variante B: ${bName}`, (d) => {
      for (const k of Object.keys(d)) delete (d as unknown as Record<string, unknown>)[k];
      Object.assign(d, next);
    });
    useEditor.getState().select(null);
    onOpenChange(false);
    toast.success('Variante B carregada no editor.', { description: bName, action: { label: 'Desfazer', onClick: () => useEditor.getState().undo() } });
  };

  const winnerCell = (row: DiffRow, side: 'a' | 'b') => (row.winner === side ? 'bg-emerald-50 text-emerald-800 font-semibold' : '');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl gap-4 overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Comparar variantes</DialogTitle>
          <DialogDescription>Veja lado a lado o que muda em custo, peso e estrutura. Verde marca o melhor valor de cada linha.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 px-6 lg:grid-cols-[15rem_1fr]">
          <div className="space-y-3">
            <div role="radiogroup" aria-label="Variante B" className="space-y-1.5">
              {SOURCES.map((s) => {
                const disabled = s.id === 'version' && versions.length === 0;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={source === s.id}
                    disabled={disabled}
                    onClick={() => setSource(s.id)}
                    className={cn(
                      'w-full rounded-lg border px-3 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-50',
                      source === s.id ? 'border-accent bg-accent-soft/50 ring-1 ring-accent/30' : 'border-border bg-white hover:border-stone-300',
                    )}
                  >
                    <span className="block text-sm font-semibold text-stone-900">{s.title}</span>
                    <span className="block text-xs text-stone-500">{disabled ? (projectId ? 'Nenhuma versão nomeada salva ainda' : 'Salve o projeto e crie uma versão') : s.hint}</span>
                  </button>
                );
              })}
            </div>

            {source === 'typology' ? <SelectField label="Tipologia da variante B" value={typology} options={typologyOptions} onChange={setTypology} /> : null}
            {source === 'spacing' ? (
              <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-xs text-stone-600">
                Atual: {snapshot.system.studSpacing === 0.4 ? '40' : '60'} cm. A variante B usa {snapshot.system.studSpacing === 0.6 ? '40' : '60'} cm.
              </p>
            ) : null}
            {source === 'slope' ? (
              <SelectField
                label="Inclinação da variante B"
                value={String(slopePct)}
                options={SLOPES.map((v) => ({ value: String(v), label: v === 0 ? 'Terreno plano' : `${v}%` }))}
                onChange={(v) => setSlopePct(Number(v))}
                hint={snapshot.site.type === 'sloped' ? `atual ${formatNumber(snapshot.site.slopePct, 0)}%` : 'atual plano'}
              />
            ) : null}
            {source === 'version' ? (
              <SelectField
                label="Versão"
                value={versionId ?? undefined}
                placeholder="Escolha uma versão"
                options={versions.map((v) => ({ value: v.id, label: v.name, hint: new Date(v.createdAt).toLocaleDateString('pt-BR') }))}
                onChange={setVersionId}
              />
            ) : null}
          </div>

          <div className="min-w-0 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <MiniScene results={data?.a ?? null} label="A" name={`${snapshot.meta.name} (atual)`} tone="a" />
              <MiniScene results={data?.b ?? null} label="B" name={bName} tone="b" />
            </div>

            {error ? (
              <p className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> {error}
              </p>
            ) : null}
            {!spec ? <p className="rounded-md border border-border bg-surface-muted px-3 py-6 text-center text-sm text-stone-500">Escolha a variante B ao lado para ver as diferenças.</p> : null}

            {data ? (
              <div className={cn('space-y-4 transition-opacity', busy && 'opacity-50')} aria-live="polite">
                <div className="overflow-hidden rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-muted text-xs text-stone-500">
                      <tr>
                        <th scope="col" className="px-3 py-2 text-left font-medium">Indicador</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">A</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">B</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">B − A</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border tabular-nums">
                      {rows
                        .filter((r) => r.key !== 'totalMax')
                        .map((r) => {
                          const range = r.key === 'total' && data ? { a: formatBRLRange(data.a.budget.total, data.a.budget.totalMax), b: formatBRLRange(data.b.budget.total, data.b.budget.totalMax) } : null;
                          const tone = r.winner === 'b' ? 'text-emerald-700' : r.winner === 'a' ? 'text-red-700' : 'text-stone-600';
                          return (
                            <tr key={r.key}>
                              <th scope="row" className="px-3 py-2 text-left font-medium text-stone-700">{r.key === 'total' ? 'Custo total' : r.label}</th>
                              <td className={cn('px-3 py-2 text-right', winnerCell(r, 'a'), r.key === 'worstRatio' && ratioTone(r.a))}>
                                {fmtValue(r, r.a)}
                                {range ? <span className="block text-[10px] font-normal text-stone-500">faixa {range.a}</span> : null}
                              </td>
                              <td className={cn('px-3 py-2 text-right', winnerCell(r, 'b'), r.key === 'worstRatio' && ratioTone(r.b))}>
                                {fmtValue(r, r.b)}
                                {range ? <span className="block text-[10px] font-normal text-stone-500">faixa {range.b}</span> : null}
                              </td>
                              <td className={cn('px-3 py-2 text-right text-xs font-medium', tone)}>
                                <span className="inline-flex items-center justify-end gap-1">
                                  <Arrow delta={r.delta} winner={r.winner} />
                                  {r.winner === 'tie' ? 'igual' : fmtDelta(r)}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>

                {total && total.delta !== null ? (
                  <p className="text-xs text-stone-600">
                    {Math.abs(total.delta) < 1 ? 'As variantes custam praticamente o mesmo.' : `A variante B custa ${money(Math.abs(total.delta))} ${total.delta < 0 ? 'a menos' : 'a mais'} que a A.`}
                  </p>
                ) : null}

                <div>
                  <h3 className="mb-2 text-xs font-semibold tracking-wide text-stone-700 uppercase">Orçamento por etapa</h3>
                  <div className="overflow-hidden rounded-xl border border-border">
                    <table className="w-full text-xs">
                      <thead className="bg-surface-muted text-stone-500">
                        <tr>
                          <th scope="col" className="px-3 py-1.5 text-left font-medium">Etapa</th>
                          <th scope="col" className="px-3 py-1.5 text-right font-medium">A</th>
                          <th scope="col" className="px-3 py-1.5 text-right font-medium">B</th>
                          <th scope="col" className="px-3 py-1.5 text-right font-medium">B − A</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border tabular-nums">
                        {stages.map((s) => {
                          const better = Math.abs(s.delta) < 1 ? null : s.delta < 0;
                          return (
                            <tr key={s.stage}>
                              <th scope="row" className="px-3 py-1.5 text-left font-medium text-stone-700">{STAGE_LABELS[s.stage]}</th>
                              <td className="px-3 py-1.5 text-right">{money(s.a)}</td>
                              <td className="px-3 py-1.5 text-right">{money(s.b)}</td>
                              <td className={cn('px-3 py-1.5 text-right font-medium', better === null ? 'text-stone-500' : better ? 'text-emerald-700' : 'text-red-700')}>
                                <span className="inline-flex items-center justify-end gap-1">
                                  {better === null ? <Equal className="size-3" /> : s.delta > 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                                  {better === null ? 'igual' : `${s.delta > 0 ? '+' : '−'}${money(Math.abs(s.delta))}`}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <ArtNotice />
              </div>
            ) : busy ? (
              <p className="flex items-center justify-center gap-2 py-4 text-sm text-stone-500">
                <Loader2 className="size-4 animate-spin" /> Calculando as duas variantes…
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter className="border-t border-border px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button variant="accent" disabled={!data || busy} onClick={useB}>
            Usar variante B <ArrowRight />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
