'use client';
/**
 * Estado da camada Hidráulica (separado do store do editor: o contrato de `types.ts` não é alterado). Guarda a camada
 * ligada, o filtro de sistemas, a ferramenta de hidráulica ativa e a seleção (tubo, ponto ou caixa).
 */
import { create } from 'zustand';
import type { PipeSystem } from '@chalecad/engine';

export type PlumbTool = 'edit' | 'point' | 'tank' | 'cold' | 'hot' | 'sewer' | 'vent';
export type PlumbSel = { kind: 'pipe' | 'point'; id: string } | { kind: 'tank'; id: 'tank' };

export interface PlumbState {
  layer: boolean;
  systems: Record<PipeSystem, boolean>;
  tool: PlumbTool | null;
  /** Aparelho da ferramenta Ponto de água (chave do catálogo). */
  fixture: string;
  sel: PlumbSel | null;
  setLayer(on: boolean): void;
  toggleSystem(s: PipeSystem): void;
  setTool(t: PlumbTool | null): void;
  setFixture(f: string): void;
  select(sel: PlumbSel | null): void;
}

export const usePlumb = create<PlumbState>()((set) => ({
  layer: false,
  systems: { cold: true, hot: true, sewer: true, vent: true },
  tool: null,
  fixture: 'lavatory',
  sel: null,
  setLayer: (layer) => set(() => (layer ? { layer } : { layer, tool: null, sel: null })),
  toggleSystem: (k) => set((s) => ({ systems: { ...s.systems, [k]: !s.systems[k] } })),
  setTool: (tool) => set((s) => ({ tool, layer: tool ? true : s.layer, sel: tool && tool !== 'edit' ? null : s.sel })),
  setFixture: (fixture) => set({ fixture }),
  select: (sel) => set({ sel }),
}));

/** Ferramenta de tubo -> sistema. */
export const TOOL_SYSTEM: Partial<Record<PlumbTool, PipeSystem>> = { cold: 'cold', hot: 'hot', sewer: 'sewer', vent: 'vent' };
