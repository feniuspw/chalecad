/** Formatos da série A (NBR 10068): área útil, escolha e subida de formato. */
import type { Catalog } from '@chalecad/catalog';

export type FormatId = 'A0' | 'A1' | 'A2' | 'A3' | 'A4';

export interface FormatSpec {
  id: FormatId;
  w: number;
  h: number;
  marginLeft: number;
  margin: number;
}

export interface SheetGeometry {
  format: FormatSpec;
  /** Moldura (retângulo interno, dentro das margens). */
  frame: { x0: number; y0: number; x1: number; y1: number };
  /** Coluna da direita (notas, aprovação, carimbo), de largura `titleBlock.width`. */
  column: { x0: number; x1: number };
  /** Área de desenho, à esquerda da coluna. */
  draw: { x0: number; y0: number; x1: number; y1: number };
}

/** Afastamento entre a área de desenho e a coluna do carimbo. */
export const COLUMN_GAP = 4;
/** Respiro entre a moldura e os desenhos. */
export const DRAW_PAD = 5;

/** Formatos do catálogo do menor para o maior. */
export function formatsAscending(catalog: Catalog): FormatSpec[] {
  return [...catalog.constants.approval.sheetFormats].sort((a, b) => a.w * a.h - b.w * b.h);
}

export function formatById(catalog: Catalog, id: FormatId): FormatSpec {
  const f = catalog.constants.approval.sheetFormats.find((x) => x.id === id);
  if (!f) throw new Error(`Formato ${id} ausente do catálogo.`);
  return f;
}

/** Formatos candidatos a partir do inicial (sugerido ou fixo), subindo até A0. */
export function formatsFrom(catalog: Catalog, start: FormatId): FormatSpec[] {
  const all = formatsAscending(catalog);
  const i = all.findIndex((f) => f.id === start);
  return all.slice(Math.max(0, i));
}

export function sheetGeometry(catalog: Catalog, format: FormatSpec): SheetGeometry {
  const tb = catalog.constants.approval.titleBlock;
  const frame = { x0: format.marginLeft, y0: format.margin, x1: format.w - format.margin, y1: format.h - format.margin };
  const column = { x0: frame.x1 - tb.width, x1: frame.x1 };
  const draw = { x0: frame.x0 + DRAW_PAD, y0: frame.y0 + DRAW_PAD, x1: column.x0 - COLUMN_GAP - DRAW_PAD, y1: frame.y1 - DRAW_PAD };
  return { format, frame, column, draw };
}

export interface Box {
  w: number;
  h: number;
}
export interface Placed {
  x: number;
  y: number;
}

/**
 * Arruma caixas em linhas (prateleiras) dentro de `w × h` com `gap` entre elas. Tenta a ordem dada e, se não couber,
 * da mais alta para a mais baixa. Devolve as posições (centralizadas) ou null.
 */
export function packBoxes(boxes: Box[], w: number, h: number, gap: number): Placed[] | null {
  const attempt = (order: number[]): Placed[] | null => {
    const pos: Placed[] = new Array(boxes.length);
    const rows: { idx: number[]; w: number; h: number }[] = [];
    let row: { idx: number[]; w: number; h: number } | null = null;
    for (const i of order) {
      const b = boxes[i]!;
      if (b.w > w + 1e-6) return null;
      if (!row || row.w + gap + b.w > w + 1e-6) {
        row = { idx: [], w: 0, h: 0 };
        rows.push(row);
      }
      row.w += (row.idx.length ? gap : 0) + b.w;
      row.h = Math.max(row.h, b.h);
      row.idx.push(i);
    }
    const total = rows.reduce((s, r) => s + r.h, 0) + gap * (rows.length - 1);
    if (total > h + 1e-6) return null;
    let y = (h - total) / 2;
    for (const r of rows) {
      let x = (w - r.w) / 2;
      for (const i of r.idx) {
        const b = boxes[i]!;
        pos[i] = { x, y: y + (r.h - b.h) / 2 };
        x += b.w + gap;
      }
      y += r.h + gap;
    }
    return pos;
  };
  const natural = boxes.map((_, i) => i);
  const byHeight = [...natural].sort((a, b) => boxes[b]!.h - boxes[a]!.h);
  return attempt(natural) ?? attempt(byHeight);
}
