'use client';
import { useId, useState } from 'react';
import { Zap } from 'lucide-react';
import { Badge, Button } from '@chalecad/ui';
import type { Project } from '@chalecad/engine';
import { formatNumber } from '@/lib/format';
import { summarizePoints } from '@/lib/three/installations';
import { useEditor } from '@/lib/store/editor';
import { Field, Notice, Section, Segmented, SwitchField } from './fields';

type Heater = Project['installations']['waterHeater'];

const HEATERS: { value: Heater; label: string }[] = [
  { value: 'electric_shower', label: 'Chuveiro elétrico' },
  { value: 'gas', label: 'Gás' },
  { value: 'solar', label: 'Solar' },
];

const INPUT = 'h-8 w-full rounded-md border border-border bg-white px-2.5 text-[13px] text-stone-900 shadow-sm outline-none placeholder:text-stone-400 hover:border-stone-300 focus-visible:ring-2 focus-visible:ring-accent/50';

/** Campo numérico opcional: vazio = automático (apaga o valor do projeto). */
function OptionalNumber({ label, value, placeholder, min, max, step, integer, onChange }: { label: string; value: number | undefined; placeholder: string; min: number; max: number; step: number; integer?: boolean; onChange: (v: number | undefined) => void }) {
  const id = useId();
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <label htmlFor={id} className="block text-[11px] font-medium text-stone-600">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode={integer ? 'numeric' : 'decimal'}
        min={min}
        max={max}
        step={step}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => {
          if (e.target.value === '') return onChange(undefined);
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, integer ? Math.round(n) : n)));
        }}
        className={INPUT}
      />
    </div>
  );
}

/** Instalações elétricas e hidráulicas estimadas: liga a camada, escolhe aquecimento, moradores e posição do quadro. */
export function InstallationsSection({ project }: { project: Project }) {
  const [open, setOpen] = useState(false);
  const update = useEditor((s) => s.update);
  const setTool = useEditor((s) => s.setTool);
  const report = useEditor((s) => s.results?.installations ?? null);
  const engineNotice = useEditor((s) => s.results?.warnings.find((w) => w.code.startsWith('installations'))?.message);
  const inst = project.installations;
  const noRooms = project.rooms.length === 0;
  const summary = report ? summarizePoints(report.points) : [];
  const panel = inst.panel ?? report?.panel.position;

  const setPanelAxis = (axis: 0 | 1, v: number | undefined) =>
    update('Posição do quadro', (d) => {
      if (v === undefined) {
        delete d.installations.panel;
        return;
      }
      const cur = d.installations.panel ?? panel ?? [0, 0];
      const next: [number, number] = [cur[0], cur[1]];
      next[axis] = v;
      d.installations.panel = next;
    });

  return (
    <Section title="Instalações" open={open} onOpenChange={setOpen} badge={<Badge variant="neutral">{inst.enabled ? 'ligadas' : 'desligadas'}</Badge>}>
      <SwitchField
        label="Estimar instalações"
        description="Pontos elétricos e hidráulicos pelos mínimos da NBR 5410/5626, no 3D, na planta e no orçamento."
        checked={inst.enabled}
        onChange={(v) => update(v ? 'Ligar instalações' : 'Desligar instalações', (d) => void (d.installations.enabled = v))}
      />

      {inst.enabled ? (
        <>
          {noRooms ? (
            <Notice tone="warn">
              {engineNotice ?? 'Sem cômodos marcados, não há onde posicionar pontos.'}{' '}
              <button type="button" onClick={() => setTool('room')} className="font-medium underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
                Usar a ferramenta Cômodo
              </button>
            </Notice>
          ) : null}

          <Segmented<Heater>
            label="Aquecimento da água"
            value={inst.waterHeater}
            options={HEATERS}
            onChange={(v) => update('Mudar aquecimento', (d) => void (d.installations.waterHeater = v))}
          />

          <div>
            <OptionalNumber
              label={`Moradores${inst.occupants === undefined ? ' (automático)' : ''}`}
              value={inst.occupants}
              placeholder={report ? String(report.occupants) : '2 por quarto'}
              min={1}
              max={20}
              step={1}
              integer
              onChange={(v) =>
                update('Mudar moradores', (d) => {
                  if (v === undefined) delete d.installations.occupants;
                  else d.installations.occupants = v;
                })
              }
            />
          </div>

          <Field label="Quadro de distribuição" hint={inst.panel ? 'manual' : 'junto à porta'}>
            <div className="flex items-end gap-2">
              <OptionalNumber label="x (m)" value={inst.panel?.[0]} placeholder={panel ? formatNumber(panel[0], 2) : 'x'} min={-100} max={100} step={0.1} onChange={(v) => setPanelAxis(0, v)} />
              <OptionalNumber label="y (m)" value={inst.panel?.[1]} placeholder={panel ? formatNumber(panel[1], 2) : 'y'} min={-100} max={100} step={0.1} onChange={(v) => setPanelAxis(1, v)} />
              <Button size="sm" variant="outline" className="h-8 shrink-0" disabled={!inst.panel} onClick={() => update('Quadro automático', (d) => void delete d.installations.panel)}>
                Automático
              </Button>
            </div>
          </Field>

          {report ? (
            <div className="space-y-1.5">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-stone-700 uppercase">
                <Zap className="size-3.5 text-amber-500" /> Resumo
              </h4>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {summary.map((g) => (
                  <div key={g.id} className="flex justify-between gap-2">
                    <dt className="text-stone-600">{g.label}</dt>
                    <dd className="font-medium text-stone-900 tabular-nums">{g.count}</dd>
                  </div>
                ))}
                <div className="flex justify-between gap-2">
                  <dt className="text-stone-600">Circuitos</dt>
                  <dd className="font-medium text-stone-900 tabular-nums">{report.circuits.length}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-stone-600">Demanda</dt>
                  <dd className="font-medium text-stone-900 tabular-nums">{formatNumber(report.demandKw, 1)} kW</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-stone-600">Caixa d&apos;água</dt>
                  <dd className="font-medium text-stone-900 tabular-nums">{formatNumber(report.tankLiters, 0)} L</dd>
                </div>
              </dl>
            </div>
          ) : !noRooms ? (
            <Notice>{engineNotice ?? 'Calculando as instalações…'}</Notice>
          ) : null}
        </>
      ) : null}
    </Section>
  );
}
