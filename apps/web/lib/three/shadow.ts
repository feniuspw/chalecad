/**
 * Enquadra o frustum ortográfico da sombra do sol em volta de uma lista de pontos (cantos do bbox).
 * Puro: devolve números; a cena aplica na `shadow.camera`.
 */
export type Vec3 = [number, number, number];

export interface ShadowFrustum {
  left: number;
  right: number;
  top: number;
  bottom: number;
  near: number;
  far: number;
  /** Distância da luz ao centro, ao longo de `dir`. */
  distance: number;
}

const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Cantos de uma caixa. */
export function boxCorners(min: Vec3, max: Vec3): Vec3[] {
  const out: Vec3[] = [];
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) out.push([x, y, z]);
  return out;
}

/**
 * @param points pontos a cobrir (cena y-up)
 * @param center ponto para onde a luz aponta
 * @param dir direção do centro para o sol (unitária ou não; y-up)
 * @param pad folga em metros nos quatro lados e em profundidade
 */
export function fitShadowFrustum(points: Vec3[], center: Vec3, dir: Vec3, pad = 2): ShadowFrustum {
  const z = norm(dir);
  const up: Vec3 = Math.abs(z[1]) > 0.999 ? [0, 0, 1] : [0, 1, 0];
  const x = norm(cross(up, z));
  const y = cross(z, x);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of points) {
    const d: Vec3 = [p[0] - center[0], p[1] - center[1], p[2] - center[2]];
    const a = dot(d, x), b = dot(d, y), c = dot(d, z);
    minX = Math.min(minX, a); maxX = Math.max(maxX, a);
    minY = Math.min(minY, b); maxY = Math.max(maxY, b);
    minZ = Math.min(minZ, c); maxZ = Math.max(maxZ, c);
  }
  const distance = maxZ + pad + 5;
  return {
    left: minX - pad,
    right: maxX + pad,
    bottom: minY - pad,
    top: maxY + pad,
    near: Math.max(0.1, distance - maxZ - pad),
    far: distance - minZ + pad,
    distance,
  };
}
