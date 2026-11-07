import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { buildModel } from '../../src/model';
import { loadProject } from '../../src/load';
import { computeQuantities } from '../../src/quantities';
import { computeWeight } from '../../src/weight';
import { testCatalog } from '../helpers/catalog';
import { syntheticPieces } from '../helpers/pieces';

const r = loadProject(JSON.parse(readFileSync(join(import.meta.dirname, '../../fixtures/gable-6.5x8.5-mezzanine.json'), 'utf8')));
if (!r.ok) throw new Error('fixture');
const project = r.project;
const model = buildModel(project, testCatalog);
const pieces = syntheticPieces(model, project);
const q = computeQuantities(model, pieces, project, testCatalog);
const w = computeWeight(model, pieces, q, project, testCatalog);

describe('computeWeight', () => {
  test('total = Σ byStage = Σ byElement', () => {
    const st = Object.values(w.byStage).reduce((a, b) => a + b, 0);
    expect(Math.abs(w.totalKg - st) / st).toBeLessThan(0.001);
    const el = w.byElement.reduce((a, b) => a + b.kg, 0);
    expect(Math.abs(w.totalKg - el) / st).toBeLessThan(0.001);
  });

  test('superestrutura < total e kg/m²', () => {
    expect(w.superstructureKg).toBeLessThan(w.totalKg);
    expect(w.superstructureKg).toBeCloseTo(w.totalKg - w.byStage.foundation!, 6);
    expect(w.kgPerM2).toBeCloseTo(w.superstructureKg / model.builtArea, 9);
  });

  test('concreto: volume x densidade e aço bate com o relatório', () => {
    const conc = q.lines.find((l) => l.itemId === 'concrete_fck25')!;
    expect(w.byStage.foundation).toBeCloseTo(conc.netQty * testCatalog.constants.concreteDensity, 6);
    const steel = pieces.reduce((s, p) => s + p.length * testCatalog.profiles.find((x) => x.id === p.profileId)!.massPerM, 0);
    expect(steel).toBeCloseTo(q.steelKg, 6);
  });

  test('elementos com rótulos em pt-BR', () => {
    const label = (id: string) => w.byElement.find((e) => e.id === id)?.label;
    expect(label('ext-front')).toBe('Parede frontal');
    expect(label('roof-a')).toBe('Água A');
    expect(label('roof-b')).toBe('Água B');
    expect(label('slab-L1')).toBe('Mezanino');
    expect(label('radier')).toBe('Radier');
    expect(label('s1')).toBe('Escada s1');
    expect(label('w-bath-1')).toBe('Parede w-bath-1');
  });
});
