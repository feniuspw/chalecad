/** Cômodos na planta: cor por uso, texto do rótulo e posição do rótulo dentro do contorno. */
import type { RoomModel, RoomUse, Vec2 } from '@chalecad/engine';
import { fmt } from '../project/format';

/** Cor suave de preenchimento por uso (hex), a mesma no SVG e no 3D da planta. */
export const ROOM_FILL: Record<RoomUse, string> = {
  living: '#fcd9a4',
  kitchen: '#fde68a',
  bedroom: '#bfdbfe',
  bathroom: '#99f6e4',
  laundry: '#c7d2fe',
  circulation: '#e7e5e4',
  storage: '#d6d3d1',
  other: '#e9d5ff',
};

/** "Quarto · 9,0 m²". */
export function roomLabel(room: Pick<RoomModel, 'name' | 'area'>): string {
  return `${room.name} · ${fmt(room.area, 1)} m²`;
}

function segDist(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function inside(p: Vec2, poly: Vec2[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Distância assinada ao contorno: positiva dentro, negativa fora. */
function signedDist(p: Vec2, poly: Vec2[]): number {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, segDist(p, poly[i]!, poly[(i + 1) % poly.length]!));
  return inside(p, poly) ? d : -d;
}

/**
 * Ponto bom para o rótulo: aproxima o polo de inacessibilidade (ponto interno mais longe das bordas)
 * por refinamento de grade. Num L o centroide pode cair fora; este ponto sempre cai dentro.
 */
export function roomLabelPoint(poly: Vec2[]): { point: Vec2; radius: number } {
  if (poly.length === 0) return { point: [0, 0], radius: 0 };
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  let x0 = Math.min(...xs);
  let x1 = Math.max(...xs);
  let y0 = Math.min(...ys);
  let y1 = Math.max(...ys);
  let best: { p: Vec2; d: number } = { p: [(x0 + x1) / 2, (y0 + y1) / 2], d: -Infinity };
  const N = 12;
  for (let iter = 0; iter < 6; iter++) {
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        const p: Vec2 = [x0 + ((x1 - x0) * i) / N, y0 + ((y1 - y0) * j) / N];
        const d = signedDist(p, poly);
        if (d > best.d) best = { p, d };
      }
    }
    const hx = (x1 - x0) / N;
    const hy = (y1 - y0) / N;
    x0 = best.p[0] - hx * 1.5;
    x1 = best.p[0] + hx * 1.5;
    y0 = best.p[1] - hy * 1.5;
    y1 = best.p[1] + hy * 1.5;
  }
  return { point: best.p, radius: Math.max(0, best.d) };
}
