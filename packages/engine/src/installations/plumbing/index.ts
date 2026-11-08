import type { Catalog } from '@chalecad/catalog';
import type { Item } from '../../quantities/items';
import type { Project } from '../../schema/project';
import type { BuildingModel, EngineWarning, PlumbingReport } from '../../schema/results';

export interface PlumbingResult {
  report: PlumbingReport;
  items: Item[];
  warnings: EngineWarning[];
}

/**
 * Hidráulica (NBR 5626 / 8160) sobre o traçado efetivo: o salvo em `installations.plumbing` quando `manual`, senão a
 * árvore gerada a partir da caixa. Card F16-E2. `null` enquanto não implementado.
 */
export function computePlumbing(_project: Project, _model: BuildingModel, _catalog: Catalog): PlumbingResult | null {
  return null;
}
