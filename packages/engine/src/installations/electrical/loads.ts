import { getAssembly, getMaterial, type Catalog } from '@chalecad/catalog';
import { pointInPolygon, distToSegment, type Vec2 } from '../../geometry';
import { ceilingZAt } from '../../model/rooms';
import type { ElecPoint, Project } from '../../schema/project';
import type { BuildingModel, RoomModel } from '../../schema/results';
import type { Ctx, ElecK, PointInfo } from './types';

const DEFAULT_CEILING = 2.6;
const NEAR_ROOM = 0.35;

/** Tensão fase-neutro: a do projeto, senão a sugerida pela UF, senão 127 V. */
export function resolveVoltage(project: Project, k: ElecK): number {
  return project.installations.electrical.voltage ?? k.voltageByUF[project.meta.region] ?? 127;
}

export function makeCtx(project: Project, model: BuildingModel, catalog: Catalog): Ctx {
  const k = catalog.constants.electrical;
  const insulated = new Set<string>();
  for (const w of model.walls) {
    if (insulated.has(w.assemblyId)) continue;
    try {
      const a = getAssembly(catalog, w.assemblyId);
      if (a.layers.some((l) => getMaterial(catalog, l.materialId).category === 'insulation')) insulated.add(w.assemblyId);
    } catch {
      /* assembly desconhecida: sem isolamento */
    }
  }
  return {
    project,
    model,
    catalog,
    k,
    voltage: resolveVoltage(project, k),
    rooms: model.rooms.filter((r) => r.polygon !== null),
    elev: new Map(project.levels.map((l) => [l.id, l.elevation])),
    insulatedAssemblies: insulated,
  };
}

/** Cômodo que contém o ponto (ou o mais próximo a até 35 cm, para caixas na face da parede). */
export function roomAt(ctx: Ctx, level: string, xy: Vec2): RoomModel | null {
  let best: RoomModel | null = null;
  let bd = Infinity;
  for (const r of ctx.rooms) {
    if (r.level !== level) continue;
    const poly = r.polygon!;
    if (pointInPolygon(xy, poly, 0)) return r;
    let d = Infinity;
    for (let i = 0; i < poly.length; i++) d = Math.min(d, distToSegment(xy, poly[i]!, poly[(i + 1) % poly.length]!));
    if (d < bd) {
      bd = d;
      best = r;
    }
  }
  return bd <= NEAR_ROOM ? best : null;
}

/**
 * Altura do forro (m acima do piso do nível) em um ponto da planta: o forro local (menor entre os planos do telhado e
 * o fundo da laje do mezanino), não a média do cômodo. Sem telhado nem paredes, a média dos cômodos do nível.
 */
export function ceilingAt(ctx: Ctx, level: string, xy: Vec2): number {
  const elev = ctx.elev.get(level) ?? 0;
  const h = ceilingZAt(ctx.model, level, xy, elev) - elev;
  if (h > 0.3) return h;
  const r = roomAt(ctx, level, xy);
  if (r) return r.ceiling.avg;
  const same = ctx.rooms.filter((x) => x.level === level);
  return same.length > 0 ? same.reduce((s, x) => s + x.ceiling.avg, 0) / same.length : DEFAULT_CEILING;
}

/** Carga mínima de iluminação do cômodo (VA), NBR 5410 9.5.2.1.2: 100 VA até 6 m² + 60 VA por 4 m² inteiros. */
export function lightingLoadVA(area: number, k: ElecK): number {
  const l = k.loads.lighting;
  if (area <= l.baseArea) return l.baseVA;
  return l.baseVA + Math.floor((area - l.baseArea) / l.stepArea + 1e-9) * l.stepVA;
}

const WET_USES = new Set(['kitchen', 'laundry', 'bathroom']);

/** Potência da n-ésima tomada (0-based) de um cômodo: 600 VA nas primeiras de área molhada e 100 VA nas demais. */
export function socketRuleVA(use: string, rank: number, k: ElecK): number {
  const s = k.loads.sockets;
  return WET_USES.has(use) && rank < s.wetHighCount ? s.wetVA : s.generalVA;
}

/** Mínimo de tomadas de uso geral do cômodo (NBR 5410 9.5.2.2.1). */
export function minSockets(room: Pick<RoomModel, 'use' | 'area' | 'perimeter'>, k: ElecK): number {
  const step = k.loads.sockets.perimeterStep;
  if (room.use === 'bathroom') return 1;
  if (room.use === 'kitchen' || room.use === 'laundry') return Math.max(1, Math.ceil(room.perimeter / step.wet - 1e-9));
  if (room.use === 'circulation' || room.use === 'storage' || room.use === 'other') {
    if (room.area <= 6) return 1;
  }
  return Math.max(1, Math.ceil(room.perimeter / step.other - 1e-9));
}

export interface ApplianceLoad {
  w: number;
  pf: number;
  curve?: 'B' | 'C';
  voltage?: 'FN' | 'FF';
  label: string;
}

/** Potência de uma luminária do catálogo; sem ela, a padrão. */
export function luminaireOf(k: ElecK, id: string | undefined) {
  return k.luminaires.find((l) => l.id === id) ?? k.luminaires.find((l) => l.id === k.defaultLuminaire) ?? k.luminaires[0]!;
}

/**
 * Cômodo, carga e cotas de todos os pontos. A carga é a informada (`powerVA`) ou a da regra:
 * luz = maior entre a regra de área (dividida pelos pontos do cômodo) e a soma das luminárias; tomada = 100/600 VA;
 * TUE = potência do aparelho / fator de potência (sem aparelho, 600 VA).
 */
export function pointInfos(ctx: Ctx, points: ElecPoint[]): PointInfo[] {
  const { k } = ctx;
  const infos: PointInfo[] = points.map((p) => {
    const r = roomAt(ctx, p.level, p.position);
    const elevation = ctx.elev.get(p.level) ?? 0;
    const zCeiling = elevation + ceilingAt(ctx, p.level, p.position);
    return { p, roomId: r?.id ?? null, loadVA: 0, ib: 0, zBox: elevation + p.height, zCeiling };
  });
  const lightsIn = new Map<string, number>();
  for (const i of infos) if (i.p.kind === 'light' && i.roomId) lightsIn.set(i.roomId, (lightsIn.get(i.roomId) ?? 0) + 1);
  const socketRank = new Map<string, number>();
  const roomById = new Map(ctx.rooms.map((r) => [r.id, r]));
  for (const i of infos) {
    const p = i.p;
    const room = i.roomId ? roomById.get(i.roomId) : undefined;
    let va = 0;
    if (p.kind === 'light') {
      const lum = luminaireOf(k, p.luminaire);
      const real = (lum.watts * (p.count ?? 1)) / k.lighting.ledPowerFactor;
      const rule = room ? lightingLoadVA(room.area, k) / (lightsIn.get(room.id) ?? 1) : 0;
      va = p.powerVA ?? Math.max(rule, real);
    } else if (p.kind === 'socket' || p.kind === 'socket_high') {
      const key = i.roomId ?? '-';
      const rank = socketRank.get(key) ?? 0;
      socketRank.set(key, rank + 1);
      va = p.powerVA ?? socketRuleVA(room?.use ?? 'other', rank, k);
    } else if (p.kind === 'socket_tue') {
      const ap = p.appliance ? k.appliances[p.appliance] : undefined;
      va = p.powerVA ?? (ap ? ap.w / ap.pf : k.loads.sockets.wetVA);
    }
    i.loadVA = va;
    i.ib = va / ctx.voltage;
  }
  return infos;
}

/** O ponto precisa de DR de 30 mA (NBR 5410 5.1.3.2.2)? Luz a 2,5 m ou mais, interruptor e infra seca ficam de fora. */
export function pointNeedsDr(k: ElecK, p: ElecPoint, roomUse: string | undefined): boolean {
  if (!roomUse || !k.dr.requiredRoomUses.includes(roomUse)) return false;
  if (p.kind === 'switch' || p.kind === 'data') return false;
  if (p.kind === 'light') return p.height < k.dr.excludeLightingAboveM;
  return true;
}
