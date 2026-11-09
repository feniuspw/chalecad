'use client';
import { create } from 'zustand';
import type { Vec2 } from '@chalecad/engine';
import type { ElecToolId } from './kinds';

export type ElecSelection = { kind: 'point'; id: string } | { kind: 'conduit'; id: string };

interface ElecUi {
  /** Camada "Elétrica" ligada na planta. */
  layerOn: boolean;
  tool: ElecToolId;
  /** Opções das ferramentas. */
  appliance: string;
  switchType: 'one_way' | 'two_way';
  luminaire: string;
  conduitRun: 'ceiling' | 'floor';
  selected: ElecSelection | null;
  /** Ids (pontos, eletrodutos, cômodos) destacados pelo "Mostrar na planta" de um aviso. */
  focus: string[];
  /** Ponto em arraste: posição provisória (o projeto só muda ao soltar). */
  drag: { id: string; position: Vec2; /** Já soltou: fica até o cálculo alcançar a edição (evita o salto). */ dropped?: boolean } | null;
  setLayer(on: boolean): void;
  setTool(t: ElecToolId): void;
  setOptions(o: Partial<Pick<ElecUi, 'appliance' | 'switchType' | 'luminaire' | 'conduitRun'>>): void;
  select(s: ElecSelection | null): void;
  setFocus(ids: string[]): void;
  setDrag(d: ElecUi['drag']): void;
}

export const useElecUi = create<ElecUi>()((set) => ({
  layerOn: false,
  tool: 'none',
  appliance: 'electric_shower',
  switchType: 'one_way',
  luminaire: 'plafon_18w',
  conduitRun: 'ceiling',
  selected: null,
  focus: [],
  drag: null,
  setLayer: (layerOn) => set(layerOn ? { layerOn } : { layerOn, tool: 'none', selected: null, focus: [], drag: null }),
  setTool: (tool) => set({ tool, selected: null }),
  setOptions: (o) => set(o),
  select: (selected) => set({ selected, focus: [] }),
  setFocus: (focus) => set({ focus }),
  setDrag: (drag) => set({ drag }),
}));
