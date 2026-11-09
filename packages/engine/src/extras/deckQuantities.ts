import type { Catalog } from '@chalecad/catalog';
import { polygonArea } from '../geometry';
import type { Item } from '../quantities/items';
import type { ExtraModel } from '../schema/results';
import { segLen } from './geometry';

/** `add` de `computeExtras`: ignora quantidades não positivas e converte o item pelo catálogo. */
export type AddItem = (hostId: string, itemId: string, net: number, extra?: Partial<Item>) => void;

// LOCAL: premissas de ferragem e longarina que ainda não estão em `catalog.constants.extras.deck`.
/** Chumbadores por pilar de madeira ou aço (chapa de base). */
const BOLTS_PER_PILLAR = 4;
/** Espaçamento dos chumbadores do ledger (m). */
const LEDGER_BOLT_SPACING = 0.6;
/** Parafusos por cruzamento tábua × barrote. */
const SCREWS_PER_CROSSING = 2;
/** Mãos-francesas por pilar contraventado. */
const BRACES_PER_PILLAR = 2;
/** Seção da longarina da escada (m). */
const STRINGER = { width: 0.05, depth: 0.25 };

const memberVolume = (m: { from: [number, number]; to: [number, number]; width: number; depth: number }): number =>
  segLen(m.from, m.to) * m.width * m.depth;

/**
 * Quantitativos do deck pela estrutura real: tábuas (m²), madeira tratada (m³: barrotes, vigas, ledger e longarinas),
 * pilares por material (m), uma fundação de concreto por pilar, ferragens, guarda-corpo (comprimento real, sem as
 * aberturas das escadas) e degraus.
 */
export function deckItems(hostId: string, em: ExtraModel, catalog: Catalog, add: AddItem): void {
  const X = catalog.constants.extras.deck;
  const d = em.deck;
  if (em.polygon && em.polygon.length > 0) add(hostId, 'deck_wood', polygonArea(em.polygon));
  const railLen = em.segments.filter((s) => s.material === 'rail').reduce((s, x) => s + segLen(x.from, x.to), 0);
  if (!d) {
    add(hostId, 'guardrail', railLen);
    return;
  }
  let timber = d.joists.reduce((s, m) => s + memberVolume(m), 0) + d.beams.reduce((s, m) => s + memberVolume(m), 0);
  if (d.ledger) timber += memberVolume(d.ledger);

  let handrail = 0;
  for (const s of d.stairs) {
    const run = (s.risers - 1) * s.tread;
    const slope = Math.hypot(run, s.topZ - s.bottomZ);
    timber += 2 * slope * STRINGER.width * STRINGER.depth;
    handrail += 2 * slope;
    add(hostId, 'stair_tread', Math.max(1, s.risers - 1));
  }
  add(hostId, 'deck_timber', timber);

  const len = { wood: 0, steel: 0, concrete: 0 };
  let concrete = 0;
  let bolts = d.ledger ? Math.ceil(segLen(d.ledger.from, d.ledger.to) / LEDGER_BOLT_SPACING) + 1 : 0;
  let braces = 0;
  for (const s of d.supports) {
    const h = Math.max(0, s.topZ - s.groundZ);
    len[s.material] += h;
    concrete += s.footing.kind === 'pad' ? s.footing.width * s.footing.width * s.footing.depth : (Math.PI * s.footing.width * s.footing.width * s.footing.depth) / 4;
    if (h > 0 && s.material !== 'concrete') bolts += BOLTS_PER_PILLAR;
    if (s.braced) braces += BRACES_PER_PILLAR;
  }
  add(hostId, 'deck_post_wood', len.wood);
  add(hostId, 'deck_post_steel', len.steel);
  add(hostId, 'deck_post_concrete', len.concrete);
  add(hostId, 'concrete_fck25', concrete, { kg: concrete * catalog.constants.concreteDensity });
  add(hostId, 'anchor_bolt', bolts);
  add(hostId, 'deck_brace', braces);

  const area = em.polygon && em.polygon.length > 0 ? polygonArea(em.polygon) : 0;
  add(hostId, 'deck_screw', (area / ((X.board.width + X.board.gap) * X.joist.spacing)) * SCREWS_PER_CROSSING);
  add(hostId, 'guardrail', railLen + handrail);
}
