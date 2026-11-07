import { describe, expect, test } from 'vitest';
import { cross3, polygonArea } from '../../src/geometry';
import { mk, run } from '../helpers/inline';

const DEG = Math.PI / 180;
const gambrel = (extra: object = {}) =>
  mk({
    kind: 'gambrel', width: 6, depth: 8, wallHeight: 2.5, lowerPitchDeg: 60, upperPitchDeg: 25,
    breakRatio: 0.4, eave: 0.4, rake: 0.3, ...extra,
  });

describe('gambrel 6 x 8, wallHeight 2,5, 60/25, breakRatio 0,4', () => {
  const { model, pieces, quantities } = run(gambrel());
  // à mão: quebra a 0,4 x 3 = 1,2 m da parede; z = 2,5 + 1,2 tan60; cumeeira = z + 1,8 tan25
  const zBreak = 2.5 + 1.2 * Math.tan(60 * DEG);
  const zRidge = zBreak + 1.8 * Math.tan(25 * DEG);

  test('alturas da quebra e da cumeeira', () => {
    expect(zBreak).toBeCloseTo(4.5785, 3);
    expect(zRidge).toBeCloseTo(5.4178, 3);
    expect(model.ridgeHeight).toBeCloseTo(zRidge, 9);
    const a = model.roofPlanes.find((p) => p.id === 'roof-a')!;
    const a2 = model.roofPlanes.find((p) => p.id === 'roof-a2')!;
    expect(Math.max(...a.vertices.map((v) => v[2]))).toBeCloseTo(zBreak, 9);
    expect(Math.min(...a2.vertices.map((v) => v[2]))).toBeCloseTo(zBreak, 9);
    expect(Math.max(...a2.vertices.map((v) => v[2]))).toBeCloseTo(zRidge, 9);
    expect(Math.min(...a.vertices.map((v) => v[2]))).toBeCloseTo(2.5 - 0.4 * Math.tan(60 * DEG), 9);
  });

  test('4 águas com IDs e normais para fora', () => {
    expect(model.roofPlanes.map((p) => p.id)).toEqual(['roof-a', 'roof-a2', 'roof-b', 'roof-b2']);
    for (const p of model.roofPlanes) expect(cross3(p.uAxis, p.vAxis)[2]).toBeGreaterThan(0);
    const a = model.roofPlanes[0]!;
    expect(a.slopeDeg).toBeCloseTo(60, 9);
    expect(a.uLength).toBeCloseTo(8.6, 9); // rake em todas
    expect(a.vLength).toBeCloseTo(1.6 / Math.cos(60 * DEG), 9); // beiral só na inferior
    const a2 = model.roofPlanes[1]!;
    expect(a2.uLength).toBeCloseTo(8.6, 9);
    expect(a2.vLength).toBeCloseTo(1.8 / Math.cos(25 * DEG), 9);
    expect(a2.area).toBeCloseTo(8.6 * a2.vLength, 9);
  });

  test('empena com 7 vértices e perfil conferido', () => {
    const front = model.walls.find((w) => w.id === 'ext-front')!;
    expect(front.outline).toHaveLength(7);
    expect(front.outline[3]![0]).toBeCloseTo(4.8, 9);
    expect(front.outline[3]![1]).toBeCloseTo(zBreak, 9);
    expect(front.outline[4]![1]).toBeCloseTo(zRidge, 9);
    expect(model.walls.find((w) => w.id === 'ext-right')!.outline).toHaveLength(4);
    expect(model.builtArea).toBe(48);
  });

  test('framing: caibros em dois segmentos por lado, travessa na quebra, cumeeira, terças', () => {
    const n = (host: string, role: string) => pieces.filter((p) => p.hostId === host && p.role === role).length;
    expect(n('roof-a', 'rafter')).toBe(n('roof-a2', 'rafter'));
    expect(n('roof-a', 'rafter')).toBeGreaterThan(10);
    expect(n('roof-b', 'rafter')).toBe(n('roof-b2', 'rafter'));
    expect(n('roof-a2', 'ridge')).toBe(1);
    expect(n('roof-a', 'collar_tie')).toBeGreaterThan(3);
    for (const h of ['roof-a', 'roof-a2', 'roof-b', 'roof-b2']) expect(n(h, 'purlin')).toBeGreaterThan(2);
    const tie = pieces.find((p) => p.role === 'collar_tie')!;
    expect(tie.start[2]).toBeCloseTo(zBreak, 6);
    expect(tie.length).toBeCloseTo(6 - 2 * 1.2, 6);
  });

  test('quantitativos: telha cobre as 4 águas e calha só na inferior', () => {
    const l = (id: string) => quantities.lines.find((x) => x.itemId === id && x.stage === 'roof')!;
    expect(l('sandwich_eps30').netQty).toBeCloseTo(model.roofPlanes.reduce((s, p) => s + p.area, 0), 6);
    expect(l('gutter').netQty).toBeCloseTo(2 * 8.6, 6);
    expect(l('ridge_cap').netQty).toBeCloseTo(8.6, 6);
  });

  test('mezanino no nível da quebra dispensa as travessas', () => {
    const p = gambrel();
    const withMezz = mk(p.typology, {
      levels: [
        { id: 'L0', elevation: 0, floor: 'polished_concrete' },
        { id: 'L1', elevation: zBreak, polygon: [[0, 0], [6, 0], [6, 8], [0, 8]], deck: 'osb18' },
      ],
    });
    const r = run(withMezz);
    expect(r.pieces.filter((x) => x.role === 'collar_tie')).toHaveLength(0);
    expect(polygonArea(r.model.slabs[1]!.polygon)).toBe(48);
  });

  test('cumeeira em width gira a geometria', () => {
    const r = run(mk({ kind: 'gambrel', width: 8, depth: 6, wallHeight: 2.5 }, { roof: { ridgeAxis: 'width' } }));
    expect(r.model.walls.find((w) => w.id === 'ext-right')!.outline).toHaveLength(7);
    expect(r.model.roofPlanes).toHaveLength(4);
  });
});
