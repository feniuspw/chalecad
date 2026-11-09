/**
 * Terreno inclinado na apresentação (funções puras, sem three nem DOM): a altura do terreno em qualquer ponto,
 * igual à malha do motor (platô, corte e aterro) no lote e continuando o mesmo plano de declive em volta, até
 * a inclinação se dissolver longe da casa (para se misturar com os morros do horizonte).
 *
 * A altura dentro da malha vem da própria malha do motor (platô, pads, taludes e muros: sem fórmula duplicada aqui). Alturas na cena (y para cima), com o piso da casa em y = 0 e o platô 3 cm abaixo (`terrainZOffset`). Os pontos de
 * entrada são do motor (x, y de planta); `surfaceY` recebe coordenadas da cena (x, z) e converte (y = -z).
 */
import { meshZ, type Project, type TerrainReport } from '@chalecad/engine';
import type { Rect } from './foliage';
import { groundHeight, type TerrainShape } from './landscape';
import { terrainZOffset } from './terrain';

const DEG = Math.PI / 180;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1e-9)));
  return t * t * (3 - 2 * t);
};

export interface SlopeSurface {
  slopePct: number;
  downhillAzimuthDeg: number;
  /** Malha do motor (pads, taludes e muros já aplicados): a altura dentro dela é a dela. */
  mesh: TerrainReport['mesh'];
  /** Centro da edificação em planta (motor): o terreno natural tem z = 0 aqui. */
  center: [number, number];
  /** Platô (planta, motor) e sua cota relativa ao terreno natural no centro. */
  platform: Rect;
  platformZ: number;
  /** Caixa da malha do lote desenhada pelo `TerrainView` (planta, motor). */
  meshRect: Rect;
  /** Caixa do que foi mexido (platô, cortes e aterros). Nada cresce aqui. */
  lotRect: Rect;
  /** A inclinação é plena até `fadeStart` do centro e some em `fadeEnd` (metros). */
  fadeStart: number;
  fadeEnd: number;
}

/** Superfície do terreno inclinado a partir do site, do contorno da casa e do relatório do motor; null se plano. */
export function slopeSurfaceFrom(site: Project['site'], footprint: readonly (readonly [number, number])[], terrain: TerrainReport | null): SlopeSurface | null {
  if (site.type !== 'sloped' || !terrain || footprint.length === 0) return null;
  const xs = footprint.map((p) => p[0]);
  const ys = footprint.map((p) => p[1]);
  const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
  const house = terrain.pads.find((q) => q.id === 'house')?.polygon ?? terrain.pads[0]?.polygon ?? [];
  const hx = house.map((q) => q[0]);
  const hy = house.map((q) => q[1]);
  const platform: Rect = house.length
    ? { minX: Math.min(...hx), minY: Math.min(...hy), maxX: Math.max(...hx), maxY: Math.max(...hy) }
    : { minX: bx0, minY: by0, maxX: bx1, maxY: by1 };
  const meshRect: Rect = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const lotRect: Rect = { ...platform };
  const p = terrain.mesh.positions;
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i]!, y = p[i + 1]!;
    meshRect.minX = Math.min(meshRect.minX, x);
    meshRect.maxX = Math.max(meshRect.maxX, x);
    meshRect.minY = Math.min(meshRect.minY, y);
    meshRect.maxY = Math.max(meshRect.maxY, y);
    if (Math.abs(terrain.mesh.cut[i / 3] ?? 0) > 1e-3) {
      lotRect.minX = Math.min(lotRect.minX, x);
      lotRect.maxX = Math.max(lotRect.maxX, x);
      lotRect.minY = Math.min(lotRect.minY, y);
      lotRect.maxY = Math.max(lotRect.maxY, y);
    }
  }
  // Pads e muros do usuário também não recebem vegetação (mesmo com corte/aterro zero).
  for (const pad of terrain.pads) {
    for (const v of pad.polygon) {
      lotRect.minX = Math.min(lotRect.minX, v[0]);
      lotRect.maxX = Math.max(lotRect.maxX, v[0]);
      lotRect.minY = Math.min(lotRect.minY, v[1]);
      lotRect.maxY = Math.max(lotRect.maxY, v[1]);
    }
  }
  if (!Number.isFinite(meshRect.minX)) return null;
  const center: [number, number] = [(bx0 + bx1) / 2, (by0 + by1) / 2];
  const half = Math.hypot(Math.max(center[0] - meshRect.minX, meshRect.maxX - center[0]), Math.max(center[1] - meshRect.minY, meshRect.maxY - center[1]));
  return {
    slopePct: site.slopePct,
    downhillAzimuthDeg: site.downhillAzimuthDeg,
    mesh: terrain.mesh,
    center,
    platform,
    platformZ: terrain.platformZ,
    meshRect,
    lotRect,
    fadeStart: half + 60,
    fadeEnd: half + 280,
  };
}

/** Raio (m) em volta do centro que o lote ocupa (para o relevo do chão só começar depois dele). */
export const lotHalfDiagonal = (s: SlopeSurface): number => s.fadeStart - 60;

/** Plano natural no ponto (motor): z = -tan(slope) · ((x-cx) sin(az) + (y-cy) cos(az)). */
export function naturalZ(s: SlopeSurface, x: number, y: number): number {
  const az = s.downhillAzimuthDeg * DEG;
  return (-s.slopePct / 100) * ((x - s.center[0]) * Math.sin(az) + (y - s.center[1]) * Math.cos(az));
}

/**
 * Altura do terreno em (x, y) de planta do motor: a da malha do motor (platô, pads, taludes, muros) dentro dela e,
 * fora e longe do lote, o plano natural com a inclinação dissolvida (sem descontinuidade).
 */
export function slopeHeight(s: SlopeSurface, x: number, y: number): number {
  const inside = x >= s.meshRect.minX && x <= s.meshRect.maxX && y >= s.meshRect.minY && y <= s.meshRect.maxY;
  const fin = inside ? meshZ(s.mesh, x, y) : naturalZ(s, x, y);
  const r = Math.hypot(x - s.center[0], y - s.center[1]);
  return (fin + terrainZOffset(s.platformZ)) * (1 - smooth(s.fadeStart, s.fadeEnd, r));
}

export interface SurfaceCtx {
  slope: SlopeSurface | null;
  shape: TerrainShape;
  /** Centro do relevo (x, z da cena). */
  center: [number, number];
  /** Cota do chão plano (terreno plano). Com declive, a cota vem de `slopeHeight`. */
  groundY: number;
}

/** Altura do chão na cena em (x, z): declive do lote (se houver) mais o relevo dos morros longe da casa. */
export function surfaceY(c: SurfaceCtx, sx: number, sz: number): number {
  const rel = groundHeight(sx - c.center[0], sz - c.center[1], c.shape);
  return (c.slope ? slopeHeight(c.slope, sx, -sz) : c.groundY) + rel;
}
