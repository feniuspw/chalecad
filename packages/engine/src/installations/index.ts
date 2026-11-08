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
export { sizeTank } from './tank';

export interface InstallationsResult {
  report: InstallationsReport;
  items: Item[];
  warnings: EngineWarning[];
  /** Peso da caixa d'água cheia (kg) e cômodo de apoio, para o pacote do engenheiro. */
  tank: { liters: number; fullKg: number; roomId: string; roomName: string } | null;
}

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const fmt1 = (n: number) => n.toFixed(1).replace('.', ',');

/**
 * Pressão mínima nos pontos de água (NBR 5626, simplificada): coluna d'água = fundo da caixa − cota do ponto.
 * Faltam no catálogo (usados aqui com comentário): chuveiro a 2,10 m e demais pontos a 1,0 m do piso; coluna mínima
 * de 1,0 m no chuveiro e 0,5 m nos demais.
 */
const SHOWER_POINT_HEIGHT = 2.1; // m acima do piso
const OTHER_POINT_HEIGHT = 1.0; // m acima do piso
const MIN_COLUMN_SHOWER = 1.0; // m.c.a.
const MIN_COLUMN_OTHER = 0.5; // m.c.a.

function pressureWarnings(project: Project, placed: ReturnType<typeof placePoints>): EngineWarning[] {
  const tank = placed.tank;
  if (!tank) return [];
  const elevOf = (id: string) => project.levels.find((l) => l.id === id)?.elevation ?? 0;
  const bottom = elevOf(tank.point.level) + tank.point.height;
  const out: EngineWarning[] = [];
  const seen = new Set<string>();
  for (const p of placed.points) {
    if (p.kind !== 'water_cold' && p.kind !== 'water_hot') continue;
    const shower = p.height >= SHOWER_POINT_HEIGHT - 1e-9;
    const key = `${p.furnitureId ?? p.id}:${shower}`;
    if (seen.has(key)) continue; // água fria e quente do mesmo aparelho: um alerta só
    seen.add(key);
    const z = elevOf(p.level) + (shower ? SHOWER_POINT_HEIGHT : OTHER_POINT_HEIGHT);
    const head = bottom - z;
    const min = shower ? MIN_COLUMN_SHOWER : MIN_COLUMN_OTHER;
    if (head >= min - 1e-9) continue;
    const room = placed.rooms.find((r) => r.id === p.roomId);
    const where = elevOf(p.level) > 0 ? 'do mezanino' : `(${room?.name ?? 'térreo'})`;
    out.push({
      code: 'install.pressure',
      // No térreo, caixa no forro com pouca coluna é o caso comum (resolve com pressurizador): só informa.
      severity: elevOf(p.level) > 0 ? 'warn' : 'info',
      message:
        `${shower ? 'Chuveiro' : 'Ponto de água'} ${where} com só ${fmt1(Math.max(0, head))} m de coluna d'água ` +
        `(mínimo ${fmt1(min)} m, NBR 5626): eleve a caixa (torre) ou use pressurizador`,
      refs: [p.id, tank.towerId ?? tank.point.id],
    });
  }
  return out;
}

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
      message: tank.towerId
        ? `Caixa d'água de ${fmt(tank.liters)} L pesa cerca de ${fmt(tank.fullKg)} kg cheia, sobre a torre ${tank.towerId} (plataforma a ${fmt1(tank.point.height)} m): o engenheiro deve conferir o apoio.`
        : `Caixa d'água de ${fmt(tank.liters)} L pesa cerca de ${fmt(tank.fullKg)} kg cheia, sobre ${tank.roomName}: o engenheiro deve conferir o apoio.`,
      refs: [tank.towerId ?? tank.roomId],
    });
    warnings.push(...pressureWarnings(project, placed));
  }
  return {
    report,
    items: installationItems(project, report, placed, catalog),
    warnings,
    tank: tank ? { liters: tank.liters, fullKg: tank.fullKg, roomId: tank.roomId, roomName: tank.roomName } : null,
  };
}
