/**
 * Sprites de vegetação desenhados em canvas (nada é baixado): copa arredondada, araucária, conífera, palmeira,
 * dois arbustos e um tufo de capim. Cada um vira uma textura RGBA com alfa (para `alphaTest`) e sombreado simples
 * para dar volume (claro em cima à esquerda, escuro embaixo). As cores de baixo do alfa são preenchidas com a
 * cor média da planta, para o mipmap não criar halo escuro nas bordas.
 */
import * as THREE from 'three';
import { SPRITES, type SpriteId } from './foliage';
import { rng } from './textures';

type C = CanvasRenderingContext2D;
type Rand = () => number;

const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${h.toFixed(0)},${s.toFixed(0)}%,${Math.max(0, Math.min(100, l)).toFixed(0)}%,${a})`;
const TAU = Math.PI * 2;

/** Esfera de folhagem: gradiente iluminado de cima à esquerda. */
function blob(c: C, x: number, y: number, r: number, hue: number, sat: number, light: number) {
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.42, r * 0.08, x, y, r);
  g.addColorStop(0, hsl(hue, sat, light + 15));
  g.addColorStop(0.55, hsl(hue, sat, light));
  g.addColorStop(1, hsl(hue + 4, sat + 4, light - 13));
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
}

function trunk(c: C, x0: number, y0: number, x1: number, y1: number, w0: number, w1: number, hue: number, light: number, bend = 0) {
  const g = c.createLinearGradient(x0 - w0, 0, x0 + w0, 0);
  g.addColorStop(0, hsl(hue, 28, light + 12));
  g.addColorStop(0.6, hsl(hue, 30, light));
  g.addColorStop(1, hsl(hue, 32, light - 12));
  c.fillStyle = g;
  c.beginPath();
  const mx = (x0 + x1) / 2 + bend, my = (y0 + y1) / 2;
  c.moveTo(x0 - w0 / 2, y0);
  c.quadraticCurveTo(mx - (w0 + w1) / 4, my, x1 - w1 / 2, y1);
  c.lineTo(x1 + w1 / 2, y1);
  c.quadraticCurveTo(mx + (w0 + w1) / 4, my, x0 + w0 / 2, y0);
  c.closePath();
  c.fill();
}

// ---------------------------------------------------------------------------
// Árvores
// ---------------------------------------------------------------------------

/**
 * Copa por aglomerados de folhas: cada aglomerado é sombreado pela normal do elipsoide da copa (luz de cima à
 * esquerda), então a copa inteira lê como um volume só; o fundo escuro aparece nos vãos.
 */
function crown(c: C, rand: Rand, cx: number, cy: number, rx: number, ry: number, o: { clusters: number; hue: number; sat: number; dark: number; light: number; rc: [number, number]; half?: boolean; leaves?: number; thin?: boolean }) {
  // fundo escuro nos vãos
  for (let i = 0; i < 14; i++) {
    const a = rand() * TAU, d = Math.sqrt(rand()) * 0.8;
    const y = cy + Math.sin(a) * ry * d;
    if (o.half && y > cy) continue;
    c.fillStyle = hsl(o.hue + 6, o.sat - 4, o.dark + 5);
    c.beginPath();
    c.arc(cx + Math.cos(a) * rx * d, y, Math.min(rx, ry) * (0.28 + 0.2 * rand()), 0, TAU);
    c.fill();
  }
  const list: { x: number; y: number; nx: number; ny: number; nz: number }[] = [];
  while (list.length < o.clusters) {
    const a = rand() * TAU, d = Math.sqrt(rand()) * 1.04;
    const nx = Math.cos(a) * d, ny = Math.sin(a) * d;
    if (o.half && ny > 0.02) continue;
    const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, nx * nx + ny * ny)));
    list.push({ x: cx + nx * rx, y: cy + ny * ry, nx, ny, nz });
  }
  list.sort((p, q) => p.nz - q.nz); // de trás para a frente
  const L = [-0.52, -0.66, 0.55];
  for (const k of list) {
    const lit = Math.max(0, k.nx * L[0]! + k.ny * L[1]! + k.nz * L[2]!);
    const shade = 0.25 + 0.75 * lit;
    const rc = o.rc[0] + rand() * (o.rc[1] - o.rc[0]);
    const base = o.dark + (o.light - o.dark) * shade;
    const n = o.leaves ?? 16;
    for (let i = 0; i < n; i++) {
      const a = rand() * TAU, d = Math.sqrt(rand()) * rc;
      const l = base + (rand() - 0.5) * 11 + (-Math.cos(a) - Math.sin(a)) * 3;
      c.fillStyle = hsl(o.hue + (rand() - 0.5) * 16 + shade * 8, o.sat + (rand() - 0.5) * 12, l);
      c.beginPath();
      if (o.thin) c.ellipse(k.x + Math.cos(a) * d, k.y + Math.sin(a) * d, 5 + rand() * 6, 1.7 + rand() * 1.6, (rand() - 0.5) * 1.8 + (k.nx > 0 ? -0.35 : 0.35), 0, TAU);
      else c.ellipse(k.x + Math.cos(a) * d, k.y + Math.sin(a) * d, 4.5 + rand() * 6, 3 + rand() * 3.4, rand() * Math.PI, 0, TAU);
      c.fill();
    }
  }
}

function paintRound(c: C, w: number, h: number, rand: Rand) {
  trunk(c, w * 0.5, h - 2, w * 0.5 + 3, h * 0.5, 22, 12, 28, 22, -4);
  c.strokeStyle = hsl(28, 28, 18);
  c.lineCap = 'round';
  for (const [dx, dy] of [[-0.2, -0.3], [0.18, -0.34], [-0.04, -0.44]] as const) {
    c.lineWidth = 6;
    c.beginPath();
    c.moveTo(w * 0.5 + 2, h * 0.6);
    c.quadraticCurveTo(w * (0.5 + dx * 0.4), h * (0.6 + dy * 0.4), w * (0.5 + dx), h * (0.6 + dy));
    c.stroke();
  }
  crown(c, rand, w * 0.5, h * 0.4, w * 0.43, h * 0.35, { clusters: 230, hue: 98, sat: 44, dark: 17, light: 44, rc: [9, 17], leaves: 15 });
}

function paintAraucaria(c: C, w: number, h: number, rand: Rand) {
  const cx = w * 0.5;
  trunk(c, cx, h - 1, cx, h * 0.1, 15, 9, 26, 30);
  // anéis do tronco (casca em placas)
  c.strokeStyle = 'rgba(40,28,20,0.4)';
  c.lineWidth = 1.2;
  for (let y = h * 0.12; y < h - 4; y += 6 + rand() * 6) {
    c.beginPath();
    c.moveTo(cx - 7, y);
    c.lineTo(cx + 7, y + rand() * 2);
    c.stroke();
  }
  // braços saindo do tronco até os chumaços da copa em guarda-chuva
  c.lineCap = 'round';
  const tiers: { y: number; rx: number; ry: number; n: number }[] = [
    { y: 0.075, rx: 0.2, ry: 0.05, n: 34 },
    { y: 0.15, rx: 0.44, ry: 0.06, n: 78 },
    { y: 0.245, rx: 0.34, ry: 0.05, n: 52 },
  ];
  for (const t of tiers) {
    for (let side = -1; side <= 1; side += 2) {
      for (let k = 0; k < 4; k++) {
        const reach = w * t.rx * (0.5 + 0.5 * rand());
        const y0 = h * (t.y + 0.04 + rand() * 0.02);
        c.strokeStyle = hsl(24, 24, 19);
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(cx, y0 + 12);
        c.quadraticCurveTo(cx + side * reach * 0.6, y0 + 8, cx + side * reach, y0 - 3);
        c.stroke();
      }
    }
  }
  for (const t of tiers) {
    crown(c, rand, cx, h * t.y, w * t.rx, h * t.ry, { clusters: t.n, hue: 140, sat: 26, dark: 15, light: 36, rc: [9, 15], leaves: 14, thin: true });
  }
}

function paintConifer(c: C, w: number, h: number, rand: Rand) {
  const cx = w * 0.5;
  trunk(c, cx, h - 1, cx, h * 0.7, 18, 12, 24, 22);
  const tiers = 10;
  for (let t = tiers - 1; t >= 0; t--) {
    const f = t / (tiers - 1); // 0 topo, 1 base
    const top = h * (0.02 + 0.74 * f * 0.9);
    const base = top + h * (0.13 + 0.05 * f);
    const half = w * (0.1 + 0.4 * f);
    const g = c.createLinearGradient(cx - half, 0, cx + half, 0);
    g.addColorStop(0, hsl(152, 30, 29 - 2 * f));
    g.addColorStop(0.55, hsl(154, 32, 20 - 2 * f));
    g.addColorStop(1, hsl(158, 34, 12));
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(cx, top);
    c.lineTo(cx + half, base);
    c.lineTo(cx - half, base);
    c.closePath();
    c.fill();
    // ponta dos galhos caindo e agulhas
    for (let i = 0; i < 26; i++) {
      const u = rand() * 2 - 1;
      const x = cx + u * half * 0.98;
      const y = base - Math.abs(u) * 0 - rand() * 6;
      const lit = -u * 12;
      c.fillStyle = hsl(150 + rand() * 12, 30, 21 + lit + (rand() - 0.5) * 12 + (1 - f) * 4);
      c.beginPath();
      c.ellipse(x, y, 5 + rand() * 5, 3 + rand() * 3, (u * 0.6 + (rand() - 0.5) * 0.4), 0, TAU);
      c.fill();
    }
    for (let i = 0; i < 40; i++) {
      const y = top + rand() * (base - top);
      const wy = ((y - top) / (base - top)) * half;
      const x = cx + (rand() * 2 - 1) * wy;
      const lit = -((x - cx) / (half || 1)) * 10;
      c.fillStyle = hsl(152 + rand() * 10, 30, 20 + lit + (rand() - 0.5) * 14);
      c.beginPath();
      c.ellipse(x, y, 3 + rand() * 4, 2 + rand() * 2.5, rand() * Math.PI, 0, TAU);
      c.fill();
    }
  }
}

function paintPalm(c: C, w: number, h: number, rand: Rand) {
  const bx = w * 0.42, tx = w * 0.56, ty = h * 0.4;
  trunk(c, bx, h - 1, tx, ty, 24, 13, 34, 38, 14);
  // anéis da palmeira
  c.strokeStyle = 'rgba(70,52,34,0.45)';
  c.lineWidth = 1.5;
  for (let t = 0.04; t < 0.98; t += 0.045) {
    const x = bx + (tx - bx) * t + Math.sin(t * Math.PI) * 14 * 0.5;
    const y = h - 1 + (ty - h + 1) * t;
    const hw = 12 - 5.5 * t;
    c.beginPath();
    c.moveTo(x - hw, y);
    c.lineTo(x + hw, y + 2);
    c.stroke();
  }
  const fronds = 13;
  for (let i = 0; i < fronds; i++) {
    const ang = Math.PI * (1.04 + (i / (fronds - 1)) * -1.08) + (rand() - 0.5) * 0.18; // de ~187 a ~-7 graus (y para baixo no canvas)
    const len = w * (0.34 + rand() * 0.12);
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const p0 = [tx, ty - 2];
    const p1 = [tx + dx * len * 0.55, ty + dy * len * 0.55 - len * 0.2];
    const p2 = [tx + dx * len, ty + dy * len * 0.55 + len * 0.28];
    const at = (t: number): [number, number] => {
      const u = 1 - t;
      return [u * u * p0[0]! + 2 * u * t * p1[0]! + t * t * p2[0]!, u * u * p0[1]! + 2 * u * t * p1[1]! + t * t * p2[1]!];
    };
    c.strokeStyle = hsl(80, 30, 28);
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(p0[0]!, p0[1]!);
    c.quadraticCurveTo(p1[0]!, p1[1]!, p2[0]!, p2[1]!);
    c.stroke();
    const steps = 30;
    for (let s = 2; s <= steps; s++) {
      const t = s / steps;
      const [x, y] = at(t);
      const [x2, y2] = at(Math.min(1, t + 0.02));
      const tdx = x2 - x, tdy = y2 - y;
      const tl = Math.hypot(tdx, tdy) || 1;
      const nx = -tdy / tl, ny = tdx / tl;
      const leaf = (34 * (1 - t * 0.7) + 5) * (0.8 + 0.4 * rand());
      for (const side of [-1, 1]) {
        // folíolos caem para baixo
        const ex = x + side * nx * leaf * 0.7 + 0 * tdx;
        const ey = y + side * ny * leaf * 0.7 + leaf * 0.62;
        const lit = (side * nx < 0 ? 8 : -2) + (1 - t) * 6;
        c.strokeStyle = hsl(86 + rand() * 18, 42, 29 + lit + (rand() - 0.5) * 12);
        c.lineWidth = 2.6 - t * 1.2;
        c.beginPath();
        c.moveTo(x, y);
        c.quadraticCurveTo(x + side * nx * leaf * 0.45, y + side * ny * leaf * 0.45 + leaf * 0.1, ex, ey);
        c.stroke();
      }
    }
  }
  // cocos
  for (const [dx, dy] of [[-8, 8], [7, 10], [0, 14]] as const) blob(c, tx + dx, ty + dy, 7.5, 28, 40, 24);
}

// ---------------------------------------------------------------------------
// Arbustos e capim
// ---------------------------------------------------------------------------

function bushBody(c: C, w: number, h: number, rand: Rand, hue: number, sat: number, light: number) {
  crown(c, rand, w * 0.5, h * 0.93, w * 0.46, h * 0.88, { clusters: 90, hue, sat, dark: light - 14, light: light + 14, rc: [8, 15], half: true, leaves: 13 });
}

function paintBushRound(c: C, w: number, h: number, rand: Rand) {
  bushBody(c, w, h, rand, 100, 42, 28);
}

function paintBushFlower(c: C, w: number, h: number, rand: Rand) {
  bushBody(c, w, h, rand, 108, 38, 26);
  const cols = ['#f2b8c8', '#f6e8ee', '#e8789a', '#f5d36b'];
  const cx = w * 0.5, base = h * 0.94;
  for (let i = 0; i < 70; i++) {
    const a = Math.PI * (1 + rand());
    const d = 0.25 + 0.75 * Math.sqrt(rand());
    const x = cx + Math.cos(a) * w * 0.36 * d, y = base + Math.sin(a) * h * 0.74 * d - 6;
    const col = cols[Math.floor(rand() * cols.length) % cols.length]!;
    c.fillStyle = col;
    c.beginPath();
    c.arc(x, y, 3.2 + rand() * 2.6, 0, TAU);
    c.fill();
    c.fillStyle = 'rgba(255,240,170,0.9)';
    c.beginPath();
    c.arc(x, y, 1.1, 0, TAU);
    c.fill();
  }
}

function paintGrass(c: C, w: number, h: number, rand: Rand) {
  const base = h - 2;
  const blades = 40;
  for (let i = 0; i < blades; i++) {
    const x0 = w * 0.5 + (rand() - 0.5) * w * 0.34;
    const hgt = h * (0.45 + 0.5 * rand());
    const lean = (rand() - 0.5) * w * 0.7;
    const bw = 4 + rand() * 3.5;
    const tipX = x0 + lean, tipY = base - hgt;
    const g = c.createLinearGradient(0, base, 0, tipY);
    const hue = 72 + rand() * 30;
    g.addColorStop(0, hsl(hue + 10, 40, 16));
    g.addColorStop(0.5, hsl(hue, 46, 31 + rand() * 6));
    g.addColorStop(1, hsl(hue - 4, 52, 48 + rand() * 8));
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(x0 - bw / 2, base);
    c.quadraticCurveTo(x0 - bw * 0.3 + lean * 0.2, base - hgt * 0.55, tipX, tipY);
    c.quadraticCurveTo(x0 + bw * 0.3 + lean * 0.35, base - hgt * 0.5, x0 + bw / 2, base);
    c.closePath();
    c.fill();
  }
  // espigas de capim
  for (let i = 0; i < 3; i++) {
    const x0 = w * 0.5 + (rand() - 0.5) * w * 0.3;
    const hgt = h * (0.7 + 0.25 * rand());
    const tipX = x0 + (rand() - 0.5) * w * 0.4, tipY = base - hgt;
    c.strokeStyle = hsl(70, 30, 38);
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(x0, base);
    c.quadraticCurveTo(x0, base - hgt * 0.6, tipX, tipY);
    c.stroke();
    c.fillStyle = hsl(48, 34, 52 + rand() * 10);
    c.beginPath();
    c.ellipse(tipX, tipY - 3, 2, 6.5, (tipX - x0) * 0.01, 0, TAU);
    c.fill();
  }
}

const PAINTERS: Record<SpriteId, (c: C, w: number, h: number, rand: Rand) => void> = {
  tree_round: paintRound,
  tree_araucaria: paintAraucaria,
  tree_conifer: paintConifer,
  tree_palm: paintPalm,
  bush_round: paintBushRound,
  bush_flower: paintBushFlower,
  grass_tuft: paintGrass,
};

/** Sombreamento de volume sobre o que já foi desenhado: escurece a base e clareia o topo. */
function shadeVolume(c: C, w: number, h: number, kind: 'tree' | 'shrub' | 'grass') {
  c.save();
  c.globalCompositeOperation = 'source-atop';
  const g = c.createLinearGradient(0, 0, 0, h);
  if (kind === 'tree') {
    g.addColorStop(0, 'rgba(255,245,200,0.07)');
    g.addColorStop(0.55, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(8,16,4,0.3)');
  } else {
    g.addColorStop(0, 'rgba(255,245,200,0.06)');
    g.addColorStop(1, 'rgba(8,16,4,0.38)');
  }
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  c.restore();
}

// ---------------------------------------------------------------------------
// Textura
// ---------------------------------------------------------------------------

const cache = new Map<string, THREE.DataTexture>();

/**
 * Textura RGBA do sprite (memorizada por sprite e escala). `scale` 1 = tamanho cheio (Alta), 0,5 = metade (Leve).
 * Sem DOM devolve undefined.
 */
export function getSpriteTexture(id: SpriteId, scale: 1 | 0.5 = 1): THREE.DataTexture | undefined {
  if (typeof document === 'undefined') return undefined;
  const key = `${id}@${scale}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const info = SPRITES[id];
  const [rw, rh] = info.canvas;
  const w = Math.round(rw * scale), h = Math.round(rh * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return undefined;
  ctx.scale(scale, scale);
  PAINTERS[id](ctx, rw, rh, rng(`sprite-${id}`));
  shadeVolume(ctx, rw, rh, info.kind);
  const src = ctx.getImageData(0, 0, w, h).data;
  // cor média da planta nos pixels transparentes (mipmap sem halo) e linhas invertidas (DataTexture não tem flipY)
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < src.length; i += 4) {
    if (src[i + 3]! > 200) {
      r += src[i]!;
      g += src[i + 1]!;
      b += src[i + 2]!;
      n++;
    }
  }
  const avg = n > 0 ? [r / n, g / n, b / n] : [60, 90, 40];
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      const di = ((h - 1 - y) * w + x) * 4;
      const a = src[si + 3]!;
      if (a < 24) {
        data[di] = avg[0]!;
        data[di + 1] = avg[1]!;
        data[di + 2] = avg[2]!;
        data[di + 3] = 0;
      } else {
        data[di] = src[si]!;
        data[di + 1] = src[si + 1]!;
        data[di + 2] = src[si + 2]!;
        data[di + 3] = a;
      }
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}

/** Descarta as texturas de sprite (ao sair da apresentação). */
export function disposeSpriteTextures(): void {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
