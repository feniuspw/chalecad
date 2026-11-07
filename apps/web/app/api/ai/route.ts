import Anthropic from '@anthropic-ai/sdk';
import { Project } from '@chalecad/engine';
import { fail, json, readBody } from '../../../lib/db/respond';
import { DEFAULT_MODEL, runAnalyst } from '../../../lib/ai/loop';
import { checkRate } from '../../../lib/ai/rate-limit';
import type { ChatMessage } from '../../../lib/ai/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DISABLED_REASON = 'A IA está desligada. Defina AI_ENABLED=true e ANTHROPIC_API_KEY em apps/web/.env.local e reinicie o servidor.';

function disabledReason(): string | null {
  if (process.env.AI_ENABLED !== 'true') return DISABLED_REASON;
  if (!process.env.ANTHROPIC_API_KEY) return 'Falta a ANTHROPIC_API_KEY em apps/web/.env.local.';
  return null;
}

const disabled = (reason: string) => json({ disabled: true, reason }, 503);

/** Estado da IA para a interface decidir o que mostrar. */
export async function GET() {
  const reason = disabledReason();
  return json(reason ? { enabled: false, reason } : { enabled: true });
}

function parseMessages(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 30) return null;
  const out: ChatMessage[] = [];
  for (const m of raw) {
    if (!m || typeof m !== 'object') return null;
    const { role, content } = m as Record<string, unknown>;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || !content.trim() || content.length > 8000) return null;
    out.push({ role, content });
  }
  return out[0]?.role === 'user' && out[out.length - 1]?.role === 'user' ? out : null;
}

function apiErrorMessage(e: unknown): string {
  const status = typeof e === 'object' && e !== null && 'status' in e ? Number((e as { status: unknown }).status) : 0;
  if (status === 401 || status === 403) return 'A chave da API da Anthropic foi recusada. Confira a ANTHROPIC_API_KEY.';
  if (status === 404) return 'Modelo não encontrado. Confira AI_MODEL no .env.local.';
  if (status === 429) return 'Limite de uso da API da Anthropic atingido. Tente novamente em instantes.';
  if (status === 529 || status >= 500) return 'O serviço da Anthropic está sobrecarregado ou indisponível. Tente novamente em instantes.';
  if (status === 400) return 'A API recusou a solicitação. Tente uma pergunta mais curta.';
  return 'Não foi possível consultar a IA agora. Tente novamente.';
}

export async function POST(req: Request) {
  const reason = disabledReason();
  if (reason) return disabled(reason);

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local';
  const rate = checkRate(ip);
  if (!rate.ok) {
    const res = fail(429, `Limite de perguntas por hora atingido. Tente novamente em ${Math.ceil(rate.retryAfterSec / 60)} min.`);
    res.headers.set('Retry-After', String(rate.retryAfterSec));
    return res;
  }

  const body = await readBody(req);
  if (!body.ok) return body.res;
  const messages = parseMessages(body.body.messages);
  if (!messages) return fail(400, 'Conversa inválida: envie mensagens de texto, começando e terminando com uma do usuário.');
  const parsed = Project.safeParse(body.body.project);
  if (!parsed.success) {
    return fail(
      422,
      'Projeto inválido. Corrija os campos indicados e tente novamente.',
      parsed.error.issues.slice(0, 10).map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY as string });
    const out = await runAnalyst({ client, model: process.env.AI_MODEL || DEFAULT_MODEL, project: parsed.data, messages });
    return json(out);
  } catch (e) {
    console.error('[api/ai]', e instanceof Error ? e.message : e);
    return fail(502, apiErrorMessage(e));
  }
}
