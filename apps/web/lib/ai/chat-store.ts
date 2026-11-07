'use client';
import { create } from 'zustand';
import { useEditor } from '@/lib/store/editor';
import { applyJsonPatch } from './patch';
import { tryPatch } from './try-patch';
import type { AnalystResponse, ChatMessage, Proposal, ToolCallInfo } from './types';

export interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
  toolCalls?: ToolCallInfo[];
  proposals?: Proposal[];
}

export type ProposalState = 'pending' | 'applied' | 'discarded';

export const REVIEW_QUESTION =
  'Revise o projeto: consulte orçamento, quantitativos e verificações estruturais e me diga os 3 pontos que mais merecem atenção, com sugestões práticas.';

interface ChatState {
  messages: UiMessage[];
  loading: boolean;
  /** Motivo de a IA estar desligada (null = ligada ou desconhecido). */
  disabled: string | null;
  proposalState: Record<string, ProposalState>;
  send: (text: string) => Promise<void>;
  checkStatus: () => Promise<void>;
  reset: () => void;
  discard: (id: string) => void;
  /** Aplica a proposta pelo store do editor (com desfazer). Devolve mensagem de erro ou null. */
  apply: (proposal: Proposal) => string | null;
}

let seq = 0;
const uid = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

function history(messages: UiMessage[]): ChatMessage[] {
  const h = messages.filter((m) => !m.error).slice(-12).map((m) => ({ role: m.role, content: m.content }));
  while (h[0] && h[0].role !== 'user') h.shift();
  return h;
}

export const useChat = create<ChatState>((set, get) => ({
  messages: [],
  loading: false,
  disabled: null,
  proposalState: {},

  async checkStatus() {
    try {
      const res = await fetch('/api/ai');
      const data = (await res.json()) as { enabled?: boolean; reason?: string };
      set({ disabled: data.enabled === false ? (data.reason ?? 'IA desligada.') : null });
    } catch {
      /* sem servidor: o erro aparece ao enviar */
    }
  },

  async send(text) {
    const q = text.trim();
    if (!q || get().loading) return;
    const userMsg: UiMessage = { id: uid(), role: 'user', content: q };
    set((s) => ({ messages: [...s.messages, userMsg], loading: true }));
    const fail = (content: string) =>
      set((s) => ({ messages: [...s.messages, { id: uid(), role: 'assistant', content, error: true }], loading: false }));
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: useEditor.getState().project, messages: history(get().messages) }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<AnalystResponse> & { disabled?: boolean; reason?: string; error?: string };
      if (res.status === 503 && data.disabled) {
        set((s) => ({ disabled: data.reason ?? 'IA desligada.', loading: false, messages: s.messages.filter((m) => m.id !== userMsg.id) }));
        return;
      }
      if (!res.ok || typeof data.text !== 'string') return fail(data.error ?? 'Não foi possível consultar a IA agora.');
      const proposals = data.proposals ?? [];
      set((s) => ({
        loading: false,
        messages: [...s.messages, { id: uid(), role: 'assistant', content: data.text as string, toolCalls: data.toolCalls ?? [], proposals }],
        proposalState: { ...s.proposalState, ...Object.fromEntries(proposals.map((p) => [p.id, 'pending' as const])) },
      }));
    } catch {
      fail('Sem conexão com o servidor. Verifique se o app está rodando e tente novamente.');
    }
  },

  reset() {
    set({ messages: [], loading: false, proposalState: {} });
  },

  discard(id) {
    set((s) => ({ proposalState: { ...s.proposalState, [id]: 'discarded' } }));
  },

  apply(proposal) {
    const check = tryPatch(useEditor.getState().project, proposal.patch);
    if (!check.ok) return `Esta proposta não vale mais para o projeto atual: ${check.errors[0] ?? 'patch inválido'}`;
    useEditor.getState().update(`IA: ${proposal.label}`, (d) => {
      applyJsonPatch(d, proposal.patch);
    });
    set((s) => ({ proposalState: { ...s.proposalState, [proposal.id]: 'applied' } }));
    return null;
  },
}));
