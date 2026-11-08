/**
 * Texturas fotográficas CC0 (Poly Haven, 1K) em `public/textures/<asset>/{diff,nor,rough}.jpg`. Substituem as
 * procedurais nas qualidades Alta e Editor quando carregam; na Leve, ou se falharem, fica a procedural.
 *
 * Só materiais cuja cor vem da própria imagem: telha e grama/areia são tingidas pela cor do projeto ou do cenário e
 * continuam procedurais.
 */
import type { PbrTier } from './pbr';

export interface PhotoSpec {
  /** Pasta em `public/textures`. */
  asset: string;
  /** Lado real da foto em metros (dimensão informada pela Poly Haven). */
  size: number;
  /** Gira 90° para as tábuas/juntas correrem ao longo de u, como nas procedurais. */
  rotate?: boolean;
}

export const PHOTO_TEXTURES: Record<string, PhotoSpec> = {
  finish_floor_wood: { asset: 'wood_floor', size: 1.7, rotate: true },
  finish_floor_laminate: { asset: 'laminate_floor_02', size: 1.7 },
  finish_floor_vinyl: { asset: 'laminate_floor', size: 2 },
  finish_floor_porcelain: { asset: 'large_floor_tiles_02', size: 3 },
  finish_floor_ceramic: { asset: 'square_tiles_03', size: 2 },
  finish_wall_tile: { asset: 'long_white_tiles', size: 1.27 },
  finish_wall_paint: { asset: 'painted_plaster_wall', size: 2 },
  finish_ceiling_paint: { asset: 'white_plaster_02', size: 1 },
  finish_facade_texture: { asset: 'plastered_wall_04', size: 3.2 },
  finish_wall_wood: { asset: 'wood_plank_wall', size: 1 },
  finish_facade_wood: { asset: 'japanese_cedar_planks', size: 1.13, rotate: true },
  finish_facade_siding: { asset: 'white_planks_clean', size: 1.8, rotate: true },
  finish_facade_brick: { asset: 'red_brick_03', size: 1 },
  finish_ceiling_wood: { asset: 'hinoki_planks', size: 1.89 },
  deck_wood: { asset: 'wood_floor_deck', size: 1.8 },
  concrete: { asset: 'concrete_floor_02', size: 2 },
};

export type PhotoMap = 'diff' | 'nor' | 'rough';

/** Foto do material para a qualidade; undefined na Leve ou sem foto. */
export function photoFor(id: string | undefined, tier: PbrTier): PhotoSpec | undefined {
  if (!id || tier === 'light') return undefined;
  return PHOTO_TEXTURES[id];
}

export function photoUrl(spec: PhotoSpec, map: PhotoMap): string {
  return `/textures/${spec.asset}/${map}.jpg`;
}

/**
 * Ganho por canal para a média da imagem (RGBA) virar `target` (0–255): a cor e a rugosidade de cada acabamento
 * continuam as do catálogo de texturas, a foto só traz o detalhe. Ganho limitado para não estourar fotos muito escuras.
 */
export function meanGain(data: Uint8ClampedArray, target: [number, number, number]): [number, number, number] {
  const sum = [0, 0, 0];
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    sum[0]! += data[i]!;
    sum[1]! += data[i + 1]!;
    sum[2]! += data[i + 2]!;
  }
  const gain = (c: 0 | 1 | 2) => Math.min(3, Math.max(0.25, target[c] / Math.max(1, sum[c]! / n)));
  return [gain(0), gain(1), gain(2)];
}

/** Aplica o ganho de `meanGain` no lugar (alfa intacto). */
export function applyGain(data: Uint8ClampedArray, gain: [number, number, number]): void {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = data[i]! * gain[0];
    data[i + 1] = data[i + 1]! * gain[1];
    data[i + 2] = data[i + 2]! * gain[2];
  }
}

export function hexRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
