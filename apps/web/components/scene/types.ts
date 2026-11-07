import type { RefObject } from 'react';
import type { BuildingModel } from '@chalecad/engine';
import type { ViewPreset } from '@/lib/three/convert';

export type { ViewPreset };

/** API imperativa do viewport. */
export interface ViewportHandle {
  /** Reenquadra a edificação na vista atual (animado). */
  center: () => void;
  /** Move a câmera para uma vista pré-definida (animado). */
  setView: (view: ViewPreset) => void;
}

export interface ViewportProps {
  model: BuildingModel;
  /** Modo vitrine: gira sozinho, sem controles nem seleção. */
  showcase?: boolean;
  highlight?: { hostIds: string[] };
  onSelectHost?: (id: string | null) => void;
  hoverable?: boolean;
  /** Preenchida com a API imperativa (centralizar, vistas). */
  apiRef?: RefObject<ViewportHandle | null>;
  className?: string;
}
