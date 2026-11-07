import { describe, expect, it } from 'vitest';
import type { HostWall } from '@chalecad/engine';
import { dragOffset, nearestHostWall, placeOnRoof, placeOnWall, planeUV } from './opening';

const wall = (over: Partial<HostWall> = {}): HostWall => ({
  id: 'ext-front',
  kind: 'exterior',
  level: 'L0',
  from: [0, 0],
  to: [6.5, 0],
  baseZ: 0,
  length: 6.5,
  outline: [[0, 0], [6.5, 0], [6.5, 2.8], [0, 2.8]],
  thickness: 0.12,
  assemblyId: 'x',
  exteriorSide: 'right',
  loadBearing: true,
  wet: false,
  ...over,
});
const snap = { grid: true, modulation: true, studSpacing: 0.6 };
const win = { type: 'window' as const, width: 1.2, height: 1, sill: 1 };

describe('nearestHostWall', () => {
  it('acha a parede sob o cursor e a posição ao longo dela', () => {
    const hit = nearestHostWall([2, 0.1], [wall()], 'L0');
    expect(hit?.wall.id).toBe('ext-front');
    expect(hit?.u).toBeCloseTo(2);
  });
  it('ignora outros níveis e paredes longe', () => {
    expect(nearestHostWall([2, 0.1], [wall()], 'L1')).toBeNull();
    expect(nearestHostWall([2, 2], [wall()], 'L0')).toBeNull();
  });
});

describe('placeOnWall', () => {
  it('snapa a borda na modulação e mede o offset a partir do início', () => {
    const p = placeOnWall(wall(), 2.0, win, snap);
    expect(p.offset).toBeCloseTo(1.2);
    expect(p.fits).toBe(true);
    expect(p.v0).toBe(1);
  });
  it('sem snap (Alt) segue o cursor', () => {
    const p = placeOnWall(wall(), 2.0, win, { ...snap, disabled: true });
    expect(p.offset).toBeCloseTo(1.4);
  });
  it('portas ignoram o peitoril', () => {
    const p = placeOnWall(wall(), 3, { type: 'door', width: 0.9, height: 2.1, sill: 1 }, snap);
    expect(p.v0).toBe(0);
    expect(p.v1).toBeCloseTo(2.1);
  });
  it('fica vermelho (não cabe) fora da parede, alto demais ou sobreposto', () => {
    expect(placeOnWall(wall(), 0.1, win, snap).fits).toBe(false);
    expect(placeOnWall(wall(), 3, { ...win, sill: 2.2 }, snap).fits).toBe(false);
    const over = placeOnWall(wall(), 3, win, snap, [{ offset: 2.4, width: 1.2 }]);
    expect(over.fits).toBe(false);
    expect(over.reason).toMatch(/Sobrepõe/);
  });
  it('respeita o sentido from→to ao ler o offset (parede invertida)', () => {
    const inv = wall({ from: [6.5, 0], to: [0, 0] });
    // cursor a 1,2 m do início (x = 5,3) => borda esquerda perto de 0,6 do início
    const hit = nearestHostWall([5.3, 0], [inv], 'L0')!;
    expect(hit.u).toBeCloseTo(1.2);
    expect(placeOnWall(inv, hit.u, win, snap).offset).toBeCloseTo(0.6);
  });
});

describe('claraboia', () => {
  const plane = { origin: [0, 0, 3] as [number, number, number], uAxis: [1, 0, 0] as [number, number, number], vAxis: [0, 0.8, 0.6] as [number, number, number], uLength: 6, vLength: 4 };
  it('projeta o ponto no referencial da água', () => {
    const uv = planeUV(plane, [2, 1.6, 4.2]);
    expect(uv[0]).toBeCloseTo(2);
    expect(uv[1]).toBeCloseTo(2);
  });
  it('centra no cursor e valida limites', () => {
    const p = placeOnRoof(plane, [3, 2], { type: 'skylight', width: 0.8, height: 1, sill: 0 }, snap);
    expect(p.fits).toBe(true);
    expect(p.offset).toBeCloseTo(2.6);
    expect(p.sill).toBeCloseTo(1.5);
    expect(placeOnRoof(plane, [0.1, 2], { type: 'skylight', width: 0.8, height: 1, sill: 0 }, snap).fits).toBe(false);
  });
});

describe('dragOffset', () => {
  it('mantém o ponto agarrado, com snap e limites', () => {
    expect(dragOffset(wall(), 3.0, 0.6, 1.2, snap)).toBeCloseTo(2.4);
    expect(dragOffset(wall(), -5, 0.6, 1.2, snap)).toBe(0);
    expect(dragOffset(wall(), 99, 0.6, 1.2, snap)).toBeCloseTo(5.3);
  });
});
