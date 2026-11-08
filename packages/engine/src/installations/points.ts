import type { Catalog } from '@chalecad/catalog';
import { pointInPolygon, type Vec2 } from '../geometry';
import type { Project } from '../schema/project';
import type {
  BuildingModel,
  FurnitureModel,
  InstallationPoint,
  InstallationPointKind,
  RoomModel,
} from '../schema/results';
import { manhattan, nearestEdge, onEdge, polygonCentroid, roomEdges, type EdgeInfo } from './geo';

/** Ponto com dados internos do motor (carga, bitola do esgoto, item de origem). */
export interface PointEx extends InstallationPoint {
  /** Carga (VA em luz e tomadas, W em TUE). 0 nos demais. */
  load: number;
  /** Diâmetro do esgoto (mm). */
  dia?: 40 | 100;
  /** ID do móvel do catálogo ou `electric_shower`. */
  item?: string;
}

export interface TankInfo {
  point: PointEx;
  liters: number;
  dailyLiters: number;
  occupants: number;
  roomId: string;
  roomName: string;
  /** Massa cheia (kg): água + caixa vazia. */
  fullKg: number;
}

export interface PlacedPoints {
  points: PointEx[];
  panel: PointEx;
  tank: TankInfo | null;
  /** Cômodos com polígono, na ordem do modelo. */
  rooms: RoomModel[];
}

const WET_USES = new Set(['kitchen', 'laundry']);
const COUNTER_ITEMS = new Set(['furn_kitchen_sink', 'furn_kitchen_counter', 'furn_stove', 'furn_island', 'furn_tank', 'furn_washer']);
const HOT_ITEMS = new Set(['furn_shower', 'furn_bath_sink', 'furn_kitchen_sink', 'furn_bathtub']);
const SEWER_100 = new Set(['furn_toilet']);
const EPS = 1e-9;

const fmt = (n: number) => String(n).replace('.', ',');

function furnitureCenter(f: FurnitureModel): Vec2 {
  const [a, , c] = f.polygon as [Vec2, Vec2, Vec2, Vec2];
  return [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
}

/** Ponto no meio do fundo do móvel (lado +y local) e sua profundidade. */
function furnitureBack(f: FurnitureModel): { back: Vec2; width: number } {
  const [p0, p1, , p3] = f.polygon as [Vec2, Vec2, Vec2, Vec2];
  const c = furnitureCenter(f);
  const dy: Vec2 = [p3[0] - p0[0], p3[1] - p0[1]];
  const w = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  return { back: [c[0] + dy[0] / 2, c[1] + dy[1] / 2], width: w };
}

export function placePoints(project: Project, model: BuildingModel, catalog: Catalog): PlacedPoints {
  const k = catalog.constants.installations;
  const inst = project.installations;
  const ground = project.levels.find((l) => l.elevation === 0) ?? project.levels[0]!;
  const rooms = model.rooms.filter((r) => r.polygon !== null);
  const points: PointEx[] = [];
  const counters = new Map<string, number>();
  const nextId = (kind: string, scope: string) => {
    const key = `${kind}:${scope}`;
    const n = (counters.get(key) ?? 0) + 1;
    counters.set(key, n);
    return `${kind}-${scope}-${n}`;
  };
  const add = (p: Omit<PointEx, 'id' | 'circuitId' | 'furnitureId' | 'hostId' | 'load'> & Partial<Pick<PointEx, 'furnitureId' | 'hostId' | 'load'>>): PointEx => {
    const full: PointEx = {
      id: nextId(p.kind, p.roomId ?? p.level),
      circuitId: null,
      furnitureId: null,
      hostId: null,
      load: 0,
      ...p,
    };
    points.push(full);
    return full;
  };

  const seedOf = (r: RoomModel): Vec2 | undefined => project.rooms.find((x) => x.id === r.id)?.seed as Vec2 | undefined;
  const furnOf = (r: RoomModel) => model.furniture.filter((f) => f.roomId === r.id);

  for (const room of rooms) {
    const poly = room.polygon!;
    const edges = roomEdges(room, model);
    const centroid = polygonCentroid(poly, seedOf(room));
    const roomFurn = furnOf(room);
    const wet = WET_USES.has(room.use);
    const bath = room.use === 'bathroom';

    // Distribui `n` posições ao longo das paredes, longe das portas.
    const along = (n: number, shifts?: number[]): { pos: Vec2; hostId: string }[] => {
      const total = edges.reduce((s, e) => s + e.len, 0);
      const out: { pos: Vec2; hostId: string }[] = [];
      if (total <= EPS) return out;
      for (let i = 0; i < n; i++) {
        let s = ((i + 0.5) * total) / n + (shifts?.[i] ?? 0);
        let e: EdgeInfo | undefined;
        for (const cand of edges) {
          e = cand;
          if (s <= cand.len + EPS) break;
          s -= cand.len;
        }
        if (!e) continue;
        let t = s;
        for (const [d0, d1] of e.doors) {
          if (t > d0 - 0.3 && t < d1 + 0.3) t = t - (d0 + d1) / 2 < 0 ? d0 - 0.3 : d1 + 0.3;
        }
        t = Math.min(Math.max(t, 0.2), Math.max(0.2, e.len - 0.2));
        out.push({ pos: onEdge(e, t), hostId: e.wall.id });
      }
      return out;
    };

    // Ponto na parede atrás de `p`, deslocado `shift` m ao longo dela.
    const wallPoint = (p: Vec2, shift = 0): { pos: Vec2; hostId: string | null } => {
      const ne = nearestEdge(edges, p);
      if (!ne) return { pos: p, hostId: null };
      let t = ne.t + shift;
      t = Math.min(Math.max(t, 0.15), Math.max(0.15, ne.edge.len - 0.15));
      return { pos: onEdge(ne.edge, t), hostId: ne.edge.wall.id };
    };

    // --- Iluminação --------------------------------------------------------------
    const extra = room.area > k.lightBaseArea ? Math.floor((room.area - k.lightBaseArea) / k.lightStepArea + EPS) : 0;
    const lightVA = k.lightBaseVA + extra * k.lightStepVA;
    const nLights = room.area > 16 ? Math.max(2, Math.ceil(room.area / 12 - EPS)) : 1;
    const xs = poly.map((p) => p[0]);
    const ys = poly.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    for (let i = 0; i < nLights; i++) {
      let pos = centroid;
      if (nLights > 1) {
        const f = (i + 0.5) / nLights;
        const cand: Vec2 = x1 - x0 >= y1 - y0 ? [x0 + (x1 - x0) * f, centroid[1]] : [centroid[0], y0 + (y1 - y0) * f];
        if (pointInPolygon(cand, poly, 0)) pos = cand;
      }
      add({
        kind: 'light',
        level: room.level,
        position: pos,
        height: room.ceiling.avg,
        roomId: room.id,
        label: `Ponto de luz (${room.name}): ${fmt(Math.round((lightVA / nLights) * 10) / 10)} VA`,
        load: lightVA / nLights,
      });
    }

    // --- Interruptor -----------------------------------------------------------------
    let sw: { pos: Vec2; hostId: string } | null = null;
    const withDoor = edges.find((e) => e.doors.length > 0);
    if (withDoor) {
      const [d0, d1] = withDoor.doors[0]!;
      const before = d0 - 0.15;
      const after = d1 + 0.15;
      const okB = before >= 0.1;
      const okA = after <= withDoor.len - 0.1;
      const t = okB && (!okA || d0 >= withDoor.len - d1) ? before : okA ? after : Math.min(Math.max(before, 0.1), withDoor.len - 0.1);
      sw = { pos: onEdge(withDoor, t), hostId: withDoor.wall.id };
    } else if (edges.length > 0) {
      const longest = edges.reduce((a, b) => (b.len > a.len ? b : a));
      sw = { pos: onEdge(longest, longest.len / 2), hostId: longest.wall.id };
    }
    if (sw) {
      add({ kind: 'switch', level: room.level, position: sw.pos, height: 1.1, roomId: room.id, hostId: sw.hostId, label: `Interruptor (${room.name})` });
    }

    // --- Tomadas de uso geral ------------------------------------------------------------
    const outletDefs: { kind: InstallationPointKind; height: number; load: number; pos?: Vec2; hostId?: string | null }[] = [];
    if (bath) {
      const sink = roomFurn.find((f) => f.item === 'furn_bath_sink');
      let pos: Vec2 | undefined;
      let hostId: string | null = null;
      if (sink) {
        const b = furnitureBack(sink);
        const wp = wallPoint(b.back, b.width / 2 + 0.25);
        pos = wp.pos;
        hostId = wp.hostId;
      } else {
        const a = along(1, [0])[0];
        pos = a?.pos;
        hostId = a?.hostId ?? null;
      }
      outletDefs.push({ kind: 'outlet_high', height: 1.1, load: k.wetOutletVA, ...(pos ? { pos } : {}), hostId });
    } else if (room.use === 'circulation' || room.use === 'storage') {
      if (room.area > 2.25) outletDefs.push({ kind: 'outlet', height: 0.3, load: k.outletVA });
    } else {
      const per = wet ? k.wetOutletPerimeter : k.outletPerimeter;
      let n = Math.ceil(room.perimeter / per - EPS);
      if (room.area <= 6) n = Math.max(n, 1);
      for (let i = 0; i < n; i++) {
        const high = wet && i < k.wetOutletHighCount;
        outletDefs.push({ kind: high ? 'outlet_high' : 'outlet', height: high ? 1.1 : 0.3, load: high ? k.wetOutletVA : k.outletVA });
      }
    }
    if (outletDefs.some((d) => !d.pos)) {
      const spots = along(outletDefs.filter((d) => !d.pos).length);
      if (wet) {
        // as tomadas altas ficam acima da bancada: as mais próximas dos balcões
        const cs = roomFurn.filter((f) => COUNTER_ITEMS.has(f.item)).map(furnitureCenter);
        if (cs.length > 0) {
          const dist = (p: Vec2) => Math.min(...cs.map((c) => manhattan(c, p)));
          spots.sort((a, b) => dist(a.pos) - dist(b.pos));
        }
      }
      let si = 0;
      for (const d of outletDefs) {
        if (d.pos) continue;
        const s = spots[si++];
        if (s) {
          d.pos = s.pos;
          d.hostId = s.hostId;
        } else d.pos = centroid;
      }
    }
    for (const d of outletDefs) {
      add({
        kind: d.kind,
        level: room.level,
        position: d.pos ?? centroid,
        height: d.height,
        roomId: room.id,
        hostId: d.hostId ?? null,
        label: `${d.kind === 'outlet_high' ? 'Tomada alta' : 'Tomada'} (${room.name}): ${d.load} VA`,
        load: d.load,
      });
    }

    // --- Móveis: TUE, água e esgoto -----------------------------------------------------------
    for (const f of roomFurn) {
      const spec = catalog.furniture.find((x) => x.id === f.item);
      if (!spec) continue;
      const { back, width } = furnitureBack(f);
      const ext = { roomId: room.id, level: f.level, furnitureId: f.id };
      const tue = k.tuePower[f.item];
      if (tue !== undefined) {
        const wp = wallPoint(back, width / 2 + 0.2);
        add({ kind: 'tue', position: wp.pos, height: 0.3, hostId: wp.hostId, label: `${spec.name}: ${tue} W`, load: tue, item: f.item, ...ext });
      }
      if (f.item === 'furn_shower' && inst.waterHeater === 'electric_shower') {
        const wp = wallPoint(back, 0);
        const w = k.tuePower.electric_shower ?? 0;
        add({ kind: 'tue', position: wp.pos, height: 2.1, hostId: wp.hostId, label: `Chuveiro elétrico: ${w} W`, load: w, item: 'electric_shower', ...ext });
      }
      if (!spec.water) continue;
      const wp = wallPoint(back, 0);
      const h = f.item === 'furn_shower' ? 2.1 : 0.6;
      const w = { position: wp.pos, hostId: wp.hostId, ...ext };
      add({ kind: 'water_cold', height: h, label: `Água fria: ${spec.name}`, ...w });
      if (inst.waterHeater !== 'electric_shower' && HOT_ITEMS.has(f.item)) {
        add({ kind: 'water_hot', height: h, label: `Água quente: ${spec.name}`, ...w });
      }
      const dia = SEWER_100.has(f.item) ? 100 : 40;
      add({ kind: 'sewer', height: 0, label: `Esgoto ${dia} mm: ${spec.name}`, dia, ...w });
    }

    // --- Caixa sifonada ---------------------------------------------------------------------------
    if (bath || room.use === 'laundry') {
      const anchor = roomFurn.find((f) => f.item === 'furn_shower' || f.item === 'furn_washer' || f.item === 'furn_tank');
      add({
        kind: 'drain',
        level: room.level,
        position: anchor ? furnitureCenter(anchor) : centroid,
        height: 0,
        roomId: room.id,
        label: `Caixa sifonada (${room.name})`,
      });
    }
  }

  // Móveis com água ou TUE fora de cômodo marcado não geram pontos (sem parede de referência).

  // --- Quadro ---------------------------------------------------------------------------------------
  const groundRooms = rooms.filter((r) => r.level === ground.id);
  let panelPos: Vec2 = [0, 0];
  let panelHost: string | null = null;
  let panelRoom: string | null = null;
  if (inst.panel) {
    panelPos = [inst.panel[0], inst.panel[1]];
    const r = groundRooms.find((x) => pointInPolygon(panelPos, x.polygon!, 0));
    panelRoom = r?.id ?? null;
  } else if (groundRooms.length > 0) {
    const door = model.openings.find((o) => o.valid && o.hostKind === 'wall' && o.type === 'door' && o.hostId === 'ext-front');
    const dw = door ? model.walls.find((w) => w.id === door.hostId) : undefined;
    let ref: Vec2;
    if (door && dw) {
      const c = (door.u0 + door.u1) / 2;
      const wl = dw.length || 1;
      ref = [dw.from[0] + ((dw.to[0] - dw.from[0]) / wl) * c, dw.from[1] + ((dw.to[1] - dw.from[1]) / wl) * c];
    } else ref = polygonCentroid(groundRooms[0]!.polygon!);
    let best: { room: RoomModel; edge: EdgeInfo; t: number; d: number } | null = null;
    for (const r of groundRooms) {
      for (const e of roomEdges(r, model)) {
        if (e.wall.exteriorSide !== null) continue; // parede interna
        const t = Math.min(Math.max((ref[0] - e.from[0]) * e.dir[0] + (ref[1] - e.from[1]) * e.dir[1], 0.3), Math.max(0.3, e.len - 0.3));
        const p = onEdge(e, t);
        const d = manhattan(p, ref);
        if (!best || d < best.d - EPS) best = { room: r, edge: e, t, d };
      }
    }
    if (!best) {
      // sem parede interna: usa a parede externa mais próxima da porta
      for (const r of groundRooms) {
        for (const e of roomEdges(r, model)) {
          const t = Math.min(Math.max((ref[0] - e.from[0]) * e.dir[0] + (ref[1] - e.from[1]) * e.dir[1], 0.3), Math.max(0.3, e.len - 0.3));
          const d = manhattan(onEdge(e, t), ref);
          if (!best || d < best.d - EPS) best = { room: r, edge: e, t, d };
        }
      }
    }
    if (best) {
      panelPos = onEdge(best.edge, best.t);
      panelHost = best.edge.wall.id;
      panelRoom = best.room.id;
    } else panelPos = ref;
  }
  const panel: PointEx = {
    id: 'panel-1',
    kind: 'panel',
    level: ground.id,
    position: panelPos,
    height: 1.5,
    roomId: panelRoom,
    hostId: panelHost,
    furnitureId: null,
    circuitId: null,
    label: 'Quadro de distribuição',
    load: 0,
  };
  if (rooms.length > 0) points.push(panel);

  // --- Caixa d'água ------------------------------------------------------------------------------------
  let tank: TankInfo | null = null;
  if (rooms.length > 0) {
    const bedrooms = project.rooms.filter((r) => r.use === 'bedroom').length;
    const occupants = inst.occupants ?? Math.max(2, k.personsPerBedroom * bedrooms);
    const dailyLiters = occupants * k.waterPerPerson;
    const need = dailyLiters * k.reserveDays;
    const sizes = [...k.tankSizes].sort((a, b) => a - b);
    const liters = sizes.find((s) => s >= need - EPS) ?? sizes[sizes.length - 1]!;
    const xs = model.footprint.map((p) => p[0]);
    const ys = model.footprint.map((p) => p[1]);
    const center: Vec2 = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    const baths = rooms.filter((r) => r.use === 'bathroom');
    const pool = baths.length > 0 ? baths : rooms;
    let host = pool[0]!;
    let bd = Infinity;
    for (const r of pool) {
      const d = manhattan(polygonCentroid(r.polygon!, seedOf(r)), center);
      if (d < bd - EPS) {
        bd = d;
        host = r;
      }
    }
    const pos = polygonCentroid(host.polygon!, seedOf(host));
    const tmat = catalog.materials.find((m) => m.id === `water_tank_${liters}`);
    const point: PointEx = {
      id: 'tank-1',
      kind: 'tank',
      level: host.level,
      position: pos,
      height: host.ceiling.avg,
      roomId: host.id,
      hostId: null,
      furnitureId: null,
      circuitId: null,
      label: `Caixa d'água ${String(liters).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} L`,
      load: 0,
    };
    points.push(point);
    tank = {
      point,
      liters,
      dailyLiters,
      occupants,
      roomId: host.id,
      roomName: host.name,
      fullKg: liters + (tmat?.massPerUnit ?? 0),
    };
  }
  return { points, panel, tank, rooms };
}
