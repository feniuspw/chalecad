import { describe, expect, it } from 'vitest';
import { FurnitureModelKind, getCatalog } from '@chalecad/catalog';
import { furnitureSymbol, placeStrokes, strokePath } from './furnitureSymbols';

const catalog = getCatalog();

describe('símbolos da planta', () => {
  it('todo modelo do catálogo tem símbolo com traços dentro do contorno', () => {
    for (const kind of FurnitureModelKind.options) {
      const specs = catalog.furniture.filter((f) => f.model === kind);
      expect(specs.length, `catálogo sem item para ${kind}`).toBeGreaterThan(0);
      for (const s of specs) {
        const strokes = furnitureSymbol(kind, s.size);
        expect(strokes.length, kind).toBeGreaterThan(0);
        for (const st of strokes) {
          for (const [x, y] of st.pts) {
            expect(Math.abs(x), `${s.id} x`).toBeLessThanOrEqual(s.size.w / 2 + 1e-6);
            expect(Math.abs(y), `${s.id} y`).toBeLessThanOrEqual(s.size.d / 2 + 1e-6);
          }
        }
      }
    }
  });

  it('gira e translada para o referencial da planta', () => {
    const [outline] = placeStrokes(furnitureSymbol('rug', { w: 2, d: 1 }), [10, 5], 90);
    const xs = outline!.pts.map((p) => p[0]);
    const ys = outline!.pts.map((p) => p[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(2);
    expect((Math.max(...xs) + Math.min(...xs)) / 2).toBeCloseTo(10);
  });

  it('gera caminho SVG fechado', () => {
    const d = strokePath(furnitureSymbol('stove', { w: 0.55, d: 0.6 })[0]!, 100);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
  });
});
