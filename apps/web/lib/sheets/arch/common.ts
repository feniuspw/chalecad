/** Utilitários comuns dos desenhos de arquitetura em mm de papel. */
import type { Vec2 } from '@chalecad/engine';
import { PAPER } from '../../plan2d/paper';
import { INK, group, line, n2, poly, rect, text } from '../../plan2d/svg';
import type { RenderedContent, SheetContext } from '../types';

export const ST = PAPER;

/** Id seguro (sem espaços) para prefixar defs de um conteúdo. */
export const safeId = (...parts: (string | undefined)[]) => parts.filter(Boolean).join('-').replace(/[^a-zA-Z0-9-]/g, '');

/** Milímetros de papel por metro na escala 1:N. */
export const mmPerM = (scale: number) => 1000 / scale;

export function content(partial: Omit<RenderedContent, 'body'> & { body: string }): RenderedContent {
  return partial;
}

/** Símbolos da legenda (SVG pequeno, em caixa de ~8 × 4 mm). */
export const LEGEND = {
  cutWall: (): { symbol: string; label: string } => ({
    symbol: rect(0, 0, 8, 4, { fill: '#fff', stroke: INK, 'stroke-width': 0.35 }) + [1.5, 3.5, 5.5, 7.5].map((x) => line(x - 1.5, 4, x + 0.5, 0, { 'stroke-width': 0.15 })).join(''),
    label: 'Parede em corte (LSF)',
  }),
  viewLine: (): { symbol: string; label: string } => ({ symbol: line(0, 2, 8, 2, { 'stroke-width': 0.25 }), label: 'Elemento em vista' }),
  cutLine: (): { symbol: string; label: string } => ({
    symbol: line(0, 2, 8, 2, { 'stroke-width': 0.25, 'stroke-dasharray': '3 0.8 0.4 0.8' }) + line(0, 0.5, 0, 3.5, { 'stroke-width': 0.6 }) + line(8, 0.5, 8, 3.5, { 'stroke-width': 0.6 }),
    label: 'Indicação de corte',
  }),
  level: (): { symbol: string; label: string } => ({
    symbol: poly([[3, 3.5], [1.4, 1], [4.6, 1]], { fill: INK, stroke: INK, 'stroke-width': 0.15 }) + line(0, 3.5, 6, 3.5, { 'stroke-width': 0.2 }),
    label: 'Nível do piso acabado (m)',
  }),
  dashed: (label: string): { symbol: string; label: string } => ({ symbol: line(0, 2, 8, 2, { 'stroke-width': 0.25, 'stroke-dasharray': '2 1' }), label }),
};

/** Rotação do norte no desenho: graus horários a partir do topo da folha. */
export const northRotation = (ctx: SheetContext, extraDeg = 0) => ((ctx.project.meta.northDeg - extraDeg) % 360 + 360) % 360;

/** Transformação edificação → lote: gira `rotationDeg` (anti-horário) e desloca por `buildingOffset`. */
export function toLot(ctx: SheetContext, p: Vec2): Vec2 {
  const lot = ctx.project.legal.lot;
  if (!lot) return p;
  const a = (lot.rotationDeg * Math.PI) / 180;
  return [lot.buildingOffset[0] + p[0] * Math.cos(a) - p[1] * Math.sin(a), lot.buildingOffset[1] + p[0] * Math.sin(a) + p[1] * Math.cos(a)];
}

/** Contorno do lote em coordenadas do lote. */
export function lotPolygon(ctx: SheetContext): Vec2[] | null {
  const lot = ctx.project.legal.lot;
  if (!lot) return null;
  if (lot.polygon && lot.polygon.length >= 3) return lot.polygon;
  return [[0, 0], [lot.front, 0], [lot.front, lot.depth], [0, lot.depth]];
}

/** Retângulo (eixo das paredes externas) da edificação, em coordenadas da edificação. */
export function axisBox(ctx: SheetContext): Vec2[] {
  const ext = ctx.results.model.walls.filter((w) => w.kind !== 'interior');
  const pts: Vec2[] = ext.flatMap((w) => [w.from, w.to]);
  const src = pts.length ? pts : ctx.results.model.footprint;
  const xs = src.map((p) => p[0]);
  const ys = src.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}

/** Texto multilinha simples (linhas de 1,45 × corpo). */
export function textLines(x: number, y: number, lines: string[], size: number, a: Record<string, string | number> = {}): string {
  return group(lines.map((l, i) => text(x, y + i * size * 1.45, l, { 'font-size': size, ...a })).join(''));
}

export { n2 };
