/** Conteúdos de hidrossanitário: água fria/quente, esgoto, isométrico, caixa d'água e fossa (F17-W2). */
import type { Pipe, PipeSystem, PlumbingReport, Vec2 } from '@chalecad/engine';
import { inferSewer } from '../../plumb/devices';
import { dist2, isVertical, levelElevation, type V3 } from '../../plumb/geometry';
import { flowArrows, longestSegment, pipeInfo, pipeTag, stackTag, tankSide } from '../../plumb/symbols';
import { roomLabelPoint } from '../../plan2d/rooms';
import { fmt } from '../../project/format';
import type { ContentRenderer, SheetContext } from '../types';
import {
  GREY, INK, LIGHT, TXT, W, arrow, basePlan, bounds, ci, dimH, dimV, g, legendItem, ln, m2, makeFrame, normList, normRef, pgon, pline, rc, rendered, resolveLevel, roomNames, tx, wallPolygon, wallsAtLevel,
  type Frame, type Pt,
} from './kit';

const COLORS: Record<PipeSystem, string> = { cold: '#1E88E5', hot: '#E53935', sewer: '#6D4C41', vent: '#43A047' };
/** Tipo de linha por sistema: distingue também em impressão preto e branco. */
const DASH: Record<PipeSystem, string | undefined> = { cold: undefined, hot: '5 1.2 1 1.2', sewer: undefined, vent: '3 1.6' };
const WIDTH: Record<PipeSystem, number> = { cold: W.main, hot: W.main, sewer: W.main, vent: W.sec };
const SHORT: Record<string, string> = {
  toilet_tank: 'Bacia',
  lavatory: 'Lavatório',
  shower_electric: 'Chuveiro',
  shower_mixer: 'Chuveiro',
  kitchen_sink: 'Pia',
  laundry_tub: 'Tanque',
  washing_machine: 'Máq. lavar',
  bathtub: 'Banheira',
  garden_tap: 'Torneira',
};
const colorOf = (ctx: SheetContext, s: PipeSystem) => (ctx.catalog.constants.plumbing.colors as Record<PipeSystem, string>)[s] ?? COLORS[s];

const bowtie = (x: number, y: number, ang: number, color: string) => {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const r = (px: number, py: number): Pt => [x + px * c - py * s, y + px * s + py * c];
  const a = r(-1.4, -0.9);
  const b = r(-1.4, 0.9);
  const m = r(0, 0);
  const d = r(1.4, -0.9);
  const e = r(1.4, 0.9);
  return pgon([a, b, m], W.sec, { stroke: color, fill: '#fff' }) + pgon([m, d, e], W.sec, { stroke: color, fill: '#fff' });
};

function planPipes(ctx: SheetContext, report: PlumbingReport, levelId: string, f: Frame, systems: PipeSystem[], flowForward?: Map<string, boolean>): { svg: string; count: number } {
  const info = pipeInfo(report);
  const out: string[] = [];
  const pipes = report.layout.pipes.filter((p) => p.level === levelId && systems.includes(p.system));
  for (const p of pipes) {
    const path = p.path as V3[];
    const c = colorOf(ctx, p.system);
    if (isVertical(path)) {
      const [x, y] = f.P([path[0]![0], path[0]![1]]);
      const dn = info.get(p.id)?.dn;
      out.push(ci(x, y, 1.7, W.main, { stroke: c, fill: '#fff', 'data-role': 'riser', 'data-id': p.id }), ci(x, y, 0.5, W.sec, { stroke: c, fill: c }));
      out.push(tx(x + 2.6, y + 0.9, `${stackTag(p)}${dn ? ` Ø${dn}` : ''}`, { anchor: 'start', fill: c, bold: true, halo: true }));
      continue;
    }
    const pts = path.map((v) => f.P([v[0], v[1]]));
    out.push(pline(pts, WIDTH[p.system], { stroke: c, 'stroke-dasharray': DASH[p.system], 'stroke-linecap': 'butt', 'data-role': 'pipe', 'data-system': p.system, 'data-id': p.id }));
    if (p.system === 'sewer' && flowForward) {
      const fwd = flowForward.get(p.id) ?? path[0]![2] >= path[path.length - 1]![2];
      for (const a of flowArrows(path, fwd, 0.5)) {
        const [x, y] = f.P(a.at);
        out.push(arrow(x, y, a.dir[0], -a.dir[1], 2.4, c));
      }
    }
    const seg = longestSegment(path);
    const label = pipeTag(p as Pick<Pipe, 'system'>, info.get(p.id));
    if (seg && label && seg.length >= 0.4) {
      const a = f.P([path[seg.index]![0], path[seg.index]![1]]);
      const b = f.P([path[seg.index + 1]![0], path[seg.index + 1]![1]]);
      let ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
      if (ang > 90 || ang < -90) ang += 180;
      out.push(tx((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 1.2, label, { fill: c, bold: true, halo: true, rotate: ang }));
    }
    if ((p.system === 'cold' || p.system === 'hot') && !p.id.includes('barrilete') && pts.length >= 2) {
      const a = pts[0]!;
      const b = pts[1]!;
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const t = Math.min(0.5, 3.2 / L);
      out.push(bowtie(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(b[1] - a[1], b[0] - a[0]), c));
    }
  }
  return { svg: g(out.join(''), { 'data-role': 'pipes' }), count: pipes.length };
}

function fixtureDots(ctx: SheetContext, report: PlumbingReport, levelId: string, f: Frame, withHeight: boolean): string {
  const k = ctx.catalog.constants.plumbing;
  const zByPoint = new Map(report.water.points.map((p) => [p.pointId, p.z]));
  const elev = levelElevation(ctx.project, levelId);
  const out: string[] = [];
  for (const pt of report.layout.points.filter((p) => p.level === levelId)) {
    const spec = k.water.fixtures[pt.fixture];
    const [x, y] = f.P(pt.position);
    const hot = (spec?.wHot ?? 0) > 0;
    out.push(ci(x, y, 1.2, W.sec, { stroke: hot ? COLORS.hot : COLORS.cold, fill: hot ? COLORS.hot : '#fff' }));
    const z = zByPoint.get(pt.id);
    const h = z !== undefined ? ` h=${m2(z - elev)}` : '';
    out.push(tx(x + 2.2, y + 3.6, `${SHORT[pt.fixture] ?? pt.label ?? pt.fixture}${withHeight ? h : ''}`, { anchor: 'start', halo: true }));
  }
  return g(out.join(''), { 'data-role': 'fixtures' });
}

function planFrame(ctx: SheetContext, levelId: string, scale: number) {
  const level = resolveLevel(ctx, levelId);
  if (!level) return null;
  const walls = wallsAtLevel(ctx.results.model, level);
  if (walls.length === 0) return null;
  const f = makeFrame(walls.flatMap(wallPolygon), scale, { l: 22, t: 14, r: 16, b: 22 });
  return { level, walls, f };
}

const dims = (f: Frame, pts: Pt[]) => {
  const bb = bounds(pts);
  return dimH(bb.minX, bb.maxX, bb.maxY + 9, m2(f.maxX - f.minX), bb.maxY) + dimV(bb.minY, bb.maxY, bb.minX - 9, m2(f.maxY - f.minY), bb.minX);
};

// ---------------------------------------------------------------------------
// Água fria e quente
// ---------------------------------------------------------------------------

export const renderPlumbingPlan: ContentRenderer = (ctx, content, scale) => {
  const report = ctx.results.installations?.plumbing;
  if (!report) return null;
  const pf = planFrame(ctx, content.target ?? '', scale || 50);
  if (!pf) return null;
  const { level, walls, f } = pf;
  const out: string[] = [basePlan(ctx, walls, f, { w: W.sec, color: GREY }), roomNames(ctx, level.id, f, roomLabelPoint)];
  const pipes = planPipes(ctx, report, level.id, f, ['cold', 'hot']);
  out.push(pipes.svg);
  const points = report.layout.points.filter((p) => p.level === level.id);
  out.push(fixtureDots(ctx, report, level.id, f, true));
  const t = report.layout.tank;
  if (t.level === level.id) {
    const [x, y] = f.P(t.position);
    const s = tankSide(t.liters) * f.k;
    out.push(rc(x - s / 2, y - s / 2, s, s, W.main, { stroke: COLORS.cold, fill: '#fff', 'data-role': 'tank' }), tx(x, y - 0.4, `CX ${t.liters} L`, { bold: true, fill: COLORS.cold }), tx(x, y + 3, `fundo ${m2(t.bottomZ)}`, { size: 2.2 }));
  }
  if (pipes.count === 0 && points.length === 0 && t.level !== level.id) return null;
  out.push(dims(f, walls.flatMap(wallPolygon).map(f.P)));

  const k = ctx.catalog.constants.plumbing;
  const minKpa = k.water.minDynamicKpa.default;
  const worst = report.water.points.length ? report.water.points.reduce((a, b) => (b.dynamicKpa - b.minKpa < a.dynamicKpa - a.minKpa ? b : a)) : null;
  const fails = report.water.points.filter((p) => !p.ok).length;
  const notes = [
    `Água fria e quente conforme ${normList(ctx.catalog, ['nbr5626'])}; esgoto e ventilação em prancha própria (${normRef(ctx.catalog, 'nbr8160')}).`,
    `DN em mm. AF = água fria; AQ = água quente. Pressão dinâmica mínima de projeto ${fmt(minKpa, 0)} kPa (${fmt(minKpa / 9.80665, 1)} m.c.a.), menor nos pontos de utilização com peça de menor exigência.`,
    worst ? `Ponto mais desfavorável: ${SHORT[worst.fixture] ?? worst.fixture}, ${fmt(worst.dynamicKpa, 1)} kPa disponíveis (mínimo ${fmt(worst.minKpa, 0)} kPa)${fails ? `; ${fails} ponto(s) abaixo do mínimo, subir a caixa` : ': todos os pontos atendem'}.` : 'Sem pontos de utilização calculados.',
    `Caixa d'água ${t.liters} L, fundo na cota ${m2(t.bottomZ)} m. Registros de gaveta/pressão no início de cada coluna e ramal. h = altura do ponto acima do piso do nível.`,
    'Tubulação sob o forro, prumadas embutidas nos painéis; material e conexões conforme lista de materiais.',
  ];
  const legend = [
    legendItem(ln(0.5, 2.5, 9.5, 2.5, W.main, { stroke: COLORS.cold }), 'Água fria (traço contínuo)'),
    legendItem(ln(0.5, 2.5, 9.5, 2.5, W.main, { stroke: COLORS.hot, 'stroke-dasharray': DASH.hot }), 'Água quente (traço e ponto)'),
    legendItem(bowtie(5, 2.5, 0, INK), 'Registro'),
    legendItem(ci(5, 2.5, 1.7, W.main, { stroke: COLORS.cold, fill: '#fff' }) + ci(5, 2.5, 0.5, W.sec, { stroke: COLORS.cold, fill: COLORS.cold }), 'Prumada (AF ↓ desce, ↑ sobe)'),
    legendItem(ci(5, 2.5, 1.2, W.sec, { stroke: COLORS.cold, fill: '#fff' }), 'Ponto de utilização'),
    legendItem(rc(2, 0.8, 6, 3.4, W.main, { stroke: COLORS.cold }), "Caixa d'água"),
  ];
  return rendered(g(out.join(''), { 'data-role': 'plumbing-plan' }), f.right + 22, f.bottom + 22, `HIDRÁULICA — ÁGUA FRIA E QUENTE — ${level.name.toUpperCase()}`, { scale: scale || 50, notes, legend });
};

// ---------------------------------------------------------------------------
// Esgoto e ventilação
// ---------------------------------------------------------------------------

export const renderSewerPlan: ContentRenderer = (ctx, content, scale) => {
  const report = ctx.results.installations?.plumbing;
  if (!report) return null;
  const pf = planFrame(ctx, content.target ?? '', scale || 50);
  if (!pf) return null;
  const { level, walls, f } = pf;
  const k = ctx.catalog.constants.plumbing;
  const sewer = inferSewer(report.layout, ctx.project, k);
  const out: string[] = [basePlan(ctx, walls, f, { w: W.sec, color: GREY }), roomNames(ctx, level.id, f, roomLabelPoint)];
  const pipes = planPipes(ctx, report, level.id, f, ['sewer', 'vent'], sewer.flowForward);
  out.push(pipes.svg);
  const devices = sewer.devices.filter((d) => d.level === level.id);
  out.push(
    g(
      devices
        .map((d) => {
          const [x, y] = f.P(d.xy);
          const s = d.kind === 'ci' ? 3.6 : 2.8;
          return rc(x - s / 2, y - s / 2, s, s, W.main, { stroke: COLORS.sewer, fill: '#fff', 'data-kind': d.kind }) + tx(x + s / 2 + 1, y + 3.4, d.kind.toUpperCase(), { anchor: 'start', bold: true, halo: true, fill: COLORS.sewer });
        })
        .join(''),
      { 'data-role': 'sewer-devices' },
    ),
  );
  out.push(fixtureDots(ctx, report, level.id, f, false));

  // saída para fossa ou rede: ponta do coletor que não alimenta outro tubo
  const sewerPipes = report.layout.pipes.filter((p) => p.system === 'sewer' && !isVertical(p.path as V3[]));
  const key = (v: readonly number[]) => `${Math.round(v[0]! * 50)}:${Math.round(v[1]! * 50)}`;
  const starts = new Set(sewerPipes.map((p) => key(p.path[0]!)));
  const exit = sewerPipes.filter((p) => p.level === level.id).find((p) => !starts.has(key(p.path[p.path.length - 1]!)));
  if (exit && sewerPipes.some((p) => p.level === level.id)) {
    const path = exit.path as V3[];
    const a = f.P([path[path.length - 2]![0], path[path.length - 2]![1]]);
    const e = f.P([path[path.length - 1]![0], path[path.length - 1]![1]]);
    const L = Math.hypot(e[0] - a[0], e[1] - a[1]) || 1;
    const ux = (e[0] - a[0]) / L;
    const uy = (e[1] - a[1]) / L;
    out.push(arrow(e[0] + ux * 6, e[1] + uy * 6, ux, uy, 3, COLORS.sewer), ln(e[0], e[1], e[0] + ux * 4, e[1] + uy * 4, W.main, { stroke: COLORS.sewer }));
    const dest = ctx.project.installations.plumbing.sewerDisposal === 'public' ? 'Para a rede pública' : `Para a fossa séptica (${report.septic?.tankLiters ?? '—'} L)`;
    out.push(tx(e[0] + ux * 9, e[1] + uy * 9 + 1, dest, { anchor: ux < -0.3 ? 'end' : 'start', bold: true, halo: true }));
  }
  if (pipes.count === 0 && devices.length === 0 && report.layout.points.every((p) => p.level !== level.id)) return null;
  out.push(dims(f, walls.flatMap(wallPolygon).map(f.P)));

  const notes = [
    `Esgoto sanitário e ventilação conforme ${normRef(ctx.catalog, 'nbr8160')}; DN pelas unidades Hunter de contribuição (UHC), total ${report.sewer.totalUhc} UHC.`,
    `Declividades: ${fmt(Math.min(...report.sewer.pipes.filter((p) => p.system === 'sewer' && p.slope > 0).map((p) => p.slope * 100), 100), 1)} % (mínima adotada) a ${fmt(Math.max(...report.sewer.pipes.filter((p) => p.system === 'sewer').map((p) => p.slope * 100), 0), 1)} % (máxima), conforme o DN; setas indicam o sentido do escoamento.`,
    `Ventilação ${report.sewer.vented ? 'prevista em todos os ramais, com terminais acima do telhado' : 'incompleta: verificar'}; distâncias máximas aparelho–ventilação conforme catálogo (${normRef(ctx.catalog, 'nbr8160')}).`,
    'CS = caixa sifonada; CG = caixa de gordura; CI = caixa de inspeção; TQ = tubo de queda; TV = tubo de ventilação.',
    `Disposição do efluente: ${ctx.project.installations.plumbing.sewerDisposal === 'public' ? 'rede pública' : 'fossa séptica e disposição final (ver prancha da fossa)'}.`,
  ];
  const legend = [
    legendItem(ln(0.5, 2.5, 9.5, 2.5, W.main, { stroke: COLORS.sewer }) + arrow(6.5, 2.5, 1, 0, 2.2, COLORS.sewer), 'Esgoto, com sentido do fluxo'),
    legendItem(ln(0.5, 2.5, 9.5, 2.5, W.sec, { stroke: COLORS.vent, 'stroke-dasharray': DASH.vent }), 'Ventilação (tracejado)'),
    legendItem(rc(3.4, 1.1, 3.2, 3.2, W.main, { stroke: COLORS.sewer }), 'Caixa (CS, CG, CI)'),
    legendItem(ci(5, 2.5, 1.7, W.main, { stroke: COLORS.sewer, fill: '#fff' }) + ci(5, 2.5, 0.5, W.sec, { stroke: COLORS.sewer, fill: COLORS.sewer }), 'Tubo de queda / ventilação vertical'),
  ];
  return rendered(g(out.join(''), { 'data-role': 'sewer-plan' }), f.right + 40, f.bottom + 22, `HIDRÁULICA — ESGOTO E VENTILAÇÃO — ${level.name.toUpperCase()}`, { scale: scale || 50, notes, legend });
};

// ---------------------------------------------------------------------------
// Isométrico da água fria
// ---------------------------------------------------------------------------

const C30 = Math.cos(Math.PI / 6);
const S30 = Math.sin(Math.PI / 6);

export const renderWaterIsometric: ContentRenderer = (ctx, _content, scale) => {
  const report = ctx.results.installations?.plumbing;
  if (!report) return null;
  const cold = report.layout.pipes.filter((p) => p.system === 'cold');
  if (cold.length === 0) return null;
  const { project, catalog } = ctx;
  const abs = (p: Pipe) => (p.path as V3[]).map((v) => [v[0], v[1], v[2] + levelElevation(project, p.level)] as V3);
  const all = cold.flatMap(abs);
  // projeção 30°: +x desce à direita, +y sobe à direita (visto do sudoeste), z para cima
  const proj = (v: readonly number[], k: number): Pt => [(v[0]! + v[1]!) * C30 * k, ((v[0]! - v[1]!) * S30 - v[2]!) * k];
  const scales = [...catalog.constants.approval.scales].sort((a, b) => a - b).filter((s) => s >= (scale || 50));
  let sc = scales[0] ?? scale ?? 50;
  const tank = report.layout.tank;
  const extent = (k: number) => bounds([...all, [tank.position[0], tank.position[1], tank.bottomZ + 1.2], ...project.levels.map((l) => [0, 0, l.elevation] as V3)].map((v) => proj(v, k)));
  for (const s of scales) {
    sc = s;
    const bb = extent(1000 / s);
    if (bb.maxX - bb.minX < 330) break;
  }
  const k = 1000 / sc;
  const bb = extent(k);
  const ox = 30 - bb.minX;
  const oy = 16 - bb.minY;
  const P = (v: readonly number[]): Pt => {
    const q = proj(v, k);
    return [q[0] + ox, q[1] + oy];
  };
  const out: string[] = [];
  // contorno do térreo e do mezanino em pontilhado, como referência
  const fp = ctx.results.model.footprint;
  out.push(pgon(fp.map((p) => P([p[0], p[1], 0])), W.thin, { stroke: LIGHT, 'stroke-dasharray': '0.8 1.2', 'data-role': 'ref-ground' }));
  for (const s of ctx.results.model.slabs.filter((x) => x.kind === 'mezzanine')) out.push(pgon(s.polygon.map((p) => P([p[0], p[1], s.topZ])), W.thin, { stroke: LIGHT, 'stroke-dasharray': '0.8 1.2', 'data-role': 'ref-slab' }));
  // caixa d'água
  const side = tankSide(tank.liters);
  const hT = Math.min(1.2, tank.liters / 1000 / (side * side));
  const [tx0, ty0] = tank.position;
  const corner = (dx: number, dy: number, z: number) => P([tx0 + dx * side / 2, ty0 + dy * side / 2, z]);
  const top = [corner(-1, -1, tank.bottomZ + hT), corner(1, -1, tank.bottomZ + hT), corner(1, 1, tank.bottomZ + hT), corner(-1, 1, tank.bottomZ + hT)];
  const bot = [corner(-1, -1, tank.bottomZ), corner(1, -1, tank.bottomZ), corner(1, 1, tank.bottomZ), corner(-1, 1, tank.bottomZ)];
  out.push(pgon([bot[0]!, bot[1]!, top[1]!, top[0]!], W.sec, { fill: '#fff', stroke: COLORS.cold }), pgon([bot[1]!, bot[2]!, top[2]!, top[1]!], W.sec, { fill: '#fff', stroke: COLORS.cold }), pgon(top, W.sec, { fill: '#fff', stroke: COLORS.cold }));
  const tc = P([tx0, ty0, tank.bottomZ + hT]);
  out.push(tx(tc[0], tc[1] + 0.9, `CX ${tank.liters} L`, { bold: true, fill: COLORS.cold }));
  out.push(tx(tc[0] + 14, tc[1] - 5, `fundo +${m2(tank.bottomZ)}`, { anchor: 'start', halo: true }));

  const info = pipeInfo(report);
  for (const p of cold) {
    const path = abs(p).map((v) => P(v));
    out.push(pline(path, W.main, { stroke: COLORS.cold, 'data-role': 'pipe', 'data-id': p.id }));
    // DN no trecho mais comprido na tela
    let bi = 0;
    let bl = 0;
    for (let i = 0; i + 1 < path.length; i++) {
      const l = Math.hypot(path[i + 1]![0] - path[i]![0], path[i + 1]![1] - path[i]![1]);
      if (l > bl) {
        bl = l;
        bi = i;
      }
    }
    const dn = info.get(p.id)?.dn;
    if (dn && bl > 6) {
      const a = path[bi]!;
      const b = path[bi + 1]!;
      out.push(tx((a[0] + b[0]) / 2 + 1.6, (a[1] + b[1]) / 2 - 0.6, `Ø${dn}`, { anchor: 'start', bold: true, fill: COLORS.cold, halo: true }));
    }
    if (!p.id.includes('barrilete')) {
      const a = path[0]!;
      const b = path[1]!;
      out.push(bowtie(a[0] + (b[0] - a[0]) * Math.min(0.5, 4 / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1)), a[1] + (b[1] - a[1]) * Math.min(0.5, 4 / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1)), Math.atan2(b[1] - a[1], b[0] - a[0]), COLORS.cold));
    }
  }
  // pontos com cotas
  for (const pt of report.water.points) {
    const lay = report.layout.points.find((q) => q.id === pt.pointId);
    if (!lay) continue;
    const [x, y] = P([lay.position[0], lay.position[1], pt.z]);
    out.push(ci(x, y, 1.1, W.sec, { stroke: COLORS.cold, fill: '#fff' }));
    out.push(tx(x + 2, y + 3.4, `${SHORT[pt.fixture] ?? pt.fixture} +${m2(pt.z)}`, { anchor: 'start', halo: true }));
  }
  // eixos
  const ax = 8;
  const ay = bb.maxY + oy + 14;
  out.push(ln(ax, ay, ax + 14 * C30, ay - 14 * S30, W.sec), ln(ax, ay, ax + 14 * C30, ay + 14 * S30 * 0, W.sec, { stroke: 'none' }));
  out.push(arrow(ax + 14 * C30, ay - 14 * S30, C30, -S30, 2.2), tx(ax + 14 * C30 + 2, ay - 14 * S30, '+y', { anchor: 'start' }));
  out.push(ln(ax, ay, ax + 14 * C30, ay + 14 * S30, W.sec), arrow(ax + 14 * C30, ay + 14 * S30, C30, S30, 2.2), tx(ax + 14 * C30 + 2, ay + 14 * S30 + 2, '+x', { anchor: 'start' }));

  const notes = [
    `Isométrico da água fria a 30°, a partir da caixa d'água, conforme ${normRef(catalog, 'nbr5626')}; sem escala de planta: desenho na escala 1:${sc} nas dimensões horizontais e verticais.`,
    'Cotas dos pontos em metros, absolutas (referência: piso do térreo = 0,00). Ø = DN em mm. Registros no início de cada coluna e ramal.',
    `Pressão mínima nos pontos conforme tabela da prancha de planta; caixa com fundo na cota +${m2(tank.bottomZ)}.`,
  ];
  const legend = [
    legendItem(ln(0.5, 2.5, 9.5, 2.5, W.main, { stroke: COLORS.cold }), 'Água fria'),
    legendItem(bowtie(5, 2.5, 0, INK), 'Registro'),
    legendItem(ci(5, 2.5, 1.1, W.sec, { stroke: COLORS.cold, fill: '#fff' }), 'Ponto de utilização (com cota)'),
    legendItem(ln(0.5, 2.5, 9.5, 2.5, W.thin, { stroke: LIGHT, 'stroke-dasharray': '0.8 1.2' }), 'Referência: térreo e piso do mezanino'),
  ];
  return rendered(g(out.join(''), { 'data-role': 'water-isometric' }), bb.maxX - bb.minX + 60, bb.maxY - bb.minY + 40, 'ISOMÉTRICO — ÁGUA FRIA', { scale: sc, notes, legend });
};

// ---------------------------------------------------------------------------
// Caixa d'água
// ---------------------------------------------------------------------------

export const renderTankDetail: ContentRenderer = (ctx, _content, scale) => {
  const report = ctx.results.installations?.plumbing;
  if (!report) return null;
  const { catalog, project } = ctx;
  const sc = scale && scale <= 25 ? scale : 20;
  const k = 1000 / sc;
  const t = report.layout.tank;
  const liters = t.liters;
  const hW = liters <= 1500 ? 1.0 : 1.2; // altura útil de água (m), indicativa
  const side = Math.sqrt(liters / 1000 / hW);
  const free = 0.12; // folga entre o ladrão e a tampa
  const H = hW + free;
  const supply = report.water.pipes.find((p) => p.pipeId.includes('barrilete')) ?? report.water.pipes.reduce((a, b) => (b.dn > a.dn ? b : a), report.water.pipes[0]!);
  const dn = supply?.dn ?? 40;
  const tower = t.towerId ? ctx.results.model.extras.find((x) => x.id === t.towerId) : undefined;
  const out: string[] = [];
  const x0 = 76;
  const yTop = 30;
  const w = side * k;
  const h = H * k;
  const Y = (z: number) => yTop + (H - z) * k; // z medido do fundo da caixa
  // corpo
  out.push(rc(x0, yTop, w, h, W.main, { fill: '#fff', 'data-role': 'tank-body' }));
  out.push(pgon([[x0 + 0.4, Y(hW)], [x0 + w - 0.4, Y(hW)], [x0 + w - 0.4, Y(0) - 0.4], [x0 + 0.4, Y(0) - 0.4]], W.thin, { fill: '#dbeafe', stroke: 'none', 'fill-opacity': 0.55 }));
  out.push(ln(x0 + 0.4, Y(hW), x0 + w - 0.4, Y(hW), W.thin, { stroke: COLORS.cold, 'stroke-dasharray': '2 1' }));
  out.push(pgon([[x0 + w / 2 + 6, Y(hW) - 0.2], [x0 + w / 2 + 8.4, Y(hW) - 3.6], [x0 + w / 2 + 3.6, Y(hW) - 3.6]], W.thin, { fill: COLORS.cold, stroke: COLORS.cold }));
  out.push(tx(x0 + w / 2, Y(hW) + 4.2, 'NA (nível máximo)', { size: 2.2, fill: COLORS.cold }));
  // tampa
  out.push(rc(x0 - 1.2, yTop - 2.4, w + 2.4, 2.4, W.main, { fill: '#e7e5e4' }), tx(x0 + w / 2, yTop - 4.2, 'Tampa com vedação e tela anti-inseto', { size: 2.5 }));
  // entrada com boia (esquerda, no alto)
  const yIn = Y(H - 0.03);
  out.push(ln(x0 - 14, yIn, x0 + 8, yIn, W.main, { stroke: COLORS.cold }), ln(x0 + 8, yIn, x0 + 8, yIn + 8, W.main, { stroke: COLORS.cold }), ci(x0 + 8, yIn + 10, 2, W.sec, { stroke: COLORS.cold }));
  out.push(tx(x0 - 15, yIn - 1.4, 'Entrada com boia', { anchor: 'end', halo: true }));
  // extravasor (direita)
  const yEx = Y(hW + 0.04);
  out.push(ln(x0 + w - 6, yEx, x0 + w + 14, yEx, W.main, { stroke: COLORS.cold }), ln(x0 + w + 14, yEx, x0 + w + 14, Y(0) + 18, W.main, { stroke: COLORS.cold, 'stroke-dasharray': '4 1.2' }));
  out.push(tx(x0 + w + 16, yEx - 1.4, `Extravasor (ladrão) DN ${dn}`, { anchor: 'start', halo: true }), tx(x0 + w + 16, yEx + 2.4, 'com tela; aviso visível', { anchor: 'start', size: 2.2, fill: GREY }));
  // saída para consumo (esquerda, embaixo)
  const yOut = Y(0.06);
  out.push(ln(x0 - 14, yOut, x0 + 6, yOut, W.main, { stroke: COLORS.cold }));
  out.push(bowtie(x0 - 8, yOut, 0, COLORS.cold));
  out.push(tx(x0 - 15, yOut - 1.4, `Saída p/ consumo DN ${dn}`, { anchor: 'end', halo: true }), tx(x0 - 15, yOut + 2.4, 'com registro', { anchor: 'end', size: 2.2, fill: GREY }));
  // limpeza (fundo)
  const xL = x0 + w * 0.7;
  out.push(ln(xL, Y(0), xL, Y(0) + 10, W.main, { stroke: COLORS.cold }), bowtie(xL, Y(0) + 6, Math.PI / 2, COLORS.cold), ln(xL, Y(0) + 10, x0 + w + 14, Y(0) + 10, W.main, { stroke: COLORS.cold, 'stroke-dasharray': '4 1.2' }));
  out.push(tx(xL - 2, Y(0) + 8, 'Limpeza (esvaziamento) com registro', { anchor: 'end', halo: true }));
  // suporte
  const ySup = Y(0);
  if (tower) {
    out.push(rc(x0 - 4, ySup, w + 8, 3, W.main, { fill: '#e7e5e4' }));
    for (const px of [x0 - 1, x0 + w + 1]) out.push(ln(px, ySup + 3, px, ySup + 3 + 26, W.main), ln(px + 1.5, ySup + 3, px + 1.5, ySup + 3 + 26, W.main));
    out.push(tx(x0 + w / 2, ySup + 1.4 + 0.9, 'plataforma', { size: 2 }), tx(x0 + w / 2, ySup + 3 + 30, `Torre ${t.towerId}: estrutura de apoio (ver pranchas de estrutura)`, { halo: true }));
  } else {
    out.push(rc(x0 - 6, ySup, w + 12, 4, W.main, { fill: '#e7e5e4' }), tx(x0 + w / 2, ySup + 2.9, 'laje / estrutura de apoio', { size: 2 }));
    out.push(tx(x0 + w / 2, ySup + 20, 'Apoio sobre vigas do mezanino/forro (verificar na estrutura)', { halo: true }));
  }
  // cotas
  out.push(dimH(x0, x0 + w, yTop - 9, m2(side), yTop - 2.4));
  out.push(dimV(yTop, yTop + h, x0 - 58, m2(H), x0 - 50));
  out.push(dimV(Y(hW), Y(0), x0 + w + 8, `${m2(hW)} útil`, x0 + w));
  // níveis
  const lvl = (y: number, label: string, x: number) => ln(x, y, x + 9, y, W.thin) + pgon([[x + 4.5, y], [x + 3, y - 2], [x + 6, y - 2]], W.thin, { fill: INK }) + tx(x + 10, y + 0.9, label, { anchor: 'start' });
  out.push(lvl(ySup + 4, `fundo +${m2(t.bottomZ)}`, x0 + w + 40));
  out.push(lvl(Y(hW), `NA +${m2(t.bottomZ + hW)}`, x0 + w + 40));
  out.push(lvl(yTop, `topo +${m2(t.bottomZ + H)}`, x0 + w + 40));

  const width = x0 + w + 110;
  const height = ySup + 44;
  const notes = [
    `Reservatório de ${liters} L (reserva de ${report.tank.dailyLiters} L/dia para ${report.tank.occupants} moradores, ${catalog.constants.plumbing.water.reservoir.reserveDays} dia(s)); peso cheio ${fmt(report.tank.fullKg, 0)} kg a levar à estrutura de apoio.`,
    `Cota do fundo +${m2(t.bottomZ)} m (absoluta, referida ao piso do térreo). Nível máximo ${m2(hW)} m acima do fundo; dimensões internas indicativas (${m2(side)} × ${m2(side)} m), prevalecem as do fabricante.`,
    `Instalação conforme ${normRef(catalog, 'nbr5626')}: extravasor com diâmetro igual ou maior que o da alimentação, tampa, limpeza e registro na saída.`,
    tower ? `Caixa apoiada em torre própria (${t.towerId}).` : 'Caixa apoiada na estrutura da edificação.',
    project.installations.plumbing.manual ? 'Traçado hidráulico definido pelo usuário.' : 'Traçado hidráulico gerado pelo programa.',
  ];
  const legend = [
    legendItem(ln(0.5, 2.5, 9.5, 2.5, W.main, { stroke: COLORS.cold }), 'Tubulação de água fria'),
    legendItem(ln(0.5, 2.5, 9.5, 2.5, W.main, { stroke: COLORS.cold, 'stroke-dasharray': '4 1.2' }), 'Extravasor e limpeza (descarga)'),
    legendItem(bowtie(5, 2.5, 0, INK), 'Registro'),
  ];
  return rendered(g(out.join(''), { 'data-role': 'tank-detail' }), width, height, "DETALHE — CAIXA D'ÁGUA", { scale: sc, notes, legend });
};

// ---------------------------------------------------------------------------
// Fossa e disposição final
// ---------------------------------------------------------------------------

/** Distâncias mínimas (m) da NBR 7229 (legado): edificação, limite do terreno, sumidouro/vala, ramal de água. */
const SEPTIC_MIN = 1.5;
const WELL_MIN = 15;

export const renderSeptic: ContentRenderer = (ctx, _content, scale) => {
  const report = ctx.results.installations?.plumbing;
  const sep = report?.septic;
  if (!report || !sep) return null;
  const { catalog, project } = ctx;
  const sc = scale && scale <= 25 ? scale : 25;
  const k = 1000 / sc;
  const V = sep.tankLiters / 1000;
  const depth = 1.2;
  const wTank = Math.max(0.8, Math.sqrt(V / (2 * depth)));
  const lTank = V / (depth * wTank);
  const out: string[] = [];

  // planta: canto da edificação, fossa e sumidouro
  const x0 = 24;
  const y0 = 22;
  const bw = 40; // canto da edificação (mm)
  out.push(tx(x0, y0 - 9, 'PLANTA ESQUEMÁTICA', { anchor: 'start', bold: true }));
  out.push(pgon([[x0, y0], [x0 + bw + 20, y0], [x0 + bw + 20, y0 + 16], [x0 + bw, y0 + 16], [x0 + bw, y0 + 16 + 30], [x0, y0 + 16 + 30]], W.main, { fill: '#f5f5f4' }), tx(x0 + 22, y0 + 12, 'EDIFICAÇÃO', { bold: true, fill: GREY }));
  const tankX = x0 + bw + SEPTIC_MIN * k;
  const tankY = y0 + 30;
  const tw = lTank * k;
  const th = wTank * k;
  out.push(rc(tankX, tankY, tw, th, W.main, { fill: '#fff', 'data-role': 'septic-tank' }), ln(tankX + tw * 0.62, tankY, tankX + tw * 0.62, tankY + th, W.sec), tx(tankX + tw * 0.3, tankY + th / 2 + 0.9, 'câmara', { size: 2.2 }), tx(tankX + tw * 0.81, tankY + th / 2 + 0.9, 'decantação', { size: 2.2 }));
  out.push(tx(tankX + tw / 2, tankY + th + 4, `Tanque séptico ${sep.tankLiters} L`, { bold: true }), tx(tankX + tw / 2, tankY + th + 7.8, `${m2(lTank)} × ${m2(wTank)} m · prof. útil ${m2(depth)} m`));
  // ramal da edificação
  out.push(ln(x0 + bw, tankY + th / 2, tankX, tankY + th / 2, W.main, { stroke: COLORS.sewer }), arrow(tankX, tankY + th / 2, 1, 0, 2.2, COLORS.sewer));
  // sumidouro
  const dSum = 1.5;
  const sx = tankX + tw + SEPTIC_MIN * k + dSum * k / 2;
  const sy = tankY + th / 2;
  out.push(ln(tankX + tw, tankY + th / 2, sx - dSum * k / 2, sy, W.main, { stroke: COLORS.sewer }), ci(sx, sy, dSum * k / 2, W.main, { 'data-role': 'sump' }), tx(sx, sy - 0.4, 'Sumidouro / valas', { size: 2.2 }), tx(sx, sy + 3, 'esquemático', { size: 2.2, fill: GREY }));
  out.push(tx(sx, sy + dSum * k / 2 + 4, 'a dimensionar pelo teste de percolação', { size: 2.2, fill: GREY }));
  // distâncias mínimas
  const dy = tankY + th + 14;
  out.push(dimH(x0 + bw, tankX, dy, `≥ ${m2(SEPTIC_MIN)}`, tankY + th));
  out.push(dimH(tankX + tw, sx - dSum * k / 2, dy, `≥ ${m2(SEPTIC_MIN)}`, tankY + th));
  out.push(dimH(tankX, tankX + tw, dy + 9, m2(lTank), tankY + th + 11));

  // corte esquemático
  const cy = dy + 30;
  out.push(tx(x0, cy - 4, 'CORTE ESQUEMÁTICO', { anchor: 'start', bold: true }));
  const gy = cy + 6;
  const cw = Math.max(tw, 54);
  const cx0 = tankX - 6 > x0 + 30 ? tankX : x0 + 30;
  out.push(ln(x0, gy, cx0 + cw + 70, gy, W.main), tx(x0 + 1, gy - 1.4, 'terreno', { anchor: 'start', size: 2.2, fill: GREY }));
  const dh = depth * k;
  out.push(rc(cx0, gy + 1, cw, dh + 6, W.main, { fill: '#fff' }), rc(cx0 - 1, gy - 1.6, cw + 2, 2.4, W.sec, { fill: '#e7e5e4' }));
  out.push(ln(cx0 + 0.3, gy + 6, cx0 + cw - 0.3, gy + 6, W.thin, { stroke: COLORS.cold, 'stroke-dasharray': '2 1' }), tx(cx0 + cw / 2, gy + 4.6, 'nível do líquido', { size: 2.2, fill: COLORS.cold }));
  out.push(ln(cx0 + 0.3, gy + dh - 4, cx0 + cw - 0.3, gy + dh - 4, W.thin, { stroke: GREY, 'stroke-dasharray': '1 1' }), tx(cx0 + cw / 2, gy + dh - 0.4, 'zona de lodo', { size: 2.2, fill: GREY }));
  out.push(ln(cx0 - 12, gy + 4, cx0 + 6, gy + 4, W.main, { stroke: COLORS.sewer }), ln(cx0 + 6, gy + 4, cx0 + 6, gy + 12, W.main, { stroke: COLORS.sewer }), tx(cx0 - 13, gy + 2.6, 'entrada (T)', { anchor: 'end' }));
  out.push(ln(cx0 + cw - 6, gy + 12, cx0 + cw - 6, gy + 4, W.main, { stroke: COLORS.sewer }), ln(cx0 + cw - 6, gy + 4, cx0 + cw + 12, gy + 4, W.main, { stroke: COLORS.sewer }), tx(cx0 + cw + 13, gy + 2.6, 'saída (T) → disposição final', { anchor: 'start' }));
  out.push(dimV(gy + 1, gy + 7 + dh - 1, cx0 - 6, m2(depth + 0.1), cx0));
  // sumidouro em corte
  const sx0 = cx0 + cw + 40;
  out.push(rc(sx0, gy + 8, 20, 30, W.main, { 'stroke-dasharray': '3 1', fill: '#fff' }), tx(sx0 + 10, gy + 25, 'sumidouro', { size: 2.2 }));

  const width = Math.max(sx + dSum * k / 2 + 16, sx0 + 60, x0 + bw + 100);
  const height = gy + dh + 30;
  const wellNote = project.legal.wellPosition || project.legal.waterSource === 'well' ? ` Poço no terreno: afastamento mínimo ${WELL_MIN} m da fossa (conferir pela NBR 17076:2024).` : '';
  const notes = [
    `Fossa séptica dimensionada para ${report.tank.occupants} moradores (${sep.contributionLpd} L/dia): V = ${sep.tankLiters} L (fórmula da NBR 7229:1993, legado, só para comparação; não é o critério da ${normRef(catalog, 'nbr17076')}).`,
    `Distâncias mínimas da NBR 7229 (legado): ${m2(SEPTIC_MIN)} m de edificações, limites do terreno, sumidouros, valas e ramal de água.${wellNote} Conferir pela NBR 17076:2024.`,
    `Norma vigente: ${normRef(catalog, 'nbr17076')} (substitui a NBR 7229 e a NBR 13969): fórmulas, afastamentos e uso alternado das unidades de disposição final ainda a conferir.`,
    `Disposição final (sumidouro, valas de infiltração ou filtração) a dimensionar por teste de percolação${project.legal.percolationMinPerCm !== undefined ? ` (informado: ${fmt(project.legal.percolationMinPerCm, 1)} min/cm)` : ' (não informado)'} e nível do lençol freático.`,
    'Dimensões internas do tanque indicativas; locação no lote em planta de implantação.',
  ];
  const legend = [
    legendItem(rc(1.5, 0.8, 7, 3.4, W.main), 'Tanque séptico'),
    legendItem(ci(5, 2.5, 2, W.main), 'Sumidouro / vala (esquemático)'),
    legendItem(ln(0.5, 2.5, 9.5, 2.5, W.main, { stroke: COLORS.sewer }), 'Tubulação de esgoto'),
  ];
  return rendered(g(out.join(''), { 'data-role': 'septic' }), width, height, 'FOSSA SÉPTICA E DISPOSIÇÃO FINAL', { scale: sc, notes, legend });
};

void TXT;
void dist2;
void INK;
void pline;
void (null as unknown as Vec2);
