'use client';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { HostWall, ResolvedOpening, ResolvedStair } from '@chalecad/engine';
import { useEditor } from '@/lib/store/editor';
import { fmt } from '@/lib/project/format';
import { closestOnSegment, dist, mid, round, sub, type V2 } from '@/lib/tools/geom';
import { angleDeg } from '@/lib/tools/measureInput';
import type { PlanSnapResult } from '@/lib/tools/planSnap';
import { hasTooShort, moveWallEnd, moveWallParallel, type WallChange } from '@/lib/tools/walls';
import { dragOffset } from '@/lib/tools/opening';
import { rayHitHorizontal, rayHitVertical, sceneToMotor, type Ray3 } from '@/lib/tools/plane';
import { rightNormal } from '@/lib/tools/geom';
import { wallBasis } from '@/lib/three/convert';
import type { CameraView } from '@/lib/store/types';
import { basisTransform } from '../geometry';
import { SceneLabel } from '../labels';
import { MotorGroup } from '../MotorGroup';
import { ConstantSize } from './ConstantSize';
import { ElasticWall, SnapGuides, SnapMarker } from './markers';
import { makeSnap, resolvePlan, type ToolEnv } from './env';
import { useDrag } from './pointer';

const AMBER = '#f59e0b';
const motor2 = (p: { x: number; y: number; z: number }): V2 => {
  const m = sceneToMotor([p.x, p.y, p.z]);
  return [m[0], m[1]];
};

/** Abertura selecionada: arrastar ao longo da parede, com snap na modulação (updateCoalesced). */
function OpeningDrag({ env, op, wall, view }: { env: ToolEnv; op: ResolvedOpening; wall: HostWall; view: CameraView }) {
  const drag = useDrag();
  const [hot, setHot] = useState(false);
  const [info, setInfo] = useState<number | null>(null);
  const t = useMemo(() => basisTransform(wallBasis(wall)), [wall]);
  const w = op.u1 - op.u0;
  const h = op.v1 - op.v0;
  const cx = (op.u0 + op.u1) / 2;
  const cy = (op.v0 + op.v1) / 2;
  const elevation = view === 'front' || view === 'back' || view === 'left' || view === 'right';

  const begin = (e: { point: { x: number; y: number; z: number }; nativeEvent: PointerEvent }) => {
    const grab = closestOnSegment(motor2(e.point), wall.from, wall.to).u - op.u0;
    const zMid = wall.baseZ + cy;
    const n = rightNormal(wall.from, wall.to);
    const pick = (r: Ray3): V2 | null => (elevation ? rayHitVertical(r, wall.from, n) : rayHitHorizontal(r, zMid));
    drag(e.nativeEvent, {
      pick,
      z: zMid,
      onMove: (pe) => {
        const u = closestOnSegment(pe.p, wall.from, wall.to).u;
        const opts = { grid: env.options.snapGrid, modulation: env.options.snapModulation, studSpacing: env.studSpacing, disabled: pe.alt };
        const offset = dragOffset(wall, u, grab, w, opts);
        setInfo(offset);
        useEditor.getState().updateCoalesced('Mover abertura', (d) => {
          const o = d.openings.find((x) => x.id === op.id);
          if (o) o.offset = offset;
        });
      },
      onEnd: () => setInfo(null),
    });
  };

  return (
    <MotorGroup>
      <group position={t.position} quaternion={t.quaternion}>
        <mesh
          position={[cx, cy, 0]}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHot(true);
            document.body.style.cursor = 'ew-resize';
          }}
          onPointerOut={() => {
            setHot(false);
            document.body.style.cursor = '';
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            begin(e);
          }}
        >
          <boxGeometry args={[w, h, wall.thickness + 0.14]} />
          <meshBasicMaterial transparent opacity={hot ? 0.08 : 0} depthWrite={false} color={AMBER} />
        </mesh>
        {/* gizmo discreto: setas nas laterais */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[cx + s * (w / 2 + 0.1), cy, 0]} rotation={[0, 0, -s * Math.PI / 2]} raycast={() => null} renderOrder={960}>
            <coneGeometry args={[0.045, 0.1, 3]} />
            <meshBasicMaterial color={AMBER} depthTest={false} toneMapped={false} transparent opacity={hot || info !== null ? 1 : 0.7} />
          </mesh>
        ))}
        {info !== null ? (
          <SceneLabel position={[cx, op.v1 + 0.18, 0]} tone="live">
            a {fmt(info)} m do início
          </SceneLabel>
        ) : null}
      </group>
    </MotorGroup>
  );
}

/**
 * Parede interna selecionada: alças nas pontas (arrastar move a ponta e as paredes ligadas acompanham) e no meio
 * (desloca a parede em paralelo; as vizinhas esticam). Durante o arraste só aparece uma prévia com as cotas; a mudança
 * entra no projeto de uma vez ao soltar (um único passo de desfazer).
 */
function WallHandles({ env, id }: { env: ToolEnv; id: string }) {
  const wall = env.project.walls.find((w) => w.id === id);
  const drag = useDrag();
  const [ghost, setGhost] = useState<{ changes: WallChange[]; bad: boolean; snap: PlanSnapResult | null; mpp: number; note: string } | null>(null);
  const ghostRef = useRef(ghost);
  ghostRef.current = ghost;
  if (!wall) return null;
  const z = (env.project.levels.find((l) => l.id === wall.level)?.elevation ?? 0) + 0.05;
  const from = wall.from as V2;
  const to = wall.to as V2;
  const midP = mid(from, to);

  const finish = (label: string) => {
    const g = ghostRef.current;
    setGhost(null);
    if (!g || g.changes.length === 0) return;
    if (g.bad) {
      toast.info('Parede ficaria menor que 10 cm. Nada foi alterado.');
      return;
    }
    useEditor.getState().moveWalls(label, g.changes);
  };

  const startEnd = (which: 'from' | 'to', e: { clientX: number; clientY: number }) => {
    const other = (which === 'from' ? to : from) as V2;
    const walls = env.project.walls;
    drag(e, {
      z,
      onMove: (pe) => {
        // não encaixa em si mesma nem nas ligadas (que se movem junto)
        const linked = new Set(moveWallEnd(walls, wall.id, which, [9e3, 9e3]).map((c) => c.id));
        const s = resolvePlan(env, pe.p, { alt: pe.alt, shift: pe.shift, mpp: pe.mpp, anchor: other, exclude: linked });
        const changes = moveWallEnd(walls, wall.id, which, s.point);
        setGhost({ changes, bad: hasTooShort(changes), snap: s, mpp: pe.mpp, note: '' });
      },
      onEnd: () => finish('Mover ponta de parede'),
    });
  };

  const startMid = (e: { clientX: number; clientY: number }) => {
    const walls = env.project.walls;
    const n = rightNormal(from, to);
    drag(e, {
      z,
      onMove: (pe) => {
        let off = (pe.p[0] - midP[0]) * n[0] + (pe.p[1] - midP[1]) * n[1];
        if (!pe.alt) off = Math.round(off / 0.05) * 0.05;
        const changes = moveWallParallel(walls, wall.id, round(off, 3));
        setGhost({ changes, bad: hasTooShort(changes), snap: null, mpp: pe.mpp, note: `${fmt(Math.abs(off))} m` });
      },
      onEnd: () => finish('Mover parede'),
    });
  };

  const handle = (key: string, p: V2, shape: 'round' | 'square', onDown: (e: PointerEvent) => void, cursor: string) => (
    <ConstantSize key={key} position={[p[0], p[1], z + 0.02]} px={1}>
      <mesh
        renderOrder={997}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = cursor;
        }}
        onPointerOut={() => (document.body.style.cursor = '')}
        onPointerDown={(e) => {
          e.stopPropagation();
          onDown(e.nativeEvent);
        }}
      >
        {shape === 'round' ? <circleGeometry args={[8, 20]} /> : <planeGeometry args={[15, 15]} />}
        <meshBasicMaterial color="#ffffff" depthTest={false} toneMapped={false} />
      </mesh>
      <mesh renderOrder={998} raycast={() => null}>
        {shape === 'round' ? <circleGeometry args={[5.5, 20]} /> : <planeGeometry args={[10.5, 10.5]} />}
        <meshBasicMaterial color={shape === 'round' ? AMBER : '#0ea5e9'} depthTest={false} toneMapped={false} />
      </mesh>
    </ConstantSize>
  );

  const color = ghost?.bad ? '#dc2626' : AMBER;
  return (
    <MotorGroup>
      <Line points={[[from[0], from[1], z], [to[0], to[1], z]]} color={AMBER} lineWidth={1.5} depthTest={false} renderOrder={950} dashed dashSize={0.1} gapSize={0.06} />
      {handle('from', from, 'round', (e) => startEnd('from', e), 'grab')}
      {handle('to', to, 'round', (e) => startEnd('to', e), 'grab')}
      {handle('mid', midP, 'square', startMid, 'move')}
      {ghost ? (
        <>
          {ghost.snap ? <SnapGuides guides={ghost.snap.guides} z={z} /> : null}
          {ghost.snap ? <SnapMarker point={ghost.snap.point} kind={ghost.snap.kind} z={z} mpp={ghost.mpp} /> : null}
          {ghost.changes.map((c) => (
            <group key={c.id}>
              <ElasticWall a={c.from} b={c.to} z={z} thickness={0.11} color={color} />
              <SceneLabel position={[(c.from[0] + c.to[0]) / 2, (c.from[1] + c.to[1]) / 2, z + 0.06]} tone={ghost.bad ? 'bad' : c.id === wall.id ? 'live' : 'hint'} offsetY={-14}>
                {fmt(dist(c.from, c.to))} m{c.id === wall.id && !ghost.note ? ` · ${fmt(angleDeg(c.from, c.to), 0)}°` : ''}
              </SceneLabel>
            </group>
          ))}
          {ghost.note ? (
            <SceneLabel position={[midP[0], midP[1], z + 0.08]} tone="live" offsetY={18}>
              deslocou {ghost.note}
            </SceneLabel>
          ) : null}
        </>
      ) : null}
    </MotorGroup>
  );
}

/** Escada selecionada: arrastar no plano. */
function StairDrag({ env, stair }: { env: ToolEnv; stair: ResolvedStair }) {
  const proj = env.project.stairs.find((s) => s.id === stair.id);
  const drag = useDrag();
  const [hot, setHot] = useState(false);
  const geo = useMemo(() => new THREE.ShapeGeometry(new THREE.Shape(stair.footprint.map((p) => new THREE.Vector2(p[0], p[1])))), [stair.footprint]);
  if (!proj) return null;
  const z = (env.project.levels.find((l) => l.id === proj.from)?.elevation ?? 0) + 0.04;
  const foot = stair.footprint as V2[];

  const begin = (startP: V2, e: { clientX: number; clientY: number }) => {
    const grab = sub(startP, proj.position as V2);
    drag(e, {
      z,
      onMove: (pe) => {
        const s = makeSnap(env, sub(pe.p, grab), { alt: pe.alt, mpp: pe.mpp, segments: [], corners: [] });
        const position: V2 = [round(s.point[0], 2), round(s.point[1], 2)];
        useEditor.getState().updateCoalesced('Mover escada', (d) => {
          const st = d.stairs.find((x) => x.id === stair.id);
          if (st) st.position = position;
        });
      },
    });
  };

  return (
    <MotorGroup>
      <mesh
        geometry={geo}
        position={[0, 0, z]}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHot(true);
          document.body.style.cursor = 'move';
        }}
        onPointerOut={() => {
          setHot(false);
          document.body.style.cursor = '';
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          begin(motor2(e.point), e.nativeEvent);
        }}
      >
        <meshBasicMaterial color={AMBER} transparent opacity={hot ? 0.18 : 0.06} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <Line points={[...foot, foot[0]!].map((p) => [p[0], p[1], z + 0.01] as [number, number, number])} color={AMBER} lineWidth={2} depthTest={false} renderOrder={950} />
    </MotorGroup>
  );
}

/** Gizmos do modo Selecionar para o objeto selecionado (abertura, parede interna, escada). */
export function SelectOverlays({ env, view }: { env: ToolEnv; view: CameraView }) {
  const selection = useEditor((s) => s.selection);
  if (!selection) return null;
  if (selection.kind === 'opening') {
    const op = env.model.openings.find((o) => o.id === selection.id);
    const wall = op && op.hostKind === 'wall' && op.valid ? env.model.walls.find((w) => w.id === op.hostId) : null;
    return op && wall ? <OpeningDrag env={env} op={op} wall={wall} view={view} /> : null;
  }
  if (selection.kind === 'wall') return <WallHandles env={env} id={selection.id} />;
  if (selection.kind === 'stair') {
    const st = env.model.stairs.find((s) => s.id === selection.id);
    return st ? <StairDrag env={env} stair={st} /> : null;
  }
  return null;
}
