'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { ScrollArea } from '@chalecad/ui';
import { searchSections, type PanelSectionId } from '@/lib/glossary/settingsIndex';
import { useEditor } from '@/lib/store/editor';
import { ObjectInspector } from './Inspectors';
import { MezzanineSection, TypologySection } from './TypologySections';
import { ExtrasSection } from './ExtrasSection';
import { FinishesSection } from './FinishesSection';
import { InstallationsSection } from './InstallationsSection';
import { PerformanceSection } from './PerformanceSection';
import { TerrainSection } from './TerrainSection';
import { SearchOpenContext } from './fields';
import { FoundationSection, RoofSection, SiteSection, SystemSection } from './SystemSections';

/** Atalho "/": foca a busca, salvo quando já se está digitando num campo. */
function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

function SettingsSearch({ query, setQuery, shown }: { query: string; setQuery: (q: string) => void; shown: number }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      e.preventDefault();
      ref.current?.focus();
      ref.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="mt-3">
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-stone-400" />
        <input
          ref={ref}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && query) {
              e.stopPropagation();
              setQuery('');
            }
          }}
          placeholder="Buscar ajuste (ex.: beiral, espaçamento, cor da telha)"
          aria-label="Buscar ajuste"
          className="h-8 w-full rounded-md border border-border bg-white pr-7 pl-8 text-[11px] outline-none placeholder:text-stone-400 focus-visible:ring-2 focus-visible:ring-accent/40 [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button type="button" aria-label="Limpar busca" onClick={() => setQuery('')} className="absolute top-1/2 right-1.5 grid size-5 -translate-y-1/2 place-items-center rounded text-stone-500 hover:bg-stone-100">
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
      {query && shown === 0 ? <p className="mt-2 text-xs text-stone-500">Nenhum ajuste encontrado. Tente outra palavra, como "telhado" ou "parede".</p> : null}
    </div>
  );
}

/** Painel esquerdo: propriedades do projeto (sem seleção) ou inspetor do objeto selecionado. */
export function PropertiesPanel() {
  const selection = useEditor((s) => s.selection);
  const project = useEditor((s) => s.project);
  const [query, setQuery] = useState('');
  const searching = query.trim() !== '';
  const visible = new Set<PanelSectionId>(searchSections(query));
  const sections: [PanelSectionId, ReactNode][] = [
    ['typology', <TypologySection key="typology" project={project} />],
    ['mezzanine', <MezzanineSection key="mezzanine" project={project} />],
    ['system', <SystemSection key="system" project={project} />],
    ['roof', <RoofSection key="roof" project={project} />],
    ['foundation', <FoundationSection key="foundation" project={project} />],
    ['terrain', <TerrainSection key="terrain" project={project} />],
    ['finishes', <FinishesSection key="finishes" project={project} />],
    ['installations', <InstallationsSection key="installations" project={project} />],
    ['performance', <PerformanceSection key="performance" project={project} />],
    ['extras', <ExtrasSection key="extras" project={project} />],
    ['site', <SiteSection key="site" project={project} />],
  ];

  return (
    <ScrollArea className="h-full">
      {selection ? (
        <ObjectInspector />
      ) : (
        <div>
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-stone-900">Propriedades</h2>
            <p className="text-xs text-stone-500">Mude qualquer valor e o 3D atualiza na hora. Clique num objeto para editá-lo.</p>
            <SettingsSearch query={query} setQuery={setQuery} shown={visible.size} />
          </div>
          <SearchOpenContext.Provider value={searching}>{sections.filter(([id]) => visible.has(id)).map(([, node]) => node)}</SearchOpenContext.Provider>
        </div>
      )}
    </ScrollArea>
  );
}
