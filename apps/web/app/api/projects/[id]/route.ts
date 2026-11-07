import { fail, guarded, json, parseProject, readBody, summaryExtra, type Ctx } from '../../../../lib/db/respond';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NOT_FOUND = 'Projeto não encontrado.';

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return guarded(async (repo) => {
    const rec = await repo.getProject(id);
    return rec ? json(rec) : fail(404, NOT_FOUND);
  });
}

/** Atualiza. `{ project, builtArea?, total?, thumbnail? }`. */
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const b = await readBody(req);
  if (!b.ok) return b.res;
  const p = parseProject(b.body.project);
  if (!p.ok) return p.res;
  return guarded(async (repo) => {
    if (!(await repo.exists(id))) return fail(404, NOT_FOUND);
    await repo.saveProject(id, p.project, summaryExtra(b.body));
    const rec = await repo.getProject(id);
    return rec ? json({ id, ...rec }) : fail(404, NOT_FOUND);
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return guarded(async (repo) => {
    if (!(await repo.exists(id))) return fail(404, NOT_FOUND);
    await repo.deleteProject(id);
    return json({ ok: true });
  });
}
