import type { CircuitDef } from '../../schema/project';
import type { ConduitResult, ElecCircuitResult, ElectricalLayout, ElectricalReport } from '../../schema/results';
import { conduitDn, fillFraction, fillLimit } from './conduits';
import { buildGraph, pathEdges, type Graph } from './graph';
import { lightingResults } from './lighting';
import { pointInfos, pointNeedsDr } from './loads';
import { demandOf, drGroups, entranceFor, feederFor, mainBreakerFor, panelModules, type Demand } from './panel';
import { HEAVY_A } from './route';
import { sizeCircuit } from './sizing';
import { conductorArea, groupingFactor, peSection, tempFactor, voltageDropPct, type Method } from './tables';
import { manhattan, type Ctx, type PointInfo } from './types';

/** Dados intermediários que os avisos e os itens do orçamento usam. */
export interface CircuitFacts {
  def: CircuitDef;
  members: PointInfo[];
  result: ElecCircuitResult;
  /** O circuito pede DR (norma) e o projeto o tem. */
  drRequired: boolean;
  /** Pontos fora de qualquer eletroduto ligado ao quadro. */
  unreached: string[];
  nodes: number;
}

export interface Computed {
  report: ElectricalReport;
  infos: PointInfo[];
  graph: Graph;
  facts: CircuitFacts[];
  demand: Demand;
  /** Pontos fora de qualquer eletroduto ligado ao quadro (de circuitos ou não). */
  unreached: string[];
}

/** Cálculo completo sobre um traçado (gerado ou manual). */
export function calculate(ctx: Ctx, layout: ElectricalLayout): Computed {
  const { k, voltage } = ctx;
  const elec = ctx.project.installations.electrical;
  const infos = pointInfos(ctx, layout.points);
  const graph = buildGraph(ctx, layout, infos);
  const inst = ctx.catalog.constants.installations;
  const fct = tempFactor(k, elec.ambientTemp);

  // --- membros, caminhos e correntes por trecho ---------------------------------------------------------
  interface Work {
    def: CircuitDef;
    members: PointInfo[];
    loadVA: number;
    ib: number;
    edgeSet: Set<number>;
    /** corrente de projeto que passa em cada aresta (A) */
    flow: Map<number, number>;
    /** condutores de retorno por aresta */
    ret: Map<number, number>;
    fallback: { len: number; i: number }[];
    unreached: string[];
    farthest: number;
  }
  const works: Work[] = [];
  const panelXY = layout.panel.position;

  // Eletrodutos paralelos entre as mesmas duas caixas (o gerador desenha um por circuito pesado, e o grafo junta pontas
  // a 2 cm): o caminho mínimo acharia sempre o mais curto e empilharia todos os circuitos nele. Cada circuito usa um dos
  // paralelos: pesado (chuveiro, forno) sozinho se houver vaga, e os leves nos que têm menos circuitos.
  const siblings = new Map<number, number[]>();
  {
    const byKey = new Map<string, number[]>();
    graph.edges.forEach((e, i) => {
      if (e.a === e.b || e.conduitId === null) return;
      const key = e.a < e.b ? `${e.a}|${e.b}` : `${e.b}|${e.a}`;
      (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(i);
    });
    for (const list of byKey.values()) {
      if (list.length < 2) continue;
      list.sort((x, y) => graph.edges[x]!.len - graph.edges[y]!.len || x - y);
      for (const i of list) siblings.set(i, list);
    }
  }
  const siblingLoad = new Map<number, { n: number; heavy: boolean }>();
  const loadOf = (e: number) => siblingLoad.get(e) ?? { n: 0, heavy: false };
  const chosen = new Map<string, number>();
  const pick = (circuit: string, heavy: boolean, e: number): number => {
    const group = siblings.get(e);
    if (!group) return e;
    const key = `${circuit}|${group[0]}`;
    let c = chosen.get(key);
    if (c === undefined) {
      const pool = heavy ? group : group.filter((x) => !loadOf(x).heavy);
      const cands = pool.length > 0 ? pool : group;
      c = cands.reduce((a, b) => (loadOf(b).n < loadOf(a).n ? b : a));
      chosen.set(key, c);
      const l = loadOf(c);
      siblingLoad.set(c, { n: l.n + 1, heavy: l.heavy || heavy });
    }
    return c;
  };
  // pesados primeiro, para pegarem eletroduto livre
  const loadVA = new Map<string, number>();
  for (const i of infos) if (i.p.circuitId && i.p.kind !== 'data') loadVA.set(i.p.circuitId, (loadVA.get(i.p.circuitId) ?? 0) + i.loadVA);
  const order = [...layout.circuits].sort((a, b) => (loadVA.get(b.id) ?? 0) - (loadVA.get(a.id) ?? 0));
  for (const def of order) {
    const members = infos.filter((i) => i.p.circuitId === def.id && i.p.kind !== 'data');
    if (members.length === 0) continue;
    const heavy = (loadVA.get(def.id) ?? 0) / voltage > HEAVY_A;
    const w: Work = { def, members, loadVA: 0, ib: 0, edgeSet: new Set(), flow: new Map(), ret: new Map(), fallback: [], unreached: [], farthest: 0 };
    const paths = new Map<string, number[]>();
    for (const m of members) {
      w.loadVA += m.loadVA;
      const node = graph.nodeOfPoint.get(m.p.id)!;
      const pe = pathEdges(graph, node).map((e) => pick(def.id, heavy, e));
      if (pe.length === 0 && node !== graph.panel) {
        w.unreached.push(m.p.id);
        const len = manhattan(panelXY, m.p.position) * inst.routingFactor + inst.dropPerPoint + (ctx.elev.get(m.p.level) ?? 0);
        w.fallback.push({ len, i: m.ib });
        w.farthest = Math.max(w.farthest, len);
        continue;
      }
      paths.set(m.p.id, pe);
      w.farthest = Math.max(w.farthest, graph.dist[node]!);
      for (const e of pe) {
        w.edgeSet.add(e);
        w.flow.set(e, (w.flow.get(e) ?? 0) + m.ib);
      }
    }
    w.ib = w.loadVA / voltage;
    // retorno: interruptor → luminárias que comanda (diferença simétrica dos caminhos até o quadro)
    for (const m of members) {
      if (m.p.kind !== 'switch') continue;
      const sp = paths.get(m.p.id);
      if (!sp) continue;
      const mult = m.p.switchType === 'two_way' || m.p.switchType === 'intermediate' ? 2 : 1;
      const used = new Set<number>();
      for (const lid of m.p.controls ?? []) {
        const lp = paths.get(lid);
        if (!lp) continue;
        const a = new Set(sp);
        const b = new Set(lp);
        for (const e of a) if (!b.has(e)) used.add(e);
        for (const e of b) if (!a.has(e)) used.add(e);
      }
      for (const e of used) w.ret.set(e, Math.max(w.ret.get(e) ?? 0, mult));
    }
    works.push(w);
  }
  const rank = new Map(layout.circuits.map((c, i) => [c.id, i]));
  works.sort((a, b) => rank.get(a.def.id)! - rank.get(b.def.id)!);

  // --- agrupamento: circuitos por trecho ------------------------------------------------------------------
  const onEdge = new Map<number, Set<string>>();
  for (const w of works) for (const e of w.edgeSet) (onEdge.get(e) ?? onEdge.set(e, new Set()).get(e)!).add(w.def.id);

  // --- demanda, entrada, geral, alimentador ----------------------------------------------------------------
  const demand = demandOf(k, infos);
  const entrance = entranceFor(k, demand.demandKw, voltage);
  const mainA = mainBreakerFor(k, demand.demandKw, voltage, entrance.phases, entrance.breakerA);
  const feeder = feederFor(k, mainA, entrance.phases, elec.feederLength, voltage, fct);

  // --- dimensionamento por circuito -------------------------------------------------------------------------
  const results: ElecCircuitResult[] = [];
  const facts: CircuitFacts[] = [];
  const insulated = ctx.insulatedAssemblies.size > 0;
  const roomUse = new Map(ctx.rooms.map((r) => [r.id, r.use]));
  for (const w of works) {
    const n = Math.max(1, ...[...w.edgeSet].map((e) => onEdge.get(e)!.size));
    const fca = groupingFactor(k, n);
    const wall = [...w.edgeSet].some((e) => {
      const cid = graph.edges[e]!.conduitId;
      return cid !== null && graph.conduits.find((g) => g.id === cid)?.run === 'wall';
    });
    const method: Method = wall && insulated ? 'A1' : 'B1';
    const tue = w.members.find((m) => m.p.appliance && k.appliances[m.p.appliance]?.curve);
    const curve = (tue?.p.appliance ? k.appliances[tue.p.appliance]?.curve : undefined) ?? k.breakers.defaultCurve;
    const segs = [...w.flow.entries()].map(([e, i]) => ({ len: graph.edges[e]!.len, i }));
    const dropAt = (s: number) => [...segs, ...w.fallback].reduce((sum, x) => sum + voltageDropPct(k, s, x.len, x.i, voltage), 0);
    const size = sizeCircuit({
      k,
      kind: w.def.kind,
      ib: w.ib,
      method,
      fca,
      fct,
      dropAt,
      feederDropPct: feeder.voltageDropPct,
      curve,
      override: { ...(w.def.sectionMm2 !== undefined ? { sectionMm2: w.def.sectionMm2 } : {}), ...(w.def.breakerA !== undefined ? { breakerA: w.def.breakerA } : {}), ...(w.def.curve ? { curve: w.def.curve } : {}) },
    });
    // DR: o circuito atende ponto que a norma obriga? O projeto o tem, salvo `dr: false` do usuário.
    const required = w.members.some((m) => pointNeedsDr(k, m.p, m.roomId ? roomUse.get(m.roomId) : undefined));
    const hasDr = w.def.dr ?? required;
    // cabo por função (m): trechos + sobra por caixa
    const nodes = new Set<number>();
    let run = 0;
    for (const e of w.edgeSet) {
      const ed = graph.edges[e]!;
      run += ed.len;
      nodes.add(ed.a);
      nodes.add(ed.b);
    }
    for (const f of w.fallback) run += f.len;
    const boxes = nodes.size + w.fallback.length;
    const slack = boxes * k.cable.slackPerBoxM;
    let ret = 0;
    const rn = new Set<number>();
    for (const [e, c] of w.ret) {
      ret += graph.edges[e]!.len * c;
      rn.add(graph.edges[e]!.a);
      rn.add(graph.edges[e]!.b);
    }
    ret += rn.size * k.cable.slackPerBoxM;
    const drop = size.drop;
    const res: ElecCircuitResult = {
      id: w.def.id,
      name: w.def.name,
      kind: w.def.kind,
      pointIds: w.members.map((m) => m.p.id),
      powerVA: w.loadVA,
      ib: w.ib,
      voltage,
      phaseToPhase: false,
      method,
      fca,
      fct,
      izCorrected: size.izCorrected,
      sectionMm2: size.sectionMm2,
      breakerA: size.breakerA,
      curve: size.curve,
      dr: hasDr,
      lengthM: w.farthest,
      voltageDropPct: drop,
      totalDropPct: drop + feeder.voltageDropPct,
      sizingReason: size.reason,
      cable: { phase: run + slack, neutral: run + slack, pe: run + slack, return: ret },
    };
    results.push(res);
    facts.push({ def: w.def, members: w.members, result: res, drRequired: required, unreached: w.unreached, nodes: nodes.size });
  }

  // --- eletrodutos: condutores por trecho, DN e ocupação ------------------------------------------------------
  const resById = new Map(results.map((r) => [r.id, r]));
  const edgeConductors = (e: number): { sections: number[]; circuits: string[] } => {
    const sections: number[] = [];
    const circuits: string[] = [];
    for (const cid of onEdge.get(e) ?? []) {
      const r = resById.get(cid)!;
      circuits.push(cid);
      const w = works.find((x) => x.def.id === cid)!;
      sections.push(r.sectionMm2, r.sectionMm2, peSection(r.sectionMm2));
      for (let i = 0; i < (w.ret.get(e) ?? 0); i++) sections.push(r.sectionMm2);
    }
    return { sections, circuits };
  };
  const conduitById = new Map(layout.conduits.map((c) => [c.id, c]));
  const conduitResults: ConduitResult[] = graph.conduits.map((g) => {
    let worst: { sections: number[]; circuits: string[] } = { sections: [], circuits: [] };
    const all = new Set<string>();
    let worstArea = -1;
    for (const e of g.edges) {
      const c = edgeConductors(e);
      c.circuits.forEach((x) => all.add(x));
      const area = c.sections.reduce((s, x) => s + conductorArea(k, x), 0);
      if (area > worstArea) {
        worstArea = area;
        worst = c;
      }
    }
    const user = conduitById.get(g.id)?.dn;
    const sized = conduitDn(k, worst.sections);
    let dn = sized.dn;
    let fill = sized.fill;
    if (user !== undefined) {
      const size = k.conduit.sizes.find((s) => s.dn === user);
      dn = user;
      fill = size ? fillFraction(k, worst.sections, size.di) : sized.fill;
    }
    return {
      id: g.id,
      length: g.length,
      bends90: g.bends90,
      dn,
      circuitIds: [...all].sort(),
      conductors: worst.sections.length,
      fillPct: fill * 100,
      fillLimitPct: fillLimit(k, worst.sections.length) * 100,
    };
  });

  // --- DR, DPS, quadro ---------------------------------------------------------------------------------------------
  const drCircuits = facts
    .filter((f) => f.result.dr)
    .map((f) => {
      const firstWet = f.members.map((m) => m.roomId).find((id) => id && k.dr.requiredRoomUses.includes(roomUse.get(id) ?? '')) ?? '-';
      return { id: f.result.id, breakerA: f.result.breakerA, ib: f.result.ib, room: firstWet };
    });
  const drs = drGroups(k, drCircuits);
  const modules = panelModules(k, results.length, 0, drs.length, entrance.phases);
  const report: ElectricalReport = {
    layout,
    voltage,
    circuits: results,
    conduits: conduitResults,
    lighting: lightingResults(ctx, infos),
    installedKw: demand.installedKw,
    demandKw: demand.demandKw,
    entrance,
    feeder: { sectionMm2: feeder.sectionMm2, voltageDropPct: feeder.voltageDropPct },
    panel: {
      ways: modules.ways,
      size: modules.size,
      reserves: modules.reserves,
      mainBreakerA: mainA,
      drs,
      dps: { ucV: k.dps.ucByVoltage[String(voltage)] ?? 0, inKa: k.dps.inKa },
    },
  };
  const unreached = [...new Set(facts.flatMap((f) => f.unreached))];
  return { report, infos, graph, facts, demand, unreached };
}
