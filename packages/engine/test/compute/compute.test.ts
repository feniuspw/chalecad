import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { computeAllWith, computeFromJsonWith } from '../../src/compute';
import { loadProject } from '../../src/load';
import { testCatalog } from '../helpers/catalog';
import { syntheticPieces } from '../helpers/pieces';

const json = JSON.parse(readFileSync(join(import.meta.dirname, '../../fixtures/gable-6.5x8.5-mezzanine.json'), 'utf8'));
const r = loadProject(json);
if (!r.ok) throw new Error('fixture');
const project = r.project;
const deps = { generatePieces: (m: Parameters<typeof syntheticPieces>[0], p: typeof project) => syntheticPieces(m, p) };

// Quando o framing real chegar (integração), o orquestrador troca `deps` por `generatePieces` de '../../src/framing'
// e habilita o teste com o gerador real em `test.skipIf(!hasFraming)` abaixo.
describe('computeAllWith', () => {
  const res = computeAllWith(project, testCatalog, undefined, deps);

  test('roda o pipeline do fixture 6,5 x 8,5', () => {
    expect(res.engineVersion).toBe('0.1.0');
    expect(res.catalogVersion).toBe(testCatalog.version);
    expect(res.structure).not.toBeNull(); // F2-E1: motor estrutural integrado
    expect(res.terrain).toBeNull();
    expect(res.pieces.length).toBeGreaterThan(0);
    expect(res.budget.total).toBeGreaterThan(0);
    expect(Object.keys(res.timingsMs).sort()).toEqual(['budget', 'framing', 'model', 'performance', 'quantities', 'structure', 'total', 'warnings', 'weight']);
  });

  test('serializável e determinístico (exceto timingsMs)', () => {
    const again = computeAllWith(project, testCatalog, undefined, deps);
    const strip = (x: typeof res) => ({ ...x, timingsMs: {} });
    expect(JSON.parse(JSON.stringify(strip(res)))).toEqual(strip(res));
    expect(strip(again)).toEqual(strip(res));
  });

  test('today padrão = data da base de preços', () => {
    const late = computeAllWith(project, testCatalog, { today: '2030-01-01' }, deps);
    expect(late.budget.stalePrices.length).toBeGreaterThan(0);
    expect(res.budget.stalePrices).toEqual([]);
  });
});

describe('computeFromJsonWith', () => {
  test('JSON válido', () => {
    const o = computeFromJsonWith(json, testCatalog, undefined, deps);
    expect(o.ok).toBe(true);
  });
  test('JSON inválido devolve issues', () => {
    const o = computeFromJsonWith({ schemaVersion: 1 }, testCatalog, undefined, deps);
    expect(o.ok).toBe(false);
    if (!o.ok) expect(o.issues.length).toBeGreaterThan(0);
  });
});
