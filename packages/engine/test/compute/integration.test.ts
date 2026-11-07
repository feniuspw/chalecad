import { describe, expect, test } from 'vitest';
import { getCatalog } from '@chalecad/catalog';
import { computeAll } from '../../src';
import { loadFixture } from '../helpers/load';

describe('computeAll com o pipeline real', () => {
  const catalog = getCatalog();

  test('chalé 6,5 x 8,5 com mezanino: resultados completos em < 300 ms', () => {
    const project = loadFixture('gable-6.5x8.5-mezzanine.json');
    computeAll(project, catalog); // aquece o JIT
    const t0 = performance.now();
    const r = computeAll(project, catalog);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(300);
    expect(r.pieces.length).toBeGreaterThan(300);
    expect(r.quantities.lines.length).toBeGreaterThan(30);
    expect(r.budget.total).toBeGreaterThan(50_000);
    expect(r.budget.missingPrices).toEqual([]);
    expect(r.weight.totalKg).toBeGreaterThan(r.weight.superstructureKg);
    expect(r.model.openings.every((o) => o.valid)).toBe(true);
    console.info(
      `[fixture] ${ms.toFixed(1)} ms · ${r.pieces.length} peças · aço ${r.quantities.steelKgPerM2.toFixed(1)} kg/m² · total R$ ${r.budget.total.toFixed(0)} (${r.budget.perM2.toFixed(0)}/m²) · peso ${r.weight.totalKg.toFixed(0)} kg`,
    );
  });

  test('A-frame mínimo calcula', () => {
    const r = computeAll(loadFixture('aframe-minimal.json'), catalog);
    expect(r.pieces.some((p) => p.role === 'rafter')).toBe(true);
    expect(r.budget.total).toBeGreaterThan(0);
  });

  test('determinístico', () => {
    const p = loadFixture('gable-6.5x8.5-mezzanine.json');
    const a = computeAll(p, catalog);
    const b = computeAll(p, catalog);
    expect({ ...a, timingsMs: {} }).toEqual({ ...b, timingsMs: {} });
  });
});
