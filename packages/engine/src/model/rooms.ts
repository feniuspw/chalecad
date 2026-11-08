import type { Catalog } from '@chalecad/catalog';
import { distToSegment, pointInPolygon, polygonArea, type Vec2 } from '../geometry';
import type { Project, Room, RoomUse } from '../schema/project';
import type { BuildingModel, HostWall, ResolvedOpening, RoofPlane, RoomEdge, RoomModel } from '../schema/results';
import type { AnnexGeometry } from './annex';

/** Une pontos a menos de 5 cm. */
export const ROOM_SNAP = 0.05;
/** Parede interna que termina a até 15 cm de outra parede é estendida até ela. */
export const ROOM_EXTEND = 0.15;
/** Passo da grade de amostragem do pé-direito. */
export const CEILING_GRID = 0.25;
/** Distância máxima ao eixo da parede para ela ser a "parede sob a aresta". */
const HOST_TOL = 0.06;
/** Distância máxima do centro da abertura à aresta do cômodo. */
const OPENING_TOL = 0.05;

export const ROOM_USE_LABEL: Record<RoomUse, string> = {
  living: 'Sala',
  kitchen: 'Cozinha',
  bedroom: 'Quarto',
  bathroom: 'Banheiro',
  laundry: 'Lavanderia',
  circulation: 'Circulação',
  storage: 'Depósito',
  other: 'Outro',
};

const cross = (a: Vec2, b: Vec2) => a[0] * b[1] - a[1] * b[0];
const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const round9 = (n: number) => Math.round(n * 1e9) / 1e9;

/** Contorno (eixo das paredes, anti-horário) do A-frame com anexos laterais. */
export function annexAxisPolygon(W: number, D: number, annexes: AnnexGeometry[]): Vec2[] {
  const r = annexes.find((g) => g.side === 'right');
  const l = annexes.find((g) => g.side === 'left');
  const poly: Vec2[] = [[0, 0], [W, 0]];
  if (r) poly.push([W, r.y0], [r.rect.x1, r.y0], [r.rect.x1, r.y1], [W, r.y1]);
  poly.push([W, D], [0, D]);
  if (l) poly.push([0, l.y1], [l.rect.x0, l.y1], [l.rect.x0, l.y0], [0, l.y0]);
  // remove vértices repetidos e colineares (anexo encostado na frente ou no fundo)
  const dedup = poly.filter((p, i) => {
    const q = poly[(i + 1) % poly.length]!;
    return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-9;
  });
  return dedup.filter((p, i) => {
    const a = dedup[(i + dedup.length - 1) % dedup.length]!;
    const b = dedup[(i + 1) % dedup.length]!;
    return Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) > 1e-9;
  });
}

/** Cota do telhado (menor, se houver mais de uma água) sobre um ponto, ou null. */
export function roofBelowAt(planes: RoofPlane[], p: Vec2): number | null {
  let best: number | null = null;
  for (const r of planes) {
    const [u, v, o] = [r.uAxis, r.vAxis, r.origin];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]] as const;
    if (Math.abs(n[2]) < 1e-9) continue;
    if (!pointInPolygon(p, r.vertices.map((x): Vec2 => [x[0], x[1]]))) continue;
    const z = o[2] - (n[0] * (p[0] - o[0]) + n[1] * (p[1] - o[1])) / n[2];
    if (best === null || z < best) best = z;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Grafo planar
// ---------------------------------------------------------------------------

interface Seg {
  a: Vec2;
  b: Vec2;
  /** Id da parede do usuário (null = contorno). */
  id: string | null;
}

interface Face {
  poly: Vec2[];
  area: number;
}

/** Remove espinhos (ida e volta pela mesma aresta) e vértices colineares. */
function cleanPoly(pts: Vec2[]): Vec2[] {
  let p = pts.map((q): Vec2 => [q[0], q[1]]);
  let changed = true;
  while (changed && p.length >= 3) {
    changed = false;
    for (let i = 0; i < p.length; i++) {
      const a = p[(i + p.length - 1) % p.length]!;
      const q = p[i]!;
      const b = p[(i + 1) % p.length]!;
      const spike = dist(a, b) < 1e-9;
      const colinear = Math.abs(cross(sub(q, a), sub(b, q))) < 1e-9 * Math.max(1, dist(a, q) * dist(q, b));
      if (spike || colinear || dist(a, q) < 1e-9) {
        p.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  p = p.map((q): Vec2 => [round9(q[0]), round9(q[1])]);
  return p;
}

/** Faces internas (anti-horárias) do grafo formado pelo contorno e pelos eixos das paredes. */
function buildFaces(contour: Vec2[], walls: { id: string; from: Vec2; to: Vec2 }[]): { faces: Face[]; walls: Seg[] } {
  const reps: Vec2[] = [];
  const snap = (p: Vec2): Vec2 => {
    for (const r of reps) if (dist(r, p) < ROOM_SNAP) return r;
    const q: Vec2 = [p[0], p[1]];
    reps.push(q);
    return q;
  };
  const contourSegs: Seg[] = contour.map((p, i) => ({ a: snap(p), b: snap(contour[(i + 1) % contour.length]!), id: null }));
  const wallSegs: Seg[] = walls.map((w) => ({ a: snap(w.from), b: snap(w.to), id: w.id }));
  const all = (): Seg[] => [...contourSegs, ...wallSegs].filter((s) => dist(s.a, s.b) > 1e-9);

  // estende pontas soltas até a parede mais próxima, se estiverem a até 15 cm
  for (const w of wallSegs) {
    if (dist(w.a, w.b) < 1e-9) continue;
    for (const end of ['a', 'b'] as const) {
      const e = w[end];
      const o = end === 'a' ? w.b : w.a;
      const len = dist(e, o);
      const d: Vec2 = [(e[0] - o[0]) / len, (e[1] - o[1]) / len];
      let best: number | null = null;
      for (const s of all()) {
        if (s === w) continue;
        const r = sub(s.b, s.a);
        const den = cross(d, r);
        if (Math.abs(den) < 1e-9) continue;
        const ap = sub(s.a, e);
        const t = cross(ap, r) / den;
        const u = cross(ap, d) / den;
        const rl = Math.hypot(r[0], r[1]);
        const tol = ROOM_SNAP / rl;
        if (u < -tol || u > 1 + tol) continue;
        if (t < -1e-9 || t > ROOM_EXTEND + 1e-9) continue;
        if (best === null || t < best) best = t;
      }
      if (best !== null && best > 1e-9) w[end] = snap([e[0] + d[0] * best, e[1] + d[1] * best]);
    }
  }

  // divide nos cruzamentos e encontros em T
  const segs = all();
  const verts: Vec2[] = [];
  const vid = (p: Vec2): number => {
    for (let i = 0; i < verts.length; i++) if (dist(verts[i]!, p) < ROOM_SNAP) return i;
    verts.push([p[0], p[1]]);
    return verts.length - 1;
  };
  const edgeKeys = new Set<string>();
  const edges: [number, number][] = [];
  segs.forEach((s, i) => {
    const r = sub(s.b, s.a);
    const l2 = r[0] * r[0] + r[1] * r[1];
    const cuts: { t: number; p: Vec2 }[] = [{ t: 0, p: s.a }, { t: 1, p: s.b }];
    segs.forEach((o, j) => {
      if (i === j) return;
      for (const p of [o.a, o.b]) {
        if (distToSegment(p, s.a, s.b) <= 1e-3) cuts.push({ t: ((p[0] - s.a[0]) * r[0] + (p[1] - s.a[1]) * r[1]) / l2, p });
      }
      const q = sub(o.b, o.a);
      const den = cross(r, q);
      if (Math.abs(den) < 1e-12) return;
      const ap = sub(o.a, s.a);
      const t = cross(ap, q) / den;
      const u = cross(ap, r) / den;
      if (t > 0 && t < 1 && u > 0 && u < 1) cuts.push({ t, p: [s.a[0] + r[0] * t, s.a[1] + r[1] * t] });
    });
    cuts.sort((x, y) => x.t - y.t);
    const ids: number[] = [];
    for (const c of cuts) {
      const id = vid(c.p);
      if (ids[ids.length - 1] !== id) ids.push(id);
    }
    for (let k = 0; k + 1 < ids.length; k++) {
      const x = Math.min(ids[k]!, ids[k + 1]!);
      const y = Math.max(ids[k]!, ids[k + 1]!);
      const key = `${x}-${y}`;
      if (x !== y && !edgeKeys.has(key)) {
        edgeKeys.add(key);
        edges.push([x, y]);
      }
    }
  });

  // adjacência, sem pontas soltas
  const adj = new Map<number, Set<number>>();
  for (const [x, y] of edges) {
    (adj.get(x) ?? adj.set(x, new Set()).get(x)!).add(y);
    (adj.get(y) ?? adj.set(y, new Set()).get(y)!).add(x);
  }
  const queue = [...adj.keys()].filter((v) => adj.get(v)!.size < 2);
  while (queue.length > 0) {
    const v = queue.pop()!;
    const ns = adj.get(v);
    if (!ns) continue;
    for (const n of ns) {
      const s = adj.get(n)!;
      s.delete(v);
      if (s.size < 2) queue.push(n);
    }
    adj.delete(v);
  }

  // faces: percorre as semi-arestas mantendo a face à esquerda
  const angle = (a: number, b: number) => Math.atan2(verts[b]![1] - verts[a]![1], verts[b]![0] - verts[a]![0]);
  const sorted = new Map<number, number[]>();
  for (const [v, ns] of adj) sorted.set(v, [...ns].sort((p, q) => angle(v, p) - angle(v, q)));
  const seen = new Set<string>();
  const faces: Face[] = [];
  for (const [u0, ns] of sorted) {
    for (const v0 of ns) {
      if (seen.has(`${u0}>${v0}`)) continue;
      const loop: number[] = [];
      let u = u0;
      let v = v0;
      for (let guard = 0; guard < 10000 && !seen.has(`${u}>${v}`); guard++) {
        seen.add(`${u}>${v}`);
        loop.push(u);
        const around = sorted.get(v)!;
        const idx = around.indexOf(u);
        const next = around[(idx - 1 + around.length) % around.length]!;
        u = v;
        v = next;
      }
      const poly = cleanPoly(loop.map((i) => verts[i]!));
      if (poly.length < 3) continue;
      const signed = poly.reduce((s, p, i) => s + cross(p, poly[(i + 1) % poly.length]!), 0) / 2;
      if (signed > 1e-6) faces.push({ poly, area: signed });
    }
  }
  return { faces, walls: wallSegs };
}

// ---------------------------------------------------------------------------
// Arestas e hospedeiros
// ---------------------------------------------------------------------------

interface HostCand {
  id: string;
  from: Vec2;
  to: Vec2;
  /** Filtro extra no ponto médio da aresta (a parede existe nessa altura?). */
  ok?: (mid: Vec2) => boolean;
}

/** Divide cada aresta do polígono por hospedeiro (parede sob ela ou null). */
function edgesWithHosts(poly: Vec2[], cands: HostCand[]): RoomEdge[] {
  const out: RoomEdge[] = [];
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length]!;
    const len = dist(a, b);
    if (len < 1e-9) return;
    const d: Vec2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const ts = new Set<number>([0, 1]);
    for (const c of cands) {
      for (const p of [c.from, c.to]) {
        if (distToSegment(p, a, b) > HOST_TOL) continue;
        const t = ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / len;
        if (t > 1e-6 && t < 1 - 1e-6) ts.add(t);
      }
    }
    const sorted = [...ts].sort((x, y) => x - y);
    let last: RoomEdge | null = null;
    for (let k = 0; k + 1 < sorted.length; k++) {
      const [t0, t1] = [sorted[k]!, sorted[k + 1]!];
      if (t1 - t0 < 1e-9) continue;
      const mid: Vec2 = [a[0] + d[0] * len * ((t0 + t1) / 2), a[1] + d[1] * len * ((t0 + t1) / 2)];
      let host: string | null = null;
      let best = HOST_TOL;
      for (const c of cands) {
        const dd = distToSegment(mid, c.from, c.to);
        if (dd < best - 1e-3 && (!c.ok || c.ok(mid))) {
          best = dd;
          host = c.id;
        }
      }
      const from: Vec2 = [round9(a[0] + d[0] * len * t0), round9(a[1] + d[1] * len * t0)];
      const to: Vec2 = [round9(a[0] + d[0] * len * t1), round9(a[1] + d[1] * len * t1)];
      if (last && last.hostId === host) last.to = to;
      else {
        last = { from, to, hostId: host };
        out.push(last);
      }
    }
  });
  // une a última com a primeira se for o mesmo hospedeiro (aresta que cruza o vértice inicial)
  return out;
}

// ---------------------------------------------------------------------------
// Fase 1: contornos (antes das paredes internas, para marcar as molhadas)
// ---------------------------------------------------------------------------

export interface RoomLayout {
  room: Room;
  polygon: Vec2[] | null;
  edges: RoomEdge[];
}

export interface RoomLayoutInput {
  project: Project;
  /** Paredes externas já montadas (hospedeiros `ext-*`, `wing-*`, `annex-*`). */
  exteriorWalls: HostWall[];
  /** Contorno do térreo no eixo das paredes externas. */
  groundContour: Vec2[];
}

export function resolveRoomLayouts({ project, exteriorWalls, groundContour }: RoomLayoutInput): RoomLayout[] {
  const cache = new Map<string, { faces: Face[]; walls: Seg[] } | null>();
  const levelOf = (id: string) => project.levels.find((l) => l.id === id);
  const facesFor = (levelId: string) => {
    if (cache.has(levelId)) return cache.get(levelId)!;
    const lvl = levelOf(levelId);
    const contour = !lvl ? null : lvl.elevation === 0 ? groundContour : (lvl.polygon as Vec2[] | undefined) ?? null;
    const res = contour
      ? buildFaces(
          contour.map((p): Vec2 => [p[0], p[1]]),
          project.walls.filter((w) => w.level === levelId).map((w) => ({ id: w.id, from: w.from as Vec2, to: w.to as Vec2 })),
        )
      : null;
    cache.set(levelId, res);
    return res;
  };

  return project.rooms.map((room): RoomLayout => {
    const open: RoomLayout = { room, polygon: null, edges: [] };
    const g = facesFor(room.level);
    const lvl = levelOf(room.level);
    if (!g || !lvl) return open;
    let face: Face | null = null;
    for (const f of g.faces) {
      if (!pointInPolygon(room.seed as Vec2, f.poly)) continue;
      if (!face || f.area < face.area) face = f;
    }
    if (!face) return open;

    const cands: HostCand[] = [];
    for (const w of exteriorWalls) {
      if (w.kind === 'interior') continue;
      const dx = w.to[0] - w.from[0];
      const dy = w.to[1] - w.from[1];
      const wl = Math.hypot(dx, dy) || 1;
      cands.push({
        id: w.id,
        from: w.from,
        to: w.to,
        ok:
          lvl.elevation === 0
            ? undefined
            : (mid) => {
                const u = ((mid[0] - w.from[0]) * dx + (mid[1] - w.from[1]) * dy) / wl;
                return pointInPolygon([u, lvl.elevation - w.baseZ + 0.1], w.outline);
              },
      });
    }
    for (const s of g.walls) if (s.id !== null) cands.push({ id: s.id, from: s.a, to: s.b });
    return { room, polygon: face.poly, edges: edgesWithHosts(face.poly, cands) };
  });
}

/** IDs das paredes internas que têm aresta num cômodo molhado. */
export function wetInteriorWallIds(layouts: RoomLayout[], catalog: Catalog): Set<string> {
  const out = new Set<string>();
  for (const l of layouts) {
    if (!catalog.constants.norms.rooms[l.room.use]!.wet) continue;
    for (const e of l.edges) if (e.hostId) out.add(e.hostId);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fase 2: pé-direito, vidro e aberturas (depois do modelo pronto)
// ---------------------------------------------------------------------------

const LIGHTING_WALL = new Set<ResolvedOpening['type']>(['window', 'sliding_door']);
const openingArea = (o: ResolvedOpening) => (o.u1 - o.u0) * (o.v1 - o.v0);

/** Recorta o polígono (Sutherland–Hodgman) pela faixa u ∈ [u0, u1]. */
function clipStrip(poly: Vec2[], u0: number, u1: number): Vec2[] {
  const clip = (pts: Vec2[], keep: (p: Vec2) => boolean, hit: (a: Vec2, b: Vec2) => Vec2): Vec2[] => {
    const res: Vec2[] = [];
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length]!;
      const [pi, qi] = [keep(p), keep(q)];
      if (pi) res.push(p);
      if (pi !== qi) res.push(hit(p, q));
    });
    return res;
  };
  const at = (u: number) => (a: Vec2, b: Vec2): Vec2 => {
    const t = (u - a[0]) / (b[0] - a[0]);
    return [u, a[1] + (b[1] - a[1]) * t];
  };
  let r = clip(poly, (p) => p[0] >= u0, at(u0));
  if (r.length > 0) r = clip(r, (p) => p[0] <= u1, at(u1));
  return r;
}

/** Altura (v máximo) do contorno da parede na posição u. */
export function wallTopAt(outline: Vec2[], u: number): number {
  let top = 0;
  outline.forEach((a, i) => {
    const b = outline[(i + 1) % outline.length]!;
    const [lo, hi] = a[0] <= b[0] ? [a, b] : [b, a];
    if (u < lo[0] - 1e-9 || u > hi[0] + 1e-9) return;
    const v = hi[0] - lo[0] < 1e-12 ? Math.max(a[1], b[1]) : lo[1] + ((hi[1] - lo[1]) * (u - lo[0])) / (hi[0] - lo[0]);
    top = Math.max(top, v);
  });
  return top;
}

/** Posição (m) ao longo do eixo da parede de um ponto, limitada ao comprimento. */
export function alongWall(w: Pick<HostWall, 'from' | 'to' | 'length'>, p: Vec2): number {
  const dx = w.to[0] - w.from[0];
  const dy = w.to[1] - w.from[1];
  const l = Math.hypot(dx, dy) || 1;
  return Math.min(Math.max(((p[0] - w.from[0]) * dx + (p[1] - w.from[1]) * dy) / l, 0), w.length);
}

/** Aberturas de parede cujo centro está sobre o trecho da aresta (hospedeiro igual e posição dentro do trecho). */
export function openingsOnEdge(
  edge: RoomEdge,
  wall: HostWall,
  openings: ResolvedOpening[],
): ResolvedOpening[] {
  if (edge.hostId !== wall.id) return [];
  const dx = (wall.to[0] - wall.from[0]) / (wall.length || 1);
  const dy = (wall.to[1] - wall.from[1]) / (wall.length || 1);
  return openings.filter((o) => {
    if (!o.valid || o.hostKind !== 'wall' || o.hostId !== wall.id) return false;
    const c = (o.u0 + o.u1) / 2;
    return distToSegment([wall.from[0] + dx * c, wall.from[1] + dy * c], edge.from, edge.to) <= OPENING_TOL;
  });
}

/**
 * Área que abre (m²) de um cômodo: Σ área do vão × `openableFraction[tipo]`, sobre as aberturas de `openingIds`.
 * A fachada envidraçada fixa (`gable_glazed`) ilumina mas não ventila.
 */
export function roomVentilation(room: Pick<RoomModel, 'openingIds'>, model: BuildingModel, catalog: Catalog): number {
  const frac = catalog.constants.norms.openableFraction;
  let sum = 0;
  for (const id of room.openingIds) {
    const o = model.openings.find((x) => x.id === id);
    if (o) sum += openingArea(o) * (frac[o.type] ?? 0);
  }
  return sum;
}

export interface RoomCompleteInput {
  project: Project;
  catalog: Catalog;
  /** Modelo com paredes, lajes, telhado e aberturas prontos (`rooms` ainda vazio). */
  model: BuildingModel;
  roofZ: (x: number, y: number) => number;
}

export function completeRooms(layouts: RoomLayout[], { project, catalog, model, roofZ }: RoomCompleteInput): RoomModel[] {
  const rules = catalog.constants.norms.rooms;
  const wallById = new Map(model.walls.map((w) => [w.id, w]));
  return layouts.map(({ room, polygon, edges }): RoomModel => {
    const base = {
      id: room.id,
      level: room.level,
      use: room.use,
      name: room.name ?? ROOM_USE_LABEL[room.use],
      wet: rules[room.use]!.wet,
    };
    if (!polygon) {
      return { ...base, polygon: null, edges: [], area: 0, perimeter: 0, ceiling: { min: 0, avg: 0, max: 0 }, glazing: 0, openingIds: [] };
    }
    const elev = project.levels.find((l) => l.id === room.level)?.elevation ?? 0;
    const area = polygonArea(polygon);
    const perimeter = edges.reduce((s, e) => s + dist(e.from, e.to), 0);

    // --- pé-direito: grade de ~25 cm ---
    const xs = polygon.map((p) => p[0]);
    const ys = polygon.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const heightAt = (p: Vec2): number => {
      let top = roofBelowAt(model.roofPlanes, p) ?? roofZ(p[0], p[1]);
      for (const s of model.slabs) {
        const bottom = s.topZ - s.thickness;
        if (s.kind !== 'mezzanine' || bottom < elev + 0.05) continue;
        if (pointInPolygon(p, s.polygon, 0)) top = Math.min(top, bottom);
      }
      return Math.max(0, top - elev);
    };
    const hs: number[] = [];
    for (let x = x0 + CEILING_GRID / 2; x < x1; x += CEILING_GRID) {
      for (let y = y0 + CEILING_GRID / 2; y < y1; y += CEILING_GRID) {
        if (pointInPolygon([x, y], polygon, 0)) hs.push(heightAt([x, y]));
      }
    }
    if (hs.length === 0) {
      const c: Vec2 = [xs.reduce((s, v) => s + v, 0) / xs.length, ys.reduce((s, v) => s + v, 0) / ys.length];
      hs.push(heightAt(pointInPolygon(c, polygon, 0) ? c : (room.seed as Vec2)));
    }
    const ceiling = {
      min: Math.min(...hs),
      avg: hs.reduce((s, v) => s + v, 0) / hs.length,
      max: Math.max(...hs),
    };

    // --- vidro e aberturas ---
    let glazing = 0;
    const openingIds: string[] = [];
    const wallOpenings = model.openings.filter((o) => o.valid && o.hostKind === 'wall');
    for (const o of wallOpenings) {
      if (!LIGHTING_WALL.has(o.type)) continue;
      const w = wallById.get(o.hostId);
      if (w && edges.some((e) => openingsOnEdge(e, w, [o]).length > 0)) {
        glazing += openingArea(o);
        openingIds.push(o.id);
      }
    }
    for (const o of model.openings) {
      if (!o.valid || o.type !== 'skylight') continue;
      const plane = model.roofPlanes.find((r) => r.id === o.hostId);
      if (!plane) continue;
      const u = (o.u0 + o.u1) / 2;
      const v = (o.v0 + o.v1) / 2;
      const p3 = [0, 1, 2].map((k) => plane.origin[k]! + plane.uAxis[k]! * u + plane.vAxis[k]! * v);
      const p: Vec2 = [p3[0]!, p3[1]!];
      if (!pointInPolygon(p, polygon, 0)) continue;
      const blocked = model.slabs.some(
        (s) => s.kind === 'mezzanine' && s.topZ - s.thickness >= elev + 0.05 && s.topZ - s.thickness < p3[2]! && pointInPolygon(p, s.polygon, 0),
      );
      if (blocked) continue;
      glazing += openingArea(o);
      openingIds.push(o.id);
    }
    for (const e of edges) {
      const w = e.hostId ? wallById.get(e.hostId) : undefined;
      if (!w || w.assemblyId !== 'gable_glazed') continue;
      const [ua, ub] = [alongWall(w, e.from), alongWall(w, e.to)].sort((a, b) => a - b) as [number, number];
      let g = polygonArea(clipStrip(w.outline, ua, ub));
      g -= openingsOnEdge(e, w, wallOpenings).reduce((s, o) => s + openingArea(o), 0);
      glazing += Math.max(0, g);
    }

    return { ...base, polygon, edges, area, perimeter, ceiling, glazing, openingIds };
  });
}
