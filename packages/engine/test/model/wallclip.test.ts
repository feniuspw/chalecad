import { describe, expect, test } from 'vitest';
import { computeAll } from '../../src/compute';
import { buildModel } from '../../src/model';
import { testCatalog } from '../helpers/catalog';
import { mk, run } from '../helpers/inline';

const aframe = { kind: 'a_frame', width: 6, depth: 9, ridgeHeight: 6, kneeWallHeight: 0.9, rake: 0.4 };
const tan = (6 - 0.9) / 3;
const roofAt = (x: number) => 0.9 + Math.min(x, 6 - x) * tan - 0.05;
const wallOf = (p: ReturnType<typeof mk>, id: string) => buildModel(p, testCatalog).walls.find((w) => w.id === id)!;
describe('F14-E1: paredes internas cortadas pelo telhado', () => {
  test('divisória paralela à cumeeira a 0,8 m da lateral: topo sob o telhado', () => {
    const p = mk(aframe, { walls: [{ id: 'w1', level: 'L0', from: [0.8, 1], to: [0.8, 8] }] });
    const w = wallOf(p, 'w1');
    for (const [, v] of w.outline) expect(v).toBeLessThanOrEqual(roofAt(0.8) + 1e-6);
    expect(Math.max(...w.outline.map((o) => o[1]))).toBeCloseTo(roofAt(0.8), 6);
    expect(w.outline).toHaveLength(4);
  });

  test('divisória perpendicular à cumeeira: pentágono com pico na cumeeira', () => {
    const p = mk(aframe, { walls: [{ id: 'w1', level: 'L0', from: [0, 4.5], to: [6, 4.5], height: 6 }] });
    const w = wallOf(p, 'w1');
    expect(w.outline).toHaveLength(5);
    const peak = Math.max(...w.outline.map((o) => o[1]));
    expect(peak).toBeCloseTo(6 - 0.05, 6);
    const pk = w.outline.find((o) => o[1] === peak)!;
    expect(pk[0]).toBeCloseTo(3, 6);
    expect(w.outline.some((o) => o[0] === 0 && Math.abs(o[1] - 0.85) < 1e-9)).toBe(true);
    expect(w.outline.some((o) => o[0] === 6 && Math.abs(o[1] - 0.85) < 1e-9)).toBe(true);
  });

  test('parede no mezanino do A-frame é cortada', () => {
    const p = mk(aframe, {
      levels: [
        { id: 'L0', elevation: 0, floor: 'polished_concrete' },
        { id: 'L1', elevation: 2.8, polygon: [[0, 0], [6, 0], [6, 4], [0, 4]] },
      ],
      walls: [{ id: 'm1', level: 'L1', from: [2, 1], to: [2, 3], height: 2.8 }],
    });
    const w = wallOf(p, 'm1');
    expect(w.baseZ).toBe(2.8);
    expect(Math.max(...w.outline.map((o) => o[1]))).toBeCloseTo(roofAt(2) - 2.8, 6);
  });

  test('caixa com laje plana: contorno retangular como antes', () => {
    const p = mk(
      { kind: 'flat_roof', width: 6, depth: 8, wallHeight: 2.8, parapet: 0.3 },
      { walls: [{ id: 'w1', level: 'L0', from: [0.3, 4], to: [5.7, 4] }] },
    );
    const w = wallOf(p, 'w1');
    expect(w.outline).toEqual([[0, 0], [5.4, 0], [5.4, 2.8], [0, 2.8]]);
  });

  test('porta que não cabe sob o telhado: mantida, com aviso wall.roof_clip', () => {
    const p = mk(aframe, {
      walls: [{ id: 'w1', level: 'L0', from: [0.6, 1], to: [0.6, 4], height: 2.4 }],
      openings: [{ id: 'd1', host: 'w1', type: 'door', offset: 1, width: 0.9, height: 2.1 }],
    });
    const model = buildModel(p, testCatalog);
    expect(model.openings[0]!.valid).toBe(true);
    const r = computeAll(p, testCatalog);
    expect(r.warnings.some((x) => x.code === 'wall.roof_clip' && x.severity === 'warn')).toBe(true);
    expect(() => run(p)).not.toThrow();
  });
});
