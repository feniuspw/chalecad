'use client';
import { useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import type { BuildingModel } from '@chalecad/engine';
import { bboxToThree, type ThreeBounds } from '@/lib/three/convert';
import { useEditor } from '@/lib/store/editor';
import { BuildingView } from './BuildingView';
import { EditorScene } from './EditorScene';
import type { ViewportProps } from './types';
import { ContactShadows, Grid } from '@react-three/drei';
import { viewDirection } from '@/lib/three/convert';

/** Props opcionais de controle externo, mantidas por compatibilidade: no editor a cena lê o store diretamente. */
export interface ControlledViewportProps {
  selectedId?: string | null;
  hoverId?: string | null;
  onHoverHost?: (id: string | null) => void;
}

/** Vitrine (página inicial): câmera fixa girando, sem interação. */
function ShowcaseRig({ bounds }: { bounds: ThreeBounds }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const placed = useRef(false);
  const target = useMemo(() => {
    const look = new THREE.Vector3(...bounds.center);
    look.y -= bounds.size[1] * 0.08;
    return look;
  }, [bounds]);
  useFrame(() => {
    if (placed.current) return;
    placed.current = true;
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const aspect = size.width / Math.max(1, size.height);
    const dist = ((bounds.radius / Math.sin(fov / 2)) * 0.78) / Math.min(1, aspect * 0.85);
    camera.position.copy(target).add(new THREE.Vector3(...viewDirection('3d')).normalize().multiplyScalar(dist));
    camera.lookAt(target);
  });
  return (
    <>
      <PerspectiveCamera makeDefault fov={35} near={0.1} far={600} position={[12, 9, 12]} />
      <OrbitControls makeDefault target={target} autoRotate autoRotateSpeed={0.7} enablePan={false} enableZoom={false} enableRotate={false} />
    </>
  );
}

function ShowcaseLights({ bounds }: { bounds: ThreeBounds }) {
  const r = Math.max(bounds.radius, 3);
  return (
    <>
      <hemisphereLight args={['#e3eefa', '#d8d0c2', 1.4]} />
      <directionalLight
        position={[bounds.center[0] + r * 1.1, bounds.center[1] + r * 1.9, bounds.center[2] + r * 0.9]}
        intensity={2.3}
        color="#fff3e0"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.03}
        shadow-camera-left={-r * 1.5}
        shadow-camera-right={r * 1.5}
        shadow-camera-top={r * 1.5}
        shadow-camera-bottom={-r * 1.5}
        shadow-camera-near={0.5}
        shadow-camera-far={r * 8}
      />
      <Grid position={[0, bounds.min[1], 0]} infiniteGrid cellSize={0.1} cellThickness={0.5} cellColor="#d6d3d1" sectionSize={1} sectionThickness={1.1} sectionColor="#a8a29e" fadeDistance={28} fadeStrength={1.6} side={THREE.DoubleSide} />
      <ContactShadows position={[bounds.center[0], bounds.min[1] + 0.004, bounds.center[2]]} scale={bounds.radius * 4} width={bounds.radius * 4} height={bounds.radius * 4} far={2.5} blur={2.6} opacity={0.4} resolution={1024} frames={1} color="#3b2f20" />
    </>
  );
}

export default function ViewportCanvas({ model, showcase = false, apiRef }: ViewportProps & ControlledViewportProps) {
  const bounds = useMemo(() => bboxToThree(model.bbox), [model.bbox]);
  const signature = useMemo(() => `${model.walls.length}-${model.roofPlanes.length}-${JSON.stringify(model.bbox)}`, [model]);

  if (showcase) {
    return (
      <Canvas shadows="percentage" dpr={[1, 2]} camera={{ fov: 35, near: 0.1, far: 600, position: [12, 9, 12] }} gl={{ antialias: true, alpha: true }} className="pointer-events-none">
        <ShowcaseRig bounds={bounds} />
        <ShowcaseLights bounds={bounds} />
        <BuildingView model={model} hoverable={false} />
      </Canvas>
    );
  }

  return (
    <Canvas
      frameloop="demand"
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ fov: 35, near: 0.1, far: 600, position: [12, 9, 12] }}
      gl={{ antialias: true, alpha: true }}
      onPointerMissed={() => {
        const s = useEditor.getState();
        if (s.tool === 'select') s.select(null);
      }}
    >
      <EditorScene model={model} bounds={bounds} apiRef={apiRef} signature={signature} />
    </Canvas>
  );
}

export type { BuildingModel };
