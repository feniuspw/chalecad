import { getMaterial, type Catalog } from '@chalecad/catalog';
import type { Item } from '../../quantities/items';
import type { Ctx } from './context';
import type { WaterNetworks } from './network';
import type { SewerOutput } from './sewer';
import type { SepticSizing } from './septic';

const GENERAL = 'installations';

/** Itens de orçamento hidráulicos: tubos por DN e material, conexões contadas pelo grafo, registros, caixas e fossa. */
export function plumbingItems(ctx: Ctx, nets: WaterNetworks, sewer: SewerOutput, septic: SepticSizing | null): Item[] {
  const catalog: Catalog = ctx.catalog;
  const out: Item[] = [];
  const has = (id: string) => catalog.materials.some((m) => m.id === id);
  const put = (itemId: string, net: number, note?: string) => {
    if (!(net > 1e-9) || !has(itemId)) return;
    const m = getMaterial(catalog, itemId);
    out.push({ hostId: GENERAL, stage: 'installations', itemId, net, kg: net * m.massPerUnit, inWeight: false, ...(note ? { note } : {}) });
  };
  /** Tubo do DN pedido, ou o existente mais próximo (catálogo tem 20 a 50 na água e 40 a 100 no esgoto). */
  const sized = (prefix: string, dn: number, dns: number[]): string => {
    const avail = dns.filter((d) => has(`${prefix}${d}`));
    const best = avail.sort((a, b) => Math.abs(a - dn) - Math.abs(b - dn) || b - a)[0];
    return `${prefix}${best ?? dn}`;
  };

  const byId = new Map<string, number>();
  const add = (id: string, n: number) => byId.set(id, (byId.get(id) ?? 0) + n);
  for (const net of [nets.cold, nets.hot]) {
    if (!net) continue;
    const hot = net.system === 'hot';
    const prefix = hot ? 'ppr_hot_' : 'pvc_water_';
    let elbows = 0;
    let tees = 0;
    for (const e of net.calc.edges) {
      add(sized(prefix, e.dn, [20, 25, 32, 40, 50]), e.length);
      elbows += e.fittings.elbow90 + e.fittings.elbow45;
      tees += e.fittings.teeStraight + e.fittings.teeBranch;
      add('water_valve', e.fittings.gateValve);
      add('water_valve_pressure', e.fittings.pressureValve);
    }
    add(hot ? 'fit_hot_elbow' : 'fit_water_elbow', elbows);
    add(hot ? 'fit_hot_tee' : 'fit_water_tee', tees);
  }
  for (const l of sewer.lengths) add(sized('pvc_sewer_', l.dn, [40, 50, 75, 100]), l.length);
  add('fit_sewer_elbow', sewer.fittings.elbows);
  add('fit_sewer_tee', sewer.fittings.tees);
  add('siphon_box', sewer.devices.siphonBoxes);
  add('grease_trap', sewer.devices.greaseTraps);
  add('inspection_box', sewer.devices.inspectionBoxes);
  for (const [id, n] of [...byId].sort((a, b) => a[0].localeCompare(b[0]))) put(id, n);
  if (septic) {
    put('septic_tank', septic.tankLiters / 1000, `${septic.tankLiters} L (NBR 7229)`);
    put('anaerobic_filter', septic.filterLiters / 1000, `${septic.filterLiters} L (NBR 13969)`);
  }
  return out;
}
