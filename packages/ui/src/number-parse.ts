/** Aceita "1,25", "1.25", " 2 m " etc. Retorna null se não for número. */
export function parseDecimal(text: string): number | null {
  const cleaned = text.trim().replace(/\s+/g, '').replace(/[^0-9,.\-+eE]/g, '');
  if (cleaned === '') return null;
  // "1.234,5" (pt-BR com milhar) -> 1234.5 ; "1,5" -> 1.5 ; "1.5" -> 1.5
  let normalized = cleaned;
  if (cleaned.includes(',')) normalized = cleaned.replace(/\./g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function clampNumber(n: number, min?: number, max?: number): number {
  let r = n;
  if (min !== undefined) r = Math.max(min, r);
  if (max !== undefined) r = Math.min(max, r);
  return r;
}

/** Arredonda ao passo (evita 0,30000000000004) e limita a `decimals` casas. */
export function snapToStep(n: number, step: number, decimals: number): number {
  const snapped = step > 0 ? Math.round(n / step) * step : n;
  return Number(snapped.toFixed(decimals));
}

export function formatDecimal(n: number, decimals: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: decimals, useGrouping: false });
}
