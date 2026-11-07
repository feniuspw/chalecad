/** Limite simples por IP em memória (janela deslizante). Suficiente para uso local/instância única. */
const hits = new Map<string, number[]>();

export const RATE_LIMIT = { max: 30, windowMs: 60 * 60 * 1000 };

export function checkRate(key: string, now = Date.now()): { ok: true } | { ok: false; retryAfterSec: number } {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
  if (recent.length >= RATE_LIMIT.max) {
    hits.set(key, recent);
    return { ok: false, retryAfterSec: Math.ceil((RATE_LIMIT.windowMs - (now - (recent[0] as number))) / 1000) };
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t >= RATE_LIMIT.windowMs)) hits.delete(k);
  return { ok: true };
}

export function resetRateLimit(): void {
  hits.clear();
}
