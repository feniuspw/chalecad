import { describe, expect, it } from 'vitest';
import { PatchError, applyJsonPatch, applyJsonPatchToCopy } from './patch';

const doc = () => ({ a: { b: 1, 'x/y': 2, 'c~d': 3 }, list: [10, 20, 30], objs: [{ id: 'a' }, { id: 'b' }] });

describe('applyJsonPatch', () => {
  it('replace em objeto, array e caminho aninhado', () => {
    const d = applyJsonPatch(doc(), [
      { op: 'replace', path: '/a/b', value: 5 },
      { op: 'replace', path: '/list/1', value: 99 },
      { op: 'replace', path: '/objs/1/id', value: 'z' },
    ]);
    expect(d.a.b).toBe(5);
    expect(d.list).toEqual([10, 99, 30]);
    expect(d.objs[1]).toEqual({ id: 'z' });
  });

  it('add cria campo, insere no índice e no fim com "-"', () => {
    const d = applyJsonPatch(doc() as Record<string, unknown> & ReturnType<typeof doc>, [
      { op: 'add', path: '/a/novo', value: { k: 1 } },
      { op: 'add', path: '/list/1', value: 15 },
      { op: 'add', path: '/list/-', value: 40 },
      { op: 'add', path: '/list/5', value: 50 },
    ]);
    expect(d.a).toMatchObject({ novo: { k: 1 } });
    expect(d.list).toEqual([10, 15, 20, 30, 40, 50]);
  });

  it('remove em objeto e array', () => {
    const d = applyJsonPatch(doc(), [
      { op: 'remove', path: '/a/b' },
      { op: 'remove', path: '/list/0' },
    ]);
    expect('b' in d.a).toBe(false);
    expect(d.list).toEqual([20, 30]);
  });

  it('decodifica ~0 e ~1', () => {
    const d = applyJsonPatch(doc(), [
      { op: 'replace', path: '/a/x~1y', value: 'ok' },
      { op: 'replace', path: '/a/c~0d', value: 'ok2' },
    ]);
    expect(d.a['x/y']).toBe('ok');
    expect(d.a['c~d']).toBe('ok2');
  });

  it.each([
    ['replace de campo inexistente', { op: 'replace', path: '/a/zz', value: 1 }],
    ['remove de campo inexistente', { op: 'remove', path: '/a/zz' }],
    ['caminho intermediário inexistente', { op: 'add', path: '/q/r', value: 1 }],
    ['índice fora', { op: 'replace', path: '/list/3', value: 1 }],
    ['add além do fim', { op: 'add', path: '/list/9', value: 1 }],
    ['índice não numérico', { op: 'replace', path: '/list/x', value: 1 }],
    ['sem barra inicial', { op: 'replace', path: 'a/b', value: 1 }],
    ['raiz', { op: 'replace', path: '', value: 1 }],
    ['sem value', { op: 'replace', path: '/a/b' }],
    ['operação move', { op: 'move', path: '/a/b', from: '/a/c' }],
    ['__proto__', { op: 'add', path: '/__proto__/x', value: 1 }],
    ['atravessar primitivo', { op: 'replace', path: '/a/b/c', value: 1 }],
  ])('erro: %s', (_n, op) => {
    expect(() => applyJsonPatch(doc(), [op as never])).toThrow(PatchError);
  });

  it('mensagem indica a operação com falha', () => {
    expect(() => applyJsonPatch(doc(), [{ op: 'replace', path: '/a/b', value: 1 }, { op: 'remove', path: '/nada' }])).toThrow(/Operação 2/);
  });

  it('toCopy não altera o original', () => {
    const d = doc();
    const c = applyJsonPatchToCopy(d, [{ op: 'replace', path: '/a/b', value: 7 }]);
    expect(d.a.b).toBe(1);
    expect(c.a.b).toBe(7);
  });
});
