export type IdPrefix = 'w' | 'o' | 's' | 'u' | 'L' | 'x';
export type IdGen = (prefix: IdPrefix) => string;

/** IDs curtos e únicos: prefixo + 8 caracteres de um UUID. */
export const newId: IdGen = (prefix) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
