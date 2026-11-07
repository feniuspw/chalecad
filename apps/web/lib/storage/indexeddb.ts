/** Persistência local no navegador (IndexedDB via idb-keyval): projetos e versões em bancos separados. */
import { createStore, del, delMany, entries, get, keys, set, type UseStore } from 'idb-keyval';
import type { Project } from '@chalecad/engine';
import type { ProjectSummary, ProjectVersion, StorageAdapter } from './types';

interface ProjectRecord {
  summary: ProjectSummary;
  project: Project;
}

const uuid = () => crypto.randomUUID();

export class IndexedDbAdapter implements StorageAdapter {
  private projectsStore: UseStore | null = null;
  private versionsStore: UseStore | null = null;

  // Criação preguiçosa: `indexedDB` não existe no servidor (SSR).
  private get projects(): UseStore {
    return (this.projectsStore ??= createStore('chalecad-projects', 'projects'));
  }
  private get versions(): UseStore {
    return (this.versionsStore ??= createStore('chalecad-versions', 'versions'));
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const all = await entries<string, ProjectRecord>(this.projects);
    return all.map(([, r]) => r.summary).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getProject(id: string) {
    const r = await get<ProjectRecord>(id, this.projects);
    return r ? { summary: r.summary, project: r.project } : null;
  }

  async saveProject(id: string | null, project: Project, extra?: Partial<ProjectSummary>): Promise<string> {
    const finalId = id ?? uuid();
    const prev = id ? await get<ProjectRecord>(finalId, this.projects) : undefined;
    const summary: ProjectSummary = {
      ...(prev?.summary ?? {}),
      ...extra,
      id: finalId,
      name: project.meta.name,
      typology: project.typology.kind,
      updatedAt: Date.now(),
    };
    await set(finalId, { summary, project } satisfies ProjectRecord, this.projects);
    return finalId;
  }

  async deleteProject(id: string): Promise<void> {
    await del(id, this.projects);
    const all = await entries<string, ProjectVersion>(this.versions);
    const ids = all.filter(([, v]) => v.projectId === id).map(([k]) => k);
    if (ids.length) await delMany(ids, this.versions);
  }

  async listVersions(projectId: string): Promise<Omit<ProjectVersion, 'project'>[]> {
    const all = await entries<string, ProjectVersion>(this.versions);
    return all
      .map(([, v]) => v)
      .filter((v) => v.projectId === projectId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(({ project: _project, ...rest }) => rest);
  }

  async getVersion(versionId: string): Promise<ProjectVersion | null> {
    return (await get<ProjectVersion>(versionId, this.versions)) ?? null;
  }

  async saveVersion(projectId: string, name: string, project: Project): Promise<string> {
    const id = uuid();
    await set(id, { id, projectId, name, createdAt: Date.now(), project } satisfies ProjectVersion, this.versions);
    return id;
  }

  async deleteVersion(versionId: string): Promise<void> {
    await del(versionId, this.versions);
  }

  /** Quantidade de projetos (diagnóstico). */
  async count(): Promise<number> {
    return (await keys(this.projects)).length;
  }
}
