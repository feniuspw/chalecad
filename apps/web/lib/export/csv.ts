/**
 * Exportações CSV: separador `;`, decimais com vírgula e BOM UTF-8 (abre direto no Excel pt-BR).
 * Funções puras: recebem `Results` + `Project` e devolvem texto.
 */
import { getCatalog, STAGE_LABELS, STAGE_ORDER, type Catalog, type Material } from '@chalecad/catalog';
import type { BudgetLine, Project, Results } from '@chalecad/engine';

export const BOM = '﻿';
export const SEP = ';';

export type Cell = string | number | null | undefined;

/** Escapa um campo: aspas se tiver separador, aspas, quebra de linha; neutraliza fórmulas (=, +, -, @) em texto. */
export function csvCell(v: Cell): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? decimal(v) : '';
  let s = v;
  if (/^[=+\-@]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = `'${s}`;
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Número com vírgula decimal, sem milhar, até 4 casas sem zeros à direita. */
export function decimal(n: number): string {
  const s = Number(n.toFixed(4)).toString();
  return s.replace('.', ',');
}

/** Dinheiro com 2 casas e vírgula. */
export function money(n: number): string {
  return n.toFixed(2).replace('.', ',');
}

export function toCsv(rows: Cell[][]): string {
  return BOM + rows.map((r) => r.map(csvCell).join(SEP)).join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------------------
// Fornecedor (categoria derivada do catálogo)
// ---------------------------------------------------------------------------

export const SUPPLIERS = [
  'Aço LSF',
  'Placas e fechamento',
  'Concreto e fundação',
  'Cobertura',
  'Esquadrias',
  'Hidráulica',
  'Acabamento',
  'Serviços',
  'Outros',
] as const;
export type Supplier = (typeof SUPPLIERS)[number];

/** Casos em que o item foge da regra por categoria do material. */
const SUPPLIER_BY_ITEM: Record<string, Supplier> = {
  screw_board: 'Placas e fechamento',
  joint_tape: 'Placas e fechamento',
  joint_compound: 'Placas e fechamento',
  basecoat: 'Placas e fechamento',
  screw_roof: 'Cobertura',
  anchor_bolt: 'Concreto e fundação',
  hold_down: 'Concreto e fundação',
  lona_200: 'Concreto e fundação',
  edge_form: 'Concreto e fundação',
  pvc_sewer_100: 'Hidráulica',
  pvc_water_25: 'Hidráulica',
};

const SUPPLIER_BY_CATEGORY: Record<Material['category'], Supplier> = {
  board: 'Placas e fechamento',
  membrane: 'Placas e fechamento',
  insulation: 'Placas e fechamento',
  concrete: 'Concreto e fundação',
  aggregate: 'Concreto e fundação',
  steel_mesh: 'Concreto e fundação',
  masonry: 'Concreto e fundação',
  roofing: 'Cobertura',
  opening: 'Esquadrias',
  fastener: 'Aço LSF',
  finishing: 'Acabamento',
  fence: 'Acabamento',
  wood: 'Acabamento',
  furniture: 'Acabamento',
  misc: 'Acabamento',
  service: 'Serviços',
  earthwork: 'Serviços',
};

/** Fornecedor de um item do catálogo (perfil ou material). */
export function supplierOf(itemId: string, catalog: Catalog = getCatalog()): Supplier {
  if (catalog.profiles.some((p) => p.id === itemId)) return 'Aço LSF';
  const byItem = SUPPLIER_BY_ITEM[itemId];
  if (byItem) return byItem;
  const mat = catalog.materials.find((m) => m.id === itemId);
  return mat ? SUPPLIER_BY_CATEGORY[mat.category] : 'Outros';
}

/** Preço da unidade de compra por linha: o BudgetLine já traz o preço efetivo (base + overrides). */
function lineMap(results: Results): Map<string, BudgetLine> {
  return new Map(results.budget.lines.map((l) => [l.lineId, l]));
}

// ---------------------------------------------------------------------------
// Lista de compras por fornecedor
// ---------------------------------------------------------------------------

export function exportPurchaseCsv(results: Results, project: Project, catalog: Catalog = getCatalog()): string {
  const lines = lineMap(results);
  const groups = new Map<Supplier, { name: string; unit: string; qty: number; unitPrice: number; total: number; note: string }[]>();
  for (const q of results.quantities.lines) {
    const b = lines.get(q.id);
    const sup = supplierOf(q.itemId, catalog);
    const unitPrice = b?.unitPrice ?? 0;
    const row = {
      name: q.name,
      unit: q.unit,
      qty: q.purchaseQty,
      unitPrice,
      total: b?.material ?? q.purchaseQty * unitPrice,
      note: b?.missing ? 'sem preço' : b?.stale ? 'preço desatualizado' : '',
    };
    const arr = groups.get(sup) ?? [];
    arr.push(row);
    groups.set(sup, arr);
  }

  const rows: Cell[][] = [[`Lista de compras: ${project.meta.name}`], []];
  let grand = 0;
  for (const sup of SUPPLIERS) {
    const items = groups.get(sup);
    if (!items?.length) continue;
    items.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    rows.push([`Fornecedor: ${sup}`]);
    rows.push(['Item', 'Unidade', 'Quantidade', 'Preço unitário (R$)', 'Total (R$)', 'Observação']);
    let sub = 0;
    for (const it of items) {
      rows.push([it.name, it.unit, it.qty, money(it.unitPrice), money(it.total), it.note]);
      sub += it.total;
    }
    rows.push([`Subtotal ${sup}`, '', '', '', money(sub), '']);
    rows.push([]);
    grand += sub;
  }
  rows.push(['Total de materiais', '', '', '', money(grand), '']);
  return toCsv(rows);
}

// ---------------------------------------------------------------------------
// Orçamento
// ---------------------------------------------------------------------------

export function exportBudgetCsv(results: Results, project: Project): string {
  const b = results.budget;
  const rows: Cell[][] = [[`Orçamento: ${project.meta.name}`], [], ['Resumo por etapa']];
  rows.push(['Etapa', 'Material (R$)', 'Mão de obra (R$)', 'Frete (R$)', 'Total (R$)', 'Total máx. (R$)', 'Eu faço']);
  const stages = [...b.byStage].sort((x, y) => STAGE_ORDER.indexOf(x.stage) - STAGE_ORDER.indexOf(y.stage));
  for (const s of stages) {
    rows.push([STAGE_LABELS[s.stage], money(s.material), money(s.labor), money(s.freight), money(s.total), money(s.totalMax), s.diy ? 'sim' : 'não']);
  }
  rows.push([], ['Totais']);
  rows.push(['Material', money(b.material)]);
  rows.push(['Mão de obra', money(b.labor)]);
  rows.push(['Frete', money(b.freight)]);
  rows.push(['Subtotal', money(b.subtotal)]);
  rows.push([`Contingência (${decimal(project.budget.contingencyPct)}%)`, money(b.contingency)]);
  rows.push(['Total', money(b.total)]);
  rows.push(['Total máximo', money(b.totalMax)]);
  rows.push(['R$/m²', money(b.perM2)]);

  rows.push([], ['Linhas do orçamento']);
  rows.push(['Etapa', 'Item', 'Unidade', 'Quantidade', 'Preço unitário (R$)', 'Preço unitário máx. (R$)', 'Material (R$)', 'Material máx. (R$)', 'Data do preço', 'Fonte', 'Situação']);
  const ordered = [...b.lines].sort((x, y) => STAGE_ORDER.indexOf(x.stage) - STAGE_ORDER.indexOf(y.stage));
  for (const l of ordered) {
    const status = l.missing ? 'sem preço' : l.stale ? 'desatualizado' : l.overridden ? 'editado' : 'ok';
    rows.push([STAGE_LABELS[l.stage], l.name, l.unit, l.qty, money(l.unitPrice), money(l.unitPriceMax), money(l.material), money(l.materialMax), l.priceDate ?? '', l.priceSource ?? '', status]);
  }

  if (b.schedule.length > 0) {
    rows.push([], ['Cronograma de desembolso'], ['Semana', 'Valor (R$)', 'Etapas']);
    for (const w of b.schedule) rows.push([w.week, money(w.amount), w.stages.map((s) => STAGE_LABELS[s]).join(', ')]);
  }
  return toCsv(rows);
}

// ---------------------------------------------------------------------------
// Base de preços efetiva (mesmas colunas da importação)
// ---------------------------------------------------------------------------

export const PRICE_CSV_HEADER = ['itemId', 'preco', 'precoMax', 'data', 'fonte', 'nome', 'unidade'] as const;

export function exportPricesCsv(results: Results): string {
  const byLine = new Map(results.quantities.lines.map((q) => [q.id, q.priceItemId]));
  const seen = new Set<string>();
  const rows: Cell[][] = [[...PRICE_CSV_HEADER]];
  for (const l of results.budget.lines) {
    const id = byLine.get(l.lineId);
    if (!id || seen.has(id) || l.missing) continue;
    seen.add(id);
    rows.push([id, money(l.unitPrice), money(l.unitPriceMax), l.priceDate ?? '', l.priceSource ?? '', l.name, l.unit]);
  }
  return toCsv(rows);
}
