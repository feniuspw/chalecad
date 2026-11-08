'use client';
import { useMemo } from 'react';
import { DoorOpen, MousePointerClick, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button } from '@chalecad/ui';
import type { Project } from '@chalecad/engine';
import { getCatalog } from '@chalecad/catalog';
import {
  addOpeningAtCenter,
  overlappingOpenings,
  patchOpening,
  setOpeningType,
  setWallLength,
} from '@/lib/project/edit';
import { fmt } from '@/lib/project/format';
import { hostLength, wallLength } from '@/lib/project/geometry';
import { hostLabel, OPENING_LABELS, openingLabel, STAIR_LABELS } from '@/lib/project/labels';
import { useEditor, useSelectedObject, type SelectedObject } from '@/lib/store/editor';
import { Notice, SelectField, SliderField, SwitchField, type Option } from './fields';
import { Body, Header, Row, useDelete } from './inspector-parts';
import { ExtraInspector } from './ExtraInspector';
import { RoomInspector } from './RoomInspector';

type Obj<K extends SelectedObject['kind']> = Extract<SelectedObject, { kind: K }>;

// ---------------------------------------------------------------------------
// Lista de aberturas de um hospedeiro + botões de criar
// ---------------------------------------------------------------------------

function HostOpenings({ project, hostId, canAdd = true }: { project: Project; hostId: string; canAdd?: boolean }) {
  const select = useEditor((s) => s.select);
  const setHover = useEditor((s) => s.setHover);
  const update = useEditor((s) => s.update);
  const list = project.openings.filter((o) => o.host === hostId);

  const add = (type: 'door' | 'window') => {
    const box: { id: string | null } = { id: null };
    update(type === 'door' ? 'Adicionar porta' : 'Adicionar janela', (d) => {
      box.id = addOpeningAtCenter(d, hostId, type);
    });
    if (box.id) select({ kind: 'opening', id: box.id });
    else toast.warning('Esta parede é curta demais para uma abertura.');
  };

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold tracking-wide text-stone-700 uppercase">Aberturas ({list.length})</h3>
      {list.length === 0 ? <p className="text-xs text-stone-500">Nenhuma abertura nesta parede.</p> : null}
      <ul className="space-y-1">
        {list.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              onClick={() => select({ kind: 'opening', id: o.id })}
              onMouseEnter={() => setHover(hostId)}
              onMouseLeave={() => setHover(null)}
              className="flex w-full items-center justify-between rounded-md border border-border px-2.5 py-1.5 text-left text-xs outline-none hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              <span className="font-medium text-stone-800">{openingLabel(project, o.id)}</span>
              <span className="text-stone-500 tabular-nums">
                {fmt(o.width)} × {fmt(o.height)} m
              </span>
            </button>
          </li>
        ))}
      </ul>
      {canAdd ? (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" onClick={() => add('window')}>
            <Plus /> Adicionar janela
          </Button>
          <Button variant="outline" size="sm" onClick={() => add('door')}>
            <Plus /> Adicionar porta
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Abertura
// ---------------------------------------------------------------------------

const OPENING_OPTIONS: Option<keyof typeof OPENING_LABELS>[] = (Object.keys(OPENING_LABELS) as (keyof typeof OPENING_LABELS)[]).map((k) => ({ value: k, label: OPENING_LABELS[k] }));

function OpeningInspector({ obj, project }: { obj: Obj<'opening'>; project: Project }) {
  const update = useEditor((s) => s.update);
  const updateCoalesced = useEditor((s) => s.updateCoalesced);
  const select = useEditor((s) => s.select);
  const remove = useDelete();
  const o = obj.opening;
  const len = hostLength(project, o.host);
  const label = openingLabel(project, o.id);
  const overlaps = overlappingOpenings(project, o.id);
  const isRoof = o.type === 'skylight';
  const set = (key: 'width' | 'height' | 'sill' | 'offset', what: string) => (v: number, c: boolean) =>
    (c ? updateCoalesced : update)(`${what} da ${label.toLowerCase()}`, (d) => patchOpening(d, o.id, { [key]: v }));

  return (
    <>
      <Header title={label} subtitle={`em ${hostLabel(project, o.host)}`} onDelete={remove} />
      <Body>
        <SelectField label="Tipo" value={o.type} options={OPENING_OPTIONS} onChange={(t) => update(`Alterar tipo da ${label.toLowerCase()}`, (d) => setOpeningType(d, o.id, t))} />
        <SliderField label="Largura" value={o.width} min={0.3} max={len ? Math.min(6, len) : 6} step={0.05} unit="m" onChange={set('width', 'Alterar largura')} />
        <SliderField label="Altura" value={o.height} min={0.3} max={4} step={0.05} unit="m" onChange={set('height', 'Alterar altura')} />
        {o.type === 'door' || o.type === 'sliding_door' ? null : (
          <SliderField
            label={isRoof ? 'Distância do beiral' : 'Peitoril'}
            value={o.sill}
            min={0}
            max={5}
            step={0.05}
            unit="m"
            hint={isRoof ? undefined : 'altura do piso até o vão'}
            onChange={set('sill', 'Alterar peitoril')}
          />
        )}
        <SliderField
          label={isRoof ? 'Posição ao longo do beiral' : 'Posição ao longo da parede'}
          value={o.offset}
          min={0}
          max={Math.max(0.1, (len ?? 40) - o.width)}
          step={0.05}
          unit="m"
          hint={len ? `parede de ${fmt(len)} m` : undefined}
          onChange={set('offset', 'Mover')}
        />
        {len !== null ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => update(`Centralizar ${label.toLowerCase()}`, (d) => patchOpening(d, o.id, { offset: Math.max(0, (len - o.width) / 2) }))}>
              Centralizar na parede
            </Button>
          </div>
        ) : null}
        {overlaps.length > 0 ? <Notice tone="warn">Esta abertura se sobrepõe a {overlaps.map((x) => openingLabel(project, x.id)).join(', ')}.</Notice> : null}
        {obj.resolved && !obj.resolved.valid ? <Notice tone="fail">O vão não cabe neste hospedeiro: ajuste a posição ou o tamanho.</Notice> : null}
        <Button variant="ghost" size="sm" onClick={() => select({ kind: o.host.startsWith('roof-') ? 'roof' : o.host.startsWith('ext-') ? 'host' : 'wall', id: o.host })}>
          <MousePointerClick /> Selecionar {hostLabel(project, o.host).toLowerCase()}
        </Button>
      </Body>
    </>
  );
}

// ---------------------------------------------------------------------------
// Parede interna
// ---------------------------------------------------------------------------

function WallInspector({ obj, project }: { obj: Obj<'wall'>; project: Project }) {
  const update = useEditor((s) => s.update);
  const updateCoalesced = useEditor((s) => s.updateCoalesced);
  const remove = useDelete();
  const cat = useMemo(() => getCatalog(), []);
  const w = obj.wall;
  const len = wallLength(w.from, w.to);
  const name = hostLabel(project, w.id);
  const assemblies: Option<string>[] = [
    { value: '__auto', label: `Automática (${w.wet ? 'área molhada' : 'interna'})` },
    ...cat.assemblies.filter((a) => a.kind === 'wall_interior' || a.kind === 'wall_wet').map((a) => ({ value: a.id, label: a.name.replace(/^[^:]+:\s*/, '') })),
  ];
  const diag = Math.hypot(project.typology.width, project.typology.depth);

  return (
    <>
      <Header title={name} subtitle={`${fmt(len)} m de comprimento`} onDelete={remove} />
      <Body>
        <SliderField
          label="Comprimento"
          value={len}
          min={0.5}
          max={Math.max(1, Math.round(diag * 10) / 10)}
          step={0.05}
          unit="m"
          onChange={(v, c) => (c ? updateCoalesced : update)(`Alterar comprimento da ${name.toLowerCase()}`, (d) => setWallLength(d, w.id, v))}
        />
        <SwitchField
          label="Área molhada"
          description="Usa placa resistente à umidade e cimentícia"
          checked={w.wet ?? false}
          onChange={(on) => update(on ? 'Marcar área molhada' : 'Desmarcar área molhada', (d) => void (d.walls.find((x) => x.id === w.id)!.wet = on))}
        />
        <SelectField
          label="Composição da parede"
          value={w.assembly ?? '__auto'}
          options={assemblies}
          onChange={(v) =>
            update('Alterar composição da parede', (d) => {
              const x = d.walls.find((q) => q.id === w.id)!;
              if (v === '__auto') delete x.assembly;
              else x.assembly = v;
            })
          }
        />
        <HostOpenings project={project} hostId={w.id} />
      </Body>
    </>
  );
}

// ---------------------------------------------------------------------------
// Escada
// ---------------------------------------------------------------------------

const STAIR_OPTIONS: Option<keyof typeof STAIR_LABELS>[] = (Object.keys(STAIR_LABELS) as (keyof typeof STAIR_LABELS)[]).map((k) => ({ value: k, label: STAIR_LABELS[k] }));

function StairInspector({ obj }: { obj: Obj<'stair'> }) {
  const update = useEditor((s) => s.update);
  const updateCoalesced = useEditor((s) => s.updateCoalesced);
  const remove = useDelete();
  const st = obj.stair;
  const resolved = useEditor((s) => s.results?.model.stairs.find((x) => x.id === st.id));
  const set = <K extends 'width' | 'rotationDeg'>(key: K, what: string) => (v: number, c: boolean) =>
    (c ? updateCoalesced : update)(what, (d) => void (d.stairs.find((x) => x.id === st.id)![key] = v));
  return (
    <>
      <Header title={STAIR_LABELS[st.type]} subtitle={`${st.from} → ${st.to}`} onDelete={remove} />
      <Body>
        <SelectField label="Tipo" value={st.type} options={STAIR_OPTIONS} onChange={(t) => update('Alterar tipo de escada', (d) => void (d.stairs.find((x) => x.id === st.id)!.type = t))} />
        <SliderField label="Largura" value={st.width} min={0.5} max={1.5} step={0.05} unit="m" onChange={set('width', 'Alterar largura da escada')} />
        <SliderField label="Rotação" value={st.rotationDeg} min={0} max={360} step={15} decimals={0} unit="°" hint="0° sobe para o fundo" onChange={set('rotationDeg', 'Girar escada')} />
        {st.type === 'l_shape' ? (
          <SwitchField label="Vira à direita" checked={st.turnRight} onChange={(on) => update('Alterar giro da escada', (d) => void (d.stairs.find((x) => x.id === st.id)!.turnRight = on))} />
        ) : null}
        {resolved ? (
          <dl className="divide-y divide-border rounded-md border border-border px-3">
            <Row label="Degraus" value={resolved.steps} />
            <Row label="Espelho" value={`${fmt(resolved.riser * 100, 1)} cm`} />
            <Row label="Piso" value={`${fmt(resolved.going * 100, 1)} cm`} />
            <Row label="Blondel (2e + p)" value={<Badge variant={resolved.blondel >= 0.6 && resolved.blondel <= 0.66 ? 'ok' : 'warn'}>{fmt(resolved.blondel * 100, 0)} cm</Badge>} />
          </dl>
        ) : null}
      </Body>
    </>
  );
}

// ---------------------------------------------------------------------------
// Hospedeiros gerados (paredes externas, águas, lajes)
// ---------------------------------------------------------------------------

const HOST_KIND_LABELS = { exterior: 'Parede externa', interior: 'Parede interna', gable: 'Empena', knee: 'Mureta', parapet: 'Platibanda' } as const;
const SLAB_LABELS = { radier: 'Radier', mezzanine: 'Mezanino', deck: 'Deck', platform: 'Platô' } as const;

function HostInspector({ obj, project }: { obj: Obj<'host'> | Obj<'roof'> | Obj<'slab'> | Obj<'level'> | Obj<'extra'> | Obj<'piece'>; project: Project }) {
  const model = useEditor((s) => s.results?.model);
  const id = obj.kind === 'level' ? `slab-${obj.id}` : obj.id;
  const wall = model?.walls.find((w) => w.id === id);
  const roof = model?.roofPlanes.find((p) => p.id === id);
  const slab = model?.slabs.find((s) => s.id === id);

  return (
    <>
      <Header title={hostLabel(project, id)} subtitle={wall ? HOST_KIND_LABELS[wall.kind] : roof ? 'Água do telhado' : slab ? SLAB_LABELS[slab.kind] : undefined} />
      <Body>
        {wall ? (
          <>
            <dl className="divide-y divide-border rounded-md border border-border px-3">
              <Row label="Comprimento" value={`${fmt(wall.length)} m`} />
              <Row label="Espessura" value={`${fmt(wall.thickness * 100, 1)} cm`} />
              <Row label="Nível" value={wall.level} />
              <Row label="Estrutural" value={wall.loadBearing ? 'sim' : 'não'} />
            </dl>
            <HostOpenings project={project} hostId={wall.id} canAdd={wall.kind === 'exterior' && !wall.id.startsWith('wing-')} />
          </>
        ) : roof ? (
          <>
            <dl className="divide-y divide-border rounded-md border border-border px-3">
              <Row label="Inclinação" value={`${fmt(roof.slopeDeg, 1)}°`} />
              <Row label="Área" value={`${fmt(roof.area)} m²`} />
              <Row label="Beiral × água" value={`${fmt(roof.uLength)} × ${fmt(roof.vLength)} m`} />
            </dl>
            <HostOpenings project={project} hostId={roof.id} canAdd={false} />
          </>
        ) : slab ? (
          <dl className="divide-y divide-border rounded-md border border-border px-3">
            <Row label="Área" value={`${fmt(slab.area)} m²`} />
            <Row label="Espessura" value={`${fmt(slab.thickness * 100, 0)} cm`} />
            <Row label="Cota do topo" value={`${fmt(slab.topZ)} m`} />
          </dl>
        ) : (
          <Notice>Elemento gerado pela tipologia: ajuste-o nas propriedades do projeto.</Notice>
        )}
        {slab?.kind === 'mezzanine' ? <Notice>Profundidade, posição e guarda-corpo ficam em “Mezanino”, nas propriedades do projeto.</Notice> : null}
        {wall && wall.kind !== 'interior' ? (
          <p className="flex items-center gap-1.5 text-[11px] text-stone-500">
            <DoorOpen className="size-3.5" /> Use “Adicionar janela” ou “Adicionar porta” para criar aberturas no meio da parede.
          </p>
        ) : null}
      </Body>
    </>
  );
}

export function ObjectInspector() {
  const obj = useSelectedObject();
  const project = useEditor((s) => s.project);
  if (!obj) return null;
  switch (obj.kind) {
    case 'opening':
      return <OpeningInspector obj={obj} project={project} />;
    case 'wall':
      return <WallInspector obj={obj} project={project} />;
    case 'stair':
      return <StairInspector obj={obj} />;
    case 'extra':
      return <ExtraInspector id={obj.id} project={project} />;
    case 'room':
      return <RoomInspector obj={obj} project={project} />;
    default:
      return <HostInspector obj={obj} project={project} />;
  }
}
