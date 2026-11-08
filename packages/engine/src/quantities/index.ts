import { getMaterial, getProfile, type Catalog, type Material } from '@chalecad/catalog';
import { polygonArea } from '../geometry';
import type { Project, Stage } from '../schema/project';
import type {
  Areas,
  BuildingModel,
  CutPlan,
  Piece,
  QuantityLine,
  QuantityReport,
} from '../schema/results';
import { computeExtras } from '../extras';
import { cutPlan } from './cutplan';
import { collectItems, openingsByHost, wallAreas, type Item } from './items';

export { cutPlan } from './cutplan';
export { paginateSheets } from './paginate';
export { collectItems } from './items';
export type { Item } from './items';

/** Fator de compra de fita (rolo): perda de 5% sobre o comprimento. */
const STRAP_FACTOR = 1.05;

const EPS = 1e-9;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const fmtLen = (n: number) => String(n).replace('.', ',');
const baseId = (id: string) => id.split('#')[0]!;

function uniq(xs: string[]): string[] {
  return [...new Set(xs)];
}

interface Acc {
  stage: Stage;
  itemId: string;
  net: number;
  pages: number;
  restNet: number;
  restUnit?: number;
  direct: number;
  hostIds: Set<string>;
  notes: string[];
  restWeight: number;
}

/** Linha de compra a partir de uma quantidade líquida (perda do material, arredondamento). */
function buy(m: Material, net: number, unitSize?: number): { qty: number; bought: number } {
  const size = unitSize ?? m.purchase.size;
  let qty = (net * (1 + m.wastePct / 100)) / size;
  if (m.purchase.integer) qty = Math.ceil(qty - EPS);
  return { qty, bought: qty * size };
}

export function computeQuantities(
  model: BuildingModel,
  pieces: Piece[],
  project: Project,
  catalog: Catalog,
  terrainItems: Item[] = [],
  installationItems: Item[] = [],
  performanceItems: Item[] = [],
): QuantityReport {
  const c = catalog.constants;
  const lines: QuantityLine[] = [];
  const cutPlans: CutPlan[] = [];

  // --- Estrutura: perfis -----------------------------------------------------
  const byProfile = new Map<string, Piece[]>();
  for (const p of pieces) {
    const l = byProfile.get(p.profileId) ?? [];
    l.push(p);
    byProfile.set(p.profileId, l);
  }
  // Índice de aço só da edificação: peças de extras (muro LSF, cobertura do deck) ficam de fora.
  const extraIds = new Set(project.extras.map((e) => e.id));
  let steelKg = 0;
  let woodM3 = 0;
  for (const [profileId, ps] of byProfile) {
    const prof = getProfile(catalog, profileId);
    const netLen = sum(ps.map((p) => p.length));
    const buildingLen = sum(ps.filter((p) => !extraIds.has(p.hostId)).map((p) => p.length));
    // madeira não entra em steelKg: vira volume (comprimento × área da seção, cm² → m²)
    if (prof.material === 'wood') woodM3 += buildingLen * (prof.area / 1e4);
    else steelKg += buildingLen * prof.massPerM;
    const hostIds = uniq(ps.map((p) => p.hostId));
    const pieceIds = ps.map((p) => p.id);
    if (prof.family === 'Fita') {
      const roll = prof.barLengths[0]!;
      const rolls = Math.ceil((netLen * STRAP_FACTOR) / roll - EPS);
      const bought = rolls * roll;
      lines.push({
        id: `structure:${profileId}`,
        stage: 'structure',
        itemId: profileId,
        name: prof.name,
        unit: `rolo ${fmtLen(roll)} m`,
        purchaseQty: rolls,
        netQty: netLen,
        netUnit: 'm',
        wastePct: bought > 0 ? ((bought - netLen) / bought) * 100 : 0,
        weightKg: bought * prof.massPerM,
        priceItemId: prof.priceItemIds[0]!,
        pieceIds,
        hostIds,
      });
      continue;
    }
    const bars = cutPlan(ps.map((p) => ({ id: p.id, length: p.length })), prof.barLengths, c.sawKerf);
    const totalLen = sum(bars.map((b) => b.barLength));
    const waste = sum(bars.map((b) => b.waste));
    cutPlans.push({
      profileId,
      bars,
      totalBars: bars.length,
      wasteLength: waste,
      wastePct: totalLen > 0 ? (waste / totalLen) * 100 : 0,
    });
    const sizes = [...prof.barLengths].sort((a, b) => a - b);
    const maxBar = sizes[sizes.length - 1]!;
    const spliced = ps.filter((p) => p.length > maxBar + EPS).length;
    for (const len of uniq(bars.map((b) => String(b.barLength))).map(Number).sort((a, b) => b - a)) {
      const group = bars.filter((b) => b.barLength === len);
      const net = sum(group.flatMap((b) => b.cuts.map((x) => x.length)));
      const bought = group.length * len;
      const ids = uniq(group.flatMap((b) => b.cuts.map((x) => baseId(x.pieceId))));
      const hostSet = new Set(ps.filter((p) => ids.includes(p.id)).map((p) => p.hostId));
      const idx = prof.barLengths.indexOf(len);
      const line: QuantityLine = {
        id: `structure:${profileId}:${len}`,
        stage: 'structure',
        itemId: profileId,
        name: prof.name,
        unit: `barra ${fmtLen(len)} m`,
        purchaseQty: group.length,
        netQty: net,
        netUnit: 'm',
        wastePct: bought > 0 ? ((bought - net) / bought) * 100 : 0,
        weightKg: bought * prof.massPerM,
        priceItemId: prof.priceItemIds[idx]!,
        pieceIds: ids,
        hostIds: [...hostSet],
      };
      if (len === maxBar && spliced > 0) {
        line.note = `${spliced} peça(s) maior(es) que a barra de ${fmtLen(maxBar)} m: emenda necessária`;
      }
      lines.push(line);
    }
  }

  // --- Estrutura: fixações -------------------------------------------------------
  const acc = new Map<string, Acc>();
  const touch = (stage: Stage, itemId: string): Acc => {
    const key = `${stage}:${itemId}`;
    let a = acc.get(key);
    if (!a) {
      a = {
        stage,
        itemId,
        net: 0,
        pages: 0,
        restNet: 0,
        direct: 0,
        hostIds: new Set(),
        notes: [],
        restWeight: 0,
      };
      acc.set(key, a);
    }
    return a;
  };

  const count = (roles: Piece['role'][]) => pieces.filter((p) => roles.includes(p.role)).length;
  const purlins = pieces.filter((p) => p.role === 'purlin');
  const screwsFrame =
    count(['stud', 'king', 'jack', 'cripple', 'stud_corner']) * c.lsf.screwsPerStud +
    count(['blocking']) * c.fasteners.blocking +
    count(['header']) * c.fasteners.header +
    count(['joist', 'rafter', 'collar_tie']) * c.fasteners.joistRafterCollar +
    sum(purlins.map((p) => c.fasteners.purlinPerRafter * (p.length / c.roof.rafterSpacing + 1)));
  const wallIds = new Map(model.walls.map((w) => [w.id, w]));
  const ground = project.levels.find((l) => l.elevation === 0)!;

  const bottoms = new Map<string, number>();
  for (const p of pieces) {
    if (p.role !== 'track_bottom') continue;
    const w = wallIds.get(p.hostId);
    if (!w || w.level !== ground.id || w.kind === 'parapet') continue;
    bottoms.set(w.id, (bottoms.get(w.id) ?? 0) + p.length);
  }
  let anchors = 0;
  for (const len of bottoms.values()) anchors += len / c.lsf.anchorSpacing + 2;
  anchors = Math.ceil(anchors - EPS);

  const ops = openingsByHost(model);
  let holdDowns = 0;
  const hdHosts: string[] = [];
  for (const w of model.walls) {
    if (w.exteriorSide !== null && w.kind !== 'parapet') {
      holdDowns += 2;
      hdHosts.push(w.id);
    }
    for (const o of ops.get(w.id) ?? []) {
      if (o.hostKind === 'wall' && o.u1 - o.u0 > c.lsf.holdDownOpeningMin) {
        holdDowns += 2;
        hdHosts.push(w.id);
      }
    }
  }
  const fix = (itemId: string, net: number, hosts: string[]) => {
    if (net <= 0) return;
    const a = touch('structure', itemId);
    a.net += Math.ceil(net - EPS);
    a.restNet += Math.ceil(net - EPS);
    hosts.forEach((h) => a.hostIds.add(h));
  };
  const collected = collectItems(model, project, catalog);
  if (project.system.structure === 'wood') {
    // wood frame: pregos no lugar dos parafusos de estrutura = m de madeira × kg/m + m² de OSB × kg/m²
    const woodLen = sum(pieces.filter((p) => getProfile(catalog, p.profileId).material === 'wood').map((p) => p.length));
    const osbArea = sum(collected.filter((i) => i.itemId.startsWith('osb_')).map((i) => i.net));
    fix('nail_wood', woodLen * c.wood.nailKgPerM + osbArea * c.wood.nailKgPerM2Board, uniq(pieces.map((p) => p.hostId)));
  } else {
    fix('screw_frame', screwsFrame, uniq(pieces.map((p) => p.hostId)));
  }
  fix('anchor_bolt', anchors, [...bottoms.keys()]);
  fix('hold_down', holdDowns, uniq(hdHosts));

  // --- Demais itens ----------------------------------------------------------------
  for (const it of [...collected, ...computeExtras(project, model, catalog), ...terrainItems, ...installationItems, ...performanceItems]) {
    const a = touch(it.stage, it.itemId);
    a.net += it.net;
    a.hostIds.add(it.hostId);
    if (it.pages !== undefined) a.pages += it.pages;
    else if (it.directPurchase !== undefined) a.direct += it.directPurchase;
    else {
      a.restNet += it.net;
      if (it.unitSize !== undefined) a.restUnit = it.unitSize;
    }
    if (it.note) a.notes.push(it.note);
  }

  for (const a of acc.values()) {
    const m = getMaterial(catalog, a.itemId);
    if (a.net <= 0 && a.pages === 0 && a.direct === 0) continue;
    const sheetArea = m.purchase.sheet ? m.purchase.sheet.width * m.purchase.sheet.height : m.purchase.size;
    let qty = a.pages + a.direct;
    let bought = a.pages * sheetArea + a.direct * m.purchase.size;
    if (a.restNet > 0) {
      const r = buy(m, a.restNet, a.restUnit);
      qty += r.qty;
      bought += r.bought;
    }
    const line: QuantityLine = {
      id: `${a.stage}:${a.itemId}`,
      stage: a.stage,
      itemId: a.itemId,
      name: m.name,
      unit: m.purchase.label,
      purchaseQty: qty,
      netQty: a.net,
      netUnit: m.baseUnit,
      wastePct: a.net > 0 ? Math.max(0, ((bought - a.net) / a.net) * 100) : 0,
      weightKg: bought * m.massPerUnit,
      priceItemId: m.priceItemId,
      pieceIds: [],
      hostIds: [...a.hostIds],
    };
    if (a.notes.length) line.note = a.notes.join('; ');
    lines.push(line);
  }

  // --- Áreas -------------------------------------------------------------------------
  let extNet = 0;
  let intNet = 0;
  for (const w of model.walls) {
    const { net } = wallAreas(w, (ops.get(w.id) ?? []).filter((o) => o.hostKind === 'wall'));
    if (w.exteriorSide !== null) extNet += net;
    else intNet += net;
  }
  const radier = model.slabs.find((s) => s.kind === 'radier');
  const areas: Areas = {
    footprint: model.footprintArea,
    built: model.builtArea,
    roof: sum(model.roofPlanes.map((r) => r.area)),
    exteriorWallsNet: extNet,
    interiorWallsNet: intNet,
    openings: sum(model.openings.filter((o) => o.valid).map((o) => (o.u1 - o.u0) * (o.v1 - o.v0))),
    radier: radier ? radier.area : 0,
    mezzanine: sum(model.slabs.filter((s) => s.kind === 'mezzanine').map((s) => polygonArea(s.polygon))),
  };

  return {
    lines,
    cutPlans,
    areas,
    steelKg,
    steelKgPerM2: model.builtArea > 0 ? steelKg / model.builtArea : 0,
    woodM3,
    woodM3PerM2: model.builtArea > 0 ? woodM3 / model.builtArea : 0,
  };
}
