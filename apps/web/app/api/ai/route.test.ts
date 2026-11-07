// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetRateLimit } from '../../../lib/ai/rate-limit';
import { createProject } from '../../../lib/project/templates';
import { GET, POST } from './route';

const req = (body: unknown) => new Request('http://localhost/api/ai', { method: 'POST', body: JSON.stringify(body) });
afterEach(() => {
  vi.unstubAllEnvs();
  resetRateLimit();
});

describe('/api/ai', () => {
  const project = createProject('gable_mezzanine', { name: 'Fixture' });
  const messages = [{ role: 'user', content: 'oi' }];

  it('AI_ENABLED=false responde 503 disabled', async () => {
    vi.stubEnv('AI_ENABLED', 'false');
    const res = await POST(req({ project, messages }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ disabled: true, reason: expect.stringContaining('AI_ENABLED=true') });
  });

  it('sem chave responde 503 disabled', async () => {
    vi.stubEnv('AI_ENABLED', 'true');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const res = await POST(req({ project, messages }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ disabled: true });
  });

  it('GET informa o estado', async () => {
    vi.stubEnv('AI_ENABLED', 'false');
    expect(await (await GET()).json()).toMatchObject({ enabled: false });
  });

  it('ligada: valida corpo e projeto antes de chamar a API', async () => {
    vi.stubEnv('AI_ENABLED', 'true');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-teste');
    expect((await POST(req({ project, messages: [] }))).status).toBe(400);
    expect((await POST(req({ project: { x: 1 }, messages }))).status).toBe(422);
  });
});
