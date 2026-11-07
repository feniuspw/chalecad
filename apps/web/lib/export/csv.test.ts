import { describe, expect, it } from 'vitest';
import { computeAll, loadProject } from '@chalecad/engine';
import { getCatalog } from '@chalecad/catalog';
import fixture from '../../../../packages/engine/fixtures/gable-6.5x8.5-mezzanine.json';
import { BOM, csvCell, exportBudgetCsv, exportPricesCsv, exportPurchaseCsv, supplierOf, toCsv } from './csv';
import { parsePriceCsv, parsePriceNumber } from './price-import';

const catalog = getCatalog();
const loaded = loadProject(fixture);
if (!loaded.ok) throw new Error('fixture inválido');
const project = loaded.project;
const results = computeAll(project, catalog, { today: '2026-11-07' });

const parse = (csv: string) => csv.replace(BOM, '').trimEnd().split('\r\n').map((l) => l.split(';'));

describe('csv básico', () => {
  it('escapa campos e neutraliza fórmulas', () => {
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('diz "oi"')).toBe('"diz ""oi"""');
    expect(csvCell('=SOMA(A1)')).toBe("'=SOMA(A1)");
    expect(csvCell(1.5)).toBe('1,5');
    expect(csvCell(null)).toBe('');
  });
  it('começa com BOM e usa CRLF', () => {
    const t = toCsv([['a', 'b'], ['c', 1]]);
    expect(t.startsWith(BOM)).toBe(true);
    expect(t).toBe(`${BOM}a;b\r\nc;1\r\n`);
  });
});

describe('supplierOf', () => {
  it('deriva do catálogo', () => {
    expect(supplierOf('Ue90x40x0.95')).toBe('Aço LSF');
    expect(supplierOf('osb_11')).toBe('Placas e fechamento');
    expect(supplierOf('concrete_fck25')).toBe('Concreto e fundação');
    expect(supplierOf('sandwich_eps30')).toBe('Cobertura');
    expect(supplierOf('window_alu')).toBe('Esquadrias');
    expect(supplierOf('pvc_water_25')).toBe('Hidráulica');
    expect(supplierOf('sealer')).toBe('Acabamento');
    expect(supplierOf('joint_cut')).toBe('Serviços');
    expect(supplierOf('inexistente')).toBe('Outros');
  });
});

describe('exportPurchaseCsv', () => {
  const csv = exportPurchaseCsv(results, project);
  const rows = parse(csv);
  it('agrupa por fornecedor com subtotal e total', () => {
    expect(csv.startsWith(BOM)).toBe(true);
    const heads = rows.filter((r) => r[0]?.startsWith('Fornecedor: ')).map((r) => r[0]);
    expect(heads).toContain('Fornecedor: Aço LSF');
    expect(heads).toContain('Fornecedor: Cobertura');
    expect(rows.some((r) => r[0] === 'Item' && r[3] === 'Preço unitário (R$)')).toBe(true);
    const total = rows.find((r) => r[0] === 'Total de materiais');
    expect(total).toBeDefined();
    expect(Number(total![4]!.replace(',', '.'))).toBeCloseTo(results.budget.material, 1);
  });
  it('tem uma linha por item de compra', () => {
    const itemRows = rows.filter((r) => r.length === 6 && !r[0]!.startsWith('Subtotal') && r[0] !== 'Item' && r[1] !== '' );
    expect(itemRows.length).toBe(results.quantities.lines.length);
  });
});

describe('exportBudgetCsv', () => {
  const rows = parse(exportBudgetCsv(results, project));
  it('traz resumo, totais e linhas', () => {
    expect(rows.some((r) => r[0] === 'Resumo por etapa')).toBe(true);
    expect(rows.find((r) => r[0] === 'Total')?.[1]).toBe(results.budget.total.toFixed(2).replace('.', ','));
    expect(rows.filter((r) => r.length === 11 && r[0] !== 'Etapa').length).toBe(results.budget.lines.length);
  });
});

describe('preços: exportar e importar', () => {
  const csv = exportPricesCsv(results);
  it('exporta a base efetiva no formato de importação', () => {
    expect(parse(csv)[0]!.slice(0, 5)).toEqual(['itemId', 'preco', 'precoMax', 'data', 'fonte']);
  });
  it('reimporta o que exportou', () => {
    const known = new Set(results.quantities.lines.map((l) => l.priceItemId));
    const p = parsePriceCsv(csv, known, '2026-11-07');
    expect(p.ignored).toBe(0);
    expect(p.accepted.length).toBeGreaterThan(10);
  });
});

describe('parsePriceCsv', () => {
  const known = new Set(['a', 'b']);
  it('números pt-BR e en', () => {
    expect(parsePriceNumber('R$ 1.234,56')).toBe(1234.56);
    expect(parsePriceNumber('12,5')).toBe(12.5);
    expect(parsePriceNumber('1.234')).toBe(1234);
    expect(parsePriceNumber('12.5')).toBe(12.5);
    expect(parsePriceNumber('1,234.5')).toBe(1234.5);
    expect(parsePriceNumber('abc')).toBeNull();
  });
  it('separador ; com vírgula decimal, data e fonte', () => {
    const r = parsePriceCsv('itemId;preco;precoMax;data;fonte\na;10,5;12,0;01/11/2026;Loja X\nb;3', known, '2026-11-07');
    expect(r.accepted).toEqual([
      { itemId: 'a', price: 10.5, priceMax: 12, date: '2026-11-01', source: 'Loja X' },
      { itemId: 'b', price: 3, date: '2026-11-07', source: 'importação CSV' },
    ]);
  });
  it('separador vírgula, sem cabeçalho, e linhas ignoradas', () => {
    const r = parsePriceCsv('a,10.5\nzzz,1\nb,xx\n\nb,5,4', known, '2026-11-07');
    expect(r.accepted.map((x) => x.itemId)).toEqual(['a']);
    expect(r.rows.map((x) => x.reason)).toEqual([undefined, 'Item desconhecido', 'Preço inválido', 'Preço máximo inválido']);
    expect(r.ignored).toBe(3);
  });
  it('cabeçalho em outra ordem', () => {
    const r = parsePriceCsv('preço;item\n7,5;b', known, '2026-11-07');
    expect(r.accepted[0]).toMatchObject({ itemId: 'b', price: 7.5 });
  });
});
