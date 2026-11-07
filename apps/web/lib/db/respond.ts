/** Utilidades dos route handlers: erros JSON em pt-BR, repositório e validação do corpo. */
import { Project } from '@chalecad/engine';
import { DbUnavailableError, getDb } from './index';
import { SqliteRepo } from './repo';

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export const fail = (status: number, error: string, issues?: { path: string; message: string }[]): Response =>
  json(issues ? { error, issues } : { error }, status);

export function repo(): SqliteRepo {
  return new SqliteRepo(getDb());
}

/** Executa o handler traduzindo exceções em respostas JSON. */
export async function guarded(fn: (repo: SqliteRepo) => Promise<Response>): Promise<Response> {
  try {
    return await fn(repo());
  } catch (e) {
    if (e instanceof DbUnavailableError) return fail(503, e.message);
    console.error('[api]', e);
    return fail(500, 'Erro interno ao acessar o banco de dados.');
  }
}

export async function readBody(req: Request): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; res: Response }> {
  try {
    const body = await req.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) return { ok: true, body: body as Record<string, unknown> };
  } catch {
    /* cai no erro abaixo */
  }
  return { ok: false, res: fail(400, 'Corpo da requisição inválido: envie um JSON.') };
}

export function parseProject(raw: unknown): { ok: true; project: Project } | { ok: false; res: Response } {
  const r = Project.safeParse(raw);
  if (r.success) return { ok: true, project: r.data };
  const issues = r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  return { ok: false, res: fail(422, 'Projeto inválido. Corrija os campos indicados e tente novamente.', issues) };
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : undefined);

/** Campos opcionais de resumo aceitos no corpo. */
export function summaryExtra(body: Record<string, unknown>) {
  const out: { builtArea?: number; total?: number; thumbnail?: string } = {};
  const b = num(body.builtArea);
  const t = num(body.total);
  const th = str(body.thumbnail);
  if (b !== undefined) out.builtArea = b;
  if (t !== undefined) out.total = t;
  if (th !== undefined) out.thumbnail = th;
  return out;
}

export type Ctx<P extends string = 'id'> = { params: Promise<Record<P, string>> };
