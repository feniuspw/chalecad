/**
 * Vegetação e cenários do modo Apresentação (funções puras, sem three nem DOM).
 * `SCENARIOS` define o conjunto de sprites, o chão, os morros e a névoa de cada cenário;
 * `scatter` distribui as plantas (Poisson disk com semente fixa) fora da folga da casa e do caminho da porta.
 * Coordenadas em planta do motor: [x, y] em metros (a cena converte).
 */
import { rng } from './textures';

export type ScenarioId = 'field' | 'mountain' | 'beach' | 'none';

export const SCENARIO_IDS: ScenarioId[] = ['field', 'mountain', 'beach', 'none'];

export type SpriteId = 'tree_round' | 'tree_araucaria' | 'tree_conifer' | 'tree_palm' | 'bush_round' | 'bush_flower' | 'grass_tuft';

export type SpriteKind = 'tree' | 'shrub' | 'grass';

export interface SpriteInfo {
  id: SpriteId;
  kind: SpriteKind;
  /** Largura / altura do sprite. */
  aspect: number;
  /** Altura real (m): mínimo e máximo. */
  height: [number, number];
  /** Tamanho do canvas (px). */
  canvas: [number, number];
}

export const SPRITES: Record<SpriteId, SpriteInfo> = {
  tree_round: { id: 'tree_round', kind: 'tree', aspect: 0.9, height: [6, 10], canvas: [288, 320] },
  tree_araucaria: { id: 'tree_araucaria', kind: 'tree', aspect: 0.62, height: [13, 21], canvas: [256, 412] },
  tree_conifer: { id: 'tree_conifer', kind: 'tree', aspect: 0.5, height: [8, 14], canvas: [224, 448] },
  tree_palm: { id: 'tree_palm', kind: 'tree', aspect: 0.85, height: [6, 10], canvas: [320, 376] },
  bush_round: { id: 'bush_round', kind: 'shrub', aspect: 1.25, height: [0.8, 1.4], canvas: [256, 205] },
  bush_flower: { id: 'bush_flower', kind: 'shrub', aspect: 1.2, height: [0.7, 1.25], canvas: [256, 213] },
  grass_tuft: { id: 'grass_tuft', kind: 'grass', aspect: 1, height: [0.28, 0.62], canvas: [160, 160] },
};

export interface Scenario {
  id: ScenarioId;
  label: string;
  trees: { sprite: SpriteId; weight: number }[];
  shrubs: { sprite: SpriteId; weight: number }[];
  grass: SpriteId | null;
  /** Textura e tom do chão (multiplica a textura neutra), de dia e de noite. */
  ground: { texture: 'grass' | 'sand'; day: string; night: string; patchA: string; patchB: string };
  /** Morros do horizonte: cor, alturas (m) das camadas próxima e distante. */
  hills: { color: string; near: [number, number]; far: [number, number] };
  /** Névoa exponencial (densidade por metro). */
  fogDensity: number;
  /** Mar no horizonte (praia). */
  sea: boolean;
  /** Ondulação do chão longe da casa: amplitude (m). */
  relief: number;
  /** Multiplicadores de densidade (árvores, arbustos, grama). */
  density: { trees: number; shrubs: number; grass: number };
}

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  field: {
    id: 'field',
    label: 'Campo',
    trees: [
      { sprite: 'tree_round', weight: 0.9 },
      { sprite: 'tree_conifer', weight: 0.1 },
    ],
    shrubs: [
      { sprite: 'bush_round', weight: 0.65 },
      { sprite: 'bush_flower', weight: 0.35 },
    ],
    grass: 'grass_tuft',
    ground: { texture: 'grass', day: '#86ad5a', night: '#3f4d3c', patchA: '#79a24c', patchB: '#a9b463' },
    hills: { color: '#6f8d5e', near: [10, 26], far: [22, 46] },
    fogDensity: 0.0021,
    sea: false,
    relief: 4.2,
    density: { trees: 1, shrubs: 1, grass: 1 },
  },
  mountain: {
    id: 'mountain',
    label: 'Serra',
    trees: [
      { sprite: 'tree_araucaria', weight: 0.5 },
      { sprite: 'tree_conifer', weight: 0.42 },
      { sprite: 'tree_round', weight: 0.08 },
    ],
    shrubs: [{ sprite: 'bush_round', weight: 1 }],
    grass: 'grass_tuft',
    ground: { texture: 'grass', day: '#86a263', night: '#454f43', patchA: '#7c9a58', patchB: '#9a9d63' },
    hills: { color: '#4f6d68', near: [38, 78], far: [70, 140] },
    fogDensity: 0.0027,
    sea: false,
    relief: 11,
    density: { trees: 1.15, shrubs: 0.7, grass: 1 },
  },
  beach: {
    id: 'beach',
    label: 'Praia',
    trees: [
      { sprite: 'tree_palm', weight: 0.85 },
      { sprite: 'tree_round', weight: 0.15 },
    ],
    shrubs: [
      { sprite: 'bush_flower', weight: 0.6 },
      { sprite: 'bush_round', weight: 0.4 },
    ],
    grass: 'grass_tuft',
    ground: { texture: 'sand', day: '#e4d4a8', night: '#5d5e5e', patchA: '#e9d9af', patchB: '#d9d0a2' },
    hills: { color: '#7d9a73', near: [4, 10], far: [8, 18] },
    fogDensity: 0.0016,
    sea: true,
    relief: 1.6,
    density: { trees: 0.7, shrubs: 0.8, grass: 0.45 },
  },
  none: {
    id: 'none',
    label: 'Sem cenário',
    trees: [],
    shrubs: [],
    grass: null,
    ground: { texture: 'grass', day: '#8aa863', night: '#4c5a45', patchA: '#8aa863', patchB: '#8aa863' },
    hills: { color: '#6f8d5e', near: [0, 0], far: [0, 0] },
    fogDensity: 0,
    sea: false,
    relief: 0,
    density: { trees: 0, shrubs: 0, grass: 0 },
  },
};

/** Conjunto de sprites de um cenário (sem repetir); vazio em "Sem cenário". */
export function scenarioSprites(id: ScenarioId): SpriteId[] {
  const s = SCENARIOS[id];
  const out = new Set<SpriteId>();
  for (const t of s.trees) out.add(t.sprite);
  for (const t of s.shrubs) out.add(t.sprite);
  if (s.grass) out.add(s.grass);
  return [...out];
}

// ---------------------------------------------------------------------------
// Geometria 2D
// ---------------------------------------------------------------------------

export interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function expandRect(r: Rect, m: number): Rect {
  return { minX: r.minX - m, minY: r.minY - m, maxX: r.maxX + m, maxY: r.maxY + m };
}

/** Distância de um ponto ao retângulo (0 dentro). */
export function distToRect(r: Rect, x: number, y: number): number {
  const dx = Math.max(r.minX - x, 0, x - r.maxX);
  const dy = Math.max(r.minY - y, 0, y - r.maxY);
  return Math.hypot(dx, dy);
}

/** Distância de um ponto a uma polilinha. */
export function distToPolyline(line: readonly (readonly [number, number])[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i]!, b = line[i + 1]!;
    const abx = b[0] - a[0], aby = b[1] - a[1];
    const len2 = abx * abx + aby * aby || 1e-9;
    const t = Math.min(1, Math.max(0, ((x - a[0]) * abx + (y - a[1]) * aby) / len2));
    best = Math.min(best, Math.hypot(x - (a[0] + abx * t), y - (a[1] + aby * t)));
  }
  return best;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1e-9)));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------
// Distribuição
// ---------------------------------------------------------------------------

/** Quantidades máximas por qualidade (a distribuição pára no limite ou quando não cabe mais). */
export const FOLIAGE_COUNTS = {
  high: { trees: 60, shrubs: 70, grass: 1400, far: 220 },
  light: { trees: 24, shrubs: 28, grass: 320, far: 80 },
} as const;

export type FoliageCounts = { trees: number; shrubs: number; grass: number; far: number };

export interface Placement {
  sprite: SpriteId;
  /** Posição em planta (motor). */
  x: number;
  y: number;
  /** Altura da planta (m). */
  height: number;
  /** Giro em torno do eixo vertical (rad). */
  rot: number;
  /** Árvore distante (vira billboard). */
  far: boolean;
}

export interface ScatterOptions {
  seed: string;
  scenario: ScenarioId;
  /** Retângulo de folga em volta da casa (bbox + 4 m): nada cresce dentro dele. */
  clear: Rect;
  /** Caminho da porta (polilinha) e meia-largura; nada cresce em cima dele. */
  path: readonly (readonly [number, number])[] | null;
  pathHalfWidth: number;
  counts: FoliageCounts;
  /** Raio (m) da área próxima; as árvores distantes ficam além dele até `farRadius`. */
  radius: number;
  farRadius: number;
}

interface Grid {
  cell: number;
  map: Map<string, [number, number, number][]>;
}
const gridKey = (cx: number, cy: number) => `${cx},${cy}`;
const newGrid = (cell: number): Grid => ({ cell, map: new Map() });
function gridAdd(g: Grid, x: number, y: number, r: number) {
  const k = gridKey(Math.floor(x / g.cell), Math.floor(y / g.cell));
  const a = g.map.get(k);
  if (a) a.push([x, y, r]);
  else g.map.set(k, [[x, y, r]]);
}
function gridNear(g: Grid, x: number, y: number, minDist: (r: number) => number): boolean {
  const cx = Math.floor(x / g.cell), cy = Math.floor(y / g.cell);
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const a = g.map.get(gridKey(cx + dx, cy + dy));
      if (!a) continue;
      for (const [px, py, r] of a) if (Math.hypot(x - px, y - py) < minDist(r)) return true;
    }
  }
  return false;
}

function pick<T extends { weight: number }>(items: readonly T[], r: number): T | undefined {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let t = r * total;
  for (const i of items) {
    t -= i.weight;
    if (t <= 0) return i;
  }
  return items[items.length - 1];
}

/**
 * Distribui árvores, arbustos e capim com Poisson disk (tentativa de dardos com grade de vizinhos) e semente fixa:
 * a mesma entrada dá sempre o mesmo resultado. Grama alta fica perto das bordas da folga; árvores, mais longe.
 */
export function scatter(o: ScatterOptions): Placement[] {
  const sc = SCENARIOS[o.scenario];
  const out: Placement[] = [];
  if (o.scenario === 'none') return out;
  const rand = rng(`${o.seed}|${o.scenario}`);
  const cx = (o.clear.minX + o.clear.maxX) / 2;
  const cy = (o.clear.minY + o.clear.maxY) / 2;
  const R = o.radius;
  const onPath = (x: number, y: number, margin: number) => !!o.path && distToPolyline(o.path, x, y) < o.pathHalfWidth + margin;
  let nTrees = 0, nShrubs = 0, nGrass = 0, nFar = 0;
  const treeGrid = newGrid(6);
  const allGrid = newGrid(3);
  const height = (id: SpriteId) => {
    const [a, b] = SPRITES[id].height;
    return a + (b - a) * rand();
  };

  // árvores próximas
  const maxTrees = Math.round(o.counts.trees * sc.density.trees);
  if (sc.trees.length > 0) {
    const minD = 11;
    for (let attempt = 0; attempt < maxTrees * 40 && nTrees < maxTrees; attempt++) {
      const x = cx + (rand() * 2 - 1) * R, y = cy + (rand() * 2 - 1) * R;
      if (Math.hypot(x - cx, y - cy) > R) continue;
      const d = distToRect(o.clear, x, y);
      if (d < 9) continue; // copa larga: bem longe da folga
      if (rand() > 0.1 + 0.9 * smooth(9, 40, d)) continue;
      if (onPath(x, y, 3.2)) continue;
      if (gridNear(treeGrid, x, y, () => minD)) continue;
      const t = pick(sc.trees, rand())!;
      gridAdd(treeGrid, x, y, 0);
      gridAdd(allGrid, x, y, 1.6);
      nTrees++;
      out.push({ sprite: t.sprite, x, y, height: height(t.sprite), rot: rand() * Math.PI, far: false });
    }
  }

  // arbustos
  const maxShrubs = Math.round(o.counts.shrubs * sc.density.shrubs);
  if (sc.shrubs.length > 0) {
    const minD = 2.6;
    const shrubGrid = newGrid(3);
    for (let attempt = 0; attempt < maxShrubs * 40 && nShrubs < maxShrubs; attempt++) {
      const x = cx + (rand() * 2 - 1) * R * 0.55, y = cy + (rand() * 2 - 1) * R * 0.55;
      const d = distToRect(o.clear, x, y);
      if (d < 0.8 || d > 30) continue;
      if (rand() > 0.15 + 0.85 * (1 - smooth(0.8, 30, d))) continue;
      if (onPath(x, y, 1.1)) continue;
      if (gridNear(shrubGrid, x, y, () => minD)) continue;
      if (gridNear(allGrid, x, y, (r) => r + 1.2)) continue;
      const t = pick(sc.shrubs, rand())!;
      gridAdd(shrubGrid, x, y, 0);
      gridAdd(allGrid, x, y, 1.0);
      nShrubs++;
      out.push({ sprite: t.sprite, x, y, height: height(t.sprite), rot: rand() * Math.PI, far: false });
    }
  }

  // capim: alto perto das bordas da folga
  const maxGrass = Math.round(o.counts.grass * sc.density.grass);
  if (sc.grass) {
    const minD = 0.75;
    const grassGrid = newGrid(2);
    for (let attempt = 0; attempt < maxGrass * 30 && nGrass < maxGrass; attempt++) {
      const x = cx + (rand() * 2 - 1) * R * 0.42, y = cy + (rand() * 2 - 1) * R * 0.42;
      const d = distToRect(o.clear, x, y);
      if (d < 0.5 || d > 24) continue;
      if (rand() > 1 - smooth(0.5, 24, d) * 0.92) continue;
      if (onPath(x, y, 0.55)) continue;
      if (gridNear(grassGrid, x, y, () => minD)) continue;
      if (gridNear(allGrid, x, y, (r) => r * 0.6)) continue;
      gridAdd(grassGrid, x, y, 0);
      nGrass++;
      out.push({ sprite: sc.grass, x, y, height: height(sc.grass) * (0.7 + 0.6 * smooth(0.5, 10, d)), rot: rand() * Math.PI, far: false });
    }
  }

  // árvores distantes (horizonte): anel entre `radius` e `farRadius`
  const maxFar = Math.round(o.counts.far * sc.density.trees);
  if (sc.trees.length > 0) {
    const farGrid = newGrid(14);
    for (let attempt = 0; attempt < maxFar * 30 && nFar < maxFar; attempt++) {
      const ang = rand() * Math.PI * 2;
      const r = Math.sqrt(R * R + rand() * (o.farRadius * o.farRadius - R * R));
      const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r;
      if (gridNear(farGrid, x, y, () => 11)) continue;
      const t = pick(sc.trees, rand())!;
      gridAdd(farGrid, x, y, 0);
      nFar++;
      out.push({ sprite: t.sprite, x, y, height: height(t.sprite) * (1 + 0.5 * smooth(R, o.farRadius, r)), rot: 0, far: true });
    }
  }
  return out;
}
