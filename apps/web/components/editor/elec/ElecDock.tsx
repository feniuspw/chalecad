'use client';
import { useEffect, useState } from 'react';
import { Cable, Route, RotateCcw, X, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { getCatalog } from '@chalecad/catalog';
import { Kbd, cn } from '@chalecad/ui';
import { isTyping } from '@/hooks/useShortcuts';
import { autoRoute, regenerate } from '@/lib/elec/actions';
import { ELEC_TOOLS, type ElecToolId, type SymbolKind } from '@/lib/elec/kinds';
import { useElecUi } from '@/lib/elec/ui';
import { useEditor } from '@/lib/store/editor';
import { SymbolIcon } from './SymbolIcon';

const k = getCatalog().constants.electrical;

const TOOL_ICON: Record<Exclude<ElecToolId, 'none'>, SymbolKind | 'conduit'> = {
  socket: 'socket_low',
  socket_mid: 'socket_mid',
  socket_high: 'socket_high',
  socket_tue: 'tue',
  switch: 'switch_one',
  light: 'light_ceiling',
  panel: 'panel',
  conduit: 'conduit',
};

const select = 'h-8 w-full rounded-md border border-border bg-white px-2 text-xs text-stone-900 shadow-sm outline-none hover:border-stone-300 focus-visible:ring-2 focus-visible:ring-accent/50';

function Options() {
  const tool = useElecUi((s) => s.tool);
  const appliance = useElecUi((s) => s.appliance);
  const switchType = useElecUi((s) => s.switchType);
  const luminaire = useElecUi((s) => s.luminaire);
  const run = useElecUi((s) => s.conduitRun);
  const set = useElecUi((s) => s.setOptions);
  if (tool === 'socket_tue')
    return (
      <label className="block space-y-1">
        <span className="text-[11px] font-medium text-stone-600">Aparelho</span>
        <select aria-label="Aparelho" className={select} value={appliance} onChange={(e) => set({ appliance: e.target.value })} onKeyDown={(e) => e.stopPropagation()}>
          {Object.entries(k.appliances).map(([id, a]) => (
            <option key={id} value={id}>
              {a.label} · {a.w} W
            </option>
          ))}
        </select>
      </label>
    );
  if (tool === 'switch')
    return (
      <div role="group" aria-label="Tipo de interruptor" className="grid grid-cols-2 gap-0.5 rounded-lg bg-stone-100 p-0.5">
        {(['one_way', 'two_way'] as const).map((t) => (
          <button key={t} type="button" aria-pressed={switchType === t} onClick={() => set({ switchType: t })} className="h-7 rounded-md text-xs font-medium text-stone-600 outline-none hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-accent/50 aria-pressed:bg-white aria-pressed:text-stone-900 aria-pressed:shadow-sm">
            {t === 'one_way' ? 'Simples' : 'Paralelo'}
          </button>
        ))}
      </div>
    );
  if (tool === 'light')
    return (
      <label className="block space-y-1">
        <span className="text-[11px] font-medium text-stone-600">Luminária</span>
        <select aria-label="Luminária" className={select} value={luminaire} onChange={(e) => set({ luminaire: e.target.value })} onKeyDown={(e) => e.stopPropagation()}>
          {k.luminaires.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label} · {l.lumens} lm
            </option>
          ))}
        </select>
        <span className="block text-[11px] text-stone-500">
          <Kbd>Shift</Kbd> + clique no cômodo: grade automática até o lux alvo.
        </span>
      </label>
    );
  if (tool === 'conduit')
    return (
      <div role="group" aria-label="Percurso do eletroduto" className="grid grid-cols-2 gap-0.5 rounded-lg bg-stone-100 p-0.5">
        {(['ceiling', 'floor'] as const).map((r) => (
          <button key={r} type="button" aria-pressed={run === r} onClick={() => set({ conduitRun: r })} className="h-7 rounded-md text-xs font-medium text-stone-600 outline-none hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-accent/50 aria-pressed:bg-white aria-pressed:text-stone-900 aria-pressed:shadow-sm">
            {r === 'ceiling' ? 'Forro (contínuo)' : 'Piso (tracejado)'}
          </button>
        ))}
      </div>
    );
  return null;
}

/** Liga a camada Elétrica (e as instalações, se estavam desligadas). */
export function toggleElecLayer(on?: boolean) {
  const ui = useElecUi.getState();
  const s = useEditor.getState();
  const next = on ?? !ui.layerOn;
  if (next) {
    if (s.cameraView !== 'plan') {
      toast.info('A camada Elétrica é desenhada na vista Planta.', { id: 'elec-plan-only' });
      return;
    }
    if (!s.project.installations.enabled) {
      s.update('Ligar instalações', (d) => void (d.installations.enabled = true));
      toast.message('Instalações ligadas para desenhar a parte elétrica.', { id: 'elec-enable' });
    }
    s.select(null);
    s.setTool('select');
  }
  ui.setLayer(next);
}

/**
 * Camada "Elétrica" da planta: botão para ligar e paleta (Tomada, Tomada alta, Uso específico, Interruptor, Luz, Quadro,
 * Eletroduto) com as opções da ferramenta e as ações do traçado (rotear, gerar automaticamente). Atalho Shift+E.
 */
export function ElecDock() {
  const layerOn = useElecUi((s) => s.layerOn);
  const tool = useElecUi((s) => s.tool);
  const setTool = useElecUi((s) => s.setTool);
  const view = useEditor((s) => s.cameraView);
  const mode = useEditor((s) => s.viewMode);
  const editorTool = useEditor((s) => s.tool);
  const manual = useEditor((s) => s.project.installations.electrical.manual);
  const enabled = useEditor((s) => s.project.installations.enabled);
  const [confirm, setConfirm] = useState(false);

  // outra ferramenta do trilho assume o mouse: a paleta solta a dela
  useEffect(() => {
    if (editorTool !== 'select' && useElecUi.getState().tool !== 'none') useElecUi.getState().setTool('none');
  }, [editorTool]);
  useEffect(() => {
    if (!layerOn) setConfirm(false);
  }, [layerOn]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || !e.shiftKey || e.key.toLowerCase() !== 'e') return;
      if (isTyping(e.target) || document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) return;
      e.preventDefault();
      toggleElecLayer();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (view !== 'plan' || mode === 'presentation') return null;

  if (!layerOn)
    return (
      <div className="pointer-events-auto absolute top-14 right-3 z-20">
        <button
          type="button"
          aria-pressed={false}
          onClick={() => toggleElecLayer(true)}
          data-testid="elec-layer-toggle"
          className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-white/90 px-2.5 text-xs font-medium text-stone-700 shadow-float outline-none backdrop-blur hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <Zap className="size-3.5 text-amber-500" /> Elétrica <Kbd className="ml-0.5">⇧E</Kbd>
        </button>
      </div>
    );

  return (
    <section aria-label="Elétrica" data-testid="elec-dock" className="pointer-events-auto absolute top-14 right-3 z-20 w-48 overflow-hidden rounded-xl border border-border bg-white/95 shadow-float backdrop-blur">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Zap className="size-4 text-amber-500" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-stone-900">Elétrica</h2>
          <p className="text-[11px] text-stone-500" data-testid="elec-mode">
            {manual ? 'Desenhado à mão' : 'Gerado automaticamente'}
          </p>
        </div>
        <button type="button" aria-label="Desligar a camada Elétrica" onClick={() => toggleElecLayer(false)} className="rounded p-1 text-stone-500 outline-none hover:bg-stone-100 hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-accent/50">
          <X className="size-4" />
        </button>
      </header>

      {!enabled ? <p className="px-3 py-2 text-xs text-amber-800">Ligue as instalações para ver a parte elétrica.</p> : null}

      <div role="group" aria-label="Ferramentas elétricas" className="grid grid-cols-1 gap-1 p-2">
        {ELEC_TOOLS.map((t) => {
          const icon = TOOL_ICON[t.id];
          return (
            <button
              key={t.id}
              type="button"
              title={t.hint}
              aria-pressed={tool === t.id}
              data-testid={`elec-tool-${t.id}`}
              onClick={() => setTool(tool === t.id ? 'none' : t.id)}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-md border border-border px-2 text-left text-xs font-medium text-stone-700 outline-none hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-accent/50',
                'aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent-hover',
              )}
            >
              {icon === 'conduit' ? <Cable className="size-[22px] shrink-0 p-0.5" /> : <SymbolIcon kind={icon} />}
              <span className="truncate">{t.label}</span>
            </button>
          );
        })}
      </div>

      <div className="space-y-2 px-3 pb-2">
        <Options />
        {tool === 'none' ? <p className="text-[11px] leading-snug text-stone-500">Clique num símbolo para editar e arraste para mover. Interruptor selecionado: clique nas luzes para comandá-las.</p> : null}
      </div>

      <div className="space-y-1.5 border-t border-border p-2">
        <button type="button" onClick={() => void autoRoute()} data-testid="elec-route" className="flex h-8 w-full items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-stone-700 outline-none hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-accent/50">
          <Route className="size-3.5 shrink-0" /> Rotear automaticamente
        </button>
        {confirm ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] leading-snug text-amber-900" role="alertdialog" aria-label="Confirmar geração automática">
            Isto apaga o que você desenhou e refaz o projeto elétrico pelas regras da norma.
            <div className="mt-1.5 flex gap-1.5">
              <button
                type="button"
                data-testid="elec-regenerate-confirm"
                onClick={() => {
                  regenerate();
                  setConfirm(false);
                }}
                className="h-7 rounded-md bg-amber-600 px-2.5 text-xs font-medium text-white outline-none hover:bg-amber-700 focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                Gerar de novo
              </button>
              <button type="button" onClick={() => setConfirm(false)} className="h-7 rounded-md border border-amber-300 px-2.5 text-xs font-medium outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-accent/50">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={!manual}
            onClick={() => setConfirm(true)}
            data-testid="elec-regenerate"
            className="flex h-8 w-full items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-stone-700 outline-none hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-40"
          >
            <RotateCcw className="size-3.5 shrink-0" /> Gerar automaticamente
          </button>
        )}
      </div>
    </section>
  );
}
