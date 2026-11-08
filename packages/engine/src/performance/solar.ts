import { findPriceItem, getMaterial, getPriceBook, type Catalog } from '@chalecad/catalog';
import type { Project } from '../schema/project';
import type { BuildingModel, EngineWarning, RoofPlane, SolarReport } from '../schema/results';
import type { Item } from '../quantities/items';
import { occupantsOf } from './occupants';

/**
 * Fator de orientação (heurística simples): 1 norte, 0,9 leste/oeste, 0,75 sul, interpolado linearmente pelo desvio
 * azimutal da normal da água em relação ao norte (0°, 90°, 180°).
 */
export function orientationFactor(deviationDeg: number): number {
  const d = Math.min(180, Math.abs(deviationDeg));
  return d <= 90 ? 1 - 0.1 * (d / 90) : 0.9 - 0.15 * ((d - 90) / 90);
}

/** Fator de inclinação: 1 entre 10° e 30°, perdendo 0,4% por grau fora dessa faixa (mínimo 0,85). */
export function tiltFactor(slopeDeg: number): number {
  const out = slopeDeg < 10 ? 10 - slopeDeg : Math.max(0, slopeDeg - 30);
  return Math.max(0.85, 1 - 0.004 * out);
}

/** Normal externa da água projetada em planta (azimute em graus horários a partir de +y), ou null se for horizontal. */
function normalAzimuth(r: RoofPlane): number | null {
  const [u, v] = [r.uAxis, r.vAxis];
  const nx = u[1] * v[2] - u[2] * v[1];
  const ny = u[2] * v[0] - u[0] * v[2];
  if (Math.hypot(nx, ny) < 1e-9) return null;
  return ((Math.atan2(nx, ny) * 180) / Math.PI + 360) % 360;
}

export function pickRoofPlane(model: BuildingModel, northDeg: number): { plane: RoofPlane; factor: number } | null {
  let best: { plane: RoofPlane; factor: number } | null = null;
  for (const r of model.roofPlanes) {
    const az = normalAzimuth(r);
    const dev = az === null ? 0 : ((az - northDeg + 540) % 360) - 180;
    const factor = orientationFactor(dev) * tiltFactor(r.slopeDeg);
    if (!best || factor > best.factor + 1e-9) best = { plane: r, factor };
  }
  return best;
}

export interface SolarResult {
  report: SolarReport;
  items: Item[];
  warnings: EngineWarning[];
}

/** Útil da água para módulos: fração da área inclinada. */
export const USABLE_ROOF_FRACTION = 0.8;

export function computeSolar(project: Project, model: BuildingModel, catalog: Catalog): SolarResult {
  const k = catalog.constants.performance.solar;
  const occupants = occupantsOf(project, catalog);
  const shower = project.installations.waterHeater === 'electric_shower' ? occupants * k.showerKWhPerPersonMonth : 0;
  const monthlyKWh = occupants * k.kWhPerPersonMonth + shower;
  const target = Math.max(0, monthlyKWh - k.minBillKWh);
  const hspValues = Object.values(k.hspByUF);
  const hsp = k.hspByUF[project.meta.region] ?? hspValues.reduce((a, b) => a + b, 0) / hspValues.length;
  const kWp = (target * 12) / (hsp * 365 * k.performanceRatio);
  const modules = Math.ceil((kWp * 1000) / k.moduleWp - 1e-9);
  const areaM2 = modules * k.moduleArea;
  const installedWp = modules * k.moduleWp;

  const pick = pickRoofPlane(model, project.meta.northDeg);
  const usable = pick ? pick.plane.area * USABLE_ROOF_FRACTION : 0;
  const fits = pick !== null && areaM2 <= usable + 1e-9;
  const factor = pick?.factor ?? 1;

  const price = findPriceItem(getPriceBook(catalog, project.priceBookId), 'mat-pv_system');
  const override = project.priceOverrides['mat-pv_system'];
  const unit = override?.price ?? price?.price ?? 0;
  const unitMax = override?.priceMax ?? price?.priceMax ?? unit;
  const cost = installedWp * unit;
  const costMax = installedWp * unitMax;
  const annualKWh = (installedWp / 1000) * hsp * 365 * k.performanceRatio * factor;
  // energia que passa de (consumo − taxa mínima) não gera economia
  const savedKWh = Math.min(annualKWh, target * 12);
  const savingsPerYear = savedKWh * k.tariff;

  const report: SolarReport = {
    monthlyKWh,
    kWp: Math.round(kWp * 1000) / 1000,
    modules,
    areaM2: Math.round(areaM2 * 100) / 100,
    roofPlaneId: pick?.plane.id ?? null,
    fits,
    annualKWh: Math.round(annualKWh),
    cost: Math.round(cost * 100) / 100,
    costMax: Math.round(costMax * 100) / 100,
    savingsPerYear: Math.round(savingsPerYear * 100) / 100,
    paybackYears: savingsPerYear > 0 ? Math.round((cost / savingsPerYear) * 10) / 10 : 0,
  };

  const warnings: EngineWarning[] = [];
  if (modules > 0 && !fits) {
    const fm = (n: number) => n.toFixed(1).replace('.', ',');
    warnings.push({
      code: 'solar.area',
      severity: 'info',
      message: `Os ${modules} módulos pedem ${fm(areaM2)} m², mais que os ${fm(usable)} m² úteis da melhor água do telhado: use mais de uma água, solo ou reduza o consumo`,
      ...(pick ? { refs: [pick.plane.id] } : {}),
    });
  }

  // Preço por Wp do sistema instalado: o material tem `laborIncluded`, então a mão de obra % da etapa não soma em cima.
  const items: Item[] =
    modules > 0
      ? [
          {
            hostId: 'solar',
            stage: 'installations',
            itemId: 'pv_system',
            net: installedWp,
            kg: installedWp * getMaterial(catalog, 'pv_system').massPerUnit,
            inWeight: false,
            note: `${modules} módulos de ${k.moduleWp} Wp, preço do sistema instalado`,
          },
        ]
      : [];
  return { report, items, warnings };
}
