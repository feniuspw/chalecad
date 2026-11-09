/**
 * Geometria do lote na planta (puro). Coordenadas do lote: origem no canto da testada à esquerda de quem olha da
 * rua, x ao longo da testada, y para dentro. A edificação (origem do projeto) fica em `buildingOffset`, girada
 * `rotationDeg` anti-horário. A planta desenha em coordenadas do projeto: `toProject` converte.
 */
import type { Lot, Vec2, Zoning } from '@chalecad/engine';

export type Side = 'front' | 'back' | 'left' | 'right';
export const SIDES: readonly Side[] = ['front', 'back', 'left', 'right'];
export const SIDE_LABEL: Record<Side, string> = { front: 'Frente', back: 'Fundos', left: 'Esquerda', right: 'Direita' };

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Ponto do projeto -> coordenadas do lote. */
export function toLot(lot: Pick<Lot, 'buildingOffset' | 'rotationDeg'>, p: Vec2): Vec2 {
  const a = rad(lot.rotationDeg);
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [lot.buildingOffset[0] + c * p[0] - s * p[1], lot.buildingOffset[1] + s * p[0] + c * p[1]];
}

/** Ponto do lote -> coordenadas do projeto. */
export function toProject(lot: Pick<Lot, 'buildingOffset' | 'rotationDeg'>, l: Vec2): Vec2 {
  const a = rad(-lot.rotationDeg);
  const c = Math.cos(a);
  const s = Math.sin(a);
  const dx = l[0] - lot.buildingOffset[0];
  const dy = l[1] - lot.buildingOffset[1];
  return [c * dx - s * dy, s * dx + c * dy];
}

/** Contorno do lote (coordenadas do lote), sem repetir o primeiro ponto. */
export function lotOutline(lot: Pick<Lot, 'front' | 'depth' | 'polygon'>): Vec2[] {
  if (lot.polygon && lot.polygon.length >= 3) return lot.polygon.map((p) => [p[0], p[1]] as Vec2);
  return [[0, 0], [lot.front, 0], [lot.front, lot.depth], [0, lot.depth]];
}

const signedArea = (poly: Vec2[]) => poly.reduce((s, p, i) => {
  const q = poly[(i + 1) % poly.length]!;
  return s + (p[0] * q[1] - q[0] * p[1]);
}, 0) / 2;

export function polygonArea(poly: Vec2[]): number {
  return Math.abs(signedArea(poly));
}

function distPointSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Lado do lote (frente/fundos/esquerda/direita) de cada aresta, pela direção da normal externa. */
function edgeSides(outline: Vec2[]): Side[] {
  const ccw = signedArea(outline) > 0;
  return outline.map((a, i) => {
    const b = outline[(i + 1) % outline.length]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    // normal externa: para a direita da aresta num contorno anti-horário
    const nx = ccw ? dy : -dy;
    const ny = ccw ? -dx : dx;
    if (Math.abs(ny) >= Math.abs(nx)) return ny < 0 ? 'front' : 'back';
    return nx < 0 ? 'left' : 'right';
  });
}

export interface SetbackDim {
  side: Side;
  /** Pontos (coordenadas do lote): ponto da edificação mais próximo e o pé na divisa. */
  from: Vec2;
  to: Vec2;
  /** Distância real (m); negativa quando a edificação passa da divisa. */
  value: number;
}

/**
 * Recuos reais da edificação às quatro divisas. Lote retangular: distância do vértice mais próximo na direção do eixo.
 * Poligonal: menor distância dos vértices às arestas de cada lado (pela normal externa); lado sem aresta usa o
 * retângulo envolvente.
 */
export function setbackDims(lot: Pick<Lot, 'front' | 'depth' | 'polygon' | 'buildingOffset' | 'rotationDeg'>, footprint: Vec2[]): SetbackDim[] {
  const pts = footprint.map((p) => toLot(lot, p));
  if (pts.length === 0) return [];
  const outline = lotOutline(lot);
  const xs = outline.map((p) => p[0]);
  const ys = outline.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const pick = (key: 0 | 1, dir: 1 | -1) =>
    pts.reduce((best, p) => (dir * (p[key] - best[key]) < 0 ? p : best), pts[0]!);
  const base: Record<Side, SetbackDim> = {
    front: { side: 'front', from: pick(1, 1), to: [pick(1, 1)[0], minY], value: pick(1, 1)[1] - minY },
    back: { side: 'back', from: pick(1, -1), to: [pick(1, -1)[0], maxY], value: maxY - pick(1, -1)[1] },
    left: { side: 'left', from: pick(0, 1), to: [minX, pick(0, 1)[1]], value: pick(0, 1)[0] - minX },
    right: { side: 'right', from: pick(0, -1), to: [maxX, pick(0, -1)[1]], value: maxX - pick(0, -1)[0] },
  };

  if (lot.polygon && lot.polygon.length >= 3) {
    const sides = edgeSides(outline);
    for (const side of SIDES) {
      let best: SetbackDim | null = null;
      outline.forEach((a, i) => {
        if (sides[i] !== side) return;
        const b = outline[(i + 1) % outline.length]!;
        for (const p of pts) {
          const d = distPointSegment(p, a, b);
          if (!best || d < best.value) {
            const dx = b[0] - a[0];
            const dy = b[1] - a[1];
            const len2 = dx * dx + dy * dy;
            const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
            best = { side, from: p, to: [a[0] + t * dx, a[1] + t * dy], value: d };
          }
        }
      });
      if (best) base[side] = best;
    }
  }
  return SIDES.map((s) => base[s]);
}

/** Recuo mínimo do zoneamento por lado (laterais usam o mesmo valor). */
export function requiredSetback(zoning: Pick<Zoning, 'setbackFront' | 'setbackSide' | 'setbackBack'>, side: Side): number | undefined {
  return side === 'front' ? zoning.setbackFront : side === 'back' ? zoning.setbackBack : zoning.setbackSide;
}

export interface SetbackBand {
  side: Side;
  /** Retângulo da faixa (coordenadas do lote): [x0, y0, x1, y1]. */
  rect: [number, number, number, number];
  required: number;
  actual: number;
  /** A edificação invade a faixa. */
  invaded: boolean;
}

/** Faixas de recuo mínimo (só para lote retangular; poligonal usa o retângulo envolvente). */
export function setbackBands(lot: Pick<Lot, 'front' | 'depth' | 'polygon' | 'buildingOffset' | 'rotationDeg'>, zoning: Pick<Zoning, 'setbackFront' | 'setbackSide' | 'setbackBack'>, footprint: Vec2[]): SetbackBand[] {
  const outline = lotOutline(lot);
  const xs = outline.map((p) => p[0]);
  const ys = outline.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const dims = setbackDims(lot, footprint);
  const out: SetbackBand[] = [];
  for (const side of SIDES) {
    const req = requiredSetback(zoning, side);
    if (req === undefined || req <= 0) continue;
    const actual = dims.find((d) => d.side === side)?.value ?? Infinity;
    const rect: [number, number, number, number] =
      side === 'front' ? [x0, y0, x1, y0 + req] : side === 'back' ? [x0, y1 - req, x1, y1] : side === 'left' ? [x0, y0, x0 + req, y1] : [x1 - req, y0, x1, y1];
    out.push({ side, rect, required: req, actual, invaded: actual < req - 1e-6 });
  }
  return out;
}

/** Retângulo edificável (lote menos recuos), coordenadas do lote; null se não restar área. */
export function buildableRect(lot: Pick<Lot, 'front' | 'depth' | 'polygon'>, zoning: Pick<Zoning, 'setbackFront' | 'setbackSide' | 'setbackBack'>): [number, number, number, number] | null {
  const outline = lotOutline(lot);
  const xs = outline.map((p) => p[0]);
  const ys = outline.map((p) => p[1]);
  const r: [number, number, number, number] = [
    Math.min(...xs) + (zoning.setbackSide ?? 0),
    Math.min(...ys) + (zoning.setbackFront ?? 0),
    Math.max(...xs) - (zoning.setbackSide ?? 0),
    Math.max(...ys) - (zoning.setbackBack ?? 0),
  ];
  return r[2] > r[0] && r[3] > r[1] ? r : null;
}

/** Hachura a 45° dentro de um retângulo: segmentos [a, b] em coordenadas do lote. */
export function hatchLines(rect: [number, number, number, number], spacing = 0.5): [Vec2, Vec2][] {
  const [x0, y0, x1, y1] = rect;
  const out: [Vec2, Vec2][] = [];
  // retas y - x = k, para k de (y0 - x1) até (y1 - x0)
  for (let k = y0 - x1 + spacing; k < y1 - x0; k += spacing) {
    const xa = Math.max(x0, y0 - k);
    const xb = Math.min(x1, y1 - k);
    if (xb - xa > 1e-6) out.push([[xa, xa + k], [xb, xb + k]]);
  }
  return out;
}

/** Traço-ponto ao longo de um contorno fechado: segmentos [a, b] (traço longo, vão, ponto, vão). */
export function dashDotSegments(poly: Vec2[], dash = 0.8, gap = 0.2, dot = 0.08): [Vec2, Vec2][] {
  const out: [Vec2, Vec2][] = [];
  const pattern: [number, boolean][] = [[dash, true], [gap, false], [dot, true], [gap, false]];
  let pi = 0;
  let left = pattern[0]![0];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len === 0) continue;
    let pos = 0;
    while (pos < len - 1e-9) {
      const step = Math.min(left, len - pos);
      const [, on] = pattern[pi]!;
      if (on) {
        const t0 = pos / len;
        const t1 = (pos + step) / len;
        out.push([[a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1]]);
      }
      pos += step;
      left -= step;
      if (left <= 1e-9) {
        pi = (pi + 1) % pattern.length;
        left = pattern[pi]![0];
      }
    }
  }
  return out;
}
