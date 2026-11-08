/**
 * Paisagem do modo Apresentação (funções puras): relevo do chão longe da casa, caminho da porta, anel de morros
 * e exposição pela hora. Coordenadas da cena (y para cima) em `groundHeight` e nos buffers; as de planta
 * (`entryPath`, `houseRect`) são do motor ([x, y], z para cima). Sem three nem DOM.
 */
import type { BuildingModel } from '@chalecad/engine';
import { expandRect, SCENARIOS, type Rect, type ScenarioId } from './foliage';
import { hashStr, pfbm, vnoise } from './pbr';

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1e-9)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Raio do chão (m) e do anel de morros. */
export const GROUND_R = 760;
export const HILLS_NEAR_R = 470;
export const HILLS_FAR_R = 640;

/** Direção (rad, planta da cena: atan2(z, x)) em que fica o mar na praia: ao fundo da vista padrão. */
export const SEA_ANGLE = -2.35;
/** Nível do mar abaixo do chão da casa (m). */
export const SEA_DEPTH = 2.2;

// ---------------------------------------------------------------------------
// Casa e caminho (planta do motor)
// ---------------------------------------------------------------------------

/** Retângulo da casa e dos extras (deck, muros) em planta. */
export function houseRect(model: Pick<BuildingModel, 'bbox' | 'extras'>): Rect {
  const r: Rect = { minX: model.bbox.min[0], minY: model.bbox.min[1], maxX: model.bbox.max[0], maxY: model.bbox.max[1] };
  const add = (p: readonly [number, number]) => {
    r.minX = Math.min(r.minX, p[0]);
    r.maxX = Math.max(r.maxX, p[0]);
    r.minY = Math.min(r.minY, p[1]);
    r.maxY = Math.max(r.maxY, p[1]);
  };
  for (const e of model.extras) {
    for (const p of e.polygon ?? []) add(p);
    for (const s of e.segments) {
      add(s.from);
      add(s.to);
    }
    for (const p of e.posts) add(p.position);
  }
  return r;
}

/** Folga em volta da casa: bbox + 4 m. */
export const CLEARANCE = 4;
export const clearRect = (model: Pick<BuildingModel, 'bbox' | 'extras'>): Rect => expandRect(houseRect(model), CLEARANCE);

/**
 * Caminho da porta de entrada até além da folga: parte da porta de `ext-front` (ou da primeira porta de parede
 * externa) para fora, reto nos primeiros metros e depois com uma curva suave. Polilinha em planta (motor);
 * null se não houver porta externa.
 */
export function entryPath(model: Pick<BuildingModel, 'walls' | 'openings' | 'bbox' | 'extras'>): [number, number][] | null {
  const doors = model.openings.filter((o) => o.valid && o.type === 'door' && o.hostKind === 'wall');
  const isExt = (id: string) => model.walls.find((w) => w.id === id)?.exteriorSide != null;
  const door = doors.find((d) => d.hostId === 'ext-front') ?? doors.find((d) => isExt(d.hostId));
  if (!door) return null;
  const wall = model.walls.find((w) => w.id === door.hostId);
  if (!wall || !wall.exteriorSide) return null;
  const dx = wall.to[0] - wall.from[0], dy = wall.to[1] - wall.from[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  // esquerda de from→to = (-uy, ux)
  const side = wall.exteriorSide === 'left' ? 1 : -1;
  const nx = -uy * side, ny = ux * side;
  const uc = (door.u0 + door.u1) / 2;
  const start: [number, number] = [wall.from[0] + ux * uc + nx * (wall.thickness / 2), wall.from[1] + uy * uc + ny * (wall.thickness / 2)];
  const clear = clearRect(model);
  // distância até sair da folga seguindo a normal
  let exit = 0;
  while (exit < 60 && start[0] + nx * exit >= clear.minX && start[0] + nx * exit <= clear.maxX && start[1] + ny * exit >= clear.minY && start[1] + ny * exit <= clear.maxY) exit += 0.5;
  const total = exit + 16;
  const pts: [number, number][] = [];
  for (let s = 0; s <= total + 1e-6; s += 1) {
    const t = Math.max(0, s - 3);
    const lat = 1.3 * Math.sin(t * 0.23) * (1 - Math.exp(-t / 5));
    pts.push([start[0] + nx * s - ny * lat, start[1] + ny * s + nx * lat]);
  }
  return pts;
}

// ---------------------------------------------------------------------------
// Relevo
// ---------------------------------------------------------------------------

export interface TerrainShape {
  scenario: ScenarioId;
  /** Raio (m) em que o chão ainda é plano em volta do centro da casa. */
  flatRadius: number;
  seed: number;
}

/** Altura do chão (m, relativa ao piso da casa) em (x, z) da cena, centrada na casa. Plano até `flatRadius`. */
export function groundHeight(x: number, z: number, t: TerrainShape): number {
  const sc = SCENARIOS[t.scenario];
  if (sc.relief <= 0) return 0;
  const r = Math.hypot(x, z);
  const ramp = smooth(t.flatRadius, t.flatRadius + 90, r);
  if (ramp <= 0 && !sc.sea) return 0;
  const n1 = vnoise(x / 95 + 100, z / 95 + 100, t.seed) * 2 - 1;
  const n2 = vnoise(x / 38 + 300, z / 38 + 300, t.seed + 5) * 2 - 1;
  let h = sc.relief * ramp * (0.8 * n1 + 0.2 * n2 + 0.25) * (0.5 + 0.5 * smooth(t.flatRadius, 420, r));
  if (sc.sea) {
    const ang = Math.atan2(z, x);
    const sector = smooth(0.15, 0.75, Math.cos(ang - SEA_ANGLE));
    h -= (SEA_DEPTH + 14) * smooth(55, 150, r) * sector;
  }
  return h;
}

export interface GroundBuffers {
  positions: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
}

/**
 * Chão em malha polar (anéis que se afastam em progressão), plano até `flatRadius` e ondulado depois.
 * UVs em metros. Cores por vértice: duas escalas de manchas (30 a 90 m e 6 a 15 m) quebram a repetição da textura.
 */
export function buildGroundBuffers(t: TerrainShape, patchA: [number, number, number], patchB: [number, number, number], radius = GROUND_R, rings = 44, segs = 128): GroundBuffers {
  const verts = 1 + rings * segs;
  const positions = new Float32Array(verts * 3);
  const uvs = new Float32Array(verts * 2);
  const colors = new Float32Array(verts * 3);
  const put = (i: number, x: number, z: number) => {
    positions[i * 3] = x;
    positions[i * 3 + 1] = groundHeight(x, z, t);
    positions[i * 3 + 2] = z;
    uvs[i * 2] = x;
    uvs[i * 2 + 1] = z;
    const macro = vnoise(x / 70 + 40, z / 70 + 40, t.seed + 11);
    const meso = vnoise(x / 11 + 90, z / 11 + 90, t.seed + 13);
    const k = Math.min(1, Math.max(0, macro * 1.25 - 0.1));
    const b = 0.86 + 0.28 * meso;
    colors[i * 3] = mix(patchA[0], patchB[0], k) * b;
    colors[i * 3 + 1] = mix(patchA[1], patchB[1], k) * b;
    colors[i * 3 + 2] = mix(patchA[2], patchB[2], k) * b;
  };
  put(0, 0, 0);
  for (let k = 1; k <= rings; k++) {
    const r = radius * Math.pow(k / rings, 1.8);
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      put(1 + (k - 1) * segs + s, Math.cos(a) * r, Math.sin(a) * r);
    }
  }
  const indices = new Uint32Array((segs + (rings - 1) * segs * 2) * 3);
  let n = 0;
  for (let s = 0; s < segs; s++) {
    const a = 1 + s, b = 1 + ((s + 1) % segs);
    indices[n++] = 0;
    indices[n++] = b;
    indices[n++] = a;
  }
  for (let k = 1; k < rings; k++) {
    for (let s = 0; s < segs; s++) {
      const a = 1 + (k - 1) * segs + s, b = 1 + (k - 1) * segs + ((s + 1) % segs);
      const c = 1 + k * segs + s, d = 1 + k * segs + ((s + 1) % segs);
      indices[n++] = a;
      indices[n++] = b;
      indices[n++] = c;
      indices[n++] = b;
      indices[n++] = d;
      indices[n++] = c;
    }
  }
  return { positions, uvs, colors, indices };
}

// ---------------------------------------------------------------------------
// Caminho (faixa de pedriscos)
// ---------------------------------------------------------------------------

export interface StripBuffers {
  positions: Float32Array;
  uvs: Float32Array;
  /** RGBA: o alfa suaviza as bordas e a ponta do caminho. */
  colors: Float32Array;
  indices: Uint16Array;
}

/**
 * Faixa de `width` m seguindo a polilinha (planta do motor), na cena y = `y`. UVs em metros (u pela largura,
 * v pelo comprimento). Alfa 0 nas bordas e na ponta, para o caminho se misturar à grama.
 */
export function buildPathStrip(line: readonly (readonly [number, number])[], width: number, y: number): StripBuffers {
  const n = line.length;
  const positions = new Float32Array(n * 3 * 3);
  const uvs = new Float32Array(n * 3 * 2);
  const colors = new Float32Array(n * 3 * 4);
  const indices = new Uint16Array((n - 1) * 4 * 3);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const p = line[i]!;
    const a = line[Math.max(0, i - 1)]!, b = line[Math.min(n - 1, i + 1)]!;
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    if (i > 0) acc += Math.hypot(p[0] - line[i - 1]![0], p[1] - line[i - 1]![1]);
    // normal em planta: (-ty, tx); cena: x = x, z = -y
    const ox = -ty, oy = tx;
    const fade = 1 - smooth(n - 9, n - 1, i); // some nos últimos metros
    const cols: [number, number][] = [
      [-1, 0.05],
      [0, 1],
      [1, 0.05],
    ];
    cols.forEach(([side, alpha], j) => {
      const k = i * 3 + j;
      const w = (side * width) / 2;
      positions[k * 3] = p[0] + ox * w;
      positions[k * 3 + 1] = y;
      positions[k * 3 + 2] = -(p[1] + oy * w);
      uvs[k * 2] = (side * width) / 2 + width / 2;
      uvs[k * 2 + 1] = acc;
      colors[k * 4] = colors[k * 4 + 1] = colors[k * 4 + 2] = 1;
      colors[k * 4 + 3] = alpha * fade; // bordas quase transparentes
    });
  }
  let m = 0;
  for (let i = 0; i < n - 1; i++) {
    const a = i * 3, b = (i + 1) * 3;
    for (const [p, q, r] of [
      [a, b, a + 1],
      [b, b + 1, a + 1],
      [a + 1, b + 1, a + 2],
      [b + 1, b + 2, a + 2],
    ] as const) {
      indices[m++] = p;
      indices[m++] = q;
      indices[m++] = r;
    }
  }
  return { positions, uvs, colors, indices };
}

// ---------------------------------------------------------------------------
// Morros do horizonte
// ---------------------------------------------------------------------------

export interface HillsBuffers {
  positions: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
}

/**
 * Anel de morros em silhueta (parede com topo irregular, periódico no ângulo, duas camadas).
 * `heightRange` em metros; cor de baixo mais escura que a do topo; cores em RGB 0 a 1.
 */
export function buildHillsRing(radius: number, heightRange: [number, number], seed: number, top: [number, number, number], bottom: [number, number, number], seaMask = false, segs = 192): HillsBuffers {
  const positions = new Float32Array(segs * 2 * 3);
  const colors = new Float32Array(segs * 2 * 3);
  const indices = new Uint32Array(segs * 6);
  for (let s = 0; s < segs; s++) {
    const a = (s / segs) * Math.PI * 2;
    const u = s / segs;
    // ruído periódico no ângulo: cristas largas + serrilhado fino
    const big = pfbm(u, 0.37, 5, 3, seed);
    const fine = pfbm(u, 0.81, 24, 2, seed + 3);
    let hgt = mix(heightRange[0], heightRange[1], Math.min(1, Math.max(0, big * 1.3 - 0.15))) * (0.85 + 0.3 * fine);
    if (seaMask) hgt *= 1 - smooth(0.15, 0.75, Math.cos(a - SEA_ANGLE));
    const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
    const t = 2 * s;
    positions.set([x, hgt, z], t * 3);
    positions.set([x, -40, z], (t + 1) * 3);
    const shade = 0.85 + 0.3 * fine;
    colors.set([top[0] * shade, top[1] * shade, top[2] * shade], t * 3);
    colors.set(bottom, (t + 1) * 3);
    const n = (s + 1) % segs;
    const a0 = 2 * s, a1 = 2 * s + 1, b0 = 2 * n, b1 = 2 * n + 1;
    const o = s * 6;
    indices.set([a0, a1, b0, b0, a1, b1], o);
  }
  return { positions, colors, indices };
}

// ---------------------------------------------------------------------------
// Luz
// ---------------------------------------------------------------------------

/**
 * Exposição automática simples pela elevação do sol: menos ao meio-dia, mais ao entardecer e ao amanhecer
 * (a cena fica mais escura quando o sol está baixo, e o olho compensa). À noite, um pouco acima do dia.
 */
export function autoExposure(elevationDeg: number, lamps = false): number {
  const e = Math.max(-12, Math.min(75, elevationDeg));
  // meio-dia 0,86 -> sol a 30 graus 1,0 -> horizonte 1,28 -> noite 1,2 (e 1,05 com luzes acesas)
  let x: number;
  if (e >= 30) x = mix(1.0, 0.86, smooth(30, 70, e));
  else if (e >= 0) x = mix(1.28, 1.0, smooth(0, 30, e));
  else x = mix(1.28, 1.2, smooth(0, -12, e));
  if (lamps && e < 6) x *= 0.9;
  return x;
}

/** Semente numérica estável por projeto e cenário. */
export function terrainSeed(name: string, scenario: ScenarioId): number {
  return hashStr(`${name}|${scenario}`) & 0xffff;
}
