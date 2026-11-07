// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '../project/templates';
import { DDL_STATEMENTS } from './ddl';
import { closeAllDbs, DbUnavailableError, getDb, openDb } from './index';
import { SqliteRepo } from './repo';

const dir = mkdtempSync(join(tmpdir(), 'chalecad-db-'));
let n = 0;
let file = '';
let h: ReturnType<typeof openDb>;
beforeEach(() => {
  h?.close();
  file = join(dir, `t${n++}.sqlite`);
  h = openDb(file);
});
afterAll(() => {
  h?.close();
  closeAllDbs();
  rmSync(dir, { recursive: true, force: true });
});

describe('SqliteRepo', () => {
  it('cria, lê de volta idêntico, atualiza e lista por mais recente', async () => {
    vi.useFakeTimers();
    const repo = new SqliteRepo(h.db);
    vi.setSystemTime(1000);
    const a = createProject('gable_mezzanine', { name: 'Um' });
    const idA = await repo.saveProject(null, a, { builtArea: 50, total: 123456.7 });
    vi.setSystemTime(2000);
    const b = createProject('a_frame', { name: 'Dois' });
    const idB = await repo.saveProject(null, b);

    const got = await repo.getProject(idA);
    expect(got?.project).toEqual(a);
    expect(got?.summary).toMatchObject({ id: idA, name: 'Um', typology: 'gable_mezzanine', builtArea: 50, total: 123456.7, updatedAt: 1000 });
    expect((await repo.listProjects()).map((p) => p.id)).toEqual([idB, idA]);

    vi.setSystemTime(3000);
    const renamed = { ...a, meta: { ...a.meta, name: 'Um renomeado' } };
    await repo.saveProject(idA, renamed);
    const again = await repo.getProject(idA);
    expect(again?.summary).toMatchObject({ name: 'Um renomeado', builtArea: 50, updatedAt: 3000 });
    expect((await repo.listProjects())[0]?.id).toBe(idA);
    vi.useRealTimers();
  });

  it('upsert com id novo cria o registro com esse id', async () => {
    const repo = new SqliteRepo(h.db);
    const id = await repo.saveProject('meu-id', createProject('gable_mezzanine'));
    expect(id).toBe('meu-id');
    expect(await repo.exists('meu-id')).toBe(true);
  });

  it('versões: salvar, listar sem o projeto, abrir, excluir; apagar o projeto leva as versões', async () => {
    const repo = new SqliteRepo(h.db);
    const p = createProject('gable_mezzanine');
    const id = await repo.saveProject(null, p);
    const v1 = await repo.saveVersion(id, 'antes do telhado', p);
    const list = await repo.listVersions(id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: v1, projectId: id, name: 'antes do telhado' });
    expect('project' in list[0]!).toBe(false);
    expect((await repo.getVersion(v1))?.project).toEqual(p);
    await expect(repo.saveVersion('nao-existe', 'x', p)).rejects.toThrow();

    const v2 = await repo.saveVersion(id, 'outra', p);
    await repo.deleteVersion(v2);
    expect(await repo.getVersion(v2)).toBeNull();
    await repo.deleteProject(id);
    expect(await repo.getProject(id)).toBeNull();
    expect(await repo.getVersion(v1)).toBeNull();
  });

  it('o arquivo é criado e a migração é idempotente', () => {
    expect(() => openDb(file).close()).not.toThrow();
  });
});

describe('getDb', () => {
  it('usa CHALECAD_DB_PATH e lança erro claro em supabase', () => {
    vi.stubEnv('CHALECAD_DB_PATH', join(dir, 'via-env.sqlite'));
    vi.stubEnv('DATA_MODE', 'sqlite');
    expect(getDb()).toBe(getDb());
    vi.stubEnv('DATA_MODE', 'supabase');
    expect(() => getDb()).toThrow(DbUnavailableError);
    expect(() => getDb()).toThrow('não configurado neste ambiente');
    vi.unstubAllEnvs();
    closeAllDbs();
  });
});

describe('scripts/migrate.mjs', () => {
  it('usa o mesmo DDL de lib/db/ddl.ts', () => {
    const src = readFileSync(join(__dirname, '../../scripts/migrate.mjs'), 'utf8');
    for (const sql of DDL_STATEMENTS) expect(src).toContain(sql);
  });
});
