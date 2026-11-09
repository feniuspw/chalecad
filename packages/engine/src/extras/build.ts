import { offsetPolygon, type Vec2 } from '../geometry';
import type { Project } from '../schema/project';
import type { ExtraModel } from '../schema/results';
import { flatSurface } from '../terrain/surface';
import { buildDeckModel } from './deckFrame';
import { axisFootprint, fenceModel, retainingModel, wallModel, type ExtrasConstants } from './geometry';
import { waterTowerModel, type ExtraBuildContext } from './water_tower';

/** Contorno externo das paredes a partir do radier (que o passa de `border`); sem radier, o retângulo dos eixos. */
function footprintFromSlabs(project: Project, ctx?: ExtraBuildContext): Vec2[] {
  const radier = ctx?.slabs.find((s) => s.id === 'radier');
  return radier ? offsetPolygon(radier.polygon, -project.system.foundation.border) : axisFootprint(project);
}

/**
 * Geometria 3D dos extras (muro, cerca, deck, arrimo, torre da caixa d'água) na ordem de `project.extras`.
 * O deck sai aqui sobre terreno plano; `attachDeckFrames` o refaz com o terreno acabado e as aberturas.
 */
export function buildExtraModels(project: Project, x: ExtrasConstants, ctx?: ExtraBuildContext): ExtraModel[] {
  return project.extras.map((e) => {
    switch (e.kind) {
      case 'fence':
        return fenceModel(e, x);
      case 'wall':
        return wallModel(e, x);
      case 'deck':
        return buildDeckModel(project, e, x, {
          footprint: footprintFromSlabs(project, ctx),
          roofPlanes: ctx?.roofPlanes ?? [],
          surface: flatSurface(),
          openings: [],
          walls: [],
        });
      case 'retaining':
        return retainingModel(e, x);
      case 'water_tower':
        return waterTowerModel(project, e, x, ctx);
    }
  });
}
