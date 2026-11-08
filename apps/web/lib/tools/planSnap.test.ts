import { describe, expect, it } from 'vitest';
import { planSnap, segmentIntersection } from './planSnap';
import type { SnapContext } from './snap';

const base = (over: Partial<SnapContext> = {}): SnapContext => ({
  segments: [
    { id: 'a', from: [0, 0], to: [6, 0] },
    { id: 'b', from: [3, -2], to: [3, 4] },
  ],
  corners: [],
  studSpacing: 0.6,
  options: { grid: true, modulation: false },
  radius: 0.2,
  ...over,
});

describe('planSnap', () => {
  it('ponta tem prioridade', () => {
    const r = planSnap([0.05, 0.05], { ctx: base() });
    expect(r.kind).toBe('endpoint');
    expect(r.point).toEqual([0, 0]);
  });
  it('interseção de duas paredes que se cruzam', () => {
    const r = planSnap([3.08, 0.07], { ctx: base() });
    expect(r.kind).toBe('intersection');
    expect(r.point[0]).toBeCloseTo(3, 9);
    expect(r.point[1]).toBeCloseTo(0, 9);
  });
  it('interseção ganha do meio e da grade, ponta ganha da interseção', () => {
    const ctx = base({ segments: [{ id: 'a', from: [0, 0], to: [6, 0] }, { id: 'c', from: [3, -2], to: [3, 2] }] });
    expect(planSnap([3.05, 0.05], { ctx }).kind).toBe('intersection');
    // ponta de c em (3,2) não coincide; ponta de a em (6,0)
    expect(planSnap([5.95, 0.03], { ctx }).kind).toBe('endpoint');
  });
  it('meio de parede', () => {
    const r = planSnap([1.5, 0.1], { ctx: base({ segments: [{ id: 'a', from: [0, 0], to: [3, 0] }] }) });
    expect(r.kind).toBe('midpoint');
    expect(r.point).toEqual([1.5, 0]);
  });
  it('perpendicular a uma parede, a partir da âncora', () => {
    const ctx = base({ segments: [{ id: 'a', from: [0, 0], to: [6, 0] }] });
    // âncora em (2, 3): o pé da perpendicular é (2, 0); cursor perto dele
    const r = planSnap([2.1, 0.08], { ctx, anchor: [2, 3] });
    expect(r.kind).toBe('perpendicular');
    expect(r.point[0]).toBeCloseTo(2, 9);
    expect(r.point[1]).toBeCloseTo(0, 9);
    expect(r.guides).toHaveLength(1);
  });
  it('sem âncora não há perpendicular', () => {
    const ctx = base({ segments: [{ id: 'a', from: [0, 0], to: [6, 0] }] });
    expect(planSnap([2.1, 0.08], { ctx }).kind).not.toBe('perpendicular');
  });
  it('alinhado com uma ponta existente (guia tracejada)', () => {
    const ctx = base({ segments: [{ id: 'a', from: [0, 0], to: [6, 0] }] });
    const r = planSnap([6.1, 3.0], { ctx });
    expect(r.kind).toBe('aligned');
    expect(r.point[0]).toBe(6);
    expect(r.point[1]).toBe(3);
    expect(r.guides).toEqual([{ from: [6, 0], to: [6, 3] }]);
  });
  it('alinha nos dois eixos e devolve duas guias', () => {
    const ctx = base({ segments: [{ id: 'a', from: [0, 0], to: [6, 0] }, { id: 'd', from: [0, 5], to: [0, 9] }] });
    const r = planSnap([6.08, 5.07], { ctx });
    expect(r.kind).toBe('aligned');
    expect(r.point).toEqual([6, 5]);
    expect(r.guides).toHaveLength(2);
  });
  it('alinha com a própria âncora', () => {
    const r = planSnap([4.1, 1.03], { ctx: base({ segments: [] }), anchor: [1, 1] });
    expect(r.kind).toBe('aligned');
    expect(r.point).toEqual([4.1, 1].map((v, i) => (i === 0 ? 4.1 : v)));
  });
  it('modulação antes da grade, quando ligada', () => {
    const ctx = base({ segments: [{ id: 'a', from: [0, 0], to: [6, 0] }], options: { grid: true, modulation: true }, radius: 0.1 });
    const r = planSnap([1.23, 0.06], { ctx });
    expect(r.kind).toBe('modulation');
    expect(r.point[0]).toBeCloseTo(1.2, 9);
  });
  it('grade de 5 cm', () => {
    const r = planSnap([2.43, 7.61], { ctx: base({ segments: [] }) });
    expect(r.kind).toBe('grid');
    expect(r.point).toEqual([2.45, 7.6]);
  });
  it('sem opções devolve o ponto bruto', () => {
    const r = planSnap([2.43, 7.61], { ctx: base({ segments: [], options: { grid: false, modulation: false } }) });
    expect(r.kind).toBe('none');
    expect(r.point).toEqual([2.43, 7.61]);
  });
  it('Alt (disabled) desliga tudo', () => {
    const r = planSnap([0.05, 0.05], { ctx: base({ disabled: true }) });
    expect(r.kind).toBe('none');
    expect(r.point).toEqual([0.05, 0.05]);
  });
  it('Shift trava em múltiplos de 15° e arredonda o comprimento na grade', () => {
    const ctx = base({ segments: [] });
    const r = planSnap([3.0, 0.9], { ctx, anchor: [0, 0], angleLock: true });
    const ang = (Math.atan2(r.point[1], r.point[0]) * 180) / Math.PI;
    expect(Math.round(ang / 15) * 15).toBeCloseTo(ang, 6);
    expect(ang).toBeCloseTo(15, 6);
    expect(Math.hypot(...r.point)).toBeCloseTo(3.15, 6);
  });
  it('Shift ainda captura uma ponta que está sobre a direção travada', () => {
    const ctx = base({ segments: [{ id: 'z', from: [4, 0], to: [4, 5] }] });
    const r = planSnap([4.03, 0.2], { ctx, anchor: [0, 0], angleLock: true });
    expect(r.kind).toBe('endpoint');
    expect(r.point[0]).toBeCloseTo(4, 6);
    expect(r.point[1]).toBeCloseTo(0, 6);
  });
});

describe('segmentIntersection', () => {
  it('cruza', () => {
    expect(segmentIntersection({ id: 'a', from: [0, 0], to: [2, 2] }, { id: 'b', from: [0, 2], to: [2, 0] })).toEqual([1, 1]);
  });
  it('paralelas e disjuntas não cruzam', () => {
    expect(segmentIntersection({ id: 'a', from: [0, 0], to: [2, 0] }, { id: 'b', from: [0, 1], to: [2, 1] })).toBeNull();
    expect(segmentIntersection({ id: 'a', from: [0, 0], to: [1, 0] }, { id: 'b', from: [2, -1], to: [2, 1] })).toBeNull();
  });
});
