/** Terreno inclinado com os padrões do schema. */
import type { Catalog } from '@chalecad/catalog';
import { retainingItems, type Results, type Site } from '@chalecad/engine';

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

export const MAX_PADS = 12;
export const MAX_PAD_VERTICES = 64;

type SitePad = Sloped['pads'][number];

/** Id curto de área aplainada. */
export const newPadId = (): string => `p-${crypto.randomUUID().slice(0, 8)}`;

/** Próximo nome livre "Área N". */
export function nextPadName(pads: readonly SitePad[]): string {
  const used = new Set(pads.map((p) => p.name));
  for (let n = pads.length + 1; ; n++) if (!used.has(`Área ${n}`)) return `Área ${n}`;
}

/** Nova área aplainada: nível 0 (mesmo do platô da casa) e bordas `auto`. */
export function makePad(polygon: [number, number][], pads: readonly SitePad[], id: string = newPadId()): SitePad {
  return { id, name: nextPadName(pads), polygon: polygon.map(([x, y]) => [round3(x), round3(y)] as [number, number]), level: 0, edges: 'auto' };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export const WALL_TYPE_LABEL = { block: 'bloco estrutural', concrete: 'concreto armado', gabion: 'gabião' } as const;
export const WALL_REASON_LABEL = { height: 'altura', lot: 'talude sairia do lote', overlap: 'encontro com outra área', forced: 'forçado' } as const;

/**
 * Custo de material de cada muro (R$): quantidades do muro (`retainingItems`) vezes o custo médio por unidade líquida da
 * linha do orçamento (o orçamento agrega por item, não por muro). Null por muro quando o orçamento não tem o item.
 */
export function wallMaterialCosts(results: Pick<Results, 'terrain' | 'quantities' | 'budget'>, drainage: boolean, catalog: Catalog): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  const terrain = results.terrain;
  if (!terrain) return out;
  const rate = (itemId: string): number | null => {
    const q = results.quantities.lines.find((l) => l.stage === 'terrain' && l.itemId === itemId);
    const b = results.budget.lines.find((l) => l.stage === 'terrain' && l.itemId === itemId);
    return q && b && q.netQty > 0 ? b.material / q.netQty : null;
  };
  for (const w of terrain.walls) {
    let total = 0;
    let ok = true;
    for (const l of retainingItems(w.length, w.area, w.type, drainage && w.side === 'cut', catalog)) {
      const r = rate(l.itemId);
      if (r === null) ok = false;
      else total += l.net * r;
    }
    out[w.id] = ok ? total : null;
  }
  return out;
}
