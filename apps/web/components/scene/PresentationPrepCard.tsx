'use client';
import { useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { useEditor } from '@/lib/store/editor';
import { usePrepStatus } from '@/lib/three/presentationPrep';
import { cancelPresentationPrep, openPresentation } from './presentationFlow';

/** Cartão flutuante do preparo da apresentação: progresso com Cancelar; pronto com Abrir. O editor segue usável. */
export function PresentationPrepCard() {
  const phase = usePrepStatus((s) => s.phase);
  const progress = usePrepStatus((s) => s.progress);
  const label = usePrepStatus((s) => s.label);
  const signature = usePrepStatus((s) => s.signature);
  const presenting = useEditor((s) => s.viewMode === 'presentation');
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (presenting || phase === 'idle') return null;
  const pct = Math.round(progress * 100);
  if (phase === 'ready') {
    if (dismissed === signature) return null;
    return (
      <div role="status" aria-label="Apresentação pronta" data-testid="presentation-ready" className="pointer-events-auto absolute bottom-14 left-3 z-20 flex w-72 items-center gap-3 rounded-lg border border-border bg-white/95 p-3 shadow-float backdrop-blur">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700">
          <Check className="size-4" />
        </span>
        <span className="flex-1 text-sm font-medium text-stone-800">Apresentação pronta</span>
        <button type="button" onClick={() => void openPresentation()} className="h-7 rounded-md bg-accent px-3 text-xs font-semibold text-white outline-none hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-accent/50">
          Abrir
        </button>
        <button type="button" aria-label="Dispensar aviso" onClick={() => setDismissed(signature)} className="grid size-6 place-items-center rounded text-stone-400 outline-none hover:text-stone-700 focus-visible:ring-2 focus-visible:ring-accent/50">
          <X className="size-3.5" />
        </button>
      </div>
    );
  }
  return (
    <div role="status" aria-label="Preparando a apresentação" data-testid="presentation-preparing" className="pointer-events-auto absolute bottom-14 left-3 z-20 w-72 rounded-lg border border-border bg-white/95 p-3 shadow-float backdrop-blur">
      <div className="flex items-center gap-2 text-sm font-medium text-stone-800">
        <Loader2 className="size-4 shrink-0 animate-spin text-accent" />
        <span className="flex-1">Preparando a apresentação… {pct}%</span>
      </div>
      <div role="progressbar" aria-label="Progresso do preparo" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-200">
        <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-stone-500">{label}</span>
        <button type="button" onClick={cancelPresentationPrep} className="h-6 rounded-md px-2 text-xs font-medium text-stone-600 outline-none hover:bg-stone-100 hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-accent/50">
          Cancelar
        </button>
      </div>
    </div>
  );
}

/** Por cima do canvas enquanto a cena da apresentação monta (nunca uma tela parada sem aviso). */
export function SceneMountingOverlay() {
  const mounting = usePrepStatus((s) => s.mounting);
  if (!mounting) return null;
  return (
    <div role="status" aria-label="Montando a cena" data-testid="scene-mounting" className="absolute inset-0 z-30 grid place-items-center bg-stone-900/35 backdrop-blur-[2px]">
      <span className="flex items-center gap-2 rounded-lg bg-white/95 px-4 py-2.5 text-sm font-medium text-stone-800 shadow-float">
        <Loader2 className="size-4 animate-spin text-accent" /> Montando a cena…
      </span>
    </div>
  );
}
