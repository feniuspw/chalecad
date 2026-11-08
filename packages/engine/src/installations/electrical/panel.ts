import type { ElectricalReport } from '../../schema/results';
import { ampacity, breakerFor, reservesFor, resistance70, sectionsOf } from './tables';
import type { ElecK, PointInfo } from './types';

/**
 * Equipamentos de aquecimento (fator de demanda pelo número de aparelhos). A classificação não está no catálogo;
 * fica aqui até entrar em `constants.electrical.demand`.
 */
const HEATING = new Set(['electric_shower', 'electric_faucet', 'oven', 'cooktop_induction', 'dryer']);

export interface Demand {
  installedKw: number;
  demandKw: number;
  /** kW instalado e demandado por grupo: iluminação + tomadas (a), aquecimento (b), demais TUE (c). */
  groups: { lightSockets: { kw: number; demand: number }; heating: { kw: number; demand: number; count: number }; other: { kw: number; demand: number } };
}

/** Demanda pela tabela de concessionária do catálogo (fator único pela faixa de iluminação + tomadas). */
export function demandOf(k: ElecK, infos: PointInfo[]): Demand {
  let ls = 0;
  let heat = 0;
  let heatN = 0;
  let other = 0;
  for (const i of infos) {
    if (i.loadVA <= 0) continue;
    const kw = i.loadVA / 1000;
    if (i.p.kind === 'light' || i.p.kind === 'socket' || i.p.kind === 'socket_high') ls += kw;
    else if (i.p.appliance && HEATING.has(i.p.appliance)) {
      heat += kw;
      heatN++;
    } else other += kw;
  }
  const row = [...k.demand.lightingSockets].sort((a, b) => a[0] - b[0]).find((r) => ls <= r[0]) ?? k.demand.lightingSockets[k.demand.lightingSockets.length - 1]!;
  const heatFactor = heatN === 0 ? 0 : k.demand.heating[Math.min(heatN, k.demand.heating.length) - 1]!;
  const dLs = ls * row[1];
  const dHeat = heat * heatFactor;
  return {
    installedKw: ls + heat + other,
    demandKw: dLs + dHeat + other,
    groups: { lightSockets: { kw: ls, demand: dLs }, heating: { kw: heat, demand: dHeat, count: heatN }, other: { kw: other, demand: other } },
  };
}

/** Categoria provável do padrão de entrada (genérica; confirmar com a concessionária). */
export function entranceFor(k: ElecK, demandKw: number, voltage: number): ElectricalReport['entrance'] {
  const cats = [...k.entranceCategories].sort((a, b) => a.maxKw - b.maxKw);
  // a primeira categoria que cobre a demanda e cujo disjuntor suporta a corrente por fase
  const c = cats.find((x) => x.maxKw >= demandKw - 1e-9 && (demandKw * 1000) / (voltage * x.phases) <= x.breakerA + 1e-9) ?? cats[cats.length - 1]!;
  return { category: c.code, phases: c.phases, breakerA: c.breakerA, cableMm2: c.cableMm2 };
}

/** Corrente do disjuntor geral: demanda dividida entre as fases (tensão fase-neutro). */
export function mainBreakerFor(k: ElecK, demandKw: number, voltage: number, phases: number, entranceA?: number): number {
  const a = breakerFor(k, (demandKw * 1000) / (voltage * phases));
  return entranceA !== undefined ? Math.min(a, entranceA) : a;
}

/**
 * Alimentador do padrão ao quadro: menor seção que suporta o disjuntor geral (método B1, circuito único) com queda
 * de até (total − terminal)% do catálogo, ou a maior seção se nenhuma serve.
 */
export function feederFor(k: ElecK, mainA: number, phases: number, lengthM: number, voltage: number, fct: number): { sectionMm2: number; voltageDropPct: number } {
  const loaded = phases > 1 ? 3 : 2;
  const factor = phases === 3 ? Math.sqrt(3) : 2;
  const vref = phases > 1 ? voltage * Math.sqrt(3) : voltage;
  const perPhaseA = mainA;
  const drop = (s: number) => ((factor * resistance70(k, s) * (lengthM / 1000) * perPhaseA) / vref) * 100;
  const limit = k.voltageDrop.totalMaxPct - k.voltageDrop.terminalMaxPct;
  const sections = sectionsOf(k);
  const ok = (s: number) => ampacity(k, s, 'B1', loaded) * fct >= mainA - 1e-9 && drop(s) <= limit + 1e-9;
  const s = sections.find(ok) ?? sections[sections.length - 1]!;
  return { sectionMm2: s, voltageDropPct: drop(s) };
}

export interface DrCircuit {
  id: string;
  breakerA: number;
  ib: number;
  /** Primeiro cômodo molhado que o circuito atende (agrupa por cômodo). */
  room: string;
}

/** DR de 30 mA por cômodo molhado, até `maxCircuitsPerDr` circuitos por DR; corrente ≥ disjuntores e soma das cargas. */
export function drGroups(k: ElecK, circuits: DrCircuit[]): ElectricalReport['panel']['drs'] {
  const by = new Map<string, DrCircuit[]>();
  for (const c of circuits) (by.get(c.room) ?? by.set(c.room, []).get(c.room)!).push(c);
  const ratings = [...k.dr.ratings].sort((a, b) => a - b);
  const out: ElectricalReport['panel']['drs'] = [];
  let n = 0;
  for (const room of [...by.keys()].sort()) {
    const list = by.get(room)!;
    for (let i = 0; i < list.length; i += k.dr.maxCircuitsPerDr) {
      const chunk = list.slice(i, i + k.dr.maxCircuitsPerDr);
      const need = Math.max(...chunk.map((c) => c.breakerA), chunk.reduce((s, c) => s + c.ib, 0));
      n++;
      out.push({ id: `dr-${n}`, ratingA: ratings.find((r) => r >= need - 1e-9) ?? ratings[ratings.length - 1]!, circuitIds: chunk.map((c) => c.id) });
    }
  }
  return out;
}

/** Módulos DIN: disjuntores + DR (2P) + DPS (2) + geral + reservas; caixa comercial. */
export function panelModules(k: ElecK, circuits: number, phaseToPhase: number, drs: number, phases: number): { ways: number; reserves: number; size: number } {
  const reserves = reservesFor(k, circuits);
  const ways = circuits + phaseToPhase + drs * 2 + 2 + Math.max(1, phases);
  const need = ways + reserves;
  const sizes = [...k.panelSizes].sort((a, b) => a - b);
  return { ways, reserves, size: sizes.find((s) => s >= need) ?? sizes[sizes.length - 1]! };
}
