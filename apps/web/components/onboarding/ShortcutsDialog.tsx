'use client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Kbd } from '@chalecad/ui';
import { groupShortcuts, keyCaps, SHORTCUT_GROUPS, type Shortcut, type ShortcutContext } from './shortcuts';

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

const CONTEXT_NOTE: Partial<Record<ShortcutContext, string>> = {
  furniture: 'com a ferramenta Móveis ativa',
  presentation: 'no modo Apresentação',
};

function Keys({ combos, mac, mouse, together }: { combos: string[]; mac: boolean; mouse?: boolean; together?: boolean }) {
  return (
    <span className="flex flex-wrap items-center justify-end gap-x-1.5 gap-y-1">
      {combos.map((c, i) => (
        <span key={c} className="flex items-center gap-1">
          {i > 0 && !together ? <span className="text-[11px] text-stone-400">ou</span> : null}
          {mouse ? <span className="text-xs font-medium text-stone-700">{c}</span> : keyCaps(c, mac).map((k, j) => <Kbd key={`${k}-${j}`}>{k}</Kbd>)}
        </span>
      ))}
    </span>
  );
}

function Row({ s, mac }: { s: Shortcut; mac: boolean }) {
  return (
    <li className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-sm text-stone-700">{s.label}</span>
      <Keys combos={s.keys} mac={mac} mouse={s.mouse} together={s.together} />
    </li>
  );
}

/** Diálogo com todos os atalhos do editor, agrupados. Lê a tabela única `SHORTCUTS`. */
export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const mac = isMac();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Atalhos de teclado</DialogTitle>
          <DialogDescription>
            Os atalhos não disparam dentro de campos de texto nem com um diálogo aberto. Aperte <Kbd>?</Kbd> a qualquer momento para ver esta lista.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {SHORTCUT_GROUPS.map((g) => {
            const items = groupShortcuts(g);
            const note = CONTEXT_NOTE[items[0]?.context ?? 'editor'];
            return (
              <section key={g} aria-label={g}>
                <h3 className="border-b border-border pb-1 text-xs font-semibold tracking-wide text-stone-500 uppercase">
                  {g}
                  {note ? <span className="ml-2 font-normal tracking-normal text-stone-400 normal-case">{note}</span> : null}
                </h3>
                <ul className="divide-y divide-stone-100">
                  {items.map((s) => (
                    <Row key={s.id} s={s} mac={mac} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
