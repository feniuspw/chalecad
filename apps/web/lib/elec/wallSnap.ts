/**
 * Encaixe de caixas elétricas na face da parede (puro). A posição fica na face do lado do cursor, a meia espessura do
 * eixo, como o motor posiciona os pontos gerados; `normal` aponta da parede para o lado do cursor (para dentro do cômodo).
 */
import { closestOnSegment, dist, type V2 } from '../tools/geom';

export interface WallLike {
  id: string;
  from: V2;
  to: V2;
  thickness: number;
}

/** Vão (porta/janela) a evitar: intervalo ao longo do eixo (u) e faixa de altura (v). */
export interface OpeningSpan {
  hostId: string;
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

export interface WallHit {
  wallId: string;
  /** Posição na face (m). */
  point: V2;
  /** Normal unitária, da parede para o lado do cursor. */
  normal: V2;
  /** Direção unitária do eixo (from -> to). */
  dir: V2;
  /** Distância ao longo do eixo (m) e comprimento da parede. */
  u: number;
  length: number;
  /** Distância do cursor à face (m). */
  distance: number;
}

const END_CLEAR = 0.1;
const OPENING_CLEAR = 0.1;

/**
 * Parede mais próxima do cursor (distância medida até a face, não até o eixo) dentro de `maxDist`.
 * `height` evita vãos que cruzam a altura da caixa (porta, janela alta); `snapU` arredonda a posição ao longo do eixo.
 */
export function snapToWallFace(p: V2, walls: WallLike[], opts: { maxDist: number; height?: number; openings?: OpeningSpan[]; snapU?: number }): WallHit | null {
  let best: { w: WallLike; hit: ReturnType<typeof closestOnSegment>; d: number } | null = null;
  for (const w of walls) {
    const len = dist(w.from, w.to);
    if (len < 0.2) continue;
    const hit = closestOnSegment(p, w.from, w.to);
    const d = Math.max(0, hit.dist - w.thickness / 2);
    if (d <= opts.maxDist && (!best || d < best.d)) best = { w, hit, d };
  }
  if (!best) return null;
  const { w, hit } = best;
  const length = dist(w.from, w.to);
  const dir: V2 = [(w.to[0] - w.from[0]) / length, (w.to[1] - w.from[1]) / length];
  const left: V2 = [-dir[1], dir[0]];
  const side = (p[0] - hit.point[0]) * left[0] + (p[1] - hit.point[1]) * left[1] >= 0 ? 1 : -1;
  const normal: V2 = [left[0] * side, left[1] * side];
  let u = hit.u;
  if (opts.snapU) u = Math.round(u / opts.snapU) * opts.snapU;
  const lo = Math.min(END_CLEAR + w.thickness / 2, length / 2);
  const hi = Math.max(length - END_CLEAR - w.thickness / 2, length / 2);
  u = Math.min(Math.max(u, lo), hi);
  if (opts.openings && opts.height !== undefined) {
    const h = opts.height;
    for (const o of opts.openings) {
      if (o.hostId !== w.id || h < o.v0 - 0.1 || h > o.v1 + 0.1) continue;
      if (u > o.u0 - OPENING_CLEAR && u < o.u1 + OPENING_CLEAR) u = u - (o.u0 + o.u1) / 2 < 0 ? o.u0 - OPENING_CLEAR : o.u1 + OPENING_CLEAR;
    }
    u = Math.min(Math.max(u, lo), hi);
  }
  const off = w.thickness / 2;
  const base: V2 = [w.from[0] + dir[0] * u, w.from[1] + dir[1] * u];
  const point: V2 = [round3(base[0] + normal[0] * off), round3(base[1] + normal[1] * off)];
  return { wallId: w.id, point, normal, dir, u, length, distance: best.d };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Normal (para fora da parede) de um ponto que já está numa parede; null se a parede não existe. */
export function faceNormal(point: V2, wall: WallLike | undefined): V2 | null {
  if (!wall) return null;
  const hit = closestOnSegment(point, wall.from, wall.to);
  const d = dist(point, hit.point);
  if (d < 1e-6) return null;
  return [(point[0] - hit.point[0]) / d, (point[1] - hit.point[1]) / d];
}
