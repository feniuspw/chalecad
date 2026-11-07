import { DbUnavailableError, getDb } from '../../../lib/db';
import { fail, json } from '../../../lib/db/respond';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Responde 200 quando a API e o banco estão utilizáveis (o cliente usa isto para escolher o armazenamento). */
export async function GET() {
  try {
    getDb();
    return json({ ok: true, mode: process.env.DATA_MODE ?? 'sqlite' });
  } catch (e) {
    return fail(503, e instanceof DbUnavailableError ? e.message : 'Banco de dados indisponível.');
  }
}
