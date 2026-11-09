/**
 * Onde cada ferramenta da paleta põe o ponto (puro): tomada, interruptor, TUE e quadro encaixam na face da parede
 * com a altura padrão do tipo (catálogo `heights`); "Luz" vai ao teto dentro do cômodo ou vira arandela na parede.
 */
import type { Catalog } from '@chalecad/catalog';
import type { ElecPoint, Vec2 } from '@chalecad/engine';
import { pointInPoly } from './lightGrid';
import type { ElecToolId } from './kinds';
import { snapToWallFace, type OpeningSpan, type WallHit, type WallLike } from './wallSnap';

type ElecK = Catalog['constants']['electrical'];

export interface PlaceRoom {
  id: string;
  polygon: Vec2[];
  ceilingAvg: number;
  use: string;
  area: number;
}

export interface PlaceEnv {
  levelId: string;
  walls: WallLike[];
  openings: OpeningSpan[];
  rooms: PlaceRoom[];
  k: ElecK;
}

export interface PlaceOptions {
  appliance: string;
  switchType: 'one_way' | 'two_way';
  luminaire: string;
}

export interface Proposal {
  /** Ponto pronto, sem `id`. */
  point: Omit<ElecPoint, 'id'>;
  hit: WallHit | null;
  roomId: string | null;
  /** Texto do fantasma ("Tomada 0,30 m"). */
  label: string;
  /** Orientação do símbolo: normal da parede (ou null no teto). */
  normal: Vec2 | null;
}

export const roomAt = (rooms: PlaceRoom[], p: Vec2): PlaceRoom | null => rooms.find((r) => pointInPoly(p, r.polygon)) ?? null;

/** Altura da caixa do TUE pelo aparelho: ar-condicionado e chuveiro no alto, forno e micro-ondas na bancada, o resto baixo. */
export function applianceHeight(key: string, k: ElecK): number {
  if (key.startsWith('ac_')) return k.heights.high;
  if (key === 'electric_shower' || key === 'electric_faucet') return 2.2;
  if (key === 'oven' || key === 'microwave' || key === 'dishwasher') return k.heights.mid;
  return k.heights.low;
}

const fm = (h: number) => `${h.toFixed(2).replace('.', ',')} m`;

/** Luminária de parede (arandela) preferida: a escolhida se for de parede, senão a primeira do catálogo. */
export function wallLuminaire(k: ElecK, chosen: string): string {
  const c = k.luminaires.find((l) => l.id === chosen);
  if (c?.type === 'wall') return c.id;
  return k.luminaires.find((l) => l.type === 'wall')?.id ?? chosen;
}

export function ceilingLuminaire(k: ElecK, chosen: string): string {
  const c = k.luminaires.find((l) => l.id === chosen);
  if (c && c.type !== 'wall') return c.id;
  return k.defaultLuminaire;
}

/** Distância máxima (m) do cursor à face da parede para encaixar. */
export const WALL_REACH = 0.4;
/** Luz: dentro dessa distância da parede vira arandela. */
export const SCONCE_REACH = 0.22;

export function proposePoint(tool: ElecToolId, p: Vec2, env: PlaceEnv, o: PlaceOptions, reach = WALL_REACH): Proposal | null {
  const { k } = env;
  if (tool === 'none' || tool === 'conduit') return null;
  const wallProposal = (height: number, build: (hit: WallHit) => Omit<ElecPoint, 'id'>, label: string): Proposal | null => {
    const hit = snapToWallFace(p, env.walls, { maxDist: reach, height, openings: env.openings, snapU: 0.05 });
    if (!hit) return null;
    const room = roomAt(env.rooms, [hit.point[0] + hit.normal[0] * 0.05, hit.point[1] + hit.normal[1] * 0.05]);
    return { point: build(hit), hit, roomId: room?.id ?? null, label: `${label} · ${fm(height)}`, normal: hit.normal };
  };
  const base = (hit: WallHit, height: number) => ({ level: env.levelId, position: hit.point, hostId: hit.wallId, height });
  switch (tool) {
    case 'socket':
      return wallProposal(k.heights.low, (h) => ({ kind: 'socket', ...base(h, k.heights.low) }), 'Tomada baixa');
    case 'socket_mid':
      return wallProposal(k.heights.mid, (h) => ({ kind: 'socket', ...base(h, k.heights.mid) }), 'Tomada média');
    case 'socket_high':
      return wallProposal(k.heights.high, (h) => ({ kind: 'socket_high', ...base(h, k.heights.high) }), 'Tomada alta');
    case 'socket_tue': {
      const height = applianceHeight(o.appliance, k);
      const label = k.appliances[o.appliance]?.label ?? 'Uso específico';
      return wallProposal(height, (h) => ({ kind: 'socket_tue', ...base(h, height), appliance: o.appliance }), label);
    }
    case 'switch':
      return wallProposal(k.heights.switch, (h) => ({ kind: 'switch', ...base(h, k.heights.switch), switchType: o.switchType, controls: [] }), o.switchType === 'two_way' ? 'Interruptor paralelo' : 'Interruptor simples');
    case 'panel':
      return wallProposal(k.heights.panel, (h) => ({ kind: 'data', ...base(h, k.heights.panel) }), 'Quadro de distribuição');
    case 'light': {
      const room = roomAt(env.rooms, p);
      const wall = snapToWallFace(p, env.walls, { maxDist: SCONCE_REACH, height: k.heights.wallLight, openings: env.openings, snapU: 0.05 });
      if (wall) {
        const lum = wallLuminaire(k, o.luminaire);
        return {
          point: { kind: 'light', level: env.levelId, position: wall.point, hostId: wall.wallId, height: k.heights.wallLight, luminaire: lum, count: 1 },
          hit: wall,
          roomId: room?.id ?? roomAt(env.rooms, [wall.point[0] + wall.normal[0] * 0.05, wall.point[1] + wall.normal[1] * 0.05])?.id ?? null,
          label: `Arandela · ${fm(k.heights.wallLight)}`,
          normal: wall.normal,
        };
      }
      if (!room) return null;
      const pos: Vec2 = [Math.round(p[0] * 20) / 20, Math.round(p[1] * 20) / 20];
      return {
        point: { kind: 'light', level: env.levelId, position: pos, height: room.ceilingAvg, luminaire: ceilingLuminaire(k, o.luminaire), count: 1 },
        hit: null,
        roomId: room.id,
        label: `Luz no teto · ${fm(room.ceilingAvg)}`,
        normal: null,
      };
    }
  }
}

/** Nova posição de um ponto arrastado: parede-hospedado continua na parede (encaixa de novo), teto continua no teto. */
export function relocatePoint(pt: ElecPoint, p: Vec2, env: PlaceEnv, reach = 0.6): { position: Vec2; hostId?: string; height?: number } | null {
  if (pt.hostId || pt.kind === 'socket' || pt.kind === 'socket_high' || pt.kind === 'socket_tue' || pt.kind === 'switch') {
    const hit = snapToWallFace(p, env.walls, { maxDist: reach, height: pt.height, openings: env.openings, snapU: 0.05 });
    return hit ? { position: hit.point, hostId: hit.wallId } : null;
  }
  const room = roomAt(env.rooms, p);
  if (!room) return null;
  return { position: [Math.round(p[0] * 20) / 20, Math.round(p[1] * 20) / 20], height: room.ceilingAvg };
}
