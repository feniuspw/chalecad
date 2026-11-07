import type { Assembly, Catalog, Profile } from '@chalecad/catalog';
import {
  bbox3,
  length2,
  normalizeZero,
  offsetPolygon,
  pointInPolygon,
  polygonArea,
  distToSegment,
  cross3,
  add3,
  scale3,
  sub3,
  dot3,
  type Vec2,
  type Vec3,
} from '../geometry';
import type { Level, Project, Wall } from '../schema/project';
import type {
  BuildingModel,
  HostWall,
  ResolvedOpening,
  RoofPlane,
  SlabModel,
} from '../schema/results';
import { buildExtraModels } from '../extras';
import { buildStair } from './stairs';
import { slopedGeometry } from './sloped';
import { gambrelGeometry } from './gambrel';
import { combinedGeometry, type CombinedGeometry } from './combined';

const DEG = Math.PI / 180;

function findProfile(cat: Catalog, id: string): Profile {
  const p = cat.profiles.find((x) => x.id === id);
  if (!p) throw new Error(`Perfil não encontrado no catálogo: ${id}`);
  return p;
}

function findAssembly(cat: Catalog, id: string): Assembly {
  const a = cat.assemblies.find((x) => x.id === id);
  if (!a) throw new Error(`Assembly não encontrada no catálogo: ${id}`);
  return a;
}

/**
 * Espessura da parede (m) = alma do montante + camadas da assembly.
 * Camadas `core` ficam dentro da alma (não somam); `both` conta nas duas faces.
 */
function wallThickness(web: number, a: Assembly): number {
  let mm = web;
  for (const l of a.layers) {
    if (l.face === 'core') continue;
    mm += l.thickness * (l.face === 'both' ? 2 : 1);
  }
  return mm / 1000;
}

const rect = (l: number, h: number): Vec2[] => [[0, 0], [l, 0], [l, h], [0, h]];

export function buildModel(project: Project, catalog: Catalog): BuildingModel {
  const { typology: t, system, levels } = project;
  const c = catalog.constants;
  const stud = findProfile(catalog, system.profiles.wallStud);
  const joist = findProfile(catalog, system.profiles.joist);
  const thicknessOf = (assemblyId: string) => wallThickness(stud.web, findAssembly(catalog, assemblyId));

  const W = t.width;
  const D = t.depth;
  const groundLevel = levels.find((l) => l.elevation === 0)!;
  const extId = system.assemblies.exterior;
  const extT = thicknessOf(extId);

  const walls: HostWall[] = [];
  const mkWall = (w: Partial<HostWall> & Pick<HostWall, 'id' | 'kind' | 'from' | 'to' | 'outline' | 'assemblyId'>): HostWall => ({
    level: groundLevel.id,
    baseZ: 0,
    length: length2(w.from, w.to),
    thickness: thicknessOf(w.assemblyId),
    exteriorSide: null,
    loadBearing: false,
    wet: false,
    ...w,
  });

  const front: Vec2[] = [[0, 0], [W, 0]];
  const right: Vec2[] = [[W, 0], [W, D]];
  const back: Vec2[] = [[W, D], [0, D]];
  const left: Vec2[] = [[0, D], [0, 0]];
  const ext = (id: string, [from, to]: Vec2[], outline: Vec2[], kind: HostWall['kind'], assemblyId = extId) =>
    walls.push(
      mkWall({ id, kind, from: from!, to: to!, outline, assemblyId, exteriorSide: 'right', loadBearing: true }),
    );

  let roofPlanes: RoofPlane[];
  let ridgeHeight: number;
  let roofZ: (x: number, y: number) => number;
  /** Altura das paredes internas do térreo sem nível acima (null = vai até o telhado). */
  let groundWallHeight: number | null;
  let combined: CombinedGeometry | undefined;

  if (t.kind === 'shed' || t.kind === 'flat_roof') {
    const sg = slopedGeometry(t);
    roofPlanes = [sg.roofPlane];
    ridgeHeight = sg.ridgeHeight;
    roofZ = sg.roofZ;
    groundWallHeight = sg.groundWallHeight;
    for (const w of sg.walls) {
      walls.push(mkWall({ ...w, assemblyId: extId, exteriorSide: 'right', loadBearing: w.kind !== 'parapet' }));
    }
  } else if (t.kind === 'gambrel') {
    const gg = gambrelGeometry(t, project.roof.ridgeAxis);
    roofPlanes = gg.roofPlanes;
    ridgeHeight = gg.ridgeHeight;
    roofZ = gg.roofZ;
    groundWallHeight = null;
    for (const w of gg.walls) walls.push(mkWall({ ...w, assemblyId: extId, exteriorSide: 'right', loadBearing: true }));
  } else if (t.kind === 'combined') {
    combined = combinedGeometry(t);
    roofPlanes = combined.roofPlanes;
    ridgeHeight = combined.ridgeHeight;
    roofZ = combined.roofZ;
    groundWallHeight = null;
    for (const w of combined.walls) walls.push(mkWall({ ...w, assemblyId: extId, exteriorSide: 'right', loadBearing: true }));
  } else {
    const isGable = t.kind === 'gable_mezzanine';
    groundWallHeight = t.kind === 'gable_mezzanine' ? t.wallHeight : null;
    const ridgeAxis = isGable ? project.roof.ridgeAxis : 'depth';
    const S = ridgeAxis === 'depth' ? W : D; // vão (através da cumeeira)
    const L = ridgeAxis === 'depth' ? D : W; // comprimento ao longo da cumeeira

    // --- Telhado --------------------------------------------------------------
    const knee = t.kind === 'a_frame' ? t.kneeWallHeight : 0;
    const eave = t.kind === 'gable_mezzanine' ? t.eave : 0;
    const rake = t.rake;
    const zBase = t.kind === 'gable_mezzanine' ? t.wallHeight : knee;
    const slopeRad = t.kind === 'gable_mezzanine' ? t.roofPitchDeg * DEG : Math.atan2(t.ridgeHeight - knee, S / 2);
    ridgeHeight = t.kind === 'gable_mezzanine' ? zBase + (S / 2) * Math.tan(slopeRad) : t.ridgeHeight;
    const cos = Math.cos(slopeRad);
    const sin = Math.sin(slopeRad);

    const m = (a: number, l: number, z: number): Vec3 => (ridgeAxis === 'depth' ? [a, l, z] : [l, a, z]);
    const mv = (v: Vec3): Vec3 => (ridgeAxis === 'depth' ? v : [v[1], v[0], v[2]]);

    const roofPlane = (id: string, side: 'a' | 'b'): RoofPlane => {
      const a0 = side === 'a' ? -eave : S + eave;
      const zE = zBase - eave * Math.tan(slopeRad);
      const vDir = mv(side === 'a' ? [cos, 0, sin] : [-cos, 0, sin]);
      const nDir = mv(side === 'a' ? [-sin, 0, cos] : [sin, 0, cos]);
      const uDir = cross3(vDir, nDir);
      const p0 = m(a0, -rake, zE);
      const p1 = m(a0, L + rake, zE);
      const origin = dot3(uDir, sub3(p1, p0)) > 0 ? p0 : p1;
      const uLength = L + 2 * rake;
      const vLength = (S / 2 + eave) / cos;
      const du = scale3(uDir, uLength);
      const dv = scale3(vDir, vLength);
      return {
        id,
        vertices: [origin, add3(origin, du), add3(add3(origin, du), dv), add3(origin, dv)],
        slopeDeg: slopeRad / DEG,
        area: uLength * vLength,
        origin,
        uAxis: uDir,
        vAxis: vDir,
        uLength,
        vLength,
        isWall: !isGable,
      };
    };
    roofPlanes = [roofPlane('roof-a', 'a'), roofPlane('roof-b', 'b')];

    /** Cota do telhado sobre um ponto da planta. */
    roofZ = (x: number, y: number): number => {
      const a = Math.min(Math.max(ridgeAxis === 'depth' ? x : y, 0), S);
      return zBase + (S / 2 - Math.abs(a - S / 2)) * Math.tan(slopeRad);
    };
    const gableOutline = (len: number, h: number, top: number): Vec2[] =>
      h > 0
        ? [[0, 0], [len, 0], [len, h], [len / 2, top], [0, h]]
        : [[0, 0], [len, 0], [len / 2, top]];
    if (t.kind === 'gable_mezzanine') {
      const H = t.wallHeight;
      const gOut = (len: number) => gableOutline(len, H, ridgeHeight);
      if (ridgeAxis === 'depth') {
        ext('ext-front', front, gOut(W), 'exterior');
        ext('ext-right', right, rect(D, H), 'exterior');
        ext('ext-back', back, gOut(W), 'exterior');
        ext('ext-left', left, rect(D, H), 'exterior');
      } else {
        ext('ext-front', front, rect(W, H), 'exterior');
        ext('ext-right', right, gOut(D), 'exterior');
        ext('ext-back', back, rect(W, H), 'exterior');
        ext('ext-left', left, gOut(D), 'exterior');
      }
    } else {
      const gOut = gableOutline(W, knee, ridgeHeight);
      const gAssembly = (mode: 'closed' | 'glazed' | 'open') => (mode === 'glazed' ? 'gable_glazed' : extId);
      if (t.frontGable !== 'open') ext('ext-front', front, gOut, 'gable', gAssembly(t.frontGable));
      if (knee > 0) ext('ext-right', right, rect(D, knee), 'knee');
      if (t.backGable !== 'open') ext('ext-back', back, gOut, 'gable', gAssembly(t.backGable));
      if (knee > 0) ext('ext-left', left, rect(D, knee), 'knee');
    }
  }

  // --- Lajes ----------------------------------------------------------------
  const h = extT / 2;
  const footprint: Vec2[] = combined
    ? offsetPolygon(combined.axisPolygon, h)
    : [[-h, -h], [W + h, -h], [W + h, D + h], [-h, D + h]];
  const radierPoly = offsetPolygon(footprint, system.foundation.border);
  const slabs: SlabModel[] = [
    {
      id: 'radier',
      kind: 'radier',
      level: groundLevel.id,
      polygon: radierPoly,
      topZ: 0,
      thickness: system.foundation.thickness,
      area: polygonArea(radierPoly),
    },
  ];
  const mezzLevels = levels.filter((l): l is Level & { polygon: Vec2[] } => !!l.polygon && l.elevation > 0);
  for (const l of mezzLevels) {
    slabs.push({
      id: `slab-${l.id}`,
      kind: 'mezzanine',
      level: l.id,
      polygon: l.polygon.map((p) => [p[0], p[1]] as Vec2),
      topZ: l.elevation,
      thickness: joist.web / 1000 + 0.018,
      area: polygonArea(l.polygon),
    });
  }

  // --- Paredes do usuário ---------------------------------------------------
  const sortedElevs = [...new Set(levels.map((l) => l.elevation))].sort((a, b) => a - b);
  const mezzEdges: [Vec2, Vec2][] = [];
  for (const l of mezzLevels) {
    l.polygon.forEach((p, i) => mezzEdges.push([p, l.polygon[(i + 1) % l.polygon.length]!]));
  }
  const onMezzEdge = (w: Wall) =>
    mezzEdges.some(
      ([a, b]) => distToSegment(w.from, a, b) <= 0.05 && distToSegment(w.to, a, b) <= 0.05,
    );

  for (const w of project.walls) {
    const lvl = levels.find((l) => l.id === w.level);
    if (!lvl) throw new Error(`Nível inexistente: ${w.level}`);
    const assemblyId = w.assembly ?? (w.wet ? system.assemblies.wet : system.assemblies.interior);
    const asm = findAssembly(catalog, assemblyId);
    const next = sortedElevs.find((e) => e > lvl.elevation);
    let height: number;
    if (w.height !== undefined) height = w.height;
    else if (next !== undefined) height = next - lvl.elevation;
    else if (lvl.elevation === 0 && groundWallHeight !== null) height = groundWallHeight;
    else {
      const mid: Vec2 = [(w.from[0] + w.to[0]) / 2, (w.from[1] + w.to[1]) / 2];
      height = Math.max(Math.min(roofZ(mid[0], mid[1]) - lvl.elevation, c.defaultCeilingMax), 0);
    }
    const len = length2(w.from, w.to);
    walls.push(
      mkWall({
        id: w.id,
        kind: 'interior',
        level: lvl.id,
        from: [w.from[0], w.from[1]],
        to: [w.to[0], w.to[1]],
        baseZ: lvl.elevation,
        outline: rect(len, height),
        assemblyId,
        loadBearing: onMezzEdge(w),
        wet: w.wet === true || asm.kind === 'wall_wet',
      }),
    );
  }

  // --- Aberturas ------------------------------------------------------------
  const hostOutline = new Map<string, { kind: 'wall' | 'roof'; outline: Vec2[] }>();
  for (const w of walls) hostOutline.set(w.id, { kind: 'wall', outline: w.outline });
  for (const r of roofPlanes) hostOutline.set(r.id, { kind: 'roof', outline: rect(r.uLength, r.vLength) });

  const openings: ResolvedOpening[] = project.openings.map((o) => {
    const host = hostOutline.get(o.host);
    const wantsRoof = o.type === 'skylight';
    const v0 = o.type === 'door' || o.type === 'sliding_door' ? 0 : o.sill;
    const u0 = o.offset;
    const u1 = o.offset + o.width;
    const v1 = v0 + o.height;
    let valid = false;
    if (host && (host.kind === 'roof') === wantsRoof) {
      valid = ([[u0, v0], [u1, v0], [u1, v1], [u0, v1]] as Vec2[]).every((p) => pointInPolygon(p, host.outline, 1e-6));
    }
    return {
      id: o.id,
      hostId: o.host,
      hostKind: host ? host.kind : wantsRoof ? 'roof' : 'wall',
      type: o.type,
      u0,
      u1,
      v0,
      v1,
      valid,
    };
  });

  // --- Escadas --------------------------------------------------------------
  const stairs = project.stairs.map((s) => {
    const a = levels.find((l) => l.id === s.from);
    const b = levels.find((l) => l.id === s.to);
    if (!a || !b) throw new Error(`Nível inexistente na escada ${s.id}`);
    return buildStair(s, a.elevation, b.elevation, c);
  });

  // --- Totais ---------------------------------------------------------------
  const mezzArea = mezzLevels.reduce((s, l) => s + polygonArea(l.polygon), 0);
  const pts: Vec3[] = [];
  for (const r of roofPlanes) pts.push(...r.vertices);
  for (const s of slabs) {
    for (const p of s.polygon) {
      pts.push([p[0], p[1], s.topZ], [p[0], p[1], s.topZ - s.thickness]);
    }
  }
  for (const p of footprint) pts.push([p[0], p[1], 0]);
  for (const w of walls) {
    if (w.kind !== 'parapet') continue;
    const top = w.baseZ + Math.max(...w.outline.map((o) => o[1]));
    pts.push([w.from[0], w.from[1], top], [w.to[0], w.to[1], top]);
  }

  const model: BuildingModel = {
    typology: t.kind,
    footprint,
    footprintArea: polygonArea(footprint),
    builtArea: (combined ? polygonArea(combined.axisPolygon) : W * D) + mezzArea,
    walls,
    roofPlanes,
    slabs,
    openings,
    stairs,
    extras: buildExtraModels(project, catalog.constants.extras),
    ridgeHeight,
    bbox: bbox3(pts),
  };
  return normalizeZero(model);
}

export { combinedGeometry, type CombinedGeometry, type Valley } from './combined';
export { gambrelGeometry, type GambrelGeometry } from './gambrel';
