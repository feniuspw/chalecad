/**
 * Dados puros da paisagem da apresentação (sem three nem DOM), memorizados por modelo: forma do relevo, caminho,
 * declive do lote, distribuição da vegetação e a altura em que cada planta pousa. O preparo assíncrono calcula
 * tudo isso antes da entrada e os componentes só leem do cache.
 */
import type { BuildingModel, Project, TerrainReport } from '@chalecad/engine';
import { expandRect, FOLIAGE_COUNTS, scatter, type Placement, type Rect, type ScenarioId } from './foliage';
import { clearRect, entryPath, SEA_DEPTH, terrainSeed, type TerrainShape } from './landscape';
import { lotHalfDiagonal, slopeSurfaceFrom, surfaceY, type SlopeSurface, type SurfaceCtx } from './slopedSite';

export interface LandscapeOptions {
  model: BuildingModel;
  terrain: TerrainReport | null;
  site: Project['site'];
  projectName: string;
  /** Centro (x, z da cena) e raio da casa e cota do chão plano. */
  center: [number, number];
  radius: number;
  groundY: number;
  scenario: ScenarioId;
  vegetation: boolean;
  quality: 'high' | 'light';
}

export interface LandscapeData {
  shape: TerrainShape;
  path: [number, number][] | null;
  slope: SlopeSurface | null;
  surface: SurfaceCtx;
  /** Retângulo (planta do motor) onde nada cresce: casa + 4 m e, com declive, o platô, cortes e aterros + 1 m. */
  clear: Rect;
  placements: Placement[];
}

/** Quanto a planta afunda no chão (m): o pé não fica no ar em terreno irregular. */
export const SINK = 0.03;

export function buildLandscapeData(o: LandscapeOptions): LandscapeData {
  const slope = slopeSurfaceFrom(o.site, o.model.footprint, o.terrain);
  const flatRadius = Math.max(36, o.radius + 28, slope ? lotHalfDiagonal(slope) + 8 : 0);
  const shape: TerrainShape = { scenario: o.scenario, flatRadius, seed: terrainSeed(o.projectName, o.scenario) };
  const surface: SurfaceCtx = { slope, shape, center: o.center, groundY: o.groundY };
  const path = entryPath(o.model);
  let clear = clearRect(o.model);
  if (slope) {
    const lot = expandRect(slope.lotRect, 1);
    clear = { minX: Math.min(clear.minX, lot.minX), minY: Math.min(clear.minY, lot.minY), maxX: Math.max(clear.maxX, lot.maxX), maxY: Math.max(clear.maxY, lot.maxY) };
  }
  const placements =
    !o.vegetation || o.scenario === 'none'
      ? []
      : scatter({ seed: o.projectName, scenario: o.scenario, clear, path, pathHalfWidth: 0.8, counts: FOLIAGE_COUNTS[o.quality], radius: 70, farRadius: 340 });
  return { shape, path, slope, surface, clear, placements };
}

const cache = new WeakMap<BuildingModel, Map<string, LandscapeData>>();

/** Mesmos dados, memorizados por modelo e opções (o preparo preenche; os componentes só leem). */
export function getLandscapeData(o: LandscapeOptions): LandscapeData {
  const key = [o.scenario, o.vegetation ? 'v' : '-', o.quality, o.projectName, JSON.stringify(o.site), o.terrain ? `${o.terrain.platformZ}|${o.terrain.mesh.positions.length}` : '-', o.radius.toFixed(3), o.center.join(',')].join('|');
  let byKey = cache.get(o.model);
  if (!byKey) cache.set(o.model, (byKey = new Map()));
  let hit = byKey.get(key);
  if (!hit) byKey.set(key, (hit = buildLandscapeData(o)));
  return hit;
}

export interface PlantItem {
  x: number;
  y: number;
  z: number;
  height: number;
  rot: number;
}
export interface PlantGroup {
  key: string;
  sprite: Placement['sprite'];
  far: boolean;
  items: PlantItem[];
}

/** Agrupa as plantas por sprite e as pousa na superfície (cena: x, z = -y); descarta as debaixo d'água. */
export function placeOnSurface(placements: readonly Placement[], surface: SurfaceCtx): PlantGroup[] {
  const out = new Map<string, PlantGroup>();
  const seaFloor = surface.groundY - SEA_DEPTH + 0.2;
  for (const p of placements) {
    const sx = p.x, sz = -p.y;
    const y = surfaceY(surface, sx, sz);
    if (y < seaFloor) continue;
    const key = `${p.sprite}|${p.far ? 'f' : 'n'}`;
    let g = out.get(key);
    if (!g) out.set(key, (g = { key, sprite: p.sprite, far: p.far, items: [] }));
    g.items.push({ x: sx, y: y - SINK, z: sz, height: p.height, rot: p.rot });
  }
  return [...out.values()];
}
