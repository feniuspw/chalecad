'use client';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { BuildingModel } from '@chalecad/engine';
import { useEditor } from '@/lib/store/editor';
import { DEVICE, devicePoses, type DevicePart } from '@/lib/elec/devices';
import { faceNormal } from '@/lib/elec/wallSnap';

const P = DEVICE.plate;
// cilindros com o eixo em y; deitados no x (para fora da parede) pela rotação de cada instância
const GEO: Record<DevicePart, THREE.BufferGeometry> = {
  plate: new THREE.BoxGeometry(P.d, P.h, P.w),
  recess: new THREE.CylinderGeometry(DEVICE.recess.r, DEVICE.recess.r, DEVICE.recess.d, 28),
  recessRed: new THREE.CylinderGeometry(DEVICE.recess.r, DEVICE.recess.r, DEVICE.recess.d, 28),
  hole10: new THREE.CylinderGeometry(DEVICE.hole10, DEVICE.hole10, 0.002, 10),
  hole20: new THREE.CylinderGeometry(DEVICE.hole20, DEVICE.hole20, 0.002, 10),
  key: new THREE.BoxGeometry(DEVICE.key.d, DEVICE.key.h, 1),
  rj45: new THREE.BoxGeometry(DEVICE.rj45.d, DEVICE.rj45.h, DEVICE.rj45.w),
};
const MAT: Record<DevicePart, THREE.Material> = {
  plate: new THREE.MeshStandardMaterial({ color: '#f4f2ee', roughness: 0.35, metalness: 0 }),
  recess: new THREE.MeshStandardMaterial({ color: '#e2dfd8', roughness: 0.45, metalness: 0 }),
  recessRed: new THREE.MeshStandardMaterial({ color: '#c62828', roughness: 0.45, metalness: 0 }),
  hole10: new THREE.MeshBasicMaterial({ color: '#1c1917' }),
  hole20: new THREE.MeshBasicMaterial({ color: '#1c1917' }),
  key: new THREE.MeshStandardMaterial({ color: '#fbfaf7', roughness: 0.3, metalness: 0 }),
  rj45: new THREE.MeshBasicMaterial({ color: '#292524' }),
};
const ROUND = new Set<DevicePart>(['recess', 'recessRed', 'hole10', 'hole20']);
const PARTS = Object.keys(GEO) as DevicePart[];
const LAY_X = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);

/**
 * Tomadas, interruptores e pontos de dados no 3D (Acabado e Apresentação), na face da parede e na altura do projeto
 * elétrico. Uma malha instanciada por tipo de peça (placa, rebaixo, furos, tecla): poucas chamadas de desenho.
 */
export function ElecDevices({ model, elevations }: { model: BuildingModel; elevations: Record<string, number> }) {
  const layout = useEditor((s) => s.results?.installations?.electrical?.layout);
  const poses = useMemo(() => {
    if (!layout) return [];
    const walls = new Map(model.walls.map((w) => [w.id, { id: w.id, from: w.from as [number, number], to: w.to as [number, number], thickness: w.thickness }]));
    return devicePoses(layout.points, elevations, (p) => (p.hostId ? faceNormal(p.position, walls.get(p.hostId)) : null));
  }, [layout, model.walls, elevations]);

  const instances = useMemo(() => {
    const byPart = new Map<DevicePart, THREE.Matrix4[]>(PARTS.map((k) => [k, []]));
    const q = new THREE.Quaternion();
    const yawQ = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const local = new THREE.Vector3();
    for (const d of poses) {
      yawQ.setFromAxisAngle(up, d.yaw);
      const base = new THREE.Vector3(...d.pos);
      for (const part of d.parts) {
        local.set(...part.at).applyQuaternion(yawQ);
        q.copy(yawQ);
        if (ROUND.has(part.part)) q.multiply(LAY_X);
        const scale = new THREE.Vector3(1, 1, part.part === 'key' ? (part.width ?? DEVICE.key.w) : 1);
        byPart.get(part.part)!.push(new THREE.Matrix4().compose(base.clone().add(local), q.clone(), scale));
      }
    }
    return byPart;
  }, [poses]);

  if (poses.length === 0) return null;
  return (
    <group name="elec-devices">
      {PARTS.map((part) => {
        const list = instances.get(part)!;
        return list.length > 0 ? <PartMesh key={part} part={part} matrices={list} /> : null;
      })}
    </group>
  );
}

function PartMesh({ part, matrices }: { part: DevicePart; matrices: THREE.Matrix4[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    matrices.forEach((mx, i) => m.setMatrixAt(i, mx));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [matrices]);
  return <instancedMesh key={matrices.length} ref={ref} args={[GEO[part], MAT[part], matrices.length]} raycast={() => null} frustumCulled={false} />;
}
