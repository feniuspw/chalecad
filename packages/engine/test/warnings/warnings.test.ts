import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildModel } from '../../src/model';
import { loadProject } from '../../src/load';
import { computeBudget } from '../../src/budget';
import { computeQuantities } from '../../src/quantities';
import { computeWeight } from '../../src/weight';
import { computeWarnings } from '../../src/warnings';
import type { Project } from '../../src/schema/project';
import { testCatalog } from '../helpers/catalog';
import { syntheticPieces } from '../helpers/pieces';

const r = loadProject(JSON.parse(readFileSync(join(import.meta.dirname, '../../fixtures/gable-6.5x8.5-mezzanine.json'), 'utf8')));
if (!r.ok) throw new Error('fixture');
const base = r.project;

function warn(project: Project, mutate?: (c: Parameters<typeof computeWarnings>[0]) => void) {
  const model = buildModel(project, testCatalog);
  const pieces = syntheticPieces(model, project);
  const quantities = computeQuantities(model, pieces, project, testCatalog);
  const weight = computeWeight(model, pieces, quantities, project, testCatalog);
  const budget = computeBudget(quantities, weight, model, project, testCatalog, '2026-11-07');
  const ctx = { project, model, pieces, quantities, budget, catalog: testCatalog };
  mutate?.(ctx);
  return computeWarnings(ctx);
}
const codes = (ws: { code: string }[]) => ws.map((w) => w.code);

describe('computeWarnings', () => {
  test('abertura inválida é erro e vem primeiro', () => {
    const p: Project = { ...base, openings: [...base.openings, { id: 'ox', host: 'nao-existe', type: 'window', offset: 0, width: 1, height: 1, sill: 0.9 }] };
    const ws = warn(p);
    expect(ws[0]!.code).toBe('opening.invalid');
    expect(ws[0]!.severity).toBe('error');
    expect(ws[0]!.refs).toContain('ox');
    const rank = { error: 0, warn: 1, info: 2 } as const;
    const ranks = ws.map((w) => rank[w.severity]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  test('modulação: sugere deslocamento que alinha ao montante', () => {
    const p: Project = {
      ...base,
      openings: [{ id: 'om', host: 'ext-front', type: 'window', offset: 0.67, width: 1.2, height: 1.2, sill: 0.9 }],
    };
    const w = warn(p).find((x) => x.code === 'opening.modulation');
    expect(w).toBeDefined();
    expect(w!.message).toContain('mover 7 cm para a esquerda economiza 2 montantes');
    expect(w!.refs).toContain('om');
  });

  test('modulação: deslocamento para a direita', () => {
    const p: Project = { ...base, openings: [{ id: 'om', host: 'ext-front', type: 'window', offset: 0.53, width: 1.2, height: 1.2, sill: 0.9 }] };
    expect(warn(p).find((x) => x.code === 'opening.modulation')!.message).toContain('mover 7 cm para a direita');
  });

  test('modulação: abertura já alinhada não gera sugestão', () => {
    const p: Project = { ...base, openings: [{ id: 'om', host: 'ext-front', type: 'window', offset: 0.6, width: 1.2, height: 1.2, sill: 0.9 }] };
    expect(codes(warn(p))).not.toContain('opening.modulation');
  });

  test('steel.index fora da faixa', () => {
    const ws = warn(base, (c) => {
      c.quantities = { ...c.quantities, steelKgPerM2: 999 };
    });
    expect(codes(ws)).toContain('steel.index');
    const ok = warn(base, (c) => {
      c.quantities = { ...c.quantities, steelKgPerM2: (c.catalog.constants.steelIndexRange[0] + c.catalog.constants.steelIndexRange[1]) / 2 };
    });
    expect(codes(ok)).not.toContain('steel.index');
  });

  test('preços faltantes e antigos', () => {
    const ws = warn(base, (c) => {
      c.budget = { ...c.budget, missingPrices: ['a', 'b'], stalePrices: ['c'] };
    });
    expect(ws.find((x) => x.code === 'price.missing')!.severity).toBe('warn');
    expect(ws.find((x) => x.code === 'price.missing')!.message).toContain('2');
    expect(ws.find((x) => x.code === 'price.stale')!.severity).toBe('info');
  });

  test('escada: espelho e Blondel', () => {
    const ws = warn(base, (c) => {
      c.model = { ...c.model, stairs: [{ id: 'st', type: 'straight', treads: [], steps: 10, riser: 0.25, going: 0.1, blondel: 0.6, footprint: [] }] };
    });
    expect(codes(ws)).toEqual(expect.arrayContaining(['stair.riser', 'stair.blondel']));
  });

  test('mezanino: altura livre sob o mezanino', () => {
    const ws = warn(base, (c) => {
      c.model = { ...c.model, slabs: c.model.slabs.map((s) => (s.kind === 'mezzanine' ? { ...s, topZ: 2.0 } : s)) };
    });
    expect(ws.filter((x) => x.code === 'mezzanine.headroom').length).toBeGreaterThan(0);
  });

  test('mezanino: telhado baixo no centro', () => {
    const ws = warn(base, (c) => {
      c.model = { ...c.model, slabs: c.model.slabs.map((s) => (s.kind === 'mezzanine' ? { ...s, topZ: c.model.ridgeHeight - 0.5 } : s)) };
    });
    expect(ws.some((x) => x.code === 'mezzanine.headroom' && /telhado/.test(x.message))).toBe(true);
  });

  test('typology.partial sem peças de cobertura; extras e terreno inclinado', () => {
    const p: Project = {
      ...base,
      site: { type: 'sloped', slopePct: 20, downhillAzimuthDeg: 180, platformMargin: { front: 3, back: 1.5, left: 1.5, right: 1.5 }, platformElevation: 'auto', cutSlopeHV: 1, fillSlopeHV: 1.5, disposalDistanceKm: 10 },
      extras: [{ id: 'e1', kind: 'retaining', path: [[0, 0], [5, 0]], height: 1, type: 'block', drainage: true }],
    };
    const ws = warn(p, (c) => {
      c.pieces = c.pieces.filter((x) => !['rafter', 'purlin', 'ridge', 'collar_tie'].includes(x.role));
    });
    expect(codes(ws)).toEqual(expect.arrayContaining(['typology.partial', 'extras.ignored', 'site.sloped']));
    expect(codes(warn(base))).not.toContain('typology.partial');
  });
});
