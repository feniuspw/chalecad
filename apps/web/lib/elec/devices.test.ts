import { describe, expect, it } from 'vitest';
import type { ElecPoint } from '@chalecad/engine';
import { DEVICE, deviceParts, devicePoses, isWallDevice, switchGangs } from './devices';

const pt = (o: Partial<ElecPoint>): ElecPoint => ({ id: 'p', kind: 'socket', level: 'L0', position: [1, 0.06], hostId: 'w', height: 0.3, ...o });

describe('peças 3D dos pontos de parede', () => {
  it('tomada NBR 14136: placa 4×2, rebaixo e três furos, o terra no meio e abaixo dos outros dois', () => {
    const parts = deviceParts(pt({}));
    expect(parts.map((p) => p.part)).toEqual(['plate', 'recess', 'hole10', 'hole10', 'hole10']);
    const holes = parts.filter((p) => p.part === 'hole10');
    const [a, b, earth] = holes;
    expect(Math.abs(a!.at[2] - b!.at[2])).toBeCloseTo(DEVICE.pinSpacing, 6);
    expect(earth!.at[2]).toBe(0);
    expect(earth!.at[1]).toBeLessThan(a!.at[1]);
    // tudo à frente da placa (para fora da parede)
    for (const h of holes) expect(h.at[0]).toBeGreaterThan(DEVICE.plate.d);
  });
  it('TUE de 20 A: módulo vermelho e furos maiores', () => {
    const parts = deviceParts(pt({ kind: 'socket_tue' })).map((p) => p.part);
    expect(parts).toContain('recessRed');
    expect(parts.filter((p) => p === 'hole20')).toHaveLength(3);
    expect(DEVICE.hole20).toBeGreaterThan(DEVICE.hole10);
  });
  it('interruptor: uma tecla por comando, lado a lado e sem passar da placa', () => {
    expect(deviceParts(pt({ kind: 'switch' }), 1).filter((p) => p.part === 'key')).toHaveLength(1);
    const two = deviceParts(pt({ kind: 'switch' }), 2).filter((p) => p.part === 'key');
    expect(two).toHaveLength(2);
    const span = Math.max(...two.map((k) => Math.abs(k.at[2]) + (k.width ?? 0) / 2));
    expect(span).toBeLessThan(DEVICE.plate.w / 2);
  });
  it('só pontos presos a uma parede viram peça (luz de teto e ponto sem parede não)', () => {
    expect(isWallDevice(pt({}))).toBe(true);
    expect(isWallDevice(pt({ kind: 'light', hostId: undefined }))).toBe(false);
    expect(isWallDevice(pt({ hostId: undefined }))).toBe(false);
  });
  it('teclas pelo número de comandos que o interruptor aciona', () => {
    const pts: ElecPoint[] = [
      pt({ id: 'l1', kind: 'light', hostId: undefined, height: 2.6 }),
      pt({ id: 'l2', kind: 'light', hostId: undefined, height: 2.6 }),
      pt({ id: 's1', kind: 'switch', controls: ['l1'] }),
      pt({ id: 's2', kind: 'switch', controls: ['l2'] }),
      pt({ id: 's3', kind: 'switch', controls: ['l1', 'l2'] }),
    ];
    const g = switchGangs(pts);
    expect(g.get('s1')).toBe(1);
    expect(g.get('s3')).toBe(2);
  });
  it('pose: centro na altura do ponto sobre o piso do nível, +x local apontando para a normal da face', () => {
    const [d] = devicePoses([pt({ level: 'L1', height: 1.1 })], { L1: 2.8 }, () => [0, 1]);
    expect(d!.pos).toEqual([1, 3.9, -0.06]);
    // normal +y do motor = -z da cena: guinada de 90°
    expect(d!.yaw).toBeCloseTo(Math.PI / 2, 6);
    expect(devicePoses([pt({})], {}, () => null)).toHaveLength(0);
  });
});
