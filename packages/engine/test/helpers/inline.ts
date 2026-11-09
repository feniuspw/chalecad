import { attachDeckFrames } from '../../src/extras/deckFrame';
import { generatePieces } from '../../src/framing';
import { loadProject } from '../../src/load';
import { buildModel } from '../../src/model';
import { computeQuantities } from '../../src/quantities';
import type { Project } from '../../src/schema';
import { flatSurface } from '../../src/terrain/surface';
import { computeWeight } from '../../src/weight';
import { testCatalog } from './catalog';

/** Projeto a partir de JSON cru (mínimo: typology; resto por defaults). */
export function mk(typology: unknown, extra: Record<string, unknown> = {}): Project {
  const r = loadProject({
    schemaVersion: 1,
    meta: { name: 'teste' },
    typology,
    levels: [{ id: 'L0', elevation: 0, floor: 'polished_concrete' }],
    ...extra,
  });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.project;
}

/** buildModel → generatePieces → computeQuantities → computeWeight. */
export function run(project: Project) {
  const model = buildModel(project, testCatalog);
  const pieces = generatePieces(model, project, testCatalog);
  attachDeckFrames(project, model, flatSurface(), testCatalog);
  const quantities = computeQuantities(model, pieces, project, testCatalog);
  const weight = computeWeight(model, pieces, quantities, project, testCatalog);
  return { model, pieces, quantities, weight };
}
