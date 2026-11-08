import type { Catalog } from '@chalecad/catalog';
import type { Item } from '../../quantities/items';
import type { Project } from '../../schema/project';
import type { BuildingModel, ElectricalReport, EngineWarning } from '../../schema/results';

export interface ElectricalResult {
  report: ElectricalReport;
  items: Item[];
  warnings: EngineWarning[];
}

/**
 * Projeto elétrico (NBR 5410) sobre o traçado efetivo: o salvo em `installations.electrical` quando `manual`, senão o
 * gerado a partir dos cômodos e móveis. Card F16-E1. `null` enquanto não implementado.
 */
export function computeElectrical(_project: Project, _model: BuildingModel, _catalog: Catalog): ElectricalResult | null {
  return null;
}
