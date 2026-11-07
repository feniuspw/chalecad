/** Número em pt-BR com `d` casas (vírgula decimal). Nunca devolve "NaN". */
export function nf(v: number, d = 2): string {
  if (!Number.isFinite(v)) return '—';
  return v.toFixed(d).replace('.', ',');
}

export function signed(v: number, d = 0): string {
  return `${v >= 0 ? '+' : '-'}${nf(Math.abs(v), d)}`;
}
