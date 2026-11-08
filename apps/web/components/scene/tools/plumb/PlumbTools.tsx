'use client';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { getCatalog } from '@chalecad/catalog';
import type { PipeSystem } from '@chalecad/engine';
import { useEditor } from '@/lib/store/editor';
import { deletePlumbSelection, noteManual } from '@/lib/plumb/actions';
import { dist2, FALLBACK_COLORS, fmtM, pathLength, SYSTEM_LABEL, type V2 } from '@/lib/plumb/geometry';
import { hitTest } from '@/lib/plumb/hit';
import { plumbId } from '@/lib/plumb/ids';
import { liveLayout, makePlumbEnv, plumbingReportOf } from '@/lib/plumb/live';
import { addPipe, addPoint, moveTank, moveVertex, movePoint } from '@/lib/plumb/ops';
import { snapPipe } from '@/lib/plumb/snap';
import { SNAP_LABEL, type PipeSnap } from '@/lib/plumb/snapTypes';
import { TOOL_SYSTEM, usePlumb } from '@/lib/plumb/store';
import { tankSide } from '@/lib/plumb/symbols';
import { buildPipePath, type DrawVertex, type PlumbEnv } from '@/lib/plumb/zdefaults';
import { SceneLabel } from '../../labels';
import { MotorGroup } from '../../MotorGroup';
import { resolvePlan, SNAP_PX, type ToolEnv } from '../env';
import { useKey, useHint } from '../hooks';
import { usePlanePointer } from '../pointer';

const AMBER = '#f59e0b';
const ringGeo = new THREE.RingGeometry(0.7, 1, 28);

type Resolve = (raw: V2, o: { alt: boolean; shift: boolean; mpp: number; anchor?: V2 | null }, system?: PipeSystem) => PipeSnap;

/** Snap do tubo: ponto/caixa/ponta/trecho primeiro; depois paredes e grade (sem a modulação dos montantes). */
function useResolve(env: ToolEnv, penv: PlumbEnv): Resolve {
  return (raw, o, system) => {
    const radius = Math.max(0.06, SNAP_PX * o.mpp);
    if (system && !o.alt) {
      const s = snapPipe(raw, system, penv, radius);
      if (s) return s;
    }
    const r = resolvePlan({ ...env, options: { ...env.options, snapModulation: false } }, raw, o);
    return { xy: [r.point[0], r.point[1]], kind: r.kind === 'grid' ? 'grid' : r.kind === 'none' ? 'free' : 'wall' };
  };
}

function Marker({ at, z, mpp, label, color = AMBER }: { at: V2; z: number; mpp: number; label?: string; color?: string }) {
  return (
    <group position={[at[0], at[1], z + 0.05]}>
      <group scale={mpp * 9}>
        <mesh geometry={ringGeo} renderOrder={1000}>
          <meshBasicMaterial color={color} depthTest={false} toneMapped={false} />
        </mesh>
      </group>
      {label ? (
        <SceneLabel position={[0, -mpp * 26, 0]} tone="hint">
          {label}
        </SceneLabel>
      ) : null}
    </group>
  );
}

const toast3 = (wasManual: boolean) => noteManual(wasManual);

/** Selecionar e mover: clique seleciona tubo, ponto ou caixa; arrastar move ponto, caixa ou vértice do tubo selecionado. */
function EditTool({ env, penv }: { env: ToolEnv; penv: PlumbEnv }) {
  const drag = useRef<{ kind: 'point' | 'tank' | 'vertex'; id: string; index?: number; moved: boolean } | null>(null);
  const [ghost, setGhost] = useState<{ xy: V2; mpp: number } | null>(null);
  const systems = usePlumb((s) => s.systems);
  const z = env.elevation;
  const layoutRef = useRef(penv.layout);
  layoutRef.current = penv.layout;

  const anchored = (xy: V2): boolean => penv.layout.points.some((p) => dist2(p.position, xy) < 0.03) || dist2(penv.layout.tank.position, xy) < 0.03;

  useKey(['Delete', 'Backspace'], () => (usePlumb.getState().sel ? deletePlumbSelection() : false));
  useKey(['Escape'], () => {
    if (!usePlumb.getState().sel) return false;
    usePlumb.getState().select(null);
    return true;
  });

  const resolve = useResolve(env, penv);
  usePlanePointer(
    {
      onDown: (e) => {
        const sel = usePlumb.getState().sel;
        const hit = hitTest(layoutRef.current, env.levelId, e.p, Math.max(0.07, 10 * e.mpp), systems, sel?.kind === 'pipe' ? sel.id : null, tankSide(layoutRef.current.tank.liters));
        if (!hit) return false;
        if (hit.sel.kind === 'point' || hit.sel.kind === 'tank') {
          usePlumb.getState().select(hit.sel);
          drag.current = { kind: hit.sel.kind, id: hit.sel.id, moved: false };
          return true;
        }
        if (hit.vertex !== undefined) {
          const pipe = layoutRef.current.pipes.find((p) => p.id === hit.sel.id);
          const v = pipe?.path[hit.vertex];
          if (!pipe || !v || anchored([v[0], v[1]])) return false;
          drag.current = { kind: 'vertex', id: pipe.id, index: hit.vertex, moved: false };
          return true;
        }
        return false;
      },
      onMove: (e) => {
        const d = drag.current;
        if (!d) return;
        d.moved = true;
        const r = resolve(e.p, { alt: e.alt, shift: false, mpp: e.mpp });
        setGhost({ xy: r.xy, mpp: e.mpp });
      },
      onUp: (e, moved) => {
        const d = drag.current;
        drag.current = null;
        setGhost(null);
        if (!d || !moved || !d.moved) return;
        const to = resolve(e.p, { alt: e.alt, shift: false, mpp: e.mpp }).xy;
        const layout = layoutRef.current;
        const was = useEditor.getState().project.installations.plumbing.manual;
        if (d.kind === 'point') useEditor.getState().update('Mover ponto de água', (p) => movePoint(p, layout, d.id, to));
        else if (d.kind === 'tank') useEditor.getState().update("Mover a caixa d'água", (p) => moveTank(p, layout, env.levelId, to));
        else useEditor.getState().update('Mover vértice do tubo', (p) => moveVertex(p, layout, d.id, d.index!, to));
        if (d.kind !== 'tank') toast3(was);
      },
      onClick: (e) => {
        const sel = usePlumb.getState().sel;
        const hit = hitTest(layoutRef.current, env.levelId, e.p, Math.max(0.07, 10 * e.mpp), systems, sel?.kind === 'pipe' ? sel.id : null, tankSide(layoutRef.current.tank.liters));
        usePlumb.getState().select(hit?.sel ?? null);
      },
    },
    { enabled: true, z },
  );
  useHint('Clique num tubo, ponto ou na caixa para selecionar · Arraste ponto ou caixa para mover · Delete apaga · Esc solta');
  return <MotorGroup>{ghost ? <Marker at={ghost.xy} z={z} mpp={ghost.mpp} color={AMBER} /> : null}</MotorGroup>;
}

/** Ponto de água: clique posiciona o aparelho escolhido. */
function PointTool({ env, penv }: { env: ToolEnv; penv: PlumbEnv }) {
  const fixture = usePlumb((s) => s.fixture);
  const [cur, setCur] = useState<{ xy: V2; mpp: number } | null>(null);
  const z = env.elevation;
  const resolve = useResolve(env, penv);
  const spec = getCatalog().constants.plumbing.water.fixtures[fixture];
  usePlanePointer(
    {
      onMove: (e) => setCur({ xy: resolve(e.p, { alt: e.alt, shift: false, mpp: e.mpp }).xy, mpp: e.mpp }),
      onClick: (e) => {
        const xy = resolve(e.p, { alt: e.alt, shift: false, mpp: e.mpp }).xy;
        const was = useEditor.getState().project.installations.plumbing.manual;
        const id = plumbId('pt');
        useEditor.getState().update('Ponto de água', (p) => addPoint(p, penv.layout, { id, fixture, level: env.levelId, xy, ...(spec ? { label: spec.label } : {}) }));
        usePlumb.getState().select({ kind: 'point', id });
        toast3(was);
      },
    },
    { enabled: true, z },
  );
  useHint(`Clique para posicionar: ${spec?.label ?? fixture}. Depois desenhe o tubo até ele · Esc encerra`);
  useKey(['Escape'], () => {
    usePlumb.getState().setTool('edit');
    return true;
  });
  return <MotorGroup>{cur ? <Marker at={cur.xy} z={z} mpp={cur.mpp} label={spec?.label} color={FALLBACK_COLORS.cold} /> : null}</MotorGroup>;
}

/** Caixa d'água: clique move a caixa para o ponto. */
function TankTool({ env, penv }: { env: ToolEnv; penv: PlumbEnv }) {
  const [cur, setCur] = useState<{ xy: V2; mpp: number } | null>(null);
  const z = env.elevation;
  const resolve = useResolve(env, penv);
  usePlanePointer(
    {
      onMove: (e) => setCur({ xy: resolve(e.p, { alt: e.alt, shift: false, mpp: e.mpp }).xy, mpp: e.mpp }),
      onClick: (e) => {
        const xy = resolve(e.p, { alt: e.alt, shift: false, mpp: e.mpp }).xy;
        useEditor.getState().update("Mover a caixa d'água", (p) => moveTank(p, penv.layout, env.levelId, xy));
        usePlumb.getState().select({ kind: 'tank', id: 'tank' });
        usePlumb.getState().setTool('edit');
        toast.info("Caixa d'água movida. Ajuste a cota do fundo nas propriedades.", { id: 'tank-moved' });
      },
    },
    { enabled: true, z },
  );
  useHint("Clique onde fica a caixa d'água (a cota do fundo não muda) · Esc encerra");
  useKey(['Escape'], () => {
    usePlumb.getState().setTool('edit');
    return true;
  });
  const side = tankSide(penv.layout.tank.liters);
  return (
    <MotorGroup>
      {cur ? (
        <>
          <Line points={[[cur.xy[0] - side / 2, cur.xy[1] - side / 2, z + 0.05], [cur.xy[0] + side / 2, cur.xy[1] - side / 2, z + 0.05], [cur.xy[0] + side / 2, cur.xy[1] + side / 2, z + 0.05], [cur.xy[0] - side / 2, cur.xy[1] + side / 2, z + 0.05], [cur.xy[0] - side / 2, cur.xy[1] - side / 2, z + 0.05]]} color={FALLBACK_COLORS.cold} lineWidth={2.5} dashed dashSize={0.1} gapSize={0.06} depthTest={false} renderOrder={1000} />
          <Marker at={cur.xy} z={z} mpp={cur.mpp} />
        </>
      ) : null}
    </MotorGroup>
  );
}

/**
 * Tubo (fria, quente, esgoto, ventilação): polilinha em planta. Clique adiciona vértice; ao tocar ponto, caixa, ponta ou
 * trecho de outro tubo o desenho termina ali (no trecho, o outro tubo é dividido). Enter ou duplo clique termina; Esc cancela.
 * Shift trava 15°, Alt desliga o encaixe.
 */
function PipeTool({ env, penv, system }: { env: ToolEnv; penv: PlumbEnv; system: PipeSystem }) {
  const [verts, setVerts] = useState<DrawVertex[]>([]);
  const vref = useRef<DrawVertex[]>([]);
  vref.current = verts;
  const [cur, setCur] = useState<{ snap: PipeSnap; mpp: number } | null>(null);
  const z = env.elevation;
  const resolve = useResolve(env, penv);
  const color = (getCatalog().constants.plumbing.colors as Record<PipeSystem, string>)[system] ?? FALLBACK_COLORS[system];
  const penvRef = useRef(penv);
  penvRef.current = penv;

  const finish = (list: DrawVertex[]) => {
    setVerts([]);
    const pe = penvRef.current;
    const enough = system === 'vent' ? list.length >= 1 : list.length >= 2;
    if (!enough) return;
    const lone = system === 'vent' && list.length === 1;
    const input = lone ? [list[0]!, list[0]!] : list;
    const was = useEditor.getState().project.installations.plumbing.manual;
    let id: string | null = null;
    useEditor.getState().update('Desenhar tubo', (p) => {
      id = addPipe(p, { system, verts: input, env: pe, newId: () => plumbId('pipe') });
    });
    if (id) {
      usePlumb.getState().select({ kind: 'pipe', id });
      toast3(was);
    } else toast.info('O tubo ficou curto demais. Clique em outro ponto.');
  };

  const add = (snap: PipeSnap) => {
    const list = vref.current;
    const last = list[list.length - 1];
    if (last && dist2(last.xy, snap.xy) < 0.02 && !snap.z) return;
    const v: DrawVertex = { xy: snap.xy, snap: snap.kind === 'wall' || snap.kind === 'grid' || snap.kind === 'free' ? undefined : snap };
    const ends = snap.kind === 'point' || snap.kind === 'tank' || snap.kind === 'end' || snap.kind === 'segment';
    // ventilação: um clique num tubo de esgoto já cria a coluna até acima do telhado
    if (system === 'vent' && list.length === 0 && ends) finish([v]);
    else if (ends && list.length >= 1) finish([...list, v]);
    else setVerts([...list, v]);
  };

  useKey(['Escape'], () => {
    if (vref.current.length > 0) {
      setVerts([]);
      return true;
    }
    usePlumb.getState().setTool('edit');
    return true;
  });
  useKey(['Enter'], () => {
    if (vref.current.length === 0) return false;
    finish(vref.current);
    return true;
  });

  usePlanePointer(
    {
      onMove: (e) => {
        const a = vref.current[vref.current.length - 1]?.xy ?? null;
        setCur({ snap: resolve(e.p, { alt: e.alt, shift: e.shift, mpp: e.mpp, anchor: a }, system), mpp: e.mpp });
      },
      onClick: (e) => {
        const a = vref.current[vref.current.length - 1]?.xy ?? null;
        add(resolve(e.p, { alt: e.alt, shift: e.shift, mpp: e.mpp, anchor: a }, system));
      },
      onDoubleClick: () => {
        if (vref.current.length > 0) finish(vref.current);
      },
    },
    { enabled: true, z },
  );

  useHint(
    verts.length === 0
      ? system === 'vent'
        ? 'Clique num tubo de esgoto: a ventilação sobe até acima do telhado · Esc encerra'
        : `${SYSTEM_LABEL[system]}: clique no ponto, na caixa ou numa ponta/trecho de tubo para começar · Shift 15° · Alt sem encaixe`
      : 'Clique para o próximo vértice · tocar ponto, caixa ou tubo termina · Enter/duplo clique termina · Esc cancela',
  );

  const preview = useMemo(() => {
    if (verts.length === 0 && !cur) return [] as [number, number, number][];
    const list = [...verts.map((v) => v.xy), ...(cur ? [cur.snap.xy] : [])];
    return list.map(([x, y]) => [x, y, z + 0.05] as [number, number, number]);
  }, [verts, cur, z]);
  const total = useMemo(() => {
    if (verts.length === 0 || !cur) return null;
    const path = buildPipePath(system, [...verts, { xy: cur.snap.xy, snap: cur.snap.kind === 'wall' || cur.snap.kind === 'grid' || cur.snap.kind === 'free' ? undefined : cur.snap }], penv);
    return path.length >= 2 ? pathLength(path) : 0;
  }, [verts, cur, system, penv]);

  return (
    <MotorGroup>
      {preview.length >= 2 ? <Line points={preview} color={color} lineWidth={3} transparent opacity={0.85} depthTest={false} renderOrder={1001} /> : null}
      {verts.map((v, i) => (
        <Marker key={i} at={v.xy} z={z} mpp={cur?.mpp ?? 0.01} color={color} />
      ))}
      {cur ? <Marker at={cur.snap.xy} z={z} mpp={cur.mpp} label={SNAP_LABEL[cur.snap.kind] || undefined} color={cur.snap.kind === 'free' || cur.snap.kind === 'grid' || cur.snap.kind === 'wall' ? '#78716c' : AMBER} /> : null}
      {cur && verts.length > 0 && total !== null ? (
        <SceneLabel position={[cur.snap.xy[0], cur.snap.xy[1] + cur.mpp * 38, z + 0.08]} tone="live">
          {fmtM(dist2(verts[verts.length - 1]!.xy, cur.snap.xy))} m · tubo {fmtM(total)} m
        </SceneLabel>
      ) : null}
    </MotorGroup>
  );
}

/** Ferramenta de hidráulica ativa (`usePlumb.tool`), no lugar da ferramenta do editor. */
export function PlumbToolLayer({ env }: { env: ToolEnv }) {
  const tool = usePlumb((s) => s.tool);
  const project = useEditor((s) => s.project);
  const results = useEditor((s) => s.results);
  const report = plumbingReportOf(project, results);
  const layout = useMemo(() => liveLayout(project, report), [project, report]);
  const penv = useMemo(() => (layout ? makePlumbEnv(project, env.model, layout, env.levelId) : null), [project, env.model, layout, env.levelId]);
  const hasLayout = !!penv;
  useHint(hasLayout || !tool ? null : 'Sem traçado hidráulico: ligue as instalações e marque o banheiro (ou ponha a torre da caixa d’água)');
  if (!tool || !penv) return null;
  if (tool === 'edit') return <EditTool env={env} penv={penv} />;
  if (tool === 'point') return <PointTool env={env} penv={penv} />;
  if (tool === 'tank') return <TankTool env={env} penv={penv} />;
  const system = TOOL_SYSTEM[tool];
  return system ? <PipeTool key={tool} env={env} penv={penv} system={system} /> : null;
}
