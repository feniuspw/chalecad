'use client';
import { useEffect, useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { TerrainReport } from '@chalecad/engine';
import { fmt } from '@/lib/project/format';
import { buildWallPrisms, terrainZOffset, WALL_COLORS, wallCoping, wallThickness, type Prism } from '@/lib/three/terrain';
import { useTerrainUi } from './tools/terrain/store';
import { SceneLabel } from './labels';
import { MotorGroup } from './MotorGroup';

function toGeometry(p: Prism): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p.positions, 3));
  g.setIndex(new THREE.BufferAttribute(p.indices, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

function Wall({ wall, selected }: { wall: TerrainReport['walls'][number]; selected: boolean }) {
  const thickness = wallThickness(wall.type, wall.maxHeight);
  const body = useMemo(() => toGeometry(buildWallPrisms(wall, thickness)), [wall, thickness]);
  const cap = useMemo(() => {
    const c = wallCoping(wall, thickness);
    return c ? toGeometry(c) : null;
  }, [wall, thickness]);
  useEffect(() => () => body.dispose(), [body]);
  useEffect(() => () => cap?.dispose(), [cap]);
  const color = WALL_COLORS[wall.type];
  const mid = wall.path[Math.floor(wall.path.length / 2)]!;
  const midTop = wall.topZ[Math.floor(wall.topZ.length / 2)]!;
  return (
    <group>
      <mesh geometry={body} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={wall.type === 'gabion' ? 1 : 0.9} metalness={0} emissive={selected ? '#f59e0b' : '#000000'} emissiveIntensity={selected ? 0.35 : 0} side={THREE.DoubleSide} />
      </mesh>
      {cap ? (
        <mesh geometry={cap} castShadow receiveShadow>
          <meshStandardMaterial color="#78716c" roughness={0.85} side={THREE.DoubleSide} />
        </mesh>
      ) : null}
      {selected ? (
        <>
          <Line points={wall.path.map((p, i) => [p[0], p[1], wall.topZ[i]! + 0.15] as [number, number, number])} color="#f59e0b" lineWidth={3} depthTest={false} renderOrder={992} />
          <SceneLabel position={[mid[0], mid[1], midTop + 0.4]} tone="live">
            {fmt(wall.length, 1)} m · até {fmt(wall.maxHeight)} m · {wall.type === 'block' ? 'bloco' : wall.type === 'concrete' ? 'concreto' : 'gabião'}
          </SceneLabel>
        </>
      ) : null}
    </group>
  );
}

/**
 * Muros de arrimo do terreno (`terrain.walls`): corpo de bloco, concreto ou gabião com topo e altura variáveis por
 * vértice e coroamento. No mesmo referencial do `TerrainView` (cota do platô em z = 0 descontada).
 */
export function TerrainWallsView({ terrain }: { terrain: TerrainReport }) {
  const selectedId = useTerrainUi((s) => s.selectedWallId);
  if (terrain.walls.length === 0) return null;
  return (
    <MotorGroup position={[0, 0, terrainZOffset(terrain.platformZ)]}>
      {terrain.walls.map((w) => (
        <Wall key={w.id} wall={w} selected={w.id === selectedId} />
      ))}
    </MotorGroup>
  );
}
