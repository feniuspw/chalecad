import { create } from 'zustand';
import type { Vec2 } from '@chalecad/engine';

export interface Measurement {
  a: Vec2;
  b: Vec2;
  z: number;
}

export interface PathDrawRequest {
  onComplete: (path: Vec2[], closed: boolean) => void;
  onCancel: () => void;
}

export interface SceneInfoState {
  /** Tooltip do mapa de calor / hover de peça (coordenadas de tela). */
  tooltip: { x: number; y: number; title: string; lines: string[] } | null;
  /** Dica contextual da ferramenta (rodapé do viewport). */
  hint: string | null;
  /** Aviso persistente curto ("Mostrando estrutura destacada"). */
  notice: string | null;
  /** Desenho de caminho (cerca/muro) ativo, registrado por `PathDrawer`. */
  pathDraw: PathDrawRequest | null;
  /** Medidas persistentes da ferramenta Medir (até Esc). */
  measurements: Measurement[];
  setMeasurements(m: Measurement[]): void;
  setTooltip(t: SceneInfoState['tooltip']): void;
  setHint(h: string | null): void;
  setNotice(n: string | null): void;
  setPathDraw(r: PathDrawRequest | null): void;
}

/** Estado efêmero da cena (nada disso vai para o projeto nem para o histórico). */
export const useSceneInfo = create<SceneInfoState>()((set) => ({
  tooltip: null,
  hint: null,
  notice: null,
  pathDraw: null,
  measurements: [],
  setMeasurements: (measurements) => set({ measurements }),
  setTooltip: (tooltip) => set({ tooltip }),
  setHint: (hint) => set((s) => (s.hint === hint ? s : { hint })),
  setNotice: (notice) => set((s) => (s.notice === notice ? s : { notice })),
  setPathDraw: (pathDraw) => set({ pathDraw }),
}));
