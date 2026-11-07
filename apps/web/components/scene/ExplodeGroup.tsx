'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import { layerOffset, type ExplodeLayer } from '@/lib/three/views';

/** Camada que desliza em z (motor) ao entrar/sair do modo explodido. Anima só enquanto precisa (frameloop sob demanda). */
export function ExplodeGroup({ layer, active, gap, children }: { layer: ExplodeLayer; active: boolean; gap: number; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const target = active ? layerOffset(layer, gap) : 0;

  useEffect(() => {
    invalidate();
  }, [target, invalidate]);

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const d = target - g.position.z;
    if (Math.abs(d) < 0.002) {
      g.position.z = target;
      return;
    }
    g.position.z += d * (1 - Math.exp(-6 * Math.min(dt, 0.05)));
    invalidate();
  });

  return <group ref={ref}>{children}</group>;
}
