import { describe, expect, it } from 'vitest';
import { getCatalog } from '@chalecad/catalog';
import { computeAll } from '@chalecad/engine';
import { createProject } from '../project/templates';
import { buildApprovalPackage, packFileName, type PackDeps } from './pack';

const project = createProject('gable_mezzanine', { name: 'Chalé da Serra' });
const results = computeAll(project, getCatalog());
const bytes = new Uint8Array([1, 2, 3]);
const deps = (over: Partial<PackDeps> = {}): PackDeps => ({
  sheetsPdf: async () => {
    throw new Error('exportSheetsPdf: não implementado (F17-W1)');
  },
  dxf: () => new Uint8Array([48, 10]),
  quantitiesPdf: async () => bytes,
  csvs: () => [{ name: 'orcamento.csv', text: 'a;b' }],
  renderDoc: async () => bytes,
  ...over,
});
const text = (z: Uint8Array, name: string) => {
  // zip "store": procura o nome e lê o conteúdo logo depois do cabeçalho local
  const dec = new TextDecoder();
  const s = dec.decode(z);
  const i = s.indexOf(name);
  return i < 0 ? null : s.slice(i + name.length, i + name.length + 4000);
};

describe('pacote de aprovação', () => {
  it('nome do arquivo', () => {
    expect(packFileName('Chalé da Serra', '2026-11-09')).toBe('aprovacao-chale-da-serra-2026-11-09.zip');
  });
  it('sai mesmo com etapa falha; LEIA-ME e JSON estão no zip', async () => {
    const steps: string[] = [];
    const r = await buildApprovalPackage({ project, results, deps: deps(), onProgress: (p) => steps.push(p.label), now: new Date('2026-11-09T12:00:00') });
    expect(r.name).toBe('aprovacao-chale-da-serra-2026-11-09.zip');
    expect(r.entries).toContain('LEIA-ME.txt');
    expect(r.entries).toContain('projeto.chalecad.json');
    expect(r.entries).toContain('01-pranchas/projeto.dxf');
    expect(r.entries).toContain('05-quantitativos/quantitativos.pdf');
    expect(steps[0]).toBe('01-pranchas/');
    expect(steps.at(-1)).toBe('LEIA-ME.txt');
    expect(text(r.bytes, 'LEIA-ME.txt')).toContain('não gerado: PDF das pranchas');
    expect(r.steps.some((s) => !s.ok)).toBe(true);
  });
  it('sem approval nos resultados: etapas dependentes viram "não gerado" e é minuta', async () => {
    const r = await buildApprovalPackage({ project, results: { ...results, approval: undefined }, deps: deps() });
    expect(r.ready).toBe(false);
    expect(r.steps.find((s) => s.path === '02-memoriais/')?.ok).toBe(false);
    expect(text(r.bytes, 'LEIA-ME.txt')).toContain('MINUTA');
  });
  it('cancelar interrompe', async () => {
    const ctl = new AbortController();
    ctl.abort();
    await expect(buildApprovalPackage({ project, results, deps: deps(), signal: ctl.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
});
