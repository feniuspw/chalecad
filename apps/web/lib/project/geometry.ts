import type { Project, Vec2 } from '@chalecad/engine';

export const round = (n: number, d = 2) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export const wallLength = (from: Vec2, to: Vec2) => Math.hypot(to[0] - from[0], to[1] - from[1]);

/** Inclinação em graus -> porcentagem (100% = 45°). */
export const degToPct = (deg: number) => Math.tan((deg * Math.PI) / 180) * 100;
export const pctToDeg = (pct: number) => (Math.atan(pct / 100) * 180) / Math.PI;

/** Ângulo das águas do A-frame (graus), dado largura, cumeeira e mureta. */
export function aFramePitchDeg(width: number, ridgeHeight: number, kneeWallHeight = 0) {
  return (Math.atan2(Math.max(0.01, ridgeHeight - kneeWallHeight), width / 2) * 180) / Math.PI;
}

/** Comprimento (m) do hospedeiro de uma abertura, ou null se não dá para saber (águas de telhado). */
export function hostLength(project: Project, hostId: string): number | null {
  const t = project.typology;
  switch (hostId) {
    case 'ext-front':
    case 'ext-back':
      return t.width;
    case 'ext-left':
    case 'ext-right':
      return t.depth;
    default: {
      const w = project.walls.find((x) => x.id === hostId);
      if (w) return wallLength(w.from, w.to);
      if (hostId.startsWith('roof-')) return t.depth;
      return null;
    }
  }
}
