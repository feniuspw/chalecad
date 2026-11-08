'use client';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as ChartTooltip } from 'recharts';
import { STAGE_LABELS, STAGE_ORDER } from '@chalecad/catalog';
import type { Results } from '@chalecad/engine';
import { formatArea, formatBRL, formatKg, formatLength, formatNumber, formatPercent } from '@/lib/format';
import { Block, Dot, KV, SectionTitle, STAGE_COLORS } from './shared';
import { useEditor } from '@/lib/store/editor';
import { GlossaryText } from '@/components/glossary/Term';
import { plainSummary } from '@/lib/glossary/summary';

export function StageDonut({ results }: { results: Results }) {
  const b = results.budget;
  const data = STAGE_ORDER.flatMap((st) => {
    const s = b.byStage.find((x) => x.stage === st);
    return s && s.total > 0 ? [{ stage: st, name: STAGE_LABELS[st], value: s.total }] : [];
  });
  const sum = data.reduce((a, d) => a + d.value, 0);
  return (
    <Block>
      <SectionTitle>Custo por etapa</SectionTitle>
      <div className="relative mx-auto mt-2 h-44 w-44">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 176, height: 176 }}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={56} outerRadius={82} paddingAngle={data.length > 1 ? 1.5 : 0} stroke="none" isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.stage} fill={STAGE_COLORS[d.stage]} />
              ))}
            </Pie>
            <ChartTooltip formatter={(v) => formatBRL(Number(v), 0)} contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e7e5e4' }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-[11px] text-stone-500">Subtotal</p>
            <p className="text-sm font-semibold text-stone-900 tabular-nums">{formatBRL(sum, 0)}</p>
          </div>
        </div>
      </div>
      <ul className="mt-2 divide-y divide-border">
        {data.map((d) => (
          <li key={d.stage} className="flex h-9 items-center gap-2 text-sm">
            <Dot color={STAGE_COLORS[d.stage]} />
            <span className="min-w-0 flex-1 truncate text-stone-700">{d.name}</span>
            <span className="w-12 text-right text-xs text-stone-500 tabular-nums">{formatPercent(sum ? (d.value / sum) * 100 : 0, 0)}</span>
            <span className="w-24 text-right font-medium text-stone-900 tabular-nums">{formatBRL(d.value, 0)}</span>
          </li>
        ))}
      </ul>
    </Block>
  );
}

function StageTable({ results }: { results: Results }) {
  const rows = STAGE_ORDER.flatMap((st) => {
    const s = results.budget.byStage.find((x) => x.stage === st);
    return s ? [s] : [];
  });
  const n = (v: number) => formatNumber(v, 0);
  return (
    <Block className="px-0 pb-1">
      <SectionTitle className="px-3" aside="R$">
        Etapas
      </SectionTitle>
      <div className="mt-1 overflow-x-auto">
        <table className="w-full min-w-[19rem] text-xs tabular-nums">
          <thead>
            <tr className="text-[11px] text-stone-500">
              <th className="h-8 pl-3 text-left font-medium">Etapa</th>
              <th className="h-8 px-1 text-right font-medium">Material</th>
              <th className="h-8 px-1 text-right font-medium">M. de obra</th>
              <th className="h-8 px-1 text-right font-medium">Frete</th>
              <th className="h-8 pr-3 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.stage} className="h-9 border-t border-border transition-colors hover:bg-stone-50">
                <td className="pl-3 text-left text-stone-800">
                  <span className="flex items-center gap-1.5">
                    <Dot color={STAGE_COLORS[s.stage]} className="size-2" />
                    {STAGE_LABELS[s.stage]}
                    {s.diy ? <span className="rounded bg-emerald-50 px-1 text-[10px] font-medium text-emerald-700">eu faço</span> : null}
                  </span>
                </td>
                <td className="px-1 text-right text-stone-700">{n(s.material)}</td>
                <td className="px-1 text-right text-stone-700">{n(s.labor)}</td>
                <td className="px-1 text-right text-stone-700">{n(s.freight)}</td>
                <td className="pr-3 text-right font-semibold text-stone-900">{n(s.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Block>
  );
}

function Terrain({ results }: { results: Results }) {
  const t = results.terrain;
  if (!t) return null;
  const m3 = (v: number) => `${formatNumber(v, 1)} m³`;
  return (
    <Block>
      <SectionTitle>Terreno</SectionTitle>
      <dl className="mt-1 divide-y divide-border">
        <KV label="Cota do platô" value={formatLength(t.platformZ)} />
        <KV label="Corte" value={m3(t.cutVolume)} />
        <KV label="Aterro" value={m3(t.fillVolume)} />
        <KV label="Exportação (bota-fora)" value={m3(t.exportVolume)} />
        <KV label="Importação" value={m3(t.importVolume)} />
        <KV label="Área de talude" value={formatArea(t.slopeArea)} />
        <KV label="Diárias de máquina" value={formatNumber(t.machineDays, 1)} />
        <KV label="Viagens de caminhão" value={formatNumber(t.truckLoads, 0)} />
      </dl>
    </Block>
  );
}

function PlainCard({ results }: { results: Results }) {
  const project = useEditor((s) => s.project);
  const s = plainSummary(project, results);
  return (
    <Block className="border-amber-200 bg-amber-50/50">
      <SectionTitle>Seu chalé em 4 frases</SectionTitle>
      <ol className="mt-2 space-y-1.5 text-sm leading-snug text-stone-800">
        {[s.size, s.cost, s.structure, s.next].map((t) => (
          <li key={t}>
            <GlossaryText>{t}</GlossaryText>
          </li>
        ))}
      </ol>
    </Block>
  );
}

export function SummaryTab({ results }: { results: Results }) {
  const setHighlight = useEditor((s) => s.setHighlight);
  const active = useEditor((s) => s.highlight?.source);
  const wood = useEditor((s) => s.project.system.structure === 'wood');
  const a = results.quantities.areas;
  const w = results.weight;
  const top = [...w.byElement].sort((x, y) => y.kg - x.kg).slice(0, 5);
  const topMax = top[0]?.kg ?? 1;
  const bars = results.quantities.cutPlans.reduce((s, p) => s + p.totalBars, 0);
  const ms = results.timingsMs.worker ?? results.timingsMs.total;
  const stageKg = STAGE_ORDER.flatMap((st) => (w.byStage[st] ? [{ st, kg: w.byStage[st]! }] : []));
  return (
    <div className="space-y-3 p-3">
      <PlainCard results={results} />
      <StageDonut results={results} />
      <StageTable results={results} />

      <Block>
        <SectionTitle>Áreas</SectionTitle>
        <dl className="mt-1 divide-y divide-border">
          <KV label="Construída" value={formatArea(a.built)} strong />
          <KV label="Implantação (térreo)" value={formatArea(a.footprint)} />
          <KV label="Cobertura (inclinada)" value={formatArea(a.roof)} />
          <KV label="Paredes externas (líquida)" value={formatArea(a.exteriorWallsNet)} />
          <KV label="Paredes internas (líquida)" value={formatArea(a.interiorWallsNet)} />
          <KV label="Aberturas" value={formatArea(a.openings)} />
          <KV label="Radier" value={formatArea(a.radier)} />
          {a.mezzanine > 0 ? <KV label="Mezanino" value={formatArea(a.mezzanine)} /> : null}
        </dl>
      </Block>

      <Block>
        <SectionTitle aside={`${formatNumber(w.kgPerM2, 0)} kg/m²`}>Peso</SectionTitle>
        <dl className="mt-1 divide-y divide-border">
          <KV label="Superestrutura" value={formatKg(w.superstructureKg)} strong hint="sem fundação" />
          <KV label="Total com fundação" value={formatKg(w.totalKg)} />
        </dl>
        {stageKg.length > 0 ? (
          <ul className="mt-2 space-y-1.5">
            {stageKg.map(({ st, kg }) => (
              <li key={st} className="flex items-center gap-2 text-xs">
                <span className="w-20 shrink-0 truncate text-stone-600">{STAGE_LABELS[st]}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100">
                  <span className="block h-full rounded-full" style={{ width: `${Math.max(2, (kg / w.totalKg) * 100)}%`, background: STAGE_COLORS[st] }} />
                </span>
                <span className="w-16 shrink-0 text-right font-medium text-stone-800 tabular-nums">{formatKg(kg)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {top.length > 0 ? (
          <>
            <p className="mt-4 mb-1 text-[11px] font-semibold tracking-wide text-stone-500 uppercase">Elementos mais pesados</p>
            <ul className="space-y-0.5">
              {top.map((e) => {
                const on = active === `weight:${e.id}`;
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => setHighlight(on ? null : { pieceIds: [], hostIds: e.hostIds, source: `weight:${e.id}` })}
                      className="relative flex h-9 w-full items-center gap-2 overflow-hidden rounded-md px-2 text-left text-xs outline-none transition-colors hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-accent/50 aria-pressed:bg-accent-soft"
                    >
                      <span aria-hidden className="absolute inset-y-1 left-0 rounded-r bg-stone-100" style={{ width: `${(e.kg / topMax) * 100}%`, opacity: on ? 0 : 1 }} />
                      <span className="relative min-w-0 flex-1 truncate text-stone-800">{e.label}</span>
                      <span className="relative shrink-0 font-medium text-stone-900 tabular-nums">{formatKg(e.kg)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}
      </Block>

      <Terrain results={results} />

      <Block>
        <SectionTitle>Cálculo</SectionTitle>
        <dl className="mt-1 divide-y divide-border">
          <KV label="Peças de estrutura" value={formatNumber(results.pieces.length, 0)} />
          <KV label={wood ? 'Peças de madeira a comprar' : 'Barras de aço a comprar'} value={formatNumber(bars, 0)} />
          <KV label="Itens da lista de compra" value={formatNumber(results.quantities.lines.length, 0)} />
          <KV label="Tempo de cálculo" value={ms !== undefined ? `${formatNumber(ms, ms < 10 ? 1 : 0)} ms` : '—'} />
        </dl>
      </Block>
    </div>
  );
}
