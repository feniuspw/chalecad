import { fail, guarded, json, parseProject, readBody, type Ctx } from '../../../../../lib/db/respond';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return guarded(async (repo) => {
    if (!(await repo.exists(id))) return fail(404, 'Projeto não encontrado.');
    return json(await repo.listVersions(id));
  });
}

/** Salva uma versão nomeada. `{ name, project? }`; sem `project`, congela o estado salvo do projeto. */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const b = await readBody(req);
  if (!b.ok) return b.res;
  const name = typeof b.body.name === 'string' ? b.body.name.trim() : '';
  if (!name) return fail(422, 'Dê um nome para a versão.');
  if (name.length > 120) return fail(422, 'O nome da versão pode ter no máximo 120 caracteres.');
  return guarded(async (repo) => {
    let project;
    if (b.body.project !== undefined) {
      const p = parseProject(b.body.project);
      if (!p.ok) return p.res;
      project = p.project;
    } else {
      project = (await repo.getProject(id))?.project;
    }
    if (!(await repo.exists(id)) || !project) return fail(404, 'Projeto não encontrado.');
    const versionId = await repo.saveVersion(id, name, project);
    const v = await repo.getVersion(versionId);
    return json({ id: versionId, version: v }, 201);
  });
}
