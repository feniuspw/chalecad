import type { ReactNode } from 'react';
import { TOOL_NAMES } from '../../lib/ai/types';

export type Inline = { kind: 'text' | 'bold' | 'code' | 'tool'; value: string };
export type Block = { kind: 'p'; text: string } | { kind: 'ul' | 'ol'; items: string[] };

const INLINE = new RegExp(`(\\*\\*[^*]+\\*\\*|\`[^\`]+\`|\\[(?:${TOOL_NAMES.join('|')})\\])`);

export function tokenizeInline(s: string): Inline[] {
  return s
    .split(INLINE)
    .filter(Boolean)
    .map((part): Inline => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return { kind: 'bold', value: part.slice(2, -2) };
      if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return { kind: 'code', value: part.slice(1, -1) };
      if (part.startsWith('[') && part.endsWith(']') && (TOOL_NAMES as readonly string[]).includes(part.slice(1, -1))) return { kind: 'tool', value: part.slice(1, -1) };
      return { kind: 'text', value: part };
    });
}

export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      blocks.push({ kind: 'p', text: '' });
      continue;
    }
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const m = ul ?? ol;
    if (m) {
      const kind = ul ? 'ul' : 'ol';
      const last = blocks.at(-1);
      if (last && last.kind === kind) last.items.push(m[1] as string);
      else blocks.push({ kind, items: [m[1] as string] });
    } else {
      const last = blocks.at(-1);
      if (last && last.kind === 'p' && last.text) last.text += `\n${line.trim()}`;
      else blocks.push({ kind: 'p', text: line.trim() });
    }
  }
  return blocks.filter((b) => b.kind !== 'p' || b.text);
}

/** Selo discreto indicando de qual ferramenta veio o número citado. */
export function ToolMark({ name }: { name: string }) {
  return (
    <span
      title={`Valor calculado pela ferramenta ${name}`}
      className="mx-0.5 inline-flex translate-y-[-1px] items-center rounded border border-amber-200 bg-accent-soft px-1 py-px align-middle font-mono text-[10px] leading-none font-medium text-accent-hover"
    >
      {name}
    </span>
  );
}

function Inlines({ text }: { text: string }): ReactNode {
  return tokenizeInline(text).map((t, i) => {
    if (t.kind === 'bold') return <strong key={i} className="font-semibold text-stone-900">{t.value}</strong>;
    if (t.kind === 'code') return <code key={i} className="rounded bg-stone-100 px-1 py-px font-mono text-[12px]">{t.value}</code>;
    if (t.kind === 'tool') return <ToolMark key={i} name={t.value} />;
    return <span key={i}>{t.value}</span>;
  });
}

/** Markdown mínimo (parágrafos, listas, negrito, código) com selos de ferramenta. */
export function RichText({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-[13px] leading-relaxed text-stone-800">
      {parseBlocks(text).map((b, i) =>
        b.kind === 'p' ? (
          <p key={i} className="whitespace-pre-line">
            <Inlines text={b.text} />
          </p>
        ) : b.kind === 'ul' ? (
          <ul key={i} className="list-disc space-y-1 pl-5 marker:text-stone-400">
            {b.items.map((it, j) => (
              <li key={j}><Inlines text={it} /></li>
            ))}
          </ul>
        ) : (
          <ol key={i} className="list-decimal space-y-1 pl-5 marker:text-stone-400">
            {b.items.map((it, j) => (
              <li key={j}><Inlines text={it} /></li>
            ))}
          </ol>
        ),
      )}
    </div>
  );
}
