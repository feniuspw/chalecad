/**
 * PBR procedural: a função pura `renderPattern` descreve o padrão de um material (cor, altura e rugosidade por pixel)
 * sem DOM nem three; `normalFromHeight` deriva o mapa de normais do mapa de altura por diferenças finitas (Sobel).
 * `textures.ts` só embrulha os buffers em `CanvasTexture`. Tudo determinístico (mesma semente, mesma imagem) e
 * sem costura: os ruídos de grande escala são periódicos no tile.
 *
 * Alturas em metros (juntas e relevos reais, de milímetros); `pxPerM` converte pixels em metros.
 */
import { describeTexture, type TextureSpec } from './textures';

/** Resolução por qualidade: Alta 1024 px por tile (maior lado), Leve 256 px, Editor (modo Acabado) 512 px. */
export type PbrTier = 'high' | 'edit' | 'light';
export const TIER_PX: Record<PbrTier, number> = { high: 1024, edit: 512, light: 256 };

// ---------------------------------------------------------------------------
// Padrões que não são acabamentos de cômodo
// ---------------------------------------------------------------------------

const EXTRA: Record<string, TextureSpec> = {
  // telha sanduíche: cinza neutro (a cor da telha vem do `color` do material); frisos a cada 25 cm ao longo de u
  roof_sandwich: { id: 'roof_sandwich', kind: 'ribs', color: '#ffffff', joint: '#7a7a7a', module: [0.25, 1], jointWidth: 0, variation: 0.04, grain: false, tile: [1, 1] },
  // régua de deck de 14 cm com vão de 6 mm
  deck_wood: { id: 'deck_wood', kind: 'planks', color: '#9b6c42', joint: '#2a1a0e', module: [1.2, 0.14], jointWidth: 0.006, variation: 0.16, grain: true, tile: [2.4, 0.56] },
  concrete: { id: 'concrete', kind: 'concrete', color: '#bdb8b0', joint: '#8f8a82', module: [2, 2], jointWidth: 0, variation: 0.06, grain: false, tile: [2, 2] },
  // neutros: multiplicados pela cor do cenário
  grass: { id: 'grass', kind: 'grass', color: '#e4ead6', joint: '#9aa586', module: [2, 2], jointWidth: 0, variation: 0.12, grain: false, tile: [2, 2] },
  gravel: { id: 'gravel', kind: 'gravel', color: '#b8ad9b', joint: '#4d463d', module: [1.5, 1.5], jointWidth: 0, variation: 0.2, grain: false, tile: [1.5, 1.5] },
  sand: { id: 'sand', kind: 'sand', color: '#f0e4c2', joint: '#bfae86', module: [3, 3], jointWidth: 0, variation: 0.06, grain: false, tile: [3, 3] },
};

/** Descrição do padrão de qualquer material PBR (acabamentos e os extras acima); undefined se não houver. */
export function describePbr(id: string | undefined): TextureSpec | undefined {
  return id ? (describeTexture(id) ?? EXTRA[id]) : undefined;
}

/** Rugosidade média por material (0 = espelho, 1 = fosco). Porcelanato liso, madeira média, tijolo áspero. */
const ROUGHNESS: Record<string, number> = {
  finish_floor_porcelain: 0.22,
  finish_floor_ceramic: 0.3,
  finish_wall_tile: 0.26,
  finish_floor_wood: 0.52,
  finish_floor_vinyl: 0.42,
  finish_floor_laminate: 0.4,
  finish_wall_wood: 0.62,
  finish_facade_wood: 0.74,
  finish_ceiling_wood: 0.6,
  finish_facade_siding: 0.6,
  finish_facade_brick: 0.93,
  finish_wall_paint: 0.88,
  finish_ceiling_paint: 0.9,
  finish_facade_texture: 0.96,
  roof_sandwich: 0.42,
  deck_wood: 0.72,
  concrete: 0.9,
  grass: 1,
  gravel: 0.96,
  sand: 1,
};

export function materialRoughness(id: string): number {
  return ROUGHNESS[id] ?? 0.85;
}

/** Metalicidade do material (só a telha sanduíche é metálica). */
export function materialMetalness(id: string): number {
  return id === 'roof_sandwich' ? 0.5 : 0;
}

/** Quantas vezes a imagem repete por metro (u, v): as UVs da cena estão em metros. */
export function pbrRepeat(spec: TextureSpec): [number, number] {
  return [1 / spec.tile[0], 1 / spec.tile[1]];
}

/** Tamanho em pixels da imagem para a resolução (o maior lado do tile ganha `TIER_PX[tier]`). */
export function pbrPixels(spec: TextureSpec, tier: PbrTier): [number, number] {
  const k = TIER_PX[tier] / Math.max(spec.tile[0], spec.tile[1]);
  return [Math.max(8, Math.round(spec.tile[0] * k)), Math.max(8, Math.round(spec.tile[1] * k))];
}

// ---------------------------------------------------------------------------
// Ruído
// ---------------------------------------------------------------------------

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Hash inteiro de (x, y, semente) em [0, 1). */
export function hash2(x: number, y: number, s: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul((s | 0) + 0x9e3779b9, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * (3 - 2 * t);
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1e-9)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Ruído de valor em [0, 1], opcionalmente periódico (`cx`, `cy` células por período). */
export function vnoise(x: number, y: number, s: number, cx = 0, cy = 0): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = fade(x - ix);
  const fy = fade(y - iy);
  const wx = (i: number) => (cx > 0 ? ((i % cx) + cx) % cx : i);
  const wy = (i: number) => (cy > 0 ? ((i % cy) + cy) % cy : i);
  const x0 = wx(ix), x1 = wx(ix + 1), y0 = wy(iy), y1 = wy(iy + 1);
  return mix(mix(hash2(x0, y0, s), hash2(x1, y0, s), fx), mix(hash2(x0, y1, s), hash2(x1, y1, s), fx), fy);
}

/** Ruído fractal periódico sobre o tile: (a, b) em [0, 1) de tile, `cells` células na oitava base. */
export function pfbm(a: number, b: number, cells: number, oct: number, s: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let c = cells;
  for (let o = 0; o < oct; o++) {
    sum += amp * vnoise(a * c, b * c, s + o * 17, c, c);
    norm += amp;
    amp *= 0.5;
    c *= 2;
  }
  return sum / norm;
}

// ---------------------------------------------------------------------------
// Amostradores por padrão
// ---------------------------------------------------------------------------

interface Sample {
  /** Altura (m). */
  h: number;
  /** Multiplicador de tom da cor base. */
  t: number;
  /** Mistura com a cor da junta (0 a 1). */
  j: number;
  /** Sujeira (escurece, 0 a 1). */
  d: number;
  /** Rugosidade absoluta (0 a 1). */
  r: number;
}

type Sampler = (u: number, v: number, o: Sample) => void;

function plankSampler(spec: TextureSpec, pxm: number, seed: number): Sampler {
  const [pl, pw] = spec.module;
  const per = Math.max(1, Math.round(spec.tile[0] / pl));
  const jw = Math.max(spec.jointWidth, 2.4 / pxm);
  const rough = materialRoughness(spec.id);
  return (u, v, o) => {
    const row = Math.floor(v / pw);
    const lv = v - row * pw;
    const off = (row * 0.37 * pl) % pl;
    const uu = u + off;
    const k = Math.floor(uu / pl);
    const lu = uu - k * pl;
    const id = row * 61 + (((k % per) + per) % per) * 7 + 3;
    const r1 = hash2(id, 1, seed), r2 = hash2(id, 2, seed), r3 = hash2(id, 3, seed), r4 = hash2(id, 4, seed);
    let t = 1 + (r1 - 0.5) * 2 * spec.variation;
    let gn = 0.5;
    let hh = 0;
    if (spec.grain) {
      const fiber = vnoise(lu * 5 + r2 * 40, lv * 170 + r3 * 30, seed + 1);
      const band = vnoise(lu * 2 + r2 * 20, lv * 24 + r3 * 10, seed + 2);
      gn = 0.55 * fiber + 0.45 * band;
      t *= 1 + (gn - 0.5) * 0.3;
      hh += (fiber - 0.5) * 0.0006;
      if (r4 > 0.5) {
        // nó: núcleo escuro com anéis ao redor, alongado ao longo da régua
        const kx = pl * (0.15 + 0.7 * r2);
        const ky = pw * (0.28 + 0.44 * r3);
        const d = Math.hypot((lu - kx) * 0.65, (lv - ky) * 1.7);
        const core = Math.exp(-((d / 0.013) ** 2));
        const ring = 0.5 + 0.5 * Math.sin(d * 330);
        const fall = Math.exp(-d / 0.04);
        t *= 1 - 0.5 * core - 0.14 * ring * fall;
        hh += (0.0007 * ring - 0.0012 * core) * fall;
      }
    }
    const edge = Math.min(lv, pw - lv, lu, pl - lu);
    const g = 1 - smooth(0, jw, edge);
    o.t = t;
    o.j = g * 0.6;
    o.d = g * 0.28;
    o.h = hh - g * 0.003;
    o.r = clamp01(rough + (gn - 0.5) * 0.18 + g * 0.2);
  };
}

function gridSampler(spec: TextureSpec, pxm: number, seed: number): Sampler {
  const [mw, mh] = spec.module;
  const jw = Math.max(spec.jointWidth, 2.4 / pxm);
  const rough = materialRoughness(spec.id);
  const porcelain = spec.id === 'finish_floor_porcelain';
  const ceramic = spec.id === 'finish_floor_ceramic';
  return (u, v, o) => {
    const c = Math.floor(u / mw);
    const r = Math.floor(v / mh);
    const lu = u - c * mw;
    const lv = v - r * mh;
    const ox = hash2(c, r, seed) * 90, oy = hash2(r, c, seed + 3) * 90;
    let t = 1 + (hash2(c * 7, r * 13, seed + 5) - 0.5) * 2 * spec.variation;
    const n = vnoise(lu * 5 + ox, lv * 5 + oy, seed + 7) * 0.6 + vnoise(lu * 14 + oy, lv * 14 + ox, seed + 9) * 0.4;
    if (porcelain) {
      // nuvens suaves e veios finos de pedra
      const vein = 1 - smooth(0, 0.03, Math.abs(vnoise(lu * 4 + ox, lv * 3 + oy, seed + 11) - 0.5));
      t *= 0.96 + 0.07 * n - 0.09 * vein;
    } else if (ceramic) {
      t *= 0.94 + 0.12 * vnoise(lu * 220 + ox, lv * 220 + oy, seed + 13);
    } else t *= 0.98 + 0.04 * n;
    const d = Math.min(lu, mw - lu, lv, mh - lv);
    const g = 1 - smooth(0, jw, d);
    o.t = t;
    o.j = g;
    o.d = g * 0.2;
    o.h = -g * 0.003 - (1 - smooth(0, jw * 3, d)) * 0.0004;
    o.r = clamp01(rough + (n - 0.5) * 0.1 + g * 0.6);
  };
}

function brickSampler(spec: TextureSpec, pxm: number, seed: number): Sampler {
  const [bw, bh] = spec.module;
  const jw = Math.max(spec.jointWidth, 3 / pxm);
  const rough = materialRoughness(spec.id);
  const per = Math.max(1, Math.round(spec.tile[0] / bw));
  return (u, v, o) => {
    const row = Math.floor(v / bh);
    const lv = v - row * bh;
    const uu = u + (row % 2 === 0 ? 0 : bw / 2);
    const k = Math.floor(uu / bw);
    const lu = uu - k * bw;
    const id = row * 29 + (((k % per) + per) % per) * 5 + 1;
    const r1 = hash2(id, 1, seed), r2 = hash2(id, 2, seed);
    // tijolo: tom por peça, mancha de queima e poro
    const burn = vnoise(lu * 30 + r2 * 60, lv * 30 + r1 * 60, seed + 1);
    const pore = vnoise(lu * 420, lv * 420 + r1 * 30, seed + 2);
    let t = 1 + (r1 - 0.5) * 2 * spec.variation + (burn - 0.5) * 0.22;
    t *= 0.9 + 0.2 * pore;
    const d = Math.min(lu, bw - lu, lv, bh - lv);
    const g = 1 - smooth(jw * 0.5, jw * 1.6, d); // argamassa afundada
    const bevel = 1 - smooth(jw * 1.6, jw * 3.4, d);
    const sand = vnoise(u * 700, v * 700, seed + 3);
    o.t = t * (1 - g * 0.0) * mix(1, 0.85 + 0.3 * sand, g);
    o.j = g;
    o.d = g * 0.18 + bevel * 0.05;
    o.h = -g * 0.006 - bevel * 0.0007 + (pore - 0.5) * 0.0012;
    o.r = clamp01(rough - (1 - g) * 0.03 + (pore - 0.5) * 0.08);
  };
}

function sidingSampler(spec: TextureSpec, pxm: number, seed: number): Sampler {
  const pw = spec.module[1];
  const jw = Math.max(spec.jointWidth, 3 / pxm);
  const rough = materialRoughness(spec.id);
  return (u, v, o) => {
    const row = Math.floor(v / pw);
    const lv = v - row * pw;
    const t0 = 1 + (hash2(row, 1, seed) - 0.5) * 2 * spec.variation;
    const fiber = vnoise(u * 6 + row * 13, lv * 320, seed + 1);
    const g = 1 - smooth(0, jw, lv); // sulco sob a régua de cima
    const below = 1 - smooth(jw, jw * 3.5, lv); // sombra projetada no começo da régua
    // a régua engrossa para baixo (perfil de sobreposição)
    const slope = (lv / pw) * 0.008;
    o.t = t0 * (0.96 + 0.08 * fiber) * (1 - below * 0.1);
    o.j = g * 0.5;
    o.d = g * 0.28 + below * 0.1;
    o.h = slope - g * 0.004;
    o.r = clamp01(rough + (fiber - 0.5) * 0.1);
  };
}

function plainSampler(spec: TextureSpec, _pxm: number, seed: number): Sampler {
  const rough = materialRoughness(spec.id);
  const [tw, th] = spec.tile;
  return (u, v, o) => {
    const a = u / tw, b = v / th;
    const fine = vnoise(u * 360, v * 360, seed + 1, Math.round(360 * tw), Math.round(360 * th));
    const mid = pfbm(a, b, 6, 3, seed + 2);
    o.t = 0.97 + 0.04 * fine + (mid - 0.5) * 0.06;
    o.j = 0;
    o.d = 0;
    o.h = (fine - 0.5) * 0.0008;
    o.r = clamp01(rough + (fine - 0.5) * 0.06);
  };
}

function ribSampler(spec: TextureSpec, pxm: number, seed: number): Sampler {
  const pitch = spec.module[0];
  const [tw, th] = spec.tile;
  const rough = materialRoughness(spec.id);
  void pxm;
  return (u, v, o) => {
    const p = ((u / pitch) % 1 + 1) % 1;
    // perfil trapezoidal: vale (0 a 0,3), sobe (0,3 a 0,42), topo (0,42 a 0,62), desce (0,62 a 0,74), vale
    const up = smooth(0.3, 0.42, p);
    const down = 1 - smooth(0.62, 0.74, p);
    const prof = Math.min(up, down);
    const streak = pfbm(u / tw, v / th * 0.25, 2, 3, seed + 1); // manchas ao longo da água
    const grit = vnoise(u * 300, v * 300, seed + 2, Math.round(300 * tw), Math.round(300 * th));
    // sombra e luz baked nos flancos
    const flankL = smooth(0.3, 0.42, p) * (1 - smooth(0.42, 0.5, p));
    const flankR = smooth(0.62, 0.74, p) * (1 - smooth(0.74, 0.8, p));
    o.t = 0.94 + 0.08 * grit + (streak - 0.5) * 0.14 + flankL * 0.05 - flankR * 0.07 + prof * 0.03;
    o.j = 0;
    o.d = (1 - prof) * 0.05 + Math.max(0, streak - 0.6) * 0.18;
    o.h = prof * 0.022;
    o.r = clamp01(rough + (streak - 0.5) * 0.22 - prof * 0.05 + (grit - 0.5) * 0.05);
  };
}

function concreteSampler(spec: TextureSpec, _pxm: number, seed: number): Sampler {
  const [tw, th] = spec.tile;
  const rough = materialRoughness(spec.id);
  return (u, v, o) => {
    const a = u / tw, b = v / th;
    const cloud = pfbm(a, b, 3, 5, seed + 1);
    const pore = vnoise(u * 260, v * 260, seed + 2, Math.round(260 * tw), Math.round(260 * th));
    const crack = 1 - smooth(0, 0.012, Math.abs(pfbm(a, b, 5, 3, seed + 3) - 0.5));
    o.t = 0.9 + 0.2 * cloud + (pore > 0.86 ? -0.12 : 0.05 * (pore - 0.5));
    o.j = 0;
    o.d = crack * 0.25;
    o.h = (cloud - 0.5) * 0.002 + (pore - 0.5) * 0.0007 - crack * 0.0015;
    o.r = clamp01(rough + (cloud - 0.5) * 0.12);
  };
}

function grassSampler(spec: TextureSpec, _pxm: number, seed: number): Sampler {
  const [tw, th] = spec.tile;
  return (u, v, o) => {
    const a = u / tw, b = v / th;
    // duas escalas periódicas: manchas de ~1 m e tufos de poucos cm; grão fino isotrópico por cima
    const macro = pfbm(a, b, 3, 3, seed + 1);
    const tuft = pfbm(a, b, 20, 3, seed + 2);
    const grain = vnoise(u * 420, v * 420, seed + 3, Math.round(420 * tw), Math.round(420 * th));
    o.t = 0.8 + 0.34 * macro + (tuft - 0.5) * 0.3 + (grain - 0.5) * 0.2;
    o.j = 0;
    o.d = Math.max(0, 0.45 - tuft) * 0.18;
    o.h = (tuft - 0.5) * 0.012 + (grain - 0.5) * 0.005;
    o.r = clamp01(0.92 + (grain - 0.5) * 0.1);
  };
}

function gravelSampler(spec: TextureSpec, _pxm: number, seed: number): Sampler {
  const [tw, th] = spec.tile;
  const nx = Math.round(tw * 22), ny = Math.round(th * 22); // pedriscos de ~4,5 cm
  return (u, v, o) => {
    const x = (u / tw) * nx, y = (v / th) * ny;
    const ix = Math.floor(x), iy = Math.floor(y);
    let d1 = 9, d2 = 9, id = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = ix + dx, cy = iy + dy;
        const wx = ((cx % nx) + nx) % nx, wy = ((cy % ny) + ny) % ny;
        const px = cx + 0.2 + 0.6 * hash2(wx, wy, seed), py = cy + 0.2 + 0.6 * hash2(wy, wx, seed + 1);
        const d = Math.hypot(x - px, y - py);
        if (d < d1) { d2 = d1; d1 = d; id = wy * 131 + wx; } else if (d < d2) d2 = d;
      }
    }
    const edge = d2 - d1; // 0 na fronteira entre dois pedriscos
    const dome = smooth(0, 0.34, edge);
    const tone = hash2(id, 3, seed + 2);
    o.t = (0.78 + 0.45 * tone) * (0.55 + 0.45 * dome);
    o.j = (1 - dome) * 0.6;
    o.d = (1 - dome) * 0.3;
    o.h = dome * 0.012 + hash2(id, 5, seed) * 0.003;
    o.r = clamp01(0.88 + 0.1 * (1 - dome));
  };
}

function sandSampler(spec: TextureSpec, _pxm: number, seed: number): Sampler {
  const [tw, th] = spec.tile;
  return (u, v, o) => {
    const a = u / tw, b = v / th;
    const warp = pfbm(a, b, 4, 3, seed + 1);
    const ripple = 0.5 + 0.5 * Math.sin((u / tw) * Math.PI * 2 * 6 + warp * 9);
    const grain = vnoise(u * 600, v * 600, seed + 2, Math.round(600 * tw), Math.round(600 * th));
    o.t = 0.92 + 0.1 * warp + 0.05 * (grain - 0.5) + (ripple - 0.5) * 0.05;
    o.j = 0;
    o.d = 0;
    o.h = ripple * 0.006 + (grain - 0.5) * 0.0008;
    o.r = clamp01(0.97 + (grain - 0.5) * 0.06);
  };
}

function samplerFor(spec: TextureSpec, pxm: number, seed: number): Sampler {
  switch (spec.kind) {
    case 'planks': return plankSampler(spec, pxm, seed);
    case 'grid': return gridSampler(spec, pxm, seed);
    case 'bricks': return brickSampler(spec, pxm, seed);
    case 'siding': return sidingSampler(spec, pxm, seed);
    case 'ribs': return ribSampler(spec, pxm, seed);
    case 'concrete': return concreteSampler(spec, pxm, seed);
    case 'grass': return grassSampler(spec, pxm, seed);
    case 'gravel': return gravelSampler(spec, pxm, seed);
    case 'sand': return sandSampler(spec, pxm, seed);
    default: return plainSampler(spec, pxm, seed);
  }
}

// ---------------------------------------------------------------------------
// Imagem
// ---------------------------------------------------------------------------

export interface PatternBuffers {
  width: number;
  height: number;
  /** RGBA 8 bits (sRGB). */
  albedo: Uint8ClampedArray;
  /** Altura (m) por pixel. */
  heightMap: Float32Array;
  /** Rugosidade RGBA (cinza, o three lê o canal G). */
  roughness: Uint8ClampedArray;
}

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Gera cor, altura e rugosidade do padrão; `pxPerM` vem de `w / spec.tile[0]`. */
export function renderPattern(spec: TextureSpec, w: number, h: number): PatternBuffers {
  const pxm = w / spec.tile[0];
  const seed = hashStr(spec.id);
  const sample = samplerFor(spec, pxm, seed);
  const base = hexRgb(spec.color);
  const jointRgb = hexRgb(spec.joint);
  const albedo = new Uint8ClampedArray(w * h * 4);
  const roughness = new Uint8ClampedArray(w * h * 4);
  const heightMap = new Float32Array(w * h);
  const o: Sample = { h: 0, t: 1, j: 0, d: 0, r: 1 };
  for (let y = 0; y < h; y++) {
    const v = ((y + 0.5) / h) * spec.tile[1];
    for (let x = 0; x < w; x++) {
      const u = ((x + 0.5) / w) * spec.tile[0];
      sample(u, v, o);
      const i = y * w + x;
      const k = i * 4;
      const dirt = 1 - o.d;
      albedo[k] = (mix(base[0] * o.t, jointRgb[0], o.j)) * dirt;
      albedo[k + 1] = (mix(base[1] * o.t, jointRgb[1], o.j)) * dirt;
      albedo[k + 2] = (mix(base[2] * o.t, jointRgb[2], o.j)) * dirt;
      albedo[k + 3] = 255;
      heightMap[i] = o.h;
      const r = o.r * 255;
      roughness[k] = r;
      roughness[k + 1] = r;
      roughness[k + 2] = r;
      roughness[k + 3] = 255;
    }
  }
  return { width: w, height: h, albedo, heightMap, roughness };
}

/**
 * Mapa de normais (RGBA, espaço tangente, +Y para cima na imagem como no three) por Sobel sobre a altura, com
 * repetição nas bordas. `pxPerM` converte o passo do pixel em metros; `strength` exagera o relevo.
 * Plano liso: (0,5; 0,5; 1).
 */
export function normalFromHeight(height: Float32Array, w: number, h: number, pxPerM: number, strength = 2): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  const at = (x: number, y: number) => height[((y + h) % h) * w + ((x + w) % w)]!;
  const k = (pxPerM / 8) * strength;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tl = at(x - 1, y - 1), t = at(x, y - 1), tr = at(x + 1, y - 1);
      const l = at(x - 1, y), r = at(x + 1, y);
      const bl = at(x - 1, y + 1), b = at(x, y + 1), br = at(x + 1, y + 1);
      const dx = (tr + 2 * r + br - (tl + 2 * l + bl)) * k;
      const dy = (bl + 2 * b + br - (tl + 2 * t + tr)) * k; // y cresce para baixo na imagem
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      out[i] = (-dx * inv * 0.5 + 0.5) * 255;
      out[i + 1] = (dy * inv * 0.5 + 0.5) * 255;
      out[i + 2] = (inv * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  return out;
}

/** Quanto exagerar o relevo no mapa de normais, por padrão. */
export function normalStrength(spec: TextureSpec): number {
  switch (spec.kind) {
    case 'planks': return 2.5;
    case 'bricks': return 1.6;
    case 'ribs': return 1.2;
    case 'grass': return 1;
    case 'gravel': return 1.2;
    case 'plain': return 3;
    default: return 2;
  }
}
