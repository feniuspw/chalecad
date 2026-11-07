import { HttpAdapter } from './http';
import { IndexedDbAdapter } from './indexeddb';
import type { ProjectSummary, ProjectVersion, StorageAdapter } from './types';

let local: IndexedDbAdapter | null = null;
let adapter: StorageAdapter | null = null;

/** IndexedDB do navegador: autosave rápido e funcionamento offline. */
export function getLocalStorage(): StorageAdapter {
  local ??= new IndexedDbAdapter();
  return local;
}

const RECHECK_MS = 15_000;

/**
 * Armazenamento principal: servidor (SQLite via `/api`) quando responde, IndexedDB quando offline.
 * - Gravações vão primeiro para o IndexedDB (rápido, mesmo id) e depois para o servidor; se este falhar, o projeto segue salvo localmente
 *   e é enviado no próximo salvamento.
 * - Leituras preferem o servidor; projetos criados offline continuam aparecendo (mescla por id, vence o mais recente).
 */
export class SyncedStorage implements StorageAdapter {
  private online: boolean | null = null;
  private checkedAt = 0;
  private checking: Promise<boolean> | null = null;

  constructor(
    private readonly http: HttpAdapter,
    private readonly idb: StorageAdapter,
  ) {}

  /** Servidor disponível? Resultado em cache por alguns segundos. */
  isOnline(): Promise<boolean> {
    if (this.online !== null && Date.now() - this.checkedAt < RECHECK_MS) return Promise.resolve(this.online);
    this.checking ??= this.http.available().then((ok) => {
      this.online = ok;
      this.checkedAt = Date.now();
      this.checking = null;
      return ok;
    });
    return this.checking;
  }

  private fellOffline() {
    this.online = false;
    this.checkedAt = Date.now();
  }

  /** Tenta o servidor; em falha de rede/servidor marca offline e devolve undefined. */
  private async remote<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (!(await this.isOnline())) return undefined;
    try {
      return await fn();
    } catch (e) {
      console.warn('[storage] servidor indisponível, usando armazenamento local:', e);
      this.fellOffline();
      return undefined;
    }
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const [remote, here] = [await this.remote(() => this.http.listProjects()), await this.idb.listProjects().catch(() => [] as ProjectSummary[])];
    if (!remote) return here;
    const byId = new Map(remote.map((p) => [p.id, p]));
    for (const p of here) {
      const r = byId.get(p.id);
      if (!r || p.updatedAt > r.updatedAt) byId.set(p.id, { ...r, ...p });
    }
    return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getProject(id: string) {
    const [remote, here] = [await this.remote(() => this.http.getProject(id)), await this.idb.getProject(id).catch(() => null)];
    if (remote && here) return here.summary.updatedAt > remote.summary.updatedAt ? here : remote;
    return remote ?? here ?? null;
  }

  async saveProject(id: string | null, project: Parameters<StorageAdapter['saveProject']>[1], extra?: Partial<ProjectSummary>): Promise<string> {
    let finalId: string | null = null;
    let localError: unknown;
    try {
      finalId = await this.idb.saveProject(id, project, extra);
    } catch (e) {
      localError = e;
    }
    const sent = await this.remote(() => this.http.saveProject(finalId ?? id, project, extra));
    const result = sent ?? finalId;
    if (!result) throw localError instanceof Error ? localError : new Error('Não foi possível salvar o projeto.');
    return result;
  }

  async deleteProject(id: string): Promise<void> {
    await this.idb.deleteProject(id).catch(() => undefined);
    if (!(await this.isOnline())) return;
    // Falha ao excluir no servidor deve aparecer para o usuário.
    await this.http.deleteProject(id);
  }

  async listVersions(projectId: string) {
    const remote = await this.remote(() => this.http.listVersions(projectId));
    const here = await this.idb.listVersions(projectId).catch(() => []);
    const byId = new Map([...here, ...(remote ?? [])].map((v) => [v.id, v]));
    return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  async getVersion(versionId: string): Promise<ProjectVersion | null> {
    return (await this.remote(() => this.http.getVersion(versionId))) ?? (await this.idb.getVersion(versionId).catch(() => null)) ?? null;
  }

  async saveVersion(projectId: string, name: string, project: Parameters<StorageAdapter['saveVersion']>[2]): Promise<string> {
    const remote = await this.remote(async () => {
      // Garante que o projeto exista no servidor (pode ter sido criado offline).
      if (!(await this.http.getProject(projectId))) await this.http.saveProject(projectId, project);
      return this.http.saveVersion(projectId, name, project);
    });
    return remote ?? this.idb.saveVersion(projectId, name, project);
  }

  async deleteVersion(versionId: string): Promise<void> {
    await this.idb.deleteVersion(versionId).catch(() => undefined);
    if (await this.isOnline()) await this.http.deleteVersion(versionId);
  }
}

/** Adaptador de armazenamento ativo (servidor com queda para IndexedDB offline). */
export function getStorage(): StorageAdapter {
  adapter ??= new SyncedStorage(new HttpAdapter(), getLocalStorage());
  return adapter;
}

export { HttpAdapter, HttpStorageError } from './http';
export type { ProjectSummary, ProjectVersion, StorageAdapter } from './types';
