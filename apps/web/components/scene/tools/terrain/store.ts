'use client';
import { create } from 'zustand';

export type PadDrawMode = 'rect' | 'poly';

interface TerrainUi {
  /** Como a ferramenta "Aplainar área" desenha: retângulo (dois cliques/arraste) ou polígono (cliques, Enter fecha). */
  mode: PadDrawMode;
  /** Área aplainada selecionada (editável no viewport e destacada no 3D). */
  selectedPadId: string | null;
  /** Muro de arrimo destacado (lista da seção Terreno). */
  selectedWallId: string | null;
  setMode(m: PadDrawMode): void;
  selectPad(id: string | null): void;
  selectWall(id: string | null): void;
}

/** Estado efêmero da edição do terreno (nada disso vai para o projeto nem para o histórico). */
export const useTerrainUi = create<TerrainUi>()((set) => ({
  mode: 'rect',
  selectedPadId: null,
  selectedWallId: null,
  setMode: (mode) => set({ mode }),
  selectPad: (selectedPadId) => set({ selectedPadId, selectedWallId: null }),
  selectWall: (selectedWallId) => set({ selectedWallId }),
}));
