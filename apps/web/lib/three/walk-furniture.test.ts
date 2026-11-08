import { describe, expect, it } from 'vitest';
import { getCatalog } from '@chalecad/catalog';
import { furnitureFootprint } from '../project/furniture';
import { buildFurnitureWalkRects, moveWithCollision, WALK } from './walk';

const catalog = getCatalog();
const spec = (id: string) => catalog.furniture.find((f) => f.id === id)!;
const model = (item: string, level: string, pos: [number, number], rot: number) => ({ item, level, polygon: furnitureFootprint(spec(item), pos, rot) });
const passable = (item: string) => spec(item).collides === false;

describe('andar por dentro: móveis como obstáculos', () => {
  it('o jogador não atravessa o sofá (0° e 90°)', () => {
    for (const rot of [0, 90, 33]) {
      const rects = buildFurnitureWalkRects([model('furn_sofa_3', 'L0', [5, 5], rot)], 'L0', passable);
      expect(rects).toHaveLength(1);
      const end = moveWithCollision([5, 2], [0, 3], rects);
      // parou antes do centro: ainda do lado de onde veio
      expect(end[1]).toBeLessThan(5);
      expect(Math.hypot(end[0] - 5, end[1] - 5)).toBeGreaterThan(WALK.radius);
    }
  });

  it('tapete não conta, móvel de outro nível também não', () => {
    const rug = model('furn_rug', 'L0', [5, 5], 0);
    expect(buildFurnitureWalkRects([rug], 'L0', passable)).toHaveLength(0);
    expect(buildFurnitureWalkRects([model('furn_sofa_3', 'L1', [5, 5], 0)], 'L0', passable)).toHaveLength(0);
    const end = moveWithCollision([5, 2], [0, 3], buildFurnitureWalkRects([rug], 'L0', passable));
    expect(end[1]).toBeCloseTo(5, 1);
  });
});
