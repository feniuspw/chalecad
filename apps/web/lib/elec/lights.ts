/**
 * Luz das luminárias no 3D (pesquisa §5.7): em unidades físicas do three.js (r155+) a intensidade é em candela.
 *   PointLight: I = Φ / 4π     SpotLight: I = Φ / π (independe do ângulo)     ângulo do facho = beamAngle / 2
 * Cor pela temperatura (CCT). Puro: sem three.
 */
import type { Catalog } from '@chalecad/catalog';
import type { ElecPoint, Vec2 } from '@chalecad/engine';

type Luminaire = Catalog['constants']['electrical']['luminaires'][number];

export type LightRig = { kind: 'point'; intensity: number; color: string } | { kind: 'spot'; intensity: number; color: string; angle: number; penumbra: number };

/** Tipos que viram SpotLight (facho dirigido); os demais, PointLight. */
export const SPOT_TYPES = new Set<Luminaire['type']>(['spot', 'flood']);

const CCT_ANCHORS: [number, [number, number, number]][] = [
  [1800, [255, 147, 41]],
  [2700, [255, 180, 107]],
  [3000, [255, 193, 132]],
  [4000, [255, 216, 176]],
  [5000, [255, 235, 214]],
  [6500, [255, 255, 255]],
];

const hex = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');

/** Cor (#rrggbb) de uma temperatura de cor (K), interpolada entre âncoras do locus de Planck. */
export function cctToHex(cct: number): string {
  const a = CCT_ANCHORS;
  if (cct <= a[0]![0]) return `#${a[0]![1].map(hex).join('')}`;
  const last = a[a.length - 1]!;
  if (cct >= last[0]) return `#${last[1].map(hex).join('')}`;
  for (let i = 1; i < a.length; i++) {
    const [k1, c1] = a[i]!;
    const [k0, c0] = a[i - 1]!;
    if (cct <= k1) {
      const t = (cct - k0) / (k1 - k0);
      return `#${[0, 1, 2].map((j) => hex(c0[j]! + (c1[j]! - c0[j]!) * t)).join('')}`;
    }
  }
  return '#ffffff';
}

/** Fonte de luz do ponto: fluxo total (lm × quantidade) convertido para candela. */
export function lightRig(lum: Luminaire, count = 1): LightRig {
  const lumens = lum.lumens * count;
  const color = cctToHex(lum.cct);
  if (SPOT_TYPES.has(lum.type)) return { kind: 'spot', intensity: lumens / Math.PI, color, angle: ((lum.beamAngle ?? 60) / 2) * (Math.PI / 180), penumbra: 0.4 };
  return { kind: 'point', intensity: lumens / (4 * Math.PI), color };
}

export interface Fixture {
  id: string;
  level: string;
  position: Vec2;
  /** Altura da caixa a partir do piso do nível (m). */
  height: number;
  hostId?: string;
  luminaire: Luminaire;
  count: number;
}

/** Pontos de luz do traçado com a luminária resolvida (a padrão do catálogo quando ausente ou desconhecida). */
export function fixturesOf(points: ElecPoint[], k: Catalog['constants']['electrical']): Fixture[] {
  const fallback = k.luminaires.find((l) => l.id === k.defaultLuminaire) ?? k.luminaires[0]!;
  return points
    .filter((p) => p.kind === 'light')
    .map((p) => ({ id: p.id, level: p.level, position: p.position as Vec2, height: p.height, ...(p.hostId ? { hostId: p.hostId } : {}), luminaire: k.luminaires.find((l) => l.id === p.luminaire) ?? fallback, count: p.count ?? 1 }));
}

/**
 * As `max` fixtures mais próximas de `from` (3D, motor: x, y, z) ganham luz real; as demais ficam só emissivas.
 * Devolve os ids em ordem de proximidade. Cada tipo de fonte tem o seu limite (`caps`), o total não passa de `max`.
 */
export function nearestFixtures(items: { id: string; pos: [number, number, number]; spot: boolean }[], from: [number, number, number], max: number, spotCap = max): string[] {
  const d = (p: [number, number, number]) => (p[0] - from[0]) ** 2 + (p[1] - from[1]) ** 2 + (p[2] - from[2]) ** 2;
  const sorted = [...items].sort((a, b) => d(a.pos) - d(b.pos));
  const out: string[] = [];
  let spots = 0;
  for (const it of sorted) {
    if (out.length >= max) break;
    if (it.spot) {
      if (spots >= spotCap) continue;
      spots++;
    }
    out.push(it.id);
  }
  return out;
}

type V3 = [number, number, number];

function inPoly(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Cota absoluta (m) da face superior do telhado sobre o ponto da planta (a mais baixa se houver várias águas), ou
 * null se nenhuma água cobre o ponto. Serve para a luminária de teto não atravessar o telhado inclinado.
 */
export function roofZAt(planes: { vertices: V3[] }[], xy: Vec2): number | null {
  let best: number | null = null;
  for (const pl of planes) {
    const v = pl.vertices;
    if (v.length < 3 || !inPoly(xy, v.map((p) => [p[0], p[1]] as Vec2))) continue;
    // plano por três vértices não colineares em planta
    let z: number | null = null;
    for (let i = 1; i + 1 < v.length && z === null; i++) {
      const a = v[0]!;
      const b = v[i]!;
      const c = v[i + 1]!;
      const ux = b[0] - a[0];
      const uy = b[1] - a[1];
      const uz = b[2] - a[2];
      const wx = c[0] - a[0];
      const wy = c[1] - a[1];
      const wz = c[2] - a[2];
      const nz = ux * wy - uy * wx;
      if (Math.abs(nz) < 1e-9) continue;
      const nx = uy * wz - uz * wy;
      const ny = uz * wx - ux * wz;
      z = a[2] - (nx * (xy[0] - a[0]) + ny * (xy[1] - a[1])) / nz;
    }
    if (z !== null && (best === null || z < best)) best = z;
  }
  return best;
}
