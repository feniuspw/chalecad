import type { EngineWarning } from '../../schema/results';
import type { Computed } from './calc';
import { maxRunLength } from './conduits';
import { COUNTER_REACH, distToPolygon } from './layout';
import { fmt, type Ctx } from './types';

/** Corrente máxima do circuito misto (A), NBR 5410 9.5.3.2: o catálogo ainda não traz esse campo. */
const MIXED_MAX_A = 16;
/** Equipamentos F-N acima disso (W) em 127 V passam de 35 A: sugerir F-F 220 V. */
const FN_127_MAX_W = 4400;
const COUNTER_ITEMS = new Set(['furn_kitchen_sink', 'furn_kitchen_counter', 'furn_stove']);
const LONG_CORRIDOR = 5;

/** Avisos `elec.*` (tabela 8.4 da pesquisa) do que este traçado e estes dados permitem verificar. */
export function electricalWarnings(ctx: Ctx, c: Computed): EngineWarning[] {
  const { k, voltage, model } = ctx;
  const out: EngineWarning[] = [];
  const w = (code: string, severity: EngineWarning['severity'], message: string, refs?: string[]) => out.push({ code, severity, message, ...(refs ? { refs } : {}) });
  const pts = c.infos;
  const roomName = new Map(ctx.rooms.map((r) => [r.id, r.name]));

  // --- por cômodo ----------------------------------------------------------------------------------------------
  for (const room of ctx.rooms) {
    const here = pts.filter((i) => i.roomId === room.id);
    const lights = here.filter((i) => i.p.kind === 'light');
    const sockets = here.filter((i) => i.p.kind === 'socket' || i.p.kind === 'socket_high');
    const furn = model.furniture.filter((f) => f.roomId === room.id);
    if (lights.length === 0) w('elec.room.no_light', 'error', `${room.name}: sem ponto de luz no teto comandado por interruptor (NBR 5410 9.5.2.1.1).`, [room.id]);
    // mínimo de tomadas
    const perimeterStep = room.use === 'kitchen' || room.use === 'laundry' ? k.loads.sockets.perimeterStep.wet : k.loads.sockets.perimeterStep.other;
    let min = Math.max(1, Math.ceil(room.perimeter / perimeterStep - 1e-9));
    if (room.use === 'bathroom') min = 1;
    else if ((room.use === 'circulation' || room.use === 'storage' || room.use === 'other') && room.area <= 6) min = 1;
    if (sockets.length < min) {
      w('elec.room.sockets_min', 'error', `${room.name}: ${sockets.length} tomada(s) de uso geral; o mínimo é ${min} (1 a cada ${fmt(perimeterStep)} m de perímetro, NBR 5410 9.5.2.2.1).`, [room.id]);
    }
    if (room.use === 'bathroom') {
      if (sockets.length === 0) w('elec.bath.no_socket', 'error', `${room.name}: falta uma tomada junto ao lavatório (NBR 5410 9.5.2.2.1).`, [room.id]);
      const shower = furn.find((f) => f.item === 'furn_shower');
      if (shower) {
        for (const s of sockets) {
          if (distToPolygon(s.p.position, shower.polygon) < k.loads.sockets.bathSocketMinDistFromShower - 1e-9) {
            w('elec.bath.socket_zone', 'error', `${room.name}: tomada a menos de ${fmt(k.loads.sockets.bathSocketMinDistFromShower, 2)} m do box (volumes de proteção, NBR 5410 9.1).`, [s.p.id]);
          }
        }
      }
    }
    if (room.use === 'kitchen') {
      const counters = furn.filter((f) => COUNTER_ITEMS.has(f.item));
      if (counters.length > 0) {
        const over = sockets.filter((s) => s.p.kind === 'socket_high' && counters.some((f) => distToPolygon(s.p.position, f.polygon) <= COUNTER_REACH)).length;
        if (over < k.loads.sockets.counterSockets) {
          w('elec.kitchen.counter_sockets', 'error', `${room.name}: ${over} tomada(s) sobre a bancada; são ${k.loads.sockets.counterSockets} no mínimo (NBR 5410 9.5.2.2.1).`, [room.id]);
        }
      }
    }
  }

  // --- comando -----------------------------------------------------------------------------------------------------
  const controlled = new Set(pts.filter((i) => i.p.kind === 'switch').flatMap((i) => i.p.controls ?? []));
  for (const i of pts) {
    if (i.p.kind === 'light' && !controlled.has(i.p.id)) {
      w('elec.room.light_no_switch', 'error', `Ponto de luz${i.roomId ? ` (${roomName.get(i.roomId)})` : ''} sem interruptor que o comande (NBR 5410 9.5.2.1.1).`, [i.p.id]);
    }
  }
  for (const room of ctx.rooms) {
    const b = room.polygon!.reduce(
      (a, p) => ({ x0: Math.min(a.x0, p[0]), x1: Math.max(a.x1, p[0]), y0: Math.min(a.y0, p[1]), y1: Math.max(a.y1, p[1]) }),
      { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity },
    );
    const long = room.use === 'circulation' && Math.max(b.x1 - b.x0, b.y1 - b.y0) > LONG_CORRIDOR;
    if (!long) continue;
    const lightIds = pts.filter((i) => i.roomId === room.id && i.p.kind === 'light').map((i) => i.p.id);
    const twoWay = pts.filter((i) => i.p.kind === 'switch' && i.p.switchType === 'two_way' && (i.p.controls ?? []).some((x) => lightIds.includes(x))).length;
    if (lightIds.length > 0 && twoWay < 2) w('elec.light.stair_switching', 'info', `${room.name}: corredor longo com um interruptor só; considere interruptor paralelo nas duas pontas.`, [room.id]);
  }

  // --- iluminação -----------------------------------------------------------------------------------------------------
  for (const l of c.report.lighting) {
    const name = roomName.get(l.roomId) ?? l.roomId;
    if (l.status === 'low') w('elec.light.low', 'warn', `${name}: ${fmt(l.avgLux, 0)} lux estimados, abaixo do mínimo de ${fmt(l.minLux, 0)} lux (alvo ${fmt(l.targetLux, 0)}).`, [l.roomId]);
    if (l.status === 'high') w('elec.light.high', 'info', `${name}: ${fmt(l.avgLux, 0)} lux estimados, mais que o dobro do alvo de ${fmt(l.targetLux, 0)} lux.`, [l.roomId]);
  }

  // --- circuitos --------------------------------------------------------------------------------------------------------
  const roomUse = new Map(ctx.rooms.map((r) => [r.id, r.use]));
  for (const f of c.facts) {
    const r = f.result;
    const kinds = new Set(f.members.map((m) => m.p.kind));
    const hasLight = kinds.has('light');
    const hasSocket = kinds.has('socket') || kinds.has('socket_high') || kinds.has('socket_tue');
    if (hasLight && hasSocket) {
      w('elec.circuit.mixed', r.ib <= MIXED_MAX_A ? 'warn' : 'error', `${r.name}: iluminação e tomadas no mesmo circuito (${fmt(r.ib)} A); separe, salvo as condições da NBR 5410 9.5.3.2.`, [r.id]);
    }
    const wetSockets = f.members.filter((m) => m.p.kind !== 'light' && m.p.kind !== 'switch' && m.roomId && (roomUse.get(m.roomId) === 'kitchen' || roomUse.get(m.roomId) === 'laundry'));
    const others = f.members.filter((m) => m.p.kind !== 'light' && m.p.kind !== 'switch' && (!m.roomId || (roomUse.get(m.roomId) !== 'kitchen' && roomUse.get(m.roomId) !== 'laundry')));
    if (wetSockets.length > 0 && others.length > 0) {
      w('elec.circuit.wet_shared', 'error', `${r.name}: tomadas de cozinha/serviço dividem circuito com outros cômodos (NBR 5410 9.5.3.3).`, [r.id]);
    }
    const big = f.members.find((m) => m.p.kind === 'socket_tue' && m.ib > k.loads.tueSeparateAboveA + 1e-9);
    if (big && f.members.filter((m) => m.p.kind !== 'switch').length > 1) {
      w('elec.circuit.tue_shared', 'error', `${r.name}: equipamento de ${fmt(big.ib)} A (acima de ${k.loads.tueSeparateAboveA} A) precisa de circuito exclusivo (NBR 5410 9.5.3.4).`, [r.id, big.p.id]);
    }
    if (r.ib > r.breakerA + 1e-9) {
      w('elec.circuit.overload', 'error', `${r.name}: corrente de projeto de ${fmt(r.ib)} A passa do disjuntor de ${r.breakerA} A (NBR 5410 5.3.4.1).`, [r.id]);
    } else if (r.breakerA > r.izCorrected + 1e-9) {
      w('elec.circuit.overload', 'error', `${r.name}: disjuntor de ${r.breakerA} A passa da capacidade do cabo de ${fmt(r.sectionMm2, 1)} mm² (${fmt(r.izCorrected)} A com FCA ${fmt(r.fca, 2)}). Use disjuntor menor ou cabo maior.`, [r.id]);
    }
    const maxA = f.def.kind === 'lighting' ? k.loads.circuitMaxA.lighting : f.def.kind === 'sockets' ? k.loads.circuitMaxA.sockets : f.def.kind === 'wet_sockets' ? k.loads.circuitMaxA.wet_sockets : Infinity;
    if (r.ib > maxA + 1e-9) w('elec.circuit.load_high', 'warn', `${r.name}: ${fmt(r.ib)} A passa de ${maxA} A, o usual para esse tipo de circuito; divida a carga.`, [r.id]);
    const smin = f.def.kind === 'lighting' ? k.minSection.lighting : k.minSection.power;
    if (r.sectionMm2 < smin - 1e-9) w('elec.circuit.min_section', 'error', `${r.name}: cabo de ${fmt(r.sectionMm2, 1)} mm² abaixo do mínimo de ${fmt(smin, 1)} mm² (NBR 5410 6.2.6.1.1).`, [r.id]);
    if (r.voltageDropPct > k.voltageDrop.terminalMaxPct + 1e-9) {
      w('elec.vdrop.terminal', 'error', `${r.name}: queda de tensão de ${fmt(r.voltageDropPct, 2)}% passa do limite de ${k.voltageDrop.terminalMaxPct}% do circuito terminal (NBR 5410 6.2.7.1).`, [r.id]);
    } else if (r.voltageDropPct >= k.voltageDrop.warnAtPct - 1e-9) {
      w('elec.vdrop.terminal', 'info', `${r.name}: queda de tensão de ${fmt(r.voltageDropPct, 2)}%, perto do limite de ${k.voltageDrop.terminalMaxPct}%.`, [r.id]);
    }
    if (r.totalDropPct > k.voltageDrop.totalMaxPct + 1e-9) {
      w('elec.vdrop.total', 'error', `${r.name}: queda de tensão total (alimentador + circuito) de ${fmt(r.totalDropPct, 2)}% passa de ${k.voltageDrop.totalMaxPct}% (NBR 5410 6.2.7.1).`, [r.id]);
    }
    if (f.drRequired && !r.dr) {
      w('elec.dr.missing', 'error', `${r.name}: atende local que exige DR de ${k.dr.sensitivityMa} mA (banheiro, cozinha ou serviço) e está sem DR (NBR 5410 5.1.3.2.2).`, [r.id]);
    }
    for (const m of f.members) {
      const ap = m.p.appliance ? k.appliances[m.p.appliance] : undefined;
      if (ap && ap.voltage === 'FF' && voltage === 127 && ap.w > FN_127_MAX_W) {
        w('elec.shower.127v', 'info', `${ap.label} de ${fmt(ap.w, 0)} W em 127 V (fase-neutro) pede ${fmt(m.ib, 0)} A e cabo de ${fmt(r.sectionMm2, 0)} mm²: prefira ligação fase-fase em 220 V.`, [r.id, m.p.id]);
      }
    }
    if (f.unreached.length > 0) {
      w('elec.conduit.unreached', 'warn', `${r.name}: ${f.unreached.length} ponto(s) sem eletroduto ligado ao quadro; o comprimento do cabo foi estimado em linha reta.`, [r.id, ...f.unreached]);
    }
  }
  if (c.facts.some((f) => f.result.method === 'A1')) {
    w('elec.lsf.insulation_method', 'info', 'Eletroduto dentro de parede com isolamento na cavidade: capacidade do cabo pelo método A1 (NBR 5410 Tab. 33).');
  }

  // --- eletrodutos -----------------------------------------------------------------------------------------------------
  for (const cd of c.report.conduits) {
    if (cd.fillPct > cd.fillLimitPct + 1e-9) {
      w('elec.conduit.fill', 'error', `Eletroduto ${cd.id}: ocupação de ${fmt(cd.fillPct, 0)}% passa do limite de ${fmt(cd.fillLimitPct, 0)}% (NBR 5410 6.2.11.1.6).`, [cd.id]);
    }
    if (cd.bends90 > k.conduit.maxBends90) {
      w('elec.conduit.bends', 'error', `Eletroduto ${cd.id}: ${cd.bends90} curvas de 90° entre caixas; o máximo é ${k.conduit.maxBends90} (NBR 5410 6.2.11.1.7).`, [cd.id]);
    }
    const lim = maxRunLength(k, cd.bends90);
    if (cd.length > lim + 1e-9) {
      w('elec.conduit.length', 'error', `Eletroduto ${cd.id}: ${fmt(cd.length)} m sem caixa; o limite com ${cd.bends90} curva(s) é ${fmt(lim)} m. Insira uma caixa de passagem.`, [cd.id]);
    }
  }
  if (c.report.conduits.length > 0) w('elec.conduit.splice', 'info', 'Emendas e derivações de condutores só dentro de caixas (NBR 5410 6.2.8).');
  if (c.report.layout.conduits.some((x) => x.run === 'floor')) {
    w('elec.radier.floor_conduit', 'info', 'Eletrodutos de piso no radier precisam ser lançados antes da concretagem.', c.report.layout.conduits.filter((x) => x.run === 'floor').map((x) => x.id));
  }

  // --- quadro e entrada -----------------------------------------------------------------------------------------------------
  const p = c.report.panel;
  if (p.ways + p.reserves > p.size) {
    w('elec.panel.reserves', 'warn', `Quadro de ${p.size} módulos sem espaço para as ${p.reserves} reservas (NBR 5410 6.5.4.7): divida em dois quadros.`);
  }
  if (c.report.circuits.length > 0) {
    const e = c.report.entrance;
    w('elec.entrance.category', 'info', `Demanda de ${fmt(c.report.demandKw, 1)} kVA: categoria provável ${e.category}, disjuntor ${e.breakerA} A. Confirme na norma da sua distribuidora.`);
  }
  return out;
}
