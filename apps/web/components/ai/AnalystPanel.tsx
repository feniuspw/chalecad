'use client';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowUp, BadgeDollarSign, ClipboardCheck, Eraser, Ruler, ShieldCheck, Sparkles, TriangleAlert, Wrench } from 'lucide-react';
import { Button, IconButton, cn } from '@chalecad/ui';
import { REVIEW_QUESTION, useChat, type UiMessage } from '@/lib/ai/chat-store';
import type { ToolCallInfo } from '@/lib/ai/types';
import { ProposalCard } from './ProposalCard';
import { RichText } from './rich-text';

const SUGGESTIONS = [
  { icon: BadgeDollarSign, text: 'O que mais pesa no orçamento?' },
  { icon: Wrench, text: 'Quanto economizo trocando placa cimentícia por OSB com siding?' },
  { icon: ShieldCheck, text: 'Revise a estrutura' },
  { icon: Ruler, text: 'Aumenta o mezanino em 1 m' },
];

const TOOL_LABEL: Record<string, string> = {
  getProject: 'Projeto',
  getQuantities: 'Quantitativos',
  getStructuralReport: 'Estrutura',
  getBudget: 'Orçamento',
  simulateVariant: 'Simulação',
  proposePatch: 'Proposta',
};

function ToolChips({ calls }: { calls: ToolCallInfo[] }) {
  if (calls.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1" aria-label="Ferramentas usadas">
      {calls.map((c, i) => (
        <li
          key={i}
          title={`${c.name}: ${c.summary}`}
          className="flex max-w-full items-center gap-1 rounded-full border border-border bg-white px-2 py-0.5 text-[11px] text-stone-600"
        >
          <span className="font-medium text-stone-800">{TOOL_LABEL[c.name] ?? c.name}</span>
          <span className="truncate text-stone-500">{c.summary}</span>
        </li>
      ))}
    </ul>
  );
}

function Message({ m }: { m: UiMessage }) {
  if (m.role === 'user') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[88%] rounded-2xl rounded-br-md bg-stone-900 px-3 py-2 text-[13px] leading-relaxed whitespace-pre-line text-white">{m.content}</p>
      </div>
    );
  }
  if (m.error) {
    return (
      <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> {m.content}
      </p>
    );
  }
  return (
    <div className="flex gap-2">
      <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-hover" aria-hidden>
        <Sparkles className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <ToolChips calls={m.toolCalls ?? []} />
        <RichText text={m.content} />
        {(m.proposals ?? []).map((p) => (
          <ProposalCard key={p.id} proposal={p} />
        ))}
        <p className="text-[11px] leading-snug text-stone-400">Triagem automática: não substitui projeto estrutural com ART.</p>
      </div>
    </div>
  );
}

function Thinking() {
  return (
    <div className="flex items-center gap-2 text-xs text-stone-500" role="status" aria-live="polite">
      <span className="grid size-6 place-items-center rounded-full bg-accent-soft text-accent-hover">
        <Sparkles className="size-3.5 animate-pulse" />
      </span>
      analisando
      <span className="flex gap-0.5" aria-hidden>
        {[0, 150, 300].map((d) => (
          <span key={d} className="size-1 animate-bounce rounded-full bg-stone-400" style={{ animationDelay: `${d}ms` }} />
        ))}
      </span>
    </div>
  );
}

export function DisabledState({ reason }: { reason: string }) {
  return (
    <div className="m-3 space-y-3 rounded-xl border border-border bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-full bg-stone-100 text-stone-500">
          <Sparkles className="size-4" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-stone-900">IA desligada</h3>
          <p className="text-xs text-stone-500">O Analista precisa de uma chave da Anthropic.</p>
        </div>
      </div>
      <p className="text-xs text-stone-600">{reason}</p>
      <ol className="list-decimal space-y-1.5 pl-5 text-xs text-stone-700">
        <li>
          Crie ou edite <code className="rounded bg-stone-100 px-1 font-mono">apps/web/.env.local</code>:
          <pre className="mt-1 overflow-auto rounded-md bg-stone-900 p-2.5 font-mono text-[11px] leading-relaxed text-stone-100">{'AI_ENABLED=true\nANTHROPIC_API_KEY=sk-ant-...'}</pre>
        </li>
        <li>Reinicie o servidor de desenvolvimento.</li>
      </ol>
      <p className="text-[11px] text-stone-500">Sem a IA, o resto do editor (cálculos, orçamento, roteiro de obra e pacote do engenheiro) continua funcionando.</p>
    </div>
  );
}

/** Aba "Analista": chat com a IA, que consulta o motor por ferramentas e propõe edições para aprovação. */
export function AnalystPanel() {
  const { messages, loading, disabled, send, reset, checkStatus } = useChat();
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void checkStatus();
  }, [checkStatus]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages.length, loading]);

  const submit = (text: string) => {
    if (!text.trim() || loading || disabled) return;
    setDraft('');
    void send(text);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit(draft);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-muted">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-white px-3 py-2">
        <Button size="sm" variant="outline" className="h-8" disabled={loading || !!disabled} onClick={() => submit(REVIEW_QUESTION)}>
          <ClipboardCheck /> Revisar projeto
        </Button>
        <IconButton label="Nova conversa" disabled={messages.length === 0 && !loading} onClick={reset}>
          <Eraser />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3" aria-live="polite">
        {disabled ? <DisabledState reason={disabled} /> : null}
        {!disabled && messages.length === 0 ? (
          <div className="space-y-3 pt-2">
            <div className="text-center">
              <span className="mx-auto grid size-10 place-items-center rounded-full bg-accent-soft text-accent-hover">
                <Sparkles className="size-5" />
              </span>
              <h3 className="mt-2 text-sm font-semibold text-stone-900">Analista do projeto</h3>
              <p className="mx-auto mt-1 max-w-[16rem] text-xs leading-relaxed text-stone-500">
                Pergunte sobre custos, materiais e estrutura. Os números vêm dos motores do ChaléCAD; edições só entram com a sua aprovação.
              </p>
            </div>
            <ul className="space-y-1.5">
              {SUGGESTIONS.map(({ icon: Icon, text }) => (
                <li key={text}>
                  <button
                    type="button"
                    onClick={() => submit(text)}
                    className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-white px-3 py-2 text-left text-[13px] text-stone-700 shadow-sm transition-colors outline-none hover:border-amber-300 hover:bg-accent-soft/40 focus-visible:ring-2 focus-visible:ring-accent/50"
                  >
                    <Icon className="size-4 shrink-0 text-accent" aria-hidden /> {text}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {messages.map((m) => (
          <Message key={m.id} m={m} />
        ))}
        {loading ? <Thinking /> : null}
        <div ref={endRef} />
      </div>

      <form
        className="shrink-0 border-t border-border bg-white p-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          submit(draft);
        }}
      >
        <div className={cn('flex items-end gap-2 rounded-xl border border-border-strong bg-white p-1.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20', disabled && 'opacity-60')}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            rows={1}
            disabled={!!disabled}
            maxLength={2000}
            placeholder={disabled ? 'IA desligada' : 'Pergunte ou peça uma alteração…'}
            aria-label="Mensagem para o Analista"
            className="max-h-28 min-h-8 flex-1 resize-none bg-transparent px-1.5 py-1.5 text-[13px] outline-none placeholder:text-stone-400 [field-sizing:content]"
          />
          <Button type="submit" size="icon" className="size-8 rounded-lg" disabled={!draft.trim() || loading || !!disabled} aria-label="Enviar">
            <ArrowUp />
          </Button>
        </div>
      </form>
    </div>
  );
}
