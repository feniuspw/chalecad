'use client';
import { useRef, useState } from 'react';
import { useEditor } from '@/lib/store/editor';
import { newId } from '@/lib/project/ids';
import { dist, round, type V2 } from '@/lib/tools/geom';
import type { SnapResult } from '@/lib/tools/snap';
import { fmt } from '@/lib/project/format';
import { SceneLabel } from '../labels';
import { MotorGroup } from '../MotorGroup';
import { ElasticWall, SnapMarker } from './markers';
import { resolvePoint, type ToolEnv } from './env';
import { useHint, useKey } from './hooks';
import { usePlanePointer } from './pointer';

const MIN_LEN = 0.1;

/** Parede interna: clique define o início, cliques seguintes encadeiam. Shift = ortogonal, Alt = sem snap, Esc/duplo clique encerra. */
export function WallTool({ env }: { env: ToolEnv }) {
  const [start, setStart] = useState<V2 | null>(null);
  const startRef = useRef<V2 | null>(null);
  startRef.current = start;
  const [cur, setCur] = useState<{ snap: SnapResult; mpp: number } | null>(null);
  const z = env.elevation;

  usePlanePointer(
    {
      onMove: (e) => setCur({ snap: resolvePoint(env, e.p, { alt: e.alt, shift: e.shift, mpp: e.mpp, anchor: startRef.current }), mpp: e.mpp }),
      onClick: (e) => {
        const s = resolvePoint(env, e.p, { alt: e.alt, shift: e.shift, mpp: e.mpp, anchor: startRef.current });
        const a = startRef.current;
        if (!a) {
          setStart(s.point);
          return;
        }
        if (dist(a, s.point) < MIN_LEN) return;
        const from: V2 = [round(a[0], 3), round(a[1], 3)];
        const to: V2 = [round(s.point[0], 3), round(s.point[1], 3)];
        const wet = useEditor.getState().toolOptions.wallWet;
        useEditor.getState().update('Desenhar parede', (d) => {
          d.walls.push({ id: newId('w'), level: env.levelId, from, to, ...(wet ? { wet: true } : {}) });
        });
        setStart(s.point);
      },
      onDoubleClick: () => setStart(null),
      onLeave: () => setCur(null),
    },
    { enabled: true, z },
  );
  useKey(['Escape'], () => {
    if (!startRef.current) return false;
    setStart(null);
    return true;
  });
  useHint(start ? 'Clique para a próxima parede · Shift ortogonal · Alt sem snap · Esc ou duplo clique encerra' : 'Clique para iniciar a parede · Alt desliga o snap');

  const end = cur?.snap.point ?? null;
  const len = start && end ? dist(start, end) : 0;
  return (
    <MotorGroup>
      {cur ? <SnapMarker point={cur.snap.point} kind={cur.snap.kind} z={z} mpp={cur.mpp} /> : null}
      {start && end && len > 0.001 ? (
        <>
          <ElasticWall a={start} b={end} z={z} thickness={0.11} />
          <SceneLabel position={[(start[0] + end[0]) / 2, (start[1] + end[1]) / 2, z + 0.05]} tone="live" offsetY={-16}>
            {fmt(len)} m
          </SceneLabel>
        </>
      ) : null}
      {start ? <SnapMarker point={start} kind="endpoint" z={z} mpp={cur?.mpp ?? 0.01} showLabel={false} /> : null}
    </MotorGroup>
  );
}
