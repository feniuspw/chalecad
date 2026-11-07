import { describe, expect, it } from 'vitest';
import { buildModel, loadProject, type Project } from '@chalecad/engine';
import { getCatalog } from '@chalecad/catalog';
import fixture from '../../../../packages/engine/fixtures/gable-6.5x8.5-mezzanine.json';
import { createProject } from './templates';
import type { IdGen } from './ids';

const seq = (): IdGen => {
  const n: Record<string, number> = {};
  return (p) => `${p}-${(n[p] = (n[p] ?? 0) + 1)}`;
};

/** Remove IDs e troca hospedeiros de parede do usuário pelo índice, para comparar estrutura. */
function shape(p: Project) {
  const wallIdx = new Map(p.walls.map((w, i) => [w.id, `wall#${i}`]));
  return {
    typology: p.typology,
    levels: p.levels.map(({ id: _id, ...l }) => l),
    walls: p.walls.map((w) => ({ level: w.level, from: w.from, to: w.to, wet: w.wet })),
    openings: p.openings
      .map(({ id: _id, host, ...o }) => ({ host: wallIdx.get(host) ?? host, ...o }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    stairs: p.stairs.map(({ id: _id, ...s }) => s),
    utilities: p.utilities.map(({ id: _id, ...u }) => u),
    roof: p.roof,
    system: p.system,
  };
}

describe('createProject', () => {
  it('gable_mezzanine padrão é igual ao fixture 6,5 x 8,5', () => {
    const ref = loadProject(fixture);
    if (!ref.ok) throw new Error('fixture inválido');
    const p = createProject('gable_mezzanine', {}, seq());
    expect(shape(p)).toEqual(shape(ref.project));
  });

  it('usa IDs prefixados e únicos por padrão', () => {
    const p = createProject('gable_mezzanine');
    expect(p.walls.every((w) => /^w-[0-9a-f]{8}$/.test(w.id))).toBe(true);
    expect(p.openings.every((o) => /^o-[0-9a-f]{8}$/.test(o.id))).toBe(true);
    expect(p.stairs.every((s) => /^s-[0-9a-f]{8}$/.test(s.id))).toBe(true);
    const q = createProject('gable_mezzanine');
    expect(q.openings[0]!.id).not.toBe(p.openings[0]!.id);
  });

  it.each([
    ['gable_mezzanine', { width: 4, depth: 5.5 }],
    ['gable_mezzanine', { width: 3, depth: 4, mezzanine: false }],
    ['gable_mezzanine', { width: 10, depth: 14, wallHeight: 3.2 }],
    ['a_frame', {}],
    ['a_frame', { width: 4.5, depth: 6, ridgeHeight: 5, mezzanine: false }],
  ] as const)('%s %j gera projeto válido e modelo calculável', (kind, params) => {
    const p = createProject(kind, params);
    expect(loadProject(p).ok).toBe(true);
    const m = buildModel(p, getCatalog());
    expect(m.builtArea).toBeGreaterThan(0);
    for (const o of p.openings) {
      const host = p.walls.find((w) => w.id === o.host);
      const len = host ? Math.hypot(host.to[0] - host.from[0], host.to[1] - host.from[1]) : o.host === 'ext-front' ? p.typology.width : p.typology.depth;
      expect(o.offset + o.width).toBeLessThanOrEqual(len + 1e-6);
    }
  });

  it('a_frame tem mezanino no fundo, porta e empena frontal envidraçada', () => {
    const p = createProject('a_frame');
    expect(p.typology.kind === 'a_frame' && p.typology.frontGable).toBe('glazed');
    expect(p.openings.some((o) => o.type === 'door' && o.host === 'ext-front')).toBe(true);
    const mezz = p.levels.find((l) => l.polygon)!;
    expect(Math.max(...mezz.polygon!.map((v) => v[1]))).toBe(p.typology.depth);
    expect(createProject('a_frame', { mezzanine: false }).levels).toHaveLength(1);
  });
});
