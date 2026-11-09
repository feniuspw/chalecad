/**
 * Primitivas de desenho técnico parametrizadas por estilo: as mesmas funções servem para a tela (unidades de SVG
 * grandes, 60 por metro) e para o papel (1 unidade = 1 mm, espessuras da prática: corte 0,5; vista 0,25; cota 0,18).
 */
import { GUIDE, INK, group, line, n2, poly, rect, tag, text } from './svg';

export interface PaperStyle {
  /** Espessuras de traço. */
  cut: number;
  view: number;
  dim: number;
  thin: number;
  /** Corpo do texto e títulos. */
  text: number;
  title: number;
  /** Meia-extensão do traço inclinado das cotas. */
  tick: number;
  /** Afastamento da linha de extensão do objeto e avanço além da linha de cota. */
  gap: number;
  /** Espaçamento das hachuras de corte. */
  hatch: number;
}

/** Papel, em mm: texto de 2,5 mm e títulos de 3,5 mm. */
export const PAPER: PaperStyle = { cut: 0.5, view: 0.25, dim: 0.18, thin: 0.13, text: 2.5, title: 3.5, tick: 1.2, gap: 1, hatch: 1.1 };
/** Tela (60 unidades por metro). */
export const SCREEN: PaperStyle = { cut: 1.8, view: 0.9, dim: 0.7, thin: 0.5, text: 9, title: 13, tick: 2.5, gap: 3, hatch: 5 };

export const fmtLevel = (z: number) => {
  const v = Math.round(z * 100) / 100;
  const s = Math.abs(v).toFixed(2).replace('.', ',');
  return v === 0 ? '±0,00' : v > 0 ? `+${s}` : `-${s}`;
};

/** Padrão de hachura de corte (linhas a 45°), com id próprio. */
export function hatchPattern(id: string, st: PaperStyle, fill = '#fff'): string {
  return tag('pattern', { id, width: st.hatch, height: st.hatch, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, rect(0, 0, st.hatch, st.hatch, { fill }) + line(0, 0, 0, st.hatch, { stroke: INK, 'stroke-width': st.thin }));
}

/** Padrão de pontos/traços para áreas permeáveis (grama): linhas cruzadas. */
export function crossPattern(id: string, st: PaperStyle, color = '#4d7c0f'): string {
  const s = st.hatch * 2.2;
  return tag('pattern', { id, width: s, height: s, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, rect(0, 0, s, s, { fill: '#fff' }) + line(0, 0, 0, s, { stroke: color, 'stroke-width': st.thin }) + line(0, 0, s, 0, { stroke: color, 'stroke-width': st.thin }));
}

export function dimText(x: number, y: number, s: string, st: PaperStyle, a: Record<string, string | number> = {}): string {
  return text(x, y, s, { 'font-size': st.text, 'font-weight': 400, ...a });
}

const tickAt = (x: number, y: number, st: PaperStyle) => line(x - st.tick, y + st.tick, x + st.tick, y - st.tick, { 'stroke-width': st.view });

/** Cota horizontal: linha em `y` de x1 a x2, ticks e texto acima. `refY`: onde o objeto está (linhas de extensão). */
export function pDimH(st: PaperStyle, x1: number, x2: number, y: number, label: string, refY?: number): string {
  const out: string[] = [];
  if (refY !== undefined) {
    const dir = refY > y ? 1 : -1;
    out.push(line(x1, refY - dir * st.gap, x1, y - dir * st.gap * 1.5, { stroke: INK, 'stroke-width': st.dim }));
    out.push(line(x2, refY - dir * st.gap, x2, y - dir * st.gap * 1.5, { stroke: INK, 'stroke-width': st.dim }));
  }
  out.push(line(x1 - st.gap, y, x2 + st.gap, y, { 'stroke-width': st.dim }));
  out.push(tickAt(x1, y, st), tickAt(x2, y, st));
  const narrow = x2 - x1 < label.length * st.text * 0.55;
  out.push(dimText(narrow ? x2 + st.gap + 1 : (x1 + x2) / 2, y - st.text * 0.35, label, st, narrow ? { 'text-anchor': 'start' } : {}));
  return group(out.join(''), { 'data-role': 'dim' });
}

/** Cota vertical: linha em `x` de y1 a y2, texto girado. `refX`: onde o objeto está. */
export function pDimV(st: PaperStyle, y1: number, y2: number, x: number, label: string, refX?: number): string {
  const out: string[] = [];
  if (refX !== undefined) {
    const dir = refX > x ? 1 : -1;
    out.push(line(refX - dir * st.gap, y1, x - dir * st.gap * 1.5, y1, { stroke: INK, 'stroke-width': st.dim }));
    out.push(line(refX - dir * st.gap, y2, x - dir * st.gap * 1.5, y2, { stroke: INK, 'stroke-width': st.dim }));
  }
  out.push(line(x, y1 - st.gap, x, y2 + st.gap, { 'stroke-width': st.dim }));
  out.push(tickAt(x, y1, st), tickAt(x, y2, st));
  const tx = x - st.text * 0.35;
  const ty = (y1 + y2) / 2;
  out.push(dimText(tx, ty, label, st, { transform: `rotate(-90 ${n2(tx)} ${n2(ty)})` }));
  return group(out.join(''), { 'data-role': 'dim' });
}

/** Marcador de nível: triângulo apontando para a linha e o texto ao lado. */
export function levelMark(st: PaperStyle, x: number, y: number, label: string, anchor: 'start' | 'end' = 'end'): string {
  const k = st.text * 0.7;
  const dir = anchor === 'end' ? 1 : -1;
  return group(
    poly([[x, y], [x - dir * k, y - k * 0.9], [x + dir * k, y - k * 0.9]], { fill: INK, stroke: INK, 'stroke-width': st.thin }) +
      line(x - k * 1.6, y - k * 1.8, x + k * 1.6, y - k * 1.8, { 'stroke-width': st.dim }) +
      line(x - k * 1.6, y, x + k * 1.6, y, { 'stroke-width': st.dim }) +
      dimText(x + dir * (k * 1.9), y - k * 0.9, label, st, { 'text-anchor': anchor === 'end' ? 'start' : 'end' }),
    { 'data-role': 'level-mark' },
  );
}

/** Seta (cabeça cheia) de (x1,y1) para (x2,y2). */
export function arrow(st: PaperStyle, x1: number, y1: number, x2: number, y2: number, w = st.view): string {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const h = st.text * 1.1;
  const b: [number, number] = [x2 - ux * h, y2 - uy * h];
  return (
    line(x1, y1, b[0], b[1], { 'stroke-width': w }) +
    poly([[x2, y2], [b[0] - uy * h * 0.28, b[1] + ux * h * 0.28], [b[0] + uy * h * 0.28, b[1] - ux * h * 0.28]], { fill: INK, stroke: 'none' })
  );
}

/**
 * Símbolo do norte: círculo com seta e "N". `rotationDeg` = ângulo horário, a partir do topo da folha, para onde o
 * norte aponta (convenção de `meta.northDeg`: 0 = fundos do lote, que ficam no topo da folha).
 */
export function paperNorth(st: PaperStyle, cx: number, cy: number, rotationDeg = 0): string {
  const r = st.text * 3;
  const inner = [
    tag('circle', { cx, cy, r, fill: '#fff', stroke: INK, 'stroke-width': st.view }),
    poly([[cx, cy - r * 0.85], [cx + r * 0.38, cy + r * 0.6], [cx, cy + r * 0.28], [cx - r * 0.38, cy + r * 0.6]], { fill: INK, stroke: INK, 'stroke-width': st.thin }),
    text(cx, cy - r - st.text * 0.4, 'N', { 'font-size': st.title, 'font-weight': 700 }),
  ].join('');
  return group(inner, { 'data-role': 'north', transform: `rotate(${n2(rotationDeg)} ${n2(cx)} ${n2(cy)})` });
}

export const guideLine = (x1: number, y1: number, x2: number, y2: number, st: PaperStyle) => line(x1, y1, x2, y2, { stroke: GUIDE, 'stroke-width': st.thin, 'stroke-dasharray': `${n2(st.text)} ${n2(st.text * 0.5)}` });
