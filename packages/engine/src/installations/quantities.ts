import { getMaterial, type Catalog } from '@chalecad/catalog';
import type { Item } from '../quantities/items';
import type { InstallationsReport } from '../schema/results';
import type { Project } from '../schema/project';
import type { PlacedPoints } from './points';

const GENERAL = 'installations';
const WET_ROOMS = new Set(['bathroom', 'kitchen', 'laundry']);

const wireId = (section: number) => `wire_${String(section).replace('.', '_')}`;

/** Itens de quantidade da etapa `installations` (fora do peso estrutural). */
export function installationItems(
  project: Project,
  report: InstallationsReport,
  placed: PlacedPoints,
  catalog: Catalog,
): Item[] {
  const out: Item[] = [];
  const put = (hostId: string, itemId: string, net: number, note?: string) => {
    if (!(net > 0)) return;
    const m = getMaterial(catalog, itemId);
    out.push({ hostId, stage: 'installations', itemId, net, kg: net * m.massPerUnit, inWeight: false, ...(note ? { note } : {}) });
  };
  const byRoom = (kinds: string[], pred: (p: PlacedPoints['points'][number]) => boolean = () => true) => {
    const m = new Map<string, number>();
    for (const p of placed.points) {
      if (!kinds.includes(p.kind) || !pred(p)) continue;
      const h = p.roomId ?? GENERAL;
      m.set(h, (m.get(h) ?? 0) + 1);
    }
    return m;
  };
  const eachRoom = (m: Map<string, number>, itemId: string) => m.forEach((n, h) => put(h, itemId, n));
  const roomUse = new Map(placed.rooms.map((r) => [r.id, r.use]));

  // Com o projeto elétrico calculado (F16), os itens elétricos vêm dele e os estimados saem (sem contar duas vezes).
  const estimateElectrical = !report.electrical;

  // Cabos por bitola
  const bySection = new Map<number, number>();
  for (const c of report.circuits) bySection.set(c.wire, (bySection.get(c.wire) ?? 0) + c.cableLength);
  if (estimateElectrical) {
    for (const [s, len] of [...bySection].sort((a, b) => a[0] - b[0])) put(GENERAL, wireId(s), len);
    put(GENERAL, 'conduit_25', report.conduit);
  }

  // Caixas e peças elétricas
  if (estimateElectrical) {
    eachRoom(byRoom(['outlet', 'outlet_high', 'switch', 'tue']), 'box_4x2');
    const wetHigh = (p: PlacedPoints['points'][number]) => p.kind === 'outlet_high' && p.roomId !== null && roomUse.get(p.roomId) !== 'bathroom';
    eachRoom(byRoom(['outlet', 'outlet_high'], (p) => !wetHigh(p)), 'outlet_2pt');
    const high = new Map<string, number>();
    for (const p of placed.points) {
      if (wetHigh(p) || p.kind === 'tue') high.set(p.roomId ?? GENERAL, (high.get(p.roomId ?? GENERAL) ?? 0) + 1);
    }
    eachRoom(high, 'outlet_20a');
    eachRoom(byRoom(['switch']), 'switch_simple');
    eachRoom(byRoom(['light']), 'light_fixture');
    put(GENERAL, 'breaker', report.circuits.length + 1);
    put(GENERAL, 'breaker_dr', report.circuits.length > 8 ? 2 : 1);
    put(GENERAL, 'panel_box', 1);
  }

  // Hidráulica
  put(GENERAL, 'pvc_water_25', report.pipes.cold);
  put(GENERAL, 'ppr_hot_25', report.pipes.hot);
  put(GENERAL, 'pvc_sewer_40', report.pipes.sewer40);
  put(GENERAL, 'pvc_sewer_100', report.pipes.sewer100);
  for (const r of placed.rooms) if (WET_ROOMS.has(r.use)) put(r.id, 'water_valve', 1);
  put(GENERAL, 'water_valve', 1);
  eachRoom(byRoom(['water_cold', 'water_hot', 'sewer']), 'pipe_fittings');
  eachRoom(byRoom(['drain']), 'siphon_box');

  // Equipamentos
  if (report.tankLiters > 0) put(placed.tank?.roomId ?? GENERAL, `water_tank_${report.tankLiters}`, 1, `${report.tankLiters} L`);
  const heater = project.installations.waterHeater;
  if (heater === 'gas') put(placed.tank?.roomId ?? GENERAL, 'gas_heater', 1);
  if (heater === 'solar') put(placed.tank?.roomId ?? GENERAL, 'solar_heater', 1);
  return out;
}
