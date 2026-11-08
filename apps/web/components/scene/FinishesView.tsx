'use client';
import { useEffect, useMemo, type ReactNode } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { BuildingModel, Finishes, Room, RoomModel, RoofPlane } from '@chalecad/engine';
import * as THREE from 'three';
import { roofSlabParams } from '@/lib/three/convert';
import { FLOOR_PLATE, roomFloorZ, roomWallMesh } from '@/lib/three/finishes';
import { explodeGap } from '@/lib/three/views';
import type { ViewMode } from '@/lib/store/types';
import { ExplodeGroup } from './ExplodeGroup';
import { basisTransform, makeShape } from './geometry';
import { COLORS } from './materials';
import { usePbrProps, type PbrProps } from './usePbr';

export interface FinishesViewProps {
  model: BuildingModel;
  rooms: Room[];
  finishes: Finishes;
  mode?: ViewMode;
  clip?: THREE.Plane[];
  hoverable?: boolean;
  selectedRoomId?: string | null;
  onSelectRoom?: (id: string) => void;
}

function Dispose({ geometry }: { geometry: THREE.BufferGeometry | undefined }) {
  useEffect(() => () => geometry?.dispose(), [geometry]);
  return null;
}

/** Piso do cômodo: placa fina de 1 cm na cota do nível, com a textura do piso. */
function RoomFloor({ rm, room, z, clip, hoverable, selected, onSelect }: { rm: RoomModel; room: Room; z: number; clip?: THREE.Plane[]; hoverable: boolean; selected: boolean; onSelect?: (id: string) => void }) {
  const geometry = useMemo(() => {
    if (!rm.polygon || rm.polygon.length < 3) return undefined;
    return new THREE.ExtrudeGeometry(makeShape(rm.polygon as [number, number][], []), { depth: FLOOR_PLATE, bevelEnabled: false });
  }, [rm.polygon]);
  const pbr = usePbrProps(room.floor);
  if (!geometry || !pbr) return <Dispose geometry={geometry} />;
  return (
    <>
      <Dispose geometry={geometry} />
      <mesh
        geometry={geometry}
        position={[0, 0, z]}
        receiveShadow
        onClick={
          hoverable
            ? (e: ThreeEvent<MouseEvent>) => {
                if (e.delta > 4) return;
                e.stopPropagation();
                onSelect?.(room.id);
              }
            : undefined
        }
      >
        <meshStandardMaterial {...pbr} emissive={selected ? COLORS.accent : '#000000'} emissiveIntensity={selected ? 0.22 : 0} clippingPlanes={clip} />
      </mesh>
    </>
  );
}

/** Revestimento das paredes do cômodo (um painel por trecho com parede, recuado 2 mm da face interna). */
function RoomWalls({ rm, room, model, clip }: { rm: RoomModel; room: Room; model: BuildingModel; clip?: THREE.Plane[] }) {
  const geometry = useMemo(() => {
    if (!room.walls) return undefined;
    const m = roomWallMesh(rm, model.walls, model.openings, roomFloorZ(rm, model.walls, model.slabs));
    if (m.indices.length === 0) return undefined;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(m.positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(m.uvs, 2));
    g.setIndex(m.indices);
    g.computeVertexNormals();
    return g;
  }, [rm, room.walls, model.walls, model.openings, model.slabs]);
  const pbr = usePbrProps(room.walls);
  if (!geometry || !pbr) return <Dispose geometry={geometry} />;
  return (
    <>
      <Dispose geometry={geometry} />
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial {...pbr} side={THREE.DoubleSide} clippingPlanes={clip} />
      </mesh>
    </>
  );
}

/** Forro sob a água que também é parede (A-frame), 2 mm para dentro do plano da água. */
function RoofLining({ plane, model, pbr, clip }: { plane: RoofPlane; model: BuildingModel; pbr: PbrProps; clip?: THREE.Plane[] }) {
  const built = useMemo(() => {
    const p = roofSlabParams(plane, model.openings);
    return { geometry: new THREE.ShapeGeometry(makeShape(p.outline, p.holes)), ...basisTransform(p.basis) };
  }, [plane, model.openings]);
  return (
    <>
      <Dispose geometry={built.geometry} />
      <group position={built.position} quaternion={built.quaternion}>
        <mesh geometry={built.geometry} position={[0, 0, -0.002]} receiveShadow>
          {/* a face do forro olha para dentro (contra a normal externa da água) */}
          <meshStandardMaterial {...pbr} side={THREE.BackSide} clippingPlanes={clip} />
        </mesh>
      </group>
    </>
  );
}

/**
 * Acabamentos no 3D: piso e revestimento de parede por cômodo, e forro das águas do A-frame.
 * Vai dentro do referencial do motor (z para cima). Texturas e geometrias memorizadas por id e por `results`.
 */
export function FinishesView({ model, rooms, finishes, mode = 'finished', clip, hoverable = true, selectedRoomId = null, onSelectRoom }: FinishesViewProps) {
  const gap = explodeGap(model.ridgeHeight);
  const exploded = mode === 'exploded';
  const lining = usePbrProps(finishes.interiorRoof);
  const linedPlanes = useMemo(() => model.roofPlanes.filter((p) => p.isWall), [model.roofPlanes]);
  const pairs = useMemo(
    () =>
      model.rooms
        .map((rm) => ({ rm, room: rooms.find((r) => r.id === rm.id) }))
        .filter((x): x is { rm: RoomModel; room: Room } => !!x.room && !!x.rm.polygon),
    [model.rooms, rooms],
  );
  if (mode === 'skeleton' || mode === 'heatmap') return null;
  const layer = (l: 'closure' | 'roof' | 'structure', children: ReactNode) => (
    <ExplodeGroup layer={l} active={exploded} gap={gap}>
      {children}
    </ExplodeGroup>
  );
  return (
    <>
      {pairs.length > 0
        ? layer(
            'structure',
            pairs.map(({ rm, room }) => (
              <RoomFloor key={room.id} rm={rm} room={room} z={roomFloorZ(rm, model.walls, model.slabs)} clip={clip} hoverable={hoverable} selected={selectedRoomId === room.id} onSelect={onSelectRoom} />
            )),
          )
        : null}
      {pairs.length > 0
        ? layer(
            'closure',
            pairs.map(({ rm, room }) => <RoomWalls key={room.id} rm={rm} room={room} model={model} clip={clip} />),
          )
        : null}
      {lining && linedPlanes.length > 0
        ? layer(
            'roof',
            linedPlanes.map((p) => <RoofLining key={p.id} plane={p} model={model} pbr={lining} clip={clip} />),
          )
        : null}
    </>
  );
}
