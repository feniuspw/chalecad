'use client';
import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

interface Options {
  initial: number;
  min: number;
  max: number;
}

/** Largura de um painel à direita, ajustável arrastando (ou com ←/→ no foco) a alça da borda esquerda. */
export function useResizablePanel({ initial, min, max }: Options) {
  const [width, setWidth] = useState(initial);
  const [dragging, setDragging] = useState(false);
  const start = useRef({ x: 0, w: initial });
  const clamp = useCallback((n: number) => Math.min(max, Math.max(min, n)), [min, max]);

  const handleProps = {
    role: 'separator' as const,
    'aria-orientation': 'vertical' as const,
    'aria-valuemin': min,
    'aria-valuemax': max,
    'aria-valuenow': Math.round(width),
    'aria-label': 'Redimensionar painel',
    tabIndex: 0,
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      start.current = { x: e.clientX, w: width };
      setDragging(true);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      if (!dragging) return;
      setWidth(clamp(start.current.w + (start.current.x - e.clientX)));
    },
    onPointerUp: () => setDragging(false),
    onPointerCancel: () => setDragging(false),
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.key === 'ArrowLeft') setWidth((w) => clamp(w + 24));
      if (e.key === 'ArrowRight') setWidth((w) => clamp(w - 24));
    },
    onDoubleClick: () => setWidth(initial),
  };

  return { width, dragging, handleProps };
}
