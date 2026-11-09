import { getMaterial, type Catalog } from '@chalecad/catalog';
import type { Item } from '../quantities/items';
import type { Project } from '../schema/project';
import type { BuildingModel, EngineWarning, TerrainReport } from '../schema/results';
import { GROUND_BELOW_FLOOR, type SiteSurface } from './surface';

export { flatSurface, GROUND_BELOW_FLOOR, type SiteSurface } from './surface';

type Sloped = Extract<Project['site'], { type: 'sloped' }>;

const DEG = Math.PI / 180;

/**
 * Parâmetros numéricos do método (não são constantes técnicas do domínio). As premissas técnicas
 * (altura de dreno, limites de alerta, km por viagem extra) vêm de `catalog.constants.terrainRules`.
 */
export const TERRAIN = {
  /** Passo da grade de integração dos volumes (m). */
  volumeStep: 0.25,
  /** Passo da malha de render (m) e margem extra além dos taludes (m). */
  meshStep: 0.5,
  meshMargin: 3,
  /** Alcance máximo dos taludes além do platô (m): limita o custo quando o talude nunca encontra o terreno. */
  maxReach: 25,
  bisectIterations: 50,
  /** Volume (m³) abaixo do qual não há movimento de terra. */
  eps: 1e-6,
} as const;

export interface TerrainResult {
  report: TerrainReport;
  /** Linhas de quantidade da etapa `terrain`. */
  items: Item[];
  warnings: EngineWarning[];
  /** Fase 18. Terreno acabado ponto a ponto (coordenadas da casa). */
  surface: SiteSurface;
}

const fmt = (n: number, d = 2) => n.toFixed(d).replace('.', ',');

interface Plat {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Plano natural: z = -tan(slope) · ((x-cx) sin(az) + (y-cy) cos(az)); z = 0 no centro da edificação. */
function naturalFn(site: Sloped, cx: number, cy: number): (x: number, y: number) => number {
  const t = site.slopePct / 100;
  const az = site.downhillAzimuthDeg * DEG;
  const sx = Math.sin(az);
  const cz = Math.cos(az);
  return (x, y) => -t * ((x - cx) * sx + (y - cy) * cz);
}

/** Distância euclidiana de (x, y) ao retângulo do platô (0 dentro). */
function distToPlat(p: Plat, x: number, y: number): number {
  const dx = Math.max(p.x0 - x, 0, x - p.x1);
  const dy = Math.max(p.y0 - y, 0, y - p.y1);
  return Math.hypot(dx, dy);
}

/**
 * Superfície final em um ponto: platô em `zp`; fora dele, taludes de corte (sobe 1/cutHV por metro)
 * e de aterro (desce 1/fillHV), limitados pelo terreno natural: final = clamp(natural, plano de aterro, plano de corte).
 */
function finalZ(nat: number, d: number, zp: number, site: Sloped): number {
  const hi = zp + d / site.cutSlopeHV;
  const lo = zp - d / site.fillSlopeHV;
  return nat > hi ? hi : nat < lo ? lo : nat;
}

/** Alcance horizontal (m) além do platô em que o talude encontra o terreno, dado desnível máximo h0 no platô. */
function reach(site: Sloped, h0: number): number {
  const t = site.slopePct / 100;
  const r = (g: number) => (g - t > 1e-9 ? h0 / (g - t) : TERRAIN.maxReach);
  return Math.min(TERRAIN.maxReach, Math.max(r(1 / site.cutSlopeHV), r(1 / site.fillSlopeHV)) + 1);
}

interface Grid {
  nat: Float64Array;
  dist: Float64Array;
  cell: number;
}

function buildGrid(plat: Plat, natural: (x: number, y: number) => number, E: number): Grid {
  const s = TERRAIN.volumeStep;
  const nxl = Math.ceil(E / s);
  const px = Math.ceil((plat.x1 - plat.x0) / s);
  const py = Math.ceil((plat.y1 - plat.y0) / s);
  const nx = px + 2 * nxl;
  const ny = py + 2 * nxl;
  const nat = new Float64Array(nx * ny);
  const dist = new Float64Array(nx * ny);
  const gx0 = plat.x0 - nxl * s;
  const gy0 = plat.y0 - nxl * s;
  let k = 0;
  for (let j = 0; j < ny; j++) {
    const y = gy0 + (j + 0.5) * s;
    for (let i = 0; i < nx; i++, k++) {
      const x = gx0 + (i + 0.5) * s;
      nat[k] = natural(x, y);
      dist[k] = distToPlat(plat, x, y);
    }
  }
  return { nat, dist, cell: s * s };
}

function volumes(g: Grid, zp: number, site: Sloped): { cut: number; fill: number } {
  let cut = 0;
  let fill = 0;
  for (let k = 0; k < g.nat.length; k++) {
    const n = g.nat[k]!;
    const diff = n - finalZ(n, g.dist[k]!, zp, site);
    if (diff > 0) cut += diff;
    else fill -= diff;
  }
  return { cut: cut * g.cell, fill: fill * g.cell };
}

/**
 * Terreno inclinado: platô, corte e aterro, taludes, malha, transporte e linhas de quantidade.
 * Retorna null para terreno plano.
 *
 * Convenção de volumes (swell = `terrain.swellFactor`, comp = `terrain.compactionFactor`):
 * - corte medido no corte (m³ in situ); aterro medido compactado (m³ no lugar);
 * - solo do corte disponível para aterro = corte · swell · comp (empola ao escavar, reduz ao compactar);
 * - `auto`: zp tal que corte · swell · comp = aterro (bisseção);
 * - exportação (solto, transportado) = max(0, corte·swell − aterro/comp);
 * - importação (solto)              = max(0, aterro/comp − corte·swell).
 *
 * Platô isolado, zp = natural no centro, inclinação t, dimensão L ao longo da descida e W transversal:
 * prisma triangular, corte = aterro = (1/8)·L²·W·t (cada metade é uma cunha de base L/2·W e altura t·L/2).
 */
export function computeTerrain(project: Project, model: BuildingModel, catalog: Catalog): TerrainResult | null {
  const site = project.site;
  if (site.type !== 'sloped') return null;
  const tc = catalog.constants.terrain;
  const tr = catalog.constants.terrainRules;
  const swell = tc.swellFactor;
  const comp = tc.compactionFactor;
  const s = TERRAIN.volumeStep;

  const xs = model.footprint.map((p) => p[0]);
  const ys = model.footprint.map((p) => p[1]);
  const bx0 = Math.min(...xs);
  const bx1 = Math.max(...xs);
  const by0 = Math.min(...ys);
  const by1 = Math.max(...ys);
  const cx = (bx0 + bx1) / 2;
  const cy = (by0 + by1) / 2;
  const m = site.platformMargin;
  const plat: Plat = { x0: bx0 - m.left, x1: bx1 + m.right, y0: by0 - m.front, y1: by1 + m.back };
  const natural = naturalFn(site, cx, cy);

  // Desnível natural máximo sobre o platô (extremos nos cantos: plano).
  const corners: [number, number][] = [[plat.x0, plat.y0], [plat.x1, plat.y0], [plat.x0, plat.y1], [plat.x1, plat.y1]];
  const hn = Math.max(...corners.map(([x, y]) => Math.abs(natural(x, y))));
  const pe = site.platformElevation;

  let zp: number;
  let grid: Grid;
  let balance: (z: number) => number;
  if (pe === 'auto') {
    grid = buildGrid(plat, natural, reach(site, 2 * hn + 1));
    balance = (z) => {
      const v = volumes(grid, z, site);
      return v.cut * swell * comp - v.fill;
    };
    if (site.slopePct === 0) zp = 0;
    else {
      let lo = -hn - 1;
      let hi = hn + 1;
      for (let i = 0; i < TERRAIN.bisectIterations; i++) {
        const mid = (lo + hi) / 2;
        // Subir o platô reduz corte e aumenta aterro: balance decresce com zp.
        if (balance(mid) > 0) lo = mid;
        else hi = mid;
      }
      zp = (lo + hi) / 2;
    }
  } else {
    zp = pe;
    grid = buildGrid(plat, natural, reach(site, hn + Math.abs(zp)));
  }

  const vol = volumes(grid, zp, site);
  const cutVolume = vol.cut;
  const fillVolume = vol.fill;
  const loose = cutVolume * swell;
  const needed = fillVolume / comp;
  const exportVolume = Math.max(0, loose - needed);
  const importVolume = Math.max(0, needed - loose);
  const moved = cutVolume + fillVolume;
  const machineDays = moved > TERRAIN.eps ? Math.max(1, Math.ceil(moved / tc.excavatorM3PerDay - 1e-9)) : 0;
  const truckLoads = Math.max(0, Math.ceil(Math.max(exportVolume, importVolume) / tc.truckM3 - 1e-9));

  // Área inclinada dos taludes.
  let slopeArea = 0;
  const kc = Math.sqrt(1 + 1 / (site.cutSlopeHV * site.cutSlopeHV));
  const kf = Math.sqrt(1 + 1 / (site.fillSlopeHV * site.fillSlopeHV));
  for (let k = 0; k < grid.nat.length; k++) {
    const d = grid.dist[k]!;
    if (d <= 0) continue;
    const n = grid.nat[k]!;
    if (n > zp + d / site.cutSlopeHV) slopeArea += grid.cell * kc;
    else if (n < zp - d / site.fillSlopeHV) slopeArea += grid.cell * kf;
  }

  // Pé dos taludes de corte: borda do platô com corte > limite recebe geotêxtil e dreno.
  let cutEdgeMax = 0;
  let drainLen = 0;
  let geoArea = 0;
  const edge = (ax: number, ay: number, bx: number, by: number) => {
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.ceil(len / s));
    const step = len / n;
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n;
      const h = natural(ax + (bx - ax) * f, ay + (by - ay) * f) - zp;
      if (h > cutEdgeMax) cutEdgeMax = h;
      if (h > tr.drainCutHeight) {
        drainLen += step;
        geoArea += step * h * kc;
      }
    }
  };
  edge(plat.x0, plat.y0, plat.x1, plat.y0);
  edge(plat.x0, plat.y1, plat.x1, plat.y1);
  edge(plat.x0, plat.y0, plat.x0, plat.y1);
  edge(plat.x1, plat.y0, plat.x1, plat.y1);

  const report: TerrainReport = {
    platformZ: zp,
    cutVolume,
    fillVolume,
    exportVolume,
    importVolume,
    slopeArea,
    machineDays,
    truckLoads,
    mesh: buildMesh(plat, natural, site, zp, hn),
    pads: [
      {
        id: 'house',
        polygon: [[plat.x0, plat.y0], [plat.x1, plat.y0], [plat.x1, plat.y1], [plat.x0, plat.y1]],
        z: zp,
        area: (plat.x1 - plat.x0) * (plat.y1 - plat.y0),
      },
    ],
    walls: [],
  };
  const surface: SiteSurface = {
    platformZ: zp,
    groundZ: (x, y) => finalZ(natural(x, y), distToPlat(plat, x, y), zp, site) - zp - GROUND_BELOW_FLOOR,
    naturalZ: (x, y) => natural(x, y) - zp - GROUND_BELOW_FLOOR,
    slopePct: site.slopePct,
  };

  // Linhas de quantidade.
  const items: Item[] = [];
  const add = (itemId: string, net: number, note?: string) => {
    if (!(net > 0)) return;
    const mat = getMaterial(catalog, itemId);
    const it: Item = { hostId: 'terrain', stage: 'terrain', itemId, net, kg: net * mat.massPerUnit, inWeight: false };
    if (note) it.note = note;
    items.push(it);
  };
  add(
    'excavator_day',
    machineDays,
    `corte ${fmt(cutVolume, 1)} m³, aterro ${fmt(fillVolume, 1)} m³ (inclui compactação)`,
  );
  // Viagens equivalentes = cargas · (1 + km/20): o fator representa o aumento do ciclo com a distância ao bota-fora.
  const trips = Math.ceil(truckLoads * (1 + site.disposalDistanceKm / tr.kmPerExtraTrip) - 1e-9);
  add(
    'truck_trip',
    trips,
    `${truckLoads} carga(s) de ${fmt(Math.max(exportVolume, importVolume), 1)} m³ ${importVolume > exportVolume ? 'importados' : 'exportados'}, distância ${fmt(site.disposalDistanceKm, 1)} km (fator ${fmt(1 + site.disposalDistanceKm / tr.kmPerExtraTrip)})`,
  );
  add('geotextile', geoArea);
  add('drain_pipe', drainLen);

  // Alertas.
  const warnings: EngineWarning[] = [];
  if (site.slopePct > tr.steepPct) {
    warnings.push({
      code: 'terrain.steep',
      severity: 'warn',
      message: `Terreno com ${fmt(site.slopePct, 0)}% de inclinação (acima de ${tr.steepPct}%): considere fundação em palafita/estacas.`,
    });
  }
  if (cutEdgeMax > tr.cutWarnHeight) {
    warnings.push({
      code: 'terrain.cut_height',
      severity: 'warn',
      message: `Talude de corte de até ${fmt(cutEdgeMax)} m (acima de ${tr.cutWarnHeight} m): exige contenção ou projeto geotécnico.`,
    });
  }
  const fillUnder = Math.max(...model.footprint.map((p) => zp - natural(p[0], p[1])));
  if (fillUnder > tr.fillUnderBuilding) {
    warnings.push({
      code: 'terrain.fill_under',
      severity: 'warn',
      message: `Aterro de até ${fmt(fillUnder)} m sob a edificação: aterro sob radier exige compactação controlada.`,
    });
  }

  return { report, items, warnings, surface };
}

function buildMesh(
  plat: Plat,
  natural: (x: number, y: number) => number,
  site: Sloped,
  zp: number,
  hn: number,
): TerrainReport['mesh'] {
  const st = TERRAIN.meshStep;
  const E = reach(site, hn + Math.abs(zp)) + TERRAIN.meshMargin;
  const x0 = plat.x0 - E;
  const y0 = plat.y0 - E;
  const nx = Math.ceil((plat.x1 - plat.x0 + 2 * E) / st);
  const ny = Math.ceil((plat.y1 - plat.y0 + 2 * E) / st);
  const positions: number[] = [];
  const cut: number[] = [];
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = x0 + i * st;
      const y = y0 + j * st;
      const n = natural(x, y);
      const z = finalZ(n, distToPlat(plat, x, y), zp, site);
      positions.push(x, y, z);
      cut.push(n - z);
    }
  }
  const indices: number[] = [];
  const w = nx + 1;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * w + i;
      indices.push(a, a + 1, a + w, a + 1, a + w + 1, a + w);
    }
  }
  return { positions, indices, cut };
}
