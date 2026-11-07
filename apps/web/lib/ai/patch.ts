/**
 * Subconjunto de JSON Patch (RFC 6902): `replace`, `add` e `remove` com JSON Pointer (RFC 6901).
 * `applyJsonPatch` altera o documento no lugar (serve com drafts do Immer); falha com `PatchError`.
 */

export type JsonPatchOp =
  | { op: 'replace'; path: string; value: unknown }
  | { op: 'add'; path: string; value: unknown }
  | { op: 'remove'; path: string };

export class PatchError extends Error {
  constructor(
    message: string,
    readonly index: number,
  ) {
    super(`Operação ${index + 1}: ${message}`);
    this.name = 'PatchError';
  }
}

const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
const isContainer = (v: unknown): v is Record<string, unknown> | unknown[] => typeof v === 'object' && v !== null;

export function parsePointer(path: string, index = 0): string[] {
  if (typeof path !== 'string' || !path.startsWith('/')) throw new PatchError(`caminho "${String(path)}" deve começar com "/".`, index);
  const segs = path
    .slice(1)
    .split('/')
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
  for (const s of segs) if (FORBIDDEN.has(s)) throw new PatchError(`segmento proibido "${s}".`, index);
  return segs;
}

function arrayIndex(seg: string, len: number, allowEnd: boolean, index: number, path: string): number {
  if (allowEnd && seg === '-') return len;
  if (!/^(0|[1-9]\d*)$/.test(seg)) throw new PatchError(`índice inválido "${seg}" em ${path}.`, index);
  const i = Number(seg);
  if (i > len || (i === len && !allowEnd)) throw new PatchError(`índice ${i} fora da lista (tamanho ${len}) em ${path}.`, index);
  return i;
}

function apply(doc: unknown, op: JsonPatchOp, index: number): void {
  if (!op || typeof op !== 'object') throw new PatchError('operação inválida.', index);
  if (op.op !== 'replace' && op.op !== 'add' && op.op !== 'remove') {
    throw new PatchError(`operação "${String((op as { op?: unknown }).op)}" não suportada (use replace, add ou remove).`, index);
  }
  const segs = parsePointer(op.path, index);
  if ((op.op === 'replace' || op.op === 'add') && !('value' in op && op.value !== undefined)) {
    throw new PatchError(`"${op.op}" exige "value".`, index);
  }
  let cur: unknown = doc;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i] as string;
    if (Array.isArray(cur)) {
      const k = arrayIndex(seg, cur.length, false, index, op.path);
      cur = cur[k];
    } else if (isContainer(cur) && Object.hasOwn(cur, seg)) {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      throw new PatchError(`caminho inexistente: /${segs.slice(0, i + 1).join('/')}.`, index);
    }
    if (!isContainer(cur)) throw new PatchError(`caminho inexistente: /${segs.slice(0, i + 1).join('/')}.`, index);
  }
  const last = segs[segs.length - 1] as string;
  const value = op.op === 'remove' ? undefined : structuredClone(op.value);

  if (Array.isArray(cur)) {
    if (op.op === 'add') {
      cur.splice(arrayIndex(last, cur.length, true, index, op.path), 0, value);
    } else if (op.op === 'replace') {
      cur[arrayIndex(last, cur.length, false, index, op.path)] = value;
    } else {
      cur.splice(arrayIndex(last, cur.length, false, index, op.path), 1);
    }
    return;
  }
  const obj = cur as Record<string, unknown>;
  const exists = Object.hasOwn(obj, last);
  if (op.op === 'add') {
    obj[last] = value;
  } else if (!exists) {
    throw new PatchError(`campo inexistente: ${op.path}.`, index);
  } else if (op.op === 'replace') {
    obj[last] = value;
  } else {
    delete obj[last];
  }
}

/** Aplica as operações em ordem, alterando `doc`. Lança `PatchError` na primeira falha (o documento pode ficar parcial). */
export function applyJsonPatch<T>(doc: T, ops: readonly JsonPatchOp[]): T {
  if (!Array.isArray(ops)) throw new PatchError('o patch deve ser uma lista de operações.', 0);
  ops.forEach((op, i) => apply(doc, op, i));
  return doc;
}

/** Versão sem efeito colateral: aplica numa cópia profunda. */
export function applyJsonPatchToCopy<T>(doc: T, ops: readonly JsonPatchOp[]): T {
  return applyJsonPatch(structuredClone(doc), ops);
}
