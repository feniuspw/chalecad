import type { TechnicalConstants } from '@chalecad/catalog';
import { pointInPolygon, signedArea, type Vec2 } from '../geometry';
import type { Extra, Project } from '../schema/project';
import type { ExtraModel } from '../schema/results';

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

// ---------------------------------------------------------------------------
// Deck: fachada (face externa do contorno), cota e polígono
// ---------------------------------------------------------------------------

/** Face externa do contorno: início (quina), direção ao longo (anti-horário), normal para fora e comprimento. */
export interface DeckFace {
  origin: Vec2;
  t: Vec2;
  n: Vec2;
  len: number;
}

const SIDE_NORMAL: Record<DeckE['side'], Vec2> = { front: [0, -1], right: [1, 0], back: [0, 1], left: [-1, 0] };

/** LOCAL: degrau padrão quando o catálogo não é passado (igual a `catalog.constants.extras.deck.stepBelowFloor`). */
const STEP_BELOW_FLOOR_FALLBACK = 0.03;

/** Retângulo no eixo das paredes: contorno de reserva quando o modelo ainda não tem `footprint`. */
export const axisFootprint = (project: Project): Vec2[] => {
  const W = project.typology.width;
  const D = project.typology.depth;
  return [[0, 0], [W, 0], [W, D], [0, D]];
};

/** Anti-horário e sem vértices repetidos ou colineares (faces colineares viram uma só). */
export function cleanFootprint(poly: Vec2[]): Vec2[] {
  let p = poly.filter((v, i) => {
    const w = poly[(i + 1) % poly.length]!;
    return Math.hypot(v[0] - w[0], v[1] - w[1]) > 1e-6;
  });
  if (signedArea(p) < 0) p = [...p].reverse();
  let changed = true;
  while (changed && p.length > 3) {
    changed = false;
    for (let i = 0; i < p.length; i++) {
      const a = p[(i + p.length - 1) % p.length]!;
      const b = p[i]!;
      const c = p[(i + 1) % p.length]!;
      const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      const dt = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]);
      if (Math.abs(cr) < 1e-6 && dt > 0) {
        p = p.filter((_, k) => k !== i);
        changed = true;
        break;
      }
    }
  }
  return p;
}

/**
 * Faces externas do contorno cuja normal aponta para `side`, da mais externa para a mais interna
 * (desempate pelo comprimento, a maior primeiro). A origem de cada face é a quina em que ela começa.
 */
export function deckFaces(footprint: Vec2[], side: DeckE['side']): DeckFace[] {
  const poly = cleanFootprint(footprint);
  const sn = SIDE_NORMAL[side];
  const faces: DeckFace[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-6) continue;
    const t: Vec2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const n: Vec2 = [t[1], -t[0]];
    if (n[0] * sn[0] + n[1] * sn[1] > 0.99) faces.push({ origin: a, t, n, len });
  }
  const depthOf = (f: DeckFace) => f.origin[0] * sn[0] + f.origin[1] * sn[1];
  return faces.sort((f, g) => (Math.abs(depthOf(g) - depthOf(f)) > 1e-4 ? depthOf(g) - depthOf(f) : g.len - f.len));
}

/** Fachada escolhida (`index` inexistente cai na 0). Sem `footprint`, usa o retângulo dos eixos. */
export function facade(project: Project, side: DeckE['side'], footprint?: Vec2[], index = 0): DeckFace {
  const faces = deckFaces(footprint ?? axisFootprint(project), side);
  const f = faces[index] ?? faces[0];
  if (f) return f;
  // Contorno degenerado: cai no retângulo dos eixos.
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

/** Comprimento da face escolhida (para "fachada inteira" na interface). */
export const deckFaceLength = (project: Project, side: DeckE['side'], footprint?: Vec2[], index = 0): number =>
  facade(project, side, footprint, index).len;

/** Quantas faces externas voltadas para `side` existem (para o seletor de `facadeIndex`). */
export const deckFaceCount = (project: Project, side: DeckE['side'], footprint?: Vec2[]): number =>
  deckFaces(footprint ?? axisFootprint(project), side).length;

/** Topo do piso do deck em coordenadas da casa (piso acabado = 0): `level` ou o degrau padrão abaixo da soleira. */
export const deckTopZ = (e: DeckE, x?: ExtrasConstants): number => e.level ?? -(x?.deck.stepBelowFloor ?? STEP_BELOW_FLOOR_FALLBACK);

export interface DeckGeometry {
  /** Polígono anti-horário (vazio se o deck não cabe na fachada). */
  polygon: Vec2[];
  /** Comprimento ao longo da face. */
  length: number;
  /** Bordas livres do guarda-corpo, em ordem início → externa → fim (o lado da casa não conta). */
  rails: [Vec2, Vec2][];
  /** Ponto da face a + deslocamento q para fora. */
  at: (a: number, q: number) => Vec2;
  a0: number;
  a1: number;
  /** Onde o piso começa (distância da face da parede): 0 ou a face do radier. */
  q0: number;
  /** Onde o piso termina (profundidade medida da face da parede, reduzida se esbarrasse no contorno). */
  q1: number;
  n: Vec2;
  t: Vec2;
  face: DeckFace;
}

export interface DeckGeometryOpts {
  x?: ExtrasConstants;
  /** Contorno externo das paredes (`model.footprint`). */
  footprint?: Vec2[];
}

/** Geometria em planta do deck preso à face externa do contorno, com `align`/`offset`, radier e contorno respeitados. */
export function deckGeometry(project: Project, e: DeckE, opts: DeckGeometryOpts = {}): DeckGeometry {
  const footprint = cleanFootprint(opts.footprint ?? axisFootprint(project));
  const f = facade(project, e.side, footprint, e.facadeIndex);
  const topZ = deckTopZ(e, opts.x);
  const found = project.system.foundation;
  // O piso não pode ocupar o radier: se o topo cair dentro da espessura dele, começa na face do radier.
  const q0 = topZ > -found.thickness - 1e-9 ? found.border : 0;
  const at = (a: number, q: number): Vec2 => [f.origin[0] + f.t[0] * a + f.n[0] * q, f.origin[1] + f.t[1] * a + f.n[1] * q];
  const empty = (): DeckGeometry => ({ polygon: [], length: 0, rails: [], at, a0: 0, a1: 0, q0, q1: q0, n: f.n, t: f.t, face: f });

  // Alinhamento ao longo da face; sempre preso a [0, len] (quina a quina).
  let a0: number;
  let a1: number;
  if (e.align === 'end') {
    a1 = f.len + e.offset;
    a0 = e.length === undefined ? 0 : a1 - e.length;
  } else if (e.align === 'center') {
    const c = f.len / 2 + e.offset;
    const half = (e.length ?? f.len) / 2;
    a0 = c - half;
    a1 = c + half;
  } else {
    a0 = e.offset;
    a1 = e.length === undefined ? f.len : a0 + e.length;
  }
  a0 = Math.max(0, a0);
  a1 = Math.min(f.len, a1);
  const length = a1 - a0;
  if (length <= 1e-6) return empty();

  // Não entra no contorno (planta em L, anexos): a profundidade para onde a primeira amostra cai dentro dele.
  let q1 = e.depth;
  const step = 0.05;
  const samplesA: number[] = [];
  for (let a = a0 + 0.02; a < a1 - 0.02; a += 0.1) samplesA.push(a);
  samplesA.push(Math.max(a0, a1 - 0.02));
  scan: for (let q = q0 + 0.02; q <= e.depth + 1e-9; q += step) {
    for (const a of samplesA) {
      if (pointInPolygon(at(a, q), footprint, 1e-6)) {
        q1 = q - step;
        break scan;
      }
    }
  }
  if (q1 - q0 < 0.5) return empty();

  let polygon: Vec2[] = [at(a0, q0), at(a1, q0), at(a1, q1), at(a0, q1)];
  if (signedArea(polygon) < 0) polygon = polygon.reverse();
  const rails: [Vec2, Vec2][] = [
    [at(a0, q0), at(a0, q1)],
    [at(a0, q1), at(a1, q1)],
    [at(a1, q1), at(a1, q0)],
  ];
  return { polygon, length, rails, at, a0, a1, q0, q1, n: f.n, t: f.t, face: f };
}

/** Comprimento total de uma lista de segmentos. */
export const railsLength = (rails: [Vec2, Vec2][]): number => rails.reduce((s, [a, b]) => s + segLen(a, b), 0);

export function fenceModel(e: FenceE, x: ExtrasConstants): ExtraModel {
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

export function wallModel(e: WallE, x: ExtrasConstants): ExtraModel {
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

export function retainingModel(e: RetE, x: ExtrasConstants): ExtraModel {
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

