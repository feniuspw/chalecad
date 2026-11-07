'use client';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { SnapKind } from '@/lib/tools/snap';
import { SNAP_LABELS } from '@/lib/tools/snap';
import type { V2 } from '@/lib/tools/geom';
import { SceneLabel } from '../labels';

const KIND_COLOR: Record<SnapKind, string> = {
  corner: '#f59e0b',
  endpoint: '#f59e0b',
  midpoint: '#0ea5e9',
  modulation: '#8b5cf6',
  grid: '#78716c',
  none: '#a8a29e',
};

const ringGeo = new THREE.RingGeometry(0.7, 1, 28);
const dotGeo = new THREE.CircleGeometry(0.28, 14);
const squareGeo = new THREE.PlaneGeometry(1.6, 1.6);

/** Marcador de snap com tamanho constante na tela (`mpp` = metros por pixel). Mostra o tipo do snap. */
export function SnapMarker({ point, kind, z, mpp, showLabel = true }: { point: V2; kind: SnapKind; z: number; mpp: number; showLabel?: boolean }) {
  const color = KIND_COLOR[kind];
  const r = mpp * (kind === 'grid' || kind === 'none' ? 5 : 8);
  const label = SNAP_LABELS[kind];
  return (
    <group position={[point[0], point[1], z + 0.03]}>
      <group scale={r}>
        {kind === 'midpoint' ? (
          <mesh geometry={squareGeo} renderOrder={999}>
            <meshBasicMaterial color={color} transparent opacity={0.85} depthTest={false} toneMapped={false} />
          </mesh>
        ) : (
          <mesh geometry={ringGeo} renderOrder={999}>
            <meshBasicMaterial color={color} depthTest={false} toneMapped={false} />
          </mesh>
        )}
        <mesh geometry={dotGeo} renderOrder={999}>
          <meshBasicMaterial color={color} depthTest={false} toneMapped={false} />
        </mesh>
      </group>
      {showLabel && label && kind !== 'grid' ? (
        <SceneLabel position={[0, 0, 0]} tone="hint" offsetY={20}>
          {label}
        </SceneLabel>
      ) : null}
    </group>
  );
}

/** Parede elástica: linha + faixa translúcida na espessura. */
export function ElasticWall({ a, b, z, thickness = 0.1, color = '#f59e0b' }: { a: V2; b: V2; z: number; thickness?: number; color?: string }) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 1e-4) return null;
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  return (
    <group>
      <mesh position={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z + 0.02]} rotation={[0, 0, angle]} renderOrder={990}>
        <planeGeometry args={[len, thickness]} />
        <meshBasicMaterial color={color} transparent opacity={0.45} depthTest={false} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <Line points={[[a[0], a[1], z + 0.025], [b[0], b[1], z + 0.025]]} color={color} lineWidth={2} depthTest={false} renderOrder={991} />
    </group>
  );
}
