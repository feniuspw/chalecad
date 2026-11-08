import { describe, expect, it } from 'vitest';
import { computeAll, type Project } from '@chalecad/engine';
import { getCatalog } from '@chalecad/catalog';
import { createProject } from './templates';
import { addExtra, duplicateExtra, extraLabel, extraSummary, patchExtra, towerSpot } from './extras';
import { DEFAULT_ANSWERS } from './wizard/answers';
import { generateProject } from './wizard/generate';

const catalog = getCatalog();
const withoutTower = (p: Project): Project => ({ ...structuredClone(p), extras: p.extras.filter((e) => e.kind !== 'water_tower') });
const poly = (p: Project, id: string) => computeAll(p, catalog).model.rooms.find((r) => r.id === id)!.polygon!;
const inside = (pt: [number, number], pg: [number, number][]) => {
  let c = false;
  for (let i = 0, j = pg.length - 1; i < pg.length; j = i++) if (pg[i]![1] > pt[1] !== pg[j]![1] > pt[1] && pt[0] < ((pg[j]![0] - pg[i]![0]) * (pt[1] - pg[i]![1])) / (pg[j]![1] - pg[i]![1]) + pg[i]![0]) c = !c;
  return c;
};

describe('torre da caixa d\'água: adicionar no editor', () => {
  it('posiciona sobre o banheiro do mezanino, com a caixa a piso + 2,1 + 1,2 m', () => {
    const base = withoutTower(generateProject({ ...DEFAULT_ANSWERS, style: 'gable', bedrooms: 2, mezzanine: 'sleep', bathUp: true }).project);
    const draft = structuredClone(base);
    const id = addExtra(draft, 'water_tower');
    const tower = draft.extras.find((e) => e.id === id)!;
    expect(tower.kind).toBe('water_tower');
    if (tower.kind !== 'water_tower') return;
    const up = draft.rooms.find((r) => r.use === 'bathroom' && r.level === 'L1')!;
    expect(inside(tower.position as [number, number], poly(draft, up.id) as [number, number][])).toBe(true);
    const l1 = draft.levels.find((l) => l.id === 'L1')!;
    expect(tower.platformZ).toBeCloseTo(l1.elevation + 3.3, 2);
    expect([tower.width, tower.depth, tower.roof]).toEqual([1.6, 1.6, 'gable']);
  });

  it('sem banheiro no mezanino usa o do térreo; sem banheiro nenhum, o centro da planta', () => {
    const ground = withoutTower(generateProject({ ...DEFAULT_ANSWERS, style: 'modern', bedrooms: 1 }).project);
    const spot = towerSpot(ground);
    const bath = ground.rooms.find((r) => r.use === 'bathroom')!;
    expect(spot.roomId).toBe(bath.id);
    expect(inside(spot.position as [number, number], poly(ground, bath.id) as [number, number][])).toBe(true);
    expect(spot.platformZ).toBeCloseTo(3.3, 2);

    const bare = createProject('gable_mezzanine', { width: 6, depth: 8, mezzanine: false });
    const center = towerSpot(bare);
    expect(center.roomId).toBeNull();
    expect(center.position).toEqual([3, 4]);
  });

  it('o motor devolve a torre com paredes, 4 postes, telhado e caixa; o resumo e a duplicação funcionam', () => {
    const p = generateProject({ ...DEFAULT_ANSWERS, style: 'gable', bedrooms: 2, mezzanine: 'sleep', bathUp: true }).project;
    const m = computeAll(p, catalog).model.extras.find((x) => x.kind === 'water_tower')!;
    expect(m.segments).toHaveLength(4);
    expect(m.posts).toHaveLength(4);
    expect(m.roofs?.length).toBeGreaterThanOrEqual(1);
    expect(m.tank?.baseZ).toBeCloseTo((p.extras.find((e) => e.kind === 'water_tower') as { platformZ: number }).platformZ, 5);
    const draft = structuredClone(p);
    const t = draft.extras.find((e) => e.kind === 'water_tower')!;
    expect(extraLabel(draft, t.id)).toBe("Torre da caixa d'água");
    patchExtra(draft, t.id, { platformZ: 6, roof: 'shed' });
    expect(extraSummary(draft.extras.find((e) => e.id === t.id)!).detail).toMatch(/caixa a 6/);
    const copy = duplicateExtra(draft, t.id)!;
    expect(draft.extras.find((e) => e.id === copy)).toBeDefined();
  });
});
