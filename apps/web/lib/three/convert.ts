/**
 * Convenção de coordenadas
 * ------------------------
 * O motor trabalha em [x, y, z] com z para cima (planta em x,y). A cena Three.js é y-up.
 * Toda a geometria da edificação é montada em coordenadas do motor dentro de UM único
 * `<group rotation={[-Math.PI / 2, 0, 0]}>`, que leva (x, y, z) do motor para (x, z, -y) na cena.
 * Portanto, dentro desse grupo NÃO se converte nada.
 *
 * `toThree` existe só para o que vive fora do grupo (câmera, enquadramento, bbox, luzes).
 *
 * Este arquivo é puro: não importa three nem React, para ser testável sem WebGL.
 * Tipos vêm de `@chalecad/engine` (import type, sem custo em runtime).
 */
import type { HostWall, ResolvedOpening, RoofPlane, SlabModel, Vec3 } from '@chalecad/engine';

export type V2 = [number, number];

/** Motor (z-up) para cena (y-up). Usar só fora do grupo rotacionado. */
export function toThree([x, y, z]: Vec3): Vec3 {
  return [x, z, -y + 0]; // + 0 evita -0
}

export interface ThreeBounds {
  min: Vec3;
  max: Vec3;
  center: Vec3;
  size: Vec3;
  /** Raio da esfera que envolve a caixa. */
  radius: number;
}

/** bbox do motor para limites na cena (min/max recalculados, pois a conversão inverte o eixo z). */
export function bboxToThree(bbox: { min: Vec3; max: Vec3 }): ThreeBounds {
  const a = toThree(bbox.min);
  const b = toThree(bbox.max);
  const min: Vec3 = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])];
  const max: Vec3 = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
  const size: Vec3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const radius = Math.hypot(size[0], size[1], size[2]) / 2;
  return { min, max, center, size, radius };
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Referencial local (destro): u x v = w. Posição de um ponto local (a, b, c) = origin + a*u + b*v + c*w. */
export interface Basis {
  origin: Vec3;
  u: Vec3;
  v: Vec3;
  w: Vec3;
}

/**
 * Referencial da parede em coordenadas do motor: origem em `from` na cota `baseZ`,
 * u ao longo de from→to, v para cima, w = u x v (aponta para a DIREITA de from→to).
 * A espessura é centrada em w = 0.
 */
export function wallBasis(wall: Pick<HostWall, 'from' | 'to' | 'baseZ'>): Basis {
  const dx = wall.to[0] - wall.from[0];
  const dy = wall.to[1] - wall.from[1];
  const l = Math.hypot(dx, dy) || 1;
  const u: Vec3 = [dx / l, dy / l, 0];
  const v: Vec3 = [0, 0, 1];
  return { origin: [wall.from[0], wall.from[1], wall.baseZ], u, v, w: cross(u, v) };
}

function pointInPolygon(p: V2, poly: V2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i] as V2;
    const [xj, yj] = poly[j] as V2;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const EPS = 1e-6;

/** O retângulo do vão cabe inteiro dentro do contorno (todos os cantos dentro ou na borda)? */
export function openingFits(op: Pick<ResolvedOpening, 'u0' | 'u1' | 'v0' | 'v1'>, outline: V2[]): boolean {
  if (!(op.u1 > op.u0 + EPS && op.v1 > op.v0 + EPS)) return false;
  const inset = 1e-4; // tolera vão encostado na borda do contorno
  const corners: V2[] = [
    [op.u0 + inset, op.v0 + inset],
    [op.u1 - inset, op.v0 + inset],
    [op.u1 - inset, op.v1 - inset],
    [op.u0 + inset, op.v1 - inset],
  ];
  return corners.every((c) => pointInPolygon(c, outline));
}

export interface WallShapeParams {
  outline: V2[];
  /** Furos (retângulos) no sistema local (u, v), um por abertura válida que cabe na parede. */
  holes: V2[][];
  /** Extrusão (espessura), a ser centrada em w = 0. */
  depth: number;
  /** Aberturas efetivamente recortadas. */
  openings: ResolvedOpening[];
}

function rectHole(op: Pick<ResolvedOpening, 'u0' | 'u1' | 'v0' | 'v1'>): V2[] {
  // sentido horário, como esperado para furos
  return [
    [op.u0, op.v0],
    [op.u0, op.v1],
    [op.u1, op.v1],
    [op.u1, op.v0],
  ];
}

/** Contorno + furos da parede. Só entram aberturas `valid`, de parede, deste hospedeiro e que cabem. */
export function wallShapeParams(wall: HostWall, openings: ResolvedOpening[]): WallShapeParams {
  const outline = wall.outline as V2[];
  const used = openings.filter(
    (o) => o.valid && o.hostKind === 'wall' && o.hostId === wall.id && openingFits(o, outline),
  );
  return { outline, holes: used.map(rectHole), depth: wall.thickness, openings: used };
}

export interface OpeningPlacement {
  /** Centro e tamanho no referencial local do hospedeiro (u, v). */
  center: V2;
  size: V2;
}

/** Posicionamento de uma abertura (centro/tamanho) no referencial do hospedeiro. */
export function openingPlacement(op: Pick<ResolvedOpening, 'u0' | 'u1' | 'v0' | 'v1'>): OpeningPlacement {
  return {
    center: [(op.u0 + op.u1) / 2, (op.v0 + op.v1) / 2],
    size: [op.u1 - op.u0, op.v1 - op.v0],
  };
}

export interface RoofSlabParams {
  basis: Basis;
  /** Contorno da água no referencial local (u, v). */
  outline: V2[];
  /** Furos de claraboias no mesmo referencial. */
  holes: V2[][];
  /** Espessura da placa; a face inferior coincide com o plano da água e a placa cresce para fora (+w). */
  thickness: number;
  /** Normal externa unitária. */
  normal: Vec3;
}

/** Base (referencial + contorno 2D) da placa que representa uma água do telhado. */
export function roofSlabParams(
  plane: RoofPlane,
  openings: ResolvedOpening[] = [],
  thickness = 0.04,
): RoofSlabParams {
  const u = norm(plane.uAxis);
  const v = norm(plane.vAxis);
  const w = norm(cross(u, v));
  const outline = plane.vertices.map((p): V2 => {
    const d = sub(p, plane.origin);
    return [dot(d, u), dot(d, v)];
  });
  const holes = openings
    .filter((o) => o.valid && o.hostKind === 'roof' && o.hostId === plane.id && openingFits(o, outline))
    .map(rectHole);
  return { basis: { origin: plane.origin, u, v, w }, outline, holes, thickness, normal: w };
}

export interface SlabExtrusion {
  polygon: V2[];
  /** Cota da face inferior (a laje é extrudada para baixo a partir de topZ). */
  zBottom: number;
  depth: number;
}

export function slabExtrusion(slab: Pick<SlabModel, 'polygon' | 'topZ' | 'thickness'>): SlabExtrusion {
  return { polygon: slab.polygon as V2[], zBottom: slab.topZ - slab.thickness, depth: slab.thickness };
}

function distPointSegment(p: V2, a: V2, b: V2): number {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const l2 = abx * abx + aby * aby;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / l2));
  return Math.hypot(p[0] - (a[0] + t * abx), p[1] - (a[1] + t * aby));
}

/**
 * Bordas livres de uma laje (as que não encostam em parede): candidatas a guarda-corpo.
 * Uma borda é apoiada se pontos ao longo dela (extremos recuados, quartos e meio) estão
 * a menos de `espessura/2 + tol` do eixo de alguma parede que sobe acima da laje.
 */
export function freeSlabEdges(
  slab: Pick<SlabModel, 'polygon' | 'topZ'>,
  walls: Pick<HostWall, 'from' | 'to' | 'baseZ' | 'thickness' | 'outline'>[],
  tol = 0.05,
): [V2, V2][] {
  const poly = slab.polygon as V2[];
  const solid = walls.filter((w) => w.baseZ < slab.topZ + EPS);
  const free: [V2, V2][] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i] as V2;
    const b = poly[(i + 1) % poly.length] as V2;
    const supported = [0.05, 0.25, 0.5, 0.75, 0.95].every((t) => {
      const p: V2 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      return solid.some((w) => distPointSegment(p, w.from, w.to) <= w.thickness / 2 + tol);
    });
    if (!supported) free.push([a, b]);
  }
  return free;
}

export interface GuardrailLayout {
  posts: V2[];
  /** Trecho de corrimão: centro em planta, comprimento e ângulo em z (rad). */
  rail: { center: V2; length: number; angle: number };
}

/** Postes a cada ~`spacing` m (inclui os extremos) e o trecho do corrimão para uma borda livre. */
export function guardrailLayout(a: V2, b: V2, spacing = 1.2): GuardrailLayout {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.ceil(length / spacing));
  const posts: V2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    posts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return {
    posts,
    rail: {
      center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
      length,
      angle: Math.atan2(b[1] - a[1], b[0] - a[0]),
    },
  };
}

export type ViewPreset = '3d' | 'top' | 'front' | 'side';

/** Direção (unitária, na cena y-up) da câmera a partir do centro, para cada vista pré-definida. */
export function viewDirection(view: ViewPreset): Vec3 {
  switch (view) {
    case 'top':
      return [0, 1, 0.0001];
    case 'front': // lado y mínimo do motor = +z na cena
      return norm([0, 0.08, 1]);
    case 'side':
      return norm([1, 0.08, 0]);
    default:
      return norm([0.95, 0.7, 1.15]);
  }
}

/**
 * Cota z do plano da água (face inferior da placa de telhado) no ponto (x, y) em planta, ou `Infinity` se
 * nenhuma água cobre o ponto. Usado para limitar a altura do guarda-corpo sob o telhado.
 */
export function roofZAt(planes: Pick<RoofPlane, 'vertices' | 'origin' | 'uAxis' | 'vAxis'>[], x: number, y: number): number {
  for (const p of planes) {
    const poly = p.vertices.map((v): V2 => [v[0], v[1]]);
    if (!pointInPolygon([x, y], poly)) continue;
    const n = cross(norm(p.uAxis), norm(p.vAxis));
    if (Math.abs(n[2]) < 1e-6) continue; // água vertical: não define z(x, y)
    return p.origin[2] - (n[0] * (x - p.origin[0]) + n[1] * (y - p.origin[1])) / n[2];
  }
  return Infinity;
}
