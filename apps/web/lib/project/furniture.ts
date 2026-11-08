/**
 * Móveis: edição pura do projeto (mutam um rascunho Immer, dentro de `update(...)`), contorno em planta,
 * encaixe na parede, teste de colisão no cliente e sugestão de layout por cômodo. Referencial do motor, metros e graus.
 * Rotação 0: largura em x, profundidade em y, frente (lado de uso) para −y; `rotation` gira em torno do centro, anti-horário.
 */
import type { Catalog, FurnitureSpec } from '@chalecad/catalog';
import type { Furniture, FurnitureModel, HostWall, Project, ResolvedOpening, RoomModel } from '@chalecad/engine';
import { closestOnSegment, pointInPolygon, type V2 } from '../tools/geom';
import { planBounds } from './geometry';
import { newId, type IdGen } from './ids';

export type FurnitureTone = NonNullable<Furniture['tone']>;

/** Encosto do fundo do móvel na parede (folga de 5 mm) e distância máxima de captura. */
export const WALL_GAP = 0.005;
export const WALL_SNAP_DIST = 0.6;
export const FURNITURE_GRID = 0.05;
/** Alinhamento de borda com outro móvel. */
export const EDGE_SNAP = 0.08;
export const DUPLICATE_OFFSET = 0.3;

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Rotação em (−180, 180]. */
export function normalizeRotation(deg: number): number {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return r2(d) === -180 ? 180 : r2(d);
}

export const specOf = (catalog: Catalog, item: string): FurnitureSpec | undefined => catalog.furniture.find((f) => f.id === item);

// ---------------------------------------------------------------------------
// Geometria
// ---------------------------------------------------------------------------

function rotateAbout(local: V2, position: V2, rotation: number): V2 {
  const a = (rotation * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [position[0] + local[0] * c - local[1] * s, position[1] + local[0] * s + local[1] * c];
}

/** Os 4 cantos (anti-horário) do móvel: começa no canto frontal esquerdo (−x, −y) em rotação 0. */
export function furnitureFootprint(spec: Pick<FurnitureSpec, 'size'>, position: V2, rotation = 0): V2[] {
  const hw = spec.size.w / 2;
  const hd = spec.size.d / 2;
  return ([[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]] as V2[]).map((p) => rotateAbout(p, position, rotation));
}

/** Faixa de uso (frente, fundo e lados) como retângulo que envolve o móvel; null se o catálogo não pede folga. */
export function clearancePolygon(spec: Pick<FurnitureSpec, 'size' | 'clearance'>, position: V2, rotation = 0): V2[] | null {
  const { front, back, sides } = spec.clearance;
  if (front <= 0 && back <= 0 && sides <= 0) return null;
  const hw = spec.size.w / 2 + sides;
  const y0 = -spec.size.d / 2 - front;
  const y1 = spec.size.d / 2 + back;
  return ([[-hw, y0], [hw, y0], [hw, y1], [-hw, y1]] as V2[]).map((p) => rotateAbout(p, position, rotation));
}

/** Os polígonos convexos se sobrepõem em mais que `eps` (m)? SAT. Encostar não conta. */
export function polysOverlap(a: V2[], b: V2[], eps = 0.003): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      const nx = q[1] - p[1];
      const ny = p[0] - q[0];
      const l = Math.hypot(nx, ny);
      if (l < 1e-9) continue;
      let minA = Infinity;
      let maxA = -Infinity;
      let minB = Infinity;
      let maxB = -Infinity;
      for (const v of a) {
        const d = (v[0] * nx + v[1] * ny) / l;
        minA = Math.min(minA, d);
        maxA = Math.max(maxA, d);
      }
      for (const v of b) {
        const d = (v[0] * nx + v[1] * ny) / l;
        minB = Math.min(minB, d);
        maxB = Math.max(maxB, d);
      }
      if (Math.min(maxA, maxB) - Math.max(minA, minB) <= eps) return false;
    }
  }
  return true;
}

type WallLike = Pick<HostWall, 'id' | 'level' | 'from' | 'to' | 'thickness'>;

/** Retângulo da parede (eixo ± metade da espessura), sem prolongar as pontas. */
export function wallRect(w: Pick<HostWall, 'from' | 'to' | 'thickness'>): V2[] {
  const dx = w.to[0] - w.from[0];
  const dy = w.to[1] - w.from[1];
  const l = Math.hypot(dx, dy) || 1;
  const nx = (-dy / l) * (w.thickness / 2);
  const ny = (dx / l) * (w.thickness / 2);
  return [
    [w.from[0] - nx, w.from[1] - ny],
    [w.to[0] - nx, w.to[1] - ny],
    [w.to[0] + nx, w.to[1] + ny],
    [w.from[0] + nx, w.from[1] + ny],
  ];
}

const aabb = (poly: V2[]) => ({
  x0: Math.min(...poly.map((p) => p[0])),
  x1: Math.max(...poly.map((p) => p[0])),
  y0: Math.min(...poly.map((p) => p[1])),
  y1: Math.max(...poly.map((p) => p[1])),
});

// ---------------------------------------------------------------------------
// Encaixe
// ---------------------------------------------------------------------------

export interface WallSnap {
  position: V2;
  rotation: number;
  /** Parede onde encostou; null = sem parede por perto (grade de 5 cm, rotação mantida). */
  wallId: string | null;
}

/** Normal unitária da parede, do eixo para o lado do ponto. */
function sideNormal(from: V2, to: V2, point: V2, onAxis: V2): V2 {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const l = Math.hypot(dx, dy) || 1;
  const left: V2 = [-dy / l, dx / l];
  const side = (point[0] - onAxis[0]) * left[0] + (point[1] - onAxis[1]) * left[1];
  return side >= 0 ? left : [-left[0], -left[1]];
}

/** Rotação para que a frente (−y local) aponte para `n`. */
export const rotationFacing = (n: V2) => normalizeRotation((Math.atan2(n[0], -n[1]) * 180) / Math.PI);

/**
 * Itens com `wall`: acha a parede mais próxima do ponto (até 0,6 m do eixo) no nível, gira o móvel com o fundo
 * contra ela (frente para o lado do ponto) e põe o centro a espessura/2 + profundidade/2 + 5 mm do eixo.
 * Sem parede perto: grade de 5 cm e rotação mantida.
 */
export function snapToWall(spec: Pick<FurnitureSpec, 'size' | 'wall'>, point: V2, rotationGuess: number, walls: WallLike[], level: string): WallSnap {
  let best: { wall: WallLike; hit: ReturnType<typeof closestOnSegment> } | null = null;
  if (spec.wall) {
    for (const wall of walls) {
      if (wall.level !== level || Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1]) < 0.05) continue;
      const hit = closestOnSegment(point, wall.from as V2, wall.to as V2);
      if (hit.dist <= WALL_SNAP_DIST && (!best || hit.dist < best.hit.dist)) best = { wall, hit };
    }
  }
  if (!best) {
    return { position: [r3(Math.round(point[0] / FURNITURE_GRID) * FURNITURE_GRID), r3(Math.round(point[1] / FURNITURE_GRID) * FURNITURE_GRID)], rotation: normalizeRotation(rotationGuess), wallId: null };
  }
  const { wall, hit } = best;
  const from = wall.from as V2;
  const to = wall.to as V2;
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const n = sideNormal(from, to, point, hit.point);
  const u = Math.min(len, Math.max(0, Math.round(hit.u / FURNITURE_GRID) * FURNITURE_GRID));
  const along: V2 = [from[0] + ((to[0] - from[0]) / len) * u, from[1] + ((to[1] - from[1]) / len) * u];
  const off = wall.thickness / 2 + spec.size.d / 2 + WALL_GAP;
  return { position: [r3(along[0] + n[0] * off), r3(along[1] + n[1] * off)], rotation: rotationFacing(n), wallId: wall.id };
}

/**
 * Alinha a borda do móvel (eixos x/y) com a de outro móvel a menos de 8 cm. Só vale com rotação múltipla de 90°.
 * `lock` impede de deslocar o eixo em que o móvel está encostado na parede.
 */
export function snapToFurniture(spec: Pick<FurnitureSpec, 'size'>, position: V2, rotation: number, others: V2[][], lock?: 'x' | 'y' | 'both'): V2 {
  if (lock === 'both' || Math.abs(Math.round(rotation / 90) * 90 - rotation) > 0.01) return position;
  const box = aabb(furnitureFootprint(spec, position, rotation));
  const pick = (mine: number[], theirs: number[]) => {
    let best = 0;
    let bestAbs = EDGE_SNAP;
    for (const m of mine) for (const t of theirs) if (Math.abs(t - m) < bestAbs - 1e-9) {
      best = t - m;
      bestAbs = Math.abs(best);
    }
    return best;
  };
  let dx = 0;
  let dy = 0;
  const xs = others.flatMap((o) => {
    const b = aabb(o);
    return [b.x0, b.x1];
  });
  const ys = others.flatMap((o) => {
    const b = aabb(o);
    return [b.y0, b.y1];
  });
  if (lock !== 'x') dx = pick([box.x0, box.x1], xs);
  if (lock !== 'y') dy = pick([box.y0, box.y1], ys);
  return [r3(position[0] + dx), r3(position[1] + dy)];
}

export interface PlaceEnv {
  walls: WallLike[];
  level: string;
  /** Outros móveis do nível (sem o que está sendo movido). */
  others: { polygon: V2[]; collides: boolean }[];
  bounds: ReturnType<typeof planBounds>;
}

export interface Placement extends WallSnap {
  polygon: V2[];
  /** Cruza parede, outro móvel ou sai da planta: a prévia fica vermelha. */
  collision: boolean;
}

/** Encaixe completo para a prévia/arraste: parede (ou grade), alinhamento com móveis e teste de colisão. */
export function placeFurniture(spec: Pick<FurnitureSpec, 'size' | 'wall' | 'collides'>, point: V2, rotation: number, env: PlaceEnv, opts: { free?: boolean } = {}): Placement {
  let snap: WallSnap;
  if (opts.free) snap = { position: [r3(point[0]), r3(point[1])], rotation: normalizeRotation(rotation), wallId: null };
  else snap = snapToWall(spec, point, rotation, env.walls, env.level);
  if (!opts.free) {
    let lock: 'x' | 'y' | 'both' | undefined;
    if (snap.wallId) {
      const w = env.walls.find((x) => x.id === snap.wallId);
      if (w) {
        const dx = Math.abs(w.to[0] - w.from[0]);
        const dy = Math.abs(w.to[1] - w.from[1]);
        // parede em x: o eixo y fica travado (encostado); parede em y: o x; diagonal: nenhum eixo livre
        lock = dy < 1e-6 ? 'y' : dx < 1e-6 ? 'x' : 'both';
      }
    }
    snap = { ...snap, position: snapToFurniture(spec, snap.position, snap.rotation, env.others.filter((o) => o.collides).map((o) => o.polygon), lock) };
  }
  const polygon = furnitureFootprint(spec, snap.position, snap.rotation);
  return { ...snap, polygon, collision: hasCollision(polygon, spec.collides, env) };
}

/** Colisão no cliente: paredes do nível, outros móveis e saída da planta. Tapete (`collides: false`) só avisa se sair da planta. */
export function hasCollision(polygon: V2[], collides: boolean, env: PlaceEnv): boolean {
  const b = env.bounds;
  const box = aabb(polygon);
  if (box.x0 < b.x0 - 0.02 || box.x1 > b.x1 + 0.02 || box.y0 < b.y0 - 0.02 || box.y1 > b.y1 + 0.02) return true;
  if (!collides) return false;
  for (const w of env.walls) if (w.level === env.level && polysOverlap(polygon, wallRect(w))) return true;
  for (const o of env.others) if (o.collides && polysOverlap(polygon, o.polygon)) return true;
  return false;
}

/** Ambiente de encaixe para um nível, excluindo (opcionalmente) um móvel. */
export function placeEnv(project: Pick<Project, 'furniture' | 'typology'>, catalog: Catalog, walls: WallLike[], level: string, skipId?: string): PlaceEnv {
  const others = project.furniture
    .filter((f) => f.level === level && f.id !== skipId)
    .flatMap((f) => {
      const spec = specOf(catalog, f.item);
      return spec ? [{ polygon: furnitureFootprint(spec, f.position as V2, f.rotation), collides: spec.collides }] : [];
    });
  return { walls, level, others, bounds: planBounds(project.typology) };
}

// ---------------------------------------------------------------------------
// Edição (rascunho Immer)
// ---------------------------------------------------------------------------

/** Adiciona um móvel e devolve o ID (`f-` + 8 caracteres). */
export function addFurniture(draft: Project, level: string, item: string, position: V2, rotation = 0, ids: IdGen = newId): string {
  const id = ids('f');
  draft.furniture.push({ id, level, item, position: [r3(position[0]), r3(position[1])], rotation: normalizeRotation(rotation) });
  return id;
}

export function moveFurniture(draft: Project, id: string, position: V2): boolean {
  const f = draft.furniture.find((x) => x.id === id);
  if (!f) return false;
  f.position = [r3(position[0]), r3(position[1])];
  return true;
}

/** Gira `by` graus (padrão 90°, anti-horário); passe valor negativo para o outro sentido. */
export function rotateFurniture(draft: Project, id: string, by = 90): boolean {
  const f = draft.furniture.find((x) => x.id === id);
  if (!f) return false;
  f.rotation = normalizeRotation(f.rotation + by);
  return true;
}

/** Rotação livre: define o ângulo absoluto. */
export function setFurnitureRotation(draft: Project, id: string, deg: number): boolean {
  const f = draft.furniture.find((x) => x.id === id);
  if (!f) return false;
  f.rotation = normalizeRotation(deg);
  return true;
}

export function duplicateFurniture(draft: Project, id: string, ids: IdGen = newId): string | null {
  const f = draft.furniture.find((x) => x.id === id);
  if (!f) return null;
  const nid = ids('f');
  const copy: Furniture = { ...f, id: nid, position: [r3(f.position[0] + DUPLICATE_OFFSET), r3(f.position[1] + DUPLICATE_OFFSET)] };
  draft.furniture.push(copy);
  return nid;
}

export function removeFurniture(draft: Project, id: string): boolean {
  const n = draft.furniture.length;
  draft.furniture = draft.furniture.filter((f) => f.id !== id);
  return draft.furniture.length < n;
}

export interface FurniturePatch {
  item?: string;
  /** Chave presente com `undefined` limpa o tom. */
  tone?: FurnitureTone | undefined;
  position?: V2;
  rotation?: number;
}

export function patchFurniture(draft: Project, id: string, patch: FurniturePatch): boolean {
  const f = draft.furniture.find((x) => x.id === id);
  if (!f) return false;
  if (patch.item !== undefined) f.item = patch.item;
  if ('tone' in patch) {
    if (patch.tone === undefined) delete f.tone;
    else f.tone = patch.tone;
  }
  if (patch.position) f.position = [r3(patch.position[0]), r3(patch.position[1])];
  if (patch.rotation !== undefined) f.rotation = normalizeRotation(patch.rotation);
  return true;
}

/**
 * Coerência após mudar a tipologia: remove móveis de nível que sumiu e empurra para dentro de `planBounds`
 * os que ficaram para fora. Devolve quantos foram removidos e quantos movidos.
 */
export function reconcileFurniture(draft: Project, catalog?: Catalog): { removed: number; moved: number } {
  const levels = new Set(draft.levels.map((l) => l.id));
  const before = draft.furniture.length;
  draft.furniture = draft.furniture.filter((f) => levels.has(f.level));
  const removed = before - draft.furniture.length;
  const b = planBounds(draft.typology);
  let moved = 0;
  for (const f of draft.furniture) {
    const spec = catalog ? specOf(catalog, f.item) : undefined;
    // sem catálogo (ou item desconhecido) usa o próprio centro como tamanho mínimo
    const poly = spec ? furnitureFootprint(spec, f.position as V2, f.rotation) : [f.position as V2];
    const box = aabb(poly);
    const shift = (lo: number, hi: number, b0: number, b1: number) => {
      if (hi - lo > b1 - b0) return (b0 + b1) / 2 - (lo + hi) / 2;
      if (lo < b0) return b0 - lo;
      if (hi > b1) return b1 - hi;
      return 0;
    };
    const dx = shift(box.x0, box.x1, b.x0, b.x1);
    const dy = shift(box.y0, box.y1, b.y0, b.y1);
    if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9) {
      f.position = [r3(f.position[0] + dx), r3(f.position[1] + dy)];
      moved++;
    }
  }
  return { removed, moved };
}

// ---------------------------------------------------------------------------
// Modelo no cliente (até o motor entregar `results.model.furniture`)
// ---------------------------------------------------------------------------

/** Contorno, faixa de uso e cômodo de cada móvel, calculados no cliente. */
export function clientFurnitureModels(project: Pick<Project, 'furniture'>, catalog: Catalog, rooms: RoomModel[], floorZ: (level: string) => number): FurnitureModel[] {
  const out: FurnitureModel[] = [];
  for (const f of project.furniture) {
    const spec = specOf(catalog, f.item);
    if (!spec) continue;
    const pos = f.position as V2;
    const room = rooms.find((r) => r.level === f.level && r.polygon && r.polygon.length >= 3 && pointInPolygon(pos, r.polygon as V2[]));
    out.push({
      id: f.id,
      item: f.item,
      level: f.level,
      z: floorZ(f.level),
      polygon: furnitureFootprint(spec, pos, f.rotation),
      clearance: clearancePolygon(spec, pos, f.rotation),
      height: spec.size.h,
      roomId: room?.id ?? null,
    });
  }
  return out;
}

/**
 * O que o motor calculou vence; o resto vem do cálculo no cliente. Resultado do motor defasado (móvel acabou de
 * ser movido e o recálculo ainda não voltou) é descartado: vale o contorno do cliente.
 */
export function mergeFurnitureModels(engine: FurnitureModel[] | undefined, client: FurnitureModel[]): FurnitureModel[] {
  const byId = new Map((engine ?? []).map((m) => [m.id, m]));
  const same = (a: V2[], b: V2[]) => a.length === b.length && a.every((p, i) => Math.abs(p[0] - b[i]![0]) < 1e-3 && Math.abs(p[1] - b[i]![1]) < 1e-3);
  return client.map((c) => {
    const e = byId.get(c.id);
    return e && e.item === c.item && e.level === c.level && same(e.polygon as V2[], c.polygon as V2[]) ? e : c;
  });
}

/** Soma dos preços de referência (mín, máx) dos móveis do projeto. */
export function furnitureTotals(project: Pick<Project, 'furniture'>, price: (item: string) => { min: number; max: number } | null): { count: number; min: number; max: number } {
  let min = 0;
  let max = 0;
  for (const f of project.furniture) {
    const p = price(f.item);
    if (!p) continue;
    min += p.min;
    max += p.max;
  }
  return { count: project.furniture.length, min, max };
}

// ---------------------------------------------------------------------------
// Mobiliar: sugestão de layout por cômodo
// ---------------------------------------------------------------------------

export interface FurnishContext {
  walls?: Pick<HostWall, 'id' | 'from' | 'to' | 'thickness'>[];
  openings?: Pick<ResolvedOpening, 'hostId' | 'hostKind' | 'type' | 'u0' | 'u1' | 'valid'>[];
}

const DEFAULT_THICKNESS = 0.12;

interface Edge {
  a: V2;
  b: V2;
  len: number;
  dir: V2;
  /** Normal para dentro do cômodo. */
  n: V2;
  /** Espessura da parede sob o trecho (0 = aberto). */
  t: number;
  hasWindow: boolean;
  hasDoor: boolean;
}

const isDoor = (type: string) => type === 'door' || type === 'sliding_door';

/** Sugere móveis para o cômodo. Só devolve o que cabe: dentro do polígono, sem cruzar parede, porta ou outro móvel. */
export function furnishRoom(project: Pick<Project, 'furniture'>, catalog: Catalog, room: RoomModel, ctx: FurnishContext = {}, ids: IdGen = newId): Furniture[] {
  const poly = room.polygon as V2[] | null;
  if (!poly || poly.length < 3 || room.use === 'circulation' || room.use === 'storage' || room.use === 'other') return [];
  const walls = ctx.walls ?? [];
  const openings = (ctx.openings ?? []).filter((o) => o.valid && o.hostKind === 'wall');

  // arestas do cômodo, com a normal para dentro
  const rawEdges = room.edges?.length ? room.edges.map((e) => ({ a: e.from as V2, b: e.to as V2, hostId: e.hostId })) : poly.map((p, i) => ({ a: p, b: poly[(i + 1) % poly.length]!, hostId: null as string | null }));
  const edges: Edge[] = [];
  for (const e of rawEdges) {
    const len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
    if (len < 0.3) continue;
    const dir: V2 = [(e.b[0] - e.a[0]) / len, (e.b[1] - e.a[1]) / len];
    let n: V2 = [-dir[1], dir[0]];
    const probe: V2 = [(e.a[0] + e.b[0]) / 2 + n[0] * 0.05, (e.a[1] + e.b[1]) / 2 + n[1] * 0.05];
    if (!pointInPolygon(probe, poly)) n = [-n[0], -n[1]];
    const wall = e.hostId ? walls.find((w) => w.id === e.hostId) : undefined;
    const t = e.hostId ? (wall?.thickness ?? DEFAULT_THICKNESS) : 0;
    let hasWindow = false;
    let hasDoor = false;
    if (wall) {
      const wl = Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1]) || 1;
      for (const o of openings) {
        if (o.hostId !== wall.id) continue;
        const um = (o.u0 + o.u1) / 2;
        const pt: V2 = [wall.from[0] + ((wall.to[0] - wall.from[0]) / wl) * um, wall.from[1] + ((wall.to[1] - wall.from[1]) / wl) * um];
        if (closestOnSegment(pt, e.a, e.b).dist > 0.05) continue;
        if (isDoor(o.type)) hasDoor = true;
        else hasWindow = true;
      }
    }
    edges.push({ a: e.a, b: e.b, len, dir, n, t, hasWindow, hasDoor });
  }
  if (edges.length === 0) return [];

  // obstáculos fixos: paredes do contorno e a área de giro das portas
  const fixed: V2[][] = [];
  for (const e of edges) if (e.t > 0) fixed.push(wallRect({ from: e.a, to: e.b, thickness: e.t }));
  for (const w of walls) {
    const wl = Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]) || 1;
    const wd: V2 = [(w.to[0] - w.from[0]) / wl, (w.to[1] - w.from[1]) / wl];
    for (const o of openings) {
      if (o.hostId !== w.id || !isDoor(o.type)) continue;
      const um = (o.u0 + o.u1) / 2;
      const pt: V2 = [w.from[0] + wd[0] * um, w.from[1] + wd[1] * um];
      const edge = edges.find((e) => closestOnSegment(pt, e.a, e.b).dist <= 0.05);
      if (!edge) continue;
      const swing = Math.min(o.u1 - o.u0, 0.9) + w.thickness / 2;
      const p0: V2 = [w.from[0] + wd[0] * o.u0, w.from[1] + wd[1] * o.u0];
      const p1: V2 = [w.from[0] + wd[0] * o.u1, w.from[1] + wd[1] * o.u1];
      fixed.push([
        [p0[0] - edge.n[0] * w.thickness, p0[1] - edge.n[1] * w.thickness],
        [p1[0] - edge.n[0] * w.thickness, p1[1] - edge.n[1] * w.thickness],
        [p1[0] + edge.n[0] * swing, p1[1] + edge.n[1] * swing],
        [p0[0] + edge.n[0] * swing, p0[1] + edge.n[1] * swing],
      ]);
    }
  }

  interface Placed {
    f: Furniture;
    spec: FurnitureSpec;
    polygon: V2[];
  }
  const existing: Placed[] = [];
  for (const f of project.furniture) {
    if (f.level !== room.level) continue;
    const spec = specOf(catalog, f.item);
    if (spec) existing.push({ f, spec, polygon: furnitureFootprint(spec, f.position as V2, f.rotation) });
  }
  const inRoom = (p: Placed) => pointInPolygon(p.f.position as V2, poly);
  const roomExisting = existing.filter(inRoom);
  const placed: Placed[] = [];

  const get = (id: string) => specOf(catalog, id);
  const hasModel = (model: string) => [...roomExisting, ...placed].some((p) => p.spec.model === model);

  const valid = (polygon: V2[], spec: FurnitureSpec) => {
    if (!polygon.every((p) => pointInPolygon(p, poly))) return false;
    for (const o of fixed) if (polysOverlap(polygon, o)) return false;
    if (spec.collides) for (const p of [...existing, ...placed]) if (p.spec.collides && polysOverlap(polygon, p.polygon)) return false;
    return true;
  };
  const commit = (spec: FurnitureSpec, position: V2, rotation: number): Placed | null => {
    const polygon = furnitureFootprint(spec, position, rotation);
    if (!valid(polygon, spec)) return null;
    const p: Placed = { f: { id: ids('f'), level: room.level, item: spec.id, position: [r3(position[0]), r3(position[1])], rotation: normalizeRotation(rotation) }, spec, polygon };
    placed.push(p);
    return p;
  };

  const edgeIndex = (e: Edge) => edges.indexOf(e);
  const adjT = (e: Edge, side: 'start' | 'end') => {
    const i = edgeIndex(e);
    const o = edges[(i + (side === 'end' ? 1 : edges.length - 1)) % edges.length]!;
    return o.t;
  };
  /** Centro do móvel a `u` do início da aresta, com o fundo encostado. */
  const onEdge = (spec: FurnitureSpec, e: Edge, u: number): [V2, number] => {
    const off = e.t / 2 + spec.size.d / 2 + WALL_GAP;
    return [[e.a[0] + e.dir[0] * u + e.n[0] * off, e.a[1] + e.dir[1] * u + e.n[1] * off], rotationFacing(e.n)];
  };
  const uOf = (e: Edge, p: V2) => (p[0] - e.a[0]) * e.dir[0] + (p[1] - e.a[1]) * e.dir[1];
  const candidates = (spec: FurnitureSpec, e: Edge, pref: 'start' | 'end' | 'center'): number[] => {
    const lo = spec.size.w / 2 + adjT(e, 'start') / 2 + 0.01;
    const hi = e.len - spec.size.w / 2 - adjT(e, 'end') / 2 - 0.01;
    if (hi < lo - 1e-6) return [];
    const us = new Set<number>([r3(lo), r3(hi)]);
    for (let u = lo; u <= hi; u += 0.05) us.add(r3(u));
    // encostado em móveis já postos nesta parede
    for (const p of placed) {
      const us2 = p.polygon.map((q) => uOf(e, q));
      const d = Math.abs((p.polygon[0]![0] - e.a[0]) * e.n[0] + (p.polygon[0]![1] - e.a[1]) * e.n[1]);
      if (d > 1.2) continue;
      us.add(r3(Math.max(...us2) + spec.size.w / 2 + 0.001));
      us.add(r3(Math.min(...us2) - spec.size.w / 2 - 0.001));
    }
    const list = [...us].filter((u) => u >= lo - 1e-6 && u <= hi + 1e-6);
    const key = (u: number) => (pref === 'start' ? u : pref === 'end' ? -u : Math.abs(u - e.len / 2));
    return list.sort((x, y) => key(x) - key(y));
  };
  const placeOnEdge = (spec: FurnitureSpec, e: Edge, pref: 'start' | 'end' | 'center' = 'center'): Placed | null => {
    if (e.t <= 0) return null;
    for (const u of candidates(spec, e, pref)) {
      const [pos, rot] = onEdge(spec, e, u);
      const p = commit(spec, pos, rot);
      if (p) return p;
    }
    return null;
  };
  const byLength = [...edges].sort((x, y) => y.len - x.len);
  const rank = (avoid: (e: Edge) => boolean) => [...byLength.filter((e) => !avoid(e)), ...byLength.filter(avoid)];
  const placeAnywhere = (spec: FurnitureSpec, order: Edge[], pref: 'start' | 'end' | 'center' = 'center'): Placed | null => {
    for (const e of order) {
      const p = placeOnEdge(spec, e, pref);
      if (p) return p;
    }
    return null;
  };
  const edgeOf = (p: Placed) => edges.find((e) => Math.abs((p.f.position[0] - e.a[0]) * e.n[0] + (p.f.position[1] - e.a[1]) * e.n[1]) < p.spec.size.d / 2 + e.t / 2 + 0.02 && uOf(e, p.f.position as V2) >= -0.01 && uOf(e, p.f.position as V2) <= e.len + 0.01);

  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const usable = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));

  switch (room.use) {
    case 'bedroom': {
      const bed = get(usable < 2.6 ? 'furn_bed_single' : 'furn_bed_double');
      const wardrobe = get('furn_wardrobe');
      const wardrobeSmall = get('furn_wardrobe_small');
      const night = get('furn_nightstand');
      let bedP: Placed | null = null;
      if (bed && !hasModel('bed')) bedP = placeAnywhere(bed, rank((e) => e.hasWindow || e.hasDoor));
      if (bedP && night && !hasModel('nightstand')) {
        const e = edgeOf(bedP);
        if (e) {
          const u = uOf(e, bedP.f.position as V2);
          for (const s of [-1, 1]) {
            const [pos, rot] = onEdge(night, e, u + s * (bed!.size.w / 2 + night.size.w / 2 + 0.02));
            commit(night, pos, rot);
          }
        }
      }
      if (!hasModel('wardrobe')) {
        const order = rank((e) => e.hasDoor).filter((e) => !bedP || e !== edgeOf(bedP));
        for (const w of [wardrobe, wardrobeSmall]) if (w && placeAnywhere(w, order)) break;
      }
      break;
    }
    case 'living': {
      const sofa = [get('furn_sofa_3'), get('furn_sofa_2')].filter((s): s is FurnitureSpec => !!s);
      let sofaP: Placed | null = null;
      if (!hasModel('sofa')) for (const s of sofa) if ((sofaP = placeAnywhere(s, rank((e) => e.hasDoor)))) break;
      const rack = get('furn_tv_rack');
      let rackP: Placed | null = null;
      if (rack && !hasModel('rack')) {
        const se = sofaP ? edgeOf(sofaP) : undefined;
        if (sofaP && se) {
          // em frente ao sofá: na parede oposta ou a ~2,5 m
          const opposite = rank((e) => e.hasDoor).filter((e) => e.n[0] * se.n[0] + e.n[1] * se.n[1] < -0.9);
          const su = uOf(se, sofaP.f.position as V2);
          for (const e of opposite) {
            const p0: V2 = [se.a[0] + se.dir[0] * su, se.a[1] + se.dir[1] * su];
            const u = uOf(e, p0);
            const [pos, rot] = onEdge(rack, e, Math.min(Math.max(u, rack.size.w / 2 + 0.1), e.len - rack.size.w / 2 - 0.1));
            rackP = commit(rack, pos, rot);
            if (rackP) break;
          }
        }
        rackP ??= placeAnywhere(rack, rank((e) => e.hasDoor || e.hasWindow));
      }
      const table = get('furn_coffee_table');
      if (table && sofaP && !hasModel('coffee_table')) {
        const se = edgeOf(sofaP);
        if (se) {
          const faceDist = rackP ? Math.abs((rackP.f.position[0] - sofaP.f.position[0]) * se.n[0] + (rackP.f.position[1] - sofaP.f.position[1]) * se.n[1]) - rackP.spec.size.d / 2 : 2.5;
          const sofaFront = sofaP.spec.size.d / 2;
          const mid = (sofaFront + faceDist) / 2;
          const c: V2 = [sofaP.f.position[0] + se.n[0] * mid, sofaP.f.position[1] + se.n[1] * mid];
          if (faceDist - sofaFront >= table.size.d + 0.7) commit(table, c, sofaP.f.rotation);
        }
      }
      break;
    }
    case 'kitchen': {
      const items = ['furn_fridge', 'furn_kitchen_sink', 'furn_stove'].map(get).filter((s): s is FurnitureSpec => !!s && !hasModel(s.model));
      const main = rank((e) => e.hasDoor)[0]!;
      const order = [main, ...byLength.filter((e) => e !== main)];
      for (const s of items) {
        // primeiro a parede principal, depois as vizinhas (em L), sempre a partir do canto
        const mi = edgeIndex(main);
        const nb = [edges[(mi + 1) % edges.length]!, edges[(mi + edges.length - 1) % edges.length]!];
        const tryOrder = [main, ...nb, ...order.filter((e) => e !== main && !nb.includes(e))];
        placeAnywhere(s, tryOrder, 'start');
      }
      break;
    }
    case 'bathroom': {
      const order = rank((e) => e.hasDoor);
      const shower = get('furn_shower');
      const toilet = get('furn_toilet');
      const basin = get('furn_bath_sink');
      if (shower && !hasModel('shower') && !placeAnywhere(shower, order, 'start')) placeAnywhere(shower, order, 'end');
      if (toilet && !hasModel('toilet') && !placeAnywhere(toilet, order, 'end')) placeAnywhere(toilet, order, 'start');
      if (basin && !hasModel('basin')) placeAnywhere(basin, order, 'center');
      break;
    }
    case 'laundry': {
      const order = rank((e) => e.hasDoor);
      for (const id of ['furn_tank', 'furn_washer']) {
        const s = get(id);
        if (s && !hasModel(s.model)) placeAnywhere(s, order, 'start');
      }
      break;
    }
    default:
      break;
  }
  return placed.map((p) => p.f);
}
