'use client';
import { useEffect, useState } from 'react';

/** Tela estreita (< 768 px) ou de toque (sem PointerLock para andar por dentro). */
export function useViewerDevice(): { narrow: boolean; touch: boolean } {
  const [state, setState] = useState({ narrow: false, touch: false });
  useEffect(() => {
    const n = window.matchMedia('(max-width: 767px)');
    const t = window.matchMedia('(pointer: coarse)');
    const update = () => setState({ narrow: n.matches, touch: t.matches });
    update();
    n.addEventListener('change', update);
    t.addEventListener('change', update);
    return () => {
      n.removeEventListener('change', update);
      t.removeEventListener('change', update);
    };
  }, []);
  return state;
}
