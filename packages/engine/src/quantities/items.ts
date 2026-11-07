import {
  getAssembly,
  getMaterial,
  type AssemblyLayer,
  type Catalog,
  type Material,
} from '@chalecad/catalog';
import { distToSegment, length2, polygonArea, polylineLength, type Vec2 } from '../geometry';
import type { Project, Stage } from '../schema/project';
import type { BuildingModel, HostWall, ResolvedOpening, RoofPlane } from '../schema/results';
import { paginateSheets, type Rect } from './paginate';

/**
 * Item de quantidade ligado a um hospedeiro (parede, água, laje, escada…), em unidade base do material.
 * Usado tanto pelo relatório de quantitativos (compra) quanto pelo peso (kg líquido).
 */
export interface Item {
  hostId: string;
  stage: Stage;
  itemId: string;
  /** Quantidade líquida na baseUnit do material. */
  net: number;
  /** Placas paginadas (já multiplicadas pelas faces). Quando presente, a compra é esta contagem. */
  pages?: number;
  /** Compra direta em unidades de compra (telha: m² com largura nominal). */
  directPurchase?: number;
  /** Tamanho da unidade de compra que substitui `purchase.size` (rufo, calha: roof.*Length). */
  unitSize?: number;
  note?: string;
  /** Massa líquida (kg). */
  kg: number;
  /** Entra no peso próprio (aço das peças é somado à parte). */
  inWeight: boolean;
}

const rect = (l: number, h: number): Vec2[] => [[0, 0], [l, 0], [l, h], [0, h]];
const toRect = (o: ResolvedOpening): Rect => ({ u0: o.u0, u1: o.u1, v0: o.v0, v1: o.v1 });
const openingArea = (o: ResolvedOpening) => (o.u1 - o.u0) * (o.v1 - o.v0);

/** Aberturas válidas por hospedeiro. */
export function openingsByHost(model: BuildingModel): Map<string, ResolvedOpening[]> {
  const map = new Map<string, ResolvedOpening[]>();
  for (const o of model.openings) {
    if (!o.valid) continue;
    const l = map.get(o.hostId) ?? [];
    l.push(o);
    map.set(o.hostId, l);
  }
  return map;
}

export interface WallAreas {
  gross: number;
  net: number;
}

export function wallAreas(w: HostWall, ops: ResolvedOpening[]): WallAreas {
  const gross = polygonArea(w.outline);
  return { gross, net: Math.max(0, gross - ops.reduce((s, o) => s + openingArea(o), 0)) };
}

const hasSheet = (m: Material) => m.purchase.sheet !== undefined;

/** Camadas de uma assembly aplicadas a um painel (parede ou água interna). */
function layerItems(
  out: Item[],
  catalog: Catalog,
  hostId: string,
  layers: AssemblyLayer[],
  outline: Vec2[],
  ops: ResolvedOpening[],
  net: number,
  singleFace: boolean,
): void {
  for (const l of layers) {
    const m = getMaterial(catalog, l.materialId);
    const faces = l.face === 'both' && !singleFace ? 2 : 1;
    const area = net * faces;
    const qty = area * l.consumptionPerM2;
    if (qty <= 0) continue;
    const it: Item = {
      hostId,
      stage: l.stage,
      itemId: m.id,
      net: qty,
      kg: qty * m.massPerUnit,
      inWeight: true,
    };
    if (hasSheet(m)) {
      const sh = m.purchase.sheet!;
      it.pages = paginateSheets(outline, ops.map(toRect), sh.width, sh.height) * faces;
      it.net = area;
      it.kg = area * l.consumptionPerM2 * m.massPerUnit;
    }
    out.push(it);
  }
}

function simple(
  out: Item[],
  catalog: Catalog,
  hostId: string,
  stage: Stage,
  itemId: string,
  net: number,
  extra: Partial<Item> & { kg?: number } = {},
): void {
  if (!(net > 0)) return;
  const m = getMaterial(catalog, itemId);
  out.push({ hostId, stage, itemId, net, kg: net * m.massPerUnit, inWeight: false, ...extra });
}

export const levelSlabId = (levelId: string) => `slab-${levelId}`;

/** Todos os itens não lineares (fechamentos, cobertura, mezanino, aberturas, fundação, piso, escadas). */
export function collectItems(model: BuildingModel, project: Project, catalog: Catalog): Item[] {
  const out: Item[] = [];
  const c = catalog.constants;
  const ops = openingsByHost(model);
  const ground = project.levels.find((l) => l.elevation === 0)!;

  // --- Fechamentos: paredes ------------------------------------------------
  for (const w of model.walls) {
    const asm = getAssembly(catalog, w.assemblyId);
    const wo = (ops.get(w.id) ?? []).filter((o) => o.hostKind === 'wall');
    const { net } = wallAreas(w, wo);
    layerItems(out, catalog, w.id, asm.layers, w.outline, wo, net, false);
  }

  // --- Fechamento interno das águas que também são parede (A-frame) --------
  const interior = getAssembly(catalog, project.system.assemblies.interior);
  const innerLayers = interior.layers.filter((l) => l.face === 'int' || l.face === 'core' || l.face === 'both');
  for (const r of model.roofPlanes) {
    if (!r.isWall) continue;
    const ro = ops.get(r.id) ?? [];
    const net = Math.max(0, r.area - ro.reduce((s, o) => s + openingArea(o), 0));
    layerItems(out, catalog, r.id, innerLayers, rect(r.uLength, r.vLength), ro, net, true);
  }

  // --- Cobertura -------------------------------------------------------------
  const clad = getMaterial(catalog, project.roof.cladding);
  const fmt = (n: number) => n.toFixed(2).replace('.', ',');
  const planeNet = (r: RoofPlane) =>
    Math.max(0, r.area - (ops.get(r.id) ?? []).reduce((s, o) => s + openingArea(o), 0));
  let roofNet = 0;
  let gableEdges = 0;
  let eaves = 0;
  let ridge = 0;
  for (const r of model.roofPlanes) {
    const net = planeNet(r);
    roofNet += net;
    const tiles = Math.ceil(r.uLength / c.roof.sandwichUsefulWidth - 1e-9);
    out.push({
      hostId: r.id,
      stage: 'roof',
      itemId: clad.id,
      net,
      directPurchase: tiles * r.vLength,
      note: `${tiles} telhas de ${fmt(r.vLength)} m`,
      kg: net * clad.massPerUnit,
      inWeight: true,
    });
    if (model.typology === 'flat_roof') {
      // Telhado plano: rufo no topo da platibanda (perímetro, abaixo); calha interna no lado baixo (largura).
      eaves += r.uLength;
    } else if (model.typology === 'shed') {
      gableEdges += 2 * r.vLength; // rufos laterais
      ridge += r.uLength; // cumeeira/rufo de encontro no lado alto
      eaves += r.uLength; // calha no lado baixo
    } else {
      gableEdges += 2 * r.vLength;
      ridge += r.uLength / 2; // cada cumeeira é compartilhada por duas águas
      if (!r.isWall) eaves += r.uLength;
    }
    for (const o of ops.get(r.id) ?? []) {
      if (o.type === 'skylight') simple(out, catalog, r.id, 'roof', 'skylight', openingArea(o));
    }
  }
  if (model.typology === 'flat_roof') {
    const t = project.typology;
    gableEdges += 2 * (t.width + t.depth);
  }
  const first = model.roofPlanes[0];
  simple(out, catalog, first?.id ?? 'roof-a', 'roof', 'ridge_cap', ridge);
  simple(out, catalog, first?.id ?? 'roof-a', 'roof', 'flashing', gableEdges, { unitSize: c.roof.flashingLength });
  if (project.roof.gutters) {
    simple(out, catalog, first?.id ?? 'roof-a', 'roof', 'gutter', eaves, { unitSize: c.roof.gutterLength });
  }
  simple(out, catalog, first?.id ?? 'roof-a', 'roof', 'screw_roof', roofNet * c.roof.screwsPerM2);

  // --- Mezanino --------------------------------------------------------------
  for (const s of model.slabs) {
    if (s.kind !== 'mezzanine') continue;
    const level = project.levels.find((l) => l.id === s.level);
    const asm = getAssembly(catalog, 'floor_osb18');
    for (const l of asm.layers) {
      const m = getMaterial(catalog, l.materialId);
      const qty = s.area * l.consumptionPerM2;
      out.push({ hostId: s.id, stage: l.stage, itemId: m.id, net: qty, kg: qty * m.massPerUnit, inWeight: true });
    }
    if (level?.guardrail) {
      const walls = model.walls;
      let len = 0;
      s.polygon.forEach((a, i) => {
        const b = s.polygon[(i + 1) % s.polygon.length]!;
        const onWall = walls.some(
          (w) => distToSegment(a, w.from, w.to) <= 0.05 && distToSegment(b, w.from, w.to) <= 0.05,
        );
        if (!onWall) len += length2(a, b);
      });
      simple(out, catalog, s.id, 'structure', 'guardrail', len);
    }
  }

  // --- Aberturas ---------------------------------------------------------------
  const wallById = new Map(model.walls.map((w) => [w.id, w]));
  for (const o of model.openings) {
    if (!o.valid || o.hostKind !== 'wall') continue;
    const w = wallById.get(o.hostId);
    if (o.type === 'door') {
      simple(out, catalog, o.hostId, 'finishing', w?.exteriorSide ? 'door_ext' : 'door_int', 1);
    } else if (o.type === 'window') simple(out, catalog, o.hostId, 'finishing', 'window_alu', openingArea(o));
    else if (o.type === 'sliding_door') simple(out, catalog, o.hostId, 'finishing', 'sliding_door', openingArea(o));
  }

  // --- Fundação radier -----------------------------------------------------------
  const radier = model.slabs.find((s) => s.kind === 'radier');
  if (radier) {
    const A = radier.area;
    const P = polylineLength(radier.polygon, true);
    const f = project.system.foundation;
    const r = c.radier;
    const vol = A * radier.thickness + P * r.edgeBeamWidth * Math.max(0, f.edgeBeamDepth - radier.thickness);
    simple(out, catalog, radier.id, 'foundation', 'concrete_fck25', vol, {
      kg: vol * c.concreteDensity,
      inWeight: true,
    });
    simple(out, catalog, radier.id, 'foundation', 'mesh_q138', A * r.meshOverlapFactor);
    simple(out, catalog, radier.id, 'foundation', 'lona_200', A * r.lonaOverlapFactor);
    simple(out, catalog, radier.id, 'foundation', 'gravel_1', A * r.gravelThickness);
    simple(out, catalog, radier.id, 'foundation', 'edge_form', P);
    for (const u of project.utilities) {
      const id = u.kind === 'sewer' ? 'pvc_sewer_100' : u.kind === 'water' ? 'pvc_water_25' : null;
      if (!id) continue;
      let d = Infinity;
      radier.polygon.forEach((a, i) => {
        d = Math.min(d, distToSegment(u.position, a, radier.polygon[(i + 1) % radier.polygon.length]!));
      });
      simple(out, catalog, radier.id, 'foundation', id, d + 1);
    }
  }

  // --- Piso ------------------------------------------------------------------------
  if (ground.floor !== undefined && ground.floor !== 'none') {
    const t = project.typology;
    const inner = model.walls
      .filter((w) => w.kind === 'interior' && w.level === ground.id)
      .reduce((s, w) => s + w.length * w.thickness, 0);
    const area = Math.max(0, t.width * t.depth - inner);
    const hid = radier?.id ?? 'radier';
    simple(out, catalog, hid, 'floor', 'floor_hardener', area * c.floor.hardenerKgPerM2);
    simple(out, catalog, hid, 'floor', 'sealer', area * c.floor.sealerLPerM2);
    const s = c.radier.floorJointSpacing;
    const lines = (len: number) => Math.max(0, Math.ceil(len / s - 1e-9) - 1);
    simple(out, catalog, hid, 'floor', 'joint_cut', lines(t.width) * t.depth + lines(t.depth) * t.width);
  }

  // --- Escadas -----------------------------------------------------------------------
  for (const s of model.stairs) {
    if (s.type === 'ladder') {
      simple(out, catalog, s.id, 'finishing', 'ladder', s.steps * s.riser, { inWeight: true });
    } else {
      simple(out, catalog, s.id, 'finishing', 'stair_tread', s.treads.length, { inWeight: true });
    }
  }

  return out;
}
