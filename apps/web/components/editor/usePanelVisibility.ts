'use client';
import { useCallback, useEffect, useState } from 'react';

const KEY = 'chalecad.panels.v1';

export interface PanelVisibility {
  left: boolean;
  right: boolean;
}

/** Próximo estado para os atalhos: `[` alterna Propriedades, `]` Resultados, `\` esconde os dois (ou mostra, se já escondidos). */
export function togglePanels(v: PanelVisibility, which: 'left' | 'right' | 'both'): PanelVisibility {
  if (which === 'left') return { ...v, left: !v.left };
  if (which === 'right') return { ...v, right: !v.right };
  const anyOpen = v.left || v.right;
  return { left: !anyOpen, right: !anyOpen };
}

function read(): PanelVisibility {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<PanelVisibility>;
      return { left: v.left !== false, right: v.right !== false };
    }
  } catch {
    // sem armazenamento: painéis abertos
  }
  return { left: true, right: true };
}

/** Painéis laterais recolhíveis, lembrados entre sessões (por navegador). */
export function usePanelVisibility() {
  const [panels, setPanels] = useState<PanelVisibility>({ left: true, right: true });
  useEffect(() => setPanels(read()), []);
  const toggle = useCallback((which: 'left' | 'right' | 'both') => {
    setPanels((v) => {
      const next = togglePanels(v, which);
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // ignora
      }
      return next;
    });
  }, []);
  return { panels, toggle };
}
