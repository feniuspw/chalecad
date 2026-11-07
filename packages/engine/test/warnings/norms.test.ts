import { describe, expect, test } from 'vitest';
import { computeAll } from '../../src/compute';
import { testCatalog } from '../helpers/catalog';
import { mk } from '../helpers/inline';

// Chalé parecido com o do usuário: A-frame 6 × 9, frente envidraçada, cômodo à direita, mezanino na frente.
const base = (extra: Record<string, unknown> = {}, typo: Record<string, unknown> = {}) =>
  mk(
    {
      kind: 'a_frame', width: 6, depth: 9, ridgeHeight: 7.5, frontGable: 'glazed', backGable: 'closed',
      annexes: [{ side: 'right', width: 2.5, length: 8, offset: 0.5, height: 3.17, pitchDeg: 12, eave: 0.4 }],
      ...typo,
    },
    {
      levels: [
        { id: 'L0', elevation: 0, floor: 'polished_concrete' },
        { id: 'L1', elevation: 2.6, polygon: [[1.04, 0], [4.96, 0], [4.96, 3.7], [1.04, 3.7]], deck: 'osb18', guardrail: true },
      ],
      stairs: [{ id: 's1', type: 'straight', from: 'L0', to: 'L1', position: [3.4, 8.3], rotationDeg: 180, width: 0.8 }],
      openings: [
        { id: 'o1', host: 'ext-front', type: 'sliding_door', offset: 2.2, width: 1.6, height: 2.1, sill: 0 },
        { id: 'o2', host: 'annex-right-side', type: 'window', offset: 1.4, width: 1.2, height: 1, sill: 1 },
      ],
      ...extra,
    },
  );

const codes = (r: ReturnType<typeof computeAll>) => r.warnings.map((w) => w.code);

describe('alertas de norma', () => {
  const r = computeAll(base(), testCatalog);

  test('empuxo do A-frame com valor em kN/m', () => {
    const w = r.warnings.find((x) => x.code === 'norm.aframe_thrust')!;
    expect(w.severity).toBe('warn');
    const kN = Number(/cerca de ([\d,]+) kN/.exec(w.message)![1]!.replace(',', '.'));
    expect(kN).toBeGreaterThan(0.2);
    expect(kN).toBeLessThan(5);
  });

  test('vidro de segurança: fachada envidraçada e porta de correr', () => {
    const glass = r.warnings.filter((x) => x.code === 'norm.safety_glass');
    expect(glass.map((x) => x.severity).sort()).toEqual(['info', 'warn']);
  });

  test('iluminação: cômodo de 20 m² com janela de 1,2 m² não basta; corpo envidraçado basta', () => {
    const light = r.warnings.filter((x) => x.code === 'norm.lighting');
    expect(light).toHaveLength(1);
    expect(light[0]!.message).toMatch(/Cômodo à direita/);
  });

  test('pé-direito sob o mezanino (2,38 m) é aviso informativo; guarda-corpo e escada lembrados', () => {
    const ceil = r.warnings.find((x) => x.code === 'norm.ceiling' && x.refs?.includes('slab-L1'))!;
    expect(ceil.severity).toBe('info');
    expect(codes(r)).toEqual(expect.arrayContaining(['norm.guardrail', 'norm.stair_guard']));
    expect(codes(r)).not.toContain('norm.stair_headroom');
  });

  test('escada sob o mezanino: falta altura livre', () => {
    const under = computeAll(base({ stairs: [{ id: 's1', type: 'straight', from: 'L0', to: 'L1', position: [2.6, 0.3], rotationDeg: 0, width: 0.8 }] }), testCatalog);
    expect(codes(under)).toContain('norm.stair_headroom');
  });

  test('cômodo lateral baixo e mezanino sem guarda-corpo viram aviso', () => {
    const p = base(
      {
        levels: [
          { id: 'L0', elevation: 0, floor: 'polished_concrete' },
          { id: 'L1', elevation: 2.6, polygon: [[1.04, 0], [4.96, 0], [4.96, 3.7], [1.04, 3.7]], deck: 'osb18', guardrail: false },
        ],
      },
      { annexes: [{ side: 'right', width: 3, length: 5, offset: 2, height: 2.6, pitchDeg: 8, eave: 0.4 }] },
    );
    const w = computeAll(p, testCatalog).warnings;
    expect(w.find((x) => x.code === 'norm.guardrail')!.severity).toBe('warn');
    expect(w.find((x) => x.code === 'norm.ceiling' && x.refs?.includes('annex-right-roof'))!.severity).toBe('warn');
  });

  test('verga reprovada recebe sugestão de perfil', () => {
    const checks = r.structure!.checks.filter((x) => x.kind === 'header');
    // porta na fachada envidraçada fica na caixilharia: sem verga de aço
    expect(checks.some((x) => x.hostIds.includes('ext-front'))).toBe(false);
    const h = checks.find((x) => x.hostIds.includes('annex-right-side'))!;
    expect(h.status).toBe('fail');
    expect(h.suggestion?.text).toMatch(/Verga em caixa com \d × Ue/);
    expect(h.suggestion?.deltaKg).toBeGreaterThan(0);
    expect(h.suggestion?.profileId).toBeUndefined();
  });

  test('escada com piso calculado fecha Blondel', () => {
    const s = r.model.stairs[0]!;
    expect(s.blondel).toBeGreaterThanOrEqual(0.63 - 1e-9);
    expect(s.blondel).toBeLessThanOrEqual(0.64 + 1e-9);
    expect(codes(r)).not.toContain('stair.blondel');
  });
});
