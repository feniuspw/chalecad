import type { Catalog, TechnicalConstants } from '@chalecad/catalog';
import { pointInPolygon, type Vec2 } from '../geometry';
import { sizeTank } from '../installations/tank';
import { makePlane } from '../model/planes';
import { roofBelowAt } from '../model/rooms';
import type { Extra, Project } from '../schema/project';
import type { ExtraModel, RoofPlane, SlabModel } from '../schema/results';

export type WaterTowerE = Extract<Extra, { kind: 'water_tower' }>;

/** O que a torre precisa do modelo da casa (telhado e lajes), já construído antes dos extras. */
export interface ExtraBuildContext {
  roofPlanes: RoofPlane[];
  slabs: SlabModel[];
  /** Constantes das instalações, para dimensionar a caixa quando `tankLiters` está ausente. */
  installations?: TechnicalConstants['installations'];
}

const DEG = Math.PI / 180;

// Premissas que ainda não estão em `catalog.constants` (documentadas no retorno do card F11-E1).
/** Altura do cilindro ≈ 0,75 × diâmetro (proporção usual de caixa d'água de polietileno). */
export const TANK_HEIGHT_PER_DIAMETER = 0.75;
/** Folga entre o topo da caixa e o topo das paredes (m). */
export const TOWER_TOP_CLEARANCE = 0.3;
/** Beiral do telhado da torre (m). */
export const TOWER_EAVE = 0.2;
/** Caimento do telhado plano (3%). */
export const TOWER_FLAT_SLOPE = 0.03;
/** Caixa quando nada define o volume (L). */
export const TOWER_DEFAULT_LITERS = 1000;

/** Retângulo `width × depth` centrado na posição, anti-horário. */
export function towerContour(e: WaterTowerE): Vec2[] {
  const [cx, cy] = e.position;
  const hw = e.width / 2;
  const hd = e.depth / 2;
  return [
    [cx - hw, cy - hd],
    [cx + hw, cy - hd],
    [cx + hw, cy + hd],
    [cx - hw, cy + hd],
  ];
}

/** Volume da caixa da torre: `tankLiters`, ou a caixa dimensionada pelas instalações, ou 1.000 L. */
export function towerLiters(project: Project, e: WaterTowerE, k?: TechnicalConstants['installations']): number {
  if (e.tankLiters !== undefined) return e.tankLiters;
  if (k && project.installations.enabled && project.rooms.length > 0) return sizeTank(project, k).liters;
  return TOWER_DEFAULT_LITERS;
}

/** Cilindro com altura = 0,75 × diâmetro para o volume dado. */
export function tankDimensions(liters: number): { radius: number; height: number } {
  const v = liters / 1000;
  const diameter = Math.cbrt((4 * v) / (Math.PI * TANK_HEIGHT_PER_DIAMETER));
  return { radius: diameter / 2, height: diameter * TANK_HEIGHT_PER_DIAMETER };
}

/** Massa da caixa cheia (kg): 1 kg por litro + caixa vazia do catálogo (a mais próxima, se o volume não é comercial). */
export function towerTankFullKg(catalog: Catalog, liters: number): number {
  const sizes = catalog.materials
    .filter((m) => /^water_tank_\d+$/.test(m.id))
    .map((m) => ({ size: Number(m.id.slice('water_tank_'.length)), kg: m.massPerUnit }))
    .sort((a, b) => a.size - b.size);
  const near = sizes.find((s) => s.size >= liters) ?? sizes[sizes.length - 1];
  return liters + (near?.kg ?? 0);
}

/** Cota do telhado do chalé sob o contorno (a água mais baixa), ou null se a torre fica fora do telhado. */
export function roofZUnder(planes: RoofPlane[], contour: Vec2[]): number | null {
  const samples: Vec2[] = [];
  contour.forEach((a, i) => {
    const b = contour[(i + 1) % contour.length]!;
    samples.push(a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
  });
  const cx = contour.reduce((s, p) => s + p[0], 0) / contour.length;
  const cy = contour.reduce((s, p) => s + p[1], 0) / contour.length;
  samples.push([cx, cy]);
  let best: number | null = null;
  for (const p of samples) {
    const z = roofBelowAt(planes, p);
    if (z !== null && (best === null || z < best)) best = z;
  }
  return best;
}

/** Piso onde os postes apoiam: topo da laje do mezanino sob o centro, ou o térreo (0). */
export function towerPostBaseZ(slabs: SlabModel[], e: WaterTowerE): number {
  let z = 0;
  for (const s of slabs) {
    if (s.kind !== 'mezzanine') continue;
    if (pointInPolygon([e.position[0], e.position[1]], s.polygon, 0)) z = Math.max(z, s.topZ);
  }
  return z;
}

/** Topo das paredes: piso da caixa + altura da caixa + folga. */
export function towerTopZ(e: WaterTowerE, liters: number): number {
  return e.platformZ + tankDimensions(liters).height + TOWER_TOP_CLEARANCE;
}

/**
 * Telhado próprio: duas águas (cumeeira ao longo do maior lado), meia-água ou plano (3%), com beiral.
 * O beiral baixo parte do topo das paredes; a cumeeira (ou lado alto) fica acima dele.
 */
function towerRoofs(e: WaterTowerE, topZ: number, x: TechnicalConstants['extras']): RoofPlane[] {
  const [cx, cy] = e.position;
  const hw = e.width / 2 + TOWER_EAVE;
  const hd = e.depth / 2 + TOWER_EAVE;
  const rect = (x0: number, x1: number, y0: number, y1: number): Vec2[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const pitch = e.roof === 'flat' ? Math.atan(TOWER_FLAT_SLOPE) : x.deckCoverPitchDeg * DEG;
  const tan = Math.tan(pitch);
  if (e.roof === 'gable') {
    // cumeeira ao longo do maior lado; as águas caem para o menor
    const alongX = e.width >= e.depth;
    const ridgeZ = topZ + (alongX ? e.depth : e.width) * 0.5 * tan;
    const mk = (id: string, plan: Vec2[], rising: Vec2) =>
      makePlane({ id, plan, rising, slopeRad: pitch, refPoint: [cx, cy], refZ: ridgeZ });
    return alongX
      ? [
          mk(`${e.id}-roof-a`, rect(cx - hw, cx + hw, cy - hd, cy), [0, 1]),
          mk(`${e.id}-roof-b`, rect(cx - hw, cx + hw, cy, cy + hd), [0, -1]),
        ]
      : [
          mk(`${e.id}-roof-a`, rect(cx - hw, cx, cy - hd, cy + hd), [1, 0]),
          mk(`${e.id}-roof-b`, rect(cx, cx + hw, cy - hd, cy + hd), [-1, 0]),
        ];
  }
  // meia-água e plano: sobem para +y; o lado alto (com beiral) fica na cota do topo das paredes
  return [
    makePlane({
      id: `${e.id}-roof`,
      plan: rect(cx - hw, cx + hw, cy - hd, cy + hd),
      rising: [0, 1],
      slopeRad: pitch,
      refPoint: [cx, cy + hd],
      refZ: topZ,
    }),
  ];
}

export function waterTowerModel(project: Project, e: WaterTowerE, x: TechnicalConstants['extras'], ctx?: ExtraBuildContext): ExtraModel {
  const contour = towerContour(e);
  const liters = towerLiters(project, e, ctx?.installations);
  const tank = tankDimensions(liters);
  const topZ = towerTopZ(e, liters);
  const baseZ = ctx ? (roofZUnder(ctx.roofPlanes, contour) ?? 0) : 0;
  const postBase = ctx ? towerPostBaseZ(ctx.slabs, e) : 0;
  const height = Math.max(0, topZ - baseZ);
  return {
    id: e.id,
    kind: 'water_tower',
    segments: contour.map((from, i) => ({
      from,
      to: contour[(i + 1) % contour.length]!,
      height,
      thickness: x.lsfWallThickness,
      baseZ,
      material: 'board' as const,
    })),
    // ExtraModel.posts não tem cota de base: a altura é medida a partir do piso de apoio (térreo ou laje do mezanino).
    posts: contour.map((position) => ({ position, height: Math.max(0, topZ - postBase), size: x.deckPostSize })),
    roofs: towerRoofs(e, topZ, x),
    tank: { position: [e.position[0], e.position[1]], baseZ: e.platformZ, radius: tank.radius, height: tank.height, liters },
  };
}
