'use client';
import { ScrollArea } from '@chalecad/ui';
import { useEditor } from '@/lib/store/editor';
import { ObjectInspector } from './Inspectors';
import { MezzanineSection, TypologySection } from './TypologySections';
import { ExtrasSection } from './ExtrasSection';
import { TerrainSection } from './TerrainSection';
import { FoundationSection, RoofSection, SiteSection, SystemSection } from './SystemSections';

/** Painel esquerdo: propriedades do projeto (sem seleção) ou inspetor do objeto selecionado. */
export function PropertiesPanel() {
  const selection = useEditor((s) => s.selection);
  const project = useEditor((s) => s.project);

  return (
    <ScrollArea className="h-full">
      {selection ? (
        <ObjectInspector />
      ) : (
        <div>
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-stone-900">Propriedades</h2>
            <p className="text-xs text-stone-500">Mude qualquer valor e o 3D atualiza na hora. Clique num objeto para editá-lo.</p>
          </div>
          <TypologySection project={project} />
          <MezzanineSection project={project} />
          <SystemSection project={project} />
          <RoofSection project={project} />
          <FoundationSection project={project} />
          <TerrainSection project={project} />
          <ExtrasSection project={project} />
          <SiteSection project={project} />
        </div>
      )}
    </ScrollArea>
  );
}
