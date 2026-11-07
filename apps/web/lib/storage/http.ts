/** Adaptador do navegador para as rotas `/api/*` (que no servidor usam Drizzle + SQLite). */
import type { Project } from '@chalecad/engine';
import type { ProjectSummary, ProjectVersion, StorageAdapter } from './types';

/** Falha de rede/servidor (diferente de "não encontrado"): quem chama pode cair para o armazenamento local. */
export class HttpStorageError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'HttpStorageError';
  }
}

export class HttpAdapter implements StorageAdapter {
  constructor(private readonly base = '/api') {}

  private async call<T>(path: string, init?: RequestInit, opts?: { allow404?: boolean }): Promise<T | null> {
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, {
        ...init,
        headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
        cache: 'no-store',
      });
    } catch {
      throw new HttpStorageError('Sem conexão com o servidor.', 0);
    }
    if (res.status === 404 && opts?.allow404) return null;
    if (!res.ok) {
      let msg = `Erro ${res.status} do servidor.`;
      try {
        const body = (await res.json()) as { error?: string };
        if (body.error) msg = body.error;
      } catch {
        /* mantém a mensagem padrão */
      }
      throw new HttpStorageError(msg, res.status);
    }
    return (await res.json()) as T;
  }

  private json = (data: unknown): RequestInit => ({ body: JSON.stringify(data) });

  async listProjects(): Promise<ProjectSummary[]> {
    return (await this.call<ProjectSummary[]>('/projects')) ?? [];
  }

  async getProject(id: string) {
    return this.call<{ summary: ProjectSummary; project: Project }>(`/projects/${encodeURIComponent(id)}`, undefined, { allow404: true });
  }

  async saveProject(id: string | null, project: Project, extra?: Partial<ProjectSummary>): Promise<string> {
    const meta = { builtArea: extra?.builtArea, total: extra?.total, thumbnail: extra?.thumbnail };
    if (id) {
      const r = await this.call<{ id: string }>(
        `/projects/${encodeURIComponent(id)}`,
        { method: 'PUT', ...this.json({ project, ...meta }) },
        { allow404: true },
      );
      if (r) return r.id;
    }
    // Sem id, ou id desconhecido no servidor (criado offline): cria preservando o id.
    const r = await this.call<{ id: string }>('/projects', { method: 'POST', ...this.json({ project, id: id ?? undefined, ...meta }) });
    return r!.id;
  }

  async deleteProject(id: string): Promise<void> {
    await this.call(`/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }, { allow404: true });
  }

  async listVersions(projectId: string): Promise<Omit<ProjectVersion, 'project'>[]> {
    return (await this.call<Omit<ProjectVersion, 'project'>[]>(`/projects/${encodeURIComponent(projectId)}/versions`, undefined, { allow404: true })) ?? [];
  }

  async getVersion(versionId: string): Promise<ProjectVersion | null> {
    return this.call<ProjectVersion>(`/versions/${encodeURIComponent(versionId)}`, undefined, { allow404: true });
  }

  async saveVersion(projectId: string, name: string, project: Project): Promise<string> {
    const r = await this.call<{ id: string }>(`/projects/${encodeURIComponent(projectId)}/versions`, { method: 'POST', ...this.json({ name, project }) });
    return r!.id;
  }

  async deleteVersion(versionId: string): Promise<void> {
    await this.call(`/versions/${encodeURIComponent(versionId)}`, { method: 'DELETE' }, { allow404: true });
  }

  /** `/api/health` responde 200? */
  async available(timeoutMs = 2500): Promise<boolean> {
    try {
      const res = await fetch(`${this.base}/health`, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
      return res.ok;
    } catch {
      return false;
    }
  }
}
