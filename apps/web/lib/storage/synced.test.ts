import { describe, expect, it, vi } from 'vitest';
import { createProject } from '../project/templates';
import type { HttpAdapter } from './http';
import { SyncedStorage } from './index';
import type { ProjectSummary, StorageAdapter } from './types';

function memory(): StorageAdapter {
  const projects = new Map<string, { summary: ProjectSummary; project: ReturnType<typeof createProject> }>();
  return {
    listProjects: async () => [...projects.values()].map((r) => r.summary),
    getProject: async (id) => projects.get(id) ?? null,
    saveProject: async (id, project, extra) => {
      const finalId = id ?? crypto.randomUUID();
      projects.set(finalId, { summary: { ...extra, id: finalId, name: project.meta.name, typology: project.typology.kind, updatedAt: Date.now() }, project });
      return finalId;
    },
    deleteProject: async (id) => void projects.delete(id),
    listVersions: async () => [],
    getVersion: async () => null,
    saveVersion: async () => 'v',
    deleteVersion: async () => undefined,
  };
}

const fakeHttp = (inner: StorageAdapter, up: { value: boolean }) =>
  Object.assign(Object.create(null) as object, {
    ...Object.fromEntries(
      (Object.keys(inner) as (keyof StorageAdapter)[]).map((k) => [
        k,
        (...a: unknown[]) => (up.value ? (inner[k] as (...x: unknown[]) => unknown)(...a) : Promise.reject(new Error('rede'))),
      ]),
    ),
    available: async () => up.value,
  }) as unknown as HttpAdapter;

describe('SyncedStorage', () => {
  it('grava local e no servidor com o mesmo id; offline continua salvando localmente', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const server = memory();
    const idb = memory();
    const up = { value: true };
    const s = new SyncedStorage(fakeHttp(server, up), idb);
    const p = createProject('gable_mezzanine', { name: 'A' });
    const id = await s.saveProject(null, p);
    expect((await server.getProject(id))?.project).toEqual(p);
    expect((await idb.getProject(id))?.project).toEqual(p);

    // cai: o servidor falha no meio do uso
    up.value = false;
    const p2 = { ...p, meta: { ...p.meta, name: 'B' } };
    await expect(s.saveProject(id, p2)).resolves.toBe(id);
    expect((await idb.getProject(id))?.project.meta.name).toBe('B');
    expect((await server.getProject(id))?.project.meta.name).toBe('A');
    expect((await s.listProjects()).map((x) => x.name)).toEqual(['B']);
  });
});
