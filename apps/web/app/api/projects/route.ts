import { fail, guarded, json, parseProject, readBody, summaryExtra } from '../../../lib/db/respond';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return guarded(async (repo) => json(await repo.listProjects()));
}

/** Cria um projeto. `{ project, id?, builtArea?, total?, thumbnail? }`; com `id` existente, atualiza (upsert). */
export async function POST(req: Request) {
  const b = await readBody(req);
  if (!b.ok) return b.res;
  const p = parseProject(b.body.project);
  if (!p.ok) return p.res;
  const id = typeof b.body.id === 'string' && b.body.id.length > 0 && b.body.id.length <= 64 ? b.body.id : null;
  return guarded(async (repo) => {
    const existed = id ? await repo.exists(id) : false;
    const savedId = await repo.saveProject(id, p.project, summaryExtra(b.body));
    const rec = await repo.getProject(savedId);
    if (!rec) return fail(500, 'Não foi possível salvar o projeto.');
    return json({ id: savedId, ...rec }, existed ? 200 : 201);
  });
}
