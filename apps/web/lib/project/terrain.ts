/** Terreno inclinado com os padrões do schema. */
import type { Site } from '@chalecad/engine';

type Sloped = Extract<Site, { type: 'sloped' }>;

export const DEFAULT_SLOPE_PCT = 10;

export function makeSlopedSite(over: Partial<Omit<Sloped, 'type'>> = {}): Sloped {
  return {
    type: 'sloped',
    slopePct: DEFAULT_SLOPE_PCT,
    // Desce para a frente: a porta fica no lado baixo e o corte vai para o fundo.
    downhillAzimuthDeg: 180,
    platformMargin: { front: 3, back: 1.5, left: 1.5, right: 1.5 },
    platformElevation: 'auto',
    cutSlopeHV: 1,
    fillSlopeHV: 1.5,
    disposalDistanceKm: 10,
    pads: [],
    edges: 'auto',
    retaining: { type: 'auto', drainage: true },
    ...over,
  };
}
