'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Line } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { toast } from 'sonner';
import { getCatalog } from '@chalecad/catalog';
import type { BuildingModel, ElecPoint, Vec2 } from '@chalecad/engine';
import { useEditor } from '@/lib/store/editor';
import { commitConduit, deleteElecSelection, movePoint, placePoint, setPanelPosition, toggleLightControl, editElec, elecId } from '@/lib/elec/actions';
import { replaceRoomLights } from '@/lib/elec/edit';
import { ELEC_TOOLS, symbolKind } from '@/lib/elec/kinds';
import { autoGrid, pointInPoly } from '@/lib/elec/lightGrid';
import { pickElec, snapConduit, type ConduitSnap } from '@/lib/elec/pick';
import { proposePoint, relocatePoint, ceilingLuminaire, type Proposal } from '@/lib/elec/placement';
import { symbolShape } from '@/lib/elec/symbols';
import { useElecUi } from '@/lib/elec/ui';
import { MotorGroup } from '../../MotorGroup';
import { SceneLabel } from '../../labels';
import { SnapMarker } from '../markers';
import { useHint, useKey } from '../hooks';
import { usePlanePointer } from '../pointer';
import { PlanText, SymbolMesh } from './ElecPlanLayer';
import { usePlaceEnv, useElecPlan } from './useElecPlan';

const catalog = getCatalog();
const GHOST = '#0ea5e9';
const PICK_PX = 14;

/** Teclas da camada: Delete apaga, Esc limpa a seleção (a ferramenta de eletroduto trata o próprio Esc). */
function ElecKeys() {
  const selected = useElecUi((s) => s.selected);
  const tool = useElecUi((s) => s.tool);
  useKey(['Delete', 'Backspace'], () => deleteElecSelection(), !!selected);
  useKey(
    ['Escape'],
    () => {
      const u = useElecUi.getState();
      if (u.tool !== 'none') {
        u.setTool('none');
        return true;
      }
      if (u.selected || u.focus.length) {
        u.select(null);
        return true;
      }
      return false;
    },
    tool !== 'conduit',
  );
  return null;
}

function SelectTool({ model, level, elevation }: { model: BuildingModel; level: string; elevation: number }) {
  const plan = useElecPlan(model, level);
  const env = usePlaceEnv(model, level);
  const planRef = useRef(plan);
  planRef.current = plan;
  const gl = useThree((s) => s.gl);
  const selected = useElecUi((s) => s.selected);
  const dragRef = useRef<{ id: string; hit: ElecPoint | null } | null>(null);
  const reach = useRef(0);

  usePlanePointer(
    {
      onMove: (e) => {
        const pl = planRef.current;
        const d = dragRef.current;
        if (d && d.hit) {
          const to = relocatePoint(d.hit, e.p, env, Math.max(0.6, PICK_PX * e.mpp));
          if (to) useElecUi.getState().setDrag({ id: d.id, position: to.position });
          return;
        }
        reach.current = PICK_PX * e.mpp;
        gl.domElement.style.cursor = pl && pickElec(e.p, pl, Math.max(0.2, reach.current)) ? 'pointer' : '';
      },
      onDown: (e) => {
        const pl = planRef.current;
        if (!pl) return false;
        const hit = pickElec(e.p, pl, Math.max(0.2, PICK_PX * e.mpp), 'point');
        if (!hit) return false;
        const pt = pl.points.find((p) => p.id === hit.id)?.point ?? null;
        dragRef.current = { id: hit.id, hit: pt };
        return true;
      },
      onUp: (e, moved) => {
        const d = dragRef.current;
        dragRef.current = null;
        if (!d) return;
        const ui = useElecUi.getState();
        if (moved && d.hit) {
          const to = relocatePoint(d.hit, e.p, env, Math.max(0.6, PICK_PX * e.mpp));
          if (to) {
            ui.setDrag({ id: d.id, position: to.position, dropped: true });
            movePoint(d.id, to);
            ui.select({ kind: 'point', id: d.id });
          } else ui.setDrag(null);
          return;
        }
        ui.setDrag(null);
        // clique: com um interruptor selecionado, clicar numa luz liga e desliga o comando
        const cur = ui.selected;
        const pl = planRef.current;
        const sel = cur?.kind === 'point' ? pl?.points.find((p) => p.id === cur.id)?.point : null;
        const target = d.hit;
        if (sel?.kind === 'switch' && target?.kind === 'light') {
          const r = toggleLightControl(sel.id, target.id);
          if (r !== null) toast.message(r ? 'Interruptor passa a comandar esta luz.' : 'Interruptor deixa de comandar esta luz.', { id: 'elec-control', duration: 1800 });
          return;
        }
        ui.select({ kind: 'point', id: d.id });
      },
      onClick: (e) => {
        const pl = planRef.current;
        const hit = pl ? pickElec(e.p, pl, Math.max(0.2, PICK_PX * e.mpp), 'conduit') : null;
        useElecUi.getState().select(hit);
      },
    },
    { enabled: true, z: elevation },
  );
  const sel = selected?.kind === 'point' ? plan?.points.find((p) => p.id === selected.id)?.point : null;
  useHint(sel?.kind === 'switch' ? 'Interruptor selecionado: clique nas luzes para ligar ou desligar o comando · Delete apaga · Esc solta' : 'Clique num símbolo para editar, arraste para mover (encaixa na parede) · Delete apaga');
  return null;
}

function PlaceTool({ model, level, elevation }: { model: BuildingModel; level: string; elevation: number }) {
  const tool = useElecUi((s) => s.tool);
  const appliance = useElecUi((s) => s.appliance);
  const switchType = useElecUi((s) => s.switchType);
  const luminaire = useElecUi((s) => s.luminaire);
  const env = usePlaceEnv(model, level);
  const [ghost, setGhost] = useState<{ proposal: Proposal; grid: Vec2[] } | null>(null);
  const opts = useMemo(() => ({ appliance, switchType, luminaire }), [appliance, switchType, luminaire]);
  const k = catalog.constants.electrical;
  const groundId = useEditor((s) => s.project.levels.find((l) => l.elevation === 0)?.id ?? s.project.levels[0]?.id);
  const gl = useThree((s) => s.gl);

  const propose = useCallback((p: Vec2, shift: boolean) => {
    const pr = proposePoint(tool, p, env, opts);
    if (!pr) return null;
    let grid: Vec2[] = [];
    if (tool === 'light' && shift && !pr.hit) {
      const room = env.rooms.find((r) => r.id === pr.roomId);
      if (room) grid = autoGrid({ polygon: room.polygon, area: room.area, use: room.use, ceilingAvg: room.ceilingAvg }, k.luminaires.find((l) => l.id === ceilingLuminaire(k, luminaire))!.lumens, k, pr.point.position).positions;
    }
    return { proposal: pr, grid };
  }, [tool, env, opts, k, luminaire]);

  usePlanePointer(
    {
      onMove: (e) => {
        gl.domElement.style.cursor = 'crosshair';
        setGhost(propose(e.p, e.shift));
      },
      onLeave: () => setGhost(null),
      onClick: (e) => {
        const g = propose(e.p, e.shift);
        if (!g) {
          toast.info(tool === 'light' ? 'Clique dentro de um cômodo (teto) ou perto de uma parede (arandela).' : 'Aproxime o cursor de uma parede.', { id: 'elec-miss', duration: 2200 });
          return;
        }
        const { proposal: pr, grid } = g;
        if (tool === 'panel') {
          if (level !== groundId) {
            toast.info('O quadro de distribuição fica no térreo.', { id: 'elec-miss' });
            return;
          }
          setPanelPosition(pr.point.position);
          toast.success('Quadro de distribuição movido.');
          useElecUi.getState().setTool('none');
          return;
        }
        if (tool === 'light' && e.shift && !pr.hit && pr.roomId) {
          const room = env.rooms.find((r) => r.id === pr.roomId)!;
          const lum = ceilingLuminaire(k, luminaire);
          const fresh: ElecPoint[] = grid.map((position) => ({ id: elecId('e'), kind: 'light', level, position, height: room.ceilingAvg, luminaire: lum, count: 1 }));
          const ag = autoGrid({ polygon: room.polygon, area: room.area, use: room.use, ceilingAvg: room.ceilingAvg }, k.luminaires.find((l) => l.id === lum)!.lumens, k, pr.point.position);
          const ok = editElec('Grade de luminárias', (el) => void replaceRoomLights(el, level, (p) => pointInPoly(p.position, room.polygon), fresh));
          if (ok) toast.success(`${fresh.length} luminária(s) em grade: cerca de ${Math.round(ag.lux)} lux (alvo ${ag.target}).`);
          return;
        }
        const room = env.rooms.find((r) => r.id === pr.roomId);
        placePoint(pr.point, tool === 'switch' && room ? { autoControl: { polygon: room.polygon } } : {});
      },
    },
    { enabled: true, z: elevation },
  );
  useEffect(() => () => void (gl.domElement.style.cursor = ''), [gl]);
  const def = ELEC_TOOLS.find((t) => t.id === tool);
  useHint(def ? `${def.label}: ${def.hint} · Esc encerra` : null);

  if (!ghost) return null;
  const { proposal: pr, grid } = ghost;
  const kind = tool === 'panel' ? 'panel' : symbolKind({ id: 'g', ...pr.point });
  const shape = symbolShape(kind, pr.point.position, pr.normal);
  const z = elevation + 1.3;
  return (
    <MotorGroup>
      <SymbolMesh shape={shape} color={GHOST} z={z} order={80} />
      {grid.map((g, i) => (
        <SymbolMesh key={i} shape={symbolShape('light_ceiling', g, null)} color={GHOST} z={z} order={80} opacity={0.7} />
      ))}
      <SceneLabel position={[pr.point.position[0], pr.point.position[1] + 0.5, z]} tone="live">
        {grid.length > 1 ? `${pr.label} · grade de ${grid.length}` : pr.label}
      </SceneLabel>
    </MotorGroup>
  );
}

const SNAP_KIND = { point: 'endpoint', panel: 'endpoint', vertex: 'endpoint', segment: 'midpoint', grid: 'grid', none: 'none' } as const;
const SNAP_TEXT: Record<ConduitSnap['kind'], string> = { point: 'Caixa', panel: 'Quadro', vertex: 'Eletroduto', segment: 'Sobre o eletroduto', grid: '', none: '' };

function ConduitTool({ model, level, elevation }: { model: BuildingModel; level: string; elevation: number }) {
  const plan = useElecPlan(model, level);
  const planRef = useRef(plan);
  planRef.current = plan;
  const run = useElecUi((s) => s.conduitRun);
  const [pts, setPts] = useState<Vec2[]>([]);
  const ptsRef = useRef(pts);
  ptsRef.current = pts;
  const [cur, setCur] = useState<{ snap: ConduitSnap; mpp: number } | null>(null);
  const gl = useThree((s) => s.gl);

  const snapAt = (raw: Vec2, o: { shift: boolean; alt: boolean; mpp: number }): ConduitSnap => {
    const pl = planRef.current;
    const anchor = ptsRef.current[ptsRef.current.length - 1] ?? null;
    if (!pl) return { point: raw, kind: 'none' };
    return snapConduit(raw, pl, Math.max(0.1, 12 * o.mpp), { anchor, ortho: o.shift, noSnap: o.alt });
  };
  const finish = (extra?: Vec2) => {
    const list = [...ptsRef.current, ...(extra ? [extra] : [])].filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1]![0], p[1] - a[i - 1]![1]) > 0.02);
    setPts([]);
    if (list.length >= 2) commitConduit(list, run, level);
  };

  usePlanePointer(
    {
      onMove: (e) => {
        gl.domElement.style.cursor = 'crosshair';
        setCur({ snap: snapAt(e.p, e), mpp: e.mpp });
      },
      onLeave: () => setCur(null),
      onClick: (e) => {
        const s = snapAt(e.p, e);
        setPts((l) => (l.length > 0 && Math.hypot(s.point[0] - l[l.length - 1]![0], s.point[1] - l[l.length - 1]![1]) < 0.02 ? l : [...l, s.point]));
      },
      onDoubleClick: () => finish(),
    },
    { enabled: true, z: elevation },
  );
  useKey(['Enter'], () => {
    if (ptsRef.current.length === 0) return false;
    finish();
    return true;
  });
  useKey(['Escape'], () => {
    if (ptsRef.current.length > 0) {
      setPts([]);
      return true;
    }
    useElecUi.getState().setTool('none');
    return true;
  });
  useEffect(() => () => void (gl.domElement.style.cursor = ''), [gl]);
  useHint(pts.length === 0 ? `Eletroduto no ${run === 'ceiling' ? 'forro' : 'piso'}: clique no ponto inicial (encaixa em caixas, no quadro e em outros eletrodutos) · Shift trava 0°/90° · Alt sem encaixe` : 'Clique para o próximo ponto · duplo clique ou Enter conclui · Esc cancela');

  const z = elevation + 1.3;
  const live: Vec2[] = cur ? [...pts, cur.snap.point] : pts;
  return (
    <MotorGroup>
      {live.length >= 2 ? <Line points={live.map((p) => [p[0], p[1], z] as [number, number, number])} color={GHOST} lineWidth={2.5} dashed={run === 'floor'} dashSize={0.16} gapSize={0.1} depthTest={false} renderOrder={85} /> : null}
      {cur ? (
        <>
          <SnapMarker point={cur.snap.point} kind={SNAP_KIND[cur.snap.kind]} z={z} mpp={cur.mpp} showLabel={false} />
          {SNAP_TEXT[cur.snap.kind] ? (
            <SceneLabel position={[cur.snap.point[0], cur.snap.point[1] - cur.mpp * 26, z]} tone="hint">
              {SNAP_TEXT[cur.snap.kind]}
            </SceneLabel>
          ) : null}
        </>
      ) : null}
      {pts.map((p, i) => (
        <PlanText key={i} label={{ text: String(i + 1), at: [p[0], p[1] + 0.2], color: GHOST, size: 0.14 }} z={z} />
      ))}
    </MotorGroup>
  );
}

/** Ferramentas da camada Elétrica na planta (substituem o modo Selecionar enquanto a camada está ligada). */
export function ElecTools({ model }: { model: BuildingModel }) {
  const level = useEditor((s) => s.activeLevelId);
  const elevation = useEditor((s) => s.project.levels.find((l) => l.id === level)?.elevation ?? 0);
  const tool = useElecUi((s) => s.tool);
  // chave nova ao trocar de ferramenta: zera rascunhos e ouvintes
  return (
    <>
      <ElecKeys />
      {tool === 'none' ? <SelectTool key="none" model={model} level={level} elevation={elevation} /> : tool === 'conduit' ? <ConduitTool key="conduit" model={model} level={level} elevation={elevation} /> : <PlaceTool key={tool} model={model} level={level} elevation={elevation} />}
    </>
  );
}

