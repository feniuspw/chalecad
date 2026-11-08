import type { Catalog } from '@chalecad/catalog';
import type { Item } from '../quantities/items';
import type { Project } from '../schema/project';
import type { BuildingModel, EngineWarning, InstallationsReport } from '../schema/results';
import { buildCircuits } from './circuits';
import { computePipes } from './pipes';
import { placePoints, type PointEx } from './points';
import { installationItems } from './quantities';

export { placePoints } from './points';
export type { PointEx, PlacedPoints, TankInfo } from './points';
export { buildCircuits } from './circuits';
export { computePipes } from './pipes';
export { installationItems } from './quantities';

export interface InstallationsResult {
  report: InstallationsReport;
  items: Item[];
  warnings: EngineWarning[];
  /** Peso da caixa d'água cheia (kg) e cômodo de apoio, para o pacote do engenheiro. */
  tank: { liters: number; fullKg: number; roomId: string; roomName: string } | null;
}

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** Instalações estimadas. `null` se `project.installations.enabled` for falso. */
export function computeInstallations(project: Project, model: BuildingModel, catalog: Catalog): InstallationsResult | null {
  if (!project.installations.enabled) return null;
  const k = catalog.constants.installations;
  const ground = project.levels.find((l) => l.elevation === 0) ?? project.levels[0]!;
  const placed = placePoints(project, model, catalog);

  if (placed.rooms.length === 0) {
    return {
      report: {
        points: [],
        circuits: [],
        panel: { level: ground.id, position: [0, 0] },
        demandKw: 0,
        voltage: k.voltage,
        tankLiters: 0,
        dailyLiters: 0,
        occupants: 0,
        pipes: { cold: 0, hot: 0, sewer40: 0, sewer100: 0 },
        conduit: 0,
      },
      items: [],
      warnings: [
        { code: 'install.no_rooms', severity: 'info', message: 'Marque os cômodos para estimar as instalações' },
      ],
      tank: null,
    };
  }

  const c = buildCircuits(project, placed, catalog);
  const pipes = computePipes(project, model, placed, catalog);
  const tank = placed.tank;
  const strip = ({ load: _l, dia: _d, item: _i, ...p }: PointEx) => p;
  const report: InstallationsReport = {
    points: placed.points.map(strip),
    circuits: c.circuits,
    panel: { level: placed.panel.level, position: placed.panel.position },
    demandKw: c.demandKw,
    voltage: k.voltage,
    tankLiters: tank?.liters ?? 0,
    dailyLiters: tank?.dailyLiters ?? 0,
    occupants: tank?.occupants ?? 0,
    pipes,
    conduit: c.conduit,
  };
  const warnings = [...c.warnings];
  if (tank) {
    warnings.push({
      code: 'install.tank_load',
      severity: 'info',
      message: `Caixa d'água de ${fmt(tank.liters)} L pesa cerca de ${fmt(tank.fullKg)} kg cheia, sobre ${tank.roomName}: o engenheiro deve conferir o apoio.`,
      refs: [tank.roomId],
    });
  }
  return {
    report,
    items: installationItems(project, report, placed, catalog),
    warnings,
    tank: tank ? { liters: tank.liters, fullKg: tank.fullKg, roomId: tank.roomId, roomName: tank.roomName } : null,
  };
}
