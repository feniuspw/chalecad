import { describe, expect, it } from 'vitest';
import { formatMs, formatSavedAgo, slugify } from './format';

describe('format', () => {
  it('formata tempo desde o salvamento', () => {
    expect(formatSavedAgo(500)).toBe('Salvo agora');
    expect(formatSavedAgo(12_000)).toBe('Salvo há 12 s');
    expect(formatSavedAgo(3 * 60_000)).toBe('Salvo há 3 min');
    expect(formatSavedAgo(2 * 3600_000)).toBe('Salvo há 2 h');
  });
  it('slug sem acentos', () => {
    expect(slugify('Chalé São Lourenço 6,5 × 8,5')).toBe('chale-sao-lourenco-6-5-8-5');
    expect(slugify('***')).toBe('projeto');
  });
  it('formata milissegundos', () => {
    expect(formatMs(3.456)).toBe('3,5 ms');
    expect(formatMs(42.4)).toBe('42 ms');
  });
});
