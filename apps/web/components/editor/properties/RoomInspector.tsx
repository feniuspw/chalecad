'use client';
import { useMemo } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Badge, Button, cn } from '@chalecad/ui';
import type { EngineWarning, Project, RoomUse } from '@chalecad/engine';
import { fmt } from '@/lib/project/format';
import { finishOptions, patchRoom, ROOM_USE_ORDER, ROOM_USES, roomDisplayName } from '@/lib/project/rooms';
import { useEditor, type SelectedObject } from '@/lib/store/editor';
import { Field, Notice } from './fields';
import { FinishSelect } from './FinishSelect';
import { Body, Header, Row, useDelete } from './inspector-parts';

type RoomObj = Extract<SelectedObject, { kind: 'room' }>;

/** Alertas `room.*` que citam este cômodo. */
export function roomWarnings(warnings: EngineWarning[] | undefined, roomId: string): EngineWarning[] {
  return (warnings ?? []).filter((w) => w.code.startsWith('room.') && w.refs?.includes(roomId));
}

function UsePicker({ value, onChange }: { value: RoomUse; onChange: (u: RoomUse) => void }) {
  return (
    <div role="group" aria-label="Uso do cômodo" className="grid grid-cols-4 gap-1">
      {ROOM_USE_ORDER.map((use) => {
        const { label, icon: Icon } = ROOM_USES[use];
        return (
          <button
            key={use}
            type="button"
            aria-pressed={use === value}
            onClick={() => onChange(use)}
            className={cn(
              'flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 text-[10px] leading-tight font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
              use === value ? 'border-accent bg-accent-soft text-accent-hover' : 'border-border text-stone-600 hover:bg-stone-50',
            )}
          >
            <Icon className="size-4" />
            <span className="max-w-full truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

const SEVERITY: Record<EngineWarning['severity'], 'info' | 'warn' | 'fail'> = { info: 'info', warn: 'warn', error: 'fail' };

export function RoomInspector({ obj, project }: { obj: RoomObj; project: Project }) {
  const update = useEditor((s) => s.update);
  const warnings = useEditor((s) => s.results?.warnings);
  const remove = useDelete();
  const { room, resolved } = obj;
  const name = roomDisplayName(project, room);
  const floors = useMemo(() => finishOptions(project, 'finish_floor_'), [project]);
  const walls = useMemo(() => finishOptions(project, 'finish_wall_'), [project]);
  const alerts = useMemo(() => roomWarnings(warnings, room.id), [warnings, room.id]);
  const level = project.levels.find((l) => l.id === room.level);

  const patch = (label: string, p: Parameters<typeof patchRoom>[2]) => update(label, (d) => void patchRoom(d, room.id, p));
  const glazedPct = resolved && resolved.area > 0 ? (resolved.glazing / resolved.area) * 100 : 0;

  return (
    <>
      <Header title={name} subtitle={`${ROOM_USES[room.use].label}${level?.name ? ` · ${level.name}` : ''}`} />
      <Body>
        {resolved && !resolved.polygon ? (
          <Notice tone="warn">
            <AlertTriangle className="mr-1 inline size-3.5 align-text-bottom" />
            Feche o ambiente com paredes: não há contorno fechado em volta do ponto marcado. Desenhe as paredes que faltam ou mova o cômodo.
          </Notice>
        ) : null}

        <Field label="Nome" htmlFor="room-name">
          <input
            id="room-name"
            key={`${room.id}-${room.name ?? ''}`}
            type="text"
            maxLength={40}
            defaultValue={room.name ?? ''}
            placeholder={ROOM_USES[room.use].label}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (room.name ?? '')) patch('Renomear cômodo', { name: v });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                e.currentTarget.value = room.name ?? '';
                e.stopPropagation();
                e.currentTarget.blur();
              }
            }}
            className="h-8 w-full rounded-md border border-border bg-white px-3 text-[13px] text-stone-900 shadow-sm outline-none placeholder:text-stone-400 hover:border-stone-300 focus-visible:ring-2 focus-visible:ring-accent/50"
          />
        </Field>

        <Field label="Uso">
          <UsePicker value={room.use} onChange={(use) => patch('Mudar uso do cômodo', { use })} />
        </Field>

        <FinishSelect label="Piso" value={room.floor} options={floors} noneLabel="Acabamento do nível" onChange={(floor) => patch('Mudar piso do cômodo', { floor })} />
        <FinishSelect label="Paredes" value={room.walls} options={walls} noneLabel="Sem revestimento" onChange={(w) => patch('Mudar revestimento das paredes', { walls: w })} />

        {resolved?.polygon ? (
          <div className="space-y-1">
            <h3 className="text-xs font-semibold tracking-wide text-stone-700 uppercase">Resumo</h3>
            <dl className="divide-y divide-border rounded-md border border-border px-2.5">
              <Row label="Área" value={`${fmt(resolved.area, 2)} m²`} />
              <Row label="Perímetro" value={`${fmt(resolved.perimeter, 2)} m`} />
              <Row label="Pé-direito (mín. / médio)" value={`${fmt(resolved.ceiling.min, 2)} / ${fmt(resolved.ceiling.avg, 2)} m`} />
              <Row label="Vidro" value={`${fmt(resolved.glazing, 2)} m² · ${fmt(glazedPct, 0)}% da área`} />
              {resolved.wet ? <Row label="Área molhada" value={<Badge variant="accent">sim</Badge>} /> : null}
            </dl>
          </div>
        ) : !resolved ? (
          <Notice>O resumo (área, pé-direito, vidro) aparece quando o cálculo terminar.</Notice>
        ) : null}

        {alerts.length > 0 ? (
          <div className="space-y-1.5">
            <h3 className="text-xs font-semibold tracking-wide text-stone-700 uppercase">Alertas ({alerts.length})</h3>
            {alerts.map((a, i) => (
              <Notice key={`${a.code}-${i}`} tone={SEVERITY[a.severity]}>
                {a.message}
              </Notice>
            ))}
          </div>
        ) : null}
        <Button variant="outline" size="sm" onClick={remove} className="w-full text-fail hover:text-red-700">
          <Trash2 /> Remover cômodo
        </Button>
      </Body>
    </>
  );
}

