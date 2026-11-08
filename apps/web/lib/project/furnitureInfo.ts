/** Preço de referência dos móveis (puro). O preço do móvel é o do material `furn_*` (item `mat-furn_*`) na base de preços. */
import { findPriceItem, type Catalog, type PriceBook } from '@chalecad/catalog';
import type { Project } from '@chalecad/engine';

export interface PriceRange {
  min: number;
  max: number;
}

/** Faixa de preço do móvel, com a edição manual do usuário por cima. Null se a base não tem o item. */
export function furniturePrice(itemId: string, catalog: Pick<Catalog, 'materials'>, book: PriceBook | null, overrides?: Project['priceOverrides']): PriceRange | null {
  const priceItemId = catalog.materials.find((m) => m.id === itemId)?.priceItemId ?? `mat-${itemId}`;
  const o = overrides?.[priceItemId];
  if (o) return { min: o.price, max: o.priceMax ?? o.price };
  const p = book ? findPriceItem(book, priceItemId) : undefined;
  return p ? { min: p.price, max: p.priceMax ?? p.price } : null;
}
