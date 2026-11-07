import { describe, expect, test } from 'vitest';
import { mk, run } from '../helpers/inline';

const flat = (extra: object = {}) =>
  mk({ kind: 'flat_roof', width: 5, depth: 8, wallHeight: 2.8, parapetHeight: 0.6, slopePct: 5, ...extra });

describe('flat_roof 5 x 8', () => {
  const { model, pieces, quantities } = run(flat());
  const roof = model.roofPlanes[0]!;

  test('4 parapets acima de wallHeight', () => {
    const ps = model.walls.filter((w) => w.kind === 'parapet');
    expect(ps.map((w) => w.id).sort()).toEqual([
      'ext-back-parapet',
      'ext-front-parapet',
      'ext-left-parapet',
      'ext-right-parapet',
    ]);
    for (const p of ps) {
      expect(p.baseZ).toBe(2.8);
      expect(p.outline).toEqual([[0, 0], [p.length, 0], [p.length, 0.6], [0, 0.6]]);
    }
    expect(model.walls.filter((w) => w.kind === 'exterior')).toHaveLength(4);
    expect(model.bbox.max[2]).toBeCloseTo(3.4, 9);
  });

  test('água única com 5% de inclinação, sem beiral, caindo para o fundo', () => {
    expect(model.roofPlanes).toHaveLength(1);
    expect(Math.tan((roof.slopeDeg * Math.PI) / 180)).toBeCloseTo(0.05, 9);
    expect(roof.uLength).toBe(5);
    expect(roof.area).toBeCloseTo((5 * 8) / Math.cos(Math.atan(0.05)), 9);
    const zs = roof.vertices.map((v) => v[2]);
    expect(Math.min(...zs)).toBeCloseTo(2.8, 9);
    expect(Math.max(...zs)).toBeCloseTo(2.8 + 0.4, 9);
    const low = roof.vertices.filter((v) => Math.abs(v[2] - 2.8) < 1e-9);
    for (const v of low) expect(v[1]).toBeCloseTo(8, 9);
  });

  test('calha interna de 5 m e rufo no perímetro da platibanda', () => {
    const l = (id: string) => quantities.lines.find((x) => x.itemId === id && x.stage === 'roof')!;
    expect(l('gutter').netQty).toBeCloseTo(5, 9);
    expect(l('flashing').netQty).toBeCloseTo(26, 9);
    expect(quantities.lines.some((x) => x.itemId === 'ridge_cap')).toBe(false);
    expect(l('sandwich_eps30').netQty).toBeCloseTo(roof.area, 6);
  });

  test('framing: vigas no menor vão (x) e cartolas', () => {
    const joists = pieces.filter((p) => p.role === 'joist' && p.hostId === 'roof-a');
    expect(joists.length).toBeGreaterThan(10);
    for (const j of joists) {
      expect(j.length).toBeCloseTo(5, 9);
      expect(j.profileId).toBe('Ue200x40x1.25');
    }
    expect(pieces.some((p) => p.role === 'purlin' && p.hostId === 'roof-a')).toBe(true);
  });

  test('parapets não geram chumbadores nem hold-downs', () => {
    const anchors = quantities.lines.find((x) => x.itemId === 'hold_down')!;
    expect(anchors.netQty).toBe(8);
  });
});

describe('flat_roof: variações', () => {
  test('sem platibanda e com vão menor em y', () => {
    const { model, pieces } = run(flat({ width: 9, depth: 4, parapetHeight: 0 }));
    expect(model.walls.some((w) => w.kind === 'parapet')).toBe(false);
    const j = pieces.filter((p) => p.role === 'joist');
    for (const x of j) expect(x.length).toBeCloseTo(4, 9);
  });
});
