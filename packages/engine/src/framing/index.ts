import type { Catalog } from '@chalecad/catalog';
import type { Project } from '../schema/project';
import type { BuildingModel, Piece } from '../schema/results';
import { generateExtras } from './extras';
import { generateMezzanines } from './mezzanine';
import { framers } from './roof';
import { generateStairs } from './stairs';
import { PieceSink } from './util';
import { generateWalls } from './walls';

export { framers } from './roof';
export type { RoofFramer } from './roof';

/** Gera todas as peças de aço LSF (paredes, mezaninos, cobertura e escadas). */
export function generatePieces(model: BuildingModel, project: Project, catalog: Catalog): Piece[] {
  const sink = new PieceSink();
  generateWalls(model, project, catalog, sink);
  generateMezzanines(model, project, catalog, sink);
  framers[model.typology]?.(model, project, catalog, sink);
  generateStairs(model, project, catalog, sink);
  generateExtras(model, project, catalog, sink);
  return sink.pieces;
}
