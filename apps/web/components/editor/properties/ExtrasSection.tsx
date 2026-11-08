'use client';
import type { ComponentType } from 'react';
import { Armchair, BrickWall, ChevronRight, Droplets, Fence, Mountain, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button } from '@chalecad/ui';
import type { Project } from '@chalecad/engine';
import { addExtra, EXTRA_LABELS, extraLabel, extraSummary, type ExtraKind } from '@/lib/project/extras';
import { useEditor } from '@/lib/store/editor';
import { Notice, Section } from './fields';
import { usePanelUi } from './ui-state';

export const EXTRA_ICONS: Record<ExtraKind, ComponentType<{ className?: string }>> = {
  deck: Armchair,
  wall: BrickWall,
  fence: Fence,
  retaining: Mountain,
  water_tower: Droplets,
};

const ADD: { kind: ExtraKind; label: string; hint: string }[] = [
  { kind: 'deck', label: 'Varanda / deck', hint: 'Piso elevado junto à fachada' },
  { kind: 'wall', label: 'Muro', hint: 'Alvenaria em volta da casa' },
  { kind: 'fence', label: 'Cerca', hint: 'Mourões e tela' },
  { kind: 'retaining', label: 'Muro de arrimo', hint: 'Contém o corte do terreno' },
  { kind: 'water_tower', label: "Torre da caixa d'água", hint: 'Eleva a caixa acima do chuveiro mais alto (sobre o banheiro do mezanino)' },
];

export function ExtrasSection({ project }: { project: Project }) {
  const open = usePanelUi((s) => s.open.extras);
  const setOpen = usePanelUi((s) => s.setOpen);
  const update = useEditor((s) => s.update);
  const select = useEditor((s) => s.select);
  const setHover = useEditor((s) => s.setHover);
  const extras = project.extras;

  const add = (kind: ExtraKind) => {
    const box: { id: string | null } = { id: null };
    update(`Adicionar ${EXTRA_LABELS[kind].toLowerCase()}`, (d) => {
      box.id = addExtra(d, kind);
    });
    if (box.id) {
      select({ kind: 'extra', id: box.id });
      if (kind === 'retaining' && project.site.type === 'flat') toast.info('O arrimo vale mais em terreno inclinado. Ajuste em “Terreno”.');
      if (kind === 'water_tower') toast.info('A torre foi posta sobre o banheiro (do mezanino, se houver). A caixa precisa ficar ~1 m acima do chuveiro mais alto.');
    }
  };

  return (
    <Section title="Extras" open={open} onOpenChange={(v) => setOpen('extras', v)} badge={<Badge variant="neutral">{extras.length === 0 ? 'nenhum' : extras.length}</Badge>}>
      {extras.length === 0 ? (
        <Notice>Nenhum extra ainda. Adicione varanda, muro, cerca, muro de arrimo ou a torre da caixa d'água: eles entram no orçamento (etapa “Extras”).</Notice>
      ) : (
        <ul className="space-y-1.5">
          {extras.map((e) => {
            const Icon = EXTRA_ICONS[e.kind];
            const sum = extraSummary(e);
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => select({ kind: 'extra', id: e.id })}
                  onMouseEnter={() => setHover(e.id)}
                  onMouseLeave={() => setHover(null)}
                  className="group flex w-full items-center gap-2.5 rounded-lg border border-border bg-white px-2.5 py-2 text-left outline-none hover:border-stone-300 hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-accent/50"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-stone-100 text-stone-600 group-hover:bg-white">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-stone-900">{extraLabel(project, e.id)}</span>
                    <span className="block truncate text-[11px] text-stone-500 tabular-nums">{sum.detail}</span>
                  </span>
                  <ChevronRight className="size-3.5 text-stone-300 group-hover:text-stone-500" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="grid grid-cols-2 gap-2">
        {ADD.map(({ kind, label, hint }) => {
          const Icon = EXTRA_ICONS[kind];
          return (
            <Button key={kind} variant="outline" size="sm" title={hint} onClick={() => add(kind)} className="justify-start">
              <Plus className="size-3.5" />
              <Icon className="size-3.5 text-stone-500" />
              <span className="truncate">{label}</span>
            </Button>
          );
        })}
      </div>
    </Section>
  );
}
