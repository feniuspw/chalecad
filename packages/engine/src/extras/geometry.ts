import type { TechnicalConstants } from '@chalecad/catalog';
import { add3, cross3, dot3, scale3, signedArea, sub3, type Vec2, type Vec3 } from '../geometry';
import type { Extra, Project } from '../schema/project';
import type { ExtraModel, RoofPlane } from '../schema/results';
import { waterTowerModel, type ExtraBuildContext } from './water_tower';

const DEG = Math.PI / 180;

/** Premissas geométricas e de consumo dos extras: `catalog.constants.extras`. */
export type ExtrasConstants = TechnicalConstants['extras'];

export type FenceE = Extract<Extra, { kind: 'fence' }>;
export type WallE = Extract<Extra, { kind: 'wall' }>;
export type DeckE = Extract<Extra, { kind: 'deck' }>;
type RetE = Extract<Extra, { kind: 'retaining' }>;

/** Pares de pontos consecutivos do caminho (com fechamento se `closed`). */
export function pathSegments(path: Vec2[], closed: boolean): [Vec2, Vec2][] {
  const out: [Vec2, Vec2][] = [];
  for (let i = 0; i + 1 < path.length; i++) out.push([path[i]!, path[i + 1]!]);
  if (closed && path.length > 2) out.push([path[path.length - 1]!, path[0]!]);
  return out;
}

export const segLen = (a: Vec2, b: Vec2): number => Math.hypot(b[0] - a[0], b[1] - a[1]);
export const pathLength = (path: Vec2[], closed: boolean): number =>
  pathSegments(path, closed).reduce((s, [a, b]) => s + segLen(a, b), 0);

/** Mourões: um por vão (arredondado para cima) em cada segmento, mais o ponto final se o caminho for aberto. */
export function fencePosts(e: FenceE): Vec2[] {
  const posts: Vec2[] = [];
  const segs = pathSegments(e.path, e.closed);
  for (const [a, b] of segs) {
    const n = Math.max(1, Math.ceil(segLen(a, b) / e.postSpacing - 1e-9));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      posts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  if (!e.closed || segs.length === 0) {
    const last = e.path[e.path.length - 1];
    if (last) posts.push([last[0], last[1]]);
  }
  return posts;
}

/** Fachada da edificação (no sentido das paredes: from → to), com direção para fora. */
export function facade(project: Project, side: DeckE['side']): { origin: Vec2; t: Vec2; n: Vec2; len: number } {
  const W = project.typology.width;
  const D = project.typology.depth;
  switch (side) {
    case 'front':
      return { origin: [0, 0], t: [1, 0], n: [0, -1], len: W };
    case 'right':
      return { origin: [W, 0], t: [0, 1], n: [1, 0], len: D };
    case 'back':
      return { origin: [W, D], t: [-1, 0], n: [0, 1], len: W };
    case 'left':
      return { origin: [0, D], t: [0, -1], n: [-1, 0], len: D };
  }
}

/** Topo do piso do deck em coordenadas da casa (piso acabado = 0): `level` ou o degrau padrão abaixo da soleira. */
export const deckTopZ = (e: DeckE, x: ExtrasConstants): number => e.level ?? -x.deck.stepBelowFloor;

export interface DeckGeometry {
  /** Polígono anti-horário (vazio se o deck não cabe na fachada). */
  polygon: Vec2[];
  length: number;
  /** Segmentos livres do guarda-corpo (lado da casa não conta). */
  rails: [Vec2, Vec2][];
  /** Ponto da fachada a + deslocamento q para fora. */
  at: (a: number, q: number) => Vec2;
  a0: number;
  a1: number;
  n: Vec2;
}

export function deckGeometry(project: Project, e: DeckE): DeckGeometry {
  const f = facade(project, e.side);
  const a0 = Math.min(e.offset, f.len);
  const length = Math.max(0, Math.min(e.length ?? f.len - a0, f.len - a0));
  const a1 = a0 + length;
  const at = (a: number, q: number): Vec2 => [f.origin[0] + f.t[0] * a + f.n[0] * q, f.origin[1] + f.t[1] * a + f.n[1] * q];
  if (length <= 0) return { polygon: [], length: 0, rails: [], at, a0, a1, n: f.n };
  let polygon: Vec2[] = [at(a0, 0), at(a1, 0), at(a1, e.depth), at(a0, e.depth)];
  if (signedArea(polygon) < 0) polygon = polygon.reverse();
  const rails: [Vec2, Vec2][] = [
    [at(a0, 0), at(a0, e.depth)],
    [at(a0, e.depth), at(a1, e.depth)],
    [at(a1, e.depth), at(a1, 0)],
  ];
  return { polygon, length, rails, at, a0, a1, n: f.n };
}

/**
 * Onde a cobertura do deck pode encostar na fachada sem atravessar o telhado principal:
 * `zMax` = cota máxima no encontro e `q0` = distância da fachada onde a água do deck começa
 * (nas fachadas de beiral, a água começa logo após o beiral principal, um pouco abaixo dele).
 */
function deckRoofStart(project: Project, side: DeckE['side']): { zMax: number; q0: number } {
  const t = project.typology;
  const margin = 0.1;
  switch (t.kind) {
    case 'gable_mezzanine':
    case 'gambrel':
    case 'combined': {
      const pitch = (t.kind === 'gambrel' ? t.lowerPitchDeg : t.roofPitchDeg) * DEG;
      const ridgeAlongY = t.kind === 'combined' ? false : project.roof.ridgeAxis === 'depth';
      const gableSide = ridgeAlongY ? side === 'front' || side === 'back' : side === 'left' || side === 'right';
      if (gableSide) return { zMax: t.wallHeight - margin, q0: 0 };
      return { zMax: t.wallHeight - t.eave * Math.tan(pitch) - 0.05, q0: t.eave };
    }
    case 'shed':
      return { zMax: t.lowHeight - margin, q0: 0 };
    case 'flat_roof':
      return { zMax: t.wallHeight - margin, q0: 0 };
    case 'a_frame':
      return { zMax: Math.max(2.4, Math.min(t.ridgeHeight * 0.45, 3)), q0: 0 };
  }
}

/** Água de cobertura do deck: meia-água encostada na fachada, caindo para fora, sem invadir o telhado principal. */
function deckRoof(id: string, e: DeckE, g: DeckGeometry, project: Project, x: ExtrasConstants): RoofPlane {
  const proj = e.depth + x.deckCoverBeiral;
  const start = deckRoofStart(project, e.side);
  const q0 = Math.min(start.q0, proj - 0.2);
  const run = proj - q0;
  // Inclinação padrão; se a fachada for baixa, suaviza (até o mínimo da telha) para manter o pé-direito livre.
  const desiredHigh = deckTopZ(e, x) + x.deckCoverClearance + run * Math.tan(x.deckCoverPitchDeg * DEG);
  const zHigh = Math.min(desiredHigh, start.zMax);
  const fitSlope = Math.atan(Math.max(0, zHigh - (deckTopZ(e, x) + x.deckCoverMinClearance)) / run) / DEG;
  const pitchDeg = Math.max(x.deckCoverMinPitchDeg, Math.min(x.deckCoverPitchDeg, fitSlope));
  const slope = pitchDeg * DEG;
  const cos = Math.cos(slope);
  const sin = Math.sin(slope);
  const tan = Math.tan(slope);
  const pt = (a: number, q: number): Vec3 => {
    const p = g.at(a, q);
    return [p[0], p[1], zHigh - (q - q0) * tan];
  };
  const vDir: Vec3 = [-g.n[0] * cos, -g.n[1] * cos, sin];
  const nDir: Vec3 = [g.n[0] * sin, g.n[1] * sin, cos];
  const uDir = cross3(vDir, nDir);
  const p0 = pt(g.a0, proj);
  const p1 = pt(g.a1, proj);
  const origin = dot3(uDir, sub3(p1, p0)) > 0 ? p0 : p1;
  const uLength = g.length;
  const vLength = (proj - q0) / cos;
  const du = scale3(uDir, uLength);
  const dv = scale3(vDir, vLength);
  return {
    id,
    vertices: [origin, add3(origin, du), add3(add3(origin, du), dv), add3(origin, dv)],
    slopeDeg: pitchDeg,
    area: uLength * vLength,
    origin,
    uAxis: uDir,
    vAxis: vDir,
    uLength,
    vLength,
    isWall: false,
  };
}

function fenceModel(e: FenceE, x: ExtrasConstants): ExtraModel {
  const segments: ExtraModel['segments'] = [];
  for (const [from, to] of pathSegments(e.path, e.closed)) {
    if (e.baseWallHeight > 0) {
      segments.push({ from, to, height: e.baseWallHeight, thickness: x.blockThickness, baseZ: 0, material: 'block' });
    }
    segments.push({ from, to, height: e.height - e.baseWallHeight, thickness: 0.02, baseZ: e.baseWallHeight, material: 'mesh' });
  }
  const size = x.postSize[e.postType];
  return {
    id: e.id,
    kind: 'fence',
    segments,
    posts: fencePosts(e).map((position) => ({ position, height: e.height, size })),
  };
}

function wallModel(e: WallE, x: ExtrasConstants): ExtraModel {
  const lsf = e.system === 'lsf_board';
  return {
    id: e.id,
    kind: 'wall',
    segments: pathSegments(e.path, e.closed).map(([from, to]) => ({
      from,
      to,
      height: e.height,
      thickness: lsf ? x.lsfWallThickness : x.blockThickness,
      baseZ: 0,
      material: lsf ? ('board' as const) : ('block' as const),
    })),
    posts: [],
  };
}

function retainingModel(e: RetE, x: ExtrasConstants): ExtraModel {
  const material = e.type === 'gabion' ? 'gabion' : e.type === 'concrete' ? 'concrete' : 'block';
  return {
    id: e.id,
    kind: 'retaining',
    segments: pathSegments(e.path, false).map(([from, to]) => ({
      from,
      to,
      height: e.height,
      thickness: x.retainingThickness,
      baseZ: 0,
      material,
    })),
    posts: [],
  };
}

function deckModel(project: Project, e: DeckE, x: ExtrasConstants): ExtraModel {
  const g = deckGeometry(project, e);
  const m: ExtraModel = { id: e.id, kind: 'deck', segments: [], posts: [], polygon: g.polygon, topZ: deckTopZ(e, x) };
  if (g.polygon.length === 0) return m;
  if (e.guardrail !== false) {
    for (const [from, to] of g.rails) {
      m.segments.push({
        from,
        to,
        height: x.guardrailHeight,
        thickness: x.guardrailThickness,
        baseZ: deckTopZ(e, x),
        material: 'rail',
      });
    }
  }
  if (e.covered) {
    // `roof` presente = deck coberto (ExtraModel não tem flag `covered`).
    m.roof = deckRoof(e.id, e, g, project, x);
    const lowEdgeZ = Math.min(...m.roof.vertices.map((v) => v[2]));
    const postHeight = lowEdgeZ + x.deckCoverBeiral * Math.tan(m.roof.slopeDeg * DEG) - deckTopZ(e, x);
    const n = Math.max(1, Math.ceil(g.length / x.deckPostSpacing - 1e-9));
    for (let i = 0; i <= n; i++) {
      const a = g.a0 + (g.length * i) / n;
      m.posts.push({ position: g.at(a, e.depth), height: postHeight, size: x.deckPostSize });
    }
  }
  return m;
}

/** Geometria 3D dos extras (muro, cerca, deck, arrimo, torre da caixa d'água) na ordem de `project.extras`. */
export function buildExtraModels(project: Project, x: ExtrasConstants, ctx?: ExtraBuildContext): ExtraModel[] {
  return project.extras.map((e) => {
    switch (e.kind) {
      case 'fence':
        return fenceModel(e, x);
      case 'wall':
        return wallModel(e, x);
      case 'deck':
        return deckModel(project, e, x);
      case 'retaining':
        return retainingModel(e, x);
      case 'water_tower':
        return waterTowerModel(project, e, x, ctx);
    }
  });
}
