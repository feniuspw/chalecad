/** Ids do traçado hidráulico: prefixo + 8 caracteres de um UUID (únicos, sem colidir com os `auto-*` do motor). */
export const plumbId = (prefix: 'pipe' | 'pt'): string => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
