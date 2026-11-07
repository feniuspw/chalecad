/**
 * Contrato de persistência. Componentes nunca falam com banco/SDK direto: usam um StorageAdapter.
 * - `IndexedDbAdapter` (browser): autosave local e funcionamento offline.
 * - `HttpAdapter` (browser → route handlers /api/projects) que no servidor usa Drizzle (SQLite em DATA_MODE=sqlite).
 */
import type { Project } from '@chalecad/engine';

export interface ProjectSummary {
  id: string;
  name: string;
  typology: Project['typology']['kind'];
  updatedAt: number;
  /** Resumo para a lista de projetos (opcional, preenchido no save). */
  builtArea?: number;
  total?: number;
  thumbnail?: string;
}

export interface ProjectVersion {
  id: string;
  projectId: string;
  /** Nome dado pelo usuário ("antes de mudar o telhado"). */
  name: string;
  createdAt: number;
  project: Project;
}

export interface StorageAdapter {
  listProjects(): Promise<ProjectSummary[]>;
  getProject(id: string): Promise<{ summary: ProjectSummary; project: Project } | null>;
  /** Cria (id null) ou atualiza. Devolve o id. */
  saveProject(id: string | null, project: Project, extra?: Partial<ProjectSummary>): Promise<string>;
  deleteProject(id: string): Promise<void>;
  listVersions(projectId: string): Promise<Omit<ProjectVersion, 'project'>[]>;
  getVersion(versionId: string): Promise<ProjectVersion | null>;
  saveVersion(projectId: string, name: string, project: Project): Promise<string>;
  deleteVersion(versionId: string): Promise<void>;
}
