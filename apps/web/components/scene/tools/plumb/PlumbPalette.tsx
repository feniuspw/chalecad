'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Container, Droplet, Droplets, MousePointer2, Wand2, Wind } from 'lucide-react';
import { Button, cn } from '@chalecad/ui';
import { getCatalog } from '@chalecad/catalog';
import type { PipeSystem } from '@chalecad/engine';
import { useEditor } from '@/lib/store/editor';
import { generateAutomatically, routeAutomatically } from '@/lib/plumb/actions';
import { FALLBACK_COLORS, SYSTEM_LABEL, SYSTEMS } from '@/lib/plumb/geometry';
import { plumbingReportOf } from '@/lib/plumb/live';
import { usePlumb, type PlumbTool } from '@/lib/plumb/store';
import { installPlumbSync } from '@/lib/plumb/sync';

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

function ToolButton({ tool, label, icon, hint }: { tool: PlumbTool; label: string; icon: ReactNode; hint?: string }) {
  const active = usePlumb((s) => s.tool === tool);
  const setTool = usePlumb((s) => s.setTool);
  return (
    <button
      type="button"
      title={hint ? `${label}: ${hint}` : label}
      aria-label={label}
      aria-pressed={active}
      onClick={() => setTool(active ? null : tool)}
      className="grid size-8 place-items-center rounded-md text-stone-700 outline-none hover:bg-stone-100 focus-visible:ring-2 focus-visible:ring-accent/50 aria-pressed:bg-accent-soft aria-pressed:text-accent-hover aria-pressed:ring-1 aria-pressed:ring-accent/40"
    >
      {icon}
    </button>
  );
}

const TOOL_NAMES: Record<PlumbTool, string> = {
  edit: 'Selecionar e mover',
  point: 'Ponto de água',
  tank: 'Caixa d’água',
  cold: 'Tubo de água fria',
  hot: 'Tubo de água quente',
  sewer: 'Tubo de esgoto',
  vent: 'Ventilação',
};

const CHIP: Record<PipeSystem, string> = { cold: 'Fria', hot: 'Quente', sewer: 'Esgoto', vent: 'Ventilação' };

const Code = ({ color, children }: { color: string; children: ReactNode }) => (
  <span className="text-[11px] leading-none font-extrabold tracking-tight" style={{ color }}>
    {children}
  </span>
);

/**
 * Botão "Hidráulica" (atalho H) e paleta: ponto de água, caixa, tubos por sistema, filtro de sistemas e as ações
 * "Rotear automaticamente" e "Gerar automaticamente". Fica sobre o viewport.
 */
export function PlumbPalette() {
  const layer = usePlumb((s) => s.layer);
  const setLayer = usePlumb((s) => s.setLayer);
  const systems = usePlumb((s) => s.systems);
  const toggleSystem = usePlumb((s) => s.toggleSystem);
  const tool = usePlumb((s) => s.tool);
  const fixture = usePlumb((s) => s.fixture);
  const setFixture = usePlumb((s) => s.setFixture);
  const enabled = useEditor((s) => s.project.installations.enabled);
  const manual = useEditor((s) => s.project.installations.plumbing.manual);
  const hasReport = useEditor((s) => !!plumbingReportOf(s.project, s.results));
  const cameraView = useEditor((s) => s.cameraView);
  const [confirm, setConfirm] = useState(false);
  const colors = getCatalog().constants.plumbing.colors as Record<PipeSystem, string>;
  const fixtures = Object.entries(getCatalog().constants.plumbing.water.fixtures);

  useEffect(() => installPlumbSync(), []);
  useEffect(() => {
    if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') (window as unknown as { __plumb?: typeof usePlumb }).__plumb = usePlumb;
  }, []);

  const onOpenPlan = () => useEditor.getState().setCameraView('plan');
  const toggle = () => {
    const next = !usePlumb.getState().layer;
    if (next && !useEditor.getState().project.installations.enabled) useEditor.getState().update('Ligar instalações', (d) => void (d.installations.enabled = true));
    setLayer(next);
    if (next && useEditor.getState().cameraView !== 'plan') onOpenPlan();
  };
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;

  // H liga/desliga a camada (fora de campos de texto e de diálogos)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'h' || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || isTyping(e.target)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) return;
      e.preventDefault();
      toggleRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const sysTool = tool === 'cold' || tool === 'hot' || tool === 'sewer' || tool === 'vent' ? (tool as PipeSystem) : null;

  return (
    <div className="pointer-events-none absolute top-14 left-3 z-30 flex w-[17.5rem] flex-col gap-1.5" data-testid="plumb-palette">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={layer}
        title="Camada Hidráulica: tubos, pontos e pressão na planta (H)"
        className="pointer-events-auto flex h-8 items-center gap-2 self-start rounded-lg border border-border bg-white/90 px-2.5 text-xs font-medium text-stone-700 shadow-float backdrop-blur outline-none hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-accent/50 aria-pressed:border-accent/50 aria-pressed:bg-accent-soft aria-pressed:text-accent-hover"
      >
        <Droplets className="size-3.5" /> Hidráulica <kbd className="rounded border border-border bg-white/70 px-1 text-[10px] text-stone-500">H</kbd>
      </button>

      {layer ? (
        <div className="pointer-events-auto rounded-lg border border-border bg-white/95 p-2 shadow-float backdrop-blur">
          {!enabled ? <p className="mb-1 text-[11px] text-stone-500">Ligando as instalações…</p> : null}
          {enabled && !hasReport ? <p className="mb-1.5 rounded bg-amber-50 px-1.5 py-1 text-[11px] leading-snug text-amber-800">Sem traçado: marque o banheiro (ferramenta Cômodo) ou ponha a torre da caixa d’água.</p> : null}
          {cameraView !== 'plan' ? (
            <button type="button" onClick={onOpenPlan} className="mb-1.5 w-full rounded bg-stone-100 px-1.5 py-1 text-left text-[11px] text-stone-700 hover:bg-stone-200">
              Para desenhar, abrir a Planta
            </button>
          ) : null}

          <div className="flex flex-wrap gap-0.5" role="group" aria-label="Ferramentas de hidráulica">
            <ToolButton tool="edit" label="Selecionar e mover" icon={<MousePointer2 className="size-4" />} hint="clique seleciona, arraste move ponto ou caixa" />
            <ToolButton tool="point" label="Ponto de água" icon={<Droplet className="size-4" style={{ color: colors.cold }} />} hint="posiciona um aparelho do catálogo" />
            <ToolButton tool="tank" label="Caixa d’água" icon={<Container className="size-4" style={{ color: colors.cold }} />} hint="move a caixa (a cota do fundo fica nas propriedades)" />
            <ToolButton tool="cold" label="Tubo de água fria" icon={<Code color={colors.cold}>AF</Code>} />
            <ToolButton tool="hot" label="Tubo de água quente" icon={<Code color={colors.hot}>AQ</Code>} />
            <ToolButton tool="sewer" label="Tubo de esgoto" icon={<Code color={colors.sewer}>ES</Code>} />
            <ToolButton tool="vent" label="Ventilação" icon={<Wind className="size-4" style={{ color: colors.vent }} />} hint="um clique num tubo de esgoto sobe a ventilação" />
          </div>
          <p className="mt-1 min-h-4 text-[11px] font-medium text-stone-600" aria-live="polite">
            {tool ? TOOL_NAMES[tool] : 'Escolha uma ferramenta'}
          </p>

          {tool === 'point' ? (
            <label className="mt-1.5 block text-[11px] font-medium text-stone-600">
              Aparelho
              <select value={fixture} onChange={(e) => setFixture(e.target.value)} aria-label="Aparelho" className="mt-0.5 h-7 w-full rounded-md border border-border bg-white px-1.5 text-xs text-stone-900">
                {fixtures.map(([key, f]) => (
                  <option key={key} value={key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="mt-2 border-t border-border pt-1.5">
            <p className="mb-1 text-[10px] font-semibold tracking-wide text-stone-500 uppercase">Mostrar</p>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Sistemas">
              {SYSTEMS.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={systems[s]}
                  aria-label={`Mostrar ${SYSTEM_LABEL[s].toLowerCase()}`}
                  onClick={() => toggleSystem(s)}
                  className={cn('flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent/50', systems[s] ? 'border-stone-300 bg-white text-stone-800' : 'border-transparent bg-stone-100 text-stone-400 line-through')}
                >
                  <span className="size-2 rounded-full" style={{ background: colors[s] ?? FALLBACK_COLORS[s] }} />
                  {CHIP[s]}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-2 border-t border-border pt-1.5">
            <p className="mb-1 text-[11px] text-stone-600" data-testid="plumb-mode">
              {manual ? 'Traçado manual (seu)' : 'Traçado automático (do motor)'}
            </p>
            <div className="flex flex-col gap-1">
              <Button size="sm" variant="outline" className="h-7 justify-start px-2 text-xs" disabled={!hasReport} onClick={() => routeAutomatically(sysTool ? [sysTool] : SYSTEMS)}>
                <Wand2 className="size-3.5" /> Rotear automaticamente{sysTool ? ` (${SYSTEM_LABEL[sysTool].toLowerCase()})` : ''}
              </Button>
              {confirm ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-1.5 text-[11px] text-amber-900" role="alert">
                  Descartar o traçado manual e deixar o motor gerar de novo?
                  <div className="mt-1 flex gap-1">
                    <Button
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => {
                        setConfirm(false);
                        generateAutomatically();
                      }}
                    >
                      Descartar
                    </Button>
                    <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => setConfirm(false)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" variant="outline" className="h-7 justify-start px-2 text-xs" disabled={!manual} onClick={() => setConfirm(true)}>
                  Gerar automaticamente
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
