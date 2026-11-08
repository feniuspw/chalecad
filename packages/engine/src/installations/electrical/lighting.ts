import { bbox2, pointInPolygon, type Vec2 } from '../../geometry';
import type { RoomModel, RoomLightingResult } from '../../schema/results';
import { luminaireOf } from './loads';
import type { Ctx, ElecK, PointInfo } from './types';

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

/** Dimensões do retângulo envolvente e distância luminária–plano de trabalho do cômodo. */
export function roomDims(room: RoomModel, k: ElecK) {
  const b = bbox2(room.polygon!);
  const c = b.max[0] - b.min[0];
  const l = b.max[1] - b.min[1];
  const plane = k.lighting.workPlane[room.use] ?? k.lighting.workPlane.other ?? 0.75;
  const h = Math.max(room.ceiling.avg - plane, 0.5);
  return { c, l, h, min: b.min, max: b.max };
}

/** Fluxo luminoso (lm) que o cômodo precisa para o alvo e quantidade de luminárias de `lumensEach`. */
export function luminairesNeeded(room: RoomModel, lumensEach: number, k: ElecK): number {
  const d = roomDims(room, k);
  const fu = utilization(roomIndex(d.c, d.l, d.h), k);
  const target = k.lighting.targetLux[room.use] ?? k.lighting.targetLux.other ?? 150;
  return Math.max(1, Math.ceil((target * room.area) / (lumensEach * fu * k.lighting.maintenanceFactor) - 1e-9));
}

/**
 * Grade de `n` posições no retângulo envolvente (Nx ≈ √(n·c/l) colunas, primeira a Sx/2 da parede), mantendo as
 * que caem dentro do polígono. Cômodo em L pode perder posições; sem nenhuma dentro, usa `fallback`.
 */
export function gridPositions(poly: Vec2[], n: number, fallback: Vec2): Vec2[] {
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
  return out.length > 0 ? out : [fallback];
}

/** Resultado luminotécnico de um cômodo a partir dos pontos de luz nele. */
export function roomLighting(room: RoomModel, lights: PointInfo[], k: ElecK): RoomLightingResult {
  const d = roomDims(room, k);
  const K = roomIndex(d.c, d.l, d.h);
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
