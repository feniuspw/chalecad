import { getMaterial, type Catalog } from '@chalecad/catalog';
import { polygonArea, polygonSelfIntersects, type Vec2 } from '../geometry';
import type { Item } from '../quantities/items';
import type { Project } from '../schema/project';
import type { BuildingModel, EngineWarning, TerrainReport, TerrainWall } from '../schema/results';
import { lotInProject } from './lot';
import { buildSamples, locate, makePad, normalizePolygon, type Loc, type PadGeom } from './pads';
import { autoRetainingType, retainingItems } from './retaining';
import { GROUND_BELOW_FLOOR, type SiteSurface } from './surface';
import { buildWall, decide, type DecideCtx, type WallReason } from './walls';

export { flatSurface, GROUND_BELOW_FLOOR, type SiteSurface } from './surface';
export { autoRetainingType, retainingItems, type RetainingLine, type RetainingType } from './retaining';
export { terrainProfile, meshZ, type TerrainProfile } from './profile';
export { fromLot, lotInProject } from './lot';

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

/**
 * Superfície final em um ponto: pad em `zp`; fora dele, taludes de corte (sobe 1/cutHV por metro)
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
  owner: Int16Array;
  samp: Int32Array;
  cell: number;
}

/** Grade de volumes sobre a caixa dos pads + alcance E; pré-calcula dono, distância e intervalo de borda por célula. */
function buildGrid(pads: PadGeom[], natural: (x: number, y: number) => number, E: number): Grid {
  const bx0 = Math.min(...pads.map((p) => p.bbox[0]));
  const by0 = Math.min(...pads.map((p) => p.bbox[1]));
  const bx1 = Math.max(...pads.map((p) => p.bbox[2]));
  const by1 = Math.max(...pads.map((p) => p.bbox[3]));
  const s = TERRAIN.volumeStep;
  const nxl = Math.ceil(E / s);
  const px = Math.ceil((bx1 - bx0) / s);
  const py = Math.ceil((by1 - by0) / s);
  const nx = px + 2 * nxl;
  const ny = py + 2 * nxl;
  const nat = new Float64Array(nx * ny);
  const dist = new Float64Array(nx * ny);
  const owner = new Int16Array(nx * ny);
  const samp = new Int32Array(nx * ny);
  const gx0 = bx0 - nxl * s;
  const gy0 = by0 - nxl * s;
  const loc: Loc = { owner: 0, d: 0, samp: -1 };
  let k = 0;
  for (let j = 0; j < ny; j++) {
    const y = gy0 + (j + 0.5) * s;
    for (let i = 0; i < nx; i++, k++) {
      const x = gx0 + (i + 0.5) * s;
      nat[k] = natural(x, y);
      locate(pads, x, y, loc);
      dist[k] = loc.d;
      owner[k] = loc.owner;
      samp[k] = loc.samp;
    }
  }
  return { nat, dist, owner, samp, cell: s * s };
}

function volumes(g: Grid, levels: number[], zp: number, flag: Uint8Array, site: Sloped): { cut: number; fill: number } {
  let cut = 0;
  let fill = 0;
  for (let k = 0; k < g.nat.length; k++) {
    const n = g.nat[k]!;
    const d = g.dist[k]!;
    const zi = zp + levels[g.owner[k]!]!;
    const f = d === 0 ? zi : flag[g.samp[k]!] ? n : finalZ(n, d, zi, site);
    const diff = n - f;
    if (diff > 0) cut += diff;
    else fill -= diff;
  }
  return { cut: cut * g.cell, fill: fill * g.cell };
}

/**
 * Terreno inclinado: pads (platô da casa + áreas aplainadas), corte e aterro, taludes, muros de arrimo, malha,
 * transporte e linhas de quantidade. Retorna null para terreno plano.
 *
 * Convenção de volumes (swell = `terrain.swellFactor`, comp = `terrain.compactionFactor`):
 * - corte medido no corte (m³ in situ); aterro medido compactado (m³ no lugar);
 * - solo do corte disponível para aterro = corte · swell · comp (empola ao escavar, reduz ao compactar);
 * - `auto`: zp tal que corte · swell · comp = aterro, somando todos os pads (bisseção);
 * - exportação (solto, transportado) = max(0, corte·swell − aterro/comp);
 * - importação (solto)              = max(0, aterro/comp − corte·swell).
 *
 * Platô isolado, zp = natural no centro, inclinação t, dimensão L ao longo da descida e W transversal:
 * prisma triangular, corte = aterro = (1/8)·L²·W·t (cada metade é uma cunha de base L/2·W e altura t·L/2).
 *
 * Pads: o platô da casa (`id 'house'`, cota zp) e cada `SitePad` (zp + level). Dentro de um pad vale a cota dele (o mais
 * recente vence); fora, o pad mais próximo define o talude. Bordas com muro (`decide`) têm superfície vertical: o terreno
 * natural encosta no muro e o volume do talude não existe.
 */
export function computeTerrain(project: Project, model: BuildingModel, catalog: Catalog): TerrainResult | null {
  const site = project.site;
  if (site.type !== 'sloped') return null;
  const tc = catalog.constants.terrain;
  const tr = catalog.constants.terrainRules;
  const swell = tc.swellFactor;
  const comp = tc.compactionFactor;
  const s = TERRAIN.volumeStep;
  const warnings: EngineWarning[] = [];

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
  const tn = site.slopePct / 100;
  const az = site.downhillAzimuthDeg * DEG;
  const gradient: [number, number] = [-tn * Math.sin(az), -tn * Math.cos(az)];

  // Pads: platô da casa primeiro; depois os do usuário na ordem (o mais recente vence).
  const pads: PadGeom[] = [
    makePad('house', 'Platô da casa', 0, site.edges, [[plat.x0, plat.y0], [plat.x1, plat.y0], [plat.x1, plat.y1], [plat.x0, plat.y1]]),
  ];
  for (const sp of site.pads) {
    const poly = normalizePolygon(sp.polygon);
    const label = sp.name || sp.id;
    if (poly.length < 3 || poly.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) {
      warnings.push({ code: 'terrain.pad_invalid', severity: 'warn', message: `Área aplainada "${label}" inválida (menos de 3 vértices distintos): ignorada.`, refs: [sp.id] });
      continue;
    }
    if (polygonSelfIntersects(poly)) {
      warnings.push({ code: 'terrain.pad_self_intersect', severity: 'warn', message: `Área aplainada "${label}" tem o contorno cruzado: ignorada. Redesenhe sem cruzar as arestas.`, refs: [sp.id] });
      continue;
    }
    if (polygonArea(poly) < 0.01) {
      warnings.push({ code: 'terrain.pad_invalid', severity: 'warn', message: `Área aplainada "${label}" com área nula: ignorada.`, refs: [sp.id] });
      continue;
    }
    pads.push(makePad(sp.id, sp.name, sp.level, sp.edges, poly));
  }
  const levels = pads.map((p) => p.level);

  // Desnível natural máximo sobre os pads (extremos nos vértices: plano) + maior desnível entre pads.
  const maxLevel = Math.max(...levels.map(Math.abs));
  const hn = Math.max(...pads.flatMap((p) => p.poly.map(([x, y]) => Math.abs(natural(x, y))))) + maxLevel;
  const pe = site.platformElevation;

  const samples = buildSamples(pads, s, natural, gradient);
  const lot = project.legal.lot ? lotInProject(project.legal.lot) : null;
  const ctx: DecideCtx = {
    pads,
    samples,
    lot,
    rules: {
      cutHeight: tr.retainingCutHeight,
      fillHeight: tr.retainingFillHeight,
      minLength: tr.retainingMinLength,
      cutSlopeHV: site.cutSlopeHV,
      fillSlopeHV: site.fillSlopeHV,
      maxReach: TERRAIN.maxReach,
    },
  };

  let zp: number;
  let grid: Grid;
  if (pe === 'auto') {
    grid = buildGrid(pads, natural, reach(site, 2 * hn + 1));
    const balance = (z: number) => {
      const v = volumes(grid, levels, z, decide(z, ctx, false).flag, site);
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
    grid = buildGrid(pads, natural, reach(site, hn + Math.abs(zp)));
  }

  const dec = decide(zp, ctx, true);
  const vol = volumes(grid, levels, zp, dec.flag, site);
  const cutVolume = vol.cut;
  const fillVolume = vol.fill;
  const loose = cutVolume * swell;
  const needed = fillVolume / comp;
  const exportVolume = Math.max(0, loose - needed);
  const importVolume = Math.max(0, needed - loose);
  const moved = cutVolume + fillVolume;
  const machineDays = moved > TERRAIN.eps ? Math.max(1, Math.ceil(moved / tc.excavatorM3PerDay - 1e-9)) : 0;
  const truckLoads = Math.max(0, Math.ceil(Math.max(exportVolume, importVolume) / tc.truckM3 - 1e-9));

  // Área inclinada dos taludes (fora das zonas de muro, onde a superfície é vertical).
  let slopeArea = 0;
  const kc = Math.sqrt(1 + 1 / (site.cutSlopeHV * site.cutSlopeHV));
  const kf = Math.sqrt(1 + 1 / (site.fillSlopeHV * site.fillSlopeHV));
  for (let k = 0; k < grid.nat.length; k++) {
    const d = grid.dist[k]!;
    if (d <= 0 || dec.flag[grid.samp[k]!]) continue;
    const zi = zp + levels[grid.owner[k]!]!;
    const n = grid.nat[k]!;
    if (n > zi + d / site.cutSlopeHV) slopeArea += grid.cell * kc;
    else if (n < zi - d / site.fillSlopeHV) slopeArea += grid.cell * kf;
  }

  // Pé dos taludes de corte (fora de muros): borda com corte > limite recebe geotêxtil e dreno.
  let cutEdgeMax = 0;
  let drainLen = 0;
  let geoArea = 0;
  samples.forEach((sm, k) => {
    if (sm.hidden || dec.flag[k] || sm.ovLevel !== null) return;
    const h = dec.h[k]!;
    if (h > cutEdgeMax) cutEdgeMax = h;
    if (h > tr.drainCutHeight) {
      drainLen += sm.step;
      geoArea += sm.step * h * kc;
    }
  });

  // Muros de arrimo.
  const retType = site.retaining.type;
  const walls: TerrainWall[] = dec.runs.map((run, i) => {
    const pad = pads[run.pad]!;
    const b = buildWall(run, pad, samples, dec.h);
    const zi = zp + pad.level;
    let length = 0;
    let area = 0;
    for (let k = 1; k < b.path.length; k++) {
      const l = Math.hypot(b.path[k]![0] - b.path[k - 1]![0], b.path[k]![1] - b.path[k - 1]![1]);
      length += l;
      area += (l * (b.heights[k]! + b.heights[k - 1]!)) / 2;
    }
    const maxHeight = Math.max(...b.heights);
    return {
      id: `terrain-wall-${i + 1}`,
      padId: pad.id,
      path: b.path,
      heights: b.heights,
      side: b.side,
      type: retType === 'auto' ? autoRetainingType(maxHeight, catalog) : retType,
      topZ: b.heights.map((h) => (b.side === 'cut' ? zi + h : zi)),
      length,
      area,
      maxHeight,
      reason: b.reason,
    };
  });

  /** Superfície em um ponto (terreno): pad, talude ou natural encostado no muro. */
  const loc: Loc = { owner: 0, d: 0, samp: -1 };
  const zAt = (x: number, y: number): number => {
    locate(pads, x, y, loc);
    const zi = zp + levels[loc.owner]!;
    if (loc.d === 0) return zi;
    const n = natural(x, y);
    return dec.flag[loc.samp] ? n : finalZ(n, loc.d, zi, site);
  };

  const report: TerrainReport = {
    platformZ: zp,
    cutVolume,
    fillVolume,
    exportVolume,
    importVolume,
    slopeArea,
    machineDays,
    truckLoads,
    mesh: buildMesh(pads, natural, zAt, site, zp, hn),
    pads: pads.map((p) => ({ id: p.id, polygon: p.poly.map((q) => [q[0], q[1]] as Vec2), z: zp + p.level, area: p.area })),
    walls,
  };
  const surface: SiteSurface = {
    platformZ: zp,
    groundZ: (x, y) => zAt(x, y) - zp - GROUND_BELOW_FLOOR,
    naturalZ: (x, y) => natural(x, y) - zp - GROUND_BELOW_FLOOR,
    slopePct: site.slopePct,
  };

  // Linhas de quantidade.
  const items: Item[] = [];
  const add = (itemId: string, net: number, note?: string, hostId = 'terrain', kg?: number) => {
    if (!(net > 0)) return;
    const mat = getMaterial(catalog, itemId);
    const it: Item = { hostId, stage: 'terrain', itemId, net, kg: kg ?? net * mat.massPerUnit, inWeight: false };
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
  for (const w of walls) {
    const note = `muro de arrimo de ${w.side === 'cut' ? 'corte' : 'aterro'}, ${fmt(w.length, 1)} m, altura até ${fmt(w.maxHeight)} m`;
    for (const l of retainingItems(w.length, w.area, w.type, site.retaining.drainage && w.side === 'cut', catalog)) {
      add(l.itemId, l.net, note, w.id, l.kg);
    }
  }

  // Alertas.
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
  const suggested = walls.filter((w) => w.reason !== 'forced');
  if (suggested.length > 0) {
    const why: Record<WallReason, string> = { forced: 'forçado', overlap: 'encontro com outra área', lot: 'talude sairia do lote', height: 'altura' };
    const list = suggested
      .map((w) => `${w.id} (${fmt(w.length, 1)} m, até ${fmt(w.maxHeight)} m, ${w.side === 'cut' ? 'corte' : 'aterro'}, ${why[w.reason]})`)
      .join('; ');
    warnings.push({
      code: 'terrain.retaining_suggested',
      severity: 'info',
      message: `Muros de arrimo sugeridos onde o talude não é viável: ${list}.`,
      refs: suggested.map((w) => w.id),
    });
  }
  const tall = walls.filter((w) => w.maxHeight > tr.cutWarnHeight);
  if (tall.length > 0) {
    warnings.push({
      code: 'terrain.retaining_tall',
      severity: 'warn',
      message: `Muro de arrimo de até ${fmt(Math.max(...tall.map((w) => w.maxHeight)))} m (acima de ${tr.cutWarnHeight} m): exige projeto geotécnico e estrutural, NBR 11682.`,
      refs: tall.map((w) => w.id),
    });
  }
  for (const pi of dec.slopeOutsideLot) {
    const pad = pads[pi]!;
    warnings.push({
      code: 'terrain.slope_outside_lot',
      severity: 'warn',
      message: `O talude de "${pad.name || pad.id}" sai do lote (bordas em talude): use muro de arrimo nessa borda ou recue a área.`,
      refs: [pad.id],
    });
  }

  return { report, items, warnings, surface };
}

function buildMesh(
  pads: PadGeom[],
  natural: (x: number, y: number) => number,
  zAt: (x: number, y: number) => number,
  site: Sloped,
  zp: number,
  hn: number,
): TerrainReport['mesh'] {
  const st = TERRAIN.meshStep;
  const E = reach(site, hn + Math.abs(zp)) + TERRAIN.meshMargin;
  const bx0 = Math.min(...pads.map((p) => p.bbox[0]));
  const by0 = Math.min(...pads.map((p) => p.bbox[1]));
  const bx1 = Math.max(...pads.map((p) => p.bbox[2]));
  const by1 = Math.max(...pads.map((p) => p.bbox[3]));
  const x0 = bx0 - E;
  const y0 = by0 - E;
  const nx = Math.ceil((bx1 - bx0 + 2 * E) / st);
  const ny = Math.ceil((by1 - by0 + 2 * E) / st);
  const positions: number[] = [];
  const cut: number[] = [];
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = x0 + i * st;
      const y = y0 + j * st;
      const z = zAt(x, y);
      positions.push(x, y, z);
      cut.push(natural(x, y) - z);
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
