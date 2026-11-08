import { describe, expect, it } from 'vitest';
import type { HostWall, ResolvedOpening, RoomModel, SlabModel, Vec2 } from '@chalecad/engine';
import { LINING_GAP, outlineTop, roomFloorZ, roomWallMesh } from './finishes';

const rect = (l: number, h: number): Vec2[] => [[0, 0], [l, 0], [l, h], [0, h]];
const wall = (id: string, from: Vec2, to: Vec2, extra: Partial<HostWall> = {}): HostWall => ({
  id, kind: 'interior', level: 'L0', from, to, baseZ: 0.1, length: Math.hypot(to[0] - from[0], to[1] - from[1]),
  outline: rect(Math.hypot(to[0] - from[0], to[1] - from[1]), 2.8), thickness: 0.1, assemblyId: 'x', exteriorSide: null, loadBearing: false, wet: false, ...extra,
});

// sala 4 x 3, anti-horária, paredes nos quatro lados (eixo)
const walls = [wall('a', [0, 0], [4, 0]), wall('b', [4, 0], [4, 3]), wall('c', [4, 3], [0, 3]), wall('d', [0, 3], [0, 0])];
const room: RoomModel = {
  id: 'r-1', level: 'L0', use: 'living', name: 'Sala',
  polygon: [[0, 0], [4, 0], [4, 3], [0, 3]],
  edges: walls.map((w) => ({ from: w.from, to: w.to, hostId: w.id })),
  area: 12, perimeter: 14, ceiling: { min: 2.5, avg: 2.5, max: 2.5 }, glazing: 0, openingIds: [], wet: false,
};

type P3 = [number, number, number];
const verts = (m: { positions: number[] }): P3[] => Array.from({ length: m.positions.length / 3 }, (_, i) => [m.positions[i * 3]!, m.positions[i * 3 + 1]!, m.positions[i * 3 + 2]!]);

describe('revestimento de parede do cômodo', () => {
  it('um painel por parede, recuado para dentro e limitado pelo teto', () => {
    const m = roomWallMesh(room, walls, []);
    expect(m.indices.length / 6).toBe(4);
    const v = verts(m);
    // parede 'a' (y = 0, interior em y > 0): face em y = espessura/2 + folga
    const a = v.slice(0, 4);
    for (const p of a) expect(p[1]).toBeCloseTo(0.05 + LINING_GAP);
    expect(Math.max(...v.map((p) => p[2]))).toBeCloseTo(0.1 + 2.5); // teto, não os 2,8 da parede
    expect(Math.min(...v.map((p) => p[2]))).toBeCloseTo(0.1);
    // parede 'b' (x = 4): interior em x < 4
    for (const p of v.slice(4, 8)) expect(p[0]).toBeCloseTo(4 - 0.05 - LINING_GAP);
  });

  it('recorta o vão de uma janela', () => {
    const win: ResolvedOpening = { id: 'o1', hostId: 'a', hostKind: 'wall', type: 'window', u0: 1, u1: 2, v0: 1, v1: 2.1, valid: true };
    const m = roomWallMesh(room, walls, [win]);
    // parede a: à esquerda (1 painel), na janela (abaixo + acima = 2), à direita (1) = 4 painéis; + 3 outras paredes
    expect(m.indices.length / 6).toBe(7);
    const v = verts(m);
    // nada de vértice dentro do vão (u 1..2, z entre 1,1 e 2,2) exceto na borda
    const inside = v.filter((p) => p[1] < 0.1 && p[0] > 1.001 && p[0] < 1.999 && p[2] > 0.1 + 1.001 && p[2] < 0.1 + 2.099);
    expect(inside).toHaveLength(0);
  });

  it('vão de porta (v0 = 0) deixa só a verga acima', () => {
    const door: ResolvedOpening = { id: 'o2', hostId: 'a', hostKind: 'wall', type: 'door', u0: 1, u1: 1.9, v0: 0, v1: 2.1, valid: true };
    const m = roomWallMesh(room, walls, [door]);
    expect(m.indices.length / 6).toBe(3 + 3); // a: esquerda, verga, direita; mais as paredes b, c, d
  });

  it('ignora trechos sem parede e acompanha o topo da empena', () => {
    const open: RoomModel = { ...room, edges: room.edges.map((e, i) => (i === 0 ? { ...e, hostId: null } : e)) };
    expect(roomWallMesh(open, walls, []).indices.length / 6).toBe(3);
    const gable = wall('b', [4, 0], [4, 3], { outline: [[0, 0], [3, 0], [3, 2], [1.5, 4], [0, 2]] });
    const tall: RoomModel = { ...room, ceiling: { min: 2.5, avg: 3, max: 9 } };
    const m = roomWallMesh({ ...tall, edges: [{ from: [4, 0], to: [4, 3], hostId: 'b' }] }, [gable], []);
    const zs = verts(m).map((p) => p[2] - 0.1);
    expect(Math.max(...zs)).toBeCloseTo(4);
    expect(outlineTop(gable.outline, 0)).toBeCloseTo(2);
    expect(outlineTop(gable.outline, 1.5)).toBeCloseTo(4);
    expect(outlineTop(gable.outline, 5)).toBeNull();
  });

  it('contorno em sentido horário também fica voltado para dentro', () => {
    const cw: RoomModel = {
      ...room,
      polygon: [...room.polygon!].reverse(),
      edges: [...room.edges].reverse().map((e) => ({ from: e.to, to: e.from, hostId: e.hostId })),
    };
    const m = roomWallMesh(cw, walls, []);
    for (const p of verts(m).filter((q) => q[1] < 0.2 && q[0] > 0.2 && q[0] < 3.8)) expect(p[1]).toBeCloseTo(0.05 + LINING_GAP);
  });

  it('sem polígono não gera nada', () => {
    expect(roomWallMesh({ ...room, polygon: null }, walls, []).positions).toHaveLength(0);
  });
});

describe('cota do piso', () => {
  it('usa a base das paredes; senão laje do nível; senão radier', () => {
    const slabs: SlabModel[] = [
      { id: 'slab-r', kind: 'radier', level: null, polygon: [], topZ: 0.12, thickness: 0.12, area: 1 },
      { id: 'slab-L1', kind: 'mezzanine', level: 'L1', polygon: [], topZ: 2.7, thickness: 0.2, area: 1 },
    ];
    expect(roomFloorZ(room, walls, slabs)).toBe(0.1);
    expect(roomFloorZ({ ...room, level: 'L1', edges: [] }, walls, slabs)).toBe(2.7);
    expect(roomFloorZ({ ...room, level: 'L0', edges: [] }, walls, slabs)).toBe(0.12);
  });
});

describe('revestimento de cômodo do mezanino', () => {
  it('sobre parede externa que nasce no térreo, começa no piso do mezanino', () => {
    const ext = { id: 'e', kind: 'exterior', level: 'L0', from: [0, 4] as Vec2, to: [4, 4] as Vec2, length: 4, baseZ: 0, thickness: 0.12, outline: [[0, 0], [4, 0], [4, 5], [0, 5]] as Vec2[], assemblyId: 'x' } as unknown as HostWall;
    const room = { id: 'r', level: 'L1', polygon: [[0, 2], [4, 2], [4, 4], [0, 4]], edges: [{ from: [4, 4], to: [0, 4], hostId: 'e' }], ceiling: { min: 2, max: 2.2, avg: 2.1 } } as unknown as RoomModel;
    const slabs = [{ level: 'L1', kind: 'mezzanine', topZ: 2.8 }] as unknown as SlabModel[];
    const floor = roomFloorZ(room, [ext], slabs);
    expect(floor).toBe(2.8);
    const m = roomWallMesh(room, [ext], [], floor);
    const zs = m.positions.filter((_, i) => i % 3 === 2);
    expect(Math.min(...zs)).toBeCloseTo(2.8, 6);
    expect(Math.max(...zs)).toBeCloseTo(5, 6);
  });
});
