import { describe, expect, it } from 'vitest';
import { docStatus, isCauRegistry, isValidCnpj, isValidCpf, maskDoc } from './docId';

describe('CPF/CNPJ', () => {
  it('máscara conforme digita', () => {
    expect(maskDoc('123')).toBe('123');
    expect(maskDoc('1234')).toBe('123.4');
    expect(maskDoc('12345678909')).toBe('123.456.789-09');
    expect(maskDoc('11222333000181')).toBe('11.222.333/0001-81');
    expect(maskDoc('112223330001819999')).toBe('11.222.333/0001-81');
    expect(maskDoc('abc')).toBe('');
  });
  it('valida os dígitos do CPF', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('529.982.247-24')).toBe(false);
    expect(isValidCpf('111.111.111-11')).toBe(false);
  });
  it('valida os dígitos do CNPJ', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11.222.333/0001-80')).toBe(false);
    expect(isValidCnpj('00.000.000/0000-00')).toBe(false);
  });
  it('estado do campo', () => {
    expect(docStatus('')).toBe('empty');
    expect(docStatus('123.4')).toBe('incomplete');
    expect(docStatus('529.982.247-25')).toBe('valid');
    expect(docStatus('529.982.247-24')).toBe('invalid');
  });
  it('registro CAU', () => {
    expect(isCauRegistry('A123456-7')).toBe(true);
    expect(isCauRegistry('123456')).toBe(false);
  });
});
