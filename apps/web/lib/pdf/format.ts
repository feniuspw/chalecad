/** Formatação pt-BR para o PDF. */
export const num = (n: number, d = 2) => n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
export const brl = (n: number, d = 2) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: d, maximumFractionDigits: d });
export const brl0 = (n: number) => brl(n, 0);
export const qty = (n: number) => (Number.isInteger(n) ? num(n, 0) : num(n, 2));

export function dateBR(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });
}
export function isoToBR(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
}
