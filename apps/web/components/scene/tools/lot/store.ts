'use client';
import { create } from 'zustand';

interface LotUi {
  /** Camada "Lote" ligada na vista de planta. */
  layerOn: boolean;
  setLayer(on: boolean): void;
}

export const useLotUi = create<LotUi>()((set) => ({
  layerOn: false,
  setLayer: (layerOn) => set({ layerOn }),
}));
