'use client';
import { useCallback, useRef, useState } from 'react';
import {
  BrickWall,
  Box,
  ChevronDown,
  DoorOpen,
  Download,
  FileText,
  Footprints,
  Layers,
  LocateFixed,
  MousePointer2,
  Redo2,
  Ruler,
  RulerDimensionLine,
  Undo2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { BuildingModel } from '@chalecad/engine';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@chalecad/ui';
import { Logo } from '@/components/Logo';
import { ArtNotice } from '@/components/ArtNotice';
import { Viewport, type ViewportHandle, type ViewPreset } from '@/components/scene/Viewport';
import { ProjectName } from './ProjectName';
import { ResultsPanel } from './ResultsPanel';
import { useResizablePanel } from './useResizablePanel';

const TOOLS = [
  { id: 'select', label: 'Selecionar', shortcut: 'V', icon: MousePointer2 },
  { id: 'wall', label: 'Parede interna', shortcut: 'P', icon: BrickWall },
  { id: 'opening', label: 'Abertura', shortcut: 'A', icon: DoorOpen },
  { id: 'stair', label: 'Escada', shortcut: 'E', icon: Footprints },
  { id: 'mezzanine', label: 'Mezanino', shortcut: 'M', icon: Layers },
  { id: 'dimension', label: 'Cota', shortcut: 'C', icon: RulerDimensionLine },
  { id: 'measure', label: 'Medir', shortcut: 'R', icon: Ruler },
] as const;

const VIEWS: { id: ViewPreset; label: string }[] = [
  { id: '3d', label: '3D' },
  { id: 'top', label: 'Topo' },
  { id: 'front', label: 'Frente' },
  { id: 'side', label: 'Lateral' },
];

const fmt = (n: number, d = 1) => n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

export function EditorShell({ model }: { model: BuildingModel }) {
  const viewport = useRef<ViewportHandle>(null);
  const [tool, setTool] = useState<string>('select');
  const [view, setView] = useState<ViewPreset>('3d');
  const [selected, setSelected] = useState<string | null>(null);
  const { width, dragging, handleProps } = useResizablePanel({ initial: 340, min: 280, max: 560 });

  const pickTool = useCallback((id: string, label: string) => {
    setTool(id);
    if (id !== 'select') toast.info(`${label}: disponível em breve`);
  }, []);

  const pickView = (v: ViewPreset) => {
    setView(v);
    viewport.current?.setView(v);
  };

  const xs = model.footprint.map((p) => p[0]);
  const ys = model.footprint.map((p) => p[1]);
  const fw = Math.max(...xs) - Math.min(...xs);
  const fl = Math.max(...ys) - Math.min(...ys);

  return (
    <TooltipProvider>
      <div className="flex h-dvh w-full flex-col overflow-hidden bg-surface-muted">
        {/* Barra superior */}
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-white px-3">
          <Logo href="/" className="pr-1" />
          <Separator orientation="vertical" className="h-5" />
          <ProjectName initial="Chalé 6,5 × 8,5" />
          <div className="ml-auto flex items-center gap-1">
            <IconButton label="Desfazer" shortcut="⌘Z" disabled>
              <Undo2 />
            </IconButton>
            <IconButton label="Refazer" shortcut="⇧⌘Z" disabled>
              <Redo2 />
            </IconButton>
            <Separator orientation="vertical" className="mx-1 h-5" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download /> Exportar <ChevronDown className="size-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {['PDF com plantas e lista', 'CSV por fornecedor', 'JSON do projeto'].map((l) => (
                  <DropdownMenuItem key={l} onSelect={() => toast.info('Exportação disponível em breve')}>
                    <FileText /> {l}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* Trilho de ferramentas */}
          <nav aria-label="Ferramentas" className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-border bg-white py-2">
            {TOOLS.map(({ id, label, shortcut, icon: Icon }) => (
              <IconButton key={id} label={label} shortcut={shortcut} side="right" active={tool === id} onClick={() => pickTool(id, label)}>
                <Icon />
              </IconButton>
            ))}
          </nav>

          {/* Viewport */}
          <main className="relative min-w-0 flex-1">
            <Viewport
              model={model}
              apiRef={viewport}
              onSelectHost={setSelected}
              highlight={selected ? { hostIds: [selected] } : undefined}
              hoverable
            />

            <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between">
              <div className="pointer-events-auto rounded-lg border border-border bg-white/90 px-3 py-1.5 text-xs text-stone-600 shadow-float backdrop-blur tabular-nums">
                <span className="font-medium text-stone-900">
                  {fmt(fw)} × {fmt(fl)} m
                </span>
                <span className="mx-2 text-stone-300">|</span>
                {fmt(model.builtArea, 1)} m² construídos
                <span className="mx-2 text-stone-300">|</span>
                cumeeira {fmt(model.ridgeHeight, 2)} m
              </div>

              <div role="group" aria-label="Vistas" className="pointer-events-auto flex items-center rounded-lg border border-border bg-white/90 p-0.5 shadow-float backdrop-blur">
                {VIEWS.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => pickView(v.id)}
                    aria-pressed={view === v.id}
                    className="flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-stone-600 transition-colors outline-none hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-accent/50 aria-pressed:bg-accent-soft aria-pressed:text-accent-hover"
                  >
                    {v.id === '3d' ? <Box className="size-3.5" /> : null}
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" className="shadow-float" onClick={() => viewport.current?.center()}>
                    <LocateFixed /> Centralizar
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Enquadrar a edificação</TooltipContent>
              </Tooltip>
            </div>

            <div className="pointer-events-none absolute right-3 bottom-3 hidden rounded-md bg-white/70 px-2 py-1 text-[11px] text-stone-500 backdrop-blur sm:block">
              Arraste para girar · botão direito para mover · roda para zoom
            </div>
          </main>

          {/* Painel direito redimensionável */}
          <aside style={{ width }} className="relative flex shrink-0 flex-col border-l border-border bg-white">
            <div
              {...handleProps}
              className={
                'absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize touch-none after:absolute after:inset-y-0 after:left-1 after:w-px after:transition-colors hover:after:w-0.5 hover:after:bg-accent ' +
                (dragging ? 'after:w-0.5 after:bg-accent' : '')
              }
            />
            <ResultsPanel model={model} selected={selected} />
          </aside>
        </div>

        <footer className="flex h-7 shrink-0 items-center justify-between border-t border-border bg-white px-3">
          <ArtNotice />
          <span className="hidden text-xs text-stone-400 tabular-nums sm:block">Unidades: metros · BRL</span>
        </footer>
      </div>
    </TooltipProvider>
  );
}
