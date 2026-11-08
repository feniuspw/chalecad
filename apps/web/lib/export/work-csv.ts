/** Lista de compras com status (aba Obra). Mesmo formato dos demais CSV: `;`, vírgula decimal e BOM. */
import { STAGE_LABELS, getCatalog, type Catalog } from '@chalecad/catalog';
import type { Project, Results } from '@chalecad/engine';
import { buyBy, ganttRows, isoToBR, purchaseList, todayISO } from '../project/work';
import { money, toCsv, type Cell } from './csv';

export function exportWorkPurchaseCsv(results: Results, project: Project, catalog: Catalog = getCatalog(), today: string = todayISO()): string {
  const list = purchaseList(results, project.progress, catalog);
  const starts = new Map(ganttRows(project, results, catalog).map((r) => [r.stage, { start: r.start, startDate: r.startDate }]));
  const rows: Cell[][] = [
    [`Compras da obra: ${project.meta.name}`],
    [],
    ['Etapa', 'Item', 'Unidade', 'Quantidade', 'Orçado (R$)', 'Comprado', 'Data da compra', 'Pago (R$)', 'Pago − orçado (R$)', 'Comprar até'],
  ];
  for (const g of list.groups) {
    const st = starts.get(g.stage) ?? { start: 0, startDate: null };
    for (const r of g.rows) {
      const by = buyBy(r, st, catalog.constants.leadTimes, today);
      rows.push([
        STAGE_LABELS[g.stage],
        r.name,
        r.unit,
        r.qty,
        money(r.estimated),
        r.bought ? 'Sim' : 'Não',
        r.boughtAt ? isoToBR(r.boughtAt) : '',
        r.paid !== null ? money(r.paid) : '',
        r.diff !== null ? money(r.diff) : '',
        by ? (by.date ? isoToBR(by.date) : by.label) : '',
      ]);
    }
  }
  rows.push([]);
  const t = list.totals;
  rows.push(['Total orçado', '', '', '', money(t.estimated)]);
  rows.push(['Total pago', '', '', '', '', '', '', money(t.paid)]);
  rows.push(['Falta comprar (orçado)', '', '', '', money(t.remaining)]);
  return toCsv(rows);
}
