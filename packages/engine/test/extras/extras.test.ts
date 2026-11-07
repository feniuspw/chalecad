import { describe, expect, test } from 'vitest';
import { mk, run } from '../helpers/inline';

const house = { kind: 'gable_mezzanine', width: 6.5, depth: 8.5, wallHeight: 2.8, roofPitchDeg: 35 };
const withExtras = (...extras: unknown[]) => run(mk(house, { extras }));
const line = (q: ReturnType<typeof run>['quantities'], itemId: string) =>
  q.lines.find((l) => l.stage === 'extras' && l.itemId === itemId);

describe('muro', () => {
  test('10 m x 2 m de bloco de concreto: 250 blocos + perda, sapata 1,2 m³', () => {
    const { quantities: q, model } = withExtras({
      id: 'm1', kind: 'wall', path: [[10, -5], [20, -5]], height: 2, system: 'concrete_block', foundation: 'strip',
    });
    expect(line(q, 'block_concrete')!.netQty).toBeCloseTo(250, 9);
    expect(line(q, 'block_concrete')!.purchaseQty).toBe(263); // 250 x 1,05
    expect(line(q, 'concrete_fck25')!.netQty).toBeCloseTo(1.2, 9);
    expect(line(q, 'grout')!.netQty).toBeCloseTo(0.2, 9);
    expect(line(q, 'rebar_ca50')!.netQty).toBeCloseTo(20 * 2.5 + 30, 9);
    expect(line(q, 'mortar')).toBeDefined();
    expect(model.extras[0]!.segments).toEqual([
      { from: [10, -5], to: [20, -5], height: 2, thickness: 0.14, baseZ: 0, material: 'block' },
    ]);
  });

  test('estrutural: graute dobrado; baldrame 0,15 x 0,3; muro fechado soma o último lado', () => {
    const { quantities: q } = withExtras({
      id: 'm2', kind: 'wall', path: [[0, 0], [4, 0], [4, 3]], closed: true, height: 1, system: 'structural_block', foundation: 'grade_beam',
    });
    expect(line(q, 'block_structural')!.netQty).toBeCloseTo(12 * 12.5, 9);
    expect(line(q, 'grout')!.netQty).toBeCloseTo(12 * 0.01 * 2, 9);
    expect(line(q, 'concrete_fck25')!.netQty).toBeCloseTo(12 * 0.15 * 0.3, 9);
  });

  test('lsf_board: placa nas duas faces e peças LSF', () => {
    const { quantities: q, pieces } = withExtras({
      id: 'm3', kind: 'wall', path: [[0, -3], [6, -3]], height: 2, system: 'lsf_board',
    });
    expect(line(q, 'cement_board_10')!.netQty).toBeCloseTo(24, 9);
    expect(line(q, 'cement_board_10')!.purchaseQty).toBeGreaterThanOrEqual(24 / 2.88);
    expect(pieces.filter((p) => p.hostId === 'm3' && p.role === 'stud')).toHaveLength(11);
    expect(pieces.filter((p) => p.hostId === 'm3' && p.role.startsWith('track'))).toHaveLength(2);
  });
});

describe('cerca', () => {
  const fence = {
    id: 'c1', kind: 'fence', path: [[-5, -5], [15, -5], [15, 15], [-5, 15]], closed: true,
    height: 1.8, postType: 'concrete', postSpacing: 2.5, mesh: 'welded', baseWallHeight: 0,
  };
  test('quadrada fechada 20 x 20, espaçamento 2,5: 32 mourões; tela 80 m = 4 rolos', () => {
    const { quantities: q, model } = withExtras(fence);
    expect(line(q, 'post_concrete')!.netQty).toBe(32);
    expect(model.extras[0]!.posts).toHaveLength(32);
    expect(line(q, 'fence_welded')!.netQty).toBeCloseTo(80, 9);
    expect(line(q, 'fence_welded')!.purchaseQty).toBe(4);
    expect(line(q, 'block_concrete')).toBeUndefined();
  });

  test('aberta tem +1 mourão; arame farpado 5 fios sem tela; mureta com blocos', () => {
    const { quantities: q } = withExtras({
      ...fence, id: 'c2', closed: false, mesh: 'barbed', postType: 'steel', baseWallHeight: 0.2,
    });
    expect(line(q, 'post_steel')!.netQty).toBe(8 * 3 + 1);
    expect(line(q, 'barbed_wire')!.netQty).toBeCloseTo(60 * 5, 9);
    expect(line(q, 'fence_welded')).toBeUndefined();
    expect(line(q, 'block_concrete')!.netQty).toBeCloseTo(60 * 0.2 * 12.5, 9);
    expect(line(q, 'concrete_fck25')!.netQty).toBeCloseTo(60 * 0.4 * 0.3, 9);
  });
});

describe('deck', () => {
  const deck = { id: 'd1', kind: 'deck', side: 'front', depth: 2, elevation: 0.3, guardrail: true };
  test('frontal 6,5 x 2: 13 m²; guarda-corpo 2 + 2 + 6,5', () => {
    const { quantities: q, model } = withExtras(deck);
    expect(line(q, 'deck_wood')!.netQty).toBeCloseTo(13, 9);
    expect(line(q, 'deck_frame')!.netQty).toBeCloseTo(13, 9);
    expect(line(q, 'guardrail')!.netQty).toBeCloseTo(10.5, 9);
    const em = model.extras[0]!;
    expect(em.topZ).toBe(0.3);
    expect(em.polygon!.every((p) => p[1] <= 0 && p[1] >= -2)).toBe(true);
    expect(em.roof).toBeUndefined();
  });

  test('sem guarda-corpo, com comprimento e offset', () => {
    const { quantities: q } = withExtras({ ...deck, side: 'right', length: 3, offset: 1, guardrail: false });
    expect(line(q, 'deck_wood')!.netQty).toBeCloseTo(6, 9);
    expect(line(q, 'guardrail')).toBeUndefined();
  });

  test('coberto: telha = comprimento x (depth + 0,3)/cos10, terças e pilares', () => {
    const { quantities: q, model, pieces } = withExtras({ ...deck, covered: true });
    const area = 6.5 * (2.3 / Math.cos((10 * Math.PI) / 180));
    const roof = model.extras[0]!.roof!;
    expect(roof.area).toBeCloseTo(area, 9);
    expect(roof.slopeDeg).toBeCloseTo(10, 9);
    const l = q.lines.find((x) => x.stage === 'extras' && x.itemId === 'sandwich_eps30')!;
    expect(l.netQty).toBeCloseTo(area, 9);
    expect(pieces.filter((p) => p.hostId === 'd1' && p.role === 'purlin').length).toBeGreaterThanOrEqual(2);
    expect(model.extras[0]!.posts.length).toBeGreaterThanOrEqual(2);
  });
});

describe('arrimo e integração', () => {
  test('arrimo só gera geometria', () => {
    const { quantities: q, model } = withExtras({ id: 'r1', kind: 'retaining', path: [[0, 12], [8, 12]], height: 1.5 });
    expect(model.extras[0]!.kind).toBe('retaining');
    expect(q.lines.filter((l) => l.stage === 'extras')).toHaveLength(0);
  });

  test('sem extras: model.extras vazio', () => {
    expect(run(mk(house)).model.extras).toEqual([]);
  });

  test.each([
    { kind: 'shed', width: 4, depth: 6, lowHeight: 2.6, highHeight: 3.6 },
    { kind: 'flat_roof', width: 5, depth: 8, wallHeight: 2.8 },
  ])('tipologia $kind com todos os extras roda até o peso', (typology) => {
    const r = run(
      mk(typology, {
        extras: [
          { id: 'm', kind: 'wall', path: [[0, -4], [5, -4]] },
          { id: 'c', kind: 'fence', path: [[-3, -3], [8, -3], [8, 10]] },
          { id: 'd', kind: 'deck', side: 'back', covered: true },
          { id: 'r', kind: 'retaining', path: [[0, 12], [4, 12]], height: 1 },
        ],
      }),
    );
    expect(r.model.extras).toHaveLength(4);
    expect(r.weight.totalKg).toBeGreaterThan(0);
  });
});
