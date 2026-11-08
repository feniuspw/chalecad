import type { Catalog } from '@chalecad/catalog';
import type { Vec2 } from '../geometry';
import type { Project } from '../schema/project';
import type { BuildingModel, InstallationsReport } from '../schema/results';
import { manhattan, nearestOnContour, polygonCentroid } from './geo';
import type { PlacedPoints, PointEx } from './points';

export type PipeLengths = InstallationsReport['pipes'];

/**
 * Comprimentos estimados de tubos (m). Os trechos externos começam no contorno do radier
 * (o trecho entre o ponto de utilidade e o contorno já é orçado na fundação).
 */
export function computePipes(project: Project, model: BuildingModel, placed: PlacedPoints, catalog: Catalog): PipeLengths {
  const k = catalog.constants.installations;
  const r = k.routingFactor;
  const elevOf = (id: string) => project.levels.find((l) => l.id === id)?.elevation ?? 0;
  const zOf = (p: PointEx) => elevOf(p.level) + p.height;
  const radier = model.slabs.find((s) => s.kind === 'radier');
  const contour: Vec2[] = radier?.polygon ?? model.footprint;
  const out: PipeLengths = { cold: 0, hot: 0, sewer40: 0, sewer100: 0 };
  const tank = placed.tank;
  if (!tank || contour.length < 3) return out;
  const tankPos = tank.point.position;
  const tankZ = zOf(tank.point);

  // --- Água fria ---------------------------------------------------------------------------
  const water = project.utilities.find((u) => u.kind === 'water');
  const entry = nearestOnContour(water ? [water.position[0], water.position[1]] : tankPos, contour);
  out.cold += manhattan(entry, tankPos) * r + tankZ;
  for (const p of placed.points) {
    if (p.kind === 'water_cold') out.cold += manhattan(tankPos, p.position) * r + Math.abs(tankZ - zOf(p));
  }

  // --- Água quente: aquecedor junto ao banheiro da caixa -------------------------------------------
  const heaterRoom = placed.rooms.find((x) => x.id === tank.roomId);
  const heaterPos = heaterRoom ? polygonCentroid(heaterRoom.polygon!) : tankPos;
  const heaterZ = elevOf(heaterRoom?.level ?? tank.point.level);
  for (const p of placed.points) {
    if (p.kind === 'water_hot') out.hot += manhattan(heaterPos, p.position) * r + Math.abs(heaterZ - zOf(p));
  }

  // --- Esgoto -----------------------------------------------------------------------------------------
  const sewerUtil = project.utilities.find((u) => u.kind === 'sewer');
  const fixedExit = sewerUtil ? nearestOnContour([sewerUtil.position[0], sewerUtil.position[1]], contour) : null;
  for (const room of placed.rooms) {
    const pts = placed.points.filter((p) => p.roomId === room.id && p.kind === 'sewer');
    if (pts.length === 0) continue;
    const drain = placed.points.find((p) => p.roomId === room.id && p.kind === 'drain');
    const node: Vec2 = drain ? drain.position : pts[0]!.position;
    for (const p of pts) {
      const len = manhattan(p.position, node) * r;
      if (p.dia === 100) out.sewer100 += len;
      else out.sewer40 += len;
    }
    const exit = fixedExit ?? nearestOnContour(node, contour);
    out.sewer100 += manhattan(node, exit) * r + elevOf(room.level);
  }
  return out;
}
