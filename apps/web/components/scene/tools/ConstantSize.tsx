'use client';
import { useRef, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/** Grupo cujo tamanho na tela é constante (px): alças e marcadores. `px` = raio desejado em pixels. */
export function ConstantSize({ position, px = 1, children }: { position: [number, number, number]; px?: number; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const v = useRef(new THREE.Vector3());
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    let mpp: number;
    if ((camera as THREE.OrthographicCamera).isOrthographicCamera) mpp = 1 / (camera as THREE.OrthographicCamera).zoom;
    else {
      g.getWorldPosition(v.current);
      mpp = (2 * camera.position.distanceTo(v.current) * Math.tan(THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov) / 2)) / Math.max(1, size.height);
    }
    const s = mpp * px;
    if (Math.abs(g.scale.x - s) > 1e-6) g.scale.setScalar(s);
  });
  return (
    <group ref={ref} position={position}>
      {children}
    </group>
  );
}
