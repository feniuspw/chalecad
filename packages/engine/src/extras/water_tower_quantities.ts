import { getAssembly, getMaterial, getProfile, type Catalog } from '@chalecad/catalog';
import type { Vec2 } from '../geometry';
import { roofBelowAt } from '../model/rooms';
import { cutPlan } from '../quantities/cutplan';
import type { Item } from '../quantities/items';
import { paginateSheets } from '../quantities/paginate';
import type { Project } from '../schema/project';
import type { BuildingModel, ExtraModel, QuantityLine } from '../schema/results';
import { TOWER_EAVE, type WaterTowerE } from './water_tower';

const EPS = 1e-9;
const fmtLen = (n: number) => String(n).replace('.', ',');
const rect = (l: number, h: number): Vec2[] => [[0, 0], [l, 0], [l, h], [0, h]];

type Add = (hostId: string, itemId: string, net: number, extra?: Partial<Item>) => void;

/** Cota média do telhado do chalé ao longo de uma face da torre (0 onde a face está fora do telhado). */
function faceRoofZ(model: BuildingModel, a: Vec2, b: Vec2): number {
  const pts: Vec2[] = [a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], b];
  const zs = pts.map((p) => roofBelowAt(model.roofPlanes, p) ?? 0);
  return zs.reduce((s, v) => s + v, 0) / zs.length;
}

/** Itens (materiais) da torre: plataforma, fechamento, telhado e, só sem instalações, a caixa d'água. */
export function waterTowerItems(project: Project, model: BuildingModel, e: WaterTowerE, em: ExtraModel, catalog: Catalog, add: Add): void {
  const c = catalog.constants;
  const id = e.id;
  const top = em.segments[0] ? em.segments[0].baseZ + em.segments[0].height : e.platformZ;

  // Plataforma: laje seca (OSB 18 + parafusos) sobre os perfis `joist` (perfis em `towerProfileLines`).
  const platformArea = e.width * e.depth;
  for (const l of getAssembly(catalog, 'floor_osb18').layers) {
    const m = getMaterial(catalog, l.materialId);
    const sh = m.purchase.sheet;
    if (sh) add(id, m.id, platformArea * l.consumptionPerM2, { pages: paginateSheets(rect(e.width, e.depth), [], sh.width, sh.height) });
    else add(id, m.id, platformArea * l.consumptionPerM2);
  }

  // Fechamento externo: assembly externa (camadas de fora e parafusos) na área das paredes acima do telhado.
  let wallArea = 0;
  em.segments.forEach((s) => {
    const len = Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1]);
    wallArea += len * Math.max(0, top - faceRoofZ(model, s.from, s.to));
  });
  // empenas triangulares do telhado de duas águas
  const ridgeZ = Math.max(...em.roofs!.flatMap((r) => r.vertices.map((v) => v[2])));
  if (e.roof === 'gable' && ridgeZ > top) {
    const span = e.width >= e.depth ? e.depth : e.width;
    wallArea += span * (ridgeZ - top); // duas empenas de ½ · vão · altura
  }
  const ext = getAssembly(catalog, project.system.assemblies.exterior);
  for (const l of ext.layers) {
    if (l.face !== 'ext' && l.face !== 'both') continue;
    add(id, l.materialId, wallArea * l.consumptionPerM2 * (l.face === 'both' ? 2 : 1));
  }

  // Telhado: a mesma telha do chalé, parafusos, rufo no encontro com o telhado (perímetro) e cumeeira.
  const clad = getMaterial(catalog, project.roof.cladding);
  for (const r of em.roofs ?? []) {
    const tiles = Math.ceil(r.uLength / c.roof.sandwichUsefulWidth - EPS);
    add(id, clad.id, r.area, {
      directPurchase: tiles * r.vLength,
      note: `${tiles} telhas de ${r.vLength.toFixed(2).replace('.', ',')} m (torre ${id})`,
    });
    add(id, 'screw_roof', r.area * c.roof.screwsPerM2);
  }
  const crossesRoof = em.segments[0] !== undefined && em.segments[0].baseZ > 0;
  if (crossesRoof) add(id, 'flashing', 2 * (e.width + e.depth), { unitSize: c.roof.flashingLength });
  if (e.roof === 'gable') add(id, 'ridge_cap', Math.max(e.width, e.depth) + 2 * TOWER_EAVE, { unitSize: c.roof.ridgeCapLength });

  // Caixa d'água: só sem instalações (com elas ligadas já está orçada, na etapa `installations`).
  if (!project.installations.enabled && em.tank) {
    const sizes = catalog.materials
      .filter((m) => /^water_tank_\d+$/.test(m.id))
      .map((m) => Number(m.id.slice('water_tank_'.length)))
      .sort((a, b) => a - b);
    const size = sizes.find((s) => s >= em.tank!.liters - EPS) ?? sizes[sizes.length - 1];
    if (size !== undefined) add(id, `water_tank_${size}`, 1, { note: `${size} L (torre ${id})` });
  }
}

/**
 * Perfis da torre (aço ou madeira conforme o sistema), na etapa `extras`: montantes de canto e intermediários,
 * guias, vigas da plataforma (em caixa + vigotas) e terças do telhado. Plano de corte pelas barras do catálogo.
 */
export function towerProfileLines(project: Project, model: BuildingModel, catalog: Catalog): QuantityLine[] {
  const c = catalog.constants;
  const pr = project.system.profiles;
  const out: QuantityLine[] = [];
  for (const e of project.extras) {
    if (e.kind !== 'water_tower') continue;
    const em = model.extras.find((x) => x.id === e.id);
    if (!em) continue;
    const byProfile = new Map<string, { id: string; length: number }[]>();
    const put = (profileId: string, tag: string, n: number, length: number) => {
      if (n <= 0 || !(length > 0)) return;
      const l = byProfile.get(profileId) ?? [];
      for (let i = 0; i < n; i++) l.push({ id: `${e.id}:${tag}-${i}`, length });
      byProfile.set(profileId, l);
    };
    const wallH = em.segments[0]?.height ?? 0;
    put(pr.wallStud, 'post', em.posts.length, em.posts[0]?.height ?? 0);
    for (const s of em.segments) {
      const len = Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1]);
      put(pr.wallStud, `stud-${s.from.join('_')}`, Math.max(0, Math.ceil(len / c.extras.lsfStudSpacing - EPS) - 1), wallH);
      put(pr.wallTrack, `track-${s.from.join('_')}`, 2, len);
    }
    const span = Math.min(e.width, e.depth);
    const other = Math.max(e.width, e.depth);
    put(pr.joist, 'joist', Math.floor(other / project.system.studSpacing + EPS) + 1 + 2, span); // vigotas + 2 da viga em caixa
    for (const r of em.roofs ?? []) {
      put(pr.purlin, `purlin-${r.id}`, Math.ceil(r.vLength / c.roof.purlinSpacing - EPS) + 1, r.uLength);
    }
    for (const [profileId, ps] of byProfile) {
      const prof = getProfile(catalog, profileId);
      const bars = cutPlan(ps, prof.barLengths, c.sawKerf);
      const lens = [...new Set(bars.map((b) => b.barLength))].sort((a, b) => b - a);
      for (const len of lens) {
        const group = bars.filter((b) => b.barLength === len);
        const net = group.reduce((s, b) => s + b.cuts.reduce((x, k) => x + k.length, 0), 0);
        const bought = group.length * len;
        out.push({
          id: `extras:${e.id}:${profileId}:${len}`,
          stage: 'extras',
          itemId: profileId,
          name: prof.name,
          unit: `barra ${fmtLen(len)} m`,
          purchaseQty: group.length,
          netQty: net,
          netUnit: 'm',
          wastePct: bought > 0 ? ((bought - net) / bought) * 100 : 0,
          weightKg: bought * prof.massPerM,
          priceItemId: prof.priceItemIds[prof.barLengths.indexOf(len)]!,
          pieceIds: [],
          hostIds: [e.id],
        });
      }
    }
  }
  return out;
}
