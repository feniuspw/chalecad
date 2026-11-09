'use client';
import { useEffect, useState } from 'react';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { Button, Kbd } from '@chalecad/ui';
import { getCatalog } from '@chalecad/catalog';
import { pointInPolygon, type ElecCircuitResult, type ElecPoint, type ElectricalLayout } from '@chalecad/engine';
import { assignCircuit, deleteElecSelection, editCircuit, editPoint, setConduitDn, setConduitRun, toggleLightControl } from '@/lib/elec/actions';
import { lightVA, lightingOf, luxText, currentLux } from '@/lib/elec/liveLux';
import { CIRCUIT_KIND_LABEL, POINT_KIND_LABEL, circuitColor, circuitKindsFor, socketLevel } from '@/lib/elec/kinds';
import { useElecUi } from '@/lib/elec/ui';
import { formatNumber } from '@/lib/format';
import { useEditor } from '@/lib/store/editor';
import { Field, NumberField, Segmented } from '../properties/fields';

const k = getCatalog().constants.electrical;
const INPUT = 'h-8 w-full rounded-md border border-border bg-white px-2.5 text-[13px] text-stone-900 shadow-sm outline-none placeholder:text-stone-400 hover:border-stone-300 focus-visible:ring-2 focus-visible:ring-accent/50';

function Select({ label, value, onChange, children, testId }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode; testId?: string }) {
  return (
    <Field label={label}>
      <select aria-label={label} data-testid={testId} className={INPUT} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.stopPropagation()}>
        {children}
      </select>
    </Field>
  );
}

/** Texto do padrão da norma para a potência do ponto. */
function standardPower(p: ElecPoint): string {
  if (p.kind === 'light') {
    const lum = k.luminaires.find((l) => l.id === p.luminaire) ?? k.luminaires.find((l) => l.id === k.defaultLuminaire)!;
    return `${formatNumber((lum.watts * (p.count ?? 1)) / k.lighting.ledPowerFactor, 0)} VA (luminária) ou a regra de área da NBR 5410, o que for maior`;
  }
  if (p.kind === 'socket_tue') {
    const ap = p.appliance ? k.appliances[p.appliance] : undefined;
    return ap ? `${formatNumber(ap.w / ap.pf, 0)} VA (${ap.label})` : `${k.loads.sockets.wetVA} VA`;
  }
  if (p.kind === 'socket' || p.kind === 'socket_high') return `${k.loads.sockets.generalVA} VA (${k.loads.sockets.wetVA} VA nas primeiras de cozinha, serviço e banheiro)`;
  return '—';
}

function HeaderBar({ title, subtitle, onDelete }: { title: string; subtitle?: string; onDelete: () => void }) {
  const select = useElecUi((s) => s.select);
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
        <Button variant="outline" size="sm" onClick={onDelete} className="text-fail hover:text-red-700" data-testid="elec-delete">
          <Trash2 /> Excluir
        </Button>
      </div>
    </div>
  );
}

function NameInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      aria-label="Nome do circuito"
      className={INPUT}
      value={v}
      maxLength={60}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v.trim() && v !== value && onCommit(v.trim())}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function CircuitSection({ layout, result, id }: { layout: ElectricalLayout; result: ElecCircuitResult | undefined; id: string }) {
  const def = layout.circuits.find((c) => c.id === id);
  const idx = layout.circuits.findIndex((c) => c.id === id);
  if (!def) return null;
  const sections = Object.keys(k.cableOuterDiameter).map(Number).sort((a, b) => a - b);
  return (
    <div className="space-y-3 border-t border-border pt-4">
      <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-stone-700 uppercase">
        <span aria-hidden className="size-2.5 rounded-full" style={{ background: circuitColor(idx) }} /> Circuito {idx + 1}
      </h3>
      <Field label="Nome">
        <NameInput value={def.name} onCommit={(name) => editCircuit(id, { name })} />
      </Field>
      <Select label="Tipo" value={def.kind} onChange={(v) => editCircuit(id, { kind: v as typeof def.kind })}>
        {(Object.keys(CIRCUIT_KIND_LABEL) as (keyof typeof CIRCUIT_KIND_LABEL)[]).map((c) => (
          <option key={c} value={c}>
            {CIRCUIT_KIND_LABEL[c]}
          </option>
        ))}
      </Select>
      <Select label="Seção do condutor" value={def.sectionMm2 ? String(def.sectionMm2) : 'auto'} onChange={(v) => (v === 'auto' ? editCircuit(id, {}, ['sectionMm2']) : editCircuit(id, { sectionMm2: Number(v) }))}>
        <option value="auto">Automática{result ? ` (${formatNumber(result.sectionMm2, 1)} mm²)` : ''}</option>
        {sections.map((s) => (
          <option key={s} value={s}>
            {formatNumber(s, 1)} mm²
          </option>
        ))}
      </Select>
      <Select label="Disjuntor" value={def.breakerA ? String(def.breakerA) : 'auto'} onChange={(v) => (v === 'auto' ? editCircuit(id, {}, ['breakerA']) : editCircuit(id, { breakerA: Number(v) }))}>
        <option value="auto">Automático{result ? ` (${result.breakerA} A)` : ''}</option>
        {k.breakers.ratings.map((r) => (
          <option key={r} value={r}>
            {r} A
          </option>
        ))}
      </Select>
      <Segmented<'auto' | 'B' | 'C'>
        label="Curva do disjuntor"
        value={def.curve ?? 'auto'}
        options={[
          { value: 'auto', label: 'Auto' },
          { value: 'B', label: 'B' },
          { value: 'C', label: 'C' },
        ]}
        onChange={(v) => (v === 'auto' ? editCircuit(id, {}, ['curve']) : editCircuit(id, { curve: v }))}
      />
      <Segmented<'auto' | 'yes' | 'no'>
        label="DR (30 mA)"
        value={def.dr === undefined ? 'auto' : def.dr ? 'yes' : 'no'}
        options={[
          { value: 'auto', label: 'Auto' },
          { value: 'yes', label: 'Com DR' },
          { value: 'no', label: 'Sem DR' },
        ]}
        onChange={(v) => (v === 'auto' ? editCircuit(id, {}, ['dr']) : editCircuit(id, { dr: v === 'yes' }))}
      />
      {result ? (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-md bg-stone-50 p-2 text-[11px] text-stone-600">
          <dt>Carga</dt>
          <dd className="text-right font-medium text-stone-900 tabular-nums">{formatNumber(result.powerVA, 0)} VA</dd>
          <dt>Corrente</dt>
          <dd className="text-right font-medium text-stone-900 tabular-nums">{formatNumber(result.ib, 1)} A</dd>
          <dt>Queda de tensão</dt>
          <dd className="text-right font-medium text-stone-900 tabular-nums">{formatNumber(result.voltageDropPct, 2)} %</dd>
          <dt>Comprimento</dt>
          <dd className="text-right font-medium text-stone-900 tabular-nums">{formatNumber(result.lengthM, 1)} m</dd>
        </dl>
      ) : null}
    </div>
  );
}


/** Interruptores que comandam a luz, com seletor para adicionar e botão para remover. */
function ControlledBy({ layout, light }: { layout: ElectricalLayout; light: ElecPoint }) {
  const switches = layout.points.filter((x) => x.kind === 'switch' && x.level === light.level);
  const label = (sw: ElecPoint) => `Interruptor ${layout.points.filter((x) => x.kind === 'switch').findIndex((x) => x.id === sw.id) + 1} · ${sw.switchType === 'two_way' ? 'paralelo' : 'simples'}`;
  const mine = switches.filter((sw) => sw.controls?.includes(light.id));
  const others = switches.filter((sw) => !sw.controls?.includes(light.id));
  return (
    <Field label="Controlada por" hint={mine.length === 0 ? 'sem interruptor' : `${mine.length} interruptor(es)`}>
      <ul className="space-y-1" data-testid="elec-controlled-by">
        {mine.map((sw) => (
          <li key={sw.id} className="flex items-center justify-between rounded-md bg-stone-50 px-2 py-1 text-xs text-stone-700">
            <span>{label(sw)}</span>
            <button type="button" aria-label={`Remover ${label(sw)}`} onClick={() => void toggleLightControl(sw.id, light.id)} className="rounded px-1.5 text-[11px] font-medium text-stone-500 outline-none hover:text-red-700 focus-visible:ring-2 focus-visible:ring-accent/50">
              Remover
            </button>
          </li>
        ))}
        {mine.length === 0 ? <li className="text-[11px] leading-snug text-amber-800">Esta luz não tem interruptor: o motor avisa. Escolha um abaixo.</li> : null}
      </ul>
      {others.length > 0 ? (
        <select aria-label="Adicionar interruptor" data-testid="elec-add-switch" className={`${INPUT} mt-1.5`} value="" onChange={(e) => e.target.value && void toggleLightControl(e.target.value, light.id)} onKeyDown={(e) => e.stopPropagation()}>
          <option value="">Adicionar interruptor…</option>
          {others.map((sw) => (
            <option key={sw.id} value={sw.id}>
              {label(sw)}
            </option>
          ))}
        </select>
      ) : null}
    </Field>
  );
}

/** "Cômodo: X lux / alvo Y lux" e a potência da luz, do resultado do motor. */
function LightFeedback({ p, layout }: { p: ElecPoint; layout: ElectricalLayout }) {
  const model = useEditor((s) => s.results?.model);
  const lighting = useEditor((s) => s.results?.installations?.electrical?.lighting);
  const room = model?.rooms.find((r) => r.level === p.level && r.polygon && pointInPolygon(p.position, r.polygon as [number, number][], 0));
  const l = lightingOf(lighting, room?.id);
  const cur = currentLux(l);
  const lum = k.luminaires.find((x) => x.id === p.luminaire) ?? k.luminaires.find((x) => x.id === k.defaultLuminaire)!;
  const count = layout.points.filter((x) => x.kind === 'light' && x.level === p.level && room?.polygon && pointInPolygon(x.position, room.polygon as [number, number][], 0)).length;
  return (
    <div className="space-y-0.5 rounded-md bg-stone-50 p-2 text-[11px] leading-snug text-stone-600" data-testid="elec-light-feedback">
      {cur && room ? <p className={cur.low ? 'font-medium text-amber-800' : undefined}>{luxText(room.name, cur)}</p> : <p>Fora de um cômodo: sem cálculo de lux.</p>}
      <p>
        Esta luz: {formatNumber(lum.watts * (p.count ?? 1), 0)} W (≈ {formatNumber(lightVA(lum.watts, p.count ?? 1, k), 0)} VA) · {formatNumber(lum.lumens * (p.count ?? 1), 0)} lm{room ? ` · ${count} luz(es) no cômodo` : ''}
      </p>
      {lum.type === 'flood' || lum.type === 'strip' ? <p className="text-amber-800">{lum.type === 'flood' ? 'Refletor externo' : 'Fita LED'} não é luminária de teto interno; use de propósito.{lum.type === 'strip' ? ' O comprimento é o do catálogo (1 m por unidade).' : ''}</p> : null}
    </div>
  );
}

function PointInspector({ id }: { id: string }) {
  const report = useEditor((s) => s.results?.installations?.electrical);
  const layout = report?.layout;
  const p = layout?.points.find((x) => x.id === id);
  const select = useElecUi((s) => s.select);
  useEffect(() => {
    if (layout && !p) select(null);
  }, [layout, p, select]);
  if (!layout || !p) return null;
  const circuitIdx = p.circuitId ? layout.circuits.findIndex((c) => c.id === p.circuitId) : -1;
  const kinds = circuitKindsFor(p.kind);
  const compatible = layout.circuits.filter((c) => kinds.includes(c.kind));
  const lum = p.kind === 'light' ? (k.luminaires.find((l) => l.id === p.luminaire) ?? k.luminaires.find((l) => l.id === k.defaultLuminaire)) : undefined;
  const patch = (x: Partial<Omit<ElecPoint, 'id'>>, remove: (keyof ElecPoint)[] = []) => editPoint(id, x, remove);
  const title = p.label || POINT_KIND_LABEL[p.kind];

  return (
    <div data-testid="elec-inspector">
      <HeaderBar title={title} subtitle={circuitIdx >= 0 ? `Circuito ${circuitIdx + 1} · ${layout.circuits[circuitIdx]!.name}` : 'Sem circuito'} onDelete={() => void deleteElecSelection()} />
      <div className="space-y-4 p-4">
        <Field label="Tipo" hint={POINT_KIND_LABEL[p.kind]}>
          {p.kind === 'socket' || p.kind === 'socket_high' ? (
            <Segmented<'low' | 'mid' | 'high'>
              label="Altura padrão"
              value={socketLevel(p)}
              options={[
                { value: 'low', label: `Baixa ${k.heights.low}` },
                { value: 'mid', label: `Média ${k.heights.mid}` },
                { value: 'high', label: `Alta ${k.heights.high}` },
              ]}
              onChange={(v) => patch({ kind: v === 'high' ? 'socket_high' : 'socket', height: k.heights[v] })}
            />
          ) : p.kind === 'switch' ? (
            <Segmented<'one_way' | 'two_way'>
              label="Interruptor"
              value={p.switchType === 'two_way' ? 'two_way' : 'one_way'}
              options={[
                { value: 'one_way', label: 'Simples' },
                { value: 'two_way', label: 'Paralelo' },
              ]}
              onChange={(v) => patch({ switchType: v })}
            />
          ) : (
            <p className="text-xs text-stone-600">{POINT_KIND_LABEL[p.kind]}</p>
          )}
        </Field>
        <NumberField label={p.kind === 'light' && !p.hostId ? 'Altura da caixa (forro)' : 'Altura da caixa'} value={p.height} min={0} max={12} step={0.05} unit="m" onChange={(v) => patch({ height: v })} />

        {p.kind === 'socket_tue' ? (
          <Select label="Aparelho" testId="elec-appliance" value={p.appliance ?? ''} onChange={(v) => patch(v ? { appliance: v } : {}, v ? [] : ['appliance'])}>
            <option value="">Sem aparelho definido</option>
            {Object.entries(k.appliances).map(([key, a]) => (
              <option key={key} value={key}>
                {a.label} · {a.w} W
              </option>
            ))}
          </Select>
        ) : null}

        {p.kind === 'light' ? (
          <>
            <Select label="Luminária" value={lum?.id ?? ''} onChange={(v) => patch({ luminaire: v })}>
              {k.luminaires.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label} · {l.lumens} lm
                </option>
              ))}
            </Select>
            <NumberField label="Quantidade no ponto" value={p.count ?? 1} min={1} max={20} step={1} onChange={(v) => patch({ count: Math.round(v) })} />
            <LightFeedback p={p} layout={layout} />
            <ControlledBy layout={layout} light={p} />
          </>
        ) : null}

        {p.kind !== 'switch' && p.kind !== 'data' ? (
          <Field label="Potência (VA)" hint={p.powerVA ? 'definida por você' : 'padrão da norma'}>
            <div className="flex gap-2">
              <input
                type="number"
                aria-label="Potência (VA)"
                min={1}
                max={20000}
                className={INPUT}
                value={p.powerVA ?? ''}
                placeholder="automática"
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (e.target.value === '') patch({}, ['powerVA']);
                  else if (Number.isFinite(n) && n > 0) patch({ powerVA: Math.min(20000, n) });
                }}
                onKeyDown={(e) => e.stopPropagation()}
              />
              <Button size="sm" variant="outline" className="h-8 shrink-0" disabled={!p.powerVA} onClick={() => patch({}, ['powerVA'])}>
                Padrão
              </Button>
            </div>
            <p className="text-[11px] leading-snug text-stone-500">Padrão: {standardPower(p)}.</p>
          </Field>
        ) : null}

        {p.kind !== 'switch' ? (
          <Select
            label="Circuito"
            testId="elec-circuit"
            value={p.circuitId && compatible.some((c) => c.id === p.circuitId) ? p.circuitId : p.circuitId ?? 'auto'}
            onChange={(v) => assignCircuit(id, v === 'auto' ? undefined : v === 'new' ? 'new' : v, kinds[0]!)}
          >
            <option value="auto">Automático (o motor distribui)</option>
            {compatible.map((c) => (
              <option key={c.id} value={c.id}>
                {layout.circuits.findIndex((x) => x.id === c.id) + 1} · {c.name}
              </option>
            ))}
            <option value="new">Novo circuito…</option>
          </Select>
        ) : (
          <p className="rounded-md bg-stone-50 p-2 text-[11px] leading-snug text-stone-600">
            Clique nos pontos de luz na planta para ligar ou desligar o comando. Comanda {p.controls?.length ?? 0} ponto(s) de luz.
          </p>
        )}

        {p.circuitId ? <CircuitSection layout={layout} result={report!.circuits.find((c) => c.id === p.circuitId)} id={p.circuitId} /> : null}
      </div>
    </div>
  );
}

function ConduitInspector({ id }: { id: string }) {
  const report = useEditor((s) => s.results?.installations?.electrical);
  const c = report?.layout.conduits.find((x) => x.id === id);
  const r = report?.conduits.find((x) => x.id === id);
  const select = useElecUi((s) => s.select);
  useEffect(() => {
    if (report && !c) select(null);
  }, [report, c, select]);
  if (!c) return null;
  return (
    <div data-testid="elec-inspector">
      <HeaderBar title="Eletroduto" subtitle={r ? `Ø${r.dn} mm · ${formatNumber(r.length, 1)} m` : undefined} onDelete={() => void deleteElecSelection()} />
      <div className="space-y-4 p-4">
        <Segmented<'ceiling' | 'floor' | 'wall'>
          label="Percurso"
          value={c.run}
          options={[
            { value: 'ceiling', label: 'Forro' },
            { value: 'floor', label: 'Piso' },
            { value: 'wall', label: 'Parede' },
          ]}
          onChange={(v) => setConduitRun(id, v)}
        />
        <Select label="Diâmetro (DN)" value={c.dn ? String(c.dn) : 'auto'} onChange={(v) => setConduitDn(id, v === 'auto' ? undefined : Number(v))}>
          <option value="auto">Automático{r ? ` (${r.dn} mm)` : ''}</option>
          {k.conduit.sizes.map((s) => (
            <option key={s.dn} value={s.dn}>
              {s.dn} mm
            </option>
          ))}
        </Select>
        {r ? (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-md bg-stone-50 p-2 text-[11px] text-stone-600">
            <dt>Comprimento</dt>
            <dd className="text-right font-medium text-stone-900 tabular-nums">{formatNumber(r.length, 1)} m</dd>
            <dt>Curvas de 90°</dt>
            <dd className="text-right font-medium text-stone-900 tabular-nums">{r.bends90}</dd>
            <dt>Circuitos</dt>
            <dd className="text-right font-medium text-stone-900 tabular-nums">{r.circuitIds.length}</dd>
            <dt>Ocupação</dt>
            <dd className={`text-right font-medium tabular-nums ${r.fillPct > r.fillLimitPct ? 'text-red-700' : 'text-stone-900'}`}>
              {formatNumber(r.fillPct, 0)} % (limite {formatNumber(r.fillLimitPct, 0)} %)
            </dd>
          </dl>
        ) : null}
      </div>
    </div>
  );
}

/** Inspetor do ponto ou eletroduto selecionado na camada Elétrica (painel Propriedades). */
export function ElecInspector() {
  const sel = useElecUi((s) => s.selected);
  if (!sel) return null;
  return sel.kind === 'point' ? <PointInspector id={sel.id} /> : <ConduitInspector id={sel.id} />;
}
