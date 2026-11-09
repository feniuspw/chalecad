import type { Catalog } from '@chalecad/catalog';
import type { Project } from '../schema/project';
import type { BuildingModel } from '../schema/results';
import type { SiteSurface } from '../terrain/surface';

/**
 * Fase 18 (card F18-D). Preenche `ExtraModel.deck` de cada deck com barrotes, vigas, pilares até o terreno acabado,
 * fundações, escadas, guarda-corpo e verificações. Roda em `compute` depois do terreno; muta `model.extras`.
 */
export function attachDeckFrames(_project: Project, _model: BuildingModel, _surface: SiteSurface, _catalog: Catalog): void {
  // Implementado no card F18-D.
}
