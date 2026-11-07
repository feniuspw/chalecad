'use client';
import { useMemo, useState } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { HostWall, ResolvedOpening, ResolvedStair } from '@chalecad/engine';
import { useEditor } from '@/lib/store/editor';
import { fmt } from '@/lib/project/format';
import { closestOnSegment, round, sub, type V2 } from '@/lib/tools/geom';
import { dragOffset } from '@/lib/tools/opening';
import { rayHitHorizontal, rayHitVertical, sceneToMotor, type Ray3 } from '@/lib/tools/plane';
import { rightNormal } from '@/lib/tools/geom';
import type { SnapResult } from '@/lib/tools/snap';
import { wallBasis } from '@/lib/three/convert';
import type { CameraView } from '@/lib/store/types';
import { basisTransform } from '../geometry';
import { SceneLabel } from '../labels';
import { MotorGroup } from '../MotorGroup';
import { ConstantSize } from './ConstantSize';
import { SnapMarker } from './markers';
import { makeSnap, resolvePoint, type ToolEnv } from './env';
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

/** Parede interna selecionada: alças nas extremidades. */
function WallHandles({ env, id }: { env: ToolEnv; id: string }) {
  const wall = env.project.walls.find((w) => w.id === id);
  const drag = useDrag();
  const [mark, setMark] = useState<{ snap: SnapResult; mpp: number } | null>(null);
  if (!wall) return null;
  const z = (env.project.levels.find((l) => l.id === wall.level)?.elevation ?? 0) + 0.05;
  const ends: ['from' | 'to', V2][] = [
    ['from', wall.from as V2],
    ['to', wall.to as V2],
  ];

  const start = (which: 'from' | 'to', e: { clientX: number; clientY: number }) => {
    const other = (which === 'from' ? wall.to : wall.from) as V2;
    const segments = env.segments.filter((s) => s.id !== wall.id);
    drag(e, {
      z,
      onMove: (pe) => {
        const raw = pe.p;
        const s = pe.shift
          ? resolvePoint({ ...env, segments }, raw, { alt: pe.alt, shift: true, mpp: pe.mpp, anchor: other })
          : makeSnap(env, raw, { alt: pe.alt, mpp: pe.mpp, segments });
        const p: V2 = [round(s.point[0], 3), round(s.point[1], 3)];
        setMark({ snap: s, mpp: pe.mpp });
        useEditor.getState().updateCoalesced('Mover parede', (d) => {
          const w = d.walls.find((x) => x.id === wall.id);
          if (w) w[which] = p;
        });
      },
      onEnd: () => setMark(null),
    });
  };

  return (
    <MotorGroup>
      <Line points={[[wall.from[0], wall.from[1], z], [wall.to[0], wall.to[1], z]]} color={AMBER} lineWidth={1.5} depthTest={false} renderOrder={950} dashed dashSize={0.1} gapSize={0.06} />
      {ends.map(([which, p]) => (
        <ConstantSize key={which} position={[p[0], p[1], z + 0.02]} px={1}>
          <mesh
            renderOrder={997}
            onPointerOver={(e) => {
              e.stopPropagation();
              document.body.style.cursor = 'grab';
            }}
            onPointerOut={() => (document.body.style.cursor = '')}
            onPointerDown={(e) => {
              e.stopPropagation();
              start(which, e.nativeEvent);
            }}
          >
            <circleGeometry args={[8, 20]} />
            <meshBasicMaterial color="#ffffff" depthTest={false} toneMapped={false} />
          </mesh>
          <mesh renderOrder={998} raycast={() => null}>
            <circleGeometry args={[5.5, 20]} />
            <meshBasicMaterial color={AMBER} depthTest={false} toneMapped={false} />
          </mesh>
        </ConstantSize>
      ))}
      {mark ? <SnapMarker point={mark.snap.point} kind={mark.snap.kind} z={z} mpp={mark.mpp} /> : null}
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
