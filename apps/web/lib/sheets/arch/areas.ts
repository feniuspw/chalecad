/** Quadro de áreas e quadro urbanístico (conteúdo `areas`): tabelas em mm de papel. */
import type { AreaTable, UrbanCheck } from '@chalecad/engine';
import { fmt } from '../../project/format';
import { INK, group, line, rect, text } from '../../plan2d/svg';
import { fit } from '../frame/text';
import type { ContentRenderer, SheetContext } from '../types';
import { ST } from './common';

const ROW = 5;
const WIDTH = 170;

/** Quadro de áreas do motor ou, sem `results.approval`, um derivado do modelo (pavimentos e cômodos). */
export function areaTableOf(ctx: SheetContext): AreaTable {
  if (ctx.results.approval?.areas) return ctx.results.approval.areas;
  const model = ctx.results.model;
  const names = new Map(ctx.project.levels.map((l) => [l.id, l.name ?? l.id]));
  const rooms = model.rooms.filter((r) => r.polygon).map((r) => ({ level: r.level, levelName: names.get(r.level) ?? r.level, name: r.name, use: r.use, area: r.area, perimeter: r.perimeter }));
  const levels = ctx.project.levels.map((l) => {
    const built = l.elevation === 0 ? model.footprintArea : (model.slabs.find((s) => s.level === l.id && s.kind !== 'radier')?.area ?? 0);
    const useful = rooms.filter((r) => r.level === l.id).reduce((s, r) => s + r.area, 0);
    return { level: l.id, levelName: l.name ?? l.id, built, useful };
  });
  return {
    rooms,
    levels,
    totalBuilt: levels.reduce((s, l) => s + l.built, 0),
    totalUseful: levels.reduce((s, l) => s + l.useful, 0),
    coveredOpen: 0,
  };
}

const STATUS: Record<UrbanCheck['status'], string> = { ok: 'Atende', fail: 'NÃO ATENDE', missing: 'Sem limite informado' };

const fmtValue = (v: number, unit: UrbanCheck['unit']) => `${fmt(v, unit === 'pav.' ? 0 : 2)}${unit === '%' ? ' %' : unit === 'm' ? ' m' : ''}`;

interface Table {
  title: string;
  cols: { head: string; w: number; align?: 'start' | 'end' }[];
  rows: string[][];
  boldRows?: Set<number>;
}

function tableSvg(t: Table, y: number): { svg: string; h: number } {
  const out: string[] = [];
  const total = t.cols.reduce((s, c) => s + c.w, 0);
  out.push(text(0, y + 3, t.title, { 'font-size': ST.title, 'font-weight': 700, 'text-anchor': 'start' }));
  let cy = y + 6;
  let cx = 0;
  for (const c of t.cols) {
    out.push(rect(cx, cy, c.w, ROW, { fill: '#e7e5e4', stroke: INK, 'stroke-width': ST.view }), text(c.align === 'end' ? cx + c.w - 1.2 : cx + 1.2, cy + 3.5, c.head, { 'font-size': ST.text, 'font-weight': 700, 'text-anchor': c.align === 'end' ? 'end' : 'start' }));
    cx += c.w;
  }
  cy += ROW;
  t.rows.forEach((row, i) => {
    cx = 0;
    row.forEach((v, k) => {
      const c = t.cols[k]!;
      const bold = t.boldRows?.has(i);
      out.push(rect(cx, cy, c.w, ROW, { fill: bold ? '#f5f5f4' : '#fff', stroke: INK, 'stroke-width': ST.thin }), text(c.align === 'end' ? cx + c.w - 1.2 : cx + 1.2, cy + 3.5, fit(v, c.w - 2.4, ST.text, bold), { 'font-size': ST.text, 'font-weight': bold ? 700 : 400, 'text-anchor': c.align === 'end' ? 'end' : 'start' }));
      cx += c.w;
    });
    cy += ROW;
  });
  out.push(line(0, cy, total, cy, { 'stroke-width': ST.view }));
  return { svg: group(out.join(''), { 'data-role': 'table', 'data-title': t.title }), h: cy - y };
}

export const areasRenderer: ContentRenderer = (ctx, content) => {
  const at = areaTableOf(ctx);
  const rows: string[][] = [];
  const bold = new Set<number>();
  for (const lv of at.levels) {
    for (const r of at.rooms.filter((x) => x.level === lv.level)) rows.push([lv.levelName, r.name, fmt(r.area, 2)]);
    if (lv.useful > 0) {
      bold.add(rows.length);
      rows.push([lv.levelName, 'Área útil do pavimento', fmt(lv.useful, 2)]);
    }
    bold.add(rows.length);
    rows.push([lv.levelName, 'Área construída do pavimento', fmt(lv.built, 2)]);
  }
  if (at.coveredOpen > 0) rows.push(['', 'Áreas abertas cobertas', fmt(at.coveredOpen, 2)]);
  if (at.totalUseful > 0) {
    bold.add(rows.length);
    rows.push(['TOTAL', 'Área útil', fmt(at.totalUseful, 2)]);
  }
  bold.add(rows.length);
  rows.push(['TOTAL', 'Área construída', fmt(at.totalBuilt, 2)]);
  const t1 = tableSvg({ title: 'QUADRO DE ÁREAS (m²)', cols: [{ head: 'PAVIMENTO', w: 45 }, { head: 'AMBIENTE', w: 95 }, { head: 'ÁREA (m²)', w: 30, align: 'end' }], rows, boldRows: bold }, 0);
  const parts = [t1.svg];
  let h = t1.h;
  const urban = ctx.results.approval?.urban;
  const notes: string[] = [];
  if (urban) {
    const t2 = tableSvg(
      {
        title: 'QUADRO URBANÍSTICO',
        cols: [{ head: 'ÍNDICE', w: 55 }, { head: 'PROJETO', w: 30, align: 'end' }, { head: 'PERMITIDO', w: 35, align: 'end' }, { head: 'SITUAÇÃO', w: 50 }],
        rows: urban.checks.map((c) => [c.label, fmtValue(c.value, c.unit), c.limit === undefined ? '-' : fmtValue(c.limit, c.unit), STATUS[c.status]]),
      },
      h + 10,
    );
    parts.push(t2.svg);
    h += 10 + t2.h;
    notes.push(...urban.notes);
  }
  return { body: parts.join(''), width: WIDTH, height: h, title: content.title, notes: ['Áreas conforme o motor de cálculo do projeto; conferir com o levantamento.', ...notes] };
};

