'use client';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Droplets, Loader2, Scissors, Wallet } from 'lucide-react';
import { Button, cn } from '@chalecad/ui';
import { computeAll, type Project, type Results } from '@chalecad/engine';
import { getCatalog } from '@chalecad/catalog';
import { fmt } from '@/lib/project/format';
import { presetThumbnailSvg } from '@/lib/project/presets/thumbnail';
import { planSvg } from '@/lib/plan2d';
import { generateProject } from '@/lib/project/wizard/generate';
import type { WizardAnswers } from '@/lib/project/wizard/answers';
import { STYLE_NAMES, resolveStyle } from '@/lib/project/wizard/style';
import { budgetStatus, cutSuggestions, type CutSuggestion } from '@/lib/project/wizard/suggestions';
import { ArtNotice } from '../ArtNotice';
import { Notice } from '../editor/properties/fields';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const brlK = (n: number) => `R$ ${Math.round(n / 1000).toLocaleString('pt-BR')} mil`;

export interface Generated {
  project: Project;
  notes: string[];
  results: Results;
}

type State = { kind: 'loading' } | { kind: 'error'; message: string } | ({ kind: 'ready' } & Generated);

/** Gera o chalé das respostas (fora do primeiro desenho, para a tela mostrar "montando"). */
export function useGenerated(a: WizardAnswers): State {
  const [state, setState] = useState<State>({ kind: 'loading' });
  useEffect(() => {
    setState({ kind: 'loading' });
    const t = setTimeout(() => {
      try {
        const g = generateProject(a);
        setState({ kind: 'ready', ...g, results: computeAll(g.project, getCatalog()) });
      } catch (e) {
        console.error('[assistente]', e);
        setState({ kind: 'error', message: e instanceof Error ? e.message : 'erro desconhecido' });
      }
    }, 30);
    return () => clearTimeout(t);
  }, [a]);
  return state;
}

function Svg({ html, className }: { html: string; className?: string }) {
  return <div className={cn('[&>svg]:h-full [&>svg]:w-full', className)} dangerouslySetInnerHTML={{ __html: html }} aria-hidden />;
}

export function ResultStep({ a, name, onName, onApply, onCreate, onBack, creating }: { a: WizardAnswers; name: string; onName: (v: string) => void; onApply: (next: WizardAnswers) => void; onCreate: (p: Project) => void; onBack: () => void; creating: boolean }) {
  const state = useGenerated(a);
  const [levelId, setLevelId] = useState('L0');
  const [suggestions, setSuggestions] = useState<CutSuggestion[] | null>(null);

  const ready = state.kind === 'ready' ? state : null;
  const cost = ready ? { min: ready.results.budget.total, max: ready.results.budget.totalMax } : null;
  const status = cost ? budgetStatus(a, cost) : null;

  useEffect(() => {
    setSuggestions(null);
    if (!cost || status?.status !== 'over') return;
    const t = setTimeout(() => setSuggestions(cutSuggestions(a, cost)), 40);
    return () => clearTimeout(t);
  }, [ready?.project, status?.status]);

  const thumb = useMemo(() => {
    if (!ready) return null;
    try {
      return presetThumbnailSvg(ready.project);
    } catch {
      return null;
    }
  }, [ready]);
  const levels = ready?.project.levels ?? [];
  const plan = useMemo(() => {
    if (!ready) return null;
    const id = levels.some((l) => l.id === levelId) ? levelId : 'L0';
    const doc = planSvg(ready.results.model, { levelId: id, project: ready.project, idPrefix: 'wz' });
    return doc.svg.replace(/^<svg([^>]*)>/, (_m, attrs: string) => `<svg${attrs.replace(/\s(width|height)="[^"]*"/g, '')} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Planta">`);
  }, [ready, levelId]);

  if (state.kind === 'loading') {
    return (
      <div role="status" className="grid min-h-80 place-items-center text-stone-500">
        <span className="flex items-center gap-2 text-base">
          <Loader2 className="size-5 animate-spin" /> Montando o seu chalé…
        </span>
      </div>
    );
  }
  if (state.kind === 'error') {
    return (
      <div className="space-y-3 py-6">
        <Notice tone="fail">Não consegui montar com essas respostas ({state.message}). Volte e mude alguma coisa.</Notice>
        <Button variant="outline" onClick={onBack}>
          Voltar e ajustar
        </Button>
      </div>
    );
  }

  const { project, notes, results } = state;
  const model = results.model;
  const rooms = model.rooms.filter((r) => r.polygon);
  const style = STYLE_NAMES[resolveStyle(a).kind];
  const hasTower = project.extras.some((e) => e.kind === 'water_tower');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-stone-900">Seu chalé está montado</h2>
        <p className="mt-1.5 text-sm text-stone-600">
          {style}, {fmt(model.builtArea, 0)} m² construídos. É um ponto de partida: depois de criar, dá para mudar tudo no editor e os números se atualizam na hora.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <figure className="rounded-2xl border border-border bg-gradient-to-b from-sky-50 to-stone-50 p-3">
          <div className="h-80">{thumb ? <Svg html={thumb} className="h-full w-full" /> : null}</div>
          <figcaption className="mt-1 text-center text-xs text-stone-500">Fachada da frente</figcaption>
        </figure>
        <figure className="rounded-2xl border border-border bg-white p-3">
          {levels.length > 1 ? (
            <div className="mb-2 flex gap-1.5" role="tablist" aria-label="Pavimento da planta">
              {levels.map((l) => (
                <button key={l.id} type="button" role="tab" aria-selected={l.id === (levels.some((x) => x.id === levelId) ? levelId : 'L0')} onClick={() => setLevelId(l.id)} className={cn('rounded-full border px-3 py-1 text-xs font-medium', l.id === levelId ? 'border-accent bg-accent-soft text-accent-hover' : 'border-border text-stone-600 hover:bg-stone-50')}>
                  {l.name ?? l.id}
                </button>
              ))}
            </div>
          ) : null}
          <div className="h-80">{plan ? <Svg html={plan} className="h-full w-full" /> : null}</div>
          <figcaption className="mt-1 text-center text-xs text-stone-500">Planta com os cômodos{hasTower ? " (a torre da caixa d'água aparece tracejada)" : ''}</figcaption>
        </figure>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="wz-tem" className="rounded-2xl border border-border bg-white p-4">
          <h3 id="wz-tem" className="text-base font-semibold text-stone-900">O que vai ter</h3>
          <ul className="mt-2 divide-y divide-border text-sm">
            {rooms.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-1.5">
                <span className="text-stone-800">{r.name}</span>
                <span className="tabular-nums text-stone-500">{fmt(r.area, 1)} m²</span>
              </li>
            ))}
            {project.extras.map((e) => (
              <li key={e.id} className="flex items-center gap-1.5 py-1.5 text-stone-800">
                {e.kind === 'water_tower' ? <Droplets className="size-3.5 text-sky-600" aria-hidden /> : null}
                {e.kind === 'deck' ? (e.side === 'back' ? 'Área coberta nos fundos' : e.covered ? 'Varanda coberta' : 'Varanda / deck') : e.kind === 'water_tower' ? "Torre da caixa d'água" : e.kind === 'retaining' ? 'Muro de arrimo' : e.kind}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-stone-500">
            {project.furniture.length > 0 ? `${project.furniture.length} móveis colocados. ` : ''}
            {project.installations.enabled ? 'Instalações estimadas. ' : ''}
            {project.system.structure === 'wood' ? 'Estrutura de madeira.' : 'Estrutura de aço.'}
          </p>
        </section>

        <section aria-labelledby="wz-custo" className="rounded-2xl border border-border bg-white p-4">
          <h3 id="wz-custo" className="flex items-center gap-1.5 text-base font-semibold text-stone-900">
            <Wallet className="size-4 text-stone-500" aria-hidden /> Custo estimado
          </h3>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-stone-900">
            {brlK(results.budget.total)} <span className="text-lg font-normal text-stone-500">a {brlK(results.budget.totalMax)}</span>
          </p>
          <p className="text-xs text-stone-500">{brl(results.budget.perM2)} por m². Já com 15% de folga para imprevistos. Preços médios de 2026: confirme na sua região.</p>
          {status?.status === 'unknown' ? <Notice>Você não informou quanto pretende gastar. Sem problema: use a faixa acima como referência.</Notice> : null}
          {status?.status === 'within' ? (
            <p className="mt-3 flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-sm text-emerald-800">
              <Check className="size-4" aria-hidden /> Cabe no seu orçamento.
            </p>
          ) : null}
          {status?.status === 'over' ? (
            <div className="mt-3 space-y-2">
              <p className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> Passa uns {brlK(status.over)} do seu orçamento (até {brlK(status.ceiling ?? 0)}). Dá para cortar:
              </p>
              {suggestions === null ? (
                <p className="flex items-center gap-1.5 text-xs text-stone-500">
                  <Loader2 className="size-3.5 animate-spin" /> Calculando onde economizar…
                </p>
              ) : suggestions.length === 0 ? (
                <p className="text-sm text-stone-600">Não achei um corte simples que ajude. Tente menos quartos ou um estilo mais simples.</p>
              ) : (
                <ul className="space-y-1.5">
                  {suggestions.map((s) => (
                    <li key={s.id} className="flex items-start gap-2 rounded-md border border-border px-2.5 py-2 text-sm">
                      <Scissors className="mt-0.5 size-4 shrink-0 text-stone-400" aria-hidden />
                      <span className="flex-1 text-stone-800">{s.text}</span>
                      <Button size="sm" variant="outline" onClick={() => onApply(s.answers)}>
                        Aplicar
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </section>
      </div>

      <section aria-labelledby="wz-notas" className="rounded-2xl border border-border bg-surface-muted p-4">
        <h3 id="wz-notas" className="text-base font-semibold text-stone-900">O que decidimos por você</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-stone-700">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </section>

      <div className="space-y-3">
        <label className="block max-w-sm space-y-1.5 text-xs font-medium text-stone-700">
          Nome do projeto
          <input value={name} maxLength={120} placeholder={project.meta.name} onChange={(e) => onName(e.target.value)} className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm text-stone-900 shadow-sm outline-none hover:border-stone-300 focus:ring-2 focus:ring-accent/50" />
        </label>
        <ArtNotice />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" size="lg" onClick={onBack}>
          Voltar e ajustar
        </Button>
        <Button variant="accent" size="lg" disabled={creating} onClick={() => onCreate({ ...project, meta: { ...project.meta, name: (name.trim() || project.meta.name).slice(0, 120) } })}>
          <Check /> Criar meu chalé
        </Button>
      </div>
    </div>
  );
}
