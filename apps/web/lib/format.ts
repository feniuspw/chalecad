/** Formatação pt-BR de valores do orçamento e dos quantitativos. */

const nf = (digits: number) => ({ minimumFractionDigits: digits, maximumFractionDigits: digits });
const safe = (n: number) => (Number.isFinite(n) ? n : 0);

/** "1.234,5" com `digits` casas fixas. */
export function formatNumber(n: number, digits = 2): string {
  return safe(n).toLocaleString('pt-BR', nf(digits));
}

/** "R$ 1.234,00". `digits` = 0 para totais grandes. */
export function formatBRL(n: number, digits = 2): string {
  return safe(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', ...nf(digits) });
}

/** "R$ 100 a R$ 120"; vira um valor só quando mín e máx coincidem (após arredondar). */
export function formatBRLRange(min: number, max: number, digits = 0): string {
  const a = formatBRL(min, digits);
  const b = formatBRL(max, digits);
  return a === b ? a : `${a} a ${b}`;
}

/** "52,3 m²". */
export function formatArea(m2: number, digits = 1): string {
  return `${formatNumber(m2, digits)} m²`;
}

/** "850 kg", "1.234 kg" e, a partir de 2 t, "3,2 t". */
export function formatKg(kg: number): string {
  const v = safe(kg);
  if (Math.abs(v) >= 2000) return `${formatNumber(v / 1000, 1)} t`;
  return `${formatNumber(v, 0)} kg`;
}

/** "2,45 m". */
export function formatLength(m: number, digits = 2): string {
  return `${formatNumber(m, digits)} m`;
}

/** "12,5%". */
export function formatPercent(pct: number, digits = 1): string {
  return `${formatNumber(pct, digits)}%`;
}

/** Data ISO (aaaa-mm-dd) para "01/11/2026". Entradas fora do padrão voltam como vieram; null vira "—". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Data de hoje (calendário local) no formato aaaa-mm-dd. */
export function todayIso(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
