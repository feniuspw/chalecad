import { describe, expect, it } from 'vitest';
import type { HostWall, ResolvedOpening } from '@chalecad/engine';
import { buildWalkWalls, insidePolygon, levelFloorZ, moveWithCollision, polygonCentroid, walkStart, yawFromHeading, WALK, type WallRect } from './walk';
import { boxCorners, fitShadowFrustum } from './shadow';
import { captureScale, imageFileName } from './capture';

const wall = (id: string, from: [number, number], to: [number, number], extra: Partial<HostWall> = {}): HostWall =>
  ({ id, kind: 'exterior', level: 'L0', from, to, baseZ: 0, length: Math.hypot(to[0] - from[0], to[1] - from[1]), outline: [], thickness: 0.1, assemblyId: 'a', exteriorSide: null, loadBearing: true, ...extra }) as HostWall;
const door = (hostId: string, u0: number, u1: number, extra: Partial<ResolvedOpening> = {}): ResolvedOpening =>
  ({ id: `d-${hostId}`, hostId, hostKind: 'wall', type: 'door', u0, u1, v0: 0, v1: 2.1, valid: true, ...extra }) as ResolvedOpening;

// caixa 6 x 4 com a frente em y = 0
const box = [
  wall('ext-front', [0, 0], [6, 0], { exteriorSide: 'right' }),
  wall('ext-right', [6, 0], [6, 4], { exteriorSide: 'right' }),
  wall('ext-back', [6, 4], [0, 4], { exteriorSide: 'right' }),
  wall('ext-left', [0, 4], [0, 0], { exteriorSide: 'right' }),
];

describe('colisão', () => {
  const rects = buildWalkWalls(box, []);
  const inside = (p: [number, number]) => p[0] > 0 && p[0] < 6 && p[1] > 0 && p[1] < 4;

  it('não atravessa a parede de frente, mesmo com passo grande', () => {
    const p = moveWithCollision([3, 1], [0, -5], rects);
    expect(p[1]).toBeGreaterThanOrEqual(WALK.radius + 0.05 - 1e-6);
    expect(inside(p)).toBe(true);
  });

  it('não atravessa quando vem de fora', () => {
    const p = moveWithCollision([3, -1], [0, 5], rects);
    expect(p[1]).toBeLessThanOrEqual(-(WALK.radius + 0.05) + 1e-6);
  });

  it('desliza ao longo da parede em movimento diagonal', () => {
    const p = moveWithCollision([3, 0.4], [1, -1], rects);
    expect(p[0]).toBeGreaterThan(3.9);
    expect(p[1]).toBeGreaterThanOrEqual(0.3 - 1e-6);
  });

  it('nos cantos fica dentro', () => {
    const p = moveWithCollision([5.5, 3.5], [3, 3], rects);
    expect(inside(p)).toBe(true);
  });

  it('movimento livre não é alterado', () => {
    const p = moveWithCollision([3, 2], [0.5, 0.25], rects);
    expect(p[0]).toBeCloseTo(3.5, 9);
    expect(p[1]).toBeCloseTo(2.25, 9);
  });

  it('parede atravessada por quadro longo (300 m/s) continua barrada', () => {
    let p: [number, number] = [3, 2];
    for (let i = 0; i < 20; i++) p = moveWithCollision(p, [0, -3], rects);
    expect(inside(p)).toBe(true);
  });

  it('porta abre passagem; parede ao lado continua barrando', () => {
    const rs = buildWalkWalls(box, [door('ext-front', 2.55, 3.45)]);
    const through = moveWithCollision([3, 1], [0, -2], rs);
    expect(through[1]).toBeLessThan(-0.5);
    const beside = moveWithCollision([1, 1], [0, -2], rs);
    expect(beside[1]).toBeGreaterThan(0.2);
  });

  it('janela alta não abre passagem', () => {
    const rs = buildWalkWalls(box, [door('ext-front', 2, 3, { type: 'window', v0: 0.9 })]);
    expect(moveWithCollision([2.5, 1], [0, -2], rs)[1]).toBeGreaterThan(0.2);
  });

  it('só considera as paredes do nível', () => {
    const rs = buildWalkWalls([...box, wall('up', [0, 2], [6, 2], { level: 'L1' })], [], 'L0');
    expect(rs.length).toBe(4);
  });

  it('centro dentro da parede é expulso', () => {
    const r: WallRect[] = [{ from: [0, 0], to: [4, 0], half: 0.05 }];
    const p = moveWithCollision([2, 0.01], [0.001, 0], r);
    expect(Math.abs(p[1])).toBeGreaterThanOrEqual(WALK.radius + 0.05 - 1e-6);
  });
});

describe('ponto de partida', () => {
  const footprint: [number, number][] = [[0, 0], [6, 0], [6, 4], [0, 4]];
  const bbox = { min: [0, 0, 0] as [number, number, number], max: [6, 4, 3] as [number, number, number] };
  it('1 m para dentro da primeira porta de ext-front, olhando para dentro', () => {
    const s = walkStart({ walls: box, openings: [door('ext-front', 1, 2)], footprint, bbox });
    expect(s.fromDoor).toBe(true);
    expect(s.pos[0]).toBeCloseTo(1.5, 6);
    expect(s.pos[1]).toBeCloseTo(1, 6);
    expect(s.heading).toEqual([0, 1].map((v) => expect.closeTo(v, 6)));
  });
  it('funciona com a parede desenhada ao contrário', () => {
    const rev = [wall('ext-front', [6, 0], [0, 0]), ...box.slice(1)];
    const s = walkStart({ walls: rev, openings: [door('ext-front', 1, 2)], footprint, bbox });
    expect(s.pos[1]).toBeCloseTo(1, 6);
    expect(s.pos[0]).toBeCloseTo(4.5, 6);
  });
  it('sem porta: centro', () => {
    const s = walkStart({ walls: box, openings: [], footprint, bbox });
    expect(s.fromDoor).toBe(false);
    expect(s.pos).toEqual([3, 2]);
  });
  it('insidePolygon e yaw', () => {
    expect(insidePolygon([1, 1], footprint)).toBe(true);
    expect(insidePolygon([7, 1], footprint)).toBe(false);
    expect(yawFromHeading([0, 1])).toBeCloseTo(0, 9); // +y de planta = -z da cena
    expect(yawFromHeading([1, 0])).toBeCloseTo(-Math.PI / 2, 9);
  });
  it('cota do piso do nível', () => {
    expect(levelFloorZ([wall('a', [0, 0], [1, 0], { baseZ: 0.15 })], 'L0', 0)).toBe(0.15);
    expect(levelFloorZ([], 'L1', 2.7)).toBe(2.7);
  });
});

describe('frustum da sombra', () => {
  it('cobre todos os cantos com folga e near positivo', () => {
    const pts = boxCorners([-3, 0, -2], [3, 4, 2]);
    const f = fitShadowFrustum(pts, [0, 2, 0], [0.5, 1, 0.3], 1);
    expect(f.right - f.left).toBeGreaterThan(6);
    expect(f.top - f.bottom).toBeGreaterThan(4);
    expect(f.near).toBeGreaterThan(0);
    expect(f.far).toBeGreaterThan(f.near);
    expect(f.distance).toBeGreaterThan(0);
  });
  it('sol a pino não degenera', () => {
    const f = fitShadowFrustum(boxCorners([-1, 0, -1], [1, 2, 1]), [0, 1, 0], [0, 1, 0]);
    expect(Number.isFinite(f.left)).toBe(true);
    expect(f.right).toBeGreaterThan(f.left);
  });
});

describe('captura', () => {
  it('nome do arquivo', () => {
    expect(imageFileName('Chalé do Zé & Cia', new Date(2025, 0, 5, 9, 7))).toBe('chale-do-ze-cia-2025-01-05-09h07.png');
    expect(imageFileName('***', new Date(2025, 10, 15, 18, 30))).toBe('chale-2025-11-15-18h30.png');
  });
  it('escala: 2x, até 3840 px de largura', () => {
    expect(captureScale(1000, 600, 1)).toBe(2);
    expect(captureScale(1000, 600, 2)).toBeCloseTo(3.84, 6);
    expect(captureScale(3000, 800, 1)).toBeCloseTo(1.28, 6);
    expect(captureScale(5000, 800, 1)).toBe(1);
  });
});

describe('centroide', () => {
  it('retângulo e L', () => {
    expect(polygonCentroid([[0, 0], [4, 0], [4, 2], [0, 2]])).toEqual([2, 1]);
    const [x, y] = polygonCentroid([[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]]);
    expect(x).toBeCloseTo(5 / 6, 6);
    expect(y).toBeCloseTo(5 / 6, 6);
  });
});
