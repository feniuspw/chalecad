import { create } from 'zustand';
import type { V2 } from '@/lib/tools/geom';

export interface FurnitureGhost {
  item: string;
  position: V2;
  rotation: number;
  collision: boolean;
  wallId: string | null;
}

interface FurnitureUi {
  /** Prévia que segue o mouse (ferramenta Móveis ou arrasto da biblioteca). */
  ghost: FurnitureGhost | null;
  /** Rotação (graus) aplicada ao próximo móvel fora de parede; `R` soma 90°. */
  rotation: number;
  /** Item sendo arrastado da biblioteca (HTML5 drag não deixa ler o dataTransfer durante o arrasto). */
  dragItem: string | null;
  setGhost(g: FurnitureGhost | null): void;
  setRotation(r: number): void;
  setDragItem(id: string | null): void;
}

export const useFurnitureUi = create<FurnitureUi>((set) => ({
  ghost: null,
  rotation: 0,
  dragItem: null,
  setGhost: (ghost) => set({ ghost }),
  setRotation: (rotation) => set({ rotation }),
  setDragItem: (dragItem) => set({ dragItem }),
}));

/** Tipo MIME do arrasto da biblioteca. */
export const FURNITURE_MIME = 'application/x-chalecad-furniture';
