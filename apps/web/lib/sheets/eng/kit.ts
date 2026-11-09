/**
 * Primitivas de desenho em milímetros de papel para os conteúdos de engenharia (F17-W2).
 * Traços: principal/cortado 0,5 mm, secundário 0,25 mm, cota e texto 0,18 mm. Texto de 2,5 mm.
 */
import type { Catalog } from '@chalecad/catalog';
import type { BuildingModel, HostWall, Project, Vec2 } from '@chalecad/engine';
import { esc, n2, tag, type Attrs } from '../../plan2d/svg';
import { fmt } from '../../project/format';
import type { SheetContext } from '../types';

export const W = { main: 0.5, sec: 0.25, thin: 0.18 } as const;
export const TXT = 2.5;
export const INK = '#1c1917';
export const GREY = '#78716c';
export const LIGHT = '#a8a29e';
export const FONT = 'Helvetica, Arial, sans-serif';

export const m2 = (v: number) => fmt(v, 2);

type Opts = Attrs & { dash?: string };

export const ln = (x1: number, y1: number, x2: number, y2: number, w: number = W.sec, o: Opts = {}) => {
  const { dash, ...rest } = o;
  return tag('line', { x1, y1, x2, y2, stroke: INK, 'stroke-width': w, 'stroke-dasharray': dash, 'stroke-linecap': 'butt', ...rest });
};

export const pline = (pts: readonly (readonly [number, number])[], w: number = W.sec, o: Opts = {}) => {
  const { dash, ...rest } = o;
  return tag('polyline', { points: pts.map(([x, y]) => `${n2(x)},${n2(y)}`).join(' '), fill: 'none', stroke: INK, 'stroke-width': w, 'stroke-dasharray': dash, 'stroke-linejoin': 'round', ...rest });
};

export const pgon = (pts: readonly (readonly [number, number])[], w: number = W.sec, o: Opts = {}) => {
  const { dash, ...rest } = o;
  return tag('polygon', { points: pts.map(([x, y]) => `${n2(x)},${n2(y)}`).join(' '), fill: 'none', stroke: INK, 'stroke-width': w, 'stroke-dasharray': dash, 'stroke-linejoin': 'miter', ...rest });
};

export const rc = (x: number, y: number, w: number, h: number, sw: number = W.sec, o: Opts = {}) => {
  const { dash, ...rest } = o;
  return tag('rect', { x, y, width: w, height: h, fill: 'none', stroke: INK, 'stroke-width': sw, 'stroke-dasharray': dash, ...rest });
};

export const ci = (cx: number, cy: number, r: number, sw: number = W.sec, o: Opts = {}) => tag('circle', { cx, cy, r, fill: 'none', stroke: INK, 'stroke-width': sw, ...o });

export const g = (inner: string, a: Attrs = {}) => tag('g', a, inner);

interface TextOpts {
  size?: number;
  anchor?: 'start' | 'middle' | 'end';
  fill?: string;
  bold?: boolean;
  rotate?: number;
  halo?: boolean;
}

/** Texto de 2,5 mm (por padrão). `y` é a linha de base. */
export function tx(x: number, y: number, s: string, o: TextOpts = {}): string {
  const size = o.size ?? TXT;
  return tag(
    'text',
    {
      x,
      y,
      'font-family': FONT,
      'font-size': size,
      'text-anchor': o.anchor ?? 'middle',
      fill: o.fill ?? INK,
      'font-weight': o.bold ? 700 : undefined,
      transform: o.rotate ? `rotate(${n2(o.rotate)} ${n2(x)} ${n2(y)})` : undefined,
      stroke: o.halo ? '#fff' : undefined,
      'stroke-width': o.halo ? size * 0.3 : undefined,
      'paint-order': o.halo ? 'stroke' : undefined,
      'stroke-linejoin': o.halo ? 'round' : undefined,
    },
    esc(s),
  );
}

/** Largura estimada de um texto (mm), para quebrar linhas e dimensionar colunas. */
export const textWidth = (s: string, size = TXT) => s.length * size * 0.52;

/** Quebra um parágrafo em linhas que cabem em `width` mm. */
export function wrap(s: string, width: number, size = TXT): string[] {
  const maxChars = Math.max(8, Math.floor(width / (size * 0.52)));
  const out: string[] = [];
  let cur = '';
  for (const word of s.split(/\s+/)) {
    if (cur && (cur + ' ' + word).length > maxChars) {
      out.push(cur);
      cur = word;
    } else cur = cur ? cur + ' ' + word : word;
  }
  if (cur) out.push(cur);
  return out;
}

const tick = (x: number, y: number) => ln(x - 0.9, y + 0.9, x + 0.9, y - 0.9, W.main);

/** Cota horizontal em y, de x1 a x2; `ref` = y da geometria medida (linhas de chamada). */
export function dimH(x1: number, x2: number, y: number, label: string, ref?: number): string {
  const out: string[] = [];
  if (ref !== undefined) {
    const dir = ref > y ? 1 : -1;
    out.push(ln(x1, ref - dir * 1, x1, y - dir * 1.5, W.thin), ln(x2, ref - dir * 1, x2, y - dir * 1.5, W.thin));
  }
  out.push(ln(x1, y, x2, y, W.thin), tick(x1, y), tick(x2, y));
  out.push(tx((x1 + x2) / 2, y - 0.8, label));
  return g(out.join(''), { 'data-role': 'dim' });
}

/** Cota vertical em x, de y1 a y2 (texto girado). */
export function dimV(y1: number, y2: number, x: number, label: string, ref?: number): string {
  const out: string[] = [];
  if (ref !== undefined) {
    const dir = ref > x ? 1 : -1;
    out.push(ln(ref - dir * 1, y1, x - dir * 1.5, y1, W.thin), ln(ref - dir * 1, y2, x - dir * 1.5, y2, W.thin));
  }
  out.push(ln(x, y1, x, y2, W.thin), tick(x, y1), tick(x, y2));
  out.push(tx(x - 0.8, (y1 + y2) / 2, label, { rotate: -90 }));
  return g(out.join(''), { 'data-role': 'dim' });
}

/** Seta cheia pequena em (x, y) apontando para (dx, dy) unitário. */
export function arrow(x: number, y: number, dx: number, dy: number, len = 2.2, color = INK): string {
  const nx = -dy;
  const ny = dx;
  const bx = x - dx * len;
  const by = y - dy * len;
  return tag('polygon', { points: `${n2(x)},${n2(y)} ${n2(bx + nx * len * 0.35)},${n2(by + ny * len * 0.35)} ${n2(bx - nx * len * 0.35)},${n2(by - ny * len * 0.35)}`, fill: color, stroke: 'none' });
}

// ---------------------------------------------------------------------------
// Normas (sempre do catálogo, com edição)
// ---------------------------------------------------------------------------

/** "ABNT NBR 5410:2004 (versão corrigida 2008)". Id desconhecido = o próprio id (nunca inventa edição). */
export function normRef(catalog: Catalog, id: string): string {
  const n = catalog.constants.approval.norms.find((x) => x.id === id);
  if (!n) return id;
  return n.edition && n.edition !== '—' ? `${n.code}:${n.edition}` : n.code;
}

export const normList = (catalog: Catalog, ids: string[]) => ids.map((i) => normRef(catalog, i)).join('; ');

// ---------------------------------------------------------------------------
// Níveis, paredes e quadro de plantas
// ---------------------------------------------------------------------------

export interface LevelInfo {
  id: string;
  name: string;
  elevation: number;
}

export function resolveLevel(ctx: SheetContext, target?: string): LevelInfo | null {
  const levels: LevelInfo[] = ctx.project.levels.map((l) => ({ id: l.id, name: l.name ?? l.id, elevation: l.elevation })).sort((a, b) => a.elevation - b.elevation);
  if (levels.length === 0) return null;
  if (!target) return levels[0]!;
  const t = target.toLowerCase();
  return levels.find((l) => l.id === target) ?? levels.find((l) => l.name.toLowerCase() === t) ?? levels[0]!;
}

export const groundElevation = (ctx: SheetContext) => Math.min(...ctx.project.levels.map((l) => l.elevation));

const maxV = (w: HostWall) => w.outline.reduce((m, p) => Math.max(m, p[1]), 0);

/** Paredes cortadas pelo plano do nível: as do nível mais as externas altas que o atravessam (empenas). */
export function wallsAtLevel(model: BuildingModel, level: LevelInfo): HostWall[] {
  const own = model.walls.filter((w) => w.level === level.id);
  const ids = new Set(own.map((w) => w.id));
  const through = model.walls.filter((w) => !ids.has(w.id) && w.kind !== 'interior' && w.baseZ <= level.elevation + 1e-6 && w.baseZ + maxV(w) > level.elevation + 1.2);
  return [...own, ...through];
}

/** Referencial local da parede: ponto = from + d*u + n*s (n = normal à esquerda de from→to). */
export function wallFrame(w: HostWall) {
  const L = w.length || 1;
  const d: Vec2 = [(w.to[0] - w.from[0]) / L, (w.to[1] - w.from[1]) / L];
  const n: Vec2 = [-d[1], d[0]];
  const at = (u: number, s: number): Vec2 => [w.from[0] + d[0] * u + n[0] * s, w.from[1] + d[1] * u + n[1] * s];
  return { d, n, at };
}

export function wallPolygon(w: HostWall): Vec2[] {
  const { at } = wallFrame(w);
  const h = w.thickness / 2;
  return [at(-h, -h), at(w.length + h, -h), at(w.length + h, h), at(-h, h)];
}

/** Códigos P01, P02... das paredes (estáveis: ordem do modelo, por nível). */
export function wallCodes(model: BuildingModel, levelOrder: (id: string) => number = () => 0): Map<string, string> {
  const sorted = [...model.walls].sort((a, b) => levelOrder(a.level) - levelOrder(b.level));
  return new Map(sorted.map((w, i) => [w.id, `P${String(i + 1).padStart(2, '0')}`]));
}

export interface Frame {
  /** Milímetros de papel por metro. */
  k: number;
  P: (p: Vec2) => [number, number];
  /** Retângulo do desenho (área da planta) em mm. */
  left: number;
  top: number;
  right: number;
  bottom: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Quadro de uma planta: converte metros em mm de papel na escala 1:`scale`; margens para cotas e rótulos. */
export function makeFrame(pts: Vec2[], scale: number, margin: { l: number; t: number; r: number; b: number }): Frame {
  const k = 1000 / scale;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const left = margin.l;
  const top = margin.t;
  return {
    k,
    P: (p) => [left + (p[0] - minX) * k, top + (maxY - p[1]) * k],
    left,
    top,
    right: left + (maxX - minX) * k,
    bottom: top + (maxY - minY) * k,
    minX,
    maxX,
    minY,
    maxY,
  };
}

export interface BasePlanOpts {
  /** Espessura do traço das paredes. */
  w?: number;
  fill?: string;
  /** Abre os vãos de portas e janelas. */
  openings?: boolean;
  /** Pinta os vãos com a linha de janela/porta. */
  color?: string;
}

/** Paredes em corte e vãos, em traço fino, para servir de base às plantas de disciplina. */
export function basePlan(ctx: SheetContext, walls: HostWall[], f: Frame, o: BasePlanOpts = {}): string {
  const out: string[] = [];
  const sw = o.w ?? W.sec;
  const color = o.color ?? INK;
  for (const w of walls) out.push(pgon(wallPolygon(w).map(f.P), sw, { stroke: color, fill: o.fill ?? '#fff', 'data-role': 'wall', 'data-id': w.id }));
  if (o.openings !== false) {
    const byId = new Map(walls.map((w) => [w.id, w]));
    for (const op of ctx.results.model.openings) {
      const w = byId.get(op.hostId);
      if (!w || op.hostKind !== 'wall' || !op.valid) continue;
      const { at } = wallFrame(w);
      const h = w.thickness / 2;
      const a = f.P(at(op.u0, -h));
      const b = f.P(at(op.u1, -h));
      const c = f.P(at(op.u1, h));
      const d = f.P(at(op.u0, h));
      out.push(tag('polygon', { points: [a, b, c, d].map(([x, y]) => `${n2(x)},${n2(y)}`).join(' '), fill: '#fff', stroke: 'none' }));
      out.push(ln(...a, ...d, W.thin, { stroke: color }), ln(...b, ...c, W.thin, { stroke: color }));
      const m1 = f.P(at(op.u0, 0));
      const m2_ = f.P(at(op.u1, 0));
      if (op.type === 'door') {
        const wd = op.u1 - op.u0;
        const hinge = f.P(at(op.u0, h));
        const leaf = f.P(at(op.u0, h + wd));
        const end = f.P(at(op.u1, h));
        const cross = (leaf[0] - hinge[0]) * (end[1] - hinge[1]) - (leaf[1] - hinge[1]) * (end[0] - hinge[0]);
        const r = wd * f.k;
        out.push(ln(...hinge, ...leaf, W.thin, { stroke: color }));
        out.push(tag('path', { d: `M${n2(leaf[0])} ${n2(leaf[1])} A${n2(r)} ${n2(r)} 0 0 ${cross > 0 ? 1 : 0} ${n2(end[0])} ${n2(end[1])}`, fill: 'none', stroke: color, 'stroke-width': W.thin, 'stroke-dasharray': '0.8 0.8' }));
      } else out.push(ln(...m1, ...m2_, W.thin, { stroke: color }));
    }
  }
  return g(out.join(''), { 'data-role': 'base-plan' });
}

// ---------------------------------------------------------------------------
// Tabelas simples
// ---------------------------------------------------------------------------

export interface TableOpts {
  x: number;
  y: number;
  head: string[];
  rows: string[][];
  /** Alinhamento por coluna ('r' = números à direita). */
  align?: ('l' | 'r' | 'c')[];
  /** Larguras mínimas por coluna (mm). */
  minW?: number[];
  /** Linha final em negrito (totais). */
  totalRow?: boolean;
  rowH?: number;
  pad?: number;
  /** Largura máxima: colunas de texto são quebradas (índice -> largura máxima). */
  maxW?: Record<number, number>;
}

/** Tabela com grade de 0,25 mm e cabeçalho em negrito. Devolve SVG e o retângulo ocupado. */
export function table(o: TableOpts): { svg: string; width: number; height: number } {
  const pad = o.pad ?? 1.4;
  const nCols = o.head.length;
  const cells: string[][][] = o.rows.map((r) => r.map((c, i) => (o.maxW?.[i] ? wrap(c, o.maxW[i]! - 2 * pad) : [c])));
  const widths = Array.from({ length: nCols }, (_, i) => {
    const w = Math.max(textWidth(o.head[i]!), ...cells.map((r) => Math.max(...(r[i] ?? ['']).map((s) => textWidth(s)))));
    return Math.max(o.minW?.[i] ?? 0, w + 2 * pad);
  });
  const base = o.rowH ?? 4.6;
  const heights = cells.map((r) => Math.max(base, Math.max(...r.map((c) => c.length)) * 3.6 + 1.2));
  const total = widths.reduce((a, b) => a + b, 0);
  const out: string[] = [];
  let y = o.y;
  const headH = base;
  out.push(tag('rect', { x: o.x, y, width: total, height: headH, fill: '#e7e5e4', stroke: INK, 'stroke-width': W.sec }));
  let x = o.x;
  o.head.forEach((h, i) => {
    out.push(cellText(x, y, widths[i]!, headH, h, o.align?.[i] ?? 'l', pad, true));
    x += widths[i]!;
  });
  y += headH;
  cells.forEach((r, ri) => {
    const rh = heights[ri]!;
    const isTotal = o.totalRow && ri === cells.length - 1;
    out.push(tag('rect', { x: o.x, y, width: total, height: rh, fill: isTotal ? '#f5f5f4' : 'none', stroke: INK, 'stroke-width': W.sec }));
    let cx = o.x;
    r.forEach((lines, i) => {
      lines.forEach((s, li) => out.push(cellText(cx, y + li * 3.6 - (lines.length > 1 ? 0 : 0), widths[i]!, lines.length > 1 ? 4.6 : rh, s, o.align?.[i] ?? 'l', pad, !!isTotal)));
      cx += widths[i]!;
    });
    y += rh;
  });
  // linhas verticais
  let vx = o.x;
  for (let i = 0; i <= nCols; i++) {
    out.push(ln(vx, o.y, vx, y, W.thin));
    vx += widths[i] ?? 0;
  }
  return { svg: g(out.join(''), { 'data-role': 'table' }), width: total, height: y - o.y };
}

function cellText(x: number, y: number, w: number, h: number, s: string, align: 'l' | 'r' | 'c', pad: number, bold: boolean): string {
  const by = y + h / 2 + TXT * 0.35;
  if (align === 'r') return tx(x + w - pad, by, s, { anchor: 'end', bold });
  if (align === 'c') return tx(x + w / 2, by, s, { bold });
  return tx(x + pad, by, s, { anchor: 'start', bold });
}

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------

export type Pt = readonly [number, number];

export function bounds(pts: Pt[]): { minX: number; minY: number; maxX: number; maxY: number } {
  return { minX: Math.min(...pts.map((p) => p[0])), maxX: Math.max(...pts.map((p) => p[0])), minY: Math.min(...pts.map((p) => p[1])), maxY: Math.max(...pts.map((p) => p[1])) };
}

/** Polígono deslocado para dentro (d > 0) ou para fora (d < 0). Vale para polígonos simples ortogonais ou convexos. */
export function offsetPolygon(poly: Vec2[], d: number): Vec2[] {
  const n = poly.length;
  if (n < 3) return poly;
  const area = poly.reduce((s, p, i) => s + (p[0] * poly[(i + 1) % n]![1] - poly[(i + 1) % n]![0] * p[1]), 0);
  const sgn = area >= 0 ? 1 : -1; // anti-horário = +1: interior à esquerda
  const lines = poly.map((p, i) => {
    const q = poly[(i + 1) % n]!;
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    const dx = (q[0] - p[0]) / L;
    const dy = (q[1] - p[1]) / L;
    const nx = -dy * sgn;
    const ny = dx * sgn;
    return { p: [p[0] + nx * d, p[1] + ny * d] as Vec2, dx, dy };
  });
  return poly.map((_, i) => {
    const a = lines[(i + n - 1) % n]!;
    const b = lines[i]!;
    const den = a.dx * b.dy - a.dy * b.dx;
    if (Math.abs(den) < 1e-9) return b.p;
    const t = ((b.p[0] - a.p[0]) * b.dy - (b.p[1] - a.p[1]) * b.dx) / den;
    return [a.p[0] + a.dx * t, a.p[1] + a.dy * t] as Vec2;
  });
}

export const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

export const projectName = (p: Project) => p.meta.name;

/** Cota alinhada entre a e b (mm), deslocada por `off` (mm); texto acompanha a direção, sempre legível. */
export function dimAligned(a: Pt, b: Pt, off: Pt, label: string): string {
  const a2: Pt = [a[0] + off[0], a[1] + off[1]];
  const b2: Pt = [b[0] + off[0], b[1] + off[1]];
  const L = Math.hypot(b2[0] - a2[0], b2[1] - a2[1]) || 1;
  const ux = (b2[0] - a2[0]) / L;
  const uy = (b2[1] - a2[1]) / L;
  const tk = (p: Pt) => ln(p[0] - (ux + uy) * 0.65, p[1] - (uy - ux) * 0.65, p[0] + (ux + uy) * 0.65, p[1] + (uy - ux) * 0.65, W.main);
  let ang = (Math.atan2(uy, ux) * 180) / Math.PI;
  if (ang > 90 || ang < -90) ang += 180;
  const mx = (a2[0] + b2[0]) / 2;
  const my = (a2[1] + b2[1]) / 2;
  // texto no lado oposto ao deslocamento, para não cair sobre a geometria
  const ol = Math.hypot(off[0], off[1]) || 1;
  const tx0 = mx + (off[0] / ol) * 0.9;
  const ty0 = my + (off[1] / ol) * 0.9;
  return g(
    ln(a[0], a[1], a2[0], a2[1], W.thin) + ln(b[0], b[1], b2[0], b2[1], W.thin) + ln(a2[0], a2[1], b2[0], b2[1], W.thin) + tk(a2) + tk(b2) + tx(tx0, ty0, label, { rotate: ang, halo: true }),
    { 'data-role': 'dim' },
  );
}

type V3 = readonly [number, number, number];
interface Placed {
  start: V3;
  end: V3;
}

/**
 * Espaçamento entre peças paralelas (distância perpendicular entre eixos, m): mediana dos intervalos e o par mais
 * próximo dela (para cotar). Peças fora do paralelismo da primeira são ignoradas.
 */
export function spacingOf<T extends Placed>(items: T[]): { gap: number; a: T; b: T } | null {
  if (items.length < 2) return null;
  const dir = (p: Placed): V3 => {
    const v: V3 = [p.end[0] - p.start[0], p.end[1] - p.start[1], p.end[2] - p.start[2]];
    const L = Math.hypot(...v) || 1;
    return [v[0] / L, v[1] / L, v[2] / L];
  };
  const d0 = dir(items[0]!);
  const par = items.filter((p) => Math.abs(dir(p).reduce((s, c, i) => s + c * d0[i]!, 0)) > 0.99);
  if (par.length < 2) return null;
  const mid = (p: Placed): V3 => [(p.start[0] + p.end[0]) / 2, (p.start[1] + p.end[1]) / 2, (p.start[2] + p.end[2]) / 2];
  const m0 = mid(par[0]!);
  const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  let far: V3 = [0, 0, 0];
  let best = 0;
  for (const p of par) {
    const v = sub(mid(p), m0);
    const along = dot(v, d0);
    const perp: V3 = [v[0] - along * d0[0], v[1] - along * d0[1], v[2] - along * d0[2]];
    const l = Math.hypot(...perp);
    if (l > best) {
      best = l;
      far = perp;
    }
  }
  if (best < 1e-6) return null;
  const e: V3 = [far[0] / best, far[1] / best, far[2] / best];
  const sorted = par.map((p) => ({ p, t: dot(sub(mid(p), m0), e) })).sort((a, b) => a.t - b.t);
  const gaps: { gap: number; a: T; b: T }[] = [];
  for (let i = 0; i + 1 < sorted.length; i++) {
    const gap = sorted[i + 1]!.t - sorted[i]!.t;
    if (gap > 0.05) gaps.push({ gap, a: sorted[i]!.p, b: sorted[i + 1]!.p });
  }
  if (gaps.length === 0) return null;
  const med = median(gaps.map((x) => x.gap));
  return gaps.reduce((acc, x) => (Math.abs(x.gap - med) < Math.abs(acc.gap - med) ? x : acc));
}

/** Resultado padrão de um conteúdo. */
export function rendered(
  body: string,
  width: number,
  height: number,
  title: string,
  extra: { scale?: number; defs?: string; legend?: { symbol: string; label: string }[]; notes?: string[] } = {},
) {
  return { body, width: Math.ceil(width), height: Math.ceil(height), title, ...extra };
}

/** Fragmento de legenda: o SVG é desenhado numa caixa de 10 × 5 mm, origem no canto superior esquerdo. */
export const legendItem = (symbol: string, label: string) => ({ symbol: g(symbol, { 'data-role': 'legend-symbol' }), label });

/** Nome dos cômodos do nível em cinza (orientação nas plantas de disciplina). */
export function roomNames(ctx: SheetContext, levelId: string, f: Frame, roomPoint: (poly: Vec2[]) => { point: Vec2 }): string {
  const out: string[] = [];
  for (const r of ctx.results.model.rooms.filter((x) => x.level === levelId && x.polygon && x.polygon.length >= 3)) {
    const [x, y] = f.P(roomPoint(r.polygon!).point);
    out.push(tx(x, y, r.name.toUpperCase(), { fill: LIGHT, size: TXT, halo: true }));
  }
  return g(out.join(''), { 'data-role': 'room-names' });
}
