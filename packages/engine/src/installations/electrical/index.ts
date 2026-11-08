import type { Catalog } from '@chalecad/catalog';
import type { Item } from '../../quantities/items';
import type { ElecPoint, Project } from '../../schema/project';
import type { BuildingModel, ElectricalLayout, ElectricalReport, EngineWarning } from '../../schema/results';
import { placePoints, type PlacedPoints } from '../points';
import { calculate } from './calc';
import { distributeCircuits } from './circuitsGen';
import { generatePoints } from './layout';
import { electricalItems } from './items';
import { makeCtx, pointInfos } from './loads';
import { routeConduits } from './route';
import { electricalWarnings } from './warnings';
import type { Ctx } from './types';

export interface ElectricalResult {
  report: ElectricalReport;
  items: Item[];
  warnings: EngineWarning[];
}

/** Traçado gerado: pontos pelos mínimos da norma, circuitos pelas regras e eletrodutos pelo forro (ids `auto-*`). */
export function generateLayout(ctx: Ctx, placed: PlacedPoints): ElectricalLayout {
  const panel = { level: placed.panel.level, position: placed.panel.position, hostId: placed.panel.hostId };
  const points = generatePoints(ctx, placed);
  const dist = distributeCircuits(ctx, points, panel.position, new Set());
  for (const p of points) {
    const c = dist.assign.get(p.id);
    if (c) p.circuitId = c;
  }
  const ib = new Map<string, number>();
  for (const info of pointInfos(ctx, points)) {
    const c = info.p.circuitId;
    if (c) ib.set(c, (ib.get(c) ?? 0) + info.ib);
  }
  const conduits = routeConduits(ctx, points, { level: panel.level, position: panel.position, height: ctx.k.heights.panel }, ib);
  return { points, conduits, circuits: dist.circuits, panel };
}

/**
 * Traçado salvo (manual): os pontos sem circuito (ou com circuito inexistente) são distribuídos pelas mesmas
 * regras, em circuitos `auto-*` que só existem no resultado.
 */
export function manualLayout(ctx: Ctx, placed: PlacedPoints): ElectricalLayout {
  const e = ctx.project.installations.electrical;
  const panel = { level: placed.panel.level, position: placed.panel.position, hostId: placed.panel.hostId };
  const known = new Set(e.circuits.map((c) => c.id));
  const loose: ElecPoint[] = e.points.filter((p) => p.kind !== 'data' && (!p.circuitId || !known.has(p.circuitId)));
  const assigned = new Map<string, string>();
  for (const p of e.points) if (p.circuitId && known.has(p.circuitId)) assigned.set(p.id, p.circuitId);
  const dist = distributeCircuits(ctx, loose, panel.position, new Set(known), assigned);
  const points = e.points.map((p) => {
    const c = dist.assign.get(p.id);
    return c ? { ...p, circuitId: c } : p;
  });
  return { points, conduits: e.conduits, circuits: [...e.circuits, ...dist.circuits], panel };
}

/**
 * Projeto elétrico (NBR 5410) sobre o traçado efetivo: o salvo em `installations.electrical` quando `manual`, senão o
 * gerado a partir dos cômodos e móveis. `placed` (pontos do estimador) pode ser passado para não recalcular.
 */
export function computeElectrical(project: Project, model: BuildingModel, catalog: Catalog, placed?: PlacedPoints): ElectricalResult | null {
  const ctx = makeCtx(project, model, catalog);
  if (ctx.rooms.length === 0) return null;
  const pp = placed ?? placePoints(project, model, catalog);
  const layout = project.installations.electrical.manual ? manualLayout(ctx, pp) : generateLayout(ctx, pp);
  const computed = calculate(ctx, layout);
  return { report: computed.report, items: electricalItems(ctx, computed), warnings: electricalWarnings(ctx, computed) };
}

export { calculate } from './calc';
export { distributeCircuits } from './circuitsGen';
export { routeConduits } from './route';
export { lightingLoadVA, minSockets } from './loads';
export { pointInfos };
export { roomIndex, utilization, avgLux, roomLighting } from './lighting';
export { sizeCircuit } from './sizing';
export { conduitDn, pathStats, runOk } from './conduits';
export { buildGraph } from './graph';
export { makeCtx };
