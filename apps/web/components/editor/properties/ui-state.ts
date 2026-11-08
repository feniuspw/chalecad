import { create } from 'zustand';
import type { SectionId } from '../../../lib/project/selection';

interface PanelUi {
  open: Record<SectionId, boolean>;
  setOpen: (id: SectionId, open: boolean) => void;
  /** Abre a seção e a destaca (usado ao clicar num aviso de validação). */
  reveal: (id: SectionId) => void;
}

export const usePanelUi = create<PanelUi>((set) => ({
  open: { typology: true, mezzanine: true, system: false, roof: false, foundation: false, site: false, terrain: false, extras: false, finishes: false },
  setOpen: (id, open) => set((s) => ({ open: { ...s.open, [id]: open } })),
  reveal: (id) => set((s) => ({ open: { ...s.open, [id]: true } })),
}));

/**
 * Ganchos de ferramentas ligados pelo orquestrador (cena 3D). Enquanto `drawPath` for null, o botão
 * "Desenhar no 3D" dos extras não aparece. Ao ser chamado, deve abrir o `PathDrawer` para o extra.
 */
interface ExtraTools {
  drawPath: ((extraId: string) => void) | null;
  setDrawPath: (fn: ((extraId: string) => void) | null) => void;
}

export const useExtraTools = create<ExtraTools>((set) => ({
  drawPath: null,
  setDrawPath: (fn) => set({ drawPath: fn }),
}));
