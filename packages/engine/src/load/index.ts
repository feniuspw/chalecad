import type { z } from 'zod';
import { Project, SCHEMA_VERSION } from '../schema/project';

export type LoadIssue = { path: string; message: string };
export type LoadResult =
  | { ok: true; project: Project; migrated: boolean }
  | { ok: false; issues: LoadIssue[] };

/**
 * Migrações por versão de origem: `migrations[n]` leva um projeto da versão n para n + 1.
 * Vazio enquanto só existe a versão 1.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const migrations: Record<number, (p: any) => any> = {};

const TYPE_PT: Record<string, string> = {
  string: 'texto',
  number: 'número',
  boolean: 'verdadeiro/falso',
  object: 'objeto',
  array: 'lista',
  tuple: 'lista',
  int: 'inteiro',
  null: 'nulo',
  undefined: 'vazio',
  record: 'objeto',
};
const tp = (t: unknown) => TYPE_PT[String(t)] ?? String(t);

type ZIssue = z.core.$ZodIssue;

function translate(issue: ZIssue): string {
  const i = issue as ZIssue & Record<string, unknown>;
  switch (i.code) {
    case 'invalid_type': {
      if (/received undefined/.test(i.message)) return 'Campo obrigatório.';
      return `Tipo inválido: esperado ${tp(i.expected)}.`;
    }
    case 'too_small': {
      const min = String(i.minimum);
      if (i.origin === 'string') return `Mínimo de ${min} caracteres.`;
      if (i.origin === 'array' || i.origin === 'set') return `Mínimo de ${min} itens.`;
      return i.inclusive === false ? `O valor deve ser maior que ${min}.` : `O valor mínimo é ${min}.`;
    }
    case 'too_big': {
      const max = String(i.maximum);
      if (i.origin === 'string') return `Máximo de ${max} caracteres.`;
      if (i.origin === 'array' || i.origin === 'set') return `Máximo de ${max} itens.`;
      return i.inclusive === false ? `O valor deve ser menor que ${max}.` : `O valor máximo é ${max}.`;
    }
    case 'invalid_value': {
      const values = Array.isArray(i.values) ? (i.values as unknown[]).map((v) => JSON.stringify(v)) : [];
      if (values.length === 1) return `O valor deve ser ${values[0]}.`;
      return `Valor inválido. Opções: ${values.join(', ')}.`;
    }
    case 'invalid_union':
      return 'Valor não corresponde a nenhuma das opções válidas.';
    case 'invalid_format':
      return /regex|pattern/i.test(String(i.format)) ? 'Formato inválido.' : `Formato inválido (${String(i.format)}).`;
    case 'not_multiple_of':
      return `O valor deve ser múltiplo de ${String(i.divisor)}.`;
    case 'unrecognized_keys':
      return `Campos desconhecidos: ${Array.isArray(i.keys) ? (i.keys as string[]).join(', ') : ''}.`;
    case 'custom':
      return i.message;
    default:
      return i.message || 'Valor inválido.';
  }
}

const fmtPath = (path: PropertyKey[]) => path.map(String).join('.');

export function loadProject(json: unknown): LoadResult {
  let data: unknown = json;
  if (typeof json === 'string') {
    try {
      data = JSON.parse(json);
    } catch (e) {
      const detail = e instanceof Error ? ` (${e.message})` : '';
      return { ok: false, issues: [{ path: '', message: `JSON inválido: erro de sintaxe${detail}.` }] };
    }
  }

  let migrated = false;
  if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
    let v = (data as Record<string, unknown>).schemaVersion;
    if (typeof v === 'number' && Number.isInteger(v) && v < SCHEMA_VERSION) {
      let cur: unknown = data;
      while (typeof v === 'number' && v < SCHEMA_VERSION) {
        const step = migrations[v];
        if (!step) {
          return {
            ok: false,
            issues: [{ path: 'schemaVersion', message: `Não há migração da versão ${v} do projeto para a ${v + 1}.` }],
          };
        }
        cur = step(cur);
        migrated = true;
        v = v + 1;
        if (cur !== null && typeof cur === 'object') (cur as Record<string, unknown>).schemaVersion = v;
      }
      data = cur;
    }
  }

  const r = Project.safeParse(data);
  if (!r.success) {
    return { ok: false, issues: r.error.issues.map((i) => ({ path: fmtPath(i.path), message: translate(i) })) };
  }
  return { ok: true, project: r.data, migrated };
}
