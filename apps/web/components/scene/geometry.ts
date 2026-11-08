import * as THREE from 'three';
import type { HostWall, ResolvedOpening, RoofPlane, SlabModel } from '@chalecad/engine';
import {
  roofSlabParams,
  slabExtrusion,
  wallBasis,
  wallShapeParams,
  type Basis,
  type V2,
} from '@/lib/three/convert';

const toVec2 = (pts: V2[]) => pts.map(([x, y]) => new THREE.Vector2(x, y));

export function makeShape(outline: V2[], holes: V2[][]): THREE.Shape {
  const shape = new THREE.Shape(toVec2(outline));
  for (const h of holes) shape.holes.push(new THREE.Path(toVec2(h)));
  return shape;
}

/** Posição + rotação de um referencial do motor (dentro do grupo z-up). */
export function basisTransform(b: Basis) {
  const m = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(...b.u),
    new THREE.Vector3(...b.v),
    new THREE.Vector3(...b.w),
  );
  return {
    position: new THREE.Vector3(...b.origin),
    quaternion: new THREE.Quaternion().setFromRotationMatrix(m),
  };
}

/**
 * Separa as tampas da extrusão em grupos próprios: 0 = face em -w (esquerda de from→to), 1 = face em +w (direita), 2 = laterais
 * (vãos e topo). O ExtrudeGeometry emite primeiro a tampa de baixo e depois a de cima, com o mesmo número de triângulos.
 */
export function splitCaps(geo: THREE.ExtrudeGeometry): void {
  const caps = geo.groups.find((g) => g.materialIndex === 0);
  const sides = geo.groups.find((g) => g.materialIndex === 1);
  if (!caps) return;
  const half = caps.count / 2;
  geo.clearGroups();
  geo.addGroup(caps.start, half, 0);
  geo.addGroup(caps.start + half, half, 1);
  if (sides) geo.addGroup(sides.start, sides.count, 2);
}

/** Parede: forma (u, v) com furos extrudada em w e centrada na espessura. */
export function makeWallGeometry(wall: HostWall, openings: ResolvedOpening[]) {
  const p = wallShapeParams(wall, openings);
  const geo = new THREE.ExtrudeGeometry(makeShape(p.outline, p.holes), { depth: p.depth, bevelEnabled: false });
  geo.translate(0, 0, -p.depth / 2);
  splitCaps(geo);
  return { geometry: geo, openings: p.openings, ...basisTransform(wallBasis(wall)) };
}

/** Água do telhado: placa assentada sobre o plano da água (face inferior no plano, como telhas sobre a estrutura). */
export function makeRoofGeometry(plane: RoofPlane, openings: ResolvedOpening[], thickness = 0.04) {
  const p = roofSlabParams(plane, openings, thickness);
  const geo = new THREE.ExtrudeGeometry(makeShape(p.outline, p.holes), { depth: p.thickness, bevelEnabled: false });
  splitCaps(geo);
  return { geometry: geo, basis: p.basis, thickness: p.thickness, ...basisTransform(p.basis) };
}

/** Laje extrudada para baixo a partir do topo. */
export function makeSlabGeometry(slab: SlabModel) {
  const e = slabExtrusion(slab);
  const geo = new THREE.ExtrudeGeometry(makeShape(e.polygon, []), { depth: e.depth, bevelEnabled: false });
  return { geometry: geo, zBottom: e.zBottom };
}
