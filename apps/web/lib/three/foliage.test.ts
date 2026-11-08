// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { distToPolyline, distToRect, FOLIAGE_COUNTS, scatter, scenarioSprites, SCENARIO_IDS, SCENARIOS, SPRITES, type ScatterOptions } from './foliage';

const clear = { minX: -4, minY: -4, maxX: 10, maxY: 12 }; // casa 6 x 8 + 4 m de folga
const path: [number, number][] = [];
for (let s = 0; s <= 40; s += 1) path.push([3 + Math.sin(s * 0.2) * 1.2, -s]); // da porta (y = 0) para -y
const base: ScatterOptions = { seed: 'chale-a', scenario: 'field', clear, path, pathHalfWidth: 0.8, counts: FOLIAGE_COUNTS.light, radius: 60, farRadius: 200 };

describe('distribuição da vegetação', () => {
  it('é determinística pela semente e muda com outra semente', () => {
    const a = scatter(base);
    const b = scatter(base);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(50);
    const c = scatter({ ...base, seed: 'chale-b' });
    expect(c).not.toEqual(a);
  });

  it('nada cresce dentro da folga de 4 m em volta da casa', () => {
    for (const scenario of ['field', 'mountain', 'beach'] as const) {
      const list = scatter({ ...base, scenario });
      expect(list.filter((p) => !p.far).every((p) => distToRect(clear, p.x, p.y) > 0), scenario).toBe(true);
    }
  });

  it('nada cresce em cima do caminho da porta', () => {
    const list = scatter({ ...base, counts: FOLIAGE_COUNTS.high });
    const near = list.filter((p) => !p.far);
    expect(near.length).toBeGreaterThan(300);
    for (const p of near) expect(distToPolyline(path, p.x, p.y), p.sprite).toBeGreaterThan(0.8);
    // e deixa um corredor livre além da largura do caminho
    expect(near.filter((p) => SPRITES[p.sprite].kind === 'tree').every((p) => distToPolyline(path, p.x, p.y) > 3)).toBe(true);
  });

  it('árvores longe, capim perto das bordas; árvores distantes além do raio próximo', () => {
    const list = scatter({ ...base, counts: FOLIAGE_COUNTS.high });
    const trees = list.filter((p) => !p.far && SPRITES[p.sprite].kind === 'tree');
    const grass = list.filter((p) => SPRITES[p.sprite].kind === 'grass');
    const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
    expect(mean(trees.map((p) => distToRect(clear, p.x, p.y)))).toBeGreaterThan(mean(grass.map((p) => distToRect(clear, p.x, p.y))));
    const cx = 3, cy = 4;
    for (const p of list.filter((q) => q.far)) expect(Math.hypot(p.x - cx, p.y - cy)).toBeGreaterThanOrEqual(59);
  });

  it('respeita o limite por qualidade e o espaçamento mínimo das árvores', () => {
    const high = scatter({ ...base, counts: FOLIAGE_COUNTS.high });
    const light = scatter(base);
    expect(high.length).toBeGreaterThan(light.length);
    expect(light.filter((p) => !p.far && SPRITES[p.sprite].kind === 'tree').length).toBeLessThanOrEqual(FOLIAGE_COUNTS.light.trees);
    const t = high.filter((p) => !p.far && SPRITES[p.sprite].kind === 'tree');
    for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) expect(Math.hypot(t[i]!.x - t[j]!.x, t[i]!.y - t[j]!.y)).toBeGreaterThanOrEqual(10.99);
  });

  it('sem cenário não distribui nada', () => {
    expect(scatter({ ...base, scenario: 'none' })).toEqual([]);
  });
});

describe('cenários', () => {
  it('a troca de cenário muda o conjunto de sprites', () => {
    const sets = Object.fromEntries(SCENARIO_IDS.map((id) => [id, scenarioSprites(id)]));
    expect(sets.field).toContain('tree_round');
    expect(sets.field).not.toContain('tree_araucaria');
    expect(sets.mountain).toContain('tree_araucaria');
    expect(sets.mountain).toContain('tree_conifer');
    expect(sets.beach).toContain('tree_palm');
    expect(sets.beach).not.toContain('tree_conifer');
    expect(sets.none).toEqual([]);
    expect(new Set([sets.field!.join(), sets.mountain!.join(), sets.beach!.join()]).size).toBe(3);
  });

  it('as plantas colocadas só usam sprites do cenário', () => {
    for (const scenario of ['field', 'mountain', 'beach'] as const) {
      const allowed = new Set(scenarioSprites(scenario));
      expect(scatter({ ...base, scenario }).every((p) => allowed.has(p.sprite)), scenario).toBe(true);
    }
  });

  it('serra tem morros mais altos que o campo; praia tem mar e areia', () => {
    expect(SCENARIOS.mountain.hills.far[1]).toBeGreaterThan(SCENARIOS.field.hills.far[1]);
    expect(SCENARIOS.beach.sea).toBe(true);
    expect(SCENARIOS.beach.ground.texture).toBe('sand');
    expect(SCENARIOS.field.ground.texture).toBe('grass');
  });

  it('todo sprite tem tamanho de canvas coerente com a proporção', () => {
    for (const s of Object.values(SPRITES)) expect(s.canvas[0] / s.canvas[1], s.id).toBeCloseTo(s.aspect, 1);
  });
});
