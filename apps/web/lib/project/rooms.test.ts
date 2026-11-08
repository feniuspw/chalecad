import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { getCatalog } from '@chalecad/catalog';
import { loadProject, type Project } from '@chalecad/engine';
import { patchTypology, reconcileProject, switchTypology } from './edit';
import { planBounds } from './geometry';
import { createProject } from './templates';
import { addRoom, finishName, finishOptions, finishPrice, patchRoom, reconcileRooms, removeRoom, roomAtPoint, roomDisplayName, setFinish, suggestedFinish } from './rooms';

const base = () => createProject('gable_mezzanine');
const L0 = (p: Project) => p.levels[0]!.id;
const ok = (p: Project) => {
  const r = loadProject(p);
  expect(r.ok ? [] : r.issues).toEqual([]);
};

describe('criar, editar e remover cômodos', () => {
  it('cria com ID r-xxxxxxxx e sugestão por uso', () => {
    const p = produce(base(), (d) => {
      addRoom(d, L0(d), [1.234567, 2], 'bathroom');
    });
    const r = p.rooms[0]!;
    expect(r.id).toMatch(/^r-[0-9a-f]{8}$/);
    expect(r.seed).toEqual([1.235, 2]);
    expect(r.floor).toBe('finish_floor_ceramic');
    expect(r.walls).toBe('finish_wall_tile');
    ok(p);
  });

  it('sugestões por uso', () => {
    expect(suggestedFinish('kitchen')).toEqual({ floor: 'finish_floor_porcelain', walls: 'finish_wall_paint' });
    expect(suggestedFinish('living')).toEqual({ floor: 'finish_floor_porcelain', walls: 'finish_wall_paint' });
    expect(suggestedFinish('bedroom')).toEqual({ floor: 'finish_floor_vinyl', walls: 'finish_wall_paint' });
    expect(suggestedFinish('storage')).toEqual({});
    const p = produce(base(), (d) => {
      addRoom(d, L0(d), [1, 1], 'other');
    });
    expect(p.rooms[0]!.floor).toBeUndefined();
  });

  it('patchRoom edita e limpa campos', () => {
    let id = '';
    const p0 = produce(base(), (d) => {
      id = addRoom(d, L0(d), [1, 1], 'bedroom');
    });
    const p1 = produce(p0, (d) => {
      patchRoom(d, id, { use: 'living', name: '  Suíte  ', floor: 'finish_floor_wood', walls: undefined });
    });
    const r = p1.rooms[0]!;
    expect(r).toMatchObject({ use: 'living', name: 'Suíte', floor: 'finish_floor_wood' });
    expect(r.walls).toBeUndefined();
    const p2 = produce(p1, (d) => {
      patchRoom(d, id, { name: '' });
    });
    expect(p2.rooms[0]!.name).toBeUndefined();
    expect(roomDisplayName(p2, p2.rooms[0]!)).toBe('Sala');
    ok(p2);
  });

  it('numera cômodos do mesmo uso e remove', () => {
    let a = '';
    const p = produce(base(), (d) => {
      a = addRoom(d, L0(d), [1, 1], 'bedroom');
      addRoom(d, L0(d), [2, 2], 'bedroom');
    });
    expect(roomDisplayName(p, p.rooms[1]!)).toBe('Quarto 2');
    const q = produce(p, (d) => {
      expect(removeRoom(d, a)).toBe(true);
      expect(removeRoom(d, 'nao-existe')).toBe(false);
    });
    expect(q.rooms).toHaveLength(1);
  });

  it('setFinish grava e limpa acabamentos gerais', () => {
    const p = produce(base(), (d) => {
      setFinish(d, 'facade', 'finish_facade_wood');
      setFinish(d, 'roofColor', 'terracotta');
    });
    expect(p.finishes).toMatchObject({ facade: 'finish_facade_wood', roofColor: 'terracotta' });
    const q = produce(p, (d) => {
      setFinish(d, 'facade', undefined);
    });
    expect(q.finishes.facade).toBeUndefined();
    ok(p);
  });
});

describe('reconcile', () => {
  it('mantém o seed dentro de planBounds ao reduzir o chalé', () => {
    const p0 = produce(base(), (d) => {
      addRoom(d, L0(d), [5.5, 4.5], 'living');
    });
    const p1 = produce(p0, (d) => {
      patchTypology(d, { width: 4, depth: 4 });
    });
    const b = planBounds(p1.typology);
    const [x, y] = p1.rooms[0]!.seed;
    expect(x).toBeLessThanOrEqual(b.x1);
    expect(y).toBeLessThanOrEqual(b.y1);
    expect(x).toBeGreaterThanOrEqual(b.x0);
    ok(p1);
  });

  it('remove cômodo de nível que sumiu', () => {
    const p0 = base();
    const upper = p0.levels.find((l) => l.elevation > 0);
    expect(upper).toBeTruthy();
    const p1 = produce(p0, (d) => {
      addRoom(d, upper!.id, [1, 1], 'bedroom');
      addRoom(d, L0(d), [1, 1], 'living');
    });
    const p2 = produce(p1, (d) => {
      switchTypology(d, 'flat_roof');
      reconcileProject(d);
    });
    expect(p2.rooms.map((r) => r.use)).toEqual(['living']);
    const p3 = produce(p2, (d) => {
      expect(reconcileRooms(d)).toBe(0);
    });
    expect(p3.rooms).toHaveLength(1);
  });
});

describe('catálogo de acabamentos', () => {
  it('lista por prefixo com preço da base', () => {
    const p = base();
    const floors = finishOptions(p, 'finish_floor_');
    expect(floors.map((f) => f.id)).toContain('finish_floor_porcelain');
    expect(floors.every((f) => f.price !== null)).toBe(true);
    expect(finishOptions(p, 'finish_ceiling_')).toHaveLength(2);
    expect(finishName('finish_floor_wood')).toContain('madeira');
  });

  it('preço editado no projeto vence a base', () => {
    const p = produce(base(), (d) => {
      d.priceOverrides[getCatalog().materials.find((m) => m.id === 'finish_floor_wood')!.priceItemId] = { price: 1, date: '2026-11-01', source: 'teste' };
    });
    expect(finishPrice(p, 'finish_floor_wood')).toBe(1);
    expect(finishPrice(p, 'nao_existe')).toBeNull();
  });
});

describe('roomAtPoint', () => {
  it('acha o cômodo do nível que contém o ponto', () => {
    const sq = (x: number): [number, number][] => [[x, 0], [x + 2, 0], [x + 2, 2], [x, 2]];
    const rooms = [
      { id: 'a', level: 'L0', polygon: sq(0) },
      { id: 'b', level: 'L0', polygon: sq(3) },
      { id: 'c', level: 'L1', polygon: sq(0) },
      { id: 'd', level: 'L0', polygon: null },
    ];
    expect(roomAtPoint(rooms, 'L0', [4, 1])?.id).toBe('b');
    expect(roomAtPoint(rooms, 'L1', [1, 1])?.id).toBe('c');
    expect(roomAtPoint(rooms, 'L0', [2.5, 1])).toBeUndefined();
  });
});
