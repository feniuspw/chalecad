import type Anthropic from '@anthropic-ai/sdk';
import { computeAll, type Project } from '@chalecad/engine';
import { getCatalog } from '@chalecad/catalog';
import { SYSTEM_PROMPT } from './prompt';
import { TOOL_DEFS, runTool, type ToolContext } from './tools';
import type { AnalystResponse, ChatMessage, ToolCallInfo } from './types';

export const MAX_ITERATIONS = 8;
export const MAX_TOKENS = 4096;
export const DEFAULT_MODEL = 'claude-opus-5-5';

/** Parte do cliente da Anthropic de que o loop precisa (facilita o mock nos testes). */
export interface MessagesClient {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Pick<Anthropic.Message, 'content' | 'stop_reason'>>;
  };
}

export interface RunOptions {
  client: MessagesClient;
  model: string;
  project: Project;
  messages: ChatMessage[];
}

/** Loop de tool use: executa as ferramentas localmente até o modelo parar (limite de 8 iterações). */
export async function runAnalyst({ client, model, project, messages }: RunOptions): Promise<AnalystResponse> {
  const catalog = getCatalog();
  const ctx: ToolContext = { project, results: computeAll(project, catalog), catalog, proposals: [] };
  const toolCalls: ToolCallInfo[] = [];
  const convo: Anthropic.MessageParam[] = messages.map((m) => ({ role: m.role, content: m.content }));
  let text = '';

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const res = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: TOOL_DEFS as Anthropic.Tool[],
      messages: convo,
    });
    const turnText = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (turnText) text = text ? `${text}\n\n${turnText}` : turnText;

    if (res.stop_reason !== 'tool_use') return { text: text || 'Não tenho uma resposta para isso.', proposals: ctx.proposals, toolCalls };

    const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    convo.push({ role: 'assistant', content: res.content as Anthropic.ContentBlockParam[] });
    const results: Anthropic.ToolResultBlockParam[] = uses.map((u) => {
      const out = runTool(u.name, u.input, ctx);
      toolCalls.push({ name: u.name, input: u.input, summary: out.summary });
      return { type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out.result), ...(out.isError ? { is_error: true } : {}) };
    });
    convo.push({ role: 'user', content: results });
  }

  return {
    text: `${text ? `${text}\n\n` : ''}Parei após ${MAX_ITERATIONS} consultas sem fechar a resposta. Peça de novo de forma mais específica.`.trim(),
    proposals: ctx.proposals,
    toolCalls,
  };
}
