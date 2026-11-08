import { describe, expect, it } from 'vitest';
import type { HostWall, ResolvedStair } from '@chalecad/engine';
import { buildSlabRailRects, buildStairWalkRects, cutSegmentNear, moveWithCollision, onStairFootprint, stairEdges, stairHeightAt, type V2 } from './walk';

const RISER = 0.18;
const GOING = 0.25;
const W = 0.9;
const TH = 0.04;

/** Escada reta rotação 0 (sobe em +y), pé em (0,0): mesma conta de `buildStair` do motor. */
function straight(n = 15): ResolvedStair {
  const treads: ResolvedStair['treads'] = [];
  for (let i = 1; i <= n - 1; i++) treads.push({ center: [W / 2, (i - 0.5) * GOING, i * RISER - TH / 2], size: [W, GOING, TH], rotationZDeg: 0 });
  const run = (n - 1) * GOING;
  return { id: 's', type: 'straight', treads, steps: n, riser: RISER, going: GOING, blondel: 0, footprint: [[0, 0], [W, 0], [W, run], [0, run]] };
}

/** Escada em L virando à direita, rotação 0, 16 espelhos: lance 1 em +y, patamar, lance 2 em +x. */
function lShape(n = 16): ResolvedStair {
  const m = Math.floor(n / 2);
  const run1 = (m - 1) * GOING;
  const run2 = (n - 1 - m) * GOING;
  const treads: ResolvedStair['treads'] = [];
  for (let i = 1; i < m; i++) treads.push({ center: [W / 2, (i - 0.5) * GOING, i * RISER - TH / 2], size: [W, GOING, TH], rotationZDeg: 0 });
  treads.push({ center: [W / 2, run1 + W / 2, m * RISER - TH / 2], size: [W, W, TH], rotationZDeg: 0 });
  for (let j = 1; j <= n - 1 - m; j++) treads.push({ center: [W + (j - 0.5) * GOING, run1 + W / 2, (m + j) * RISER - TH / 2], size: [W, GOING, TH], rotationZDeg: -90 });
  const pts: V2[] = [[0, 0], [W, 0], [W, run1], [W + run2, run1], [W + run2, run1 + W], [0, run1 + W]];
  return { id: 'l', type: 'l_shape', treads, steps: n, riser: RISER, going: GOING, blondel: 0, footprint: pts };
}

describe('stairHeightAt', () => {
  const s = straight();
  it('base, meio e topo da escada reta sobem pela rampa dos degraus', () => {
    const base = stairHeightAt(s, [W / 2, 0.01])!;
    const mid = stairHeightAt(s, [W / 2, 7.5 * GOING])!;
    const top = stairHeightAt(s, [W / 2, 14 * GOING - 0.01])!;
    expect(base).toBeCloseTo(RISER * 0.5, 1);
    expect(mid).toBeGreaterThan(base);
    expect(mid).toBeCloseTo(8 * RISER, 6);
    expect(top).toBeGreaterThan(mid);
    expect(top).toBeCloseTo(14.5 * RISER, 1);
  });
  it('interpola pelo avanço dentro do degrau (monótona)', () => {
    let last = -1;
    for (let y = 0.01; y < 14 * GOING; y += 0.05) {
      const z = stairHeightAt(s, [W / 2, y])!;
      expect(z).toBeGreaterThanOrEqual(last - 1e-9);
      last = z;
    }
  });
  it('no centro do degrau vale o topo dele', () => {
    expect(stairHeightAt(s, [W / 2, 2.5 * GOING])).toBeCloseTo(3 * RISER, 6);
  });
  it('fora da escada é null', () => {
    expect(stairHeightAt(s, [W + 0.5, 1])).toBeNull();
    expect(stairHeightAt(s, [W / 2, -0.5])).toBeNull();
    expect(stairHeightAt(s, [W / 2, 20])).toBeNull();
  });
  it('escada em L: sobe nos dois lances e o patamar é plano', () => {
    const l = lShape();
    const m = 8;
    const run1 = (m - 1) * GOING;
    const a = stairHeightAt(l, [W / 2, GOING])!; // lance 1
    const landing1 = stairHeightAt(l, [0.2, run1 + 0.2])!;
    const landing2 = stairHeightAt(l, [0.7, run1 + 0.7])!;
    const b1 = stairHeightAt(l, [W + 0.1, run1 + W / 2])!; // começo do lance 2
    const b2 = stairHeightAt(l, [W + 4.5 * GOING, run1 + W / 2])!;
    expect(a).toBeLessThan(landing1);
    expect(landing1).toBeCloseTo(m * RISER, 6);
    expect(landing2).toBeCloseTo(landing1, 9);
    expect(b1).toBeGreaterThan(landing1 - RISER);
    expect(b2).toBeGreaterThan(b1);
    expect(b2).toBeCloseTo((m + 5) * RISER, 1);
  });
});

describe('colisão com a escada', () => {
  const s = straight();
  it('arestas: pé, topo e laterais', () => {
    const e = stairEdges(s)!;
    expect(e.sides).toHaveLength(2);
    expect(e.entry).toEqual([[0, 0], [W, 0]]);
    expect(e.exit[0][1]).toBeCloseTo(14 * GOING);
    expect(stairEdges(lShape())!.sides).toHaveLength(4);
  });
  it('no nível de baixo não atravessa a lateral nem entra pelo topo', () => {
    const rects = buildStairWalkRects(s, 'lower');
    const p = moveWithCollision([W + 0.6, 2], [-1.2, 0], rects);
    expect(p[0]).toBeGreaterThanOrEqual(W + 0.03 + 0.25 - 1e-6);
    const q = moveWithCollision([W / 2, 14 * GOING + 0.8], [0, -1.5], rects);
    expect(q[1]).toBeGreaterThanOrEqual(14 * GOING + 0.03 + 0.25 - 1e-6);
    // o pé está aberto
    const r = moveWithCollision([W / 2, -0.6], [0, 1.2], rects);
    expect(r[1]).toBeGreaterThan(0.4);
    expect(onStairFootprint(s, r)).toBe(true);
  });
  it('sobre a escada fica entre as laterais', () => {
    const rects = buildStairWalkRects(s, 'on');
    const p = moveWithCollision([W / 2, 1], [3, 0], rects);
    expect(p[0]).toBeLessThanOrEqual(W - 0.03 - 0.25 + 1e-6);
    expect(onStairFootprint(s, p)).toBe(true);
  });
  it('no mezanino o pé da escada (o vão) é obstáculo e o topo é a chegada', () => {
    const rects = buildStairWalkRects(s, 'upper');
    const fall = moveWithCollision([W / 2, 14 * GOING + 0.6], [0, -0.3], rects);
    expect(fall[1]).toBeLessThan(14 * GOING + 0.6); // chegada aberta: entra na escada
    const jump = moveWithCollision([W / 2, 14 * GOING + 0.6], [0, -2.5], rects);
    expect(jump[1]).toBeGreaterThanOrEqual(0.03 + 0.25 - 1e-6);
  });
});

describe('guarda-corpo do mezanino', () => {
  const wall = (from: V2, to: V2): HostWall => ({ id: 'w', kind: 'exterior', level: 'L1', from, to, baseZ: 3, length: 4, outline: [], thickness: 0.1, assemblyId: 'a', exteriorSide: null, loadBearing: true }) as unknown as HostWall;
  const slab = { polygon: [[0, 0], [4, 0], [4, 3], [0, 3]] as V2[], topZ: 3 };
  const walls = [wall([0, 3], [4, 3]), wall([0, 0], [0, 3]), wall([4, 0], [4, 3])]; // só a borda y=0 está livre

  it('a borda sem parede bloqueia a queda', () => {
    const rects = buildSlabRailRects(slab, walls);
    const p = moveWithCollision([2, 1], [0, -3], rects);
    expect(p[1]).toBeGreaterThan(0.2);
  });
  it('a chegada da escada deixa passagem', () => {
    const arrival: [V2, V2] = [[1, 0], [1.9, 0]];
    const rects = buildSlabRailRects(slab, walls, [arrival]);
    const through = moveWithCollision([1.45, 1], [0, -3], rects);
    expect(through[1]).toBeLessThan(0);
    const blocked = moveWithCollision([3, 1], [0, -3], rects);
    expect(blocked[1]).toBeGreaterThan(0.2);
  });
  it('cutSegmentNear corta só perto do vão', () => {
    const parts = cutSegmentNear([0, 0], [4, 0], [[1, 0], [2, 0]], 0.2);
    expect(parts).toHaveLength(2);
    expect(parts[0]![1][0]).toBeCloseTo(0.8, 1);
    expect(parts[1]![0][0]).toBeCloseTo(2.2, 1);
  });
});
