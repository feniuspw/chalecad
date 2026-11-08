'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@chalecad/ui';
import { markTourSeen, placePopover, resolveStep, TOUR_STEPS, visibleSteps, type Box, type Placement, type TourStep } from './steps';

const PAD = 6;

const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
};

/**
 * Tour guiado: um balão ancorado em cada elemento (`data-tour` ou seletor), com realce por recorte de sombra.
 * Pula passos cujo elemento não está na tela. Esc fecha; "Pular" e "Concluir" também gravam a flag de visto.
 */
export function Tour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Box | null>(null);
  const [place, setPlace] = useState<Placement | null>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // Passos que existem na tela (medidos ao abrir).
  useEffect(() => {
    if (!open) return;
    const list = visibleSteps(TOUR_STEPS, (s) => {
      const el = resolveStep(document, s);
      return el ? boxOf(el) : null;
    });
    setSteps(list);
    setIndex(0);
  }, [open]);

  const step = steps[index];

  const measure = useCallback(() => {
    if (!step) return;
    const el = resolveStep(document, step);
    if (!el) {
      setRect(null);
      return;
    }
    const b = boxOf(el);
    setRect((prev) => (prev && prev.x === b.x && prev.y === b.y && prev.width === b.width && prev.height === b.height ? prev : b));
  }, [step]);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    window.addEventListener('resize', measure);
    const t = window.setInterval(measure, 400);
    return () => {
      window.removeEventListener('resize', measure);
      window.clearInterval(t);
    };
  }, [open, measure]);

  // Posiciona o balão depois de medir o alvo e o próprio balão.
  useLayoutEffect(() => {
    if (!open || !rect || !step || !popRef.current) return;
    const pop = popRef.current.getBoundingClientRect();
    setPlace(placePopover(rect, { width: pop.width, height: pop.height }, { width: window.innerWidth, height: window.innerHeight }, step.side));
  }, [open, rect, step]);

  const close = useCallback(() => {
    markTourSeen();
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        if (e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
        e.preventDefault();
        setIndex((i) => Math.max(0, Math.min(steps.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1))));
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, close, steps.length]);

  // Sem nenhum alvo na tela, não há o que mostrar.
  useEffect(() => {
    if (open && steps.length === 0 && typeof document !== 'undefined') {
      const t = window.setTimeout(() => {
        if (visibleSteps(TOUR_STEPS, (s) => resolveStep(document, s)?.getBoundingClientRect() ?? null).length === 0) onClose();
      }, 50);
      return () => window.clearTimeout(t);
    }
  }, [open, steps.length, onClose]);

  if (!open || !step || typeof document === 'undefined') return null;
  const last = index === steps.length - 1;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[70]" data-testid="tour">
      {rect ? (
        <div
          aria-hidden
          className="absolute rounded-lg transition-all duration-200"
          style={{ left: rect.x - PAD, top: rect.y - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2, boxShadow: '0 0 0 2px var(--color-accent), 0 0 0 9999px rgba(28, 25, 23, 0.55)' }}
        />
      ) : null}
      <div
        ref={popRef}
        role="group"
        aria-label={`Tour guiado, passo ${index + 1} de ${steps.length}`}
        aria-live="polite"
        className="pointer-events-auto absolute w-80 max-w-[calc(100vw-1.5rem)] rounded-xl border border-border bg-white p-4 shadow-xl"
        style={{ left: place?.left ?? 12, top: place?.top ?? 12, visibility: place ? 'visible' : 'hidden' }}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-stone-900">{step.title}</h2>
          <span className="text-xs font-medium text-stone-500 tabular-nums" aria-label={`Passo ${index + 1} de ${steps.length}`}>
            {index + 1}/{steps.length}
          </span>
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-stone-600">{step.body}</p>
        <div className="mt-4 flex items-center gap-2">
          <Button variant="ghost" size="sm" className="mr-auto" onClick={close}>
            Pular
          </Button>
          <Button variant="outline" size="sm" disabled={index === 0} onClick={() => setIndex(index - 1)}>
            Anterior
          </Button>
          <Button variant="accent" size="sm" autoFocus onClick={() => (last ? close() : setIndex(index + 1))}>
            {last ? 'Concluir' : 'Próximo'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
