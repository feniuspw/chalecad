import { distToSegment, offsetPolygon, pointInPolygon, polygonArea, signedArea, type Vec2 } from '../geometry';
import type { Lot, Project } from '../schema/project';
import type { AreaRow, AreaTable, BuildingModel, Results, UrbanCheck, UrbanIndices } from '../schema/results';
import { levelName, nf, toLot } from './common';

/** LOCAL: desconto de beiral que alguns municípios aplicam na projeção (valor usual; varia, por isso só entra na nota). */
const EAVE_DISCOUNT_COMMON_M = 1;

type Seg = [Vec2, Vec2];
export type SideKey = 'front' | 'back' | 'left' | 'right';

/** Contorno do lote em coordenadas do lote (retângulo testada × profundidade ou polígono). */
export function lotPolygon(lot: Lot): Vec2[] {
  return lot.polygon ?? [[0, 0], [lot.front, 0], [lot.front, lot.depth], [0, lot.depth]];
}

/** União de polígonos (varredura em x; exata quando as arestas não se cruzam entre as fatias). */
export function unionArea(polys: Vec2[][]): number {
  const xs = [...new Set(polys.flatMap((p) => p.map((v) => v[0])))].sort((a, b) => a - b);
  const SUB = 4;
  const coverage = (x: number): number => {
    const iv: [number, number][] = [];
    for (const poly of polys) {
      const ys: number[] = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!;
        const b = poly[(i + 1) % poly.length]!;
        if ((a[0] <= x && b[0] > x) || (b[0] <= x && a[0] > x)) ys.push(a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]));
      }
      ys.sort((p, q) => p - q);
      for (let i = 0; i + 1 < ys.length; i += 2) iv.push([ys[i]!, ys[i + 1]!]);
    }
    iv.sort((p, q) => p[0] - q[0]);
    let sum = 0;
    let cur: [number, number] | null = null;
    for (const s of iv) {
      if (!cur) cur = [s[0], s[1]];
      else if (s[0] <= cur[1]) cur[1] = Math.max(cur[1], s[1]);
      else {
        sum += cur[1] - cur[0];
        cur = [s[0], s[1]];
      }
    }
    if (cur) sum += cur[1] - cur[0];
    return sum;
  };
  let total = 0;
  for (let i = 0; i + 1 < xs.length; i++) {
    const x0 = xs[i]!;
    const x1 = xs[i + 1]!;
    if (x1 - x0 < 1e-9) continue;
    for (let k = 0; k < SUB; k++) total += coverage(x0 + ((k + 0.5) / SUB) * (x1 - x0)) * ((x1 - x0) / SUB);
  }
  return total;
}

const orient = (a: Vec2, b: Vec2, c: Vec2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
export function segSegDist(a: Vec2, b: Vec2, c: Vec2, d: Vec2): number {
  if (orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0) return 0;
  return Math.min(distToSegment(a, c, d), distToSegment(b, c, d), distToSegment(c, a, b), distToSegment(d, a, b));
}

/** Classifica cada segmento do lote em frente/fundos/laterais pela normal externa (frente = lado de y = 0). */
export function classifySegments(poly: Vec2[]): Record<SideKey, Seg[]> {
  const out: Record<SideKey, Seg[]> = { front: [], back: [], left: [], right: [] };
  const ccw = signedArea(poly) >= 0;
  const all: { seg: Seg; mid: Vec2 }[] = [];
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const nx = ccw ? dy : -dy;
    const ny = ccw ? -dx : dx;
    const seg: Seg = [a, b];
    all.push({ seg, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] });
    if (Math.abs(ny) >= Math.abs(nx)) (ny < 0 ? out.front : out.back).push(seg);
    else (nx < 0 ? out.left : out.right).push(seg);
  });
  const pick = (k: SideKey, f: (m: Vec2) => number) => {
    if (out[k].length === 0 && all.length > 0) out[k].push([...all].sort((p, q) => f(p.mid) - f(q.mid))[0]!.seg);
  };
  pick('front', (m) => m[1]);
  pick('back', (m) => -m[1]);
  pick('left', (m) => m[0]);
  pick('right', (m) => -m[0]);
  return out;
}

/** Distância mínima entre o contorno da edificação (já em coordenadas do lote) e um conjunto de segmentos. */
export function minDistance(poly: Vec2[], segs: Seg[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    for (const [c, d] of segs) best = Math.min(best, segSegDist(a, b, c, d));
  }
  return best;
}

export const lotBoundarySegments = (poly: Vec2[]): Seg[] => poly.map((a, i) => [a, poly[(i + 1) % poly.length]!] as Seg);

/** Contorno do eixo das paredes externas do térreo (a face externa recuada pela meia espessura). */
export function axisFootprint(model: BuildingModel): Vec2[] {
  const ext = model.walls.filter((w) => w.exteriorSide !== null && w.kind !== 'gable' && w.thickness > 0);
  const th = (ext.length ? ext : model.walls).map((w) => w.thickness).sort((a, b) => a - b);
  const t = th[Math.floor(th.length / 2)] ?? 0;
  return t > 0 ? offsetPolygon(model.footprint, -t / 2) : model.footprint;
}

export function buildingInLot(footprint: Vec2[], lot: Lot): Vec2[] {
  return footprint.map((p) => toLot(p, lot.buildingOffset, lot.rotationDeg));
}

/** Quadro de áreas: cômodos, pavimentos e totais. */
export function computeAreas(project: Project, model: BuildingModel): AreaTable {
  const rooms: AreaRow[] = [];
  const levels: AreaTable['levels'] = [];
  let totalBuilt = 0;
  let totalUseful = 0;
  for (const l of project.levels) {
    const built = l.elevation === 0 ? polygonArea(model.footprint) : l.polygon ? polygonArea(l.polygon) : 0;
    const lr = model.rooms.filter((r) => r.level === l.id && r.polygon);
    const useful = lr.reduce((a, r) => a + r.area, 0);
    if (built <= 0 && lr.length === 0) continue;
    const name = levelName(project, l.id);
    for (const r of lr) rooms.push({ level: l.id, levelName: name, name: r.name, use: r.use, area: r.area, perimeter: r.perimeter });
    rooms.push({ level: l.id, levelName: name, name: 'Área construída do pavimento', area: built });
    levels.push({ level: l.id, levelName: name, built, useful });
    totalBuilt += built;
    totalUseful += useful;
  }
  const coveredOpen = model.extras.filter((e) => e.kind === 'deck' && e.roof && e.polygon).reduce((a, e) => a + polygonArea(e.polygon!), 0);
  return { rooms, levels, totalBuilt, totalUseful, coveredOpen };
}

/** Plano natural do módulo de terreno (z = 0 no centro da edificação); repete a fórmula de `terrain/index.ts`. */
function naturalZ(site: Extract<Project['site'], { type: 'sloped' }>, cx: number, cy: number, x: number, y: number): number {
  const az = (site.downhillAzimuthDeg * Math.PI) / 180;
  return -(site.slopePct / 100) * ((x - cx) * Math.sin(az) + (y - cy) * Math.cos(az));
}

export function computeUrban(project: Project, model: BuildingModel, results: Pick<Results, 'terrain'>, areas: AreaTable): UrbanIndices | null {
  const lot = project.legal.lot;
  if (!lot) return null;
  const z = project.legal.zoning;
  const lotPoly = lotPolygon(lot);
  const lotArea = polygonArea(lotPoly);

  // Projeção: edificação + águas do telhado (beirais) + decks cobertos
  const polys: Vec2[][] = [model.footprint];
  for (const rp of model.roofPlanes) polys.push(rp.vertices.map((v) => [v[0], v[1]] as Vec2));
  for (const e of model.extras) if (e.kind === 'deck' && e.roof) polys.push(e.roof.vertices.map((v) => [v[0], v[1]] as Vec2));
  const footprintArea = unionArea(polys);

  // Área computável e pavimentos: o mezanino só entra se o zoneamento mandar.
  const counted = areas.levels.filter((l) => l.built > 0 && (project.levels.find((x) => x.id === l.level)?.elevation === 0 || z.mezzanineCounts));
  const floors = counted.length;
  const builtArea = counted.reduce((a, l) => a + l.built, 0);
  const permeableArea = Math.max(0, lotArea - footprintArea - lot.pavedArea);

  // Recuos (sem beiral), medidos da face externa das paredes (`model.footprint`): o lado conservador da regra municipal.
  const bLot = buildingInLot(model.footprint, lot);
  const sides = classifySegments(lotPoly);
  const setbacks = {
    front: minDistance(bLot, sides.front),
    back: minDistance(bLot, sides.back),
    left: minDistance(bLot, sides.left),
    right: minDistance(bLot, sides.right),
  };

  // Altura: terreno → ponto mais alto
  const maxZ = Math.max(model.bbox.max[2], model.ridgeHeight);
  let height = maxZ;
  const site = project.site;
  if (site.type === 'sloped') {
    const xs = model.footprint.map((p) => p[0]);
    const ys = model.footprint.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const minNat = Math.min(...model.footprint.map((p) => naturalZ(site, cx, cy, p[0], p[1])));
    height = (results.terrain?.platformZ ?? 0) + maxZ - minNat;
  }

  const occupancyPct = lotArea > 0 ? (footprintArea / lotArea) * 100 : 0;
  const far = lotArea > 0 ? builtArea / lotArea : 0;
  const permeablePct = lotArea > 0 ? (permeableArea / lotArea) * 100 : 0;

  const EPS = 1e-6;
  const max = (value: number, limit: number | undefined): UrbanCheck['status'] => (limit === undefined ? 'missing' : value <= limit + EPS ? 'ok' : 'fail');
  const min = (value: number, limit: number | undefined): UrbanCheck['status'] => (limit === undefined ? 'missing' : value >= limit - EPS ? 'ok' : 'fail');
  const checks: UrbanCheck[] = [
    { id: 'occupancy', label: 'Taxa de ocupação', value: occupancyPct, limit: z.maxOccupancyPct, unit: '%', status: max(occupancyPct, z.maxOccupancyPct) },
    { id: 'far', label: 'Coeficiente de aproveitamento', value: far, limit: z.maxFar, unit: '', status: max(far, z.maxFar) },
    { id: 'permeable', label: 'Taxa de permeabilidade', value: permeablePct, limit: z.minPermeablePct, unit: '%', status: min(permeablePct, z.minPermeablePct) },
    { id: 'setback_front', label: 'Recuo frontal', value: setbacks.front, limit: z.setbackFront, unit: 'm', status: min(setbacks.front, z.setbackFront) },
    { id: 'setback_back', label: 'Recuo de fundos', value: setbacks.back, limit: z.setbackBack, unit: 'm', status: min(setbacks.back, z.setbackBack) },
    { id: 'setback_left', label: 'Recuo lateral esquerdo', value: setbacks.left, limit: z.setbackSide, unit: 'm', status: min(setbacks.left, z.setbackSide) },
    { id: 'setback_right', label: 'Recuo lateral direito', value: setbacks.right, limit: z.setbackSide, unit: 'm', status: min(setbacks.right, z.setbackSide) },
    { id: 'height', label: 'Altura da edificação', value: height, limit: z.maxHeight, unit: 'm', status: max(height, z.maxHeight) },
    { id: 'floors', label: 'Pavimentos', value: floors, limit: z.maxFloors, unit: 'pav.', status: max(floors, z.maxFloors) },
  ];

  const notes = [
    `Beirais incluídos na projeção; alguns municípios descontam até ${nf(EAVE_DISCOUNT_COMMON_M, 1)} m: confira a lei local.`,
    'Recuos medidos da face externa das paredes até a divisa, sem beiral. Confira se o município mede do beiral (alguns exigem).',
    z.mezzanineCounts ? 'O mezanino entra na área computável e conta como pavimento.' : 'O mezanino não entra na área computável nem conta como pavimento (conforme informado no zoneamento).',
  ];
  if (site.type === 'sloped') notes.push('Terreno inclinado: altura medida da cota do platô até o ponto mais alto, a partir do terreno natural mais baixo sob a projeção.');
  if (!bLot.every((p) => pointInPolygon(p, lotPoly))) notes.push('Atenção: parte da edificação está fora do limite do lote; confira a posição e a rotação.');

  return { lotArea, footprintArea, builtArea, permeableArea, occupancyPct, far, permeablePct, setbacks, height, floors, checks, notes };
}
