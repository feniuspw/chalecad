'use client';
import { useRef, useState } from 'react';
import { Line } from '@react-three/drei';
import { fmt } from '@/lib/project/format';
import { dist, type V2 } from '@/lib/tools/geom';
import { SceneLabel } from '../labels';
import { MotorGroup } from '../MotorGroup';
import { useSceneInfo, type Measurement } from '../sceneInfo';
import { SnapMarker } from './markers';
import { resolvePoint, type ToolEnv } from './env';
import { useHint, useKey } from './hooks';
import { usePlanePointer } from './pointer';
import type { SnapResult } from '@/lib/tools/snap';

function MeasureLine({ m, live = false }: { m: Measurement; live?: boolean }) {
  const d = dist(m.a, m.b);
  const z = m.z + 0.06;
  const color = live ? '#f59e0b' : '#0369a1';
  const dx = m.b[0] - m.a[0];
  const dy = m.b[1] - m.a[1];
  const l = d || 1;
  const nx = (-dy / l) * 0.08;
  const ny = (dx / l) * 0.08;
  const tick = (p: V2): [number, number, number][] => [[p[0] - nx, p[1] - ny, z], [p[0] + nx, p[1] + ny, z]];
  return (
    <group>
      <Line points={[[m.a[0], m.a[1], z], [m.b[0], m.b[1], z]]} color={color} lineWidth={2.5} depthTest={false} renderOrder={985} />
      <Line points={tick(m.a)} color={color} lineWidth={2.5} depthTest={false} renderOrder={985} />
      <Line points={tick(m.b)} color={color} lineWidth={2.5} depthTest={false} renderOrder={985} />
      <SceneLabel position={[(m.a[0] + m.b[0]) / 2, (m.a[1] + m.b[1]) / 2, z]} tone={live ? 'live' : 'hint'} offsetY={-14}>
        {fmt(d)} m
      </SceneLabel>
    </group>
  );
}

/** Medidas persistentes (ficam até Esc com a ferramenta Medir). Renderizadas em qualquer ferramenta. */
export function MeasurementsLayer() {
  const items = useSceneInfo((s) => s.measurements);
  if (items.length === 0) return null;
  return (
    <MotorGroup>
      {items.map((m, i) => (
        <MeasureLine key={i} m={m} />
      ))}
    </MotorGroup>
  );
}

/** Medir: dois cliques medem a distância; Esc limpa pendência e depois todas as medidas. */
export function MeasureTool({ env }: { env: ToolEnv }) {
  const [a, setA] = useState<V2 | null>(null);
  const aRef = useRef<V2 | null>(null);
  aRef.current = a;
  const [cur, setCur] = useState<{ snap: SnapResult; mpp: number } | null>(null);
  const z = env.elevation;

  usePlanePointer(
    {
      onMove: (e) => setCur({ snap: resolvePoint(env, e.p, { alt: e.alt, shift: e.shift, mpp: e.mpp, anchor: aRef.current }), mpp: e.mpp }),
      onClick: (e) => {
        const s = resolvePoint(env, e.p, { alt: e.alt, shift: e.shift, mpp: e.mpp, anchor: aRef.current });
        const first = aRef.current;
        if (!first) {
          setA(s.point);
          return;
        }
        if (dist(first, s.point) < 0.01) return;
        const st = useSceneInfo.getState();
        st.setMeasurements([...st.measurements, { a: first, b: s.point, z }]);
        setA(null);
      },
      onLeave: () => setCur(null),
    },
    { enabled: true, z },
  );
  useKey(['Escape'], () => {
    if (aRef.current) {
      setA(null);
      return true;
    }
    if (useSceneInfo.getState().measurements.length > 0) {
      useSceneInfo.getState().setMeasurements([]);
      return true;
    }
    return false;
  });
  useHint(a ? 'Clique no segundo ponto · Shift ortogonal · Esc cancela' : 'Clique em dois pontos para medir · Esc limpa as medidas');

  return (
    <MotorGroup>
      {cur ? <SnapMarker point={cur.snap.point} kind={cur.snap.kind} z={z} mpp={cur.mpp} /> : null}
      {a && cur ? <MeasureLine m={{ a, b: cur.snap.point, z }} live /> : null}
      {a ? <SnapMarker point={a} kind="endpoint" z={z} mpp={cur?.mpp ?? 0.01} showLabel={false} /> : null}
    </MotorGroup>
  );
}
