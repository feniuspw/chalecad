import { getMaterial, type Catalog } from '@chalecad/catalog';
import type { Item } from '../../quantities/items';
import type { Computed } from './calc';
import { peSection } from './tables';
import type { Ctx } from './types';

const GENERAL = 'installations';
const idOfSection = (s: number) => `wire_${String(s).replace('.', '_')}`;

/** Itens da etapa `installations` do projeto elétrico: cabos, eletrodutos, caixas, módulos, quadro e luminárias. */
export function electricalItems(ctx: Ctx, c: Computed): Item[] {
  const { k, catalog } = ctx;
  const out: Item[] = [];
  const has = (id: string) => catalog.materials.some((m) => m.id === id);
  const put = (hostId: string, itemId: string, net: number, note?: string) => {
    if (!(net > 0) || !has(itemId)) return;
    const m = getMaterial(catalog as Catalog, itemId);
    out.push({ hostId, stage: 'installations', itemId, net, kg: net * m.massPerUnit, inWeight: false, ...(note ? { note } : {}) });
  };
  const bump = (m: Map<string, number>, key: string, n = 1) => m.set(key, (m.get(key) ?? 0) + n);

  // cabos por seção (sobra por caixa já está no circuito; a perda vem do material)
  const wire = new Map<number, number>();
  for (const r of c.report.circuits) {
    wire.set(r.sectionMm2, (wire.get(r.sectionMm2) ?? 0) + r.cable.phase + r.cable.neutral + r.cable.return);
    const pe = peSection(r.sectionMm2);
    wire.set(pe, (wire.get(pe) ?? 0) + r.cable.pe);
  }
  for (const [s, len] of [...wire].sort((a, b) => a[0] - b[0])) put(GENERAL, idOfSection(s), len);

  // eletrodutos por DN
  const byDn = new Map<number, number>();
  for (const cd of c.report.conduits) byDn.set(cd.dn, (byDn.get(cd.dn) ?? 0) + cd.length);
  for (const [dn, len] of [...byDn].sort((a, b) => a[0] - b[0])) put(GENERAL, `conduit_${dn}`, len);

  // caixas e módulos por cômodo
  const boxes4x2 = new Map<string, number>();
  const octa = new Map<string, number>();
  const modules = new Map<string, Map<string, number>>();
  const addModule = (host: string, id: string) => bump(modules.get(id) ?? modules.set(id, new Map()).get(id)!, host);
  const lum = new Map<string, Map<string, number>>();
  for (const i of c.infos) {
    const host = i.roomId ?? GENERAL;
    const p = i.p;
    if (p.kind === 'data') {
      bump(boxes4x2, host);
      continue;
    }
    if (p.kind === 'light') {
      bump(octa, host);
      const id = p.luminaire ?? k.defaultLuminaire;
      const lk = k.luminaires.find((l) => l.id === id)?.priceItem ?? `lum_${id}`;
      bump(lum.get(lk) ?? lum.set(lk, new Map()).get(lk)!, host, p.count ?? 1);
    } else {
      bump(boxes4x2, host);
      if (p.kind === 'switch') addModule(host, p.switchType === 'two_way' || p.switchType === 'intermediate' ? 'switch_two_way' : 'switch_simple');
      else addModule(host, p.kind === 'socket_tue' && i.ib > k.loads.tueSeparateAboveA ? 'outlet_20a' : 'outlet_2pt');
    }
  }
  boxes4x2.forEach((n, h) => put(h, 'box_4x2', n));
  octa.forEach((n, h) => put(h, 'box_octagonal', n));
  for (const [id, m] of modules) m.forEach((n, h) => put(h, id, n));
  for (const [id, m] of lum) m.forEach((n, h) => put(h, has(id) ? id : 'light_fixture', n));
  // caixas de passagem: nós só de junção (duas ou mais pontas, sem ponto)
  put(GENERAL, 'box_4x4', c.graph.nodes.filter((n) => n.ends >= 2 && n.pointIds.length === 0 && !n.isPanel).length);

  // quadro
  const rep = c.report;
  put(GENERAL, 'breaker', rep.circuits.length);
  put(GENERAL, 'breaker_main', 1, `${rep.panel.mainBreakerA} A`);
  for (const d of rep.panel.drs) put(GENERAL, d.ratingA === 40 ? 'breaker_dr' : `dr_${d.ratingA}`, 1, `${d.ratingA} A, ${k.dr.sensitivityMa} mA`);
  put(GENERAL, `dps_${rep.panel.dps.ucV}`, 1, `Uc ${rep.panel.dps.ucV} V, ${rep.panel.dps.inKa} kA`);
  put(GENERAL, rep.panel.size === 18 ? 'panel_box' : `panel_${rep.panel.size}`, 1, `${rep.panel.size} módulos`);
  return out;
}
