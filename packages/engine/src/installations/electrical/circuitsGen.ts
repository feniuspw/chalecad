import type { Vec2 } from '../../geometry';
import type { CircuitDef, ElecPoint } from '../../schema/project';
import { manhattan, polygonCentroid } from '../geo';
import { pointInfos, pointNeedsDr } from './loads';
import type { Ctx, PointInfo } from './types';

type Cls = 'light' | 'light_dr' | 'general' | 'bath' | 'wet' | 'tue';

const CLS_ORDER: Cls[] = ['light', 'light_dr', 'general', 'bath', 'wet', 'tue'];

/** Ordem de vizinhança dos cômodos: por nível e, dentro dele, vizinho mais próximo a partir do quadro. */
export function roomOrder(ctx: Ctx, panel: Vec2): Map<string, number> {
  const levels = [...new Set(ctx.rooms.map((r) => r.level))].sort((a, b) => (ctx.elev.get(a) ?? 0) - (ctx.elev.get(b) ?? 0));
  const order = new Map<string, number>();
  let from = panel;
  let n = 0;
  for (const lv of levels) {
    const left = ctx.rooms.filter((r) => r.level === lv).map((r) => ({ r, c: polygonCentroid(r.polygon!) }));
    while (left.length > 0) {
      let bi = 0;
      let bd = Infinity;
      left.forEach((x, i) => {
        const d = manhattan(from, x.c);
        if (d < bd - 1e-9) {
          bd = d;
          bi = i;
        }
      });
      const [x] = left.splice(bi, 1);
      order.set(x!.r.id, n++);
      from = x!.c;
    }
  }
  return order;
}

export interface Distribution {
  circuits: CircuitDef[];
  /** ponto → circuito (inclui interruptores, que seguem as luminárias que comandam). */
  assign: Map<string, string>;
}

/**
 * Agrupa em circuitos os pontos dados (NBR 5410 9.5.3): iluminação separada de tomadas; cozinha e serviço exclusivos;
 * TUE acima de 10 A isolado; luz de área molhada (abaixo de 2,5 m, pede DR) separada do resto; limite de corrente por
 * circuito; proximidade (cômodos em ordem de vizinhança, um nível por circuito de luz e de tomadas).
 * `taken` = ids já usados (circuitos do usuário); `assigned` = pontos já em circuito (para ligar os interruptores).
 */
export function distributeCircuits(ctx: Ctx, points: ElecPoint[], panel: Vec2, taken: Set<string>, assigned: Map<string, string> = new Map()): Distribution {
  const { k, voltage } = ctx;
  const infos = pointInfos(ctx, points);
  const roomOf = new Map(ctx.rooms.map((r) => [r.id, r]));
  const order = roomOrder(ctx, panel);
  const rank = (i: PointInfo) => (i.roomId ? (order.get(i.roomId) ?? 999) : 999);

  const groups = new Map<string, { cls: Cls; infos: PointInfo[] }>();
  const put = (cls: Cls, key: string, i: PointInfo) => {
    const g = groups.get(key) ?? { cls, infos: [] };
    g.infos.push(i);
    groups.set(key, g);
  };
  for (const i of infos) {
    const p = i.p;
    const use = i.roomId ? roomOf.get(i.roomId)?.use : undefined;
    if (p.kind === 'data' || p.kind === 'switch') continue;
    if (p.kind === 'light') {
      const dr = pointNeedsDr(k, p, use);
      put(dr ? 'light_dr' : 'light', `${dr ? 'light_dr' : 'light'}|${p.level}`, i);
    } else if (p.kind === 'socket_tue' && i.ib > k.loads.tueSeparateAboveA + 1e-9) {
      put('tue', `tue|${p.id}`, i);
    } else if (use === 'kitchen' || use === 'laundry') put('wet', 'wet', i);
    else if (use === 'bathroom') put('bath', 'bath', i);
    else put('general', `general|${p.level}`, i);
  }

  const circuits: CircuitDef[] = [];
  const assign = new Map<string, string>();
  const counts: Record<string, number> = {};
  let n = 0;
  const nextId = () => {
    do n++;
    while (taken.has(`auto-c${n}`));
    taken.add(`auto-c${n}`);
    return `auto-c${n}`;
  };
  const sorted = [...groups.entries()].sort((a, b) => CLS_ORDER.indexOf(a[1].cls) - CLS_ORDER.indexOf(b[1].cls) || (a[0] < b[0] ? -1 : 1));
  for (const [, g] of sorted) {
    const list = [...g.infos].sort((a, b) => rank(a) - rank(b) || (a.p.id < b.p.id ? -1 : 1));
    const maxA = g.cls === 'wet' ? k.loads.circuitMaxA.wet_sockets : g.cls === 'light' || g.cls === 'light_dr' ? k.loads.circuitMaxA.lighting : k.loads.circuitMaxA.sockets;
    const maxVA = maxA * voltage;
    let cur: PointInfo[] = [];
    let sum = 0;
    const flush = () => {
      if (cur.length === 0) return;
      const id = nextId();
      const kind: CircuitDef['kind'] = g.cls === 'wet' ? 'wet_sockets' : g.cls === 'tue' ? 'tue' : g.cls === 'light' || g.cls === 'light_dr' ? 'lighting' : 'sockets';
      counts[g.cls] = (counts[g.cls] ?? 0) + 1;
      const c = counts[g.cls]!;
      let name: string;
      if (g.cls === 'tue') {
        const ap = cur[0]!.p.appliance ? k.appliances[cur[0]!.p.appliance]?.label : undefined;
        const room = cur[0]!.roomId ? roomOf.get(cur[0]!.roomId)?.name : undefined;
        name = `${ap ?? cur[0]!.p.label ?? 'TUE'}${room ? ` (${room})` : ''}`;
      } else if (g.cls === 'light') name = `Iluminação ${c}`;
      else if (g.cls === 'light_dr') name = c > 1 ? `Iluminação áreas molhadas ${c}` : 'Iluminação áreas molhadas';
      else if (g.cls === 'bath') name = c > 1 ? `Tomadas banheiro ${c}` : 'Tomadas banheiro';
      else if (g.cls === 'wet') name = c > 1 ? `Tomadas cozinha e serviço ${c}` : 'Tomadas cozinha e serviço';
      else name = `Tomadas ${c}`;
      circuits.push({ id, name: name.slice(0, 60), kind });
      for (const i of cur) assign.set(i.p.id, id);
      cur = [];
      sum = 0;
    };
    for (const i of list) {
      if (cur.length > 0 && sum + i.loadVA > maxVA + 1e-9) flush();
      cur.push(i);
      sum += i.loadVA;
    }
    flush();
  }

  // Interruptor segue o circuito das luminárias que comanda.
  const circuitOfPoint = (id: string) => assign.get(id) ?? assigned.get(id);
  const fallback = circuits.find((c) => c.kind === 'lighting')?.id;
  for (const i of infos) {
    if (i.p.kind !== 'switch') continue;
    const via = (i.p.controls ?? []).map(circuitOfPoint).find((x) => x !== undefined);
    const target = via ?? fallback;
    if (target) assign.set(i.p.id, target);
  }
  return { circuits, assign };
}
