import { pointInPolygon, distToSegment, bbox2, type Vec2 } from '../../geometry';
import type { ElecPoint } from '../../schema/project';
import type { FurnitureModel, RoomModel } from '../../schema/results';
import { nearestEdge, onEdge, polygonCentroid, roomEdges, type EdgeInfo } from '../geo';
import type { PlacedPoints } from '../points';
import { gridPositions, luminairesNeeded } from './lighting';
import { luminaireOf, minSockets } from './loads';
import { dist2, type Ctx } from './types';

/** Corredor mais longo que isso (m) ganha interruptor paralelo (boa prática, pesquisa §5.5). */
const LONG_CORRIDOR = 5;
/** Folga mínima das tomadas ao vão de porta e às pontas da parede (m). */
const DOOR_CLEAR = 0.3;
/** Mais que isso e o gerador troca para o plafon maior do catálogo; teto de luminárias por cômodo. */
const PREFERRED_MAX_LIGHTS = 6;
const MAX_LIGHTS_PER_ROOM = 30;
/** Tomada de bancada: distância máxima à bancada (m) para contar como "acima dela". */
export const COUNTER_REACH = 1.2;
const COUNTER_ITEMS = new Set(['furn_kitchen_sink', 'furn_kitchen_counter', 'furn_stove']);

const furnCenter = (f: FurnitureModel): Vec2 => {
  const [a, , c] = f.polygon as [Vec2, Vec2, Vec2, Vec2];
  return [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
};

/** Distância de um ponto a um polígono (0 dentro). */
export function distToPolygon(p: Vec2, poly: Vec2[]): number {
  if (pointInPolygon(p, poly, 0)) return 0;
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, distToSegment(p, poly[i]!, poly[(i + 1) % poly.length]!));
  return d;
}

/** Posição sobre a face de um trecho, fora dos vãos de porta. */
function clearOfDoors(e: EdgeInfo, t: number): number {
  let x = Math.min(Math.max(t, 0.15), Math.max(0.15, e.len - 0.15));
  for (const [d0, d1] of e.doors) {
    if (x > d0 - DOOR_CLEAR && x < d1 + DOOR_CLEAR) x = x - (d0 + d1) / 2 < 0 ? d0 - DOOR_CLEAR : d1 + DOOR_CLEAR;
  }
  return Math.min(Math.max(x, 0.15), Math.max(0.15, e.len - 0.15));
}

const round3 = (p: Vec2): Vec2 => [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000];

interface Gen {
  points: ElecPoint[];
  add: (kind: string, roomId: string, p: Omit<ElecPoint, 'id'>) => ElecPoint;
}

/**
 * Pontos do traçado gerado (sem circuitos): luz pelo método dos lúmens, interruptores junto às portas (paralelo em
 * escada e corredor longo), tomadas e TUE reaproveitando `placePoints` (perímetro, bancada, aparelhos dos móveis).
 */
export function generatePoints(ctx: Ctx, placed: PlacedPoints): ElecPoint[] {
  const { k, model } = ctx;
  const counters = new Map<string, number>();
  const gen: Gen = {
    points: [],
    add: (kind, roomId, p) => {
      const key = `${kind}:${roomId}`;
      const n = (counters.get(key) ?? 0) + 1;
      counters.set(key, n);
      const full: ElecPoint = { id: `auto-${kind}-${roomId}-${n}`.slice(0, 64), ...p };
      gen.points.push(full);
      return full;
    },
  };
  const lum = luminaireOf(k, k.defaultLuminaire);
  const groundId = ctx.project.levels.find((l) => l.elevation === 0)?.id ?? ctx.project.levels[0]!.id;
  const seedOf = (r: RoomModel): Vec2 | undefined => ctx.project.rooms.find((x) => x.id === r.id)?.seed as Vec2 | undefined;

  for (const room of ctx.rooms) {
    const poly = room.polygon!;
    const centroid = polygonCentroid(poly, seedOf(room));
    const edges = roomEdges(room, model);
    const roomFurn = model.furniture.filter((f) => f.roomId === room.id);

    // --- Luz no teto: grade pelo método dos lúmens com a luminária padrão ---------------------------------------
    let roomLum = lum;
    let n = luminairesNeeded(room, roomLum.lumens, k);
    if (n > PREFERRED_MAX_LIGHTS) {
      // cômodo grande: o plafon de maior fluxo do catálogo, em vez de uma grade enorme do padrão
      const bigger = k.luminaires.filter((l) => l.type === lum.type && l.lumens > lum.lumens).sort((a, b) => a.lumens - b.lumens);
      for (const cand of bigger) {
        roomLum = cand;
        n = luminairesNeeded(room, cand.lumens, k);
        if (n <= PREFERRED_MAX_LIGHTS) break;
      }
    }
    n = Math.min(MAX_LIGHTS_PER_ROOM, n);
    const spots = n === 1 ? [centroid] : gridPositions(poly, n, centroid);
    const lights = spots.map((pos) =>
      gen.add('l', room.id, { kind: 'light', level: room.level, position: round3(pos), height: room.ceiling.avg, luminaire: roomLum.id, count: 1 }),
    );

    // --- Interruptor junto à porta (do `placePoints`), paralelo em escada e corredor longo -----------------------------
    const controls = lights.map((l) => l.id);
    const b = bbox2(poly);
    const stairInside =
      room.level === groundId &&
      model.stairs.some((s) => s.type !== 'ladder' && pointInPolygon(polygonCentroid(s.footprint), poly, 0.3));
    const long = room.use === 'circulation' && Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1]) > LONG_CORRIDOR;
    const twoWay = stairInside || long;
    const sw1 = placed.points.find((p) => p.kind === 'switch' && p.roomId === room.id);
    const s1pos: Vec2 = sw1?.position ?? centroid;
    const swType = twoWay ? 'two_way' : 'one_way';
    gen.add('sw', room.id, {
      kind: 'switch',
      level: room.level,
      position: round3(s1pos),
      ...(sw1?.hostId ? { hostId: sw1.hostId } : {}),
      height: k.heights.switch,
      switchType: swType,
      controls,
    });
    if (twoWay && edges.length > 0) {
      // Segunda porta, se houver; senão o trecho de parede mais distante do primeiro interruptor.
      const second = edges.find((e) => e.doors.length > 0 && dist2(onEdge(e, (e.doors[0]![0] + e.doors[0]![1]) / 2), s1pos) > 1.5);
      let pos: Vec2;
      let host: string;
      if (second) {
        const [d0, d1] = second.doors[0]!;
        const t = d0 - k.switchOffsetFromJamb >= 0.1 ? d0 - k.switchOffsetFromJamb : d1 + k.switchOffsetFromJamb;
        pos = onEdge(second, t);
        host = second.wall.id;
      } else {
        const far = edges.reduce((a, e) => (dist2(onEdge(e, e.len / 2), s1pos) > dist2(onEdge(a, a.len / 2), s1pos) ? e : a));
        pos = onEdge(far, clearOfDoors(far, far.len / 2));
        host = far.wall.id;
      }
      gen.add('sw', room.id, { kind: 'switch', level: room.level, position: round3(pos), hostId: host, height: k.heights.switch, switchType: 'two_way', controls });
    }

    // --- Tomadas e TUE ------------------------------------------------------------------------------------------------
    const mine = placed.points.filter((p) => p.roomId === room.id && (p.kind === 'outlet' || p.kind === 'outlet_high' || p.kind === 'tue'));
    const sockets: ElecPoint[] = [];
    for (const p of mine) {
      const base = { level: p.level, position: round3(p.position), ...(p.hostId ? { hostId: p.hostId } : {}), height: p.height };
      if (p.kind === 'tue') {
        const appliance = p.item === 'electric_shower' ? 'electric_shower' : p.item ? k.applianceByFurniture[p.item] : undefined;
        gen.add('tue', room.id, { kind: 'socket_tue', ...base, ...(appliance ? { appliance } : {}), ...(p.furnitureId ? { label: p.label.split(':')[0]!.slice(0, 60) } : {}) });
      } else {
        sockets.push(gen.add('s', room.id, { kind: p.kind === 'outlet_high' ? 'socket_high' : 'socket', ...base }));
      }
    }
    // Aparelhos dos móveis que o `placePoints` não cobre (constantes novas em `applianceByFurniture`).
    for (const f of roomFurn) {
      const ap = k.applianceByFurniture[f.item];
      if (!ap || placed.points.some((p) => p.kind === 'tue' && p.furnitureId === f.id)) continue;
      const ne = nearestEdge(edges, furnCenter(f));
      if (!ne) continue;
      gen.add('tue', room.id, {
        kind: 'socket_tue',
        level: f.level,
        position: round3(onEdge(ne.edge, clearOfDoors(ne.edge, ne.t))),
        hostId: ne.edge.wall.id,
        height: k.heights.low,
        appliance: ap,
      });
    }

    // Mínimo da norma por perímetro (corredor, depósito...): o `placePoints` põe uma só; completa ao longo das paredes.
    const missing = minSockets(room, k) - sockets.length;
    if (missing > 0 && edges.length > 0) {
      for (const spot of alongEdges(edges, missing, sockets.length)) {
        sockets.push(gen.add('s', room.id, { kind: 'socket', level: room.level, position: round3(spot.pos), hostId: spot.hostId, height: k.heights.low }));
      }
    }

    // Banheiro: tomada fora dos 0,60 m do box (volume de proteção); Cozinha: 2 tomadas sobre a bancada.
    if (room.use === 'bathroom') fixBathSockets(ctx, edges, roomFurn, sockets);
    if (room.use === 'kitchen') placeCounterSockets(ctx, edges, roomFurn, sockets);
  }
  return gen.points;
}

/** `n` posições espaçadas ao longo das paredes do cômodo, fora dos vãos de porta (deslocadas por `phase` tomadas já postas). */
function alongEdges(edges: EdgeInfo[], n: number, phase: number): { pos: Vec2; hostId: string }[] {
  const total = edges.reduce((s, e) => s + e.len, 0);
  const out: { pos: Vec2; hostId: string }[] = [];
  for (let i = 0; i < n; i++) {
    let s = (((i + 0.5) * total) / n + (phase > 0 ? total / (2 * (n + phase)) : 0)) % total;
    for (const e of edges) {
      if (s <= e.len + 1e-9) {
        out.push({ pos: onEdge(e, clearOfDoors(e, s)), hostId: e.wall.id });
        break;
      }
      s -= e.len;
    }
  }
  return out;
}

function fixBathSockets(ctx: Ctx, edges: EdgeInfo[], furn: FurnitureModel[], sockets: ElecPoint[]): void {
  const shower = furn.find((f) => f.item === 'furn_shower');
  if (!shower) return;
  const min = ctx.k.loads.sockets.bathSocketMinDistFromShower + 0.05;
  const sink = furn.find((f) => f.item === 'furn_bath_sink');
  for (const s of sockets) {
    if (distToPolygon(s.position, shower.polygon) >= min) continue;
    const ref = sink ? furnCenter(sink) : s.position;
    let best: { pos: Vec2; host: string; d: number } | null = null;
    for (const e of edges) {
      for (let t = 0.2; t <= e.len - 0.2 + 1e-9; t += 0.1) {
        const x = clearOfDoors(e, t);
        if (Math.abs(x - t) > 1e-9) continue;
        const pos = onEdge(e, t);
        if (distToPolygon(pos, shower.polygon) < min) continue;
        const d = dist2(pos, ref);
        if (!best || d < best.d) best = { pos, host: e.wall.id, d };
      }
    }
    if (best) {
      s.position = round3(best.pos);
      s.hostId = best.host;
    }
  }
}

function placeCounterSockets(ctx: Ctx, edges: EdgeInfo[], furn: FurnitureModel[], sockets: ElecPoint[]): void {
  const highs = sockets.filter((s) => s.kind === 'socket_high');
  const want = ctx.k.loads.sockets.counterSockets;
  const counters = furn.filter((f) => COUNTER_ITEMS.has(f.item));
  if (counters.length === 0 || highs.length === 0) return;
  // bancada encostada em parede: a mais próxima de uma face do cômodo
  let best: { f: FurnitureModel; ne: { edge: EdgeInfo; t: number }; d: number } | null = null;
  for (const f of counters) {
    const ne = nearestEdge(edges, furnCenter(f));
    if (!ne) continue;
    const d = distToSegment(furnCenter(f), ne.edge.from, ne.edge.to);
    if (!best || d < best.d) best = { f, ne, d };
  }
  if (!best) return;
  const n = Math.min(want, highs.length);
  if (best.d > COUNTER_REACH) {
    // bancada solta (ilha, península): sem parede atrás, as tomadas ficam na própria bancada, a 1,10 m
    const [p0, p1, p2] = best.f.polygon as [Vec2, Vec2, Vec2, Vec2];
    const c = furnCenter(best.f);
    const a = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const b = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const u: Vec2 = a >= b ? [(p1[0] - p0[0]) / a, (p1[1] - p0[1]) / a] : [(p2[0] - p1[0]) / b, (p2[1] - p1[1]) / b];
    for (let i = 0; i < n; i++) {
      const shift = (i - (n - 1) / 2) * 0.5;
      const s = highs[i]!;
      s.position = round3([c[0] + u[0] * shift, c[1] + u[1] * shift]);
      delete s.hostId;
      s.height = ctx.k.heights.mid;
    }
    return;
  }
  const { edge, t } = best.ne;
  for (let i = 0; i < n; i++) {
    const shift = (i - (n - 1) / 2) * 0.5;
    const tt = Math.min(Math.max(t + shift, 0.2), Math.max(0.2, edge.len - 0.2));
    const s = highs[i]!;
    s.position = round3(onEdge(edge, tt));
    s.hostId = edge.wall.id;
  }
}
