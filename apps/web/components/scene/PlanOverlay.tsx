'use client';
import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { BuildingModel, HostWall, ResolvedOpening, RoomModel } from '@chalecad/engine';
import { useEditor } from '@/lib/store/editor';
import { ROOM_FILL, roomLabel, roomLabelPoint } from '@/lib/plan2d/rooms';
import { dimGeometry, solidIntervals, wallDimensions } from '@/lib/tools/dimensions';
import { PLAN_CUT_HEIGHT } from '@/lib/three/views';
import { wallBasis } from '@/lib/three/convert';
import { basisTransform, makeShape } from './geometry';
import { SceneLabel } from './labels';
import { MotorGroup } from './MotorGroup';
import { useFurnitureAlertLevels, useFurnitureModels } from './furnitureData';
import { PlanFurniture } from './PlanFurniture';
import type { WallLike } from './tools/furnitureDrag';

const POCHE = '#3f3b37';

/** Cômodo na planta: preenchimento suave por uso e rótulo "Nome · área" no ponto mais interno. */
function PlanRoom({ room, z }: { room: RoomModel; z: number }) {
  const selected = useEditor((s) => s.selection?.kind === 'room' && s.selection.id === room.id);
  const selectable = useEditor((s) => s.tool === 'select');
  const select = useEditor((s) => s.select);
  const polygon = room.polygon as [number, number][];
  const geometry = useMemo(() => new THREE.ShapeGeometry(makeShape(polygon, [])), [polygon]);
  const label = useMemo(() => roomLabelPoint(polygon).point, [polygon]);
  const pts = useMemo<[number, number, number][]>(() => [...polygon, polygon[0]!].map(([x, y]) => [x, y, z + 0.002]), [polygon, z]);
  return (
    <group>
      <mesh
        geometry={geometry}
        position={[0, 0, z]}
        renderOrder={2}
        onClick={
          selectable
            ? (e) => {
                if (e.delta > 4) return;
                e.stopPropagation();
                select({ kind: 'room', id: room.id });
              }
            : undefined
        }
      >
        <meshBasicMaterial color={ROOM_FILL[room.use]} transparent opacity={selected ? 0.8 : 0.55} depthWrite={false} toneMapped={false} />
      </mesh>
      {selected ? <Line points={pts} color="#d97706" lineWidth={2.5} /> : null}
      <SceneLabel position={[label[0], label[1], z + 0.01]}>{roomLabel(room)}</SceneLabel>
    </group>
  );
}

function WallPoche({ wall, openings }: { wall: HostWall; openings: ResolvedOpening[] }) {
  const t = useMemo(() => basisTransform(wallBasis(wall)), [wall]);
  const own = useMemo(() => openings.filter((o) => o.valid && o.hostKind === 'wall' && o.hostId === wall.id), [openings, wall.id]);
  const solid = useMemo(() => solidIntervals(wall.length, own, PLAN_CUT_HEIGHT), [wall.length, own]);
  const inward = wall.exteriorSide === 'right' ? -1 : wall.exteriorSide === 'left' ? 1 : 1;
  const cut = PLAN_CUT_HEIGHT + 0.01;
  return (
    <group position={t.position} quaternion={t.quaternion}>
      {solid.map(([a, b], i) => (
        <mesh key={i} position={[(a + b) / 2, cut, 0]} renderOrder={5}>
          <boxGeometry args={[b - a, 0.004, wall.thickness]} />
          <meshBasicMaterial color={POCHE} toneMapped={false} />
        </mesh>
      ))}
      {own.map((o) => {
        const w = o.u1 - o.u0;
        if (o.v0 >= PLAN_CUT_HEIGHT || o.v1 <= PLAN_CUT_HEIGHT) return null;
        if (o.type === 'door') {
          const pts: [number, number, number][] = [[o.u0, cut + 0.01, 0]];
          pts.push([o.u0, cut + 0.01, inward * w]);
          for (let k = 0; k <= 12; k++) {
            const a = (k / 12) * (Math.PI / 2);
            pts.push([o.u0 + w * Math.cos(a), cut + 0.01, inward * w * Math.sin(a)]);
          }
          return <Line key={o.id} points={pts} color="#8b5e34" lineWidth={1.2} />;
        }
        const color = o.type === 'skylight' ? '#94a3b8' : '#38bdf8';
        return (
          <mesh key={o.id} position={[(o.u0 + o.u1) / 2, cut + 0.005, 0]} renderOrder={6}>
            <boxGeometry args={[w, 0.004, Math.max(0.03, wall.thickness * 0.3)]} />
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
}

/** Planta baixa: paredes cortadas (poche), vãos e cotas automáticas do nível ativo. */
export function PlanOverlay({ model, level, elevation }: { model: BuildingModel; level: string; elevation: number }) {
  const walls = useMemo(() => model.walls.filter((w) => w.level === level), [model.walls, level]);
  const dims = useMemo(() => wallDimensions(model.walls, model.openings, level), [model.walls, model.openings, level]);
  const z = elevation + PLAN_CUT_HEIGHT + 0.04;
  const rooms = useMemo(() => model.rooms.filter((r) => r.level === level && r.polygon && r.polygon.length >= 3), [model.rooms, level]);
  const furniture = useEditor((s) => s.project.furniture);
  const furnitureModels = useFurnitureModels();
  const alerts = useFurnitureAlertLevels();
  const selectedFurniture = useEditor((s) => (s.selection?.kind === 'furniture' ? s.selection.id : null));
  const select = useEditor((s) => s.tool === 'select');
  const levelWalls = useMemo(() => model.walls.filter((w) => w.level === level) as unknown as WallLike[], [model.walls, level]);
  return (
    <MotorGroup>
      {rooms.map((r) => (
        <PlanRoom key={r.id} room={r} z={elevation + 0.006} />
      ))}
      {furniture.some((f) => f.level === level) ? (
        <PlanFurniture models={furnitureModels} furniture={furniture} walls={levelWalls} level={level} selectedId={selectedFurniture} alerts={alerts} interactive={select} />
      ) : null}
      {walls.map((w) => (
        <WallPoche key={w.id} wall={w} openings={model.openings} />
      ))}
      {dims.map((d) => {
        const g = dimGeometry(d);
        const ext = (p: [number, number], a: [number, number]): [number, number, number][] => {
          const dx = d.normal[0] * 0.08;
          const dy = d.normal[1] * 0.08;
          return [[a[0] + dx * 1.2, a[1] + dy * 1.2, z], [p[0] + dx, p[1] + dy, z]];
        };
        return (
          <group key={d.id}>
            <Line points={[[g.p0[0], g.p0[1], z], [g.p1[0], g.p1[1], z]]} color={d.kind === 'overall' ? '#57534e' : '#78716c'} lineWidth={1} />
            <Line points={ext(g.p0, d.a)} color="#a8a29e" lineWidth={0.8} />
            <Line points={ext(g.p1, d.b)} color="#a8a29e" lineWidth={0.8} />
            {d.value >= 0.3 ? (
              <SceneLabel position={[g.text[0], g.text[1], z]}>{d.label}</SceneLabel>
            ) : null}
          </group>
        );
      })}
    </MotorGroup>
  );
}

export const planClipPlane = (elevation: number) => new THREE.Plane(new THREE.Vector3(0, -1, 0), elevation + PLAN_CUT_HEIGHT);
