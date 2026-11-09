import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { buildModel } from '../../src/model';
import { ceilingZAt } from '../../src';
import { loadProject } from '../../src/load';
import { bbox2 } from '../../src/geometry';
import { testCatalog } from '../helpers/catalog';

const j = JSON.parse(readFileSync(join(import.meta.dirname, '../../fixtures/gable-6.5x8.5-mezzanine.json'), 'utf8'));
const r = loadProject(j);
if (!r.ok) throw new Error(JSON.stringify(r.issues));
const project = r.project;
const m = buildModel(project, testCatalog);
const level = project.levels.find((l) => l.elevation === 0)!.id;
const mezz = m.slabs.find((s) => s.kind === 'mezzanine')!;
const mb = bbox2(mezz.polygon);
const bottom = mezz.topZ - mezz.thickness;

describe('ceilingZAt: gable 6,5 x 8,5 com mezanino', () => {
  test('sob o mezanino: fundo da laje', () => {
    const p: [number, number] = [(mb.min[0] + mb.max[0]) / 2, (mb.min[1] + mb.max[1]) / 2];
    expect(ceilingZAt(m, level, p)).toBeCloseTo(bottom, 6);
  });

  test('pé-direito duplo perto da cumeeira: telhado, bem acima da laje', () => {
    // fora do mezanino: a faixa livre do outro lado em y, sobre a cumeeira (x = 3,25)
    const y = mb.min[1] > 4 ? 1 : mb.max[1] + 1;
    const z = ceilingZAt(m, level, [3.25, y]);
    expect(z).toBeGreaterThan(m.ridgeHeight - 0.2);
    expect(z).toBeGreaterThan(bottom + 1);
  });

  test('perto da parede lateral: telhado, mais baixo', () => {
    const y = mb.min[1] > 4 ? 1 : mb.max[1] + 1;
    const near = ceilingZAt(m, level, [0.2, y]);
    const mid = ceilingZAt(m, level, [3.25, y]);
    expect(near).toBeLessThan(mid - 1);
    expect(near).toBeGreaterThan(2.8);
    // a água é plana: a cota cresce 2·tan(35°) por metro em direção à cumeeira
    expect(mid - near).toBeCloseTo((3.25 - 0.2) * Math.tan((35 * Math.PI) / 180), 2);
  });
});
