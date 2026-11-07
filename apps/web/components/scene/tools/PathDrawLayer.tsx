'use client';
import { useEffect, useRef, useState } from 'react';
import { Line } from '@react-three/drei';
import type { BuildingModel, Vec2 } from '@chalecad/engine';
import { fmt } from '@/lib/project/format';
import { dist, type V2 } from '@/lib/tools/geom';
import type { SnapResult } from '@/lib/tools/snap';
import { useEditor } from '@/lib/store/editor';
import { SceneLabel } from '../labels';
import { MotorGroup } from '../MotorGroup';
import { useSceneInfo } from '../sceneInfo';
import { ElasticWall, SnapMarker } from './markers';
import { resolvePoint, SNAP_PX, useToolEnv } from './env';
import { useHint, useKey } from './hooks';
import { usePlanePointer } from './pointer';

/**
 * Desenho de caminho em planta (cerca, muro), acionado por `PathDrawer`. Clique adiciona pontos; clicar no primeiro
 * ponto (3+ pontos) fecha; Enter ou duplo clique conclui aberto; Backspace remove o último; Esc cancela.
 */
function PathDrawSession({ model }: { model: BuildingModel }) {
  const request = useSceneInfo((s) => s.pathDraw)!;
  const env = useToolEnv(model);
  const [pts, setPts] = useState<V2[]>([]);
  const ptsRef = useRef<V2[]>([]);
  ptsRef.current = pts;
  const [cur, setCur] = useState<{ snap: SnapResult; mpp: number; closing: boolean } | null>(null);
  const z = 0;

  const finish = (closed: boolean) => {
    const p = ptsRef.current;
    const min = closed ? 3 : 2;
    if (p.length < min) return;
    request.onComplete(p.map((v) => [v[0], v[1]] as Vec2), closed);
  };

  usePlanePointer(
    {
      onMove: (e) => {
        const anchor = ptsRef.current[ptsRef.current.length - 1] ?? null;
        const snap = resolvePoint(env, e.p, { alt: e.alt, shift: e.shift, mpp: e.mpp, anchor });
        const first = ptsRef.current[0];
        const closing = !!first && ptsRef.current.length >= 3 && dist(first, e.p) < SNAP_PX * e.mpp;
        setCur({ snap: closing && first ? { point: first, kind: 'endpoint' } : snap, mpp: e.mpp, closing });
      },
      onClick: (e) => {
        const p = ptsRef.current;
        const first = p[0];
        if (first && p.length >= 3 && dist(first, e.p) < SNAP_PX * e.mpp) {
          finish(true);
          return;
        }
        const s = resolvePoint(env, e.p, { alt: e.alt, shift: e.shift, mpp: e.mpp, anchor: p[p.length - 1] ?? null });
        const last = p[p.length - 1];
        if (last && dist(last, s.point) < 0.05) return;
        setPts([...p, s.point]);
      },
      onDoubleClick: () => finish(false),
      onLeave: () => setCur(null),
    },
    { enabled: true, z },
  );
  useKey(['Escape'], () => {
    request.onCancel();
    return true;
  });
  useKey(['Enter'], () => {
    if (ptsRef.current.length < 2) return false;
    finish(false);
    return true;
  });
  useKey(['Backspace'], () => {
    if (ptsRef.current.length === 0) return false;
    setPts((p) => p.slice(0, -1));
    return true;
  });
  useHint(pts.length === 0 ? 'Clique para iniciar o caminho · Shift ortogonal · Alt sem snap' : 'Clique para adicionar · Enter/duplo clique conclui · clique no 1º ponto fecha · Backspace volta · Esc cancela');

  const last = pts[pts.length - 1];
  return (
    <MotorGroup>
      {pts.length > 1 ? <Line points={pts.map((p) => [p[0], p[1], z + 0.04] as [number, number, number])} color="#d97706" lineWidth={2.5} depthTest={false} renderOrder={990} /> : null}
      {pts.slice(1).map((p, i) => {
        const a = pts[i]!;
        return (
          <SceneLabel key={i} position={[(a[0] + p[0]) / 2, (a[1] + p[1]) / 2, z + 0.06]} tone="hint" offsetY={-14}>
            {fmt(dist(a, p))} m
          </SceneLabel>
        );
      })}
      {last && cur ? (
        <>
          <ElasticWall a={last} b={cur.snap.point} z={z} thickness={0.08} />
          <SceneLabel position={[(last[0] + cur.snap.point[0]) / 2, (last[1] + cur.snap.point[1]) / 2, z + 0.08]} tone="live" offsetY={-14}>
            {fmt(dist(last, cur.snap.point))} m
          </SceneLabel>
        </>
      ) : null}
      {pts.map((p, i) => (
        <SnapMarker key={i} point={p} kind="endpoint" z={z} mpp={cur?.mpp ?? 0.01} showLabel={false} />
      ))}
      {cur ? <SnapMarker point={cur.snap.point} kind={cur.closing ? 'corner' : cur.snap.kind} z={z} mpp={cur.mpp} /> : null}
    </MotorGroup>
  );
}

export function PathDrawLayer({ model }: { model: BuildingModel }) {
  const active = useSceneInfo((s) => s.pathDraw !== null);
  const view = useEditor((s) => s.cameraView);
  useEffect(() => {
    if (active && view !== '3d' && view !== 'plan') useEditor.getState().setCameraView('plan');
  }, [active, view]);
  if (!active || (view !== '3d' && view !== 'plan')) return null;
  return <PathDrawSession model={model} />;
}
