'use client';
import { useState } from 'react';
import { CircleCheck, ChevronDown, ChevronRight, ShieldAlert, TriangleAlert, Wand2, OctagonAlert, Wind } from 'lucide-react';
import { toast } from 'sonner';
import { Button, cn } from '@chalecad/ui';
import { getCatalog } from '@chalecad/catalog';
import type { CheckStatus, Project, StructuralCheck, StructuralReport } from '@chalecad/engine';
import { formatBRL, formatNumber } from '@/lib/format';
import { useEditor } from '@/lib/store/editor';
import { Block, EmptyState, KV, SectionTitle } from './shared';

export const STRUCTURE_NOTE = 'Resultados indicam apenas se o elemento está dentro da faixa usual; não é aprovação estrutural.';

const STATUS: Record<CheckStatus, { label: string; bar: string; text: string; icon: typeof CircleCheck; chip: string }> = {
  ok: { label: 'Dentro da faixa', bar: 'bg-ok', text: 'text-emerald-700', icon: CircleCheck, chip: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  warn: { label: 'Atenção', bar: 'bg-warn', text: 'text-amber-700', icon: TriangleAlert, chip: 'border-amber-200 bg-amber-50 text-amber-800' },
  fail: { label: 'Revisar', bar: 'bg-fail', text: 'text-red-700', icon: OctagonAlert, chip: 'border-red-200 bg-red-50 text-red-800' },
};

const KIND_LABEL: Record<StructuralCheck['kind'], string> = {
  stud: 'Montante',
  joist: 'Viga de piso',
  rafter: 'Caibro',
  header: 'Verga',
  bracing: 'Contraventamento',
  anchorage: 'Ancoragem',
  soil: 'Solo',
  purlin: 'Terça',
};

const RATIO_MAX = 1.5;

/** Barra de taxa de uso de 0 a 1,5 com marcas em 0,7 e 1,0. */
export function RatioBar({ ratio, status }: { ratio: number; status: CheckStatus }) {
  const pct = (v: number) => `${(Math.min(v, RATIO_MAX) / RATIO_MAX) * 100}%`;
  return (
    <div className="relative h-2 w-full rounded-full bg-stone-200" role="img" aria-label={`Taxa de uso ${formatNumber(ratio, 2)} (limite 1,00)`}>
      <span className={cn('absolute inset-y-0 left-0 rounded-full', STATUS[status].bar)} style={{ width: pct(ratio) }} />
      {[0.7, 1].map((m) => (
        <span key={m} className="absolute -top-0.5 -bottom-0.5 w-px bg-stone-600/50" style={{ left: pct(m) }} />
      ))}
    </div>
  );
}

type Applier = (d: Project) => void;

/** Converte a sugestão do motor em uma edição do projeto, conforme o tipo da verificação. */
export function suggestionRecipe(check: StructuralCheck): { label: string; recipe: Applier } | null {
  const s = check.suggestion;
  if (!s) return null;
  const profile = s.profileId;
  const spacing = s.studSpacing;
  const hasProfile = profile !== undefined && getCatalog().profiles.some((p) => p.id === profile);
  const field = check.kind === 'stud' ? 'wallStud' : check.kind === 'joist' ? 'joist' : check.kind === 'rafter' ? 'rafter' : check.kind === 'purlin' ? 'purlin' : null;
  const applyProfile = hasProfile && field !== null;
  if (!applyProfile && spacing === undefined) return null;
  const parts: string[] = [];
  if (applyProfile) parts.push(profile!);
  if (spacing !== undefined) parts.push(`montantes a cada ${formatNumber(spacing * 100, 0)} cm`);
  return {
    label: parts.join(' + '),
    recipe: (d) => {
      if (applyProfile && field) {
        d.system.profiles[field] = profile!;
        if (field === 'wallStud') {
          const track = profile!.replace(/^Ue/, 'U');
          if (getCatalog().profiles.some((p) => p.id === track)) d.system.profiles.wallTrack = track;
        }
      }
      if (spacing !== undefined) d.system.studSpacing = spacing;
    },
  };
}

function Summary({ report }: { report: StructuralReport }) {
  const { ok, warn, fail, maxRatio } = report.summary;
  const worst: CheckStatus = fail > 0 ? 'fail' : warn > 0 ? 'warn' : 'ok';
  const headline = worst === 'ok' ? 'Tudo dentro da faixa usual' : worst === 'warn' ? 'Alguns elementos pedem atenção' : 'Há elementos para revisar';
  const Icon = STATUS[worst].icon;
  return (
    <Block>
      <div className="flex items-start gap-3">
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg border', STATUS[worst].chip)}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-stone-900">{headline}</p>
          <p className="text-xs text-stone-500 tabular-nums">Maior taxa de uso: {formatNumber(maxRatio, 2)} (limite 1,00)</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {(
          [
            ['ok', ok, 'ok'],
            ['warn', warn, 'atenção'],
            ['fail', fail, 'revisar'],
          ] as const
        ).map(([st, n, label]) => (
          <div key={st} className={cn('rounded-lg border px-2 py-1.5', n > 0 ? STATUS[st].chip : 'border-border bg-stone-50 text-stone-400')}>
            <p className="text-lg leading-6 font-semibold tabular-nums">{n}</p>
            <p className="text-[11px] font-medium">{label}</p>
          </div>
        ))}
      </div>
    </Block>
  );
}

function Loads({ loads }: { loads: StructuralReport['loads'] }) {
  const kpa = (v: number) => `${formatNumber(v, 2)} kN/m²`;
  return (
    <Block>
      <SectionTitle>Cargas adotadas</SectionTitle>
      <dl className="mt-1 divide-y divide-border">
        <KV label="Peso próprio do telhado" value={kpa(loads.deadRoofKPa)} />
        <KV label="Uso do telhado (manutenção)" value={kpa(loads.liveRoofKPa)} />
        <KV label="Peso próprio do piso" value={kpa(loads.deadFloorKPa)} />
        <KV label="Pessoas e móveis no piso" value={kpa(loads.liveFloorKPa)} />
        <KV label="Pressão do vento (dinâmica)" value={kpa(loads.windQKPa)} />
        <KV label="Vento nas paredes" value={kpa(loads.windWallKPa)} />
        <KV label="Vento puxando o telhado" value={kpa(loads.windRoofUpliftKPa)} />
      </dl>
      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-stone-500">
        <Wind className="size-3.5" /> Valores de cálculo, já com os coeficientes da norma.
      </p>
    </Block>
  );
}

function CheckRow({ check }: { check: StructuralCheck }) {
  const [open, setOpen] = useState(false);
  const active = useEditor((s) => s.highlight?.source === check.id);
  const setHighlight = useEditor((s) => s.setHighlight);
  const setViewMode = useEditor((s) => s.setViewMode);
  const update = useEditor((s) => s.update);
  const st = STATUS[check.status];
  const applier = suggestionRecipe(check);
  const s = check.suggestion;

  const focus = () => {
    if (active) return setHighlight(null);
    setHighlight({ pieceIds: check.pieceIds, hostIds: check.hostIds, source: check.id });
    setViewMode('heatmap');
  };

  return (
    <li className={cn('rounded-lg border bg-white shadow-sm transition-colors', active ? 'border-amber-300 ring-2 ring-accent/30' : 'border-border')}>
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={focus}
          aria-pressed={active}
          className="min-w-0 flex-1 rounded-l-lg px-3 py-2.5 text-left outline-none hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <span className="flex items-start justify-between gap-2">
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-stone-900">{check.label}</span>
              <span className="text-[11px] text-stone-500">{KIND_LABEL[check.kind]}</span>
            </span>
            <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums', st.chip)}>{formatNumber(check.ratio, 2)}</span>
          </span>
          <span className="mt-2 block">
            <RatioBar ratio={check.ratio} status={check.status} />
          </span>
          <span className="mt-1 flex justify-between text-[11px] text-stone-500 tabular-nums">
            <span className={st.text}>{st.label}</span>
            <span>
              {formatNumber(check.demand, 2)} / {formatNumber(check.capacity, 2)} {check.unit}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`Detalhes de ${check.label}`}
          className="grid w-9 shrink-0 place-items-center rounded-r-lg border-l border-border text-stone-500 outline-none hover:bg-stone-50 hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
      </div>
      {open ? <p className="border-t border-border bg-stone-50 px-3 py-2 text-xs leading-relaxed whitespace-pre-line text-stone-700">{check.detail}</p> : null}
      {s ? (
        <div className="space-y-2 border-t border-border px-3 py-2.5">
          <p className="text-xs text-stone-700">{s.text}</p>
          {s.deltaKg !== undefined || s.deltaCost !== undefined ? (
            <p className="text-[11px] text-stone-500 tabular-nums">
              {s.deltaKg !== undefined ? `${s.deltaKg >= 0 ? '+' : '−'}${formatNumber(Math.abs(s.deltaKg), 0)} kg` : ''}
              {s.deltaKg !== undefined && s.deltaCost !== undefined ? ' · ' : ''}
              {s.deltaCost !== undefined ? `${s.deltaCost >= 0 ? '+' : '−'}${formatBRL(Math.abs(s.deltaCost), 0)}` : ''}
            </p>
          ) : null}
          {applier ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                update(`Aplicar sugestão: ${check.label}`, applier.recipe);
                toast.success(`Sugestão aplicada: ${applier.label}.`);
              }}
            >
              <Wand2 /> Aplicar sugestão
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

const ORDER: Record<CheckStatus, number> = { fail: 0, warn: 1, ok: 2 };

export function StructureTab({ report }: { report: StructuralReport | null }) {
  const [onlyIssues, setOnlyIssues] = useState(false);
  if (!report) {
    return (
      <EmptyState icon={<ShieldAlert />} title="Pré-dimensionamento indisponível">
        As verificações aparecem quando o motor estrutural calcula este projeto.
      </EmptyState>
    );
  }
  const checks = [...report.checks].sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.ratio - a.ratio);
  const shown = onlyIssues ? checks.filter((c) => c.status !== 'ok') : checks;
  const issues = checks.filter((c) => c.status !== 'ok').length;
  return (
    <div className="space-y-3 p-3">
      <Summary report={report} />
      <Loads loads={report.loads} />
      <div className="flex items-center justify-between gap-2">
        <SectionTitle>Verificações ({checks.length})</SectionTitle>
        {issues > 0 ? (
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-stone-600">
            <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} className="accent-amber-600" />
            só atenção e revisar
          </label>
        ) : null}
      </div>
      <ul className="space-y-2">
        {shown.map((c) => (
          <CheckRow key={c.id} check={c} />
        ))}
      </ul>
      <p className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-900">{STRUCTURE_NOTE}</p>
    </div>
  );
}
