/** Utilitários mínimos para montar SVG como string (sem DOM, roda no servidor, no worker e nos testes). */
import { fmt } from '../project/format';

export const FONT = 'Helvetica, Arial, sans-serif';
export const INK = '#1c1917';
export const MUTED = '#78716c';
export const GUIDE = '#a8a29e';
export const ACCENT = '#b45309';

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Número com no máximo 2 casas para o SVG. */
export const n2 = (v: number) => String(Math.round(v * 100) / 100);

export type Attrs = Record<string, string | number | undefined>;

const attrs = (a: Attrs) =>
  Object.entries(a)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${typeof v === 'number' ? n2(v) : esc(String(v))}"`)
    .join('');

export const tag = (name: string, a: Attrs, inner?: string) => (inner === undefined ? `<${name}${attrs(a)}/>` : `<${name}${attrs(a)}>${inner}</${name}>`);

export const line = (x1: number, y1: number, x2: number, y2: number, a: Attrs = {}) => tag('line', { x1, y1, x2, y2, stroke: INK, 'stroke-width': 0.8, ...a });

export const poly = (pts: [number, number][], a: Attrs = {}) =>
  tag('polygon', { points: pts.map(([x, y]) => `${n2(x)},${n2(y)}`).join(' '), ...a });

export const rect = (x: number, y: number, w: number, h: number, a: Attrs = {}) => tag('rect', { x, y, width: w, height: h, ...a });

export const text = (x: number, y: number, s: string, a: Attrs = {}) =>
  tag('text', { x, y, 'font-family': FONT, 'font-size': 10, fill: INK, 'text-anchor': 'middle', ...a }, esc(s));

export const group = (inner: string, a: Attrs = {}) => tag('g', a, inner);

export const meters = (v: number) => fmt(v, 2);

/** Cota horizontal: linha em `y`, de x1 a x2, com traços inclinados nas pontas e texto acima. */
export function hDim(x1: number, x2: number, y: number, label: string, refY?: number): string {
  const out: string[] = [];
  const dir = refY !== undefined && refY > y ? 1 : -1;
  if (refY !== undefined) {
    out.push(line(x1, refY - dir * 3, x1, y - dir * 3, { stroke: GUIDE, 'stroke-width': 0.5 }));
    out.push(line(x2, refY - dir * 3, x2, y - dir * 3, { stroke: GUIDE, 'stroke-width': 0.5 }));
  }
  out.push(line(x1, y, x2, y, { 'stroke-width': 0.7 }));
  for (const x of [x1, x2]) out.push(line(x - 2.5, y + 2.5, x + 2.5, y - 2.5, { 'stroke-width': 1.1 }));
  if (x2 - x1 > 18) out.push(text((x1 + x2) / 2, y - 3, label, { 'font-size': 9 }));
  return out.join('');
}

/** Cota vertical: linha em `x`, de y1 a y2, texto girado. */
export function vDim(y1: number, y2: number, x: number, label: string, refX?: number): string {
  const out: string[] = [];
  const dir = refX !== undefined && refX > x ? 1 : -1;
  if (refX !== undefined) {
    out.push(line(refX - dir * 3, y1, x - dir * 3, y1, { stroke: GUIDE, 'stroke-width': 0.5 }));
    out.push(line(refX - dir * 3, y2, x - dir * 3, y2, { stroke: GUIDE, 'stroke-width': 0.5 }));
  }
  out.push(line(x, y1, x, y2, { 'stroke-width': 0.7 }));
  for (const y of [y1, y2]) out.push(line(x - 2.5, y + 2.5, x + 2.5, y - 2.5, { 'stroke-width': 1.1 }));
  if (Math.abs(y2 - y1) > 18) out.push(text(x - 3, (y1 + y2) / 2, label, { 'font-size': 9, transform: `rotate(-90 ${n2(x - 3)} ${n2((y1 + y2) / 2)})` }));
  return out.join('');
}

/** Barra de escala gráfica (0 – m – 2m) começando em (x, y). `unit` = unidades de SVG por metro. */
export function scaleBar(x: number, y: number, unit: number): string {
  const step = unit * 6 > 260 ? 1 : 2; // metros por segmento
  const segs = 3;
  const out: string[] = [];
  for (let i = 0; i < segs; i++) {
    out.push(rect(x + i * step * unit, y, step * unit, 5, { fill: i % 2 === 0 ? INK : '#fff', stroke: INK, 'stroke-width': 0.7 }));
  }
  for (let i = 0; i <= segs; i++) out.push(text(x + i * step * unit, y + 16, `${i * step}${i === segs ? ' m' : ''}`, { 'font-size': 8.5, fill: MUTED }));
  out.push(text(x, y - 5, 'ESCALA GRÁFICA', { 'font-size': 7.5, 'text-anchor': 'start', fill: MUTED, 'letter-spacing': 0.6 }));
  return group(out.join(''), { 'data-role': 'scale-bar' });
}

export function northArrow(cx: number, cy: number): string {
  return group(
    [
      tag('circle', { cx, cy, r: 15, fill: '#fff', stroke: INK, 'stroke-width': 0.8 }),
      poly([[cx, cy - 12], [cx + 5.5, cy + 8], [cx, cy + 4], [cx - 5.5, cy + 8]], { fill: INK }),
      text(cx, cy - 19, 'N', { 'font-size': 11, 'font-weight': 700 }),
    ].join(''),
    { 'data-role': 'north' },
  );
}

export interface SvgDoc {
  /** Documento SVG completo (string). */
  svg: string;
  /** Tamanho do viewBox (unidades do SVG). */
  width: number;
  height: number;
  /** Unidades do SVG por metro (escala da figura). */
  unitsPerMeter: number;
}

export function svgDocument(width: number, height: number, body: string, defs = ''): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n2(width)} ${n2(height)}" width="${n2(width)}" height="${n2(height)}" font-family="${FONT}">` +
    (defs ? `<defs>${defs}</defs>` : '') +
    rect(0, 0, width, height, { fill: '#ffffff' }) +
    body +
    '</svg>'
  );
}
