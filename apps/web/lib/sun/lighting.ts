/**
 * Luz do sol conforme a elevação (modo apresentação). Puro, sem three.
 * Cores em hex; a cena converte. Valores calibrados para o tone mapping ACES do modo apresentação.
 */

export interface SunLight {
  /** Cor da luz direta do sol. */
  color: string;
  /** Intensidade da DirectionalLight (0 com o sol abaixo do horizonte). */
  sun: number;
  /** Intensidade do hemisfério (luz do céu). */
  hemi: number;
  /** Cor do céu e do chão do hemisfério. */
  sky: string;
  ground: string;
  /** Intensidade do ambiente (Environment). */
  env: number;
  /** Intensidade da luz da lua (azulada), só à noite. */
  moon: number;
  /** 0 = noite, 1 = dia pleno. */
  daylight: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function mixHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const k = clamp01(t);
  const c = ca.map((v, i) => Math.round(v + (cb[i]! - v) * k));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function sunLight(elevationDeg: number): SunLight {
  const e = elevationDeg;
  // alaranjado no horizonte, branco quente ao meio-dia
  const warm = mixHex('#ff7a2e', '#ffd2a1', smooth(-1, 8, e));
  const color = mixHex(warm, '#fff7ec', smooth(8, 40, e));
  const daylight = smooth(-6, 14, e);
  const sunFade = smooth(-1.5, 9, e);
  return {
    color,
    sun: 3.4 * sunFade,
    hemi: 0.25 + 0.4 * daylight,
    sky: mixHex('#3a4a7a', '#cfe3fb', daylight),
    ground: mixHex('#2a2e3a', '#b0ac96', daylight),
    env: 0.12 + 0.4 * daylight,
    moon: 0.7 * (1 - smooth(-8, 1, e)),
    daylight,
  };
}

/** Elevação mínima usada para posicionar a luz direcional (evita frustum de sombra gigante). */
export const MIN_SHADOW_ELEVATION = 3;
