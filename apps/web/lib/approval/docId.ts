/** CPF/CNPJ: máscara e validação dos dígitos verificadores; registro CAU. Puro. */

export const onlyDigits = (s: string) => s.replace(/\D/g, '');

/** Aplica a máscara enquanto digita: até 11 dígitos = CPF (000.000.000-00); mais que isso = CNPJ (00.000.000/0000-00). */
export function maskDoc(raw: string): string {
  const d = onlyDigits(raw).slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1-$2');
  }
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

const allEqual = (d: string) => /^(\d)\1+$/.test(d);

export function isValidCpf(raw: string): boolean {
  const d = onlyDigits(raw);
  if (d.length !== 11 || allEqual(d)) return false;
  for (const n of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Number(d[i]) * (n + 1 - i);
    const dv = ((sum * 10) % 11) % 10;
    if (dv !== Number(d[n])) return false;
  }
  return true;
}

export function isValidCnpj(raw: string): boolean {
  const d = onlyDigits(raw);
  if (d.length !== 14 || allEqual(d)) return false;
  const calc = (len: number) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = w.reduce((s, x, i) => s + x * Number(d[i]), 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export type DocStatus = 'empty' | 'incomplete' | 'valid' | 'invalid';

/** Estado do documento digitado: vazio, incompleto (ainda digitando), válido ou inválido (dígito errado). */
export function docStatus(raw: string): DocStatus {
  const d = onlyDigits(raw);
  if (d.length === 0) return 'empty';
  if (d.length === 11) return isValidCpf(d) ? 'valid' : 'invalid';
  if (d.length === 14) return isValidCnpj(d) ? 'valid' : 'invalid';
  return 'incomplete';
}

/** Registro CAU no formato A000000-0 (só aviso, nunca bloqueia). */
export const isCauRegistry = (s: string) => /^[A-Za-z]\d{6}-\d$/.test(s.trim());

export function maskCep(raw: string): string {
  const d = onlyDigits(raw).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}
