/** Paleta e materiais compartilhados dos móveis (um por token e tom) e cache de geometria por (modelo, tamanho). */
import * as THREE from 'three';
import type { FurnitureModelKind } from '@chalecad/catalog';
import { buildFurnitureParts } from './builders';
import type { Part, Size, Token } from './kit';

export type Tone = 'light' | 'wood' | 'dark' | 'white' | 'color';

export const TONES: { id: Tone | 'default'; label: string; hex: string }[] = [
  { id: 'default', label: 'Padrão', hex: '#cfcac2' },
  { id: 'light', label: 'Madeira clara', hex: '#e2cfa9' },
  { id: 'wood', label: 'Madeira', hex: '#a67c52' },
  { id: 'dark', label: 'Escuro', hex: '#4a4d52' },
  { id: 'white', label: 'Branco', hex: '#f1eee8' },
  { id: 'color', label: 'Cor', hex: '#6f8fa3' },
];

type Toned = Record<Tone | 'default', string>;

/** Cores que mudam com o tom: tecido, almofadas, madeira, corpo dos armários e tapete. */
const TONED: Partial<Record<Token, Toned>> = {
  fabric: { default: '#cfcac2', light: '#e4d8c3', wood: '#b58b5e', dark: '#4a4d52', white: '#f1eee8', color: '#6f8fa3' },
  cushion: { default: '#b9c4bd', light: '#c9b79a', wood: '#d9c3a0', dark: '#8a8f96', white: '#d9d4ca', color: '#e0b25c' },
  wood: { default: '#c9ab80', light: '#e2cfa9', wood: '#a67c52', dark: '#4a3a2e', white: '#eeeae2', color: '#c8794f' },
  body: { default: '#ece8e0', light: '#e3d3b2', wood: '#b48458', dark: '#3f3f43', white: '#fafaf8', color: '#7f9d8a' },
  rug: { default: '#cbbfae', light: '#e2d6bf', wood: '#a98b6a', dark: '#585b61', white: '#ece8df', color: '#7f9fb0' },
  rug2: { default: '#ddd3c4', light: '#efe6d3', wood: '#c1a785', dark: '#74777d', white: '#f7f4ee', color: '#a5bfcb' },
};

interface Fixed {
  color: string;
  roughness: number;
  metalness: number;
  opacity?: number;
}

const FIXED: Record<string, Fixed> = {
  linen: { color: '#f4f1ea', roughness: 0.9, metalness: 0 },
  blanket: { color: '#8da2a3', roughness: 0.95, metalness: 0 },
  white: { color: '#fbfbfa', roughness: 0.28, metalness: 0 },
  dark: { color: '#2f2f33', roughness: 0.6, metalness: 0.1 },
  black: { color: '#1b1c1f', roughness: 0.25, metalness: 0.2 },
  stone: { color: '#3d3f45', roughness: 0.35, metalness: 0.05 },
  steel: { color: '#cfd3d7', roughness: 0.32, metalness: 0.6 },
  brass: { color: '#c2a66d', roughness: 0.35, metalness: 0.7 },
  glass: { color: '#bfe3ef', roughness: 0.05, metalness: 0, opacity: 0.22 },
  leaf: { color: '#4f8a46', roughness: 0.7, metalness: 0 },
  leaf2: { color: '#6aa65a', roughness: 0.7, metalness: 0 },
  pot: { color: '#d9d2c6', roughness: 0.55, metalness: 0 },
  soil: { color: '#4a3a2c', roughness: 1, metalness: 0 },
  book1: { color: '#b5543d', roughness: 0.8, metalness: 0 },
  book2: { color: '#3f6a8a', roughness: 0.8, metalness: 0 },
  book3: { color: '#d8b45a', roughness: 0.8, metalness: 0 },
};

const ROUGH: Partial<Record<Token, number>> = { fabric: 0.95, cushion: 0.95, wood: 0.65, body: 0.55, rug: 1, rug2: 1 };

export function furnitureColor(token: Token, tone?: Tone): string {
  const t = TONED[token];
  if (t) return t[tone ?? 'default'];
  return FIXED[token]?.color ?? '#cccccc';
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();

/** Material compartilhado por (token, tom). Vive enquanto a página: nunca descarte. */
export function getFurnitureMaterial(token: Token, tone?: Tone): THREE.MeshStandardMaterial {
  const key = `${token}|${TONED[token] ? (tone ?? 'default') : ''}`;
  let m = matCache.get(key);
  if (m) return m;
  const fixed = TONED[token] ? undefined : FIXED[token];
  const glass = fixed?.opacity !== undefined;
  m = new THREE.MeshStandardMaterial({
    color: furnitureColor(token, tone),
    roughness: fixed?.roughness ?? ROUGH[token] ?? 0.7,
    metalness: fixed?.metalness ?? 0,
    transparent: glass,
    opacity: fixed?.opacity ?? 1,
    depthWrite: !glass,
    side: glass ? THREE.DoubleSide : THREE.FrontSide,
  });
  m.name = `furniture-${key}`;
  matCache.set(key, m);
  return m;
}

const partsCache = new Map<string, Part[]>();

/** Geometria memorizada por (modelo, tamanho); o tom só muda o material. */
export function getFurnitureParts(kind: FurnitureModelKind, size: Size): Part[] {
  const key = `${kind}|${size.w.toFixed(3)}|${size.d.toFixed(3)}|${size.h.toFixed(3)}`;
  let p = partsCache.get(key);
  if (!p) {
    p = buildFurnitureParts(kind, size);
    partsCache.set(key, p);
  }
  return p;
}
