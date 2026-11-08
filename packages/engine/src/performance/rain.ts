import { getMaterial, type Catalog } from '@chalecad/catalog';
import { collectItems, type Item } from '../quantities/items';
import type { Project } from '../schema/project';
import type { BuildingModel, RainReport } from '../schema/results';
import { occupantsOf } from './occupants';

export interface RainResult {
  report: RainReport;
  items: Item[];
}

/** Captação de água de chuva para uso não potável (NBR 15527, simplificado). */
export function computeRain(project: Project, model: BuildingModel, catalog: Catalog): RainResult {
  const k = catalog.constants.performance.rain;
  const inst = catalog.constants.installations;
  const mmValues = Object.values(k.mmPerYearByUF);
  const mm = k.mmPerYearByUF[project.meta.region] ?? mmValues.reduce((a, b) => a + b, 0) / mmValues.length;

  // projeção em planta de cada água: área inclinada × cos(inclinação)
  const roofAreaM2 = model.roofPlanes.reduce((s, r) => s + r.area * Math.cos((r.slopeDeg * Math.PI) / 180), 0);
  const annualLiters = roofAreaM2 * mm * k.runoff;
  const dailyDemand = occupantsOf(project, catalog) * inst.waterPerPerson * k.nonPotableShare;
  const demandLitersYear = dailyDemand * 365;

  const need = Math.min(dailyDemand * k.reserveDays, annualLiters / 12);
  const sizes = [...inst.tankSizes].sort((a, b) => a - b);
  const tankLiters = need > 0 ? (sizes.find((s) => s >= need - 1e-9) ?? sizes[sizes.length - 1]!) : 0;

  const report: RainReport = {
    roofAreaM2: Math.round(roofAreaM2 * 100) / 100,
    annualLiters: Math.round(annualLiters),
    demandLitersYear: Math.round(demandLitersYear),
    tankLiters,
    coverage: demandLitersYear > 0 ? Math.min(1, annualLiters / demandLitersYear) : 0,
  };

  const items: Item[] = [];
  if (tankLiters > 0) {
    const add = (itemId: string, net: number, extra: Partial<Item> = {}) => {
      const m = getMaterial(catalog, itemId);
      items.push({ hostId: 'rain', stage: 'installations', itemId, net, kg: net * m.massPerUnit, inWeight: false, ...extra });
    };
    add(`water_tank_${tankLiters}`, 1, { note: 'reservatório de água de chuva' });
    add('rain_filter', 1);
    add('pump_small', 1);
    // calhas: se `roof.gutters` já as orça, não duplica; senão entram aqui (mesma regra do telhado)
    if (!project.roof.gutters) {
      const withGutters = { ...project, roof: { ...project.roof, gutters: true } };
      for (const it of collectItems(model, withGutters, catalog)) {
        if (it.itemId === 'gutter') items.push({ ...it, hostId: 'rain', note: 'calha para a captação de chuva' });
      }
    }
  }
  return { report, items };
}
