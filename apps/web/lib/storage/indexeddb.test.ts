import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbs = new Map<string, Map<string, unknown>>();
vi.mock('idb-keyval', () => {
  const m = (s: { name: string }) => dbs.get(s.name)!;
  return {
    createStore: (name: string) => {
      if (!dbs.has(name)) dbs.set(name, new Map());
      return { name };
    },
    get: async (k: string, s: { name: string }) => m(s).get(k),
    set: async (k: string, v: unknown, s: { name: string }) => void m(s).set(k, v),
    del: async (k: string, s: { name: string }) => void m(s).delete(k),
    delMany: async (ks: string[], s: { name: string }) => void ks.forEach((k) => m(s).delete(k)),
    entries: async (s: { name: string }) => [...m(s).entries()],
    keys: async (s: { name: string }) => [...m(s).keys()],
  };
});

import { createProject } from '../project/templates';
import { IndexedDbAdapter } from './indexeddb';

beforeEach(() => dbs.clear());

describe('IndexedDbAdapter', () => {
  it('salva, lista (mais recente primeiro), reabre e exclui', async () => {
    const a = new IndexedDbAdapter();
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const p = createProject('gable_mezzanine', { name: 'Um' });
    const id1 = await a.saveProject(null, p, { builtArea: 60 });
    vi.setSystemTime(2000);
    const id2 = await a.saveProject(null, createProject('a_frame', { name: 'Dois' }));
    expect((await a.listProjects()).map((s) => s.id)).toEqual([id2, id1]);
    const got = await a.getProject(id1);
    expect(got?.project.meta.name).toBe('Um');
    expect(got?.summary).toMatchObject({ name: 'Um', typology: 'gable_mezzanine', builtArea: 60 });

    // atualização preserva o resumo extra e muda o nome
    vi.setSystemTime(3000);
    await a.saveProject(id1, { ...p, meta: { ...p.meta, name: 'Um (v2)' } });
    const again = await a.getProject(id1);
    expect(again?.summary).toMatchObject({ name: 'Um (v2)', builtArea: 60, updatedAt: 3000 });

    await a.deleteProject(id1);
    expect(await a.getProject(id1)).toBeNull();
    vi.useRealTimers();
  });

  it('versões ficam separadas por projeto e somem com o projeto', async () => {
    const a = new IndexedDbAdapter();
    const p = createProject('gable_mezzanine');
    const id = await a.saveProject(null, p);
    const other = await a.saveProject(null, p);
    const v = await a.saveVersion(id, 'antes do telhado', p);
    await a.saveVersion(other, 'outra', p);
    const list = await a.listVersions(id);
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty('project');
    expect((await a.getVersion(v))?.project.meta.name).toBe(p.meta.name);
    await a.deleteProject(id);
    expect(await a.listVersions(id)).toHaveLength(0);
    expect(await a.listVersions(other)).toHaveLength(1);
  });
});
