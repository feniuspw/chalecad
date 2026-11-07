import { Catalog } from './schema';
import type { Assembly, Material, PriceBook, PriceItem, Profile } from './schema';
import { assemblies } from './data/assemblies';
import { constants } from './data/constants';
import { materials } from './data/materials';
import { priceBookDefault202611 } from './data/pricebook-default-2026-11';
import { profiles } from './data/profiles';

export const CATALOG_VERSION = '2026.11.0';
export * from './schema';
export { assemblies, constants, materials, priceBookDefault202611, profiles };
export { sectionProperties } from './data/section';
export type { SectionProps } from './data/section';

let cached: Catalog | undefined;

/** Catálogo completo, validado e memorizado. */
export function getCatalog(): Catalog {
  if (!cached) {
    cached = Catalog.parse({
      version: CATALOG_VERSION,
      profiles,
      materials,
      assemblies,
      priceBooks: [priceBookDefault202611],
      constants,
    });
  }
  return cached;
}

export function getProfile(cat: Catalog, id: string): Profile {
  const x = cat.profiles.find((p) => p.id === id);
  if (!x) throw new Error(`Perfil não encontrado no catálogo: ${id}`);
  return x;
}

export function getMaterial(cat: Catalog, id: string): Material {
  const x = cat.materials.find((p) => p.id === id);
  if (!x) throw new Error(`Material não encontrado no catálogo: ${id}`);
  return x;
}

export function getAssembly(cat: Catalog, id: string): Assembly {
  const x = cat.assemblies.find((p) => p.id === id);
  if (!x) throw new Error(`Composição não encontrada no catálogo: ${id}`);
  return x;
}

export function getPriceBook(cat: Catalog, id: string): PriceBook {
  const x = cat.priceBooks.find((p) => p.id === id);
  if (!x) throw new Error(`Base de preços não encontrada no catálogo: ${id}`);
  return x;
}

export function findPriceItem(book: PriceBook, itemId: string): PriceItem | undefined {
  return book.items.find((i) => i.itemId === itemId);
}
