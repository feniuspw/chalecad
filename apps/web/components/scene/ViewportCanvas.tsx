'use client';
import { useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Grid, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { bboxToThree, viewDirection, type ThreeBounds, type ViewPreset } from '@/lib/three/convert';
import { BuildingView } from './BuildingView';
import type { ViewportHandle, ViewportProps } from './types';

type Controls = React.ComponentRef<typeof OrbitControls>;

interface RigProps {
  bounds: ThreeBounds;
  showcase: boolean;
  apiRef?: ViewportProps['apiRef'];
}

/** Câmera: enquadramento automático pelo bbox, vistas pré-definidas e transição suave. */
function CameraRig({ bounds, showcase, apiRef }: RigProps) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const controls = useRef<Controls>(null);
  const goal = useRef<{ pos: THREE.Vector3; look: THREE.Vector3; active: boolean }>({
    pos: new THREE.Vector3(),
    look: new THREE.Vector3(),
    active: false,
  });
  const view = useRef<ViewPreset>('3d');
  const placed = useRef(false);

  const frame = useCallback(
    (v: ViewPreset, animate: boolean) => {
      view.current = v;
      const dir = new THREE.Vector3(...viewDirection(v)).normalize();
      const fov = THREE.MathUtils.degToRad(camera.fov);
      const aspect = size.width / Math.max(1, size.height);
      // Distância para caber a esfera que envolve a edificação; em telas estreitas afasta mais.
      let dist = (bounds.radius / Math.sin(fov / 2)) * (showcase ? 0.78 : 0.88);
      dist /= Math.min(1, aspect * 0.85);
      const look = new THREE.Vector3(...bounds.center);
      look.y -= bounds.size[1] * 0.08; // um pouco abaixo do centro: o telhado pesa visualmente
      const pos = look.clone().add(dir.multiplyScalar(dist));
      const g = goal.current;
      g.pos.copy(pos);
      g.look.copy(look);
      if (animate) {
        g.active = true;
      } else {
        camera.position.copy(pos);
        controls.current?.target.copy(look);
        controls.current?.update();
        g.active = false;
      }
    },
    [bounds, camera, showcase, size.width, size.height],
  );

  useImperativeHandle(
    apiRef,
    (): ViewportHandle => ({
      center: () => frame(view.current, true),
      setView: (v) => frame(v, true),
    }),
    [frame],
  );

  // Primeiro enquadramento sem animação, assim que os controles existem.
  const setControls = useCallback(
    (c: Controls | null) => {
      controls.current = c;
      if (c && !placed.current) {
        placed.current = true;
        frame('3d', false);
        c.addEventListener('start', () => {
          goal.current.active = false;
        });
      }
    },
    [frame],
  );

  useFrame((_, dt) => {
    const g = goal.current;
    const c = controls.current;
    if (!g.active || !c) return;
    const k = 1 - Math.exp(-7 * Math.min(dt, 0.05));
    camera.position.lerp(g.pos, k);
    c.target.lerp(g.look, k);
    c.update();
    if (camera.position.distanceTo(g.pos) < 0.005 && c.target.distanceTo(g.look) < 0.005) g.active = false;
  });

  return (
    <OrbitControls
      ref={setControls}
      makeDefault
      enableDamping
      dampingFactor={0.09}
      maxPolarAngle={Math.PI / 2 - 0.02}
      minDistance={1.5}
      maxDistance={Math.max(30, bounds.radius * 8)}
      enablePan={!showcase}
      enableZoom={!showcase}
      enableRotate={!showcase}
      autoRotate={showcase}
      autoRotateSpeed={0.7}
      zoomToCursor
    />
  );
}

function Lights({ bounds }: { bounds: ThreeBounds }) {
  const r = Math.max(bounds.radius, 3);
  const sun = useRef<THREE.DirectionalLight>(null);
  const pos: [number, number, number] = [bounds.center[0] + r * 1.1, bounds.center[1] + r * 1.9, bounds.center[2] + r * 0.9];
  return (
    <>
      <hemisphereLight args={['#e3eefa', '#d8d0c2', 1.4]} />
      <directionalLight
        ref={sun}
        position={pos}
        intensity={2.3}
        color="#fff3e0"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.03}
        shadow-radius={4}
        shadow-camera-left={-r * 1.5}
        shadow-camera-right={r * 1.5}
        shadow-camera-top={r * 1.5}
        shadow-camera-bottom={-r * 1.5}
        shadow-camera-near={0.5}
        shadow-camera-far={r * 8}
        target-position={bounds.center}
      />
    </>
  );
}

function Ground({ bounds, signature }: { bounds: ThreeBounds; signature: string }) {
  const y = bounds.min[1];
  const span = Math.max(bounds.size[0], bounds.size[2]);
  return (
    <>
      <Grid
        position={[0, y, 0]}
        infiniteGrid
        cellSize={0.1}
        cellThickness={0.5}
        cellColor="#d6d3d1"
        sectionSize={1}
        sectionThickness={1.1}
        sectionColor="#a8a29e"
        fadeDistance={Math.max(28, span * 3.2)}
        fadeStrength={1.6}
        fadeFrom={1}
        side={THREE.DoubleSide}
      />
      {/* recebe só a sombra do sol */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y + 0.002, 0]} receiveShadow renderOrder={1}>
        <planeGeometry args={[span * 6, span * 6]} />
        <shadowMaterial opacity={0.16} transparent depthWrite={false} />
      </mesh>
      <ContactShadows
        key={signature}
        position={[bounds.center[0], y + 0.004, bounds.center[2]]}
        scale={span * 2}
        width={span * 2}
        height={span * 2}
        far={2.5}
        blur={2.6}
        opacity={0.4}
        resolution={1024}
        frames={1}
        color="#3b2f20"
      />
    </>
  );
}

export default function ViewportCanvas({
  model,
  showcase = false,
  highlight,
  onSelectHost,
  hoverable = true,
  apiRef,
}: ViewportProps) {
  const bounds = useMemo(() => bboxToThree(model.bbox), [model.bbox]);
  const signature = useMemo(() => `${model.walls.length}-${model.roofPlanes.length}-${JSON.stringify(model.bbox)}`, [model]);
  const [selected, setSelected] = useState<string | null>(null);

  const interactive = hoverable && !showcase;
  const hostIds = useMemo(() => {
    const ids = new Set(highlight?.hostIds ?? []);
    if (selected) ids.add(selected);
    return { hostIds: [...ids] };
  }, [highlight, selected]);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 35, near: 0.1, far: 600, position: [12, 9, 12] }}
      gl={{ antialias: true, alpha: true }}
      onPointerMissed={() => {
        if (!interactive) return;
        setSelected(null);
        onSelectHost?.(null);
      }}
      className={showcase ? 'pointer-events-none' : undefined}
    >
      <CameraRig bounds={bounds} showcase={showcase} apiRef={apiRef} />
      <Lights bounds={bounds} />
      <Ground bounds={bounds} signature={signature} />
      <BuildingView
        model={model}
        highlight={hostIds}
        hoverable={interactive}
        onSelectHost={(id) => {
          setSelected(id);
          onSelectHost?.(id);
        }}
      />
    </Canvas>
  );
}
