/**
 * Diretor de câmera da apresentação: a cena registra o que sabe fazer (voar até uma pose, tocar uma
 * animação, ler a pose atual); os painéis só chamam. Sem three.
 */
import type { Pose } from './viewpoints';

export interface PlayOptions {
  duration: number;
  /** Pose da câmera no instante t (s). */
  pose: (t: number) => Pose;
  /** Chamado a cada quadro com t (s), para animar o sol etc. */
  onFrame?: (t: number) => void;
  signal?: AbortSignal;
}

export interface Director {
  /** Pose atual da câmera. */
  current(): Pose | null;
  /** Posiciona a câmera já. */
  set(pose: Pose): void;
  /** Anima de t = 0 a duration; resolve true se terminou, false se cancelada. */
  play(opts: PlayOptions): Promise<boolean>;
  /** Trava ou libera a interação do usuário com a câmera. */
  lock(locked: boolean): void;
  /** Canvas WebGL da cena (para gravar). */
  canvas(): HTMLCanvasElement;
  /** Dá a razão (aspect) e a FOV atuais para o enquadramento. */
  lens(): { fovDeg: number; aspect: number };
}

let registered: Director | null = null;
export const registerDirector = (d: Director | null) => {
  registered = d;
};
export const getDirector = () => registered;
