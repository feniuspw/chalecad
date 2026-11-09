import type { Catalog } from '@chalecad/catalog';
import { bbox2, pointInPolygon, type Vec2 } from '../../geometry';
import { ceilingZAt, levelElevationOf } from '../../model/rooms';
import type { BuildingModel, RoomModel, RoomLightingResult } from '../../schema/results';
import { polygonCentroid } from '../geo';
import { luminaireOf } from './loads';
import type { Ctx, ElecK, PointInfo } from './types';

/** Teto de luminárias por cômodo e de posições da grade (o schema limita `controls` de um interruptor a 20 pontos). */
export const MAX_GRID = 20;

/** Índice do recinto: K = c·l / (h·(c+l)), com h a distância da luminária ao plano de trabalho. */
export const roomIndex = (c: number, l: number, h: number): number => (c * l) / (Math.max(h, 0.1) * (c + l));

/** Fator de utilização por interpolação linear da tabela K → Fu (fora da faixa vale a ponta). */
export function utilization(K: number, k: ElecK): number {
  const t = [...k.lighting.utilization].sort((a, b) => a[0] - b[0]);
  const first = t[0]!;
  const last = t[t.length - 1]!;
  if (K <= first[0]) return first[1];
  if (K >= last[0]) return last[1];
  for (let i = 1; i < t.length; i++) {
    const [k1, f1] = t[i]!;
    const [k0, f0] = t[i - 1]!;
    if (K <= k1) return f0 + ((f1 - f0) * (K - k0)) / (k1 - k0);
  }
  return last[1];
}

/** Iluminância média (lux): E = Φ·Fu·Fm / A. */
export const avgLux = (lumens: number, fu: number, fm: number, area: number): number => (area > 0 ? (lumens * fu * fm) / area : 0);

/**
 * Índice do recinto e distância luminária–plano de trabalho. K usa a área e o perímetro reais do polígono
 * (K = 2·A / (h·P), igual ao retângulo c·l/(h·(c+l)) quando o cômodo é retangular); `c` e `l` ficam como as
 * dimensões do retângulo envolvente, usadas pela grade.
 */
export function roomDims(room: RoomModel, k: ElecK) {
  const poly = room.polygon!;
  const b = bbox2(poly);
  const c = b.max[0] - b.min[0];
  const l = b.max[1] - b.min[1];
  let perimeter = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    perimeter += Math.hypot(q[0] - a[0], q[1] - a[1]);
  }
  const plane = k.lighting.workPlane[room.use] ?? k.lighting.workPlane.other ?? 0.75;
  const h = Math.max(room.ceiling.avg - plane, 0.5);
  const K = perimeter > 0 ? (2 * room.area) / (Math.max(h, 0.1) * perimeter) : roomIndex(c, l, h);
  return { c, l, h, K, perimeter, min: b.min, max: b.max };
}

/** Fluxo luminoso (lm) que o cômodo precisa para o alvo e quantidade de luminárias de `lumensEach`. */
export function luminairesNeeded(room: RoomModel, lumensEach: number, k: ElecK): number {
  const d = roomDims(room, k);
  const fu = utilization(d.K, k);
  const target = k.lighting.targetLux[room.use] ?? k.lighting.targetLux.other ?? 150;
  return Math.max(1, Math.ceil((target * room.area) / (lumensEach * fu * k.lighting.maintenanceFactor) - 1e-9));
}

function gridTry(poly: Vec2[], n: number): Vec2[] {
  const b = bbox2(poly);
  const c = b.max[0] - b.min[0];
  const l = b.max[1] - b.min[1];
  const nx = Math.max(1, Math.min(n, Math.round(Math.sqrt((n * c) / Math.max(l, 0.1)))));
  const ny = Math.max(1, Math.ceil(n / nx));
  const out: Vec2[] = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const p: Vec2 = [b.min[0] + ((i + 0.5) * c) / nx, b.min[1] + ((j + 0.5) * l) / ny];
      if (pointInPolygon(p, poly, 0)) out.push([Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000]);
    }
  }
  return out;
}

/**
 * Grade de `n` posições no retângulo envolvente (Nx ≈ √(n·c/l) colunas, primeira a Sx/2 da parede), mantendo as
 * que caem dentro do polígono. Cômodo em L perde posições: então adensa a grade (n+1, n+2...) até sobrarem ao menos
 * `n` dentro; sem nenhuma dentro, usa `fallback`.
 */
export function gridPositions(poly: Vec2[], n: number, fallback: Vec2): Vec2[] {
  let out = gridTry(poly, n);
  if (out.length < n) {
    let best = out;
    for (let m = n + 1; m <= n * 4; m++) {
      const t = gridTry(poly, m);
      if (t.length > best.length) best = t;
      if (t.length >= n) break;
    }
    out = best;
  }
  return out.length > 0 ? out.slice(0, MAX_GRID) : [fallback];
}

/** Resultado luminotécnico de um cômodo a partir dos pontos de luz nele. */
export function roomLighting(room: RoomModel, lights: PointInfo[], k: ElecK): RoomLightingResult {
  const d = roomDims(room, k);
  const K = d.K;
  const fu = utilization(K, k);
  let lumens = 0;
  let watts = 0;
  for (const i of lights) {
    const lum = luminaireOf(k, i.p.luminaire);
    const n = i.p.count ?? 1;
    lumens += lum.lumens * n;
    watts += lum.watts * n;
  }
  const target = k.lighting.targetLux[room.use] ?? k.lighting.targetLux.other ?? 150;
  const min = k.lighting.minLux[room.use] ?? k.lighting.minLux.other ?? 100;
  const lux = avgLux(lumens, fu, k.lighting.maintenanceFactor, room.area);
  const status: RoomLightingResult['status'] = lights.length === 0 ? 'none' : lux < min ? 'low' : lux > 2 * target ? 'high' : 'ok';
  return { roomId: room.id, area: room.area, k: K, fu, lumens, avgLux: lux, targetLux: target, minLux: min, watts, status };
}

export function lightingResults(ctx: Ctx, infos: PointInfo[]): RoomLightingResult[] {
  const byRoom = new Map<string, PointInfo[]>();
  for (const i of infos) if (i.p.kind === 'light' && i.roomId) (byRoom.get(i.roomId) ?? byRoom.set(i.roomId, []).get(i.roomId)!).push(i);
  return ctx.rooms.map((r) => roomLighting(r, byRoom.get(r.id) ?? [], ctx.k));
}

/** Luminária que o gerador pode escolher para o teto interno: sem arandela, refletor externo nem fita. */
export const isInteriorCeilingType = (type: string): boolean => type !== 'wall' && type !== 'flood' && type !== 'strip';

/** Mais que isso e o gerador troca para o plafon maior do catálogo. */
export const PREFERRED_MAX_LIGHTS = 6;

export interface RoomLightingOptions {
  /** Luminária escolhida (id do catálogo). Arandela cai na padrão; refletor e fita valem só se escolhidos. */
  luminaire?: string;
  /** Posição para o centroide cair quando o do polígono estiver fora (L, U). */
  seed?: Vec2;
}

export interface RoomLightingSuggestion {
  /** Posições em planta (1 luz = centroide real do polígono). */
  positions: Vec2[];
  /** Altura do forro de cada posição acima do piso do nível (m): telhado e laje do mezanino. */
  heights: number[];
  /** Luminária usada (pode ser maior que a pedida, em cômodo grande). */
  luminaire: string;
  /** Luminárias pedidas pelo método e posições que couberam. */
  needed: number;
  count: number;
  /** Iluminância média esperada, alvo e mínimo (lux). */
  lux: number;
  target: number;
  minLux: number;
  /** Lux final abaixo do mínimo da tabela. */
  belowMin: boolean;
  watts: number;
}

/**
 * Sugestão de iluminação do cômodo pelo método dos lúmens: quantas luminárias, onde (centroide ou grade), qual
 * luminária (a pedida, ou o plafon de maior fluxo quando passa de 6) e o lux resultante. É a mesma que o
 * gerador automático usa, para a grade do editor e o traçado automático coincidirem.
 */
export function suggestRoomLighting(room: RoomModel, model: BuildingModel, catalog: Catalog, opts: RoomLightingOptions = {}): RoomLightingSuggestion | null {
  const k = catalog.constants.electrical;
  if (!room.polygon || room.polygon.length < 3) return null;
  const poly = room.polygon;
  const asked = k.luminaires.find((l) => l.id === opts.luminaire && l.type !== 'wall');
  let lum = asked ?? luminaireOf(k, k.defaultLuminaire);
  let n = luminairesNeeded(room, lum.lumens, k);
  if (n > PREFERRED_MAX_LIGHTS) {
    const bigger = k.luminaires.filter((l) => l.type === lum.type && l.lumens > lum.lumens && isInteriorCeilingType(l.type)).sort((a, b) => a.lumens - b.lumens);
    for (const cand of bigger) {
      lum = cand;
      n = luminairesNeeded(room, cand.lumens, k);
      if (n <= PREFERRED_MAX_LIGHTS) break;
    }
  }
  n = Math.min(MAX_GRID, n);
  const centroid = polygonCentroid(poly, opts.seed);
  const positions = n === 1 ? [centroid] : gridPositions(poly, n, centroid);
  const round = (p: Vec2): Vec2 => [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000];
  const placed = positions.map(round);
  const elev = levelElevationOf(model, room.level);
  const heights = placed.map((p) => Math.max(0, Math.round((ceilingZAt(model, room.level, p, elev) - elev) * 1000) / 1000));
  const d = roomDims(room, k);
  const fu = utilization(d.K, k);
  const target = k.lighting.targetLux[room.use] ?? k.lighting.targetLux.other ?? 150;
  const minLux = k.lighting.minLux[room.use] ?? k.lighting.minLux.other ?? 100;
  const lux = avgLux(lum.lumens * placed.length, fu, k.lighting.maintenanceFactor, room.area);
  return { positions: placed, heights, luminaire: lum.id, needed: n, count: placed.length, lux, target, minLux, belowMin: lux < minLux, watts: lum.watts * placed.length };
}
