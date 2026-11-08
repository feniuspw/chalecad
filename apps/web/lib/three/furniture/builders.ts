/**
 * Um construtor por `FurnitureModelKind`: desenha o móvel em código, com proporções reais, cantos arredondados e
 * detalhes (almofadas, puxadores, frisos, cuba, bocas do fogão...). O resultado cabe na caixa `size` do catálogo
 * (a mesma que o motor usa para o contorno), então móveis de tamanhos diferentes reaproveitam o mesmo construtor.
 * Referencial: ver `kit.ts`. Puro, sem WebGL.
 */
import type { FurnitureModelKind } from '@chalecad/catalog';
import * as THREE from 'three';
import { Kit, placeM, type Part, type Size, type Token } from './kit';

type Build = (k: Kit, s: Size) => void;

/** Sorteio determinístico (LCG): o mesmo móvel sai sempre igual. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Pé fino e cônico de madeira. */
function leg(k: Kit, x: number, y: number, h: number, r = 0.022, token: Token = 'wood') {
  k.cyl(token, x, y, 0, r * 0.7, r, h, 12);
}

function legs4(k: Kit, hw: number, hd: number, inset: number, h: number, r?: number, token?: Token) {
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) leg(k, sx * (hw - inset), sy * (hd - inset), h, r, token);
}

/**
 * Cadeira de jantar: assento acolchoado, encosto e pés. Frente voltada para +y (o encosto fica em −y local).
 * Cabe em `size` x `size`; `backH` limita a altura do encosto.
 */
function chair(k: Kit, x: number, y: number, rotZDeg: number, size = 0.42, backH = 0.88, seatZ = 0.45) {
  k.with(placeM(x, y, 0, rotZDeg), () => {
    const hs = size / 2;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) k.cyl('wood', sx * (hs - 0.035), sy * (hs - 0.035), 0, 0.014, 0.018, seatZ - 0.03, 10);
    }
    k.box('cushion', 0, 0, seatZ - 0.035, size, size, 0.055, 0.02);
    // encosto: duas hastes e uma travessa larga
    const bw = size - 0.04;
    k.box('wood', 0, -hs + 0.02, seatZ + 0.02, bw, 0.03, backH - seatZ - 0.02, 0.012);
    k.box('cushion', 0, -hs + 0.045, seatZ + 0.1, bw - 0.06, 0.03, Math.max(0.1, backH - seatZ - 0.2), 0.012);
  });
}

// ---------------------------------------------------------------------------
// Estofados
// ---------------------------------------------------------------------------

function upholstery(k: Kit, { w, d, h }: Size, seats: number, armW: number) {
  const hw = w / 2;
  const hd = d / 2;
  const footH = Math.min(0.12, h * 0.15);
  const backD = Math.min(0.24, d * 0.28);
  const seatTop = footH + 0.2 + 0.14; // base + almofada
  legs4(k, hw, hd, 0.08, footH + 0.01, 0.02);
  // base e braços
  k.box('fabric', 0, 0, footH, w - 2 * armW + 0.02, d, 0.2, 0.04);
  const armH = Math.min(h * 0.74, seatTop + 0.16 - 0);
  for (const s of [-1, 1]) k.box('fabric', s * (hw - armW / 2), 0, footH, armW, d, armH - footH, Math.min(0.07, armW / 2.2));
  // encosto
  k.box('fabric', 0, hd - backD / 2, footH, w - 2 * armW + 0.02, backD, h - footH, 0.08);
  // almofadas do assento
  const innerW = w - 2 * armW;
  const seatD = d - backD + 0.02;
  const gap = 0.012;
  const sw = (innerW - gap * (seats - 1)) / seats;
  for (let i = 0; i < seats; i++) {
    const cx = -innerW / 2 + sw / 2 + i * (sw + gap);
    k.box('fabric', cx, -hd + seatD / 2, footH + 0.2, sw, seatD, 0.14, 0.055);
    // almofada do encosto, levemente inclinada
    const bh = h - seatTop - 0.1;
    k.tilted('fabric', cx, hd - backD - 0.07, seatTop + bh / 2 + 0.01, sw - 0.02, 0.15, bh, -9, 0.06);
  }
  // almofadas de enfeite nos cantos
  if (w > 1.2) {
    for (const s of [-1, 1]) k.tilted('cushion', s * (innerW / 2 - 0.2), hd - backD - 0.17, seatTop + 0.19, 0.38, 0.12, 0.36, -22, 0.05);
  }
}

const sofa: Build = (k, s) => upholstery(k, s, s.w > 1.9 ? 3 : 2, 0.16);
const armchair: Build = (k, s) => upholstery(k, s, 1, 0.13);

// ---------------------------------------------------------------------------
// Mesas
// ---------------------------------------------------------------------------

const coffee_table: Build = (k, { w, d, h }) => {
  const hw = w / 2;
  const hd = d / 2;
  k.box('wood', 0, 0, h - 0.04, w, d, 0.04, 0.02);
  k.box('wood', 0, 0, 0.1, w - 0.14, d - 0.14, 0.025, 0.01);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) k.box('wood', sx * (hw - 0.05), sy * (hd - 0.05), 0, 0.04, 0.04, h - 0.04, 0.012);
  // livros e vaso sobre o tampo
  k.box('book1', -hw * 0.3, 0, h, 0.24, 0.17, 0.025, 0.004);
  k.box('book2', -hw * 0.3, 0, h + 0.025, 0.2, 0.15, 0.02, 0.004);
  k.cyl('white', hw * 0.35, 0.02, h, 0.045, 0.06, 0.05, 16);
};

const dining: Build = (k, { w, d, h }) => {
  const hw = w / 2;
  const t = 0.04;
  const td = d - 2 * t; // as costas das cadeiras avançam 4 cm de cada lado
  k.box('wood', 0, 0, h - 0.04, w, td, 0.04, 0.015);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) leg(k, sx * (hw - 0.08), sy * (td / 2 - 0.08), h - 0.04, 0.032);
  const per = w > 1.5 ? 3 : 2;
  for (let i = 0; i < per; i++) {
    const x = -hw + (w * (i + 0.5)) / per;
    chair(k, x, -d / 2 + 0.21, 0, 0.42, h + 0.03);
    chair(k, x, d / 2 - 0.21, 180, 0.42, h + 0.03);
    // pratos
    k.cyl('white', x, -td / 2 + 0.2, h, 0.1, 0.1, 0.012, 20);
    k.cyl('white', x, td / 2 - 0.2, h, 0.1, 0.1, 0.012, 20);
  }
};

const round_table: Build = (k, { w, d, h }) => {
  const R = Math.min(w, d) / 2 - 0.04;
  k.cyl('wood', 0, 0, h - 0.04, R, R, 0.04, 40);
  k.cyl('wood', 0, 0, 0.03, 0.045, 0.06, h - 0.07, 16);
  k.cyl('wood', 0, 0, 0, 0.2, 0.22, 0.03, 28);
  const cs = Math.min(0.4, R * 0.9);
  const dist = Math.min(w, d) / 2 - cs / 2;
  [0, 90, 180, 270].forEach((a, i) => {
    const rad = (a * Math.PI) / 180;
    // a cadeira olha para o centro: o encosto (em −y local) fica para fora
    chair(k, dist * Math.sin(rad), -dist * Math.cos(rad), a, cs, h + 0.03, 0.43 + (i % 2) * 0.004);
  });
  k.cyl('white', 0, 0, h, 0.12, 0.12, 0.01, 24);
};

const desk: Build = (k, { w, d, h }) => {
  const hw = w / 2;
  const hd = d / 2;
  k.box('wood', 0, 0, h - 0.035, w, d, 0.035, 0.012);
  // lateral esquerda (painel) e gaveteiro à direita
  k.box('wood', -hw + 0.02, 0, 0, 0.03, d - 0.04, h - 0.035, 0.008);
  const dw = 0.42;
  k.box('body', hw - dw / 2 - 0.01, 0.01, 0.05, dw, d - 0.06, h - 0.085, 0.012);
  k.box('dark', hw - dw / 2 - 0.01, 0.01, 0, dw - 0.04, d - 0.1, 0.05, 0.005);
  for (let i = 0; i < 3; i++) {
    const z = 0.08 + i * 0.2;
    k.box('wood', hw - dw / 2 - 0.01, -hd + 0.03, z, dw - 0.04, 0.012, 0.17, 0.006);
    k.box('brass', hw - dw / 2 - 0.01, -hd + 0.022, z + 0.13, 0.12, 0.012, 0.012, 0.004);
  }
  // cadeira parcialmente embaixo da mesa
  chair(k, -w * 0.12, -hd + 0.21, 0, 0.42, h + 0.03, 0.45);
  // notebook
  k.box('dark', -w * 0.12, 0, h, 0.32, 0.22, 0.012, 0.004);
};

// ---------------------------------------------------------------------------
// Armários
// ---------------------------------------------------------------------------

function doorRow(k: Kit, w: number, front: number, z0: number, zh: number, n: number, token: Token, handle: boolean, handleZ?: number) {
  const gap = 0.004;
  const dw = (w - gap * (n + 1)) / n;
  for (let i = 0; i < n; i++) {
    const cx = -w / 2 + gap + dw / 2 + i * (dw + gap);
    k.box(token, cx, front + 0.01, z0, dw, 0.02, zh, 0.008);
    // friso: filete em relevo
    k.box(token, cx, front - 0.0005, z0 + 0.04, Math.max(0.05, dw - 0.1), 0.006, Math.max(0.05, zh - 0.08), 0.003);
    if (handle) {
      const side = i % 2 === 0 ? 1 : -1;
      const hz = handleZ ?? z0 + zh * 0.5;
      k.box('brass', cx + side * (dw / 2 - 0.035), front - 0.008, hz - 0.1, 0.012, 0.016, 0.2, 0.005);
    }
  }
}

const wardrobe: Build = (k, { w, d, h }) => {
  const hd = d / 2;
  k.box('dark', 0, 0.01, 0, w - 0.04, d - 0.04, 0.07, 0.006);
  k.box('body', 0, 0.01, 0.07, w, d - 0.02, h - 0.07, 0.014);
  const n = Math.max(2, Math.round(w / 0.6));
  doorRow(k, w - 0.01, -hd, 0.085, h - 0.12, n, 'wood', true, h * 0.5);
  // cimalha
  k.box('body', 0, 0, h - 0.025, w + 0.02, d, 0.025, 0.01);
};

const rack: Build = (k, { w, d, h }) => {
  const hd = d / 2;
  const legH = 0.1;
  legs4(k, w / 2, hd, 0.07, legH + 0.01, 0.018);
  k.box('body', 0, 0, legH, w, d, h - legH - 0.03, 0.012);
  k.box('wood', 0, 0, h - 0.03, w + 0.01, d + 0.005, 0.03, 0.012);
  const zh = h - legH - 0.05;
  // módulos: nicho aberto no centro e portas dos lados
  const side = w * 0.3;
  for (const s of [-1, 1]) {
    k.box('wood', s * (w / 2 - side / 2 - 0.01), -hd + 0.01, legH + 0.01, side - 0.01, 0.02, zh, 0.008);
    k.box('brass', s * (w / 2 - side - 0.005), -hd - 0.004, legH + zh * 0.55, 0.012, 0.014, 0.12, 0.004);
  }
  k.box('dark', 0, -hd * 0.1, legH + 0.015, w - 2 * side - 0.04, d * 0.8, zh - 0.02, 0.004);
  k.box('body', 0, -hd * 0.1, legH + zh * 0.5, w - 2 * side - 0.04, d * 0.8, 0.015, 0.003);
};

const shelf: Build = (k, { w, d, h }) => {
  const hw = w / 2;
  const hd = d / 2;
  const t = 0.025;
  for (const s of [-1, 1]) k.box('wood', s * (hw - t / 2), 0, 0, t, d, h, 0.006);
  k.box('body', 0, hd - 0.01, 0.0, w - 2 * t, 0.012, h, 0.002);
  const rows = 5;
  const rand = rng(7);
  const bookTokens: Token[] = ['book1', 'book2', 'book3', 'cushion', 'dark'];
  for (let r = 0; r <= rows; r++) {
    const z = r === 0 ? 0.06 : r === rows ? h - t : 0.06 + ((h - 0.06 - t) * r) / rows;
    k.box('wood', 0, 0, z, w - 2 * t + 0.002, d, t, 0.004);
    if (r === rows || r === 0) continue;
    // livros e objetos sobre a prateleira
    let x = -hw + t + 0.04;
    const gapZ = (h - 0.06 - t) / rows - t;
    while (x < hw - t - 0.08) {
      const bw = 0.025 + rand() * 0.03;
      const bh = Math.min(gapZ - 0.03, 0.18 + rand() * 0.13);
      if (rand() < 0.14) {
        x += 0.1 + rand() * 0.1; // vão
        continue;
      }
      k.box(bookTokens[Math.floor(rand() * bookTokens.length)]!, x + bw / 2, 0, z + t, bw, d - 0.1, bh, 0.003);
      x += bw + 0.002;
    }
  }
  k.box('dark', 0, 0, 0, w - 2 * t, d - 0.04, 0.06, 0.004);
};

const nightstand: Build = (k, { w, d, h }) => {
  const hd = d / 2;
  const legH = 0.12;
  legs4(k, w / 2, hd, 0.04, legH + 0.01, 0.014);
  k.box('body', 0, 0, legH, w - 0.02, d - 0.02, h - legH - 0.03, 0.01);
  k.box('wood', 0, 0, h - 0.03, w, d, 0.03, 0.012);
  const zh = (h - legH - 0.05) / 2 - 0.006;
  for (let i = 0; i < 2; i++) {
    const z = legH + 0.01 + i * (zh + 0.008);
    k.box('wood', 0, -hd + 0.006, z, w - 0.045, 0.014, zh, 0.006);
    k.sphere('brass', 0, -hd - 0.003, z + zh / 2, 0.012, 0.012, 0.012, 8);
  }
};

// ---------------------------------------------------------------------------
// Cozinha
// ---------------------------------------------------------------------------

function cabinet(k: Kit, { w, d, h }: Size, top: number, doorsN: number) {
  const hd = d / 2;
  k.box('dark', 0, 0.02, 0, w - 0.04, d - 0.08, 0.1, 0.004);
  k.box('body', 0, 0.01, 0.1, w, d - 0.02, h - top - 0.1, 0.01);
  doorRow(k, w - 0.006, -hd, 0.105, h - top - 0.11, doorsN, 'body', false);
  for (let i = 0; i < doorsN; i++) {
    const gap = 0.004;
    const dw = (w - 0.006 - gap * (doorsN + 1)) / doorsN;
    const cx = -(w - 0.006) / 2 + gap + dw / 2 + i * (dw + gap);
    k.box('steel', cx, -hd - 0.008, h - top - 0.06, Math.min(0.2, dw * 0.5), 0.014, 0.014, 0.005);
  }
}

const counter: Build = (k, s) => {
  const n = Math.max(1, Math.round(s.w / 0.5));
  cabinet(k, s, 0.04, n);
  k.box('stone', 0, 0, s.h - 0.04, s.w, s.d, 0.04, 0.008);
};

const counter_sink: Build = (k, s) => {
  const { w, d, h } = s;
  const n = Math.max(2, Math.round(w / 0.5));
  const top = 0.045;
  cabinet(k, s, top, n);
  k.box('stone', 0, 0, h - top, w, d, top - 0.005, 0.008);
  // cuba de inox embutida e torneira baixa
  const cx = -w * 0.18;
  const cw = Math.min(0.55, w * 0.34);
  k.box('steel', cx, 0, h - 0.0065, cw, d * 0.7, 0.0065, 0.01);
  k.box('dark', cx, 0, h - 0.0045, cw - 0.06, d * 0.7 - 0.06, 0.0075, 0.012);
  k.cyl('steel', cx, d / 2 - 0.07, h - 0.0065, 0.014, 0.016, 0.045, 12);
  k.box('steel', cx, d / 2 - 0.12, h + 0.0, 0.016, 0.1, 0.012, 0.006);
  // escorredor ao lado
  for (let i = 0; i < 6; i++) k.box('steel', cx + cw / 2 + 0.13 + i * 0.0, -d * 0.3 + i * 0.09, h - 0.0065, 0.3, 0.012, 0.0072, 0.002);
};

const stove: Build = (k, { w, d, h }) => {
  const hw = w / 2;
  const hd = d / 2;
  k.box('steel', 0, 0.01, 0, w, d - 0.02, h - 0.03, 0.018);
  k.box('black', 0, 0.005, h - 0.03, w, d - 0.01, 0.03, 0.01);
  // bocas e grelhas
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const x = sx * hw * 0.46;
      const y = sy * hd * 0.3 + 0.03;
      const r = sy < 0 ? 0.052 : 0.04;
      k.cyl('steel', x, y, h - 0.002, r + 0.01, r + 0.012, 0.012, 20);
      k.cyl('black', x, y, h + 0.008, r - 0.012, r - 0.012, 0.012, 16);
    }
  }
  k.box('black', 0, 0.03, h + 0.0, w - 0.06, 0.012, 0.012, 0.002);
  k.box('black', 0, 0.03, h + 0.0, 0.012, d - 0.12, 0.012, 0.002);
  // painel de controle: botões e porta do forno com visor
  for (let i = 0; i < 5; i++) k.cylY('dark', -hw * 0.72 + (i * hw * 1.44) / 4, -hd - 0.003, h - 0.1, 0.017, 0.022, 12);
  k.box('steel', 0, -hd + 0.01, 0.07, w - 0.03, 0.022, h - 0.28, 0.01);
  k.box('black', 0, -hd - 0.0005, 0.2, w - 0.16, 0.006, h - 0.5, 0.01);
  k.cylX('steel', 0, -hd - 0.012, h - 0.2, 0.011, w - 0.1, 12);
};

const fridge: Build = (k, { w, d, h }) => {
  const hw = w / 2;
  const front = 0.04;
  k.box('dark', 0, 0, 0, w - 0.06, d - 0.06, 0.05, 0.004);
  k.box('white', 0, front / 2, 0.04, w, d - front, h - 0.04, 0.02);
  // duas portas: congelador em cima, refrigerador embaixo
  const zFreeze = h * 0.66;
  k.box('steel', 0, -d / 2 + front / 2, 0.045, w - 0.006, front, zFreeze - 0.05, 0.022);
  k.box('steel', 0, -d / 2 + front / 2, zFreeze + 0.004, w - 0.006, front, h - zFreeze - 0.006, 0.022);
  const hx = hw - 0.055;
  k.box('dark', hx, -d / 2 - 0.012, zFreeze - 0.35, 0.022, 0.03, 0.32, 0.008);
  k.box('dark', hx, -d / 2 - 0.012, zFreeze + 0.04, 0.022, 0.03, 0.26, 0.008);
};

const island: Build = (k, { w, d, h }) => {
  const hd = d / 2;
  k.box('dark', 0, 0, 0, w - 0.12, d - 0.2, 0.1, 0.004);
  k.box('body', 0, 0, 0.1, w - 0.1, d - 0.12, h - 0.14, 0.012);
  const n = Math.max(2, Math.round(w / 0.45));
  const gap = 0.006;
  const dw = (w - 0.12 - gap * (n + 1)) / n;
  for (let i = 0; i < n; i++) {
    const cx = -(w - 0.12) / 2 + gap + dw / 2 + i * (dw + gap);
    k.box('wood', cx, -hd + 0.07, 0.115, dw, 0.016, h - 0.18, 0.006);
    k.box('steel', cx, -hd + 0.058, h - 0.1, Math.min(0.2, dw * 0.5), 0.012, 0.012, 0.004);
    k.box('wood', cx, hd - 0.07, 0.115, dw, 0.016, h - 0.18, 0.006);
  }
  k.box('stone', 0, 0, h - 0.04, w, d, 0.04, 0.01);
};

// ---------------------------------------------------------------------------
// Banheiro e lavanderia
// ---------------------------------------------------------------------------

const toilet: Build = (k, { w, d, h }) => {
  const hw = w / 2;
  const hd = d / 2;
  const tankD = 0.2;
  // caixa acoplada e tampa
  k.box('white', 0, hd - tankD / 2, 0.32, w * 0.94, tankD, h - 0.32 - 0.025, 0.035);
  k.box('white', 0, hd - tankD / 2, h - 0.025, w * 0.98, tankD + 0.015, 0.025, 0.01);
  k.cyl('steel', 0, hd - tankD / 2, h - 0.012, 0.022, 0.022, 0.012, 16);
  // pedestal e bacia
  k.cyl('white', 0, hd - 0.17, 0, 0.1, 0.13, 0.3, 20);
  const cy = -hd + 0.3;
  k.sphere('white', 0, cy, 0.28, hw * 0.9, 0.3, 0.17, 20);
  // assento e abertura
  k.sphere('white', 0, cy + 0.0, 0.43, hw, 0.3, 0.018, 24);
  k.sphere('dark', 0, cy - 0.02, 0.445, hw * 0.56, 0.2, 0.006, 20);
  k.box('white', 0, hd - tankD - 0.03, 0.4, w * 0.5, 0.05, 0.04, 0.012);
};

const basin: Build = (k, { w, d, h }) => {
  const hd = d / 2;
  const topZ = h - 0.1;
  k.box('dark', 0, 0.01, 0, w - 0.06, d - 0.06, 0.07, 0.004);
  k.box('body', 0, 0, 0.07, w - 0.02, d - 0.01, topZ - 0.07 - 0.03, 0.012);
  k.box('white', 0, 0, topZ - 0.03, w, d, 0.03, 0.012);
  const dw = (w - 0.03) / 2;
  for (const s of [-1, 1]) {
    k.box('wood', s * (dw / 2 + 0.002), -hd + 0.006, 0.08, dw - 0.004, 0.016, topZ - 0.14, 0.006);
    k.box('steel', s * 0.03, -hd - 0.006, topZ - 0.08, 0.012, 0.014, 0.09, 0.004);
  }
  // cuba de apoio e torneira
  k.sphere('white', 0, -0.02, topZ + 0.008, w * 0.36, d * 0.36, 0.085, 24);
  k.sphere('dark', 0, -0.02, topZ + 0.06, w * 0.26, d * 0.26, 0.012, 20);
  k.cyl('steel', 0, hd - 0.05, topZ, 0.012, 0.014, h - topZ, 12);
  k.box('steel', 0, hd - 0.1, h - 0.02, 0.016, 0.1, 0.014, 0.006);
};

const shower: Build = (k, { w, d, h }) => {
  const hw = w / 2;
  const hd = d / 2;
  k.box('white', 0, 0, 0, w, d, 0.06, 0.01);
  k.cyl('dark', 0, 0, 0.058, 0.05, 0.05, 0.004, 20);
  // vidro: frente (−y) e lado direito (+x); parede de fundo e lado esquerdo ficam livres
  const gz = 0.06;
  k.box('glass', 0, -hd + 0.006, gz, w - 0.03, 0.008, h - gz - 0.04, 0.002);
  k.box('glass', hw - 0.006, 0.0, gz, 0.008, d - 0.03, h - gz - 0.04, 0.002);
  // perfis de inox
  k.box('steel', 0, -hd + 0.01, h - 0.04, w, 0.025, 0.04, 0.006);
  k.box('steel', hw - 0.01, 0, h - 0.04, 0.025, d, 0.04, 0.006);
  k.box('steel', 0, -hd + 0.01, gz, w, 0.025, 0.02, 0.005);
  k.box('steel', hw - 0.01, 0, gz, 0.025, d, 0.02, 0.005);
  k.box('steel', hw - 0.01, -hd + 0.01, gz, 0.03, 0.03, h - gz, 0.008);
  k.box('steel', -hw + 0.012, -hd + 0.01, gz, 0.025, 0.03, h - gz, 0.008);
  // puxador
  k.box('steel', -w * 0.18, -hd - 0.012, 1.0, 0.016, 0.02, 0.4, 0.006);
  // chuveiro: tubo na parede, braço e ducha
  const px = -hw + 0.22;
  k.cyl('steel', px, hd - 0.03, 0.9, 0.012, 0.012, h - 0.9 - 0.02, 12);
  k.box('steel', px, hd - 0.12, h - 0.045, 0.02, 0.2, 0.02, 0.008);
  k.cyl('steel', px, hd - 0.24, h - 0.062, 0.1, 0.1, 0.018, 24);
  k.cylY('steel', px - 0.0, hd - 0.03, 1.15, 0.03, 0.04, 12);
};

const bathtub: Build = (k, { w, d, h }) => {
  const hw = w / 2;
  const hd = d / 2;
  const t = 0.09;
  // paredes da banheira (o oco aparece entre elas) e fundo
  k.box('white', 0, -hd + t / 2, 0.04, w, t, h - 0.04, 0.04);
  k.box('white', 0, hd - t / 2, 0.04, w, t, h - 0.04, 0.04);
  for (const s of [-1, 1]) k.box('white', s * (hw - t / 2), 0, 0.04, t, d, h - 0.04, 0.04);
  k.box('white', 0, 0, 0.04, w - 0.1, d - 0.1, 0.16, 0.05);
  k.box('dark', 0, 0, 0, w - 0.3, d - 0.2, 0.05, 0.01);
  k.cyl('steel', -hw + 0.28, 0, 0.2, 0.028, 0.028, 0.004, 16);
  // torneira baixa no lado esquerdo, junto à parede de fundo
  k.cyl('steel', -hw + 0.04, hd - t / 2, h - 0.002, 0.016, 0.018, 0.045, 12);
  k.box('steel', -hw + 0.12, hd - t / 2, h + 0.03, 0.14, 0.02, 0.014, 0.006);
};

const washer: Build = (k, { w, d, h }) => {
  const hw = w / 2;
  const hd = d / 2;
  k.box('white', 0, 0.01, 0, w, d - 0.02, h, 0.03);
  k.box('steel', 0, -hd + 0.004, h - 0.15, w - 0.04, 0.008, 0.13, 0.01);
  k.box('dark', -hw * 0.3, -hd - 0.0, h - 0.115, w * 0.3, 0.01, 0.045, 0.006);
  k.cylY('steel', hw * 0.45, -hd - 0.006, h - 0.085, 0.028, 0.026, 20);
  k.cylY('steel', hw * 0.1, -hd - 0.004, h - 0.085, 0.012, 0.022, 12);
  // porta redonda: anel de inox, vidro escuro e reflexo
  const cz = h * 0.43;
  k.ringY('steel', 0, -hd + 0.003, cz, 0.215, 0.024);
  k.cylY('dark', 0, -hd + 0.002, cz, 0.2, 0.012, 32);
  k.cylY('glass', 0, -hd - 0.003, cz, 0.18, 0.008, 32);
  k.cylY('white', 0, -hd + 0.0, cz, 0.08, 0.016, 24);
};

const tank: Build = (k, { w, d, h }) => {
  const hw = w / 2;
  const basinW = w * 0.62;
  const bx = -hw + basinW / 2;
  const t = 0.05;
  // coluna e cuba funda
  k.box('white', bx, 0, 0, basinW - 0.1, d - 0.1, 0.42, 0.02);
  k.box('white', bx, -d / 2 + t / 2, 0.4, basinW, t, h - 0.4, 0.02);
  k.box('white', bx, d / 2 - t / 2, 0.4, basinW, t, h - 0.4, 0.02);
  for (const s of [-1, 1]) k.box('white', bx + s * (basinW / 2 - t / 2), 0, 0.4, t, d, h - 0.4, 0.02);
  k.box('white', bx, 0, 0.4, basinW - 0.06, d - 0.06, 0.1, 0.03);
  k.cyl('steel', bx, 0, 0.5, 0.024, 0.024, 0.004, 16);
  // tábua de lavar ao lado, inclinada, com sulcos
  const tx = hw - (w - basinW) / 2 + 0.005;
  const tw = w - basinW - 0.01;
  k.box('white', tx, 0, 0, 0.05, d - 0.08, h - 0.2, 0.012);
  k.tilted('white', tx, -0.03, h - 0.085, tw, d - 0.05, 0.05, 24, 0.02);
  for (let i = 0; i < 5; i++) k.tilted('white', tx, -0.12 + i * 0.07, h - 0.058, tw - 0.04, 0.014, 0.014, 24, 0.005);
  // torneira baixa
  k.cyl('steel', bx, d / 2 - 0.1, h - 0.002, 0.016, 0.018, 0.04, 12);
  k.box('steel', bx, d / 2 - 0.16, h + 0.018, 0.02, 0.1, 0.014, 0.006);
};

// ---------------------------------------------------------------------------
// Quarto
// ---------------------------------------------------------------------------

function bedBase(k: Kit, w: number, d: number, h: number, pillows: number, bunkZ = 0) {
  const hd = d / 2;
  const hw = w / 2;
  const frameTop = bunkZ + 0.28;
  // estrado de madeira e colchão
  k.box('wood', 0, 0, bunkZ + 0.1, w, d, 0.18, 0.02);
  const mattH = Math.max(0.12, h - frameTop - 0.115);
  k.box('linen', 0, -0.03, frameTop, w - 0.04, d - 0.1, mattH, 0.05);
  const top = frameTop + mattH;
  // travesseiros
  const pw = Math.min(0.62, (w - 0.14 - 0.06 * (pillows - 1)) / pillows);
  for (let i = 0; i < pillows; i++) {
    const cx = (i - (pillows - 1) / 2) * (pw + 0.06);
    k.tilted('white', cx, hd - 0.27, top + 0.045, pw, 0.34, 0.1, -6, 0.05);
  }
  // manta dobrada nos pés + colcha
  k.box('blanket', 0, -hd + 0.42, top, w - 0.0, 0.7, 0.025, 0.012);
  k.box('blanket', 0, -hd + 0.82, top, w - 0.03, 0.2, 0.04, 0.02);
  for (const s of [-1, 1]) k.box('blanket', s * (hw - 0.006), -hd + 0.42, top - mattH * 0.55, 0.012, 0.7, mattH * 0.55 + 0.025, 0.005);
  void hw;
}

const bed: Build = (k, { w, d, h }) => {
  const hw = w / 2;
  const hd = d / 2;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) k.box('dark', sx * (hw - 0.07), sy * (hd - 0.07), 0, 0.05, 0.05, 0.11, 0.01);
  bedBase(k, w, d, h, w > 1.2 ? 2 : 1);
  // cabeceira estofada de madeira, na altura do catálogo
  k.box('wood', 0, hd - 0.035, 0.06, w + 0.0, 0.07, h - 0.06, 0.025);
  k.box('cushion', 0, hd - 0.075, 0.3, w - 0.16, 0.03, h - 0.3 - 0.06, 0.02);
};

const bunk: Build = (k, { w, d, h }) => {
  const hw = w / 2;
  const hd = d / 2;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) k.box('wood', sx * (hw - 0.03), sy * (hd - 0.03), 0, 0.06, 0.06, h, 0.012);
  const hLow = 0.7;
  bedBase(k, w - 0.04, d - 0.04, hLow + 0.2, 1, 0);
  // beliche de cima, com grade de proteção
  const z = 0.95;
  k.box('wood', 0, 0, z, w - 0.06, d - 0.06, 0.06, 0.012);
  k.box('linen', 0, -0.03, z + 0.06, w - 0.1, d - 0.16, 0.14, 0.05);
  k.tilted('white', 0, hd - 0.3, z + 0.23, 0.55, 0.34, 0.1, -6, 0.05);
  k.box('wood', hw - 0.03, 0, z + 0.2, 0.025, d * 0.75, 0.3, 0.008);
  k.box('wood', -hw + 0.03, 0, z + 0.2, 0.025, d * 0.75, 0.3, 0.008);
  // escada nos pés
  for (const s of [-1, 1]) k.box('wood', s * 0.17, -hd + 0.03, 0.1, 0.035, 0.035, z + 0.35, 0.008);
  for (let i = 0; i < 5; i++) k.box('wood', 0, -hd + 0.03, 0.25 + i * 0.22, 0.34, 0.03, 0.03, 0.008);
};

// ---------------------------------------------------------------------------
// Externo e decoração
// ---------------------------------------------------------------------------

const lounger: Build = (k, { w, d }) => {
  const hw = w / 2;
  const hd = d / 2;
  // estrutura de madeira, pés e rodinhas
  for (const s of [-1, 1]) {
    k.box('wood', s * (hw - 0.03), 0, 0.12, 0.05, d, 0.05, 0.015);
    for (const y of [-hd + 0.1, hd - 0.1]) k.box('wood', s * (hw - 0.03), y, 0, 0.05, 0.05, 0.13, 0.01);
  }
  const seatD = d - 0.65;
  k.box('fabric', 0, -hd + seatD / 2, 0.15, w - 0.14, seatD, 0.065, 0.03);
  // encosto inclinado
  const bl = 0.66;
  const tilt = 14;
  k.tilted('fabric', 0, hd - bl / 2 * Math.cos((tilt * Math.PI) / 180) + 0.0, 0.2 + (bl / 2) * Math.sin((tilt * Math.PI) / 180), w - 0.14, bl, 0.065, tilt, 0.03);
  k.tilted('cushion', 0, hd - 0.17, 0.14 + 0.12 + 0.05, 0.4, 0.22, 0.07, tilt, 0.03);
};

const plant: Build = (k, { w, d, h }) => {
  const rMax = Math.min(w, d) / 2;
  const potH = Math.min(0.34, h * 0.3);
  k.cyl('pot', 0, 0, 0, rMax * 0.86, rMax * 0.6, potH, 28);
  k.cyl('pot', 0, 0, potH - 0.045, rMax * 0.94, rMax * 0.9, 0.035, 28);
  k.cyl('soil', 0, 0, potH - 0.02, rMax * 0.8, rMax * 0.8, 0.022, 20);
  const rand = rng(11);
  const top = h - potH - 0.02;
  // folhas longas e finas, abertas em leque; as pontas ficam dentro da caixa w x d
  const leaves = 22;
  for (let i = 0; i < leaves; i++) {
    const az = (i / leaves) * 360 + rand() * 14;
    const len = top * (0.38 + 0.62 * (i % 5 === 0 ? 1 : rand() * 0.85));
    const lw = 0.03 + rand() * 0.02;
    const base = 0.03 + rand() * 0.03;
    const room = rMax - lw - 0.015 - base;
    const t = Math.min(0.55, Math.asin(Math.min(1, Math.max(0.05, (room * (0.35 + 0.65 * rand())) / len))));
    const m = placeM(0, 0, potH - 0.01, az).multiply(new THREE.Matrix4().makeTranslation(base, 0, 0)).multiply(new THREE.Matrix4().makeRotationY(t));
    k.with(m, () => k.sphere(i % 3 === 0 ? 'leaf2' : 'leaf', 0, 0, len / 2, lw * 0.4, lw, len / 2, 8));
  }
  // folhagem baixa em volta do caule
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const r = rMax * 0.45;
    k.sphere(i % 2 ? 'leaf' : 'leaf2', Math.cos(a) * r, Math.sin(a) * r, potH + 0.08, 0.07, 0.07, 0.11, 8);
  }
};

const rug: Build = (k, { w, d, h }) => {
  k.box('rug', 0, 0, 0, w, d, h, 0.004);
  k.box('rug2', 0, 0, h, w - 0.2, d - 0.2, 0.003, 0.002);
  const stripes = Math.max(2, Math.round(w / 0.4));
  for (let i = 0; i < stripes; i++) {
    const x = -(w - 0.3) / 2 + ((w - 0.3) * (i + 0.5)) / stripes;
    k.box('rug', x, 0, h + 0.003, (w - 0.3) / stripes * 0.45, d - 0.34, 0.002, 0.001);
  }
};

const BUILDERS: Record<FurnitureModelKind, Build> = {
  sofa,
  armchair,
  coffee_table,
  rack,
  shelf,
  dining,
  round_table,
  bed,
  bunk,
  nightstand,
  wardrobe,
  desk,
  counter,
  counter_sink,
  stove,
  fridge,
  island,
  toilet,
  basin,
  shower,
  bathtub,
  washer,
  tank,
  lounger,
  plant,
  rug,
};

/** Monta o móvel: geometrias por material (token), prontas para virar malhas. */
export function buildFurnitureParts(kind: FurnitureModelKind, size: Size): Part[] {
  const k = new Kit();
  BUILDERS[kind](k, size);
  return k.build();
}
