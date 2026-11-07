import { describe, expect, it } from 'vitest';
import { clampNumber, formatDecimal, parseDecimal, snapToStep } from './number-parse';

describe('parseDecimal', () => {
  it('aceita vírgula e ponto', () => {
    expect(parseDecimal('1,25')).toBe(1.25);
    expect(parseDecimal('1.25')).toBe(1.25);
    expect(parseDecimal(' 6,5 m')).toBe(6.5);
    expect(parseDecimal('1.234,5')).toBe(1234.5);
    expect(parseDecimal('-0,3')).toBe(-0.3);
  });
  it('rejeita lixo', () => {
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
  });
});

describe('clamp/snap/format', () => {
  it('clamp', () => {
    expect(clampNumber(9, 0, 5)).toBe(5);
    expect(clampNumber(-1, 0)).toBe(0);
  });
  it('snap evita ruído de ponto flutuante', () => {
    expect(snapToStep(0.30000000000000004, 0.05, 2)).toBe(0.3);
  });
  it('formata em pt-BR', () => {
    expect(formatDecimal(6.5, 2)).toBe('6,5');
    expect(formatDecimal(1234.5, 2)).toBe('1234,5');
  });
});
