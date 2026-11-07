// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createProject } from '../project/templates';
import { MAX_ITERATIONS, runAnalyst, type MessagesClient } from './loop';

const project = createProject('gable_mezzanine', { name: 'Fixture' });
const toolUse = (id: string, name: string, input: object = {}) => ({ type: 'tool_use' as const, id, name, input });

function mock(responses: unknown[]) {
  const create = vi.fn(async (_p?: unknown) => responses.shift() ?? { content: [{ type: 'text', text: 'fim' }], stop_reason: 'end_turn' });
  return { client: { messages: { create } } as unknown as MessagesClient, create };
}

describe('runAnalyst (loop de tool use)', () => {
  it('executa ferramentas, devolve tool_result com o mesmo id e junta o texto final', async () => {
    const { client, create } = mock([
      { content: [{ type: 'text', text: 'Vou olhar.' }, toolUse('t1', 'getBudget')], stop_reason: 'tool_use' },
      { content: [{ type: 'text', text: 'Total R$ 1 [getBudget]' }], stop_reason: 'end_turn' },
    ]);
    const out = await runAnalyst({ client, model: 'm', project, messages: [{ role: 'user', content: 'custo?' }] });
    expect(create).toHaveBeenCalledTimes(2);
    expect(out.toolCalls).toHaveLength(1);
    expect(out.toolCalls[0]!.name).toBe('getBudget');
    expect(out.text).toContain('[getBudget]');
    const second = create.mock.calls[1]![0] as unknown as { messages: { role: string; content: unknown }[] };
    const last = second.messages.at(-1)!;
    expect(last.role).toBe('user');
    expect((last.content as { tool_use_id: string }[])[0]!.tool_use_id).toBe('t1');
    expect(second.messages.at(-2)!.role).toBe('assistant');
  });

  it('coleta propostas de proposePatch', async () => {
    const patch = [{ op: 'replace', path: '/typology/width', value: project.typology.width + 0.5 }];
    const { client } = mock([
      { content: [toolUse('a', 'simulateVariant', { label: 'v', patch }), toolUse('b', 'proposePatch', { label: 'v', rationale: 'r', patch })], stop_reason: 'tool_use' },
      { content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' },
    ]);
    const out = await runAnalyst({ client, model: 'm', project, messages: [{ role: 'user', content: 'x' }] });
    expect(out.proposals).toHaveLength(1);
    expect(out.proposals[0]!.patch).toEqual(patch);
    expect(out.toolCalls.map((c) => c.name)).toEqual(['simulateVariant', 'proposePatch']);
  });

  it('para no limite de iterações', async () => {
    const loopForever = Array.from({ length: 20 }, (_, i) => ({ content: [toolUse(`t${i}`, 'getProject')], stop_reason: 'tool_use' }));
    const { client, create } = mock(loopForever);
    const out = await runAnalyst({ client, model: 'm', project, messages: [{ role: 'user', content: 'x' }] });
    expect(create).toHaveBeenCalledTimes(MAX_ITERATIONS);
    expect(out.text).toMatch(/Parei/);
  });
});
