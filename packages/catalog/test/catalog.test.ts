import { describe, expect, test } from 'vitest';
import {
  Catalog,
  findPriceItem,
  getAssembly,
  getCatalog,
  getMaterial,
  getPriceBook,
  getProfile,
  sectionProperties,
} from '../src/index';

const cat = getCatalog();
const book = getPriceBook(cat, 'default-2026-11');

const unique = (ids: string[]) => new Set(ids).size === ids.length;

describe('catálogo', () => {
  test('valida e é memorizado', () => {
    expect(() => Catalog.parse(cat)).not.toThrow();
    expect(getCatalog()).toBe(cat);
  });

  test('IDs únicos', () => {
    expect(unique(cat.profiles.map((p) => p.id))).toBe(true);
    expect(unique(cat.materials.map((p) => p.id))).toBe(true);
    expect(unique(cat.assemblies.map((p) => p.id))).toBe(true);
    expect(unique(book.items.map((p) => p.itemId))).toBe(true);
  });

  test('seção Ue90x40x12x0.95', () => {
    const s = sectionProperties('Ue', 90, 40, 12, 0.95);
    expect(s.area).toBeGreaterThanOrEqual(1.69);
    expect(s.area).toBeLessThanOrEqual(1.76);
    expect(s.massPerM).toBeGreaterThanOrEqual(1.33);
    expect(s.massPerM).toBeLessThanOrEqual(1.38);
  });

  test('massa/m = área × 7850', () => {
    for (const p of cat.profiles) {
      const expected = p.area * 1e-4 * 7850;
      expect(Math.abs(p.massPerM - expected) / expected).toBeLessThan(0.01);
    }
  });

  test('materiais das assemblies existem', () => {
    for (const a of cat.assemblies) {
      for (const l of a.layers) expect(() => getMaterial(cat, l.materialId)).not.toThrow();
    }
  });

  test('itens de preço existem para perfis e materiais', () => {
    for (const p of cat.profiles) {
      expect(p.priceItemIds.length).toBe(p.barLengths.length);
      for (const id of p.priceItemIds) expect(findPriceItem(book, id), id).toBeDefined();
    }
    for (const m of cat.materials) expect(findPriceItem(book, m.priceItemId), m.id).toBeDefined();
  });

  test('itens do fixture existem', () => {
    for (const id of [
      'Ue90x40x0.95',
      'U90x40x0.95',
      'Ue200x40x1.25',
      'U200x40x1.25',
      'Ue140x40x0.95',
      'U140x40x0.95',
      'Cr50x0.95',
      'Fita70x0.95',
      'Fita100x0.95',
    ])
      expect(getProfile(cat, id).id).toBe(id);
    for (const id of [
      'ext_cement_osb_wool_drywall',
      'ext_osb_siding_wool_drywall',
      'int_drywall_wool_drywall',
      'wet_cement_drywall_rh',
      'gable_glazed',
      'roof_sandwich_eps30',
      'floor_osb18',
    ])
      expect(getAssembly(cat, id).id).toBe(id);
    expect(getMaterial(cat, 'sandwich_eps30').id).toBe('sandwich_eps30');
  });

  test('valores da spec', () => {
    const dry = getMaterial(cat, 'drywall_st_12');
    expect(findPriceItem(book, dry.priceItemId)?.price).toBe(89);
    const cem = getMaterial(cat, 'cement_board_10');
    expect(findPriceItem(book, cem.priceItemId)?.price).toBeCloseTo(48 * 2.88, 2);
    expect(findPriceItem(book, 'bar-Ue90x40x0.95-6m')).toMatchObject({ price: 112, priceMax: 135 });
    expect(findPriceItem(book, 'bar-U90x40x0.95-6m')).toMatchObject({ price: 103, priceMax: 111 });
    expect(findPriceItem(book, 'bar-Ue140x40x0.95-6m')?.price).toBe(144);
    expect(findPriceItem(book, 'bar-Ue200x40x0.95-6m')?.price).toBe(180);
  });

  test('helpers lançam erro pt-BR e findPriceItem devolve undefined', () => {
    expect(() => getProfile(cat, 'x')).toThrow(/não encontrado/);
    expect(() => getMaterial(cat, 'x')).toThrow(/não encontrado/);
    expect(() => getAssembly(cat, 'x')).toThrow(/não encontrada/);
    expect(() => getPriceBook(cat, 'x')).toThrow(/não encontrada/);
    expect(findPriceItem(book, 'x')).toBeUndefined();
  });
});
