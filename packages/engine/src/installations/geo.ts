import { distToSegment, pointInPolygon, signedArea, type Vec2 } from '../geometry';
import { openingsOnEdge } from '../model/rooms';
import type { BuildingModel, HostWall, RoomModel } from '../schema/results';

export const manhattan = (a: Vec2, b: Vec2): number => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

/** Centroide por área; se cair fora do polígono (L, U), usa `fallback` ou o vértice médio dentro. */
export function polygonCentroid(poly: Vec2[], fallback?: Vec2): Vec2 {
  const a = signedArea(poly);
  let cx = 0;
  let cy = 0;
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length]!;
    const k = p[0] * q[1] - q[0] * p[1];
    cx += (p[0] + q[0]) * k;
    cy += (p[1] + q[1]) * k;
  });
  const c: Vec2 = Math.abs(a) < 1e-9 ? poly[0]! : [cx / (6 * a), cy / (6 * a)];
  if (pointInPolygon(c, poly, 0)) return c;
  if (fallback && pointInPolygon(fallback, poly, 0)) return fallback;
  return c;
}

/** Ponto mais próximo do contorno (fechado) e a distância Euclidiana. */
export function nearestOnContour(p: Vec2, poly: Vec2[]): Vec2 {
  let best: Vec2 = poly[0]!;
  let bd = Infinity;
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
    const q: Vec2 = [a[0] + t * dx, a[1] + t * dy];
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d < bd) {
      bd = d;
      best = q;
    }
  });
  return best;
}

/** Trecho de parede de um cômodo, com o lado de dentro e as portas (intervalos ao longo do trecho). */
export interface EdgeInfo {
  from: Vec2;
  to: Vec2;
  wall: HostWall;
  len: number;
  dir: Vec2;
  /** Normal para dentro do cômodo. */
  n: Vec2;
  doors: [number, number][];
}

export function roomEdges(room: RoomModel, model: BuildingModel): EdgeInfo[] {
  if (!room.polygon) return [];
  const ccw = signedArea(room.polygon) >= 0;
  const doors = model.openings.filter((o) => o.valid && o.hostKind === 'wall' && o.type === 'door');
  const out: EdgeInfo[] = [];
  for (const e of room.edges) {
    const wall = e.hostId ? model.walls.find((w) => w.id === e.hostId) : undefined;
    if (!wall) continue;
    const len = Math.hypot(e.to[0] - e.from[0], e.to[1] - e.from[1]);
    if (len < 0.2) continue;
    const dir: Vec2 = [(e.to[0] - e.from[0]) / len, (e.to[1] - e.from[1]) / len];
    const n: Vec2 = ccw ? [-dir[1], dir[0]] : [dir[1], -dir[0]];
    const wl = wall.length || 1;
    const wd: Vec2 = [(wall.to[0] - wall.from[0]) / wl, (wall.to[1] - wall.from[1]) / wl];
    const ds: [number, number][] = openingsOnEdge(e, wall, doors).map((o) => {
      const c = (o.u0 + o.u1) / 2;
      const pc: Vec2 = [wall.from[0] + wd[0] * c, wall.from[1] + wd[1] * c];
      const t = (pc[0] - e.from[0]) * dir[0] + (pc[1] - e.from[1]) * dir[1];
      const h = (o.u1 - o.u0) / 2;
      return [t - h, t + h];
    });
    out.push({ from: e.from, to: e.to, wall, len, dir, n, doors: ds });
  }
  return out;
}

/** Ponto na face interna do trecho, a `t` m do início. */
export function onEdge(e: EdgeInfo, t: number): Vec2 {
  const k = Math.min(Math.max(t, 0), e.len);
  const off = e.wall.thickness / 2;
  return [e.from[0] + e.dir[0] * k + e.n[0] * off, e.from[1] + e.dir[1] * k + e.n[1] * off];
}

/** Trecho mais próximo de `p` e posição projetada (t) sobre ele. */
export function nearestEdge(edges: EdgeInfo[], p: Vec2): { edge: EdgeInfo; t: number } | null {
  let best: { edge: EdgeInfo; t: number } | null = null;
  let bd = Infinity;
  for (const e of edges) {
    const d = distToSegment(p, e.from, e.to);
    if (d < bd) {
      bd = d;
      best = { edge: e, t: (p[0] - e.from[0]) * e.dir[0] + (p[1] - e.from[1]) * e.dir[1] };
    }
  }
  return best;
}
