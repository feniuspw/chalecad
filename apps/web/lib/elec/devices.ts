/**
 * Peças 3D dos pontos de parede (padrão brasileiro): placa 4×2 vertical, tomada NBR 14136 (rebaixo redondo com três
 * furos, o terra no meio e um pouco abaixo), TUE de 20 A (módulo vermelho e furos maiores), interruptor de tecla e
 * ponto de dados (RJ45). Puro: devolve as peças no referencial local da caixa (x para fora da parede, y para cima,
 * z ao longo da parede, metros) e a pose de cada ponto na cena (y para cima).
 */
import type { ElecPoint } from '@chalecad/engine';
import { controlInfo } from './control';

export type DevicePart = 'plate' | 'recess' | 'recessRed' | 'hole10' | 'hole20' | 'key' | 'rj45';

/** Medidas (m): placa 4"×2" (≈ 115 × 72 mm), rebaixo Ø 35 mm, pinos de 4 mm (10 A) e 4,8 mm (20 A), entre eixos 19 mm. */
export const DEVICE = {
  plate: { h: 0.115, w: 0.072, d: 0.008 },
  recess: { r: 0.0175, d: 0.003 },
  hole10: 0.002,
  hole20: 0.0024,
  pinSpacing: 0.019,
  earthDrop: 0.0035,
  key: { h: 0.042, w: 0.024, d: 0.006 },
  rj45: { h: 0.012, w: 0.014, d: 0.002 },
} as const;

export interface PartPose {
  part: DevicePart;
  /** Posição local [x (para fora), y (para cima), z (ao longo da parede)]. */
  at: [number, number, number];
  /** Largura ao longo da parede (só para a tecla, que muda com o número de teclas). */
  width?: number;
}

const WALL_KINDS = new Set<ElecPoint['kind']>(['socket', 'socket_high', 'socket_tue', 'switch', 'data']);

/** O ponto vira peça de parede no 3D? (tomadas, interruptores e dados presos a uma parede). */
export const isWallDevice = (p: ElecPoint): boolean => WALL_KINDS.has(p.kind) && !!p.hostId;

/** Tomada: rebaixo e três furos (fase e neutro lado a lado, terra no meio, um pouco abaixo). */
function socketParts(tue: boolean, cy = 0): PartPose[] {
  const x = DEVICE.plate.d;
  const hole: DevicePart = tue ? 'hole20' : 'hole10';
  const s = DEVICE.pinSpacing / 2;
  return [
    { part: tue ? 'recessRed' : 'recess', at: [x + DEVICE.recess.d / 2, cy, 0] },
    { part: hole, at: [x + DEVICE.recess.d + 0.0005, cy + 0.002, -s] },
    { part: hole, at: [x + DEVICE.recess.d + 0.0005, cy + 0.002, s] },
    { part: hole, at: [x + DEVICE.recess.d + 0.0005, cy + 0.002 - DEVICE.earthDrop, 0] },
  ];
}

/** Peças de um ponto no referencial local. `gangs` = teclas do interruptor (1 a 3). */
export function deviceParts(p: ElecPoint, gangs = 1): PartPose[] {
  const plate: PartPose = { part: 'plate', at: [DEVICE.plate.d / 2, 0, 0] };
  switch (p.kind) {
    case 'socket':
    case 'socket_high':
      return [plate, ...socketParts(false)];
    case 'socket_tue':
      return [plate, ...socketParts(true)];
    case 'switch': {
      const n = Math.min(3, Math.max(1, gangs));
      const w = DEVICE.key.w / (n === 1 ? 1 : 1.2);
      const step = w + 0.002;
      return [plate, ...Array.from({ length: n }, (_, i): PartPose => ({ part: 'key', at: [DEVICE.plate.d + DEVICE.key.d / 2, 0, (i - (n - 1) / 2) * step], width: w }))];
    }
    case 'data':
      return [plate, { part: 'rj45', at: [DEVICE.plate.d + DEVICE.rj45.d / 2, 0, 0] }];
    default:
      return [];
  }
}

/** Teclas de cada interruptor: uma por comando (letra) que ele aciona. */
export function switchGangs(points: ElecPoint[]): Map<string, number> {
  const info = controlInfo(points);
  const out = new Map<string, number>();
  for (const [id, letters] of info.switchLetters) out.set(id, Math.max(1, letters.length));
  return out;
}

export interface DevicePose {
  id: string;
  /** Centro da caixa na face da parede, na cena (y para cima). */
  pos: [number, number, number];
  /** Guinada em torno de Y que leva o +x local para fora da parede. */
  yaw: number;
  parts: PartPose[];
}

type V2 = [number, number];

/**
 * Pose de cada ponto de parede: centro na face (a posição do ponto) e a normal apontando para o cômodo, que é o lado
 * da parede em que o ponto está. `normalOf` devolve essa normal em planta (motor) ou null.
 */
export function devicePoses(points: ElecPoint[], elevations: Record<string, number>, normalOf: (p: ElecPoint) => V2 | null): DevicePose[] {
  const gangs = switchGangs(points);
  const out: DevicePose[] = [];
  for (const p of points) {
    if (!isWallDevice(p)) continue;
    const n = normalOf(p);
    if (!n) continue;
    const z = (elevations[p.level] ?? 0) + p.height;
    out.push({ id: p.id, pos: [p.position[0], z, -p.position[1]], yaw: Math.atan2(n[1], n[0]), parts: deviceParts(p, gangs.get(p.id) ?? 1) });
  }
  return out;
}
