import type { Catalog } from '@chalecad/catalog';
import { towerTankFullKg } from '../../extras/water_tower';
import type { Item } from '../../quantities/items';
import type { Project } from '../../schema/project';
import type { BuildingModel, EngineWarning, PlumbingReport, WaterPipeResult, WaterPointResult } from '../../schema/results';
import { placePoints } from '../points';
import { sizeTank } from '../tank';
import { makeCtx } from './context';
import { plumbingItems } from './items';
import { effectiveLayout } from './layout';
import { computeWaterNetworks } from './network';
import { sizeSeptic } from './septic';
import { computeSewer } from './sewer';
import { waterWarnings } from './warnings';

export interface PlumbingResult {
  report: PlumbingReport;
  items: Item[];
  warnings: EngineWarning[];
}

export { effectiveLayout, generatePoints } from './layout';
export { computeWaterNetworks } from './network';
export { computeSewer } from './sewer';
export { sizeSeptic } from './septic';
export { calcWater, solveWater, fwhJ, designFlow } from './water';
export { makeCtx } from './context';

/**
 * Hidráulica (NBR 5626 / 8160 / 7229) sobre o traçado efetivo: o salvo em `installations.plumbing` quando `manual`,
 * senão a árvore gerada a partir da caixa (torre ou forro do banheiro). `null` se não há caixa nem como gerá-la.
 */
export function computePlumbing(project: Project, model: BuildingModel, catalog: Catalog): PlumbingResult | null {
  const ctx = makeCtx(project, model, catalog);
  const placed = placePoints(project, model, catalog);
  const eff = effectiveLayout(ctx, placed);
  if (!eff) return null;
  const { layout } = eff;
  const nets = computeWaterNetworks(ctx, layout);
  const sewer = computeSewer(ctx, layout);

  const base = sizeTank(project, catalog.constants.installations);
  const liters = layout.tank.liters;
  const fullKg = placed.tank && placed.tank.liters === liters ? placed.tank.fullKg : towerTankFullKg(catalog, liters);
  const tank = { liters, dailyLiters: base.dailyLiters, occupants: base.occupants, fullKg };

  const septic = project.installations.plumbing.sewerDisposal === 'septic' ? sizeSeptic(ctx, base.occupants) : null;

  const pipes: WaterPipeResult[] = [];
  const points: WaterPointResult[] = [];
  for (const net of [nets.cold, nets.hot]) {
    if (!net) continue;
    for (const e of net.calc.edges) {
      pipes.push({
        pipeId: e.pipeId,
        system: net.system,
        sumWeights: e.sumWeights,
        flowLps: e.flowLps,
        dn: e.dn,
        di: e.di,
        velocity: e.velocity,
        length: e.length,
        leq: e.leq,
        headLoss: e.headLoss,
      });
    }
    for (const p of net.calc.points) {
      points.push({
        pointId: p.terminal.pointId,
        fixture: p.terminal.fixture,
        system: net.system,
        z: p.terminal.z,
        staticHead: p.staticHead,
        headLoss: p.headLoss,
        dynamicHead: p.dynamicHead,
        dynamicKpa: p.dynamicKpa,
        minKpa: p.minKpa,
        ok: p.ok,
        requiredTankRise: p.requiredTankRise,
        path: p.pathEdges.map((i) => net.calc.edges[i]!.pipeId),
      });
    }
  }

  const report: PlumbingReport = {
    layout,
    tank,
    water: { pipes, points },
    sewer: { pipes: sewer.results, totalUhc: sewer.totalUhc, vented: sewer.vented },
    septic: septic ? { tankLiters: septic.tankLiters, contributionLpd: septic.dailyLiters } : null,
  };
  const warnings = [...waterWarnings(ctx, layout, nets, base.dailyLiters), ...sewer.warnings];
  return { report, items: plumbingItems(ctx, nets, sewer, septic), warnings };
}
