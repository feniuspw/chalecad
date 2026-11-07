/** Repositório SQLite (Drizzle) com o mesmo contrato do `StorageAdapter`. Somente servidor. */
import { and, desc, eq } from 'drizzle-orm';
import type { Project } from '@chalecad/engine';
import type { ProjectSummary, ProjectVersion, StorageAdapter } from '../storage/types';
import type { Db } from './index';
import { projects, versions, type ProjectRow } from './schema';

const uuid = () => crypto.randomUUID();

const summaryOf = (r: ProjectRow): ProjectSummary => ({
  id: r.id,
  name: r.name,
  typology: r.typology as ProjectSummary['typology'],
  updatedAt: r.updatedAt,
  ...(r.builtArea != null ? { builtArea: r.builtArea } : {}),
  ...(r.total != null ? { total: r.total } : {}),
  ...(r.thumbnail ? { thumbnail: r.thumbnail } : {}),
});

export class SqliteRepo implements StorageAdapter {
  constructor(private readonly db: Db) {}

  async listProjects(): Promise<ProjectSummary[]> {
    const rows = this.db.select().from(projects).orderBy(desc(projects.updatedAt)).all();
    return rows.map(summaryOf);
  }

  async getProject(id: string) {
    const r = this.db.select().from(projects).where(eq(projects.id, id)).get();
    return r ? { summary: summaryOf(r), project: JSON.parse(r.data) as Project } : null;
  }

  async exists(id: string): Promise<boolean> {
    return !!this.db.select({ id: projects.id }).from(projects).where(eq(projects.id, id)).get();
  }

  /** Cria (id null ou inexistente) ou atualiza (upsert). Colunas de resumo não informadas são preservadas. */
  async saveProject(id: string | null, project: Project, extra?: Partial<ProjectSummary>): Promise<string> {
    const finalId = id ?? uuid();
    const now = Date.now();
    const prev = id ? this.db.select().from(projects).where(eq(projects.id, finalId)).get() : undefined;
    const values = {
      name: project.meta.name,
      typology: project.typology.kind,
      data: JSON.stringify(project),
      builtArea: extra?.builtArea ?? prev?.builtArea ?? null,
      total: extra?.total ?? prev?.total ?? null,
      thumbnail: extra?.thumbnail ?? prev?.thumbnail ?? null,
      updatedAt: now,
    };
    if (prev) this.db.update(projects).set(values).where(eq(projects.id, finalId)).run();
    else this.db.insert(projects).values({ id: finalId, createdAt: now, ...values }).run();
    return finalId;
  }

  async deleteProject(id: string): Promise<void> {
    this.db.delete(versions).where(eq(versions.projectId, id)).run();
    this.db.delete(projects).where(eq(projects.id, id)).run();
  }

  async listVersions(projectId: string): Promise<Omit<ProjectVersion, 'project'>[]> {
    return this.db
      .select({ id: versions.id, projectId: versions.projectId, name: versions.name, createdAt: versions.createdAt })
      .from(versions)
      .where(eq(versions.projectId, projectId))
      .orderBy(desc(versions.createdAt))
      .all();
  }

  async getVersion(versionId: string): Promise<ProjectVersion | null> {
    const r = this.db.select().from(versions).where(eq(versions.id, versionId)).get();
    return r ? { id: r.id, projectId: r.projectId, name: r.name, createdAt: r.createdAt, project: JSON.parse(r.data) as Project } : null;
  }

  async saveVersion(projectId: string, name: string, project: Project): Promise<string> {
    if (!(await this.exists(projectId))) throw new Error(`Projeto não encontrado: ${projectId}`);
    const id = uuid();
    this.db.insert(versions).values({ id, projectId, name, data: JSON.stringify(project), createdAt: Date.now() }).run();
    return id;
  }

  async deleteVersion(versionId: string): Promise<void> {
    this.db.delete(versions).where(and(eq(versions.id, versionId))).run();
  }
}
