/**
 * PDF vetorial das pranchas com `jspdf` (jsPDF 4.2.1), uma página por folha, tamanho real em mm. O SVG de cada folha é
 * desenhado por `renderSvgToPdf` como traços e texto (Helvetica padrão do PDF, WinAnsi: acentos pt-BR corretos e texto
 * selecionável). Não usa DOM, então roda no worker, no servidor e nos testes.
 */
import type { SheetDoc } from '../types';
import { renderSvgToPdf } from './render';

export interface PdfOptions {
  title?: string;
}

export async function sheetsToPdf(sheets: SheetDoc[], opts: PdfOptions = {}): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  if (sheets.length === 0) throw new Error('Nenhuma prancha para exportar.');
  const first = sheets[0]!;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [first.widthMm, first.heightMm], compress: true });
  doc.setProperties({ title: opts.title ?? 'Pranchas', creator: 'ChaléCAD', subject: 'Projeto legal: pranchas ABNT' });
  sheets.forEach((s, i) => {
    if (i > 0) doc.addPage([s.widthMm, s.heightMm], 'landscape');
    renderSvgToPdf(doc, s.svg, { widthMm: s.widthMm, heightMm: s.heightMm });
  });
  return doc.output('blob');
}

export { renderSvgToPdf } from './render';
