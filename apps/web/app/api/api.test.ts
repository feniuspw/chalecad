// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { closeAllDbs } from '../../lib/db';
import { createProject } from '../../lib/project/templates';
import { GET as health } from './health/route';
import { GET as listProjects, POST as createProjectRoute } from './projects/route';
import { DELETE as delProject, GET as getProject, PUT as putProject } from './projects/[id]/route';
import { GET as listVersions, POST as postVersion } from './projects/[id]/versions/route';
import { DELETE as delVersion, GET as getVersion } from './versions/[id]/route';

const dir = mkdtempSync(join(tmpdir(), 'chalecad-api-'));
beforeAll(() => {
  vi.stubEnv('CHALECAD_DB_PATH', join(dir, 'api.sqlite'));
  vi.stubEnv('DATA_MODE', 'sqlite');
});
afterAll(() => {
  vi.unstubAllEnvs();
  closeAllDbs();
  rmSync(dir, { recursive: true, force: true });
});

const req = (method: string, body?: unknown) =>
  new Request('http://localhost/api', { method, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe('API de projetos', () => {
  const fixture = createProject('gable_mezzanine', { name: 'Fixture' });

  it('health responde ok', async () => {
    const r = await health();
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true });
  });

  it('POST e GET devolvem o mesmo projeto', async () => {
    const created = await createProjectRoute(req('POST', { project: fixture, builtArea: 55.2, total: 99000 }));
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };

    const r = await getProject(req('GET'), ctx(id));
    expect(r.status).toBe(200);
    const body = (await r.json()) as { project: unknown; summary: Record<string, unknown> };
    expect(body.project).toEqual(fixture);
    expect(body.summary).toMatchObject({ id, name: 'Fixture', builtArea: 55.2, total: 99000 });

    const list = (await (await listProjects()).json()) as { id: string }[];
    expect(list.map((p) => p.id)).toContain(id);
  });

  it('PUT atualiza, 404 para inexistente e DELETE remove', async () => {
    const { id } = (await (await createProjectRoute(req('POST', { project: fixture }))).json()) as { id: string };
    const renamed = { ...fixture, meta: { ...fixture.meta, name: 'Renomeado' } };
    const put = await putProject(req('PUT', { project: renamed }), ctx(id));
    expect(put.status).toBe(200);
    expect(((await (await getProject(req('GET'), ctx(id))).json()) as { summary: { name: string } }).summary.name).toBe('Renomeado');

    expect((await putProject(req('PUT', { project: fixture }), ctx('nada'))).status).toBe(404);
    expect((await delProject(req('DELETE'), ctx(id))).status).toBe(200);
    const gone = await getProject(req('GET'), ctx(id));
    expect(gone.status).toBe(404);
    expect(((await gone.json()) as { error: string }).error).toBe('Projeto não encontrado.');
    expect((await delProject(req('DELETE'), ctx(id))).status).toBe(404);
  });

  it('valida o corpo com o schema do engine (mensagens em pt-BR)', async () => {
    const bad = await createProjectRoute(req('POST', { project: { ...fixture, typology: { kind: 'gable_mezzanine', width: 1 } } }));
    expect(bad.status).toBe(422);
    const b = (await bad.json()) as { error: string; issues: { path: string }[] };
    expect(b.error).toContain('Projeto inválido');
    expect(b.issues.length).toBeGreaterThan(0);
    expect((await createProjectRoute(req('POST', '{nao-json'))).status).toBe(400);
    expect((await createProjectRoute(req('POST', {}))).status).toBe(422);
  });

  it('versões: criar (com e sem projeto), listar, abrir, excluir', async () => {
    const { id } = (await (await createProjectRoute(req('POST', { project: fixture }))).json()) as { id: string };
    const edited = { ...fixture, meta: { ...fixture.meta, name: 'Editado' } };
    const v1 = await postVersion(req('POST', { name: 'antes' , project: edited }), ctx(id));
    expect(v1.status).toBe(201);
    const v2 = await postVersion(req('POST', { name: 'do salvo' }), ctx(id));
    const { id: vid1 } = (await v1.json()) as { id: string };
    const { id: vid2 } = (await v2.json()) as { id: string };

    const list = (await (await listVersions(req('GET'), ctx(id))).json()) as { id: string; name: string }[];
    expect(list.map((v) => v.id).sort()).toEqual([vid1, vid2].sort());

    const one = (await (await getVersion(req('GET'), ctx(vid1))).json()) as { project: typeof fixture; name: string };
    expect(one.name).toBe('antes');
    expect(one.project.meta.name).toBe('Editado');
    expect(((await (await getVersion(req('GET'), ctx(vid2))).json()) as { project: typeof fixture }).project).toEqual(fixture);

    expect((await postVersion(req('POST', { name: '  ' }), ctx(id))).status).toBe(422);
    expect((await postVersion(req('POST', { name: 'x' }), ctx('nada'))).status).toBe(404);
    expect((await delVersion(req('DELETE'), ctx(vid1))).status).toBe(200);
    expect((await getVersion(req('GET'), ctx(vid1))).status).toBe(404);
    expect((await delVersion(req('DELETE'), ctx(vid1))).status).toBe(404);
  });

  it('em DATA_MODE=supabase devolve 503 com mensagem clara', async () => {
    vi.stubEnv('DATA_MODE', 'supabase');
    const r = await listProjects();
    expect(r.status).toBe(503);
    expect(((await r.json()) as { error: string }).error).toContain('não configurado neste ambiente');
    expect((await health()).status).toBe(503);
    vi.stubEnv('DATA_MODE', 'sqlite');
  });
});
