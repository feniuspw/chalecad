/**
 * Raycast em planos no referencial do motor (z para cima). A cena (y-up) converte raios com `sceneRayToMotor`.
 * Puro: sem three.
 */
import type { Vec3 } from '@chalecad/engine';
import type { V2 } from './geom';

export interface Ray3 {
  origin: Vec3;
  dir: Vec3;
}

/** Cena (x, y, z) y-up para motor (x, -z, y) z-up, para pontos e direções. */
export const sceneToMotor = ([x, y, z]: Vec3): Vec3 => [x, -z + 0, y];

export function sceneRayToMotor(origin: Vec3, dir: Vec3): Ray3 {
  return { origin: sceneToMotor(origin), dir: sceneToMotor(dir) };
}

/** Interseção do raio com o plano horizontal z = `z`, ou null (paralelo/atrás). */
export function rayHitHorizontal(ray: Ray3, z: number): V2 | null {
  const dz = ray.dir[2];
  if (Math.abs(dz) < 1e-9) return null;
  const t = (z - ray.origin[2]) / dz;
  if (t < 0) return null;
  return [ray.origin[0] + ray.dir[0] * t, ray.origin[1] + ray.dir[1] * t];
}

/** Interseção com o plano vertical que passa por `p` e tem normal horizontal `n` (em planta); devolve o ponto em planta. */
export function rayHitVertical(ray: Ray3, p: V2, n: V2): V2 | null {
  const denom = ray.dir[0] * n[0] + ray.dir[1] * n[1];
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((p[0] - ray.origin[0]) * n[0] + (p[1] - ray.origin[1]) * n[1]) / denom;
  if (t < 0) return null;
  return [ray.origin[0] + ray.dir[0] * t, ray.origin[1] + ray.dir[1] * t];
}
