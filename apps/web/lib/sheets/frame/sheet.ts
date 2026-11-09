/**
 * Monta a folha ABNT: escolhe o formato, arruma os conteúdos em linhas com título sublinhado e escala, e compõe a
 * coluna da direita (notas, legenda, aprovação, revisões, carimbo).
 */
import type { SheetContent, SheetSpec } from '@chalecad/engine';
import * as engine from '@chalecad/engine';
import { INK, MUTED, group, line, rect, text } from '../../plan2d/svg';
import type { RenderedContent, RendererRegistry, SheetContext, SheetDoc } from '../types';
import { COLUMN_GAP, formatsFrom, formatById, packBoxes, sheetGeometry, type FormatId, type FormatSpec } from './format';
import { approvalBoxSvg, revisionsHeight, revisionsSvg, stampData, stampHeight, stampSvg } from './titleblock';
import { fit, textWidth, wrap } from './text';

const CAPTION_H = 9;
const CELL_GAP = 8;
const MIN_NOTES_H = 40;

const approvalNotice = (engine as unknown as Record<string, unknown>)['APPROVAL_NOTICE'];
const NOTICE: string = typeof approvalNotice === 'string' ? approvalNotice : engine.DISCLAIMER;

export interface PreparedSheet {
  spec: SheetSpec;
  format: FormatSpec;
  skipped: SheetContent['kind'][];
  /** Notas sobre a diagramação (ex.: escala reduzida). */
  layoutNotes: string[];
  render: (index: number, total: number) => SheetDoc;
}

interface Item {
  content: SheetContent;
  rendered: RenderedContent;
}

const fileSlug = (name: string) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'projeto';

function nextScale(scales: number[], current: number): number | undefined {
  return [...scales].sort((a, b) => a - b).find((s) => s > current);
}

function captionWidth(r: RenderedContent): number {
  return textWidth(r.title, 3.5, true) + (r.scale ? 5 + textWidth(`ESC. 1:${r.scale}`, 2.5) : 0);
}

/** Prepara a folha de uma prancha: renderiza, escolhe formato e escala. Nulo quando nada pôde ser desenhado. */
export function prepareSheet(ctx: SheetContext, spec: SheetSpec, registry: RendererRegistry): PreparedSheet | null {
  const catalog = ctx.catalog;
  const ap = catalog.constants.approval;
  const skipped: SheetContent['kind'][] = [];
  const layoutNotes: string[] = [];
  const scales: (number | undefined)[] = spec.contents.map((c) => c.scale);
  const cache = new Map<string, RenderedContent | null>();
  const renderAt = (i: number, scale: number | undefined): RenderedContent | null => {
    const key = `${i}@${scale ?? '-'}`;
    if (!cache.has(key)) {
      const c = spec.contents[i]!;
      const fn = registry[c.kind];
      let out: RenderedContent | null = null;
      if (fn) {
        try {
          out = fn(ctx, c, scale ?? c.scale ?? 100);
        } catch {
          out = null;
        }
      }
      cache.set(key, out && out.width > 0 && out.height > 0 ? out : null);
    }
    return cache.get(key)!;
  };

  // Quais conteúdos existem (a escala inicial decide; se um renderizador devolve null, sai da folha).
  const alive: number[] = [];
  spec.contents.forEach((c, i) => {
    if (renderAt(i, scales[i])) alive.push(i);
    else skipped.push(c.kind);
  });
  if (alive.length === 0) return null;

  const fixed = ctx.project.legal.sheetFormat;
  const start: FormatId = fixed !== 'auto' ? fixed : spec.format;
  const fixedH = stampHeight(catalog) + revisionsHeight(ctx.project.legal.revisions.length) + ap.titleBlock.approvalBox.h;

  let items: Item[] = [];
  let chosen: { format: FormatSpec; pos: { x: number; y: number }[]; cells: { w: number; h: number }[] } | null = null;
  const fits = (): boolean => {
    items = alive.map((i) => ({ content: spec.contents[i]!, rendered: renderAt(i, scales[i])! }));
    const cells = items.map((it) => ({ w: Math.max(it.rendered.width, captionWidth(it.rendered)), h: it.rendered.height + CAPTION_H }));
    for (const f of formatsFrom(catalog, start)) {
      const g = sheetGeometry(catalog, f);
      if (g.frame.y1 - g.frame.y0 - fixedH < MIN_NOTES_H) continue;
      const pos = packBoxes(cells, g.draw.x1 - g.draw.x0, g.draw.y1 - g.draw.y0, CELL_GAP);
      if (pos) {
        chosen = { format: f, pos, cells };
        return true;
      }
    }
    return false;
  };

  let guard = 0;
  while (!fits() && guard++ < 40) {
    // Reduz a escala do maior conteúdo com escala, para a próxima da lista do catálogo.
    const cand = alive
      .map((i, k) => ({ i, k, area: (items[k]?.rendered.width ?? 0) * (items[k]?.rendered.height ?? 0) }))
      .filter((c) => scales[c.i] !== undefined && nextScale(ap.scales, scales[c.i]!) !== undefined)
      .sort((a, b) => b.area - a.area)[0];
    if (!cand) break;
    const old = scales[cand.i]!;
    const nw = nextScale(ap.scales, old)!;
    const fresh = renderAt(cand.i, nw);
    if (!fresh) break;
    scales[cand.i] = nw;
    layoutNotes.push(`Escala de "${spec.contents[cand.i]!.title}" reduzida de 1:${old} para 1:${nw} para caber no formato.`);
  }
  if (!chosen) {
    // Não coube nem reduzindo: A0 com o que houver.
    const f = formatById(catalog, 'A0');
    chosen = { format: f, pos: items.map(() => ({ x: 0, y: 0 })), cells: items.map((it) => ({ w: it.rendered.width, h: it.rendered.height + CAPTION_H })) };
    layoutNotes.push('Os desenhos não couberam no formato A0 nem com a escala reduzida.');
  }
  const done = chosen as { format: FormatSpec; pos: { x: number; y: number }[]; cells: { w: number; h: number }[] };
  const finalItems = items;

  const render = (index: number, total: number): SheetDoc => {
    const g = sheetGeometry(catalog, done.format);
    const W = done.format.w;
    const Hh = done.format.h;
    const parts: string[] = [];
    const defs: string[] = [];

    // Moldura.
    parts.push(rect(g.frame.x0, g.frame.y0, g.frame.x1 - g.frame.x0, g.frame.y1 - g.frame.y0, { fill: 'none', stroke: INK, 'stroke-width': 0.7 }));

    // Conteúdos.
    finalItems.forEach((it, k) => {
      const cell = done.cells[k]!;
      const p = done.pos[k]!;
      const ox = g.draw.x0 + p.x + (cell.w - it.rendered.width) / 2;
      const oy = g.draw.y0 + p.y;
      if (it.rendered.defs) defs.push(it.rendered.defs);
      parts.push(group(it.rendered.body, { transform: `translate(${ox.toFixed(2)} ${oy.toFixed(2)})`, 'data-content': it.content.kind, 'data-target': it.content.target }));
      // Título sublinhado e escala.
      const cy = oy + it.rendered.height + 6;
      const tw = textWidth(it.rendered.title, 3.5, true);
      const cx = g.draw.x0 + p.x;
      parts.push(
        text(cx + (cell.w - captionWidth(it.rendered)) / 2, cy, it.rendered.title, { 'font-size': 3.5, 'text-anchor': 'start', 'font-weight': 700, 'data-role': 'caption' }),
        line(cx + (cell.w - captionWidth(it.rendered)) / 2, cy + 1.2, cx + (cell.w - captionWidth(it.rendered)) / 2 + tw, cy + 1.2, { 'stroke-width': 0.35 }),
      );
      if (it.rendered.scale) {
        parts.push(text(cx + (cell.w - captionWidth(it.rendered)) / 2 + tw + 5, cy, `ESC. 1:${it.rendered.scale}`, { 'font-size': 2.5, 'text-anchor': 'start', 'data-role': 'scale' }));
      }
    });

    // Coluna da direita: da base para cima.
    const colW = g.column.x1 - g.column.x0;
    const stampH = stampHeight(catalog);
    const scaleSet = [...new Set(finalItems.map((it) => it.rendered.scale).filter((s): s is number => s !== undefined))];
    const scaleLabel = scaleSet.length === 0 ? 'S/ ESC.' : scaleSet.length === 1 ? `1:${scaleSet[0]}` : 'INDICADA';
    const fileName = ctx.fileName ?? `${fileSlug(ctx.project.meta.name)}-pranchas.pdf`;
    const stamp = stampData({ project: ctx.project, results: ctx.results, catalog, spec, scaleLabel, index, total, date: ctx.date ?? new Date(), fileName });
    const stampY = g.frame.y1 - stampH;
    parts.push(stampSvg(stamp, g.column.x0, stampY, colW, stampH));
    const revH = revisionsHeight(stamp.revisions.length);
    const revY = stampY - revH;
    parts.push(revisionsSvg(stamp, g.column.x0, revY, colW));
    const box = ap.titleBlock.approvalBox;
    const boxY = revY - box.h;
    parts.push(approvalBoxSvg(g.column.x1 - box.w, boxY, box.w, box.h));

    // Notas e legenda.
    const notes = [...finalItems.flatMap((it) => it.rendered.notes ?? []), ...layoutNotes];
    const dedupNotes = [...new Set(notes)];
    const legend: { symbol: string; label: string }[] = [];
    for (const it of finalItems) for (const l of it.rendered.legend ?? []) if (!legend.some((x) => x.label === l.label)) legend.push(l);
    parts.push(notesColumn(g.column.x0, g.frame.y0, colW, boxY - g.frame.y0 - 2, dedupNotes, legend));

    const body = parts.join('');
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Hh}" width="${W}mm" height="${Hh}mm" font-family="Helvetica, Arial, sans-serif">` +
      (defs.length ? `<defs>${defs.join('')}</defs>` : '') +
      rect(0, 0, W, Hh, { fill: '#ffffff' }) +
      body +
      '</svg>';
    return { spec, format: done.format.id, widthMm: W, heightMm: Hh, svg, index, total, skipped };
  };

  return { spec, format: done.format, skipped, layoutNotes, render };
}

/** Coluna de notas: título, notas numeradas, legenda de símbolos e o aviso. Reduz o corpo se não couber. */
function notesColumn(x: number, y: number, w: number, h: number, notes: string[], legend: { symbol: string; label: string }[]): string {
  const out: string[] = [rect(x, y, w, h, { fill: 'none', stroke: INK, 'stroke-width': 0.5 })];
  const pad = 2;
  const layout = (size: number) => {
    const lh = size * 1.45;
    const noticeSize = Math.min(size, 2);
    const noticeLines = wrap(NOTICE, w - pad * 2, noticeSize);
    const noteLines = notes.map((n, i) => wrap(`${i + 1}. ${n}`, w - pad * 2, size));
    const legendH = legend.length ? 4 + Math.ceil(legend.length / 2) * 7 : 0;
    const total = 5 + noteLines.reduce((s, l) => s + l.length * lh + 0.8, 0) + legendH + 3 + noticeLines.length * noticeSize * 1.4;
    return { lh, noticeSize, noticeLines, noteLines, legendH, total };
  };
  let size = 2.5;
  let L = layout(size);
  if (L.total > h) {
    size = 2.1;
    L = layout(size);
  }
  let cy = y + 4;
  out.push(text(x + pad, cy, 'NOTAS', { 'font-size': 2.8, 'text-anchor': 'start', 'font-weight': 700 }));
  cy += 1.5;
  const limit = y + h - 3 - L.noticeLines.length * L.noticeSize * 1.4 - L.legendH;
  for (const lines of L.noteLines) {
    for (const ln of lines) {
      cy += L.lh;
      if (cy > limit) break;
      out.push(text(x + pad, cy, ln, { 'font-size': size, 'text-anchor': 'start' }));
    }
    cy += 0.8;
  }
  if (legend.length) {
    let ly = y + h - 3 - L.noticeLines.length * L.noticeSize * 1.4 - L.legendH + 3;
    out.push(text(x + pad, ly, 'LEGENDA', { 'font-size': 2.8, 'text-anchor': 'start', 'font-weight': 700 }));
    ly += 2;
    legend.forEach((l, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const lx = x + pad + col * (w / 2);
      const yy = ly + row * 7 + 3;
      if (l.symbol.startsWith('<')) out.push(group(l.symbol, { transform: `translate(${(lx + 1).toFixed(2)} ${(yy - 3.6).toFixed(2)})` }));
      else out.push(text(lx + 5, yy, l.symbol, { 'font-size': 2.5, 'font-weight': 700 }));
      out.push(text(lx + 13, yy, fit(l.label, w / 2 - 15, 2.3), { 'font-size': 2.3, 'text-anchor': 'start' }));
    });
  }
  const ny = y + h - 2.5 - (L.noticeLines.length - 1) * L.noticeSize * 1.4;
  L.noticeLines.forEach((ln, i) => out.push(text(x + pad, ny + i * L.noticeSize * 1.4, ln, { 'font-size': L.noticeSize, 'text-anchor': 'start', fill: MUTED })));
  return group(out.join(''), { 'data-role': 'notes' });
}

export { COLUMN_GAP };
