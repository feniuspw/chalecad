/** Conteúdos de elétrica: planta de pontos e circuitos, diagrama unifilar e quadro de cargas (F17-W2). */
import type { ElecCircuitResult, ElectricalReport, Vec2 } from '@chalecad/engine';
import { CONDUIT_COLOR, CONTROL_COLOR } from '../../elec/kinds';
import { SYMBOL_LEGEND, elecPlanFromResults, symbolShape, type PlanPointItem } from '../../elec/symbols';
import { roomLabelPoint } from '../../plan2d/rooms';
import { fmt } from '../../project/format';
import type { ContentRenderer, SheetContext } from '../types';
import {
  GREY, INK, W, basePlan, bounds, ci, dimH, dimV, g, legendItem, ln, m2, makeFrame, normList, normRef, pgon, pline, rc, rendered, resolveLevel, roomNames, table, textWidth, tx, wallPolygon, wallsAtLevel,
} from './kit';

const ELEC_NORMS = ['nbr5410'];

// ---------------------------------------------------------------------------
// Potência por ponto (VA)
// ---------------------------------------------------------------------------

/** Potência de cada ponto (VA): a do projeto, a do aparelho/luminária ou a regra da NBR 5410 (catálogo). */
export function pointPowerVA(ctx: SheetContext, report: ElectricalReport): Map<string, number> {
  const k = ctx.catalog.constants.electrical;
  const out = new Map<string, number>();
  const wetIndex = new Map<string, number>();
  const circuitKind = new Map(report.layout.circuits.map((c) => [c.id, c.kind]));
  const circuitPoints = new Map(report.circuits.map((c) => [c.id, c]));
  for (const p of report.layout.points) {
    let va: number | null = null;
    if (p.powerVA !== undefined) va = p.powerVA;
    else if (p.kind === 'light') {
      const lum = k.luminaires.find((l) => l.id === p.luminaire);
      if (lum) va = lum.watts * (p.count ?? 1);
    } else if (p.kind === 'socket_tue') {
      const ap = p.appliance ? k.appliances[p.appliance] : undefined;
      if (ap) va = ap.pf ? ap.w / ap.pf : ap.w;
      else {
        const c = p.circuitId ? circuitPoints.get(p.circuitId) : undefined;
        if (c && c.pointIds.length === 1) va = c.powerVA;
      }
    } else if (p.kind === 'socket' || p.kind === 'socket_high') {
      const ck = p.circuitId ? circuitKind.get(p.circuitId) : undefined;
      if (ck === 'wet_sockets' && p.circuitId) {
        const n = wetIndex.get(p.circuitId) ?? 0;
        wetIndex.set(p.circuitId, n + 1);
        va = n < k.loads.sockets.wetHighCount ? k.loads.sockets.wetVA : k.loads.sockets.generalVA;
      } else va = k.loads.sockets.generalVA;
    }
    if (va !== null) out.set(p.id, Math.round(va));
  }
  return out;
}

function symbolSvg(shape: ReturnType<typeof symbolShape>, P: (p: Vec2) => [number, number], color: string, w: number): string {
  const path = (pts: Vec2[], closed: boolean) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${P(p)[0].toFixed(2)} ${P(p)[1].toFixed(2)}`).join(' ') + (closed ? ' Z' : '');
  const fills = shape.fills.map((f) => `<path d="${path(f, true)}" fill="${color}" stroke="none"/>`).join('');
  const outline = shape.outline.map((s) => `<path d="${path(s.pts, s.closed)}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`).join('');
  return fills + outline;
}

// ---------------------------------------------------------------------------
// Planta elétrica
// ---------------------------------------------------------------------------

export const renderElectricalPlan: ContentRenderer = (ctx, content, scale) => {
  const { results, catalog } = ctx;
  const e = results.installations?.electrical;
  if (!e) return null;
  const level = resolveLevel(ctx, content.target);
  if (!level) return null;
  const model = elecPlanFromResults(results, level.id);
  if (!model || (model.points.length === 0 && model.conduits.length === 0)) return null;
  const walls = wallsAtLevel(results.model, level);
  if (walls.length === 0) return null;
  const sc = scale || 50;
  const f = makeFrame(walls.flatMap(wallPolygon), sc, { l: 22, t: 14, r: 14, b: 22 });
  const P = f.P;
  const out: string[] = [];
  out.push(basePlan(ctx, walls, f, { w: W.sec, color: GREY }));
  out.push(roomNames(ctx, level.id, f, roomLabelPoint));

  // eletrodutos
  const dash = { ceiling: undefined, floor: '3 1', wall: '0.8 0.8' } as const;
  out.push(
    g(
      model.conduits
        .map((c) => pline(c.path.map(P), W.sec, { stroke: CONDUIT_COLOR, 'stroke-dasharray': dash[c.run], 'data-role': 'conduit', 'data-id': c.id }))
        .join(''),
      { 'data-role': 'conduits' },
    ),
  );
  // ligações de comando
  out.push(g(model.links.map((l) => ln(...P(l.from), ...P(l.to), W.thin, { stroke: CONTROL_COLOR, 'stroke-dasharray': '1.2 0.8', 'data-letter': l.letter })).join(''), { 'data-role': 'control-links' }));

  // símbolos
  const va = pointPowerVA(ctx, e);
  const circuitsById = new Map(e.circuits.map((c) => [c.id, c]));
  void circuitsById;
  const labels: string[] = [];
  const syms = model.points.map((it: PlanPointItem) => {
    const s = symbolSvg(it.shape, P, it.point ? it.color : INK, W.sec);
    if (it.kind === 'panel') {
      const [x, y] = P(it.shape.labelAt);
      labels.push(tx(x, y, 'QDC', { bold: true, halo: true }));
    } else if (it.point) {
      const pt = it.point;
      const [x, y] = P(it.shape.labelAt);
      const letters = it.labels[0]?.text ?? '';
      if (it.kind === 'switch_one' || it.kind === 'switch_two') {
        const [cx, cy] = P(it.shape.center);
        if (letters) labels.push(tx(cx, cy + 0.9, letters, { size: 2, halo: false, fill: it.color }));
      } else {
        const v = va.get(pt.id);
        const head = it.labels[0]?.text ?? '';
        const text = `${head}${v ? ` ${fmt(v, 0)}VA` : ''}`;
        if (text) labels.push(tx(x, y, text, { fill: it.color, halo: true, bold: true }));
      }
    }
    return g(s, { 'data-role': 'elec-point', 'data-id': it.id, 'data-kind': it.kind, 'data-circuit': it.circuit });
  });
  out.push(g(syms.join(''), { 'data-role': 'elec-points' }));
  // rótulos dos eletrodutos
  for (const c of model.conduits) if (c.label) labels.push(tx(...P(c.label.at), c.label.text, { fill: CONDUIT_COLOR, halo: true }));
  out.push(g(labels.join(''), { 'data-role': 'elec-labels' }));

  const bb = bounds(walls.flatMap(wallPolygon).map(P));
  out.push(dimH(bb.minX, bb.maxX, bb.maxY + 9, m2(f.maxX - f.minX), bb.maxY));
  out.push(dimV(bb.minY, bb.maxY, bb.minX - 9, m2(f.maxY - f.minY), bb.minX));

  const legend = [
    ...model.legend.map((kind) => {
      const sh = symbolShape(kind, [0, 0], [0, 1]);
      const sym = symbolSvg(sh, ([x, y]) => [5 + x * 16, 4.4 - y * 16], INK, W.sec);
      return legendItem(sym, SYMBOL_LEGEND[kind]);
    }),
    legendItem(ln(0.5, 2.5, 9.5, 2.5, W.sec, { stroke: CONDUIT_COLOR }), 'Eletroduto no forro'),
    legendItem(ln(0.5, 2.5, 9.5, 2.5, W.sec, { stroke: CONDUIT_COLOR, 'stroke-dasharray': '3 1' }), 'Eletroduto no piso'),
    legendItem(ln(0.5, 2.5, 9.5, 2.5, W.sec, { stroke: CONDUIT_COLOR, 'stroke-dasharray': '0.8 0.8' }), 'Eletroduto na parede'),
    legendItem(ln(0.5, 2.5, 9.5, 2.5, W.thin, { stroke: CONTROL_COLOR, 'stroke-dasharray': '1.2 0.8' }), 'Comando (interruptor → luz, por letra)'),
  ];
  const notes = [
    'Simbologia conforme legenda (a NBR 5444 foi cancelada).',
    `Instalações elétricas de baixa tensão conforme ${normList(catalog, ELEC_NORMS)}; tomadas ${normRef(catalog, 'nbr14136')}.`,
    'Rótulos: nº do circuito (cor própria) + letra do comando (a, b...) + potência em VA. Ø = diâmetro do eletroduto (mm), seguido do nº de circuitos no trecho.',
    `Tensão ${e.voltage} V; esquema de aterramento ${ctx.project.legal.earthing}; DR de ${catalog.constants.electrical.dr.sensitivityMa} mA nas áreas molhadas.`,
    'Traçado de eletrodutos indicativo (estimado pelo programa); alturas das caixas conforme catálogo. Conferir em obra.',
  ];
  return rendered(g(out.join(''), { 'data-role': 'electrical-plan' }), bb.maxX + 16, f.bottom + 22, `PLANTA ELÉTRICA — ${level.name.toUpperCase()}`, { scale: sc, notes, legend });
};

// ---------------------------------------------------------------------------
// Diagrama unifilar
// ---------------------------------------------------------------------------

interface Branch {
  c: ElecCircuitResult;
  n: number;
}

/** Circuitos agrupados por DR (na ordem do quadro) e depois os sem DR. */
export function drGroups(e: ElectricalReport): { dr: ElectricalReport['panel']['drs'][number] | null; items: Branch[] }[] {
  const idx = new Map(e.circuits.map((c, i) => [c.id, i]));
  const groups: { dr: ElectricalReport['panel']['drs'][number] | null; items: Branch[] }[] = [];
  const used = new Set<string>();
  for (const dr of e.panel.drs) {
    const items = dr.circuitIds
      .map((id) => ({ c: e.circuits[idx.get(id) ?? -1], n: (idx.get(id) ?? -1) + 1 }))
      .filter((x): x is Branch => x.c !== undefined)
      .sort((a, b) => a.n - b.n);
    if (items.length) groups.push({ dr, items });
    for (const it of items) used.add(it.c.id);
  }
  const rest = e.circuits.map((c, i) => ({ c, n: i + 1 })).filter((x) => !used.has(x.c.id));
  for (const r of rest) groups.push({ dr: null, items: [r] });
  return groups;
}

const COL = 24;

export const renderSingleLine: ContentRenderer = (ctx) => {
  const e = ctx.results.installations?.electrical;
  if (!e || e.circuits.length === 0) return null;
  const { catalog, project } = ctx;
  const groups = drGroups(e);
  const nCols = groups.reduce((s, gr) => s + gr.items.length, 0);
  const x0 = 70;
  const BUS = 66;
  const xEnd = x0 + nCols * COL;
  const out: string[] = [];

  // entrada
  const xc = x0 + 4;
  out.push(tx(xc, 3, 'REDE DA CONCESSIONÁRIA', { anchor: 'start', bold: true }));
  out.push(ln(xc, 5, xc, 12, W.main));
  out.push(rc(xc - 14, 12, 52, 11, W.main), tx(xc + 12, 16.8, 'MEDIDOR (kWh)', { bold: true }), tx(xc + 12, 20.8, `Padrão ${e.entrance.category}`));
  out.push(ln(xc, 23, xc, 28, W.main));
  out.push(rc(xc - 14, 28, 52, 11, W.main), tx(xc + 12, 32.8, `DISJUNTOR DE ENTRADA ${e.entrance.breakerA} A`, { bold: true }), tx(xc + 12, 36.8, `cabo de entrada ${e.entrance.cableMm2} mm² · ${e.entrance.phases} fases`));
  out.push(ln(xc, 39, xc, 44, W.main), tx(xc + 2, 43, `Alimentador ${e.feeder.sectionMm2} mm² (queda ${fmt(e.feeder.voltageDropPct, 2)} %)`, { anchor: 'start' }));
  out.push(rc(xc - 14, 44, 52, 11, W.main), tx(xc + 12, 48.8, `QD: DISJUNTOR GERAL ${e.panel.mainBreakerA} A`, { bold: true }), tx(xc + 12, 52.8, `${e.panel.ways} vias · ${e.panel.reserves} reserva(s) · ${e.voltage} V`));
  out.push(ln(xc, 55, xc, BUS, W.main));
  // barramento de fase
  out.push(ln(xc - 4, BUS, xEnd - COL / 2 + 6, BUS, 1.2), tx(xc - 6, BUS - 1.4, 'FASE', { anchor: 'end', size: 2.2 }));

  // DPS
  const xd = xc - 22;
  out.push(ln(xd, BUS, xd, BUS + 14, W.sec), rc(xd - 11, BUS + 14, 22, 11, W.sec), tx(xd, BUS + 18.6, 'DPS', { bold: true }), tx(xd, BUS + 22.6, `Uc ${e.panel.dps.ucV} V · ${e.panel.dps.inKa} kA`, { size: 2 }));
  out.push(ln(xd - 4, BUS, xd + 4, BUS, 1.2));

  // colunas
  const BR = BUS + 26;
  const N_Y = BR + 22;
  const PE_Y = BR + 26;
  const TERM_Y = BR + 33;
  let col = 0;
  const colX = (i: number) => x0 + COL * i + COL / 2;
  for (const gr of groups) {
    const first = colX(col);
    const last = colX(col + gr.items.length - 1);
    const mid = (first + last) / 2;
    if (gr.dr) {
      const w = Math.max(COL - 4, last - first + COL - 4);
      out.push(rc(mid - w / 2, BUS + 6, w, 12, W.sec, { 'data-role': 'dr', 'data-dr': gr.dr.id }), tx(mid, BUS + 11, `DR ${gr.dr.ratingA} A · ${catalog.constants.electrical.dr.sensitivityMa} mA`, { bold: true }), tx(mid, BUS + 15, `${gr.items.length} circuito(s)`, { size: 2 }));
      out.push(ln(mid, BUS, mid, BUS + 6, W.sec), ln(mid, BUS + 18, mid, BUS + 21, W.sec));
      out.push(ln(first, BUS + 21, last, BUS + 21, W.sec));
      out.push(rc(first - COL / 2 + 1, BUS + 3, last - first + COL - 2, BR + 66 - BUS, W.thin, { stroke: GREY, 'stroke-dasharray': '1.5 1.5' }));
    }
    gr.items.forEach((b, i) => {
      const x = colX(col + i);
      const top = gr.dr ? BUS + 21 : BUS;
      out.push(ln(x, top, x, BR, W.sec, { 'data-role': 'branch', 'data-circuit': b.c.id }));
      if (!gr.dr) out.push(ci(x, BUS, 0.9, W.sec, { fill: INK }));
      out.push(rc(x - 7, BR, 14, 12, W.sec), tx(x, BR + 5, `${b.c.breakerA} A`, { bold: true }), tx(x, BR + 9.4, `curva ${b.c.curve}`, { size: 2 }));
      out.push(ln(x, BR + 12, x, TERM_Y, W.sec));
      out.push(ci(x - 3, N_Y, 0.8, W.sec, { fill: INK }), ci(x + 3, PE_Y, 0.8, W.sec, { fill: INK }));
      out.push(tx(x, TERM_Y + 4, `C${b.n}`, { bold: true }), tx(x, TERM_Y + 8, `${fmt(b.c.sectionMm2, b.c.sectionMm2 % 1 ? 1 : 0)} mm²`), tx(x, TERM_Y + 12, `${fmt(b.c.powerVA, 0)} VA`));
      const desc = b.c.name.length > 40 ? b.c.name.slice(0, 39) + '…' : b.c.name;
      out.push(tx(x + 0.8, TERM_Y + 15, desc, { anchor: 'end', rotate: -90 }));
    });
    col += gr.items.length;
  }
  // barramentos N e PE
  out.push(ln(x0 + 2, N_Y, xEnd - 2, N_Y, 1.2, { stroke: GREY }), tx(xEnd, N_Y + 0.9, 'N', { bold: true }));
  out.push(ln(x0 + 2, PE_Y, xEnd - 2, PE_Y, 1.2, { stroke: '#15803d' }), tx(xEnd, PE_Y + 0.9, 'PE', { bold: true }));
  // aterramento
  const gx = x0 - 36;
  out.push(ln(x0 - 3, PE_Y, gx, PE_Y, W.sec, { stroke: '#15803d' }), ln(gx, PE_Y, gx, PE_Y + 8, W.sec, { stroke: '#15803d' }));
  out.push(ln(gx - 4, PE_Y + 8, gx + 4, PE_Y + 8, W.main), ln(gx - 2.6, PE_Y + 10, gx + 2.6, PE_Y + 10, W.main), ln(gx - 1.2, PE_Y + 12, gx + 1.2, PE_Y + 12, W.main));
  out.push(tx(gx, PE_Y + 17, `Aterramento ${project.legal.earthing}`, { bold: true }), tx(gx, PE_Y + 21, 'eletrodo / haste de terra', { size: 2.2 }));
  if (project.legal.earthing === 'TN-S') out.push(tx(gx, PE_Y + 25, 'PE e N separados', { size: 2.2, fill: GREY }));

  const width = Math.max(xEnd + 8, 200);
  const maxDesc = Math.max(...groups.flatMap((gr) => gr.items.map((b) => Math.min(b.c.name.length, 40)))) * 1.3;
  const height = TERM_Y + 15 + maxDesc + 4;
  const notes = [
    `Diagrama unifilar do QD conforme ${normList(catalog, ELEC_NORMS)}; DR de ${catalog.constants.electrical.dr.sensitivityMa} mA e DPS classe II no quadro.`,
    `Esquema de aterramento ${project.legal.earthing}; seções e disjuntores calculados pelo programa (capacidade de corrente, queda de tensão, agrupamento). Padrão de entrada a confirmar com a concessionária.`,
    'C1... = circuitos na ordem do quadro de cargas; N e PE em barramentos próprios.',
  ];
  const legend = [
    legendItem(ln(0.5, 2.5, 9.5, 2.5, 1.2), 'Barramento de fase'),
    legendItem(rc(1, 0.8, 8, 3.4, W.sec), 'Disjuntor / DR / DPS'),
    legendItem(ci(5, 2.5, 0.9, W.sec, { fill: INK }), 'Terminal de neutro (N) / terra (PE)'),
  ];
  return rendered(g(out.join(''), { 'data-role': 'single-line' }), width, height, 'DIAGRAMA UNIFILAR — QUADRO DE DISTRIBUIÇÃO', { notes, legend });
};

// ---------------------------------------------------------------------------
// Quadro de cargas
// ---------------------------------------------------------------------------

export interface LoadRow {
  n: number;
  circuit: ElecCircuitResult;
  dr: boolean;
}

export function loadRows(e: ElectricalReport): LoadRow[] {
  const inDr = new Set(e.panel.drs.flatMap((d) => d.circuitIds));
  return e.circuits.map((c, i) => ({ n: i + 1, circuit: c, dr: inDr.has(c.id) || c.dr }));
}

export const renderLoadTable: ContentRenderer = (ctx) => {
  const e = ctx.results.installations?.electrical;
  if (!e || e.circuits.length === 0) return null;
  const { catalog } = ctx;
  const rows = loadRows(e);
  const totalVA = rows.reduce((s, r) => s + r.circuit.powerVA, 0);
  const body = rows.map((r) => {
    const c = r.circuit;
    return [`C${r.n}`, c.name, `${c.voltage} V${c.phaseToPhase ? ' (FF)' : ''}`, fmt(c.powerVA, 0), fmt(c.ib, 1), fmt(c.sectionMm2, c.sectionMm2 % 1 ? 1 : 0), `${c.breakerA} A · ${c.curve}`, r.dr ? 'Sim' : 'Não', fmt(c.totalDropPct, 2)];
  });
  body.push(['', 'TOTAL', '', fmt(totalVA, 0), '', '', '', '', '']);
  const t = table({
    x: 0,
    y: 0,
    head: ['Circ.', 'Descrição', 'Tensão', 'Potência (VA)', 'Corrente (A)', 'Seção (mm²)', 'Disjuntor', 'DR', 'Queda (%)'],
    rows: body,
    align: ['l', 'l', 'l', 'r', 'r', 'r', 'l', 'c', 'r'],
    totalRow: true,
    minW: [10, 60, 18, 20, 20, 18, 24, 10, 16],
  });
  const lines = [
    `Carga instalada: ${fmt(e.installedKw, 2)} kW (soma dos circuitos: ${fmt(totalVA / 1000, 2)} kVA).`,
    `Demanda: ${fmt(e.demandKw, 2)} kW (fator de demanda da concessionária, catálogo).`,
    `Padrão de entrada: categoria ${e.entrance.category}, ${e.entrance.phases} fases, disjuntor geral ${e.entrance.breakerA} A, cabo ${e.entrance.cableMm2} mm² — confirmar com a concessionária.`,
    `Quadro: ${e.panel.ways} vias (${e.panel.reserves} de reserva), disjuntor geral do QD ${e.panel.mainBreakerA} A; alimentador ${e.feeder.sectionMm2} mm², queda ${fmt(e.feeder.voltageDropPct, 2)} %.`,
  ];
  let y = t.height + 4;
  const foot = lines.map((s) => {
    const r = tx(0, y + 2.2, s, { anchor: 'start' });
    y += 3.8;
    return r;
  });
  const width = Math.max(t.width, ...lines.map((s) => textWidth(s)));
  const notes = [
    `Quadro de cargas conforme ${normList(catalog, ELEC_NORMS)}; queda de tensão total inclui o alimentador (limite ${catalog.constants.electrical.voltageDrop.totalMaxPct} %).`,
    'Padrão de entrada e demanda: confirmar com a concessionária.',
  ];
  return rendered(g(t.svg + foot.join(''), { 'data-role': 'load-table' }), width + 2, y + 2, 'QUADRO DE CARGAS', { notes });
};

void pgon;
