'use client';
import { useEffect } from 'react';
import { LandPlot } from 'lucide-react';
import { toast } from 'sonner';
import { useApprovalUi } from '@/lib/approval/ui';
import { isTyping } from '@/hooks/useShortcuts';
import { useEditor } from '@/lib/store/editor';
import { useLotUi } from './store';

/** Liga e desliga a camada "Lote" (L) e leva à Planta; sem lote informado, avisa e oferece o cadastro. */
function toggleLot() {
  const next = !useLotUi.getState().layerOn;
  useLotUi.getState().setLayer(next);
  if (!next) return;
  if (useEditor.getState().cameraView !== 'plan') useEditor.getState().setCameraView('plan');
  if (!useEditor.getState().project.legal.lot) toast.info('Informe o lote para ver o contorno e os recuos.', { action: { label: 'Informar', onClick: () => useApprovalUi.getState().goToField('legal.lot') } });
}

/** Botão "Lote" (vista de planta) e a tecla L. Sempre montado para a tecla valer. */
export function LotToggle() {
  const on = useLotUi((s) => s.layerOn);
  const view = useEditor((s) => s.cameraView);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'l' || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || isTyping(e.target)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) return;
      e.preventDefault();
      toggleLot();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (view !== 'plan') return null;
  return (
    <button
      type="button"
      onClick={toggleLot}
      aria-pressed={on}
      title="Lote: contorno, recuos, fossa e poço na planta (L)"
      className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-white/90 px-2.5 text-xs font-medium text-stone-700 shadow-float backdrop-blur outline-none hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-accent/50 aria-pressed:border-accent/50 aria-pressed:bg-accent-soft aria-pressed:text-accent-hover"
    >
      <LandPlot className="size-3.5" /> Lote <kbd className="rounded border border-border bg-white/70 px-1 text-[10px] text-stone-500">L</kbd>
    </button>
  );
}
