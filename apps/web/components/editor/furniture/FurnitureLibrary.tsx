'use client';
import { useMemo, useState } from 'react';
import { Search, Sofa, X } from 'lucide-react';
import { getCatalog, getPriceBook, type FurnitureGroup, type FurnitureSpec } from '@chalecad/catalog';
import { Kbd, cn } from '@chalecad/ui';
import { formatBRLRange } from '@/lib/format';
import { fmt } from '@/lib/project/format';
import { furniturePrice } from '@/lib/project/furnitureInfo';
import { useEditor } from '@/lib/store/editor';
import { FURNITURE_MIME, useFurnitureUi } from '@/components/scene/furnitureUi';
import { FurnitureThumb } from './FurnitureThumb';

export const GROUP_LABELS: Record<FurnitureGroup, string> = {
  living: 'Sala',
  dining: 'Jantar',
  bedroom: 'Quarto',
  kitchen: 'Cozinha',
  bathroom: 'Banheiro',
  laundry: 'Lavanderia',
  outdoor: 'Externo',
  decor: 'Decoração',
};
const GROUP_ORDER: FurnitureGroup[] = ['living', 'dining', 'bedroom', 'kitchen', 'bathroom', 'laundry', 'outdoor', 'decor'];

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** "2,10 × 0,90 m". */
export const sizeLabel = (s: FurnitureSpec) => `${fmt(s.size.w)} × ${fmt(s.size.d)} m`;

function Card({ spec, active, price, onPick }: { spec: FurnitureSpec; active: boolean; price: string | null; onPick: () => void }) {
  const setDragItem = useFurnitureUi((s) => s.setDragItem);
  return (
    <button
      type="button"
      draggable
      aria-pressed={active}
      onClick={onPick}
      onDragStart={(e) => {
        e.dataTransfer.setData(FURNITURE_MIME, spec.id);
        e.dataTransfer.setData('text/plain', spec.name);
        e.dataTransfer.effectAllowed = 'copy';
        setDragItem(spec.id);
        useEditor.getState().setToolOptions({ furnitureItem: spec.id });
      }}
      onDragEnd={() => {
        setDragItem(null);
        useFurnitureUi.getState().setGhost(null);
      }}
      className={cn(
        'group flex cursor-grab flex-col gap-1 rounded-lg border bg-white p-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/50 active:cursor-grabbing',
        active ? 'border-accent bg-accent-soft/50 ring-1 ring-accent' : 'border-border hover:border-stone-300 hover:bg-stone-50',
      )}
    >
      <span className="grid h-16 place-items-center rounded-md bg-stone-50 group-aria-pressed:bg-white">
        <FurnitureThumb spec={spec} size={56} />
      </span>
      <span className="line-clamp-2 min-h-[2lh] text-[12px] leading-tight font-medium text-stone-900">{spec.name}</span>
      <span className="text-[11px] text-stone-500 tabular-nums">{sizeLabel(spec)}</span>
      {price ? <span className="text-[11px] font-medium text-stone-700 tabular-nums">{price}</span> : null}
    </button>
  );
}

/**
 * Biblioteca de móveis: filtros por grupo, busca e cartões arrastáveis. Arrastar para a cena solta o móvel no piso do
 * nível ativo (com encaixe na parede); clicar escolhe o item e entra no modo de posicionar.
 */
export function FurnitureLibrary() {
  const catalog = getCatalog();
  const item = useEditor((s) => s.toolOptions.furnitureItem);
  const setToolOptions = useEditor((s) => s.setToolOptions);
  const setTool = useEditor((s) => s.setTool);
  const priceBookId = useEditor((s) => s.project.priceBookId);
  const overrides = useEditor((s) => s.project.priceOverrides);
  const [group, setGroup] = useState<FurnitureGroup | 'all'>('all');
  const [q, setQ] = useState('');

  const book = useMemo(() => {
    try {
      return getPriceBook(catalog, priceBookId);
    } catch {
      return null;
    }
  }, [catalog, priceBookId]);
  const list = useMemo(() => {
    const nq = norm(q.trim());
    return catalog.furniture.filter((f) => (group === 'all' || f.group === group) && (!nq || norm(f.name).includes(nq) || norm(GROUP_LABELS[f.group]).includes(nq)));
  }, [catalog, group, q]);
  const priceOf = (id: string) => {
    const p = furniturePrice(id, catalog, book, overrides);
    return p ? formatBRLRange(p.min, p.max) : null;
  };

  return (
    <section aria-label="Biblioteca de móveis" className="pointer-events-auto absolute top-14 bottom-14 left-3 z-20 flex w-[19.5rem] flex-col overflow-hidden rounded-xl border border-border bg-white/95 shadow-float backdrop-blur">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <Sofa className="size-4 text-accent" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-stone-900">Móveis</h2>
          <p className="text-[11px] text-stone-500">Arraste para a cena ou clique e solte no piso</p>
        </div>
        <button type="button" aria-label="Fechar biblioteca" onClick={() => setTool('select')} className="rounded p-1 text-stone-500 outline-none hover:bg-stone-100 hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-accent/50">
          <X className="size-4" />
        </button>
      </header>

      <div className="space-y-2 border-b border-border px-3 py-2">
        <label className="relative block">
          <span className="sr-only">Buscar móvel</span>
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-stone-400" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Buscar por nome"
            className="h-8 w-full rounded-md border border-border bg-white pr-3 pl-8 text-[13px] text-stone-900 shadow-sm outline-none placeholder:text-stone-400 hover:border-stone-300 focus-visible:ring-2 focus-visible:ring-accent/50"
          />
        </label>
        <div role="group" aria-label="Grupo" className="flex flex-wrap gap-1">
          {(['all', ...GROUP_ORDER] as const).map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={group === g}
              onClick={() => setGroup(g)}
              className="h-6 rounded-full border border-border px-2.5 text-[11px] font-medium text-stone-600 outline-none hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-accent/50 aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent-hover"
            >
              {g === 'all' ? 'Todos' : GROUP_LABELS[g]}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {list.length === 0 ? (
          <p className="py-8 text-center text-xs text-stone-500">Nenhum móvel encontrado.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {list.map((s) => (
              <Card key={s.id} spec={s} active={s.id === item} price={priceOf(s.id)} onPick={() => setToolOptions({ furnitureItem: s.id })} />
            ))}
          </div>
        )}
      </div>

      <footer className="flex items-center justify-between border-t border-border px-3 py-1.5 text-[11px] text-stone-500">
        <span>
          <Kbd>R</Kbd> gira 90°
        </span>
        <span>
          <Kbd>Alt</Kbd> sem encaixe
        </span>
        <span>
          <Kbd>Esc</Kbd> sai
        </span>
      </footer>
    </section>
  );
}
