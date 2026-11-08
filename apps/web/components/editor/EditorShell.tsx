'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BrickWall, Box, DoorOpen, Flame, Footprints, Home, Layers, Layers3, LayoutPanelTop, Loader2, LocateFixed, MousePointer2, Ruler, RulerDimensionLine, Sun, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { IconButton, Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@chalecad/ui';
import { ArtNotice } from '@/components/ArtNotice';
import { SunPanel } from '@/components/scene/SunPanel';
import { PathDrawer, Viewport, type ViewportHandle, type ViewPreset } from '@/components/scene/Viewport';
import { useExtraTools } from './properties/ui-state';
import { useAutosave } from '@/hooks/useAutosave';
import { useBootstrap } from '@/hooks/useBootstrap';
import { useEngine } from '@/hooks/useEngine';
import { isTyping, useShortcuts } from '@/hooks/useShortcuts';
import { startNewProject } from '@/lib/project/actions';
import { fmt } from '@/lib/project/format';
import { selectionFromHost } from '@/lib/project/selection';
import { selectionHostId, useEditor } from '@/lib/store/editor';
import type { CameraView, Tool, ViewMode } from '@/lib/store/types';
import { NewProjectDialog } from './NewProjectDialog';
import { PropertiesPanel } from './properties/PropertiesPanel';
// Painel de resultados (F1-W2).
import { ResultsPanel } from '@/components/results/ResultsPanel';
import { TopBar } from './TopBar';
import { useResizablePanel } from './useResizablePanel';
import { ValidationBanner } from './ValidationBanner';

const TOOLS: { id: Tool; label: string; shortcut: string; icon: typeof MousePointer2 }[] = [
  { id: 'select', label: 'Selecionar', shortcut: 'V', icon: MousePointer2 },
  { id: 'wall', label: 'Parede interna', shortcut: 'W', icon: BrickWall },
  { id: 'opening', label: 'Abertura', shortcut: 'O', icon: DoorOpen },
  { id: 'stair', label: 'Escada', shortcut: 'E', icon: Footprints },
  { id: 'mezzanine', label: 'Mezanino', shortcut: 'M', icon: Layers },
  { id: 'room', label: 'Cômodo', shortcut: 'A', icon: LayoutPanelTop },
  { id: 'dimension', label: 'Cota', shortcut: 'C', icon: RulerDimensionLine },
  { id: 'measure', label: 'Medir', shortcut: 'R', icon: Ruler },
];

const VIEWS: { id: ViewPreset; camera: CameraView; label: string }[] = [
  { id: '3d', camera: '3d', label: '3D' },
  { id: 'top', camera: 'plan', label: 'Planta' },
  { id: 'front', camera: 'front', label: 'Frente' },
  { id: 'side', camera: 'left', label: 'Lateral' },
];

const MODES: { id: ViewMode; label: string; hint: string; icon: typeof Home }[] = [
  { id: 'finished', label: 'Acabado', hint: 'Edificação com fechamentos e telhado', icon: Home },
  { id: 'skeleton', label: 'Estrutura', hint: 'Só os perfis de aço (esqueleto)', icon: Wrench },
  { id: 'exploded', label: 'Explodido', hint: 'Camadas separadas: radier, estrutura, fechamento e cobertura', icon: Layers3 },
  { id: 'heatmap', label: 'Mapa de calor', hint: 'Estrutura colorida pela taxa de uso (pré-dimensionamento)', icon: Flame },
  { id: 'presentation', label: 'Apresentação', hint: 'Sol real do terreno, sombras, céu e andar por dentro; salva imagem em alta resolução', icon: Sun },
];

export function EditorShell() {
  const { ready, firstAccess, wantsNew } = useBootstrap();
  const [newOpen, setNewOpen] = useState(false);
  const [welcomed, setWelcomed] = useState(false);
  const showWelcome = ready && firstAccess && !welcomed;

  useEngine();
  useAutosave(!ready || showWelcome);

  // Desenho de caminho (cerca, muro, arrimo) no 3D, pedido pelo painel de extras.
  const [drawingExtra, setDrawingExtra] = useState<string | null>(null);
  useEffect(() => {
    useExtraTools.getState().setDrawPath((id) => setDrawingExtra(id));
    return () => useExtraTools.getState().setDrawPath(null);
  }, []);

  // /editor?new=1 (vindo de /projetos): abre o assistente de novo projeto (o bootstrap lê o parâmetro).
  useEffect(() => {
    if (!ready || !wantsNew) return;
    setWelcomed(true);
    setNewOpen(true);
  }, [ready, wantsNew]);

  const viewport = useRef<ViewportHandle>(null);
  const [view, setView] = useState<ViewPreset>('3d');
  const { width, dragging, handleProps } = useResizablePanel({ initial: 340, min: 280, max: 560 });

  const model = useEditor((s) => s.results?.model);
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const selection = useEditor((s) => s.selection);
  const project = useEditor((s) => s.project);
  const hoverId = useEditor((s) => s.hoverId);
  const highlight = useEditor((s) => s.highlight);
  const select = useEditor((s) => s.select);
  const setHover = useEditor((s) => s.setHover);
  const setCameraView = useEditor((s) => s.setCameraView);

  const viewMode = useEditor((s) => s.viewMode);
  const setViewMode = useEditor((s) => s.setViewMode);
  const levels = useEditor((s) => s.project.levels);
  const activeLevelId = useEditor((s) => s.activeLevelId);
  const setActiveLevel = useEditor((s) => s.setActiveLevel);
  const hasStructure = useEditor((s) => Boolean(s.results?.structure));

  const pickMode = (id: ViewMode) => {
    setViewMode(id);
    // a apresentação não tem planta (ortográfica): volta ao 3D
    if (id === 'presentation' && useEditor.getState().cameraView === 'plan') {
      setView('3d');
      setCameraView('3d');
    }
  };

  const toolPicked = useCallback((t: Tool) => {
    const hints: Partial<Record<Tool, string>> = {
      wall: 'Clique para começar a parede, clique de novo para terminar. Shift trava ortogonal, Alt desliga o snap, Esc encerra.',
      opening: 'Passe o mouse sobre uma parede e clique para inserir. Tipo e tamanho ficam no painel à esquerda.',
      stair: 'Clique no térreo para posicionar. R gira 90°.',
      mezzanine: 'Arraste vértices e arestas do mezanino. Na planta fica mais fácil.',
      measure: 'Clique em dois pontos para medir. Esc limpa.',
      room: 'Clique dentro de um ambiente fechado e escolha o uso. Clique num cômodo para selecioná-lo.',
      dimension: 'As cotas aparecem automaticamente na planta.',
    };
    const h = hints[t];
    if (h) toast.message(TOOLS.find((x) => x.id === t)?.label ?? '', { description: h, id: 'tool-hint', duration: 3500 });
  }, []);
  useShortcuts(toolPicked);
  // "C" já é a Cota: a ferramenta Cômodo usa "A" (de ambiente).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.key.toLowerCase() !== 'a' || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (isTyping(e.target) || document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) return;
      useEditor.getState().setTool('room');
      toolPicked('room');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toolPicked]);

  // Reenquadra a câmera quando o tamanho da edificação muda bastante (troca de tipologia, novo projeto, extras).
  const lastBox = useRef<number[] | null>(null);
  useEffect(() => {
    if (!model) return;
    const { min, max } = model.bbox;
    const box = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    const prev = lastBox.current;
    lastBox.current = box;
    if (!prev) return;
    const changed = box.some((v, i) => Math.abs(v - prev[i]!) > Math.max(1.5, 0.2 * prev[i]!));
    if (!changed) return;
    const t = setTimeout(() => viewport.current?.center(), 250);
    return () => clearTimeout(t);
  }, [model]);

  const pickView = (v: (typeof VIEWS)[number]) => {
    setView(v.id);
    setCameraView(v.camera);
    viewport.current?.setView(v.id);
  };

  const handleCreate = async (p: Parameters<typeof startNewProject>[0]) => {
    setNewOpen(false);
    setWelcomed(true);
    await startNewProject(p);
    toast.success(`“${p.meta.name}” criado.`);
    setTimeout(() => viewport.current?.center(), 150);
  };

  const closeNew = (open: boolean) => {
    if (open) return;
    setNewOpen(false);
    setWelcomed(true);
  };

  if (!ready) {
    return (
      <div className="grid h-dvh place-items-center bg-surface-muted text-sm text-stone-500">
        <span className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" /> Abrindo seu projeto
        </span>
      </div>
    );
  }

  const xs = model?.footprint.map((p) => p[0]) ?? [0];
  const ys = model?.footprint.map((p) => p[1]) ?? [0];
  const fw = Math.max(...xs) - Math.min(...xs);
  const fl = Math.max(...ys) - Math.min(...ys);
  const selectedHost = selectionHostId(selection, project);

  return (
    <TooltipProvider>
      <div className="flex h-dvh w-full flex-col overflow-hidden bg-surface-muted">
        <TopBar onNew={() => setNewOpen(true)} />
        <ValidationBanner />

        <div className="flex min-h-0 flex-1">
          {/* Trilho de ferramentas */}
          <nav aria-label="Ferramentas" className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-border bg-white py-2">
            {TOOLS.map(({ id, label, shortcut, icon: Icon }) => (
              <IconButton
                key={id}
                label={label}
                shortcut={shortcut}
                side="right"
                active={tool === id}
                onClick={() => {
                  setTool(id);
                  toolPicked(id);
                }}
              >
                <Icon />
              </IconButton>
            ))}
          </nav>

          {/* Propriedades */}
          <aside aria-label="Propriedades" className="flex w-[19rem] shrink-0 flex-col border-r border-border bg-white">
            <PropertiesPanel />
          </aside>

          {/* Viewport */}
          <main className="relative min-w-0 flex-1">
            {model ? (
              <Viewport
                model={model}
                apiRef={viewport}
                selectedId={selectedHost}
                hoverId={hoverId}
                onHoverHost={setHover}
                onSelectHost={(id) => select(id ? selectionFromHost(id, model, project) : null)}
                highlight={{ hostIds: highlight?.hostIds ?? [] }}
                hoverable
              />
            ) : (
              <div className="scene-sky absolute inset-0 grid place-items-center text-sm text-stone-500">
                <span className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" /> Calculando o modelo 3D
                </span>
              </div>
            )}

            {model && viewMode === 'presentation' ? <SunPanel /> : null}

            <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between">
              {model ? (
                <div className="pointer-events-auto rounded-lg border border-border bg-white/90 px-3 py-1.5 text-xs text-stone-600 shadow-float backdrop-blur tabular-nums">
                  <span className="font-medium text-stone-900">
                    {fmt(fw, 1)} × {fmt(fl, 1)} m
                  </span>
                  <span className="mx-2 text-stone-300">|</span>
                  {fmt(model.builtArea, 1)} m² construídos
                  <span className="mx-2 text-stone-300">|</span>
                  cumeeira {fmt(model.ridgeHeight, 2)} m
                </div>
              ) : (
                <span />
              )}

              <div role="group" aria-label="Vistas" className="pointer-events-auto flex items-center rounded-lg border border-border bg-white/90 p-0.5 shadow-float backdrop-blur">
                {VIEWS.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => pickView(v)}
                    aria-pressed={view === v.id}
                    className="flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-stone-600 transition-colors outline-none hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-accent/50 aria-pressed:bg-accent-soft aria-pressed:text-accent-hover"
                  >
                    {v.id === '3d' ? <Box className="size-3.5" /> : null}
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-1.5">
              <div role="group" aria-label="Modo de visualização" className="flex items-center rounded-lg border border-border bg-white/90 p-0.5 shadow-float backdrop-blur">
                {MODES.map(({ id, label, hint, icon: Icon }) => {
                  const disabled = id === 'heatmap' && !hasStructure;
                  return (
                    <Tooltip key={id}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => pickMode(id)}
                          aria-pressed={viewMode === id}
                          className="flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-stone-600 transition-colors outline-none hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-40 aria-pressed:bg-accent-soft aria-pressed:text-accent-hover"
                        >
                          <Icon className="size-3.5" />
                          <span className="hidden lg:inline">{label}</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">{hint}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
              {levels.length > 1 ? (
                <div role="group" aria-label="Nível ativo" className="flex items-center rounded-lg border border-border bg-white/90 p-0.5 shadow-float backdrop-blur">
                  {[...levels].sort((a, b) => a.elevation - b.elevation).map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setActiveLevel(l.id)}
                      aria-pressed={activeLevelId === l.id}
                      className="flex h-7 items-center rounded-md px-2.5 text-xs font-medium text-stone-600 transition-colors outline-none hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-accent/50 aria-pressed:bg-accent-soft aria-pressed:text-accent-hover"
                    >
                      {l.name ?? (l.elevation === 0 ? 'Térreo' : `Nível ${fmt(l.elevation, 1)} m`)}
                    </button>
                  ))}
                </div>
              ) : null}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" className="shadow-float" onClick={() => viewport.current?.center()}>
                    <LocateFixed /> Centralizar
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Enquadrar a edificação</TooltipContent>
              </Tooltip>
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
            <ResultsPanel />
          </aside>
        </div>

        <footer className="flex h-7 shrink-0 items-center justify-between border-t border-border bg-white px-3">
          <ArtNotice />
          <span className="hidden text-xs text-stone-400 tabular-nums sm:block">Unidades: metros · BRL</span>
        </footer>
      </div>

      <PathDrawer
        active={drawingExtra !== null}
        onComplete={(path, closed) => {
          const id = drawingExtra;
          setDrawingExtra(null);
          if (!id || path.length < 2) return;
          useEditor.getState().update('Desenhar caminho', (d) => {
            const e = d.extras.find((x) => x.id === id);
            if (!e || !('path' in e)) return;
            e.path = path;
            if ('closed' in e) e.closed = closed;
          });
          toast.success('Caminho atualizado.');
        }}
        onCancel={() => setDrawingExtra(null)}
      />

      <NewProjectDialog open={newOpen || showWelcome} onOpenChange={closeNew} onCreate={handleCreate} firstAccess={showWelcome} />
    </TooltipProvider>
  );
}
