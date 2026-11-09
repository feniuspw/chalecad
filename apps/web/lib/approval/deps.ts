'use client';
/** Dependências reais do pacote (navegador): pranchas (W1), DXF, PDF de quantitativos, CSVs e PDFs dos documentos. */
import { dxfBytes, exportDxf } from '../export/dxf';
import { exportBudgetCsv, exportPurchaseCsv } from '../export/csv';
import { renderPdfBlob } from '../pdf';
import { exportSheetsPdf } from '../sheets';
import { renderDocBytes } from '../../components/approval/pdf/render';
import type { PackDeps } from './pack';

const bytesOf = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

export const realPackDeps: PackDeps = {
  sheetsPdf: async (ctx) => bytesOf(await exportSheetsPdf(ctx)),
  dxf: (project, results) => dxfBytes(exportDxf(project, results.model, { installations: results.installations?.points })),
  quantitiesPdf: async (project, results) => bytesOf((await renderPdfBlob(project, results)).blob),
  csvs: (project, results) => [
    { name: 'compras-por-fornecedor.csv', text: exportPurchaseCsv(results, project) },
    { name: 'orcamento.csv', text: exportBudgetCsv(results, project) },
  ],
  renderDoc: renderDocBytes,
};
