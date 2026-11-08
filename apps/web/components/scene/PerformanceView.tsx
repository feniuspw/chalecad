'use client';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { BuildingModel, RainReport, SolarReport, Vec2 } from '@chalecad/engine';
import { SOLAR_OFFSET, rainTankPosition, rainTankSize, solarPlacement, slotTransform } from '@/lib/three/performance';

const FRAME_T = 0.035;
const GLASS_T = 0.012;

/** Painéis solares na água indicada pelo motor: dois InstancedMesh (moldura prata e vidro azul-escuro). */
export function SolarPanelsView({ model, solar, moduleArea }: { model: Pick<BuildingModel, 'roofPlanes'>; solar: SolarReport; moduleArea: number }) {
  const placed = useMemo(() => solarPlacement(model, solar, moduleArea), [model, solar, moduleArea]);
  const frame = useRef<THREE.InstancedMesh>(null);
  const glass = useRef<THREE.InstancedMesh>(null);
  const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const frameMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#c4c8cc', metalness: 0.8, roughness: 0.35 }), []);
  const glassMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#10213f', metalness: 0.3, roughness: 0.25 }), []);
  useEffect(() => () => {
    box.dispose();
    frameMat.dispose();
    glassMat.dispose();
  }, [box, frameMat, glassMat]);

  useLayoutEffect(() => {
    if (!placed || !frame.current || !glass.current) return;
    const { plane, layout } = placed;
    const u = new THREE.Vector3(...plane.uAxis).normalize();
    const v = new THREE.Vector3(...plane.vAxis).normalize();
    const n = new THREE.Vector3().crossVectors(u, v).normalize();
    const rot = new THREE.Matrix4().makeBasis(u, v, n);
    const q = new THREE.Quaternion().setFromRotationMatrix(rot);
    const m = new THREE.Matrix4();
    layout.slots.forEach((slot, i) => {
      const { position } = slotTransform(plane, slot, SOLAR_OFFSET);
      const p = new THREE.Vector3(...position);
      const up = n.clone();
      // moldura: base na altura do offset; vidro um pouco acima
      m.compose(p.clone().addScaledVector(up, FRAME_T / 2), q, new THREE.Vector3(slot.w, slot.h, FRAME_T));
      frame.current!.setMatrixAt(i, m);
      m.compose(p.clone().addScaledVector(up, FRAME_T + GLASS_T / 2 - 0.002), q, new THREE.Vector3(slot.w - 0.06, slot.h - 0.06, GLASS_T));
      glass.current!.setMatrixAt(i, m);
    });
    for (const mesh of [frame.current, glass.current]) {
      mesh.count = layout.slots.length;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [placed]);

  const count = placed?.layout.slots.length ?? 0;
  if (!placed || count === 0) return null;
  return (
    <group name="solar-panels">
      <instancedMesh key={`f${count}`} ref={frame} args={[box, frameMat, count]} castShadow receiveShadow frustumCulled={false} raycast={() => null} />
      <instancedMesh key={`g${count}`} ref={glass} args={[box, glassMat, count]} castShadow receiveShadow frustumCulled={false} raycast={() => null} />
    </group>
  );
}

/** Tanque cilíndrico verde-escuro atrás da casa, com volume proporcional ao reservatório. */
export function RainTankView({ footprint, rain }: { footprint: Vec2[]; rain: Pick<RainReport, 'tankLiters'> }) {
  const { radius, height } = useMemo(() => rainTankSize(rain.tankLiters), [rain.tankLiters]);
  const [x, y] = useMemo(() => rainTankPosition(footprint, radius), [footprint, radius]);
  return (
    <group name="rain-tank" position={[x, y, 0]}>
      <mesh position={[0, 0, height / 2]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow raycast={() => null}>
        <cylinderGeometry args={[radius, radius, height, 32]} />
        <meshStandardMaterial color="#1f4d36" roughness={0.55} metalness={0.05} />
      </mesh>
      <mesh position={[0, 0, height + 0.03]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
        <cylinderGeometry args={[radius * 0.97, radius * 0.97, 0.06, 32]} />
        <meshStandardMaterial color="#173a29" roughness={0.6} />
      </mesh>
    </group>
  );
}
