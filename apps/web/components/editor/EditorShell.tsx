'use client';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { BrickWall, Box, DoorOpen, Flame, Footprints, Home, Layers, Layers3, LayoutPanelTop, Loader2, LocateFixed, MousePointer2, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, RectangleHorizontal, Ruler, RulerDimensionLine, Sofa, Sun, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { IconButton, Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@chalecad/ui';
import { ArtNotice } from '@/components/ArtNotice';
import { requestPresentation, setBeforeOpenPresentation } from '@/components/scene/presentationFlow';
import { SunPanel } from '@/components/scene/SunPanel';
import { PathDrawer, Viewport, type ViewportHandle, type ViewPreset } from '@/components/scene/Viewport';
import { useExtraTools } from './properties/ui-state';
import { useAutosave } from '@/hooks/useAutosave';
import { useBootstrap } from '@/hooks/useBootstrap';
import { useEngine } from '@/hooks/useEngine';
import { isTyping, TOOL_KEYS, useShortcuts } from '@/hooks/useShortcuts';
import { startNewProject } from '@/lib/project/actions';
import { fmt } from '@/lib/project/format';
import { findPreset } from '@/lib/project/presets';
import { HelpMenu } from '@/components/onboarding/HelpMenu';
import { ShortcutsDialog } from '@/components/onboarding/ShortcutsDialog';
import { TOOL_KEY_MAP, toolShortcut } from '@/components/onboarding/shortcuts';
import { shouldAutoStart } from '@/components/onboarding/steps';
import { Tour } from '@/components/onboarding/Tour';
import { selectionFromHost } from '@/lib/project/selection';
import { selectionHostId, useEditor } from '@/lib/store/editor';
import type { CameraView, Tool, ViewMode } from '@/lib/store/types';
import { FurnitureLibrary } from './furniture/FurnitureLibrary';
import { PlumbPalette } from '@/components/scene/tools/plumb/PlumbPalette';
import { NewProjectDialog } from './NewProjectDialog';
import { PropertiesPanel } from './properties/PropertiesPanel';
// Painel de resultados (F1-W2).
import { ResultsPanel } from '@/components/results/ResultsPanel';
import { TopBar } from './TopBar';
import { useResizablePanel } from './useResizablePanel';
import { usePanelVisibility } from './usePanelVisibility';
import { ValidationBanner } from './ValidationBanner';

const TOOLS: { id: Tool; label: string; shortcut: string; icon: typeof MousePointer2; group: 'edit' | 'draw' | 'other' }[] = (
  [
    { id: 'select', label: 'Selecionar', icon: MousePointer2, group: 'edit' },
    { id: 'wall', label: 'Parede', icon: BrickWall, group: 'draw' },
    { id: 'rect', label: 'Retângulo (cômodo)', icon: RectangleHorizontal, group: 'draw' },
    { id: 'opening', label: 'Porta e janela', icon: DoorOpen, group: 'draw' },
    { id: 'room', label: 'Cômodo', icon: LayoutPanelTop, group: 'draw' },
    { id: 'stair', label: 'Escada', icon: Footprints, group: 'draw' },
    { id: 'mezzanine', label: 'Mezanino', icon: Layers, group: 'draw' },
    { id: 'measure', label: 'Medir', icon: Ruler, group: 'draw' },
    { id: 'furniture', label: 'Móveis', icon: Sofa, group: 'other' },
    { id: 'dimension', label: 'Cota', icon: RulerDimensionLine, group: 'other' },
  ] as const
).map((t) => ({ ...t, shortcut: toolShortcut(t.id) }));

/** Ferramentas que pedem a vista Planta (desenho preciso); na 3D a vista muda sozinha, com uma dica. */
const PLAN_TOOLS: readonly Tool[] = ['wall', 'rect', 'room'];

// Teclas de ferramenta que o EditorShell registra (as demais ficam em `useShortcuts`); a tabela é `SHORTCUTS`.
const SHELL_TOOL_KEYS: Record<string, Tool> = Object.fromEntries(Object.entries(TOOL_KEY_MAP).filter(([k]) => !(k in TOOL_KEYS)));

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
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
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
  // /editor?new=1&template=<id>: cria direto a partir do modelo pronto (cartões da lista vazia de projetos).
  const templateHandled = useRef(false);
  useEffect(() => {
    if (!ready || !wantsNew || templateHandled.current) return;
    templateHandled.current = true;
    setWelcomed(true);
    const preset = findPreset(new URLSearchParams(window.location.search).get('template') ?? '');
    if (preset) void handleCreateRef.current(preset.build());
    else setNewOpen(true);
  }, [ready, wantsNew]);

  const viewport = useRef<ViewportHandle>(null);
  const [view, setView] = useState<ViewPreset>('3d');
  const { width, dragging, handleProps } = useResizablePanel({ initial: 340, min: 280, max: 560 });
  const { panels, toggle: togglePanel } = usePanelVisibility();

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
  const cameraView = useEditor((s) => s.cameraView);
  // a vista pode mudar por fora do seletor (ex.: "Mostrar na planta" dos resultados): mantém o seletor em sincronia
  useEffect(() => {
    const preset = ({ '3d': '3d', plan: 'top', front: 'front', left: 'side' } as Partial<Record<CameraView, ViewPreset>>)[cameraView];
    if (preset) setView(preset);
  }, [cameraView]);

  const viewMode = useEditor((s) => s.viewMode);
  const setViewMode = useEditor((s) => s.setViewMode);
  const levels = useEditor((s) => s.project.levels);
  const activeLevelId = useEditor((s) => s.activeLevelId);
  const setActiveLevel = useEditor((s) => s.setActiveLevel);
  const hasStructure = useEditor((s) => Boolean(s.results?.structure));

  // a apresentação não tem planta (ortográfica): volta ao 3D (chamado pelo fluxo de abertura, no botão ou no "Abrir")
  useEffect(() => {
    setBeforeOpenPresentation(() => {
      if (useEditor.getState().cameraView === 'plan') {
        setView('3d');
        setCameraView('3d');
      }
    });
    return () => setBeforeOpenPresentation(null);
  }, [setCameraView]);

  const pickMode = (id: ViewMode) => {
    // a apresentação prepara em segundo plano (progresso + Abrir) em vez de travar a tela
    if (id === 'presentation') requestPresentation();
    else setViewMode(id);
  };

  const toolPicked = useCallback((t: Tool) => {
    const hints: Partial<Record<Tool, string>> = {
      wall: 'Clique para começar e digite a medida (3,5 ou 3,5;90) + Enter. Clique no ponto inicial fecha. Shift trava 15°, Alt desliga o snap, Esc encerra.',
      rect: 'Clique no canto, depois no canto oposto, ou digite 3x4 + Enter. Depois escolha o uso do cômodo.',
      opening: 'Passe o mouse sobre uma parede e clique para inserir. Tipo e tamanho ficam no painel à esquerda.',
      stair: 'Clique no térreo para posicionar. R gira 90°.',
      mezzanine: 'Arraste vértices e arestas do mezanino. Na planta fica mais fácil.',
      measure: 'Clique em dois pontos para medir. Esc limpa.',
      room: 'Clique dentro de um ambiente fechado e escolha o uso. Clique num cômodo para selecioná-lo.',
      furniture: 'Escolha um móvel na biblioteca e clique no piso (ou arraste). R gira 90°, Alt solta sem encaixe, Esc encerra.',
      dimension: 'As cotas aparecem automaticamente na planta.',
    };
    const h = hints[t];
    if (PLAN_TOOLS.includes(t) && useEditor.getState().cameraView === '3d') {
      setView('top');
      setCameraView('plan');
      viewport.current?.setView('top');
      toast.message('Vista Planta ativada', { description: 'Desenhar de cima é mais preciso. Volte ao 3D pelo seletor de vistas quando quiser.', id: 'tool-hint', duration: 4000 });
      return;
    }
    if (h) toast.message(TOOLS.find((x) => x.id === t)?.label ?? '', { description: h, id: 'tool-hint', duration: 3500 });
  }, [setCameraView]);
  useShortcuts(toolPicked);
  // "C" já é a Cota e "M" o Mezanino: Cômodo usa "A" (de ambiente) e Móveis usa "F" (ver SHORTCUTS).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tool = SHELL_TOOL_KEYS[e.key.toLowerCase()];
      if (!tool || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (isTyping(e.target) || document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) return;
      useEditor.getState().setTool(tool);
      toolPicked(tool);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toolPicked]);

  // "[" recolhe Propriedades, "]" recolhe Resultados, "\" esconde os dois (mais área para o 3D).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const which = e.key === '[' ? 'left' : e.key === ']' ? 'right' : e.key === '\\' ? 'both' : null;
      if (!which || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) return;
      e.preventDefault();
      togglePanel(which);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePanel]);

  // "?" abre a lista de atalhos (fora de campos de texto e com nenhum diálogo aberto).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '?' || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) return;
      e.preventDefault();
      setShortcutsOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Tour guiado na primeira abertura do editor (depois do assistente de novo projeto e do primeiro cálculo).
  const calculated = !!model;
  useEffect(() => {
    if (!ready || showWelcome || newOpen || !calculated || !shouldAutoStart()) return;
    const t = setTimeout(() => setTourOpen(true), 900);
    return () => clearTimeout(t);
  }, [ready, showWelcome, newOpen, calculated]);

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

  const handleCreateRef = useRef(handleCreate);
  handleCreateRef.current = handleCreate;

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
          <nav aria-label="Ferramentas" data-tour="toolbar" className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-border bg-white py-2">
            {TOOLS.map(({ id, label, shortcut, icon: Icon, group }, i) => (
              <Fragment key={id}>
                {i > 0 && TOOLS[i - 1]!.group !== group ? <hr aria-hidden className="my-0.5 w-6 border-border" /> : null}
                {group === 'draw' && TOOLS[i - 1]!.group !== 'draw' ? (
                  <span aria-hidden className="text-[9px] font-semibold tracking-wide text-stone-400 uppercase">
                    Desenho
                  </span>
                ) : null}
                <IconButton
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
              </Fragment>
            ))}
          </nav>

          {/* Propriedades */}
          <aside aria-label="Propriedades" data-tour="properties" hidden={!panels.left} className="flex w-[19rem] shrink-0 flex-col border-r border-border bg-white">
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
            {model && tool === 'furniture' && viewMode !== 'presentation' ? <FurnitureLibrary /> : null}
            {model && viewMode !== 'presentation' ? <PlumbPalette /> : null}

            <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
              <div className="flex items-start gap-1.5">
                <PanelToggle side="left" open={panels.left} onClick={() => togglePanel('left')} />
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
              ) : null}
              </div>

              <div className="flex items-start gap-1.5">
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
                <PanelToggle side="right" open={panels.right} onClick={() => togglePanel('right')} />
              </div>
            </div>

            <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-1.5">
              <div role="group" aria-label="Modo de visualização" data-tour="modes" className="flex items-center rounded-lg border border-border bg-white/90 p-0.5 shadow-float backdrop-blur">
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
          <aside style={{ width }} data-tour="results" hidden={!panels.right} className="relative flex shrink-0 flex-col border-l border-border bg-white">
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
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-stone-400 tabular-nums sm:block">Unidades: metros · BRL</span>
            <HelpMenu onShortcuts={() => setShortcutsOpen(true)} onTour={() => setTourOpen(true)} />
          </div>
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

      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <Tour open={tourOpen} onClose={() => setTourOpen(false)} />
      <NewProjectDialog open={newOpen || showWelcome} onOpenChange={closeNew} onCreate={handleCreate} firstAccess={showWelcome} />
    </TooltipProvider>
  );
}

/** Botão de recolher/mostrar um painel lateral (atalhos `[` e `]`; `\\` alterna os dois). */
function PanelToggle({ side, open, onClick }: { side: 'left' | 'right'; open: boolean; onClick: () => void }) {
  const label = side === 'left' ? (open ? 'Recolher propriedades' : 'Mostrar propriedades') : open ? 'Recolher resultados' : 'Mostrar resultados';
  const Icon = side === 'left' ? (open ? PanelLeftClose : PanelLeftOpen) : open ? PanelRightClose : PanelRightOpen;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          aria-pressed={!open}
          className="pointer-events-auto grid size-8 place-items-center rounded-lg border border-border bg-white/90 text-stone-600 shadow-float backdrop-blur transition-colors outline-none hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <Icon className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {label} <kbd className="ml-1 opacity-70">{side === 'left' ? '[' : ']'}</kbd>
      </TooltipContent>
    </Tooltip>
  );
}
