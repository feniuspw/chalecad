import { findPriceItem, getPriceBook, STAGE_ORDER, type Catalog, type LaborRate } from '@chalecad/catalog';
import type { Project } from '../schema/project';
import type {
  BudgetLine,
  BudgetReport,
  BudgetStage,
  BuildingModel,
  QuantityReport,
  WeightReport,
} from '../schema/results';

const DAY_MS = 86_400_000;

function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS;
}

/**
 * Orçamento a partir dos quantitativos. `BudgetStage.total/totalMax` = material + mão de obra + frete,
 * sem contingência (a contingência entra só em `BudgetReport.contingency/total/totalMax` e no cronograma).
 */
export function computeBudget(
  q: QuantityReport,
  w: WeightReport,
  model: BuildingModel,
  project: Project,
  catalog: Catalog,
  today: string,
): BudgetReport {
  void w;
  const book = getPriceBook(catalog, project.priceBookId);
  const laborFactor = catalog.constants.laborRegionalFactor[project.meta.region] ?? 1;
  const staleDays = catalog.constants.priceStaleDays;
  const { contingencyPct, diyStages, freight, durationsWeeks } = project.budget;

  const lines: BudgetLine[] = [];
  const missingPrices: string[] = [];
  const stalePrices: string[] = [];
  for (const l of q.lines) {
    const override = project.priceOverrides[l.priceItemId];
    const item = findPriceItem(book, l.priceItemId);
    const src = override ?? item;
    const price = src?.price ?? 0;
    const priceMax = src ? (src.priceMax ?? src.price) : 0;
    const date = src?.date ?? null;
    const stale = date !== null && daysBetween(date, today) > staleDays;
    const missing = !src;
    if (missing && !missingPrices.includes(l.priceItemId)) missingPrices.push(l.priceItemId);
    if (stale && !stalePrices.includes(l.priceItemId)) stalePrices.push(l.priceItemId);
    lines.push({
      lineId: l.id,
      stage: l.stage,
      itemId: l.itemId,
      name: l.name,
      qty: l.purchaseQty,
      unit: l.unit,
      unitPrice: price,
      unitPriceMax: priceMax,
      material: l.purchaseQty * price,
      materialMax: l.purchaseQty * priceMax,
      priceDate: date,
      priceSource: src?.source ?? null,
      stale,
      missing,
      overridden: !!override,
    });
  }

  const baseQty = (r: LaborRate): number => {
    const a = q.areas;
    switch (r.basis) {
      case 'built_area':
        return model.builtArea;
      case 'footprint_area':
        return a.footprint;
      case 'roof_area':
        return a.roof;
      case 'wall_area':
        return a.exteriorWallsNet + a.interiorWallsNet;
      case 'radier_area':
        return a.radier;
      case 'steel_kg':
        // Wood frame: a mão de obra da estrutura segue a massa de madeira (mesma tabela R$/kg; ~R$ 250/m² no 6,5 x 8,5).
        return q.steelKg + q.woodM3 * catalog.constants.wood.density;
      case 'material_pct':
        return 0;
    }
  };

  const byStage: BudgetStage[] = [];
  for (const stage of STAGE_ORDER) {
    const sl = lines.filter((l) => l.stage === stage);
    if (sl.length === 0) continue;
    const material = sl.reduce((s, l) => s + l.material, 0);
    const materialMax = sl.reduce((s, l) => s + l.materialMax, 0);
    // Base da mão de obra percentual: sem os itens que já vêm instalados (ex.: sistema fotovoltaico por Wp).
    const installed = new Set(catalog.materials.filter((m) => m.laborIncluded).map((m) => m.id));
    const pctBase = sl.filter((l) => !installed.has(l.itemId)).reduce((s, l) => s + l.material, 0);
    const pctBaseMax = sl.filter((l) => !installed.has(l.itemId)).reduce((s, l) => s + l.materialMax, 0);
    const weightKg = q.lines.filter((l) => l.stage === stage).reduce((s, l) => s + l.weightKg, 0);
    const diy = diyStages.includes(stage);
    let labor = 0;
    let laborMax = 0;
    if (!diy) {
      // Mão de obra regional: a base de preços é a média de SP.
      for (const r of book.labor.filter((x) => x.stage === stage)) {
        const max = r.rateMax ?? r.rate;
        if (r.basis === 'material_pct') {
          labor += (pctBase * r.rate) / 100;
          laborMax += (pctBaseMax * max) / 100;
        } else {
          const b = baseQty(r);
          labor += b * r.rate;
          laborMax += b * max;
        }
      }
      labor *= laborFactor;
      laborMax *= laborFactor;
    }
    const freightCost = (weightKg / 1000) * freight.distanceKm * freight.pricePerTonKm;
    const total = material + labor + freightCost;
    const totalMax = materialMax + laborMax + freightCost;
    if (!(total > 0 || totalMax > 0)) continue;
    byStage.push({
      stage,
      material,
      materialMax,
      labor,
      laborMax,
      freight: freightCost,
      total,
      totalMax,
      weightKg,
      diy,
    });
  }

  const sum = (f: (s: BudgetStage) => number) => byStage.reduce((a, s) => a + f(s), 0);
  const material = sum((s) => s.material);
  const labor = sum((s) => s.labor);
  const freightTotal = sum((s) => s.freight);
  const subtotal = material + labor + freightTotal;
  const contingency = (subtotal * contingencyPct) / 100;
  const total = subtotal + contingency;
  const totalMax = sum((s) => s.totalMax) * (1 + contingencyPct / 100);

  const schedule: BudgetReport['schedule'] = [];
  let week = 1;
  for (const stage of STAGE_ORDER) {
    const dur = durationsWeeks[stage];
    if (!dur || dur <= 0) continue;
    const weeks = Math.ceil(dur);
    const stageTotal = (byStage.find((s) => s.stage === stage)?.total ?? 0) * (1 + contingencyPct / 100);
    for (let i = 0; i < weeks; i++) schedule.push({ week: week++, amount: stageTotal / weeks, stages: [stage] });
  }

  return {
    lines,
    byStage,
    material,
    labor,
    freight: freightTotal,
    subtotal,
    contingency,
    total,
    totalMax,
    perM2: model.builtArea > 0 ? total / model.builtArea : 0,
    laborFactor,
    schedule,
    missingPrices,
    stalePrices,
  };
}

