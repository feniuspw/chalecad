import type { Catalog } from '@chalecad/catalog';
import type { Item } from '../quantities/items';
import type { Project } from '../schema/project';
import type { BuildingModel, EngineWarning, PerformanceReport } from '../schema/results';
import { computeRain } from './rain';
import { computeSolar } from './solar';
import { computeThermal } from './thermal';

export { computeThermal } from './thermal';
export { computeSolar, orientationFactor, tiltFactor, pickRoofPlane, USABLE_ROOF_FRACTION } from './solar';
export { computeRain } from './rain';
export { occupantsOf } from './occupants';

export interface PerformanceResult {
  report: PerformanceReport;
  /** Itens de quantidade (solar e chuva); vazio sem as flags. */
  items: Item[];
  warnings: EngineWarning[];
}

/** Térmico sempre; solar e chuva só com `project.performance.solar` / `rainwater`. */
export function computePerformance(project: Project, model: BuildingModel, catalog: Catalog): PerformanceResult {
  const thermal = computeThermal(project, catalog);
  const items: Item[] = [];
  const warnings = [...thermal.warnings];
  let solar: PerformanceReport['solar'] = null;
  let rain: PerformanceReport['rain'] = null;
  if (project.performance.solar) {
    const s = computeSolar(project, model, catalog);
    solar = s.report;
    items.push(...s.items);
    warnings.push(...s.warnings);
  }
  if (project.performance.rainwater) {
    const r = computeRain(project, model, catalog);
    rain = r.report;
    items.push(...r.items);
  }
  return {
    report: { zone: thermal.zone, zoneSource: thermal.zoneSource, thermal: thermal.elements, solar, rain },
    items,
    warnings,
  };
}
