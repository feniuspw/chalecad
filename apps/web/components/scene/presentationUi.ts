import { create } from 'zustand';

export type QualityChoice = 'auto' | 'high' | 'light';

interface PresentationUi {
  /** Qualidade escolhida; `auto` começa em Alta e cai para Leve se o FPS cair. */
  quality: QualityChoice;
  /** O monitor de desempenho rebaixou a qualidade automática. */
  degraded: boolean;
  /** Luzes internas acesas (uma por cômodo). */
  lamps: boolean;
  /** Mostra as instalações (elétrica e hidráulica) na apresentação. Desligado por padrão. */
  installations: boolean;
  /** Animação do dia em andamento. */
  playing: boolean;
  /** Quadros por segundo medidos (null fora do modo apresentação). */
  fps: number | null;
  setQuality(q: QualityChoice): void;
  setDegraded(v: boolean): void;
  setLamps(v: boolean): void;
  setInstallations(v: boolean): void;
  setPlaying(v: boolean): void;
}

/** Estado efêmero do modo apresentação (não vai para o projeto). */
export const usePresentationUi = create<PresentationUi>()((set) => ({
  quality: 'auto',
  degraded: false,
  lamps: false,
  installations: false,
  playing: false,
  fps: null,
  setQuality: (quality) => set({ quality, degraded: false }),
  setDegraded: (degraded) => set((s) => (s.degraded === degraded ? s : { degraded })),
  setLamps: (lamps) => set({ lamps }),
  setInstallations: (installations) => set({ installations }),
  setPlaying: (playing) => set({ playing }),
}));

/** Qualidade efetiva depois do rebaixamento automático. */
export function effectiveQuality(quality: QualityChoice, degraded: boolean): 'high' | 'light' {
  if (quality === 'auto') return degraded ? 'light' : 'high';
  return quality;
}
