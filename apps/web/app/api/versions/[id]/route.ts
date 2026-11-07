import { fail, guarded, json, type Ctx } from '../../../../lib/db/respond';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NOT_FOUND = 'Versão não encontrada.';

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return guarded(async (repo) => {
    const v = await repo.getVersion(id);
    return v ? json(v) : fail(404, NOT_FOUND);
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return guarded(async (repo) => {
    if (!(await repo.getVersion(id))) return fail(404, NOT_FOUND);
    await repo.deleteVersion(id);
    return json({ ok: true });
  });
}
