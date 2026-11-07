'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { toast } from 'sonner';
import { isEditableTypology, mezzanineElevation, upperLevel } from '@/lib/project/edit';
import { fmt } from '@/lib/project/format';
import { useEditor } from '@/lib/store/editor';
import { bounds, closestOnSegment, dist, lerp, mid, polygonArea, round, sub, type V2 } from '@/lib/tools/geom';
import { clampPoint, insertVertex, moveEdge, nextLevelId, rectFromDrag, removeVertex } from '@/lib/tools/mezzanine';
import { snapScalar, type SnapResult } from '@/lib/tools/snap';
import { sceneToMotor } from '@/lib/tools/plane';
import { SceneLabel } from '../labels';
import { MotorGroup } from '../MotorGroup';
import { ConstantSize } from './ConstantSize';
import { SnapMarker } from './markers';
import { makeSnap, type ToolEnv } from './env';
import { useHint } from './hooks';
import { useDrag, usePlanePointer } from './pointer';

const AMBER = '#f59e0b';
const r3 = (p: V2): V2 => [round(p[0], 3), round(p[1], 3)];

function footprintBounds(env: ToolEnv) {
  return bounds(env.model.footprint as V2[]);
}

/** Retângulo por arraste quando ainda não há mezanino. */
function MezzCreator({ env }: { env: ToolEnv }) {
  const t = env.project.typology;
  const elevation = isEditableTypology(t) ? mezzanineElevation(t) : 'wallHeight' in t ? t.wallHeight : 2.4;
  const [a, setA] = useState<V2 | null>(null);
  const aRef = useRef<V2 | null>(null);
  aRef.current = a;
  const [cur, setCur] = useState<{ snap: SnapResult; mpp: number } | null>(null);
  const fb = footprintBounds(env);

  const point = (raw: V2, alt: boolean, mpp: number) => {
    const s = makeSnap(env, raw, { alt, mpp });
    return { ...s, point: clampPoint(s.point, fb.min, fb.max) };
  };

  usePlanePointer(
    {
      onDown: (e) => {
        setA(point(e.p, e.alt, e.mpp).point);
        return true;
      },
      onMove: (e) => setCur({ snap: point(e.p, e.alt, e.mpp), mpp: e.mpp }),
      onUp: (e, moved) => {
        const start = aRef.current;
        setA(null);
        if (!start) return;
        if (!moved) return;
        const poly = rectFromDrag(start, point(e.p, e.alt, e.mpp).point);
        if (!poly) {
          toast.info('Mezanino muito pequeno: arraste um retângulo de pelo menos 1 × 1 m.', { id: 'mezz-small' });
          return;
        }
        const id = nextLevelId(env.project.levels.map((l) => l.id));
        useEditor.getState().update('Criar mezanino', (d) => {
          d.levels.push({ id, name: 'Mezanino', elevation, polygon: poly.map(r3), deck: 'osb18', guardrail: true });
        });
        toast.success('Mezanino criado.');
      },
      onLeave: () => setCur(null),
    },
    { enabled: true, z: elevation },
  );
  useHint('Sem mezanino: clique e arraste para desenhar o retângulo · Alt sem snap');

  const b = a && cur ? cur.snap.point : null;
  const rect = a && b ? [a, [b[0], a[1]], b, [a[0], b[1]]] as V2[] : null;
  const w = a && b ? Math.abs(b[0] - a[0]) : 0;
  const d = a && b ? Math.abs(b[1] - a[1]) : 0;
  return (
    <MotorGroup>
      {cur ? <SnapMarker point={cur.snap.point} kind={cur.snap.kind} z={elevation} mpp={cur.mpp} /> : null}
      {rect ? (
        <>
          <Line points={[...rect, rect[0]!].map((p) => [p[0], p[1], elevation + 0.04] as [number, number, number])} color={AMBER} lineWidth={2.5} depthTest={false} renderOrder={990} />
          <mesh position={[(a![0] + b![0]) / 2, (a![1] + b![1]) / 2, elevation + 0.03]} renderOrder={980}>
            <planeGeometry args={[Math.max(w, 0.001), Math.max(d, 0.001)]} />
            <meshBasicMaterial color={AMBER} transparent opacity={0.25} depthTest={false} toneMapped={false} />
          </mesh>
          <SceneLabel position={[(a![0] + b![0]) / 2, (a![1] + b![1]) / 2, elevation + 0.08]} tone="live">
            {fmt(w)} × {fmt(d)} m · {fmt(w * d, 1)} m²
          </SceneLabel>
        </>
      ) : null}
    </MotorGroup>
  );
}

/** Polígono do mezanino com alças: vértices (arrastar, duplo clique remove) e arestas (arrastar move, clique adiciona vértice). */
function MezzEditor({ env, levelId, polygon, elevation }: { env: ToolEnv; levelId: string; polygon: V2[]; elevation: number }) {
  const drag = useDrag();
  const fb = footprintBounds(env);
  const [mark, setMark] = useState<{ snap: SnapResult; mpp: number } | null>(null);
  const polyRef = useRef(polygon);
  polyRef.current = polygon;

  const write = (label: string, poly: V2[]) =>
    useEditor.getState().updateCoalesced(label, (d) => {
      const lv = d.levels.find((l) => l.id === levelId);
      if (lv) lv.polygon = poly.map(r3);
    });

  const startVertex = (i: number, e: { clientX: number; clientY: number }) => {
    drag(e, {
      z: elevation,
      onMove: (pe) => {
        const others = polyRef.current.filter((_, k) => k !== i);
        const s = makeSnap(env, pe.p, { alt: pe.alt, mpp: pe.mpp, corners: [...env.corners.filter((c) => !polyRef.current.some((v) => v[0] === c[0] && v[1] === c[1])), ...others] });
        const p = clampPoint(s.point, fb.min, fb.max);
        setMark({ snap: { ...s, point: p }, mpp: pe.mpp });
        write('Mover vértice do mezanino', polyRef.current.map((v, k) => (k === i ? p : v)));
      },
      onEnd: () => setMark(null),
    });
  };

  const startEdge = (i: number, startPoint: V2, e: { clientX: number; clientY: number }) => {
    const orig = polyRef.current.map((v) => [v[0], v[1]] as V2);
    drag(e, {
      z: elevation,
      onMove: (pe) => {
        const s = makeSnap(env, pe.p, { alt: pe.alt, mpp: pe.mpp, corners: [] });
        const moved = moveEdge(orig, i, sub(s.point, orig[i]!)).map((v) => clampPoint(v, fb.min, fb.max));
        setMark({ snap: s, mpp: pe.mpp });
        write('Mover aresta do mezanino', moved);
      },
      onEnd: (moved) => {
        setMark(null);
        if (moved) return;
        const a = orig[i]!;
        const b = orig[(i + 1) % orig.length]!;
        const hit = closestOnSegment(startPoint, a, b);
        const len = dist(a, b);
        const u = Math.min(len, Math.max(0, snapScalar(hit.u, { grid: env.options.snapGrid, modulation: false, studSpacing: env.studSpacing })));
        if (u < 0.15 || len - u < 0.15) return;
        const p = r3(lerp(a, b, u / len));
        useEditor.getState().update('Adicionar vértice ao mezanino', (d) => {
          const lv = d.levels.find((l) => l.id === levelId);
          if (lv?.polygon) lv.polygon = insertVertex(orig, i, p).map(r3);
        });
      },
    });
  };

  const removeAt = (i: number) => {
    if (polyRef.current.length <= 3) {
      toast.info('O mezanino precisa de pelo menos 3 vértices.', { id: 'mezz-min' });
      return;
    }
    useEditor.getState().update('Remover vértice do mezanino', (d) => {
      const lv = d.levels.find((l) => l.id === levelId);
      if (lv?.polygon) lv.polygon = removeVertex(polyRef.current, i).map(r3);
    });
  };

  useHint('Arraste vértices e arestas · clique numa aresta adiciona vértice · duplo clique num vértice remove · Alt sem snap');
  const z = elevation + 0.05;
  const geo = useMemo(() => new THREE.ShapeGeometry(new THREE.Shape(polygon.map((p) => new THREE.Vector2(p[0], p[1])))), [polygon]);
  useEffect(() => () => geo.dispose(), [geo]);
  const area = Math.abs(polygonArea(polygon));

  return (
    <MotorGroup>
      <mesh geometry={geo} position={[0, 0, elevation + 0.02]} renderOrder={970}>
        <meshBasicMaterial color={AMBER} transparent opacity={0.12} depthTest={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <Line points={[...polygon, polygon[0]!].map((p) => [p[0], p[1], z] as [number, number, number])} color={AMBER} lineWidth={2.5} depthTest={false} renderOrder={990} />
      {polygon.map((a, i) => {
        const b = polygon[(i + 1) % polygon.length]!;
        const len = dist(a, b);
        const m = mid(a, b);
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        return (
          <group key={`e${i}`}>
            <mesh
              position={[m[0], m[1], z]}
              rotation={[0, 0, ang]}
              onPointerOver={(e) => {
                e.stopPropagation();
                document.body.style.cursor = 'move';
              }}
              onPointerOut={() => (document.body.style.cursor = '')}
              onPointerDown={(e) => {
                e.stopPropagation();
                startEdge(i, sceneToMotor([e.point.x, e.point.y, e.point.z]).slice(0, 2) as V2, e.nativeEvent);
              }}
            >
              <planeGeometry args={[Math.max(0.01, len - 0.2), 0.3]} />
              <meshBasicMaterial transparent opacity={0} depthTest={false} depthWrite={false} />
            </mesh>
            <ConstantSize position={[m[0], m[1], z + 0.01]} px={1}>
              <mesh renderOrder={995}>
                <planeGeometry args={[9, 9]} />
                <meshBasicMaterial color="#ffffff" depthTest={false} toneMapped={false} />
              </mesh>
              <mesh renderOrder={996}>
                <planeGeometry args={[6, 6]} />
                <meshBasicMaterial color={AMBER} depthTest={false} toneMapped={false} />
              </mesh>
            </ConstantSize>
            <SceneLabel position={[m[0], m[1], z]} offsetY={-16}>
              {fmt(len)} m
            </SceneLabel>
          </group>
        );
      })}
      {polygon.map((p, i) => (
        <ConstantSize key={`v${i}`} position={[p[0], p[1], z + 0.02]} px={1}>
          <mesh
            renderOrder={997}
            onPointerOver={(e) => {
              e.stopPropagation();
              document.body.style.cursor = 'grab';
            }}
            onPointerOut={() => (document.body.style.cursor = '')}
            onPointerDown={(e) => {
              e.stopPropagation();
              startVertex(i, e.nativeEvent);
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              removeAt(i);
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
      {mark ? <SnapMarker point={mark.snap.point} kind={mark.snap.kind} z={elevation} mpp={mark.mpp} /> : null}
      <SceneLabel position={[polygon.reduce((s, p) => s + p[0], 0) / polygon.length, polygon.reduce((s, p) => s + p[1], 0) / polygon.length, z]} tone="live">
        Mezanino · {fmt(area, 1)} m²
      </SceneLabel>
    </MotorGroup>
  );
}

export function MezzanineTool({ env }: { env: ToolEnv }) {
  const level = upperLevel(env.project);
  if (!level?.polygon) return <MezzCreator env={env} />;
  return <MezzEditor env={env} levelId={level.id} polygon={level.polygon.map((v) => [v[0], v[1]] as V2)} elevation={level.elevation} />;
}
