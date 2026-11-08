/**
 * Primeira pessoa (andar por dentro): colisão e ponto de partida. Puro, em planta (referencial do motor, x/y em m).
 * As paredes viram retângulos (comprimento x espessura); portas abrem passagem; o jogador é um círculo.
 */
import type { BuildingModel, HostWall, ResolvedOpening } from '@chalecad/engine';

export type V2 = [number, number];

export const WALK = {
  eyeHeight: 1.6,
  radius: 0.25,
  speed: 1.4,
  runFactor: 2.2,
  /** Passo máximo por subetapa de colisão (evita atravessar parede fina em quadros longos). */
  maxStep: 0.1,
  /** Soleira máxima para a abertura ser passagem. */
  doorSill: 0.3,
} as const;

/** Retângulo de parede: eixo from→to, com `half` = metade da espessura. */
export interface WallRect {
  from: V2;
  to: V2;
  half: number;
}

const isPassage = (o: ResolvedOpening) => o.valid && o.hostKind === 'wall' && (o.type === 'door' || o.type === 'sliding_door') && o.v0 <= WALK.doorSill;

/**
 * Retângulos de colisão das paredes do nível, com as portas recortadas (a parede é dividida nos vãos).
 * Paredes sem comprimento são ignoradas.
 */
export function buildWalkWalls(walls: HostWall[], openings: ResolvedOpening[], levelId?: string): WallRect[] {
  const out: WallRect[] = [];
  for (const w of walls) {
    if (levelId && w.level !== levelId) continue;
    const dx = w.to[0] - w.from[0];
    const dy = w.to[1] - w.from[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const ux = dx / len;
    const uy = dy / len;
    const gaps = openings
      .filter((o) => o.hostId === w.id && isPassage(o))
      .map((o) => [Math.max(0, o.u0), Math.min(len, o.u1)] as const)
      .filter(([a, b]) => b > a)
      .sort((a, b) => a[0] - b[0]);
    const half = w.thickness / 2;
    let cursor = 0;
    const push = (a: number, b: number) => {
      if (b - a < 1e-3) return;
      out.push({ from: [w.from[0] + ux * a, w.from[1] + uy * a], to: [w.from[0] + ux * b, w.from[1] + uy * b], half });
    };
    for (const [a, b] of gaps) {
      push(cursor, a);
      cursor = Math.max(cursor, b);
    }
    push(cursor, len);
  }
  return out;
}

/** Empurra `p` para fora de um retângulo de parede; devolve o ponto corrigido (ou o mesmo se livre). */
function pushOut(p: V2, r: WallRect, radius: number): V2 {
  const dx = r.to[0] - r.from[0];
  const dy = r.to[1] - r.from[1];
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  // coordenadas locais: u ao longo, w à esquerda
  const px = p[0] - r.from[0];
  const py = p[1] - r.from[1];
  const u = px * ux + py * uy;
  const w = -px * uy + py * ux;
  const cu = Math.min(len, Math.max(0, u));
  const cw = Math.min(r.half, Math.max(-r.half, w));
  const nu = u - cu;
  const nw = w - cw;
  const d = Math.hypot(nu, nw);
  if (d >= radius) return p;
  if (d < 1e-9) {
    // centro dentro do retângulo: sai pelo lado mais próximo
    const side = w >= 0 ? 1 : -1;
    const dw = side * (r.half + radius) - w;
    return [p[0] - uy * dw, p[1] + ux * dw];
  }
  const k = (radius - d) / d;
  const du = nu * k;
  const dw = nw * k;
  // volta de (u, w) local para planta
  return [p[0] + du * ux - dw * uy, p[1] + du * uy + dw * ux];
}

/**
 * Move o jogador de `pos` por `delta` sem atravessar paredes: em subetapas curtas, empurra o círculo para fora
 * dos retângulos (o que também faz deslizar ao longo da parede).
 */
export function moveWithCollision(pos: V2, delta: V2, walls: WallRect[], radius: number = WALK.radius): V2 {
  const dist = Math.hypot(delta[0], delta[1]);
  if (dist < 1e-9) return pos;
  const steps = Math.max(1, Math.ceil(dist / WALK.maxStep));
  let p: V2 = [pos[0], pos[1]];
  for (let s = 0; s < steps; s++) {
    p = [p[0] + delta[0] / steps, p[1] + delta[1] / steps];
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const w of walls) {
        const q = pushOut(p, w, radius);
        if (q !== p) {
          p = q;
          moved = true;
        }
      }
      if (!moved) break;
    }
  }
  return p;
}

/** Ponto dentro do polígono (regra par-ímpar). */
export function insidePolygon(p: V2, poly: V2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export interface WalkStart {
  pos: V2;
  /** Direção do olhar em planta (unitária). */
  heading: V2;
  fromDoor: boolean;
}

/** Começa na primeira porta de `ext-front`, 1 m para dentro, olhando para dentro; senão no centro da edificação. */
export function walkStart(model: Pick<BuildingModel, 'walls' | 'openings' | 'footprint' | 'bbox'>): WalkStart {
  const door = model.openings.find((o) => o.hostId === 'ext-front' && o.valid && (o.type === 'door' || o.type === 'sliding_door'));
  const wall = door ? model.walls.find((w) => w.id === 'ext-front') : undefined;
  if (door && wall) {
    const dx = wall.to[0] - wall.from[0];
    const dy = wall.to[1] - wall.from[1];
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const u = (door.u0 + door.u1) / 2;
    const base: V2 = [wall.from[0] + ux * u, wall.from[1] + uy * u];
    const candidates: V2[] = [
      [uy, -ux],
      [-uy, ux],
    ];
    const inward =
      candidates.find((n) => insidePolygon([base[0] + n[0], base[1] + n[1]], model.footprint)) ??
      candidates.find((n) => n === candidates[wall.exteriorSide === 'left' ? 0 : 1]) ??
      candidates[0]!;
    return { pos: [base[0] + inward[0], base[1] + inward[1]], heading: inward, fromDoor: true };
  }
  const { min, max } = model.bbox;
  return { pos: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2], heading: [0, 1], fromDoor: false };
}

/** Cota do piso do nível: base das paredes do nível (ou a elevação dele). */
export function levelFloorZ(walls: HostWall[], levelId: string, elevation: number): number {
  const zs = walls.filter((w) => w.level === levelId).map((w) => w.baseZ);
  return zs.length ? Math.min(...zs) : elevation;
}

/** Ângulo de giro (em torno de y, câmera olhando para -z em 0) para olhar na direção `heading` em planta. */
export function yawFromHeading(heading: V2): number {
  return Math.atan2(-heading[0], heading[1]);
}

/** Centroide (pela área) de um polígono simples; média dos vértices se a área é nula. */
export function polygonCentroid(poly: V2[]): V2 {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const p = poly[j]!, q = poly[i]!;
    const f = p[0] * q[1] - q[0] * p[1];
    a += f;
    cx += (p[0] + q[0]) * f;
    cy += (p[1] + q[1]) * f;
  }
  if (Math.abs(a) < 1e-9) {
    const n = poly.length || 1;
    return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
}
