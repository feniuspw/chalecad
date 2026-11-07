import { describe, expect, it } from 'vitest';
import { formatArea, formatBRL, formatBRLRange, formatDate, formatKg, formatLength, formatNumber, formatPercent, todayIso } from './format';

const plain = (s: string) => s.replace(/\u00a0/g, ' ');

describe('format pt-BR', () => {
  it('formatBRL', () => {
    expect(plain(formatBRL(139000.5))).toBe('R$ 139.000,50');
    expect(plain(formatBRL(1234.567, 0))).toBe('R$ 1.235');
    expect(plain(formatBRL(Number.NaN))).toBe('R$ 0,00');
  });
  it('formatBRLRange', () => {
    expect(plain(formatBRLRange(100000, 120000))).toBe('R$ 100.000 a R$ 120.000');
    expect(plain(formatBRLRange(100, 100.2))).toBe('R$ 100');
  });
  it('formatNumber e formatPercent', () => {
    expect(formatNumber(1234.5, 1)).toBe('1.234,5');
    expect(formatNumber(3, 2)).toBe('3,00');
    expect(formatPercent(5.25)).toBe('5,3%');
  });
  it('formatArea e formatLength', () => {
    expect(plain(formatArea(52.34))).toBe('52,3 m²');
    expect(formatLength(2.4)).toBe('2,40 m');
  });
  it('formatKg', () => {
    expect(formatKg(850)).toBe('850 kg');
    expect(formatKg(1234)).toBe('1.234 kg');
    expect(formatKg(3200)).toBe('3,2 t');
  });
  it('formatDate', () => {
    expect(formatDate('2026-11-01')).toBe('01/11/2026');
    expect(formatDate(null)).toBe('—');
    expect(formatDate('ontem')).toBe('ontem');
  });
  it('todayIso', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
