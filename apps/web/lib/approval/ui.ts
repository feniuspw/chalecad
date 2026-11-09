'use client';
import { create } from 'zustand';

export type ApprovalTab = 'data' | 'compliance' | 'art' | 'memorials' | 'export';

interface ApprovalUi {
  open: boolean;
  tab: ApprovalTab;
  /** Chave do campo (ex.: `legal.lot`) que a aba Dados deve focar ao abrir. */
  focusKey: string | null;
  show(tab?: ApprovalTab): void;
  hide(): void;
  setTab(tab: ApprovalTab): void;
  /** Leva à aba Dados e foca o campo da chave. */
  goToField(key: string): void;
  clearFocus(): void;
}

export const useApprovalUi = create<ApprovalUi>()((set) => ({
  open: false,
  tab: 'data',
  focusKey: null,
  show: (tab) => set((s) => ({ open: true, tab: tab ?? s.tab })),
  hide: () => set({ open: false }),
  setTab: (tab) => set({ tab }),
  goToField: (key) => set({ open: true, tab: 'data', focusKey: key }),
  clearFocus: () => set({ focusKey: null }),
}));
