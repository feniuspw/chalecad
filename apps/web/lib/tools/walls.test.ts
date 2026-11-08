import { describe, expect, it } from 'vitest';
import type { Wall } from '@chalecad/engine';
import { applyWallChanges, findJoinPartner, hasTooShort, interiorPoint, joinWalls, moveWallEnd, moveWallParallel, nearestParallel, rectWalls, splitWall, uncoveredParts, type WallDraft } from './walls';

const W = (id: string, from: [number, number], to: [number, number], extra: Partial<Wall> = {}): Wall => ({ id, level: 'L0', from, to, ...extra });
const len = (s: { from: number[]; to: number[] }) => Math.hypot(s.to[0]! - s.from[0]!, s.to[1]! - s.from[1]!);

describe('rectWalls', () => {
  it('gera 4 paredes ligadas em anel', () => {
    const r = rectWalls([], [1, 1], [4, 5]);
    expect(r).toHaveLength(4);
    for (let i = 0; i < 4; i++) expect(r[i]!.to).toEqual(r[(i + 1) % 4]!.from);
    expect(r.map(len)).toEqual([3, 4, 3, 4]);
  });
  it('aceita os cantos em qualquer ordem', () => {
    const r = rectWalls([], [4, 5], [1, 1]);
    expect(r).toHaveLength(4);
    expect(r[0]!.from).toEqual([1, 1]);
  });
  it('não duplica parede já existente no mesmo trecho', () => {
    const r = rectWalls([{ id: 'x', from: [1, 1], to: [4, 1] }], [1, 1], [4, 5]);
    expect(r).toHaveLength(3);
    expect(r.some((s) => s.from[1] === 1 && s.to[1] === 1)).toBe(false);
  });
  it('existente em sentido contrário e mais longa também cobre', () => {
    const r = rectWalls([{ from: [10, 5], to: [-2, 5] }], [1, 1], [4, 5]);
    expect(r).toHaveLength(3);
  });
  it('cobertura parcial gera só o trecho que falta', () => {
    const r = rectWalls([{ from: [1, 1], to: [2, 1] }], [1, 1], [4, 5]);
    const bottom = r.filter((s) => s.from[1] === 1 && s.to[1] === 1);
    expect(bottom).toEqual([{ from: [2, 1], to: [4, 1] }]);
  });
  it('três lados cobertos deixam só um', () => {
    const ex = [
      { from: [0, 0], to: [6, 0] },
      { from: [6, 0], to: [6, 4] },
      { from: [6, 4], to: [0, 4] },
    ] as { from: [number, number]; to: [number, number] }[];
    const r = rectWalls(ex, [0, 0], [6, 4]);
    expect(r).toEqual([{ from: [0, 4], to: [0, 0] }]);
  });
  it('retângulo todo coberto não gera nada; lado pequeno demais também não', () => {
    expect(rectWalls([{ from: [0, 0], to: [3, 0] }, { from: [3, 0], to: [3, 3] }, { from: [3, 3], to: [0, 3] }, { from: [0, 3], to: [0, 0] }], [0, 0], [3, 3])).toEqual([]);
    expect(rectWalls([], [0, 0], [0.2, 3])).toEqual([]);
  });
  it('parede não colinear não interfere', () => {
    expect(rectWalls([{ from: [1, 1.5], to: [4, 1.5] }], [1, 1], [4, 5])).toHaveLength(4);
  });
});

describe('uncoveredParts', () => {
  it('descarta lacunas menores que 10 cm', () => {
    expect(uncoveredParts([0, 0], [3, 0], [{ from: [0, 0], to: [2.95, 0] }])).toEqual([]);
  });
});

describe('nearestParallel', () => {
  const segs = [
    { id: 'p1', from: [0, 3] as [number, number], to: [6, 3] as [number, number] },
    { id: 'p2', from: [0, 8] as [number, number], to: [6, 8] as [number, number] },
    { id: 'perp', from: [2, 0] as [number, number], to: [2, 5] as [number, number] },
  ];
  it('acha a paralela mais próxima', () => {
    const g = nearestParallel([1, 1], [4, 1], segs)!;
    expect(g.segmentId).toBe('p1');
    expect(g.distance).toBeCloseTo(2, 9);
    expect(g.to[1]).toBeCloseTo(3, 9);
  });
  it('ignora paralela sem sobreposição e a coincidente', () => {
    expect(nearestParallel([10, 1], [12, 1], segs)).toBeNull();
    expect(nearestParallel([1, 3], [4, 3], [segs[0]!])).toBeNull();
  });
});

describe('moveWallEnd', () => {
  const walls = [W('a', [0, 0], [4, 0]), W('b', [4, 0], [4, 3]), W('c', [4, 3], [0, 3]), W('far', [10, 10], [12, 10]), W('up', [4, 0], [4, 9], { level: 'L1' })];
  it('as paredes ligadas acompanham a ponta', () => {
    const ch = moveWallEnd(walls, 'a', 'to', [5, 0.5]);
    expect(ch.map((c) => c.id).sort()).toEqual(['a', 'b']);
    expect(ch.find((c) => c.id === 'a')!.to).toEqual([5, 0.5]);
    expect(ch.find((c) => c.id === 'b')!.from).toEqual([5, 0.5]);
    expect(ch.find((c) => c.id === 'b')!.to).toEqual([4, 3]);
  });
  it('não mexe em outro nível nem em paredes soltas; nada a fazer se não mudou', () => {
    expect(moveWallEnd(walls, 'a', 'to', [4, 0])).toEqual([]);
    expect(moveWallEnd(walls, 'far', 'from', [9, 10]).map((c) => c.id)).toEqual(['far']);
  });
  it('aplica no rascunho', () => {
    const draft = { walls: structuredClone(walls) };
    applyWallChanges(draft, moveWallEnd(walls, 'a', 'to', [5, 0.5]));
    expect(draft.walls[1]!.from).toEqual([5, 0.5]);
  });
  it('detecta parede curta demais', () => {
    expect(hasTooShort(moveWallEnd(walls, 'a', 'to', [0.05, 0]))).toBe(true);
    expect(hasTooShort(moveWallEnd(walls, 'a', 'to', [5, 0]))).toBe(false);
  });
});

describe('moveWallParallel', () => {
  it('desloca e as vizinhas esticam (ortogonais)', () => {
    const walls = [W('a', [0, 0], [4, 0]), W('b', [4, 0], [4, 3]), W('c', [4, 3], [0, 3]), W('d', [0, 3], [0, 0])];
    // normal à direita de a (0,0)->(4,0) é (0,-1): offset -1 sobe 1 m
    const ch = moveWallParallel(walls, 'a', -1);
    const a = ch.find((c) => c.id === 'a')!;
    expect(a.from).toEqual([0, 1]);
    expect(a.to).toEqual([4, 1]);
    expect(ch.find((c) => c.id === 'b')!.from).toEqual([4, 1]);
    expect(ch.find((c) => c.id === 'd')!.to).toEqual([0, 1]);
    expect(ch.find((c) => c.id === 'b')!.to).toEqual([4, 3]);
  });
  it('parede em T (ponta no meio) estica até a nova posição', () => {
    const walls = [W('m', [0, 0], [6, 0]), W('t', [3, 0], [3, 4])];
    const ch = moveWallParallel(walls, 'm', -2);
    expect(ch.find((c) => c.id === 't')!.from).toEqual([3, 2]);
  });
  it('vizinha oblíqua desliza pelo próprio eixo', () => {
    const walls = [W('a', [0, 0], [4, 0]), W('o', [4, 0], [6, 2])];
    const ch = moveWallParallel(walls, 'a', -1);
    const o = ch.find((c) => c.id === 'o')!;
    expect(o.from[1]).toBeCloseTo(1, 9);
    expect(o.from[0]).toBeCloseTo(5, 9);
    expect(o.to).toEqual([6, 2]);
  });
  it('sem deslocamento, sem mudança', () => {
    expect(moveWallParallel([W('a', [0, 0], [4, 0])], 'a', 0)).toEqual([]);
  });
});

const draftOf = (walls: Wall[], openings: WallDraft['openings'] = []): WallDraft => ({ walls: structuredClone(walls), openings: structuredClone(openings) });

describe('splitWall', () => {
  it('divide em dois trechos que se tocam, copiando propriedades', () => {
    const d = draftOf([W('a', [0, 0], [6, 0], { wet: true, assembly: 'x' })]);
    expect(splitWall(d, 'a', [2.01, 0.2], 'b')).toEqual({ ok: true });
    expect(d.walls).toHaveLength(2);
    expect(d.walls[0]!.to).toEqual([2.01, 0]);
    expect(d.walls[1]).toMatchObject({ id: 'b', from: [2.01, 0], to: [6, 0], wet: true, assembly: 'x' });
  });
  it('reparte as aberturas e recusa cortar uma', () => {
    const ops = [
      { id: 'o1', host: 'a', offset: 0.5, width: 1 },
      { id: 'o2', host: 'a', offset: 4, width: 1 },
    ];
    const d = draftOf([W('a', [0, 0], [6, 0])], ops);
    expect(splitWall(d, 'a', [3, 0], 'b').ok).toBe(true);
    expect(d.openings.find((o) => o.id === 'o1')).toMatchObject({ host: 'a', offset: 0.5 });
    expect(d.openings.find((o) => o.id === 'o2')).toMatchObject({ host: 'b', offset: 1 });
    const d2 = draftOf([W('a', [0, 0], [6, 0])], ops);
    expect(splitWall(d2, 'a', [1, 0], 'b').ok).toBe(false);
    expect(d2.walls).toHaveLength(1);
  });
  it('recusa trecho menor que 10 cm', () => {
    expect(splitWall(draftOf([W('a', [0, 0], [6, 0])]), 'a', [0.05, 0], 'b').ok).toBe(false);
  });
});

describe('joinWalls', () => {
  it('une colineares e leva as aberturas com o deslocamento', () => {
    const d = draftOf([W('a', [0, 0], [3, 0]), W('b', [3, 0], [7, 0])], [{ id: 'o', host: 'b', offset: 1, width: 1 }]);
    expect(joinWalls(d, 'a', 'b')).toEqual({ ok: true });
    expect(d.walls).toHaveLength(1);
    expect(d.walls[0]).toMatchObject({ id: 'a', from: [0, 0], to: [7, 0] });
    expect(d.openings[0]).toMatchObject({ host: 'a', offset: 4 });
  });
  it('funciona na ordem inversa', () => {
    const d = draftOf([W('a', [3, 0], [7, 0]), W('b', [0, 0], [3, 0])]);
    expect(joinWalls(d, 'a', 'b').ok).toBe(true);
    expect(d.walls[0]).toMatchObject({ id: 'b', from: [0, 0], to: [7, 0] });
  });
  it('recusa não colineares, desencontradas, propriedades diferentes', () => {
    expect(joinWalls(draftOf([W('a', [0, 0], [3, 0]), W('b', [3, 0], [3, 4])]), 'a', 'b').ok).toBe(false);
    expect(joinWalls(draftOf([W('a', [0, 0], [3, 0]), W('b', [4, 0], [7, 0])]), 'a', 'b').ok).toBe(false);
    expect(joinWalls(draftOf([W('a', [0, 0], [3, 0]), W('b', [3, 0], [7, 0], { wet: true })]), 'a', 'b').ok).toBe(false);
    expect(joinWalls(draftOf([W('a', [0, 0], [3, 0]), W('b', [3, 0], [7, 0], { level: 'L1' })]), 'a', 'b').ok).toBe(false);
  });
  it('dividir e juntar de volta restaura a parede', () => {
    const d = draftOf([W('a', [0, 0], [6, 0])]);
    splitWall(d, 'a', [2, 0], 'b');
    joinWalls(d, 'a', 'b');
    expect(d.walls).toEqual([W('a', [0, 0], [6, 0])]);
  });
  it('acha a parceira para juntar', () => {
    const d = draftOf([W('a', [0, 0], [3, 0]), W('x', [3, 0], [3, 4]), W('b', [3, 0], [7, 0])]);
    expect(findJoinPartner(d, 'a')).toBe('b');
    expect(findJoinPartner(d, 'x')).toBeNull();
  });
});

describe('interiorPoint', () => {
  it('centroide de retângulo', () => {
    expect(interiorPoint([[0, 0], [4, 0], [4, 2], [0, 2]])).toEqual([2, 1]);
  });
  it('polígono em L com centroide fora cai dentro', () => {
    const L: [number, number][] = [[0, 0], [10, 0], [10, 1], [1, 1], [1, 10], [0, 10]];
    const p = interiorPoint(L);
    const inside = (q: [number, number]) => (q[0] >= 0 && q[0] <= 10 && q[1] >= 0 && q[1] <= 1) || (q[0] >= 0 && q[0] <= 1 && q[1] >= 0 && q[1] <= 10);
    expect(inside(p)).toBe(true);
  });
});
