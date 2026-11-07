/** Posicionamento de aberturas sobre hospedeiros (parede ou água de telhado). Puro. */
import type { HostWall, OpeningType, RoofPlane, Vec3 } from '@chalecad/engine';
import { openingFits } from '../three/convert';
import { closestOnSegment, round, type V2 } from './geom';
import { snapScalar } from './snap';

export interface OpeningSpec {
  type: OpeningType;
  width: number;
  height: number;
  sill: number;
}

export interface PlaceOptions {
  grid: boolean;
  modulation: boolean;
  studSpacing: number;
  disabled?: boolean;
}

export interface Placement {
  /** Distância do início do hospedeiro (from→to) até a borda do vão. */
  offset: number;
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  /** Cabe no contorno, sem sobrepor outro vão. */
  fits: boolean;
  /** Motivo quando não cabe (pt-BR). */
  reason?: string;
}

/** Tipos de parede que aceitam aberturas. */
const HOSTABLE = new Set(['exterior', 'interior', 'gable']);

export interface WallHit {
  wall: HostWall;
  /** Distância ao longo do eixo (from→to) do ponto mais próximo ao cursor. */
  u: number;
  dist: number;
}

/** Parede (do nível) mais próxima do cursor, dentro da espessura + tolerância. */
export function nearestHostWall(p: V2, walls: HostWall[], level: string, tol = 0.3): WallHit | null {
  let best: WallHit | null = null;
  for (const w of walls) {
    if (w.level !== level || !HOSTABLE.has(w.kind)) continue;
    const h = closestOnSegment(p, w.from, w.to);
    if (h.dist <= w.thickness / 2 + tol && (!best || h.dist < best.dist)) best = { wall: w, u: h.u, dist: h.dist };
  }
  return best;
}

export const sillFor = (o: OpeningSpec) => (o.type === 'door' || o.type === 'sliding_door' ? 0 : o.sill);

/**
 * Vão centrado no cursor (`u` ao longo do hospedeiro), com a borda esquerda ou direita na modulação
 * dos montantes (ou na grade). `existing` = vãos já presentes no mesmo hospedeiro.
 */
export function placeOnWall(
  wall: Pick<HostWall, 'outline' | 'length'>,
  u: number,
  spec: OpeningSpec,
  snap: PlaceOptions,
  existing: { offset: number; width: number }[] = [],
): Placement {
  const raw = u - spec.width / 2;
  const left = snapScalar(raw, snap);
  const right = snapScalar(raw + spec.width, snap) - spec.width;
  const offset = round(Math.abs(left - raw) <= Math.abs(right - raw) ? left : right, 3);
  const v0 = sillFor(spec);
  const u0 = offset;
  const u1 = round(offset + spec.width, 6);
  const v1 = v0 + spec.height;
  let fits = openingFits({ u0, u1, v0, v1 }, wall.outline as V2[]);
  let reason = fits ? undefined : 'Não cabe nesta parede';
  if (fits && existing.some((e) => u0 < e.offset + e.width + 0.05 && u1 > e.offset - 0.05)) {
    fits = false;
    reason = 'Sobrepõe outra abertura';
  }
  return { offset, u0, u1, v0, v1, fits, reason };
}

const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm3 = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Coordenadas locais (u ao longo do beiral, v subindo a água) de um ponto 3D sobre a água. */
export function planeUV(plane: Pick<RoofPlane, 'origin' | 'uAxis' | 'vAxis'>, p: Vec3): V2 {
  const d: Vec3 = [p[0] - plane.origin[0], p[1] - plane.origin[1], p[2] - plane.origin[2]];
  return [dot3(d, norm3(plane.uAxis)), dot3(d, norm3(plane.vAxis))];
}

/** Claraboia centrada em (u, v) sobre a água; `offset` = u0, `sill` = v0 (distância do beiral). */
export function placeOnRoof(
  plane: Pick<RoofPlane, 'uLength' | 'vLength'>,
  uv: V2,
  spec: OpeningSpec,
  snap: PlaceOptions,
): Placement & { sill: number } {
  const grid = (v: number) => snapScalar(v, { ...snap, modulation: false });
  const u0 = round(grid(uv[0] - spec.width / 2), 3);
  const v0 = round(grid(uv[1] - spec.height / 2), 3);
  const u1 = u0 + spec.width;
  const v1 = v0 + spec.height;
  const fits = u0 >= 0 && v0 >= 0 && u1 <= plane.uLength + 1e-6 && v1 <= plane.vLength + 1e-6;
  return { offset: u0, u0, u1, v0, v1, fits, reason: fits ? undefined : 'Não cabe nesta água', sill: v0 };
}

/** Deslocamento permitido ao arrastar um vão existente: borda esquerda com snap, limitada ao hospedeiro. */
export function dragOffset(
  wall: Pick<HostWall, 'length'>,
  uCursor: number,
  grab: number,
  width: number,
  snap: PlaceOptions,
): number {
  const raw = uCursor - grab;
  const left = snapScalar(raw, snap);
  const right = snapScalar(raw + width, snap) - width;
  const best = Math.abs(left - raw) <= Math.abs(right - raw) ? left : right;
  return round(Math.min(Math.max(0, best), Math.max(0, wall.length - width)), 3);
}
