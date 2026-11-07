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

/** Retângulo que contém a planta (inclui a ala de L/T). */
export function planBounds(t: Project['typology']): { x0: number; y0: number; x1: number; y1: number } {
  return { x0: 0, y0: 0, x1: t.width, y1: t.kind === 'combined' ? t.depth + t.wing.depth : t.depth };
}

/** Posição x da ala (L usa `offset`; T centraliza). */
export function wingX0(t: Extract<Project['typology'], { kind: 'combined' }>): number {
  return t.shape === 'T' ? (t.width - t.wing.width) / 2 : t.wing.offset;
}

/** Comprimento (m) do hospedeiro de uma abertura, ou null se não dá para saber (águas de telhado). */
export function hostLength(project: Project, hostId: string): number | null {
  const t = project.typology;
  if (t.kind === 'combined') {
    const x0 = wingX0(t);
    const x1 = x0 + t.wing.width;
    const rightLen = t.width - x1;
    const leftLen = x0;
    switch (hostId) {
      case 'ext-front':
        return t.width;
      case 'ext-left':
      case 'ext-right':
        return t.depth;
      case 'ext-back':
        return rightLen > 0.05 ? rightLen : leftLen > 0.05 ? leftLen : null;
      case 'ext-back-2':
        return rightLen > 0.05 && leftLen > 0.05 ? leftLen : null;
      case 'wing-back':
        return t.wing.width;
      case 'wing-left':
      case 'wing-right':
        return t.wing.depth;
    }
  }
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
