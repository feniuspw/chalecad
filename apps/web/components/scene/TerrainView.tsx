'use client';
import { useEffect, useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { TerrainReport } from '@chalecad/engine';
import { buildTerrainBuffers, terrainZOffset } from '@/lib/three/terrain';
import { MotorGroup } from './MotorGroup';

/** Granulado de grama/terra (multiplica a cor por vértice). Tile de 4 m (uv = metros / 4). */
function makeGrainTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5000; i++) {
    const v = 200 + Math.random() * 55;
    g.fillStyle = `rgba(${v * 0.78},${v * 0.9},${v * 0.6},${0.1 + Math.random() * 0.25})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2.5, 1 + Math.random() * 2.5);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export interface TerrainViewProps {
  terrain: TerrainReport;
  /** Contorno do platô (planta) para destacar o terreno plano em volta da casa. */
  plateau?: [number, number][];
}

/** Malha do terreno: z do motor para cima; o platô fica em z = 0 (deslocada por `-platformZ`). */
export function TerrainView({ terrain, plateau }: TerrainViewProps) {
  const geometry = useMemo(() => {
    const b = buildTerrainBuffers(terrain.mesh, 0.25);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(b.positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(b.colors, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(b.uvs, 2));
    g.setIndex(new THREE.BufferAttribute(b.indices, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }, [terrain.mesh]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const tex = useMemo(() => makeGrainTexture(), []);
  useEffect(() => () => tex.dispose(), [tex]);
  const z = terrainZOffset(terrain.platformZ);

  return (
    <MotorGroup position={[0, 0, z]}>
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial vertexColors map={tex} roughness={1} metalness={0} side={THREE.DoubleSide} />
      </mesh>
      {plateau ? (
        <group position={[0, 0, -z - 0.03 + 0.012]}>
          {/* platô: tira sutil mais clara e contorno */}
          <Line points={[...plateau, plateau[0]!].map(([x, y]) => [x, y, 0.0] as [number, number, number])} color="#f5f0e6" lineWidth={1.5} transparent opacity={0.9} />
        </group>
      ) : null}
    </MotorGroup>
  );
}
