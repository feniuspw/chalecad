'use client';
import { useEffect, useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { TerrainReport } from '@chalecad/engine';
import { mixHex, sunLight } from '@/lib/sun';
import { SCENARIOS } from '@/lib/three/foliage';
import { getTerrainBuffers } from '@/lib/three/presentationPrep';
import { terrainZOffset, TERRAIN_COLORS } from '@/lib/three/terrain';
import { useEditor } from '@/lib/store/editor';
import { padOutlinePoints } from '@/lib/three/terrain';
import { useTerrainUi } from './tools/terrain/store';
import { MotorGroup } from './MotorGroup';
import { usePresentationUi } from './presentationUi';
import { useSunState } from './useSunState';
import { usePbrProps } from './usePbr';

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
  /** Platô da casa e áreas aplainadas (`terrain.pads`): contorno desenhado sobre a malha. Omitido na apresentação. */
  pads?: TerrainReport['pads'];
}

/** Malha do terreno: z do motor para cima; o platô fica em z = 0 (deslocada por `-platformZ`). */
export function TerrainView({ terrain, pads }: TerrainViewProps) {
  const selectedPad = useTerrainUi((s) => s.selectedPadId);
  const presentation = useEditor((s) => s.viewMode === 'presentation');
  const scenario = usePresentationUi((s) => s.scenario);
  const sc = SCENARIOS[scenario];
  const elevation = useSunState().elevationDeg;
  const daylight = sunLight(elevation).daylight;
  // apresentação: a mesma grama (ou areia) procedural do cenário, tingida pelo cenário; o corte e o aterro entram como razão
  // entre a cor do terreno e a da grama
  const pbr = usePbrProps(presentation ? (sc.ground.texture === 'sand' ? 'sand' : 'grass') : undefined);
  const geometry = useMemo(() => {
    const b = getTerrainBuffers(terrain.mesh, presentation ? 1 : 0.25);
    const colors = presentation ? relativeColors(b.colors) : b.colors;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(b.positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(b.uvs, 2));
    g.setIndex(new THREE.BufferAttribute(b.indices, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }, [terrain.mesh, presentation]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const tex = useMemo(() => (presentation ? null : makeGrainTexture()), [presentation]);
  useEffect(() => () => tex?.dispose(), [tex]);
  const z = terrainZOffset(terrain.platformZ);
  const groundColor = mixHex(sc.ground.night, sc.ground.day, daylight);

  return (
    <MotorGroup position={[0, 0, z]}>
      <mesh geometry={geometry} receiveShadow>
        {presentation ? (
          // polygonOffset: o chão da paisagem passa por baixo da malha do lote sem brigar de profundidade
          <meshStandardMaterial
            key={pbr ? 'p' : 'n'}
            vertexColors
            color={groundColor}
            {...(pbr ?? { roughness: 1, metalness: 0 })}
            normalScale={pbr ? new THREE.Vector2(0.6, 0.6) : undefined}
            side={THREE.DoubleSide}
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
          />
        ) : (
          <meshStandardMaterial vertexColors map={tex} roughness={1} metalness={0} side={THREE.DoubleSide} />
        )}
      </mesh>
      {pads
        ? pads.map((pad) => (
            // contorno: a cota do pad (coordenadas do terreno) mais 1 cm, para não brigar com a malha
            <Line
              key={pad.id}
              points={padOutlinePoints(pad.polygon, pad.z + 0.012)}
              color={pad.id === selectedPad ? '#f59e0b' : pad.id === 'house' ? '#f5f0e6' : '#7dd3fc'}
              lineWidth={pad.id === selectedPad ? 2.5 : 1.5}
              transparent
              opacity={0.9}
            />
          ))
        : null}
    </MotorGroup>
  );
}

/** Cores por vértice do terreno divididas pela cor da grama: grama = 1, corte mais terroso, aterro mais claro. */
function relativeColors(colors: Float32Array): Float32Array {
  const g = TERRAIN_COLORS.grass;
  const out = new Float32Array(colors.length);
  for (let i = 0; i < colors.length; i += 3) {
    out[i] = Math.min(1.35, colors[i]! / g[0]);
    out[i + 1] = Math.min(1.35, colors[i + 1]! / g[1]);
    out[i + 2] = Math.min(1.35, colors[i + 2]! / g[2]);
  }
  return out;
}
