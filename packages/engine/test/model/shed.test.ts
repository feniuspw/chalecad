import { describe, expect, test } from 'vitest';
import { cross3 } from '../../src/geometry';
import { mk, run } from '../helpers/inline';

const shed = (extra: object = {}) =>
  mk({ kind: 'shed', width: 4, depth: 6, lowHeight: 2.6, highHeight: 3.6, highSide: 'front', eave: 0.5, ...extra });

describe('shed 4 x 6, low 2,6, high 3,6, highSide front', () => {
  const { model, pieces, quantities } = run(shed());
  const roof = model.roofPlanes[0]!;

  test('inclinação atan(1/6), cumeeira na frente, uma água', () => {
    expect(model.roofPlanes).toHaveLength(1);
    expect(roof.id).toBe('roof-a');
    expect(roof.slopeDeg).toBeCloseTo((Math.atan(1 / 6) * 180) / Math.PI, 9);
    expect(model.ridgeHeight).toBe(3.6);
    const high = roof.vertices.filter((v) => Math.abs(v[2] - (3.6 + 0.5 / 6)) < 1e-9);
    expect(high).toHaveLength(2);
    for (const v of high) expect(v[1]).toBeCloseTo(-0.5, 9); // lado alto em y < 0 (frente)
    const n = cross3(roof.uAxis, roof.vAxis);
    expect(n[2]).toBeGreaterThan(0);
    expect(n[1]).toBeGreaterThan(0); // normal inclina para o fundo (lado baixo)
  });

  test('área conferida à mão: (4+1) x (6+1)/cos', () => {
    const cos = 1 / Math.sqrt(1 + 1 / 36);
    expect(roof.area).toBeCloseTo(5 * (7 / cos), 9);
    expect(roof.uLength).toBeCloseTo(5, 9);
    expect(roof.vLength).toBeCloseTo(7 / cos, 9);
  });

  test('paredes: laterais trapezoidais (4 vértices), frente alta e fundo baixo retangulares', () => {
    const w = (id: string) => model.walls.find((x) => x.id === id)!;
    for (const id of ['ext-left', 'ext-right']) {
      expect(w(id).outline).toHaveLength(4);
    }
    // ext-right vai de (W,0) a (W,D): alta no início, baixa no fim
    expect(w('ext-right').outline).toEqual([[0, 0], [6, 0], [6, 2.6], [0, 3.6]]);
    expect(w('ext-left').outline).toEqual([[0, 0], [6, 0], [6, 3.6], [0, 2.6]]);
    expect(w('ext-front').outline).toEqual([[0, 0], [4, 0], [4, 3.6], [0, 3.6]]);
    expect(w('ext-back').outline).toEqual([[0, 0], [4, 0], [4, 2.6], [0, 2.6]]);
  });

  test('framing: caibros, terças, viga de topo e guias superiores inclinadas', () => {
    const roles = (r: string) => pieces.filter((p) => p.role === r && p.hostId === 'roof-a');
    expect(roles('rafter').length).toBeGreaterThanOrEqual(8);
    expect(roles('purlin').length).toBeGreaterThanOrEqual(5);
    expect(roles('ridge')).toHaveLength(1);
    const top = pieces.find((p) => p.hostId === 'ext-right' && p.role === 'track_top')!;
    expect(Math.abs(top.start[2] - top.end[2])).toBeCloseTo(1, 6);
  });

  test('quantitativos: telha, cumeeira e calha no lado baixo', () => {
    const l = (id: string) => quantities.lines.find((x) => x.itemId === id && x.stage === 'roof')!;
    expect(l('sandwich_eps30').netQty).toBeCloseTo(roof.area, 6);
    expect(l('gutter').netQty).toBeCloseTo(5, 6);
    expect(l('ridge_cap').netQty).toBeCloseTo(5, 6);
  });
});

describe('shed: demais lados altos', () => {
  test.each([
    ['back', 6],
    ['left', 4],
    ['right', 4],
  ] as const)('highSide %s: vão %s, sem erro, normal para fora e para cima', (side, span) => {
    const { model } = run(shed({ highSide: side }));
    const r = model.roofPlanes[0]!;
    expect(r.slopeDeg).toBeCloseTo((Math.atan(1 / span) * 180) / Math.PI, 9);
    expect(cross3(r.uAxis, r.vAxis)[2]).toBeGreaterThan(0);
    expect(model.walls.filter((w) => w.outline.length === 4 && w.kind === 'exterior')).toHaveLength(4);
    const trapezoids = model.walls.filter((w) => w.outline[2]![1] !== w.outline[3]![1]);
    expect(trapezoids).toHaveLength(2);
  });

  test('beiral zero e abertura em parede alta', () => {
    const p = mk(
      { kind: 'shed', width: 4, depth: 6, lowHeight: 2.6, highHeight: 3.6, highSide: 'front', eave: 0 },
      { openings: [{ id: 'j1', host: 'ext-front', type: 'window', offset: 1, width: 1.2, height: 1.2, sill: 1 }] },
    );
    const { model, weight } = run(p);
    expect(model.openings[0]!.valid).toBe(true);
    expect(model.roofPlanes[0]!.uLength).toBe(4);
    expect(weight.totalKg).toBeGreaterThan(0);
  });
});
