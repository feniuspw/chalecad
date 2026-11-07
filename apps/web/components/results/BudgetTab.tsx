'use client';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import { NumberInput, Switch } from '@chalecad/ui';
import { STAGE_LABELS, STAGE_ORDER, type StageId } from '@chalecad/catalog';
import type { Results } from '@chalecad/engine';
import { formatBRL, formatBRLRange, formatNumber } from '@/lib/format';
import { useEditor } from '@/lib/store/editor';
import { Block, COST_COLORS, Dot, KV, MiniField, SectionTitle, STAGE_COLORS } from './shared';

const compact = (v: number) => (v >= 1000 ? `${formatNumber(v / 1000, v >= 10000 ? 0 : 1)} mil` : formatNumber(v, 0));
const tooltipStyle = { borderRadius: 8, fontSize: 12, border: '1px solid #e7e5e4' } as const;

function StageChart({ results }: { results: Results }) {
  const data = STAGE_ORDER.flatMap((st) => {
    const s = results.budget.byStage.find((x) => x.stage === st);
    return s && s.total > 0 ? [{ name: STAGE_LABELS[st], Material: s.material, 'Mão de obra': s.labor, Frete: s.freight }] : [];
  });
  return (
    <Block>
      <SectionTitle>Custo por etapa</SectionTitle>
      <div className="mt-2 w-full" style={{ height: Math.max(120, data.length * 32 + 30) }}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 300, height: 200 }}>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }} barSize={14}>
            <CartesianGrid horizontal={false} stroke="#e7e5e4" />
            <XAxis type="number" tickFormatter={compact} tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={78} tick={{ fontSize: 11, fill: '#44403c' }} axisLine={false} tickLine={false} />
            <ChartTooltip cursor={{ fill: '#f5f5f4' }} formatter={(v) => formatBRL(Number(v), 0)} contentStyle={tooltipStyle} />
            <Bar dataKey="Material" stackId="a" fill={COST_COLORS.material} isAnimationActive={false} />
            <Bar dataKey="Mão de obra" stackId="a" fill={COST_COLORS.labor} isAnimationActive={false} />
            <Bar dataKey="Frete" stackId="a" fill={COST_COLORS.freight} radius={[0, 3, 3, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex items-center justify-center gap-4 text-xs text-stone-600">
        {(
          [
            ['Material', COST_COLORS.material],
            ['Mão de obra', COST_COLORS.labor],
            ['Frete', COST_COLORS.freight],
          ] as const
        ).map(([l, c]) => (
          <span key={l} className="flex items-center gap-1.5">
            <Dot color={c} /> {l}
          </span>
        ))}
      </div>
    </Block>
  );
}

function StageControls({ results }: { results: Results }) {
  const project = useEditor((s) => s.project);
  const update = useEditor((s) => s.update);
  const updateCoalesced = useEditor((s) => s.updateCoalesced);
  const diy = new Set(project.budget.diyStages);
  const byStage = new Map(results.budget.byStage.map((s) => [s.stage, s]));
  const stages = STAGE_ORDER.filter((st) => byStage.has(st));

  const toggleDiy = (st: StageId, on: boolean) =>
    update(on ? `Eu faço: ${STAGE_LABELS[st]}` : `Contratar: ${STAGE_LABELS[st]}`, (d) => {
      const set = new Set(d.budget.diyStages);
      if (on) set.add(st);
      else set.delete(st);
      d.budget.diyStages = STAGE_ORDER.filter((x) => set.has(x));
    });
  const setWeeks = (st: StageId, v: number) =>
    updateCoalesced(`Duração: ${STAGE_LABELS[st]}`, (d) => {
      if (v > 0) d.budget.durationsWeeks[st] = v;
      else delete d.budget.durationsWeeks[st];
    });

  return (
    <Block className="px-0 pb-1">
      <SectionTitle className="px-3" aside="semanas">
        Etapas: eu faço e duração
      </SectionTitle>
      <ul className="mt-1">
        {stages.map((st) => {
          const s = byStage.get(st)!;
          const on = diy.has(st);
          return (
            <li key={st} className="flex min-h-12 items-center gap-2 border-t border-border px-3 py-1.5">
              <Dot color={STAGE_COLORS[st]} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-stone-900">{STAGE_LABELS[st]}</p>
                <p className="text-xs text-stone-500 tabular-nums">{formatBRL(s.total, 0)}</p>
              </div>
              <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-stone-600">
                <Switch checked={on} onCheckedChange={(v) => toggleDiy(st, v)} aria-label={`Eu faço: ${STAGE_LABELS[st]}`} />
                Eu faço
              </label>
              <NumberInput
                className="h-8 w-[4.5rem] shrink-0"
                aria-label={`Duração de ${STAGE_LABELS[st]} em semanas`}
                value={project.budget.durationsWeeks[st] ?? 0}
                onValueChange={(v) => setWeeks(st, v)}
                min={0}
                max={52}
                step={1}
                decimals={0}
                unit="sem"
              />
            </li>
          );
        })}
      </ul>
    </Block>
  );
}

function Params() {
  const budget = useEditor((s) => s.project.budget);
  const updateCoalesced = useEditor((s) => s.updateCoalesced);
  return (
    <Block>
      <SectionTitle>Premissas</SectionTitle>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <MiniField label="Contingência" className="col-span-2">
          <NumberInput aria-label="Contingência" value={budget.contingencyPct} onValueChange={(v) => updateCoalesced('Contingência', (d) => void (d.budget.contingencyPct = v))} min={0} max={50} step={1} decimals={1} unit="%" />
        </MiniField>
        <MiniField label="Distância do frete">
          <NumberInput aria-label="Distância do frete" value={budget.freight.distanceKm} onValueChange={(v) => updateCoalesced('Distância do frete', (d) => void (d.budget.freight.distanceKm = v))} min={0} max={1000} step={5} decimals={0} unit="km" />
        </MiniField>
        <MiniField label="Preço do frete">
          <NumberInput aria-label="Preço do frete por tonelada e quilômetro" value={budget.freight.pricePerTonKm} onValueChange={(v) => updateCoalesced('Preço do frete', (d) => void (d.budget.freight.pricePerTonKm = v))} min={0} max={50} step={0.5} decimals={2} unit="R$/t·km" />
        </MiniField>
      </div>
    </Block>
  );
}

function Schedule({ results }: { results: Results }) {
  const sch = results.budget.schedule;
  if (sch.length === 0) {
    return (
      <Block>
        <SectionTitle>Cronograma de desembolso</SectionTitle>
        <p className="mt-2 text-xs text-stone-500">Informe a duração em semanas das etapas acima para ver quanto sai do bolso a cada semana.</p>
      </Block>
    );
  }
  const data = sch.map((w) => ({ semana: w.week, valor: w.amount, etapas: w.stages.map((s) => STAGE_LABELS[s]).join(', ') }));
  const peak = sch.reduce((a, b) => (b.amount > a.amount ? b : a), sch[0]!);
  return (
    <Block>
      <SectionTitle aside={`${sch.length} sem.`}>Cronograma de desembolso</SectionTitle>
      <div className="mt-2 h-40 w-full">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 300, height: 160 }}>
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="#e7e5e4" />
            <XAxis dataKey="semana" tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis width={40} tickFormatter={compact} tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} />
            <ChartTooltip
              cursor={{ fill: '#f5f5f4' }}
              contentStyle={tooltipStyle}
              labelFormatter={(l) => `Semana ${l}`}
              formatter={(v, _n, item) => [formatBRL(Number(v), 0), (item.payload as { etapas: string }).etapas]}
            />
            <Bar dataKey="valor" fill="#d97706" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-xs text-stone-500 tabular-nums">
        Maior desembolso: semana {peak.week}, {formatBRL(peak.amount, 0)}.
      </p>
    </Block>
  );
}

export function BudgetTab({ results }: { results: Results }) {
  const b = results.budget;
  const pct = useEditor((s) => s.project.budget.contingencyPct);
  return (
    <div className="space-y-3 p-3">
      <Block className="border-amber-200 bg-gradient-to-b from-amber-50/70 to-white">
        <p className="text-[11px] font-medium text-stone-500">Total com contingência</p>
        <p className="text-2xl font-semibold tracking-tight text-stone-900 tabular-nums">{formatBRL(b.total, 0)}</p>
        <p className="text-xs text-stone-500 tabular-nums">Faixa {formatBRLRange(b.total, b.totalMax)}</p>
        <dl className="mt-2 divide-y divide-border border-t border-border">
          <KV label="Material" value={formatBRL(b.material, 0)} />
          <KV label="Mão de obra" value={formatBRL(b.labor, 0)} />
          <KV label="Frete" value={formatBRL(b.freight, 0)} />
          <KV label="Subtotal" value={formatBRL(b.subtotal, 0)} strong />
          <KV label={`Contingência (${formatNumber(pct, pct % 1 ? 1 : 0)}%)`} value={formatBRL(b.contingency, 0)} />
          <KV label="Por m² construído" value={formatBRL(b.perM2, 0)} strong />
        </dl>
      </Block>
      <StageChart results={results} />
      <StageControls results={results} />
      <Params />
      <Schedule results={results} />
    </div>
  );
}
