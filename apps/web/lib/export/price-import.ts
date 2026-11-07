/** Importação de preços por CSV: `itemId;preco;precoMax?;data?;fonte?` (aceita `,`, `;` ou tab; vírgula decimal). */

export interface ImportedPrice {
  itemId: string;
  price: number;
  priceMax?: number;
  date: string;
  source: string;
}

export interface ImportRow {
  /** Linha no texto original (1 = primeira). */
  line: number;
  raw: string;
  ok: boolean;
  reason?: string;
  value?: ImportedPrice;
}

export interface ImportPreview {
  rows: ImportRow[];
  accepted: ImportedPrice[];
  ignored: number;
}

export const DEFAULT_IMPORT_SOURCE = 'importação CSV';

/** Escolhe o separador pela primeira linha com conteúdo: `;` > tab > `,`. */
export function detectSeparator(text: string): ';' | '\t' | ',' {
  if (text.includes(';')) return ';';
  if (text.includes('\t')) return '\t';
  return ',';
}

/** Divide uma linha respeitando aspas. */
export function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** "R$ 1.234,56", "1234,5", "1,234.56", "12.5" -> número; null se inválido. */
export function parsePriceNumber(text: string): number | null {
  const s = text.replace(/R\$|\s/g, '');
  if (!/^-?[\d.,]+$/.test(s)) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let norm: string;
  if (lastComma >= 0 && lastDot >= 0) {
    norm = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    norm = s.replace(/,/g, (_m, off: number) => (off === lastComma ? '.' : ''));
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    norm = s.replace(/\./g, '');
  } else norm = s;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

/** "2026-11-01" ou "01/11/2026" -> ISO; null se inválida. */
export function parseDateLoose(text: string): string | null {
  const t = text.trim();
  let y: number, m: number, d: number;
  let mt = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (mt) [y, m, d] = [Number(mt[1]), Number(mt[2]), Number(mt[3])] as [number, number, number];
  else if ((mt = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t))) [d, m, y] = [Number(mt[1]), Number(mt[2]), Number(mt[3])] as [number, number, number];
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

type Col = 'itemId' | 'price' | 'priceMax' | 'date' | 'source';
const ALIASES: Record<string, Col> = {
  itemid: 'itemId',
  item: 'itemId',
  id: 'itemId',
  codigo: 'itemId',
  preco: 'price',
  price: 'price',
  precomin: 'price',
  precomax: 'priceMax',
  pricemax: 'priceMax',
  data: 'date',
  date: 'date',
  fonte: 'source',
  source: 'source',
};
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');

/**
 * Lê o texto e classifica cada linha. `known` = IDs de preço aceitos (base + linhas do orçamento);
 * `today` e `defaultSource` preenchem data e fonte ausentes.
 */
export function parsePriceCsv(text: string, known: ReadonlySet<string>, today: string): ImportPreview {
  const clean = text.replace(/^\uFEFF/, '');
  const sep = detectSeparator(clean);
  const rows: ImportRow[] = [];
  let cols: Col[] = ['itemId', 'price', 'priceMax', 'date', 'source'];
  let headerChecked = false;
  const lines = clean.split(/\r\n|\n|\r/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    if (raw.trim() === '') continue;
    const cells = splitLine(raw, sep);
    if (!headerChecked) {
      headerChecked = true;
      const mapped = cells.map((c) => ALIASES[norm(c)]);
      if (mapped.includes('price') && mapped.includes('itemId')) {
        cols = mapped.map((m, idx) => m ?? (`ignored${idx}` as Col));
        continue;
      }
      if (parsePriceNumber(cells[1] ?? '') === null && cells[0] !== undefined && /^(item|id)/i.test(norm(cells[0]))) continue;
    }
    const get = (c: Col) => {
      const idx = cols.indexOf(c);
      return idx >= 0 ? (cells[idx] ?? '') : '';
    };
    const fail = (reason: string): ImportRow => ({ line: i + 1, raw, ok: false, reason });
    const itemId = get('itemId');
    if (!itemId) {
      rows.push(fail('Sem ID do item'));
      continue;
    }
    if (!known.has(itemId)) {
      rows.push(fail('Item desconhecido'));
      continue;
    }
    const price = parsePriceNumber(get('price'));
    if (price === null || price < 0) {
      rows.push(fail('Preço inválido'));
      continue;
    }
    const maxText = get('priceMax');
    let priceMax: number | undefined;
    if (maxText !== '') {
      const mx = parsePriceNumber(maxText);
      if (mx === null || mx < price) {
        rows.push(fail('Preço máximo inválido'));
        continue;
      }
      priceMax = mx;
    }
    const dateText = get('date');
    const date = dateText === '' ? today : parseDateLoose(dateText);
    if (date === null) {
      rows.push(fail('Data inválida'));
      continue;
    }
    const value: ImportedPrice = { itemId, price, date, source: (get('source') || DEFAULT_IMPORT_SOURCE).slice(0, 120) };
    if (priceMax !== undefined && priceMax !== price) value.priceMax = priceMax;
    rows.push({ line: i + 1, raw, ok: true, value });
  }
  const accepted = rows.flatMap((r) => (r.ok && r.value ? [r.value] : []));
  return { rows, accepted, ignored: rows.length - accepted.length };
}
