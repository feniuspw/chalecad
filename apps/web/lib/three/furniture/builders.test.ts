import { describe, expect, it } from 'vitest';
import { FurnitureModelKind, getCatalog } from '@chalecad/catalog';
import { buildFurnitureParts } from './builders';
import { partsBox } from './kit';

const catalog = getCatalog();
const TOL = 0.05;

describe('construtores 3D dos móveis', () => {
  it('todo modelo do catálogo está coberto', () => {
    for (const kind of FurnitureModelKind.options) expect(catalog.furniture.some((f) => f.model === kind), kind).toBe(true);
  });

  for (const spec of catalog.furniture) {
    it(`${spec.id}: caixa ≈ size (±5 cm), apoiado no piso, sem NaN`, () => {
      const parts = buildFurnitureParts(spec.model, spec.size);
      expect(parts.length).toBeGreaterThan(0);
      const box = partsBox(parts);
      const { w, d, h } = spec.size;
      const msg = `${spec.id} box x[${box.min.x.toFixed(3)},${box.max.x.toFixed(3)}] y[${box.min.y.toFixed(3)},${box.max.y.toFixed(3)}] z[${box.min.z.toFixed(3)},${box.max.z.toFixed(3)}]`;
      expect(Math.abs(box.max.x - box.min.x - w), msg).toBeLessThanOrEqual(TOL);
      expect(Math.abs(box.max.y - box.min.y - d), msg).toBeLessThanOrEqual(TOL);
      expect(Math.abs(box.max.z - box.min.z - h), msg).toBeLessThanOrEqual(TOL);
      // centrado em planta e com a base em z = 0
      expect(Math.abs((box.max.x + box.min.x) / 2), msg).toBeLessThanOrEqual(TOL);
      expect(Math.abs((box.max.y + box.min.y) / 2), msg).toBeLessThanOrEqual(TOL);
      expect(Math.abs(box.min.z), msg).toBeLessThanOrEqual(0.02);
      for (const p of parts) {
        const pos = p.geometry.getAttribute('position');
        expect(Number.isFinite(pos.array[0]!)).toBe(true);
        expect(Number.isNaN(box.min.x)).toBe(false);
      }
    });
  }

  it('escala com o tamanho: sofá de 2 lugares é mais estreito que o de 3', () => {
    const a = partsBox(buildFurnitureParts('sofa', { w: 2.1, d: 0.9, h: 0.85 }));
    const b = partsBox(buildFurnitureParts('sofa', { w: 1.6, d: 0.9, h: 0.85 }));
    expect(a.max.x - a.min.x).toBeGreaterThan(b.max.x - b.min.x + 0.4);
  });

  it('poucas geometrias por móvel (uma por material)', () => {
    for (const spec of catalog.furniture) expect(buildFurnitureParts(spec.model, spec.size).length, spec.id).toBeLessThanOrEqual(14);
  });
});
