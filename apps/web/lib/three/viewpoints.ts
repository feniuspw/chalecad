/**
 * Vistas de câmera prontas, órbita e nomes de arquivo da apresentação (puro, cena y-up, sem three nem DOM).
 */
import { roofBelowAt, type BuildingModel, type Vec3 } from '@chalecad/engine';
import { bboxToThree, toThree, wallBasis } from './convert';

export type ViewpointId = 'front' | 'corner' | 'back' | 'top' | 'interior';

export interface Viewpoint {
  id: ViewpointId;
  label: string;
  /** Posição e alvo da câmera (cena y-up). */
  position: Vec3;
  target: Vec3;
}

export interface Pose {
  position: Vec3;
  target: Vec3;
}

export const VIEWPOINT_LABELS: Record<ViewpointId, string> = {
  front: 'Frente',
  corner: 'Quina',
  back: 'Fundos',
  top: 'De cima',
  interior: 'Interior',
};
export const VIEWPOINT_ORDER: ViewpointId[] = ['front', 'corner', 'back', 'top', 'interior'];
/** As quatro vistas da "Salvar 4 fotos". */
export const PHOTO_VIEWPOINTS: ViewpointId[] = ['front', 'corner', 'back', 'interior'];
export const EYE_HEIGHT = 1.6;
/** Margem de enquadramento: a caixa ocupa no máximo 1/1,15 da tela. */
export const FRAME_MARGIN = 1.15;

export interface ViewpointOptions {
  /** FOV vertical em graus e proporção da tela (padrão 35° e 16:9). */
  fovDeg?: number;
  aspect?: number;
  /** Nível do térreo (o interior parte do maior cômodo dele) e sua cota. */
  groundLevelId?: string;
  groundElevation?: number;
}

type V3 = Vec3;
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Projeta um ponto da cena em coordenadas normalizadas de tela ([-1, 1]); null se está atrás da câmera. */
export function projectPoint(pose: Pose, fovDeg: number, aspect: number, p: V3): [number, number] | null {
  const f = unit(sub(pose.target, pose.position));
  const r = unit(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const d = sub(p, pose.position);
  const depth = dot(d, f);
  if (depth < 0.1) return null;
  const t = Math.tan((fovDeg * Math.PI) / 360);
  return [dot(d, r) / (depth * t * aspect), dot(d, u) / (depth * t)];
}

function corners(min: V3, max: V3): V3[] {
  const out: V3[] = [];
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) out.push([x, y, z]);
  return out;
}

/** A caixa inteira cabe na tela, com a margem pedida? */
export function boxFits(pose: Pose, fovDeg: number, aspect: number, min: V3, max: V3, margin = FRAME_MARGIN): boolean {
  return corners(min, max).every((c) => {
    const s = projectPoint(pose, fovDeg, aspect, c);
    return !!s && Math.abs(s[0]) <= 1 / margin && Math.abs(s[1]) <= 1 / margin;
  });
}

/** Menor distância ao longo de `dir` a partir de `anchor` em que a caixa cabe (passo de 20 cm, depois refinado). */
function fitAlong(anchor: V3, dir: V3, target: V3, min: V3, max: V3, fovDeg: number, aspect: number): V3 {
  const at = (d: number): Pose => ({ position: add(anchor, mul(dir, d)), target });
  let lo = 0;
  let hi = 2;
  while (!boxFits(at(hi), fovDeg, aspect, min, max) && hi < 2000) {
    lo = hi;
    hi *= 1.5;
  }
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (boxFits(at(mid), fovDeg, aspect, min, max)) hi = mid;
    else lo = mid;
  }
  return at(hi).position;
}

function polygonCentroid(poly: [number, number][]): [number, number] {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i]!;
    const [x1, y1] = poly[(i + 1) % poly.length]!;
    const k = x0 * y1 - x1 * y0;
    a += k;
    cx += (x0 + x1) * k;
    cy += (y0 + y1) * k;
  }
  if (Math.abs(a) < 1e-9) {
    const n = poly.length || 1;
    return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

function inside(p: [number, number], poly: [number, number][]): boolean {
  let r = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) r = !r;
  }
  return r;
}

function segDist(p: [number, number], a: [number, number], b: [number, number]): number {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const l2 = abx * abx + aby * aby;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / l2));
  return Math.hypot(p[0] - (a[0] + t * abx), p[1] - (a[1] + t * aby));
}

/** Ponto dentro do polígono: o centroide, ou o ponto mais afastado das paredes se o centroide cair fora. */
function interiorPoint(poly: [number, number][]): [number, number] {
  const c = polygonCentroid(poly);
  if (inside(c, poly)) return c;
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  let best: [number, number] = poly[0]!;
  let bestD = -1;
  for (let i = 0; i <= 20; i++) {
    for (let j = 0; j <= 20; j++) {
      const p: [number, number] = [Math.min(...xs) + ((Math.max(...xs) - Math.min(...xs)) * i) / 20, Math.min(...ys) + ((Math.max(...ys) - Math.min(...ys)) * j) / 20];
      if (!inside(p, poly)) continue;
      const d = Math.min(...poly.map((q, k) => segDist(p, q, poly[(k + 1) % poly.length]!)));
      if (d > bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  return best;
}

const segCross = (a: [number, number], b: [number, number], c: [number, number], d: [number, number]): boolean => {
  const o = (p: [number, number], q: [number, number], r: [number, number]) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
};

/**
 * Ponto do cômodo para a foto interna: o mais longe possível do vidro (enquadra o ambiente todo), com 0,9 m das
 * paredes, pé-direito para o olho, fora da escada e dos móveis e com visão livre até o vidro (nenhuma parede
 * interna no caminho). Sem vidro, o mais afastado da frente. Null se nenhum ponto servir.
 */
function photographerSpot(model: BuildingModel, poly: [number, number][], level: string, floor: number, glass: V3 | null): [number, number] | null {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const blockers = [...(model.stairs ?? []).map((s) => s.footprint), ...(model.furniture ?? []).filter((f) => f.level === level).map((f) => f.polygon)] as [number, number][][];
  const walls = model.walls.filter((w) => w.level === level && w.kind === 'interior');
  const target: [number, number] = glass ? [glass[0], glass[1]] : [(x0 + x1) / 2, y0 - 5];
  let best: [number, number] | null = null;
  let bestD = -1;
  const N = 24;
  for (let i = 0; i <= N; i++)
    for (let j = 0; j <= N; j++) {
      const p: [number, number] = [x0 + ((x1 - x0) * i) / N, y0 + ((y1 - y0) * j) / N];
      if (!inside(p, poly)) continue;
      if (Math.min(...poly.map((q, k) => segDist(p, q, poly[(k + 1) % poly.length]!))) < 0.9) continue;
      const roof = roofBelowAt(model.roofPlanes ?? [], p);
      if (roof !== null && roof - floor < EYE_HEIGHT + 0.8) continue;
      if (blockers.some((b) => b.length >= 3 && (inside(p, b) || Math.min(...b.map((q, k) => segDist(p, q, b[(k + 1) % b.length]!))) < 0.35))) continue;
      if (walls.some((w) => segCross(p, target, [w.from[0], w.from[1]], [w.to[0], w.to[1]]))) continue;
      const d = Math.hypot(p[0] - target[0], p[1] - target[1]);
      if (d > bestD) {
        bestD = d;
        best = p;
      }
    }
  return best;
}

/** Cômodo do térreo com maior área e polígono. */
export function largestGroundRoom(model: BuildingModel, groundLevelId?: string) {
  const withPoly = model.rooms.filter((r) => r.polygon && r.polygon.length >= 3);
  const ground = groundLevelId ? withPoly.filter((r) => r.level === groundLevelId) : withPoly;
  const pool = ground.length > 0 ? ground : withPoly;
  return pool.reduce<(typeof pool)[number] | null>((b, r) => (!b || r.area > b.area ? r : b), null);
}

/** Centro (motor z-up) da maior abertura envidraçada (janela ou porta de correr), preferindo as do cômodo. */
function glassCenter(model: BuildingModel, preferIds: string[]): V3 | null {
  const glass = model.openings.filter((o) => o.valid && o.hostKind === 'wall' && (o.type === 'window' || o.type === 'sliding_door'));
  const area = (o: (typeof glass)[number]) => (o.u1 - o.u0) * (o.v1 - o.v0);
  const pick = (list: typeof glass) => list.reduce<(typeof glass)[number] | null>((b, o) => (!b || area(o) > area(b) ? o : b), null);
  const op = pick(glass.filter((o) => preferIds.includes(o.id))) ?? pick(glass);
  if (!op) return null;
  const wall = model.walls.find((w) => w.id === op.hostId);
  if (!wall) return null;
  const b = wallBasis(wall);
  const uu = (op.u0 + op.u1) / 2;
  const vv = (op.v0 + op.v1) / 2;
  return [b.origin[0] + b.u[0] * uu, b.origin[1] + b.u[1] * uu, b.origin[2] + vv];
}

/** As cinco vistas prontas, enquadradas pelo bbox e pela FOV. */
export function autoViewpoints(model: BuildingModel, opts: ViewpointOptions = {}): Viewpoint[] {
  const fov = opts.fovDeg ?? 35;
  const aspect = opts.aspect ?? 16 / 9;
  const b = bboxToThree(model.bbox);
  const [cx, , cz] = b.center;
  const midY = Math.max(b.min[1] + b.size[1] * 0.4, 0.8);
  const aim: V3 = [cx, midY, cz];

  // frente: lado y mínimo do motor = +z na cena, olho a 1,6 m
  const frontTarget: V3 = [cx, Math.max(EYE_HEIGHT, midY), cz];
  const front = fitAlong([cx, EYE_HEIGHT, cz], [0, 0, 1], frontTarget, b.min, b.max, fov, aspect);
  const corner = fitAlong(aim, unit([0.75, 0.45, 0.85]), aim, b.min, b.max, fov, aspect);
  const back = fitAlong(aim, unit([-0.75, 0.35, -0.85]), aim, b.min, b.max, fov, aspect);
  const top = fitAlong(aim, unit([0.6, 1, 0.8]), aim, b.min, b.max, fov, aspect);

  const out: Viewpoint[] = [
    { id: 'front', label: VIEWPOINT_LABELS.front, position: front, target: frontTarget },
    { id: 'corner', label: VIEWPOINT_LABELS.corner, position: corner, target: aim },
    { id: 'back', label: VIEWPOINT_LABELS.back, position: back, target: aim },
    { id: 'top', label: VIEWPOINT_LABELS.top, position: top, target: aim },
  ];

  // interior: como um fotógrafo, do fundo do maior cômodo do térreo olhando para o vidro (ou para a fachada da frente)
  const room = largestGroundRoom(model, opts.groundLevelId);
  const floor = opts.groundElevation ?? 0;
  const glass = glassCenter(model, room?.openingIds ?? []);
  const poly = room?.polygon as [number, number][] | undefined;
  const fallback: [number, number] = poly ? interiorPoint(poly) : [(model.bbox.min[0] + model.bbox.max[0]) / 2, (model.bbox.min[1] + model.bbox.max[1]) / 2];
  const [px, py] = poly && room ? (photographerSpot(model, poly, room.level, floor, glass) ?? fallback) : fallback;
  const eye: V3 = [px, py, floor + EYE_HEIGHT];
  const look: V3 = glass ?? [px, model.bbox.min[1] - 5, floor + EYE_HEIGHT];
  const eye3 = toThree(eye);
  const look3 = toThree(look);
  // evita olhar para o chão/teto demais e coincidir com o olho
  if (Math.hypot(look3[0] - eye3[0], look3[2] - eye3[2]) < 0.3) look3[2] = eye3[2] + 1;
  out.push({ id: 'interior', label: VIEWPOINT_LABELS.interior, position: eye3, target: [look3[0], eye3[1] + (look3[1] - eye3[1]) * 0.3, look3[2]] });
  return out;
}

// ---------------------------------------------------------------------------
// Transição, órbita e timelapse
// ---------------------------------------------------------------------------

/** Aceleração e frenagem suaves (smootherstep): 0 em 0 e 1 em 1, derivada nula nas pontas. */
export function easeInOut(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

export const ORBIT_SECONDS = 12;
export const TIMELAPSE_SECONDS = 10;
export const TRANSITION_SECONDS = 0.8;

/** Interpola duas poses (posição linear, alvo linear) com easing. */
export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const k = easeInOut(t);
  const l = (p: V3, q: V3): V3 => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k];
  return { position: l(a.position, b.position), target: l(a.target, b.target) };
}

/**
 * Câmera da volta de 360° no instante `t` (s): gira em torno do eixo vertical que passa pelo alvo da Quina,
 * na altura e distância dela, começando e terminando na Quina, com easing no ângulo.
 */
export function orbitPose(corner: Pose, t: number, duration = ORBIT_SECONDS): Pose {
  const angle = easeInOut(t / duration) * Math.PI * 2;
  const dx = corner.position[0] - corner.target[0];
  const dz = corner.position[2] - corner.target[2];
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    position: [corner.target[0] + dx * c - dz * s, corner.position[1], corner.target[2] + dx * s + dz * c],
    target: corner.target,
  };
}

/** Hora do dia (minutos) do timelapse: do nascer ao pôr em `duration` s, linear. */
export function timelapseMinutes(sunrise: number, sunset: number, t: number, duration = TIMELAPSE_SECONDS): number {
  return sunrise + (sunset - sunrise) * Math.min(1, Math.max(0, t / duration));
}

// ---------------------------------------------------------------------------
// Nomes de arquivo
// ---------------------------------------------------------------------------

export function slugify(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'chale'
  );
}

const p2 = (n: number) => String(n).padStart(2, '0');
export const dateStamp = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

/** `projeto-quina-AAAA-MM-DD.png` */
export function photoFileName(projectName: string, viewLabel: string, now: Date): string {
  return `${slugify(projectName)}-${slugify(viewLabel)}-${dateStamp(now)}.png`;
}
export const photosZipName = (projectName: string, now: Date) => `${slugify(projectName)}-fotos-${dateStamp(now)}.zip`;
export const videoFileName = (projectName: string, kind: 'orbit' | 'timelapse' = 'orbit') => `${slugify(projectName)}-${kind === 'orbit' ? '360' : 'timelapse'}.webm`;

// ---------------------------------------------------------------------------
// Vistas salvas (localStorage por projeto)
// ---------------------------------------------------------------------------

export interface SavedView {
  id: string;
  name: string;
  position: Vec3;
  target: Vec3;
}

export const savedViewsKey = (projectId: string) => `chalecad:views:${projectId}`;

export function parseSavedViews(raw: string | null): SavedView[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const isV3 = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
    return data.filter((v): v is SavedView => !!v && typeof v.id === 'string' && typeof v.name === 'string' && isV3(v.position) && isV3(v.target));
  } catch {
    return [];
  }
}

export function loadSavedViews(projectId: string): SavedView[] {
  try {
    return parseSavedViews(globalThis.localStorage?.getItem(savedViewsKey(projectId)) ?? null);
  } catch {
    return [];
  }
}

export function storeSavedViews(projectId: string, views: SavedView[]): boolean {
  try {
    globalThis.localStorage?.setItem(savedViewsKey(projectId), JSON.stringify(views));
    return true;
  } catch {
    return false;
  }
}
