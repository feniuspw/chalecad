import { create } from 'zustand';
import type { SectionId } from '../../../lib/project/selection';

interface PanelUi {
  open: Record<SectionId, boolean>;
  setOpen: (id: SectionId, open: boolean) => void;
  /** Abre a seção e a destaca (usado ao clicar num aviso de validação). */
  reveal: (id: SectionId) => void;
}

export const usePanelUi = create<PanelUi>((set) => ({
  open: { typology: true, mezzanine: true, system: false, roof: false, foundation: false, site: false },
  setOpen: (id, open) => set((s) => ({ open: { ...s.open, [id]: open } })),
  reveal: (id) => set((s) => ({ open: { ...s.open, [id]: true } })),
}));
