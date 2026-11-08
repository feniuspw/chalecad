/**
 * Texturas procedurais dos acabamentos, desenhadas em canvas (nada é baixado).
 * `describeTexture` só descreve o padrão (tamanho do módulo, cores) e roda sem DOM; `paintTexture` desenha
 * num contexto 2D e `getTexture` cria e memoriza a `CanvasTexture` por material.
 * As UVs das geometrias do editor estão em metros: `repeat = 1 / tile`, com `tile` = metros que a imagem cobre.
 */
import * as THREE from 'three';

export type PatternKind = 'planks' | 'grid' | 'bricks' | 'siding' | 'plain' | 'ribs' | 'concrete' | 'grass' | 'gravel' | 'sand';

export interface TextureSpec {
  id: string;
  kind: PatternKind;
  /** Cor base (hex). */
  color: string;
  /** Cor da junta/rejunte/sombra entre peças. */
  joint: string;
  /** Módulo da peça (m): largura (ao longo de u) e altura/largura da régua (ao longo de v). */
  module: [number, number];
  /** Largura da junta (m). */
  jointWidth: number;
  /** Variação de tom entre peças (0 a 1). */
  variation: number;
  /** Veios de madeira. */
  grain: boolean;
  /** Metros cobertos pela imagem inteira (um número inteiro de módulos, para emendar sem costura). */
  tile: [number, number];
}

const planks = (id: string, color: string, width: number, length: number, variation: number): TextureSpec => {
  const cols = Math.max(1, Math.round(0.6 / width));
  return { id, kind: 'planks', color, joint: '#4a3320', module: [length, width], jointWidth: 0.002, variation, grain: true, tile: [length * 2, round3(width * cols)] };
};
const round3 = (n: number) => Math.round(n * 1000) / 1000;

const grid = (id: string, color: string, w: number, h: number, joint: string, variation: number): TextureSpec => ({
  id, kind: 'grid', color, joint, module: [w, h], jointWidth: 0.003, variation, grain: false, tile: [w * 2, h * 2],
});

const plain = (id: string, color: string): TextureSpec => ({
  id, kind: 'plain', color, joint: color, module: [1, 1], jointWidth: 0, variation: 0.05, grain: false, tile: [1, 1],
});

const SPECS: Record<string, TextureSpec> = {
  finish_floor_wood: planks('finish_floor_wood', '#a9743f', 0.12, 1.2, 0.12),
  finish_floor_vinyl: planks('finish_floor_vinyl', '#cfae80', 0.18, 1.2, 0.1),
  finish_floor_laminate: planks('finish_floor_laminate', '#c9a674', 0.19, 1.2, 0.12),
  finish_floor_porcelain: grid('finish_floor_porcelain', '#d8d5ce', 0.6, 0.6, '#b9b5ac', 0.05),
  finish_floor_ceramic: grid('finish_floor_ceramic', '#c4b4a0', 0.45, 0.45, '#a89a88', 0.07),
  finish_wall_paint: plain('finish_wall_paint', '#f7f4ee'),
  finish_wall_wood: planks('finish_wall_wood', '#c08e57', 0.12, 1.2, 0.1),
  finish_wall_tile: grid('finish_wall_tile', '#eef1f0', 0.3, 0.6, '#c9cfcd', 0.03),
  finish_facade_texture: plain('finish_facade_texture', '#e9dfcf'),
  finish_facade_wood: planks('finish_facade_wood', '#93673c', 0.12, 1.2, 0.1),
  finish_facade_siding: {
    id: 'finish_facade_siding', kind: 'siding', color: '#e2ded3', joint: '#8c877b', module: [1, 0.2], jointWidth: 0.012, variation: 0.03, grain: false, tile: [0.5, 0.4],
  },
  finish_facade_brick: {
    id: 'finish_facade_brick', kind: 'bricks', color: '#a24f35', joint: '#d8d1c4', module: [0.24, 0.07], jointWidth: 0.01, variation: 0.14, grain: false, tile: [0.48, 0.14],
  },
  finish_ceiling_wood: planks('finish_ceiling_wood', '#c99c66', 0.1, 1.2, 0.14),
  finish_ceiling_paint: plain('finish_ceiling_paint', '#fbfaf6'),
};

/** Descrição do padrão de um material de acabamento; undefined para ids sem textura. */
export function describeTexture(materialId: string | undefined): TextureSpec | undefined {
  return materialId ? SPECS[materialId] : undefined;
}

/** Quantas vezes a imagem se repete por metro (u, v). */
export function textureRepeat(spec: TextureSpec): [number, number] {
  return [1 / spec.tile[0], 1 / spec.tile[1]];
}

// ---------------------------------------------------------------------------
// Desenho
// ---------------------------------------------------------------------------

export const PX_PER_M = 512;

/** Tamanho em pixels da imagem de um padrão (limitado a 1024). */
export function texturePixels(spec: TextureSpec): [number, number] {
  const k = Math.min(PX_PER_M, 1024 / Math.max(spec.tile[0], spec.tile[1]));
  return [Math.max(8, Math.round(spec.tile[0] * k)), Math.max(8, Math.round(spec.tile[1] * k))];
}

/** Gerador pseudoaleatório determinístico (a mesma textura sai igual a cada execução). */
export function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

type Ctx = Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle' | 'strokeStyle' | 'lineWidth' | 'beginPath' | 'moveTo' | 'lineTo' | 'stroke' | 'globalAlpha'>;

/** Desenha o padrão na imagem inteira (`w` × `h` px). */
export function paintTexture(ctx: Ctx, spec: TextureSpec, w: number, h: number): void {
  const rand = rng(spec.id);
  const px = w / spec.tile[0]; // px por metro
  const tone = () => shade(spec.color, 1 + (rand() - 0.5) * 2 * spec.variation);
  ctx.globalAlpha = 1;
  ctx.fillStyle = spec.color;
  ctx.fillRect(0, 0, w, h);

  const joint = Math.max(1, spec.jointWidth * px);
  const grain = (x: number, y: number, pw: number, ph: number) => {
    if (!spec.grain) return;
    const lines = Math.max(2, Math.round(ph / 6));
    ctx.lineWidth = 1;
    for (let i = 0; i < lines; i++) {
      const gy = y + ((i + rand()) / lines) * ph;
      ctx.strokeStyle = rand() > 0.5 ? 'rgba(60,35,15,0.16)' : 'rgba(255,235,200,0.12)';
      ctx.beginPath();
      ctx.moveTo(x, gy);
      const segs = 4;
      for (let s = 1; s <= segs; s++) ctx.lineTo(x + (pw * s) / segs, gy + (rand() - 0.5) * 2.2);
      ctx.stroke();
    }
  };

  switch (spec.kind) {
    case 'planks': {
      const pl = spec.module[0] * px;
      const pw = spec.module[1] * px;
      const rows = Math.round(h / pw);
      const per = Math.max(1, Math.round(w / pl)); // réguas por fiada na imagem (a imagem fecha sem costura)
      for (let r = 0; r < rows; r++) {
        const y = r * pw;
        const off = (r * 0.37 * pl) % pl;
        for (let k = 0; k < per; k++) {
          const fill = tone();
          // desenha também deslocada de `w` para a emenda da repetição
          for (const x of [k * pl - off, k * pl - off + w]) {
            ctx.fillStyle = fill;
            ctx.fillRect(x, y, pl, pw);
            grain(x, y, pl, pw);
            ctx.fillStyle = spec.joint;
            ctx.globalAlpha = 0.55;
            ctx.fillRect(x, y, joint, pw); // junta de topo
            ctx.globalAlpha = 1;
          }
        }
        ctx.fillStyle = spec.joint;
        ctx.globalAlpha = 0.6;
        ctx.fillRect(0, y, w, joint);
        ctx.globalAlpha = 1;
      }
      break;
    }
    case 'grid': {
      const mw = spec.module[0] * px;
      const mh = spec.module[1] * px;
      const cols = Math.round(w / mw);
      const rows = Math.round(h / mh);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          ctx.fillStyle = tone();
          ctx.fillRect(c * mw, r * mh, mw, mh);
        }
      }
      ctx.fillStyle = spec.joint;
      for (let c = 0; c <= cols; c++) ctx.fillRect(c * mw - (c === 0 ? 0 : joint / 2), 0, joint / (c === 0 || c === cols ? 2 : 1), h);
      for (let r = 0; r <= rows; r++) ctx.fillRect(0, r * mh - (r === 0 ? 0 : joint / 2), w, joint / (r === 0 || r === rows ? 2 : 1));
      break;
    }
    case 'bricks': {
      const bw = spec.module[0] * px;
      const bh = spec.module[1] * px;
      const rows = Math.round(h / bh);
      ctx.fillStyle = spec.joint;
      ctx.fillRect(0, 0, w, h);
      for (let r = 0; r < rows; r++) {
        const off = r % 2 === 0 ? 0 : bw / 2;
        for (let x = -off; x < w; x += bw) {
          ctx.fillStyle = tone();
          ctx.fillRect(x + joint / 2, r * bh + joint / 2, bw - joint, bh - joint);
        }
      }
      break;
    }
    case 'siding': {
      const sh = spec.module[1] * px;
      const rows = Math.round(h / sh);
      for (let r = 0; r < rows; r++) {
        ctx.fillStyle = tone();
        ctx.fillRect(0, r * sh, w, sh);
        // sombra sob a régua
        ctx.fillStyle = spec.joint;
        ctx.globalAlpha = 0.35;
        ctx.fillRect(0, r * sh, w, joint);
        ctx.globalAlpha = 0.12;
        ctx.fillRect(0, r * sh + joint, w, joint);
        ctx.globalAlpha = 1;
      }
      break;
    }
    case 'plain': {
      const n = Math.round((w * h) / 90);
      for (let i = 0; i < n; i++) {
        ctx.globalAlpha = 0.07;
        ctx.fillStyle = rand() > 0.5 ? '#000000' : '#ffffff';
        ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2);
      }
      ctx.globalAlpha = 1;
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// CanvasTexture memorizada
// ---------------------------------------------------------------------------

const cache = new Map<string, THREE.CanvasTexture>();

/** Textura do material (memorizada por id); undefined sem DOM ou sem padrão para o id. */
export function getTexture(materialId: string | undefined): THREE.CanvasTexture | undefined {
  const spec = describeTexture(materialId);
  if (!spec || typeof document === 'undefined') return undefined;
  const hit = cache.get(spec.id);
  if (hit) return hit;
  const [w, h] = texturePixels(spec);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  paintTexture(ctx, spec, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const [rx, ry] = textureRepeat(spec);
  tex.repeat.set(rx, ry);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cache.set(spec.id, tex);
  return tex;
}

// ---------------------------------------------------------------------------
// Grama procedural (chão do modo apresentação)
// ---------------------------------------------------------------------------

/** Metros que a imagem da grama cobre. */
export const GRASS_TILE = 4;

let grass: THREE.CanvasTexture | undefined;

/** Textura de grama (tons de cinza-esverdeado, multiplica a cor do material); emenda sem costura. */
export function getGrassTexture(): THREE.CanvasTexture | undefined {
  if (typeof document === 'undefined') return undefined;
  if (grass) return grass;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  const rand = rng('grass');
  ctx.fillStyle = '#e8ece0';
  ctx.fillRect(0, 0, size, size);
  // manchas largas de tom, depois fios curtos; tudo desenhado também deslocado de `size` para emendar
  const wrap = (x: number, y: number, reach: number, draw: (dx: number, dy: number) => void) => {
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        if (x + dx > -reach && x + dx < size + reach && y + dy > -reach && y + dy < size + reach) draw(dx, dy);
      }
    }
  };
  for (let i = 0; i < 90; i++) {
    const x = rand() * size, y = rand() * size, r = 20 + rand() * 50;
    const v = 200 + Math.floor(rand() * 50);
    wrap(x, y, r, (dx, dy) => {
      ctx.fillStyle = `rgba(${v},${v + 4},${v - 20},0.10)`;
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  for (let i = 0; i < 14000; i++) {
    const x = rand() * size, y = rand() * size;
    const v = 150 + Math.floor(rand() * 105);
    const len = 2 + rand() * 4;
    const a = -Math.PI / 2 + (rand() - 0.5) * 0.9;
    const alpha = 0.18 + rand() * 0.3;
    wrap(x, y, len + 1, (dx, dy) => {
      ctx.strokeStyle = `rgba(${v * 0.8},${v},${v * 0.6},${alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + dx, y + dy);
      ctx.lineTo(x + dx + Math.cos(a) * len, y + dy + Math.sin(a) * len);
      ctx.stroke();
    });
  }
  grass = new THREE.CanvasTexture(canvas);
  grass.wrapS = grass.wrapT = THREE.RepeatWrapping;
  grass.colorSpace = THREE.SRGBColorSpace;
  grass.anisotropy = 8;
  return grass;
}
