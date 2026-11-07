/** Formatação pt-BR e utilitários de texto. */
export const fmt = (n: number, d = 2) => n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

/** "Salvo há 12 s", "Salvo há 3 min", "Salvo há 2 h"; `agora` nos primeiros 3 s. */
export function formatSavedAgo(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 3) return 'Salvo agora';
  if (s < 60) return `Salvo há ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `Salvo há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Salvo há ${h} h`;
  return `Salvo há ${Math.floor(h / 24)} d`;
}

/** Nome de arquivo seguro a partir do nome do projeto. */
export function slugify(name: string): string {
  const s = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'projeto';
}

export function formatMs(ms: number): string {
  return ms < 10 ? `${ms.toFixed(1).replace('.', ',')} ms` : `${Math.round(ms)} ms`;
}
