/**
 * Retorno de iluminância ao vivo (puro): "cômodo: X lux / alvo Y lux" a partir do resultado do motor
 * (`results.installations.electrical.lighting`), sem refazer a fórmula: E = Φ·Fu·Fm / A com o Fu do próprio cômodo.
 */
import type { Catalog } from '@chalecad/catalog';
import type { RoomLightingResult } from '@chalecad/engine';

type ElecK = Catalog['constants']['electrical'];

export interface LuxReading {
  lux: number;
  target: number;
  min: number;
  /** Abaixo do mínimo da tabela. */
  low: boolean;
}

export const lightingOf = (lighting: RoomLightingResult[] | undefined, roomId: string | null | undefined): RoomLightingResult | undefined =>
  roomId ? lighting?.find((l) => l.roomId === roomId) : undefined;

/** Leitura atual do cômodo. */
export function currentLux(l: RoomLightingResult | undefined): LuxReading | null {
  return l ? { lux: l.avgLux, target: l.targetLux, min: l.minLux, low: l.lumens > 0 && l.avgLux < l.minLux } : null;
}

/** Lux do cômodo se `lumens` a mais (ou a menos, negativo) entrassem. */
export function luxWithExtra(l: RoomLightingResult | undefined, lumens: number, k: ElecK): LuxReading | null {
  if (!l || l.area <= 0) return null;
  const lux = (Math.max(0, l.lumens + lumens) * l.fu * k.lighting.maintenanceFactor) / l.area;
  return { lux, target: l.targetLux, min: l.minLux, low: lux < l.minLux };
}

const n0 = (n: number) => String(Math.round(n));

/** "Sala: 180 lux / alvo 200 lux". */
export function luxText(name: string, r: LuxReading): string {
  return `${name}: ${n0(r.lux)} lux / alvo ${n0(r.target)} lux${r.low ? ` (abaixo do mínimo de ${n0(r.min)})` : ''}`;
}

/** Potência da luminária (VA aproximada pelo fator de potência do LED). */
export const lightVA = (watts: number, count: number, k: ElecK): number => (watts * count) / k.lighting.ledPowerFactor;
