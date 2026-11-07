'use client';
import { useMemo, useRef, useState } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { toast } from 'sonner';
import { constants } from '@chalecad/catalog';
import { useEditor } from '@/lib/store/editor';
import { groundLevel, upperLevel } from '@/lib/project/edit';
import { newId } from '@/lib/project/ids';
import { STAIR_LABELS } from '@/lib/project/labels';
import { pointInPolygon, round, type V2 } from '@/lib/tools/geom';
import { nextRotation, positionForCursor, stairFootprint } from '@/lib/tools/stair';
import { SceneLabel } from '../labels';
import { MotorGroup } from '../MotorGroup';
import { makeSnap, type ToolEnv } from './env';
import { useHint, useKey } from './hooks';
import { usePlanePointer } from './pointer';

export const STAIR_WIDTH = 0.8;

/** Prévia da escada seguindo o cursor no térreo. R gira 90°; clique cria ligando térreo ao primeiro nível acima. */
export function StairTool({ env }: { env: ToolEnv }) {
  const ground = groundLevel(env.project);
  const upper = upperLevel(env.project);
  const [rot, setRot] = useState(0);
  const rotRef = useRef(0);
  rotRef.current = rot;
  const [cur, setCur] = useState<V2 | null>(null);
  const z = ground.elevation;
  const type = env.options.stairType;
  const width = type === 'ladder' ? 0.5 : STAIR_WIDTH;
  const rise = upper ? upper.elevation - ground.elevation : 2.8;

  const draft = (cursor: V2, r: number) => ({ type, rotationDeg: r, width, turnRight: true, position: positionForCursor(cursor, r, width) });
  const compute = (raw: V2, alt: boolean, mpp: number) => makeSnap(env, raw, { alt, mpp, segments: [], corners: [] }).point;

  usePlanePointer(
    {
      onMove: (e) => setCur(compute(e.p, e.alt, e.mpp)),
      onClick: (e) => {
        if (!upper) {
          toast.info('Crie o mezanino antes de posicionar a escada (ferramenta Mezanino).', { id: 'stair-no-upper' });
          return;
        }
        const d = draft(compute(e.p, e.alt, e.mpp), rotRef.current);
        const fp = stairFootprint(d, rise, constants.stairs);
        if (!fp.every((q) => pointInPolygon(q, env.model.footprint as V2[]))) {
          toast.info('A escada precisa ficar dentro da edificação. Gire com R ou mova o cursor.', { id: 'stair-outside' });
          return;
        }
        const id = newId('s');
        useEditor.getState().update(`Inserir ${STAIR_LABELS[type].toLowerCase()}`, (p) => {
          p.stairs.push({ id, type, from: ground.id, to: upper.id, position: [round(d.position[0], 2), round(d.position[1], 2)], rotationDeg: d.rotationDeg, width, turnRight: true });
        });
        useEditor.getState().select({ kind: 'stair', id });
      },
      onLeave: () => setCur(null),
    },
    { enabled: true, z },
  );
  useKey(['r'], () => {
    setRot((r) => nextRotation(r));
    return true;
  });
  useHint(upper ? 'Clique para posicionar a escada · R gira 90° · Alt sem snap' : 'Sem mezanino: crie o mezanino (M) para posicionar a escada');

  const foot = useMemo(() => (cur ? stairFootprint(draft(cur, rot), rise, constants.stairs) : null), [cur, rot, rise, type, width]);
  const ok = !!foot && !!upper && foot.every((p) => pointInPolygon(p, env.model.footprint as V2[]));
  const fill = useMemo(() => {
    if (!foot) return null;
    return new THREE.ShapeGeometry(new THREE.Shape(foot.map((p) => new THREE.Vector2(p[0], p[1]))));
  }, [foot]);
  if (!foot || !fill) return null;
  const color = ok ? '#16a34a' : '#dc2626';
  const cx = foot.reduce((s, p) => s + p[0], 0) / foot.length;
  const cy = foot.reduce((s, p) => s + p[1], 0) / foot.length;
  return (
    <MotorGroup>
      <mesh geometry={fill} position={[0, 0, z + 0.04]} renderOrder={980}>
        <meshBasicMaterial color={color} transparent opacity={0.35} depthTest={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <Line points={[...foot, foot[0]!].map((p) => [p[0], p[1], z + 0.05] as [number, number, number])} color={color} lineWidth={2} depthTest={false} renderOrder={981} />
      <SceneLabel position={[cx, cy, z + 0.1]} tone={ok ? 'ok' : 'bad'}>
        {!upper ? 'Crie o mezanino primeiro' : ok ? STAIR_LABELS[type] : 'Fora da edificação'}
      </SceneLabel>
    </MotorGroup>
  );
}
