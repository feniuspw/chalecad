import { describe, expect, it } from 'vitest';
import { orthoPoint, snapPoint, snapScalar, type SnapContext } from './snap';

const ctx = (over: Partial<SnapContext> = {}): SnapContext => ({
  segments: [{ id: 'ext-front', from: [0, 0], to: [6.5, 0] }],
  corners: [[0, 0]],
  studSpacing: 0.6,
  options: { grid: true, modulation: true },
  radius: 0.2,
  ...over,
});

describe('snapPoint', () => {
  it('captura cantos primeiro', () => {
    const r = snapPoint([0.05, 0.04], ctx());
    expect(r.kind).toBe('corner');
    expect(r.point).toEqual([0, 0]);
  });
  it('captura extremidades e ponto médio', () => {
    expect(snapPoint([6.45, 0.1], ctx()).kind).toBe('endpoint');
    const m = snapPoint([3.3, 0.1], ctx());
    expect(m.kind).toBe('midpoint');
    expect(m.point).toEqual([3.25, 0]);
  });
  it('modula montantes ao longo da parede', () => {
    const r = snapPoint([1.27, 0.08], ctx());
    expect(r.kind).toBe('modulation');
    expect(r.point[0]).toBeCloseTo(1.2, 6);
    expect(r.point[1]).toBeCloseTo(0, 6);
  });
  it('cai na grade de 10 cm longe de tudo', () => {
    const r = snapPoint([2.33, 3.07], ctx());
    expect(r.kind).toBe('grid');
    expect(r.point).toEqual([2.3, 3.1]);
  });
  it('respeita as opções e o Alt', () => {
    expect(snapPoint([2.33, 3.07], ctx({ options: { grid: false, modulation: false } })).kind).toBe('none');
    expect(snapPoint([1.27, 0.08], ctx({ options: { grid: true, modulation: false } })).kind).toBe('grid');
    const off = snapPoint([0.05, 0.04], ctx({ disabled: true }));
    expect(off.kind).toBe('none');
    expect(off.point).toEqual([0.05, 0.04]);
  });
});

describe('orthoPoint / snapScalar', () => {
  it('trava no eixo dominante', () => {
    expect(orthoPoint([1, 1], [4, 1.5])).toEqual([4, 1]);
    expect(orthoPoint([1, 1], [1.4, 5])).toEqual([1, 5]);
  });
  it('snapScalar usa modulação ou grade', () => {
    expect(snapScalar(1.27, { grid: true, modulation: true, studSpacing: 0.6 })).toBeCloseTo(1.2);
    expect(snapScalar(1.27, { grid: true, modulation: false, studSpacing: 0.6 })).toBeCloseTo(1.3);
    expect(snapScalar(1.27, { grid: true, modulation: true, studSpacing: 0.6, disabled: true })).toBe(1.27);
  });
});
