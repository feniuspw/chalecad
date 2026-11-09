/** Planta baixa por nível em mm de papel (conteúdo `plan`). */
import type { HostWall, ResolvedOpening, ResolvedStair, Vec2 } from '@chalecad/engine';
import { fmt } from '../../project/format';
import { specOf } from '../../project/furniture';
import { deriveLevels } from '../../plan2d/plan';
import { furnitureSymbol, placeStrokes } from '../../plan2d/furnitureSymbols';
import { bounds, centroid, wallFrame, wallRect } from '../../plan2d/geom';
import { arrow, fmtLevel, hatchPattern, pDimH, pDimV, paperNorth } from '../../plan2d/paper';
import { defaultSectionAt } from '../../plan2d/section';
import { roomLabelPoint } from '../../plan2d/rooms';
import { INK, MUTED, group, line, n2, poly, tag, text } from '../../plan2d/svg';
import type { ContentRenderer } from '../types';
import { LEGEND, ST, mmPerM, northRotation, safeId } from './common';

const CUT_HEIGHT = 1.2;
const maxV = (w: HostWall) => w.outline.reduce((m, p) => Math.max(m, p[1]), 0);
/** Louças que entram nas pranchas legais (mobiliário em traço fino é opcional). */
const FIXTURES = new Set(['toilet', 'basin', 'shower', 'bathtub', 'counter_sink']);

export const planRenderer: ContentRenderer = (ctx, content, scale) => {
  const model = ctx.results.model;
  const project = ctx.project;
  const k = mmPerM(scale);
  const levels = deriveLevels(model, project);
  const level = levels.find((l) => l.id === content.target) ?? levels[0];
  if (!level) return null;
  const isGround = level.elevation <= levels[0]!.elevation + 1e-6;
  const pid = safeId('plan', level.id);

  const own = model.walls.filter((w) => w.level === level.id);
  const through = model.walls.filter((w) => w.level !== level.id && w.kind !== 'interior' && w.baseZ <= level.elevation + 1e-6 && w.baseZ + maxV(w) > level.elevation + CUT_HEIGHT);
  const cut = [...own, ...through];
  const slabs = model.slabs.filter((s) => s.level === level.id && s.kind !== 'radier');
  const wallPolys = cut.map(wallRect);
  const pts: Vec2[] = [...wallPolys.flat(), ...slabs.flatMap((s) => s.polygon)];
  if (pts.length === 0) pts.push(...model.footprint);
  if (pts.length === 0) return null;
  const b = bounds(pts);

  // Margens para cotas (duas linhas), norte e símbolos de corte.
  const ML = 24;
  const MB = 24;
  const MT = 20;
  const MR = 16;
  const W = (b.x1 - b.x0) * k;
  const H = (b.y1 - b.y0) * k;
  const width = ML + W + MR;
  const height = MT + H + MB;
  const P = (p: Vec2): [number, number] => [ML + (p[0] - b.x0) * k, MT + (b.y1 - p[1]) * k];

  const hatchId = `${pid}-hatch`;
  const defs = hatchPattern(hatchId, ST);
  const L: string[] = [];

  // Mezanino acima (tracejado no térreo) ou borda da laje no pavimento.
  if (isGround) {
    for (const s of model.slabs.filter((x) => x.kind === 'mezzanine' && x.topZ > level.elevation)) {
      const c = P(centroid(s.polygon));
      L.push(
        poly(s.polygon.map(P), { fill: 'none', stroke: INK, 'stroke-width': ST.view, 'stroke-dasharray': '2.4 1.2', 'data-role': 'mezzanine-above' }),
        text(c[0], c[1] - 8, 'MEZANINO ACIMA', { 'font-size': 2, fill: MUTED }),
      );
    }
  } else {
    for (const s of slabs) L.push(poly(s.polygon.map(P), { fill: 'none', stroke: INK, 'stroke-width': ST.view, 'data-role': 'slab-edge' }));
  }

  // Cômodos: nome, área e nível do piso.
  const rooms = (model.rooms ?? []).filter((r) => r.level === level.id && r.polygon && r.polygon.length >= 3);
  for (const r of rooms) {
    const { point } = roomLabelPoint(r.polygon!);
    const [cx, cy] = P(point);
    const halo = { 'paint-order': 'stroke', stroke: '#fff', 'stroke-width': 1.2 } as const;
    L.push(
      group(
        text(cx, cy - 1, r.name, { 'font-size': ST.text, 'font-weight': 700, ...halo }) +
          text(cx, cy + 2.2, `${fmt(r.area, 2)} m²`, { 'font-size': ST.text, ...halo }) +
          text(cx, cy + 5.4, fmtLevel(level.elevation), { 'font-size': 2, fill: MUTED, ...halo }),
        { 'data-role': 'room', 'data-id': r.id },
      ),
    );
  }
  if (rooms.length === 0) {
    const c = P([(b.x0 + b.x1) / 2, b.y0 + (b.y1 - b.y0) * 0.22]);
    L.push(text(c[0], c[1], `PISO ${fmtLevel(level.elevation)}`, { 'font-size': ST.text, fill: MUTED, 'data-role': 'floor-level' }));
  }

  // Escadas.
  for (const st of model.stairs) L.push(stairSvg(st, isGround, P, k));

  // Louças do nível.
  const catalog = ctx.catalog;
  const fixtures = (project.furniture ?? []).filter((f) => f.level === level.id);
  const fx: string[] = [];
  for (const f of fixtures) {
    const spec = specOf(catalog, f.item);
    if (!spec || !FIXTURES.has(spec.model)) continue;
    for (const s of placeStrokes(furnitureSymbol(spec.model, spec.size), f.position as [number, number], f.rotation)) {
      const d = s.pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${n2(P(p)[0])} ${n2(P(p)[1])}`).join(' ') + (s.closed ? ' Z' : '');
      fx.push(tag('path', { d, fill: 'none', stroke: INK, 'stroke-width': s.light ? ST.thin : ST.view, 'stroke-linejoin': 'round' }));
    }
  }
  if (fx.length) L.push(group(fx.join(''), { 'data-role': 'fixtures' }));

  // Paredes: união em tinta por baixo, hachura por cima.
  const px = wallPolys.map((p) => p.map(P));
  L.push(
    group(px.map((p) => poly(p, { fill: INK, stroke: INK, 'stroke-width': ST.cut, 'stroke-linejoin': 'miter' })).join(''), { 'data-role': 'wall-outline' }),
    group(px.map((p) => poly(p, { fill: `url(#${hatchId})`, stroke: 'none' })).join(''), { 'data-role': 'wall-hatch' }),
  );

  // Esquadrias.
  const byId = new Map(cut.map((w) => [w.id, w]));
  const openings = model.openings.filter((o) => o.hostKind === 'wall' && o.valid && byId.get(o.hostId)?.level === level.id);
  for (const o of openings) L.push(openingSvg(o, byId.get(o.hostId)!, P, k));

  // Cotas internas livres dos cômodos retangulares.
  for (const r of rooms) {
    if (r.polygon!.length !== 4) continue;
    const rb = bounds(r.polygon!);
    const thick = (axis: 0 | 1, pos: number) => {
      const e = r.edges.find((x) => Math.abs(x.from[axis] - pos) < 1e-3 && Math.abs(x.to[axis] - pos) < 1e-3 && x.hostId);
      return e ? (byId.get(e.hostId!)?.thickness ?? model.walls.find((w) => w.id === e.hostId)?.thickness ?? 0) : 0;
    };
    const cw = rb.x1 - rb.x0 - (thick(0, rb.x0) + thick(0, rb.x1)) / 2;
    const ch = rb.y1 - rb.y0 - (thick(1, rb.y0) + thick(1, rb.y1)) / 2;
    const [x0, y0] = P([rb.x0, rb.y0]);
    const [x1] = P([rb.x1, rb.y0]);
    const [, y1] = P([rb.x0, rb.y1]);
    if (cw * k > 14) L.push(group(pDimH(ST, x0 + (thick(0, rb.x0) / 2) * k, x1 - (thick(0, rb.x1) / 2) * k, y0 - 3 - (thick(1, rb.y0) / 2) * k, fmt(cw, 2)), { 'data-role': 'dim-inner' }));
    if (ch * k > 14) L.push(group(pDimV(ST, y1 + (thick(1, rb.y1) / 2) * k, y0 - (thick(1, rb.y0) / 2) * k, x0 + 3 + (thick(0, rb.x0) / 2) * k, fmt(ch, 2)), { 'data-role': 'dim-inner' }));
  }

  // Cotas externas em duas linhas: parciais (vãos) e total.
  const dims: string[] = [];
  const ext = cut.filter((w) => w.kind !== 'interior');
  const front = ext.filter((w) => Math.abs(w.from[1] - w.to[1]) < 1e-6).sort((a, c) => a.from[1] - c.from[1])[0];
  const left = ext.filter((w) => Math.abs(w.from[0] - w.to[0]) < 1e-6).sort((a, c) => a.from[0] - c.from[0])[0];
  const [fx0, fy0] = P([b.x0, b.y0]);
  const [fx1] = P([b.x1, b.y0]);
  const [, fy1] = P([b.x0, b.y1]);
  let partial = false;
  if (front && Math.abs(front.from[1] - b.y0) < 0.3) {
    const stops = chain(b.x0, b.x1, spans(openings, front, 0));
    if (stops.length > 1) {
      partial = true;
      for (const [a, c] of stops) dims.push(pDimH(ST, P([a, b.y0])[0], P([c, b.y0])[0], fy0 + 8, fmt(c - a, 2), fy0));
    }
  }
  dims.push(pDimH(ST, fx0, fx1, fy0 + (partial ? 14 : 8), fmt(b.x1 - b.x0, 2), partial ? fy0 + 8 : fy0));
  let partialV = false;
  if (left && Math.abs(left.from[0] - b.x0) < 0.3) {
    const stops = chain(b.y0, b.y1, spans(openings, left, 1));
    if (stops.length > 1) {
      partialV = true;
      for (const [a, c] of stops) dims.push(pDimV(ST, P([b.x0, c])[1], P([b.x0, a])[1], fx0 - 8, fmt(c - a, 2), fx0));
    }
  }
  dims.push(pDimV(ST, fy1, fy0, fx0 - (partialV ? 14 : 8), fmt(b.y1 - b.y0, 2), partialV ? fx0 - 8 : fx0));
  L.push(group(dims.join(''), { 'data-role': 'dim-outer' }));

  // Indicação dos cortes A e B, no pavimento térreo.
  if (isGround) {
    const atA = defaultSectionAt(model, 'A');
    const atB = defaultSectionAt(model, 'B');
    L.push(cutMark('A', [b.x0, atA], [b.x1, atA], 'h', P, ST.text));
    L.push(cutMark('B', [atB, b.y0], [atB, b.y1], 'v', P, ST.text));
  }

  L.push(paperNorth(ST, width - 9, 11, northRotation(ctx)));

  const legend = [LEGEND.cutWall(), LEGEND.level()];
  if (isGround) legend.push(LEGEND.cutLine());
  return {
    body: group(L.join(''), { 'data-plan': level.id }),
    defs,
    width,
    height,
    scale,
    title: content.title,
    legend,
    notes: ['Cotas e níveis em metros. Áreas medidas no eixo das paredes.', 'Cotas externas até a face das paredes.'],
  };
};

function spans(openings: ResolvedOpening[], w: HostWall, axis: 0 | 1): [number, number][] {
  const { at } = wallFrame(w);
  return openings
    .filter((o) => o.hostId === w.id)
    .map((o) => {
      const a = at(o.u0, 0)[axis];
      const c = at(o.u1, 0)[axis];
      return (a < c ? [a, c] : [c, a]) as [number, number];
    })
    .sort((a, c) => a[0] - c[0]);
}

function chain(lo: number, hi: number, sp: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  let cur = lo;
  for (const [a, c] of sp) {
    if (a > cur + 0.005) out.push([cur, a]);
    out.push([a, c]);
    cur = c;
  }
  if (hi > cur + 0.005) out.push([cur, hi]);
  return out;
}

/** Linha traço-ponto do corte, com traço grosso e seta nas pontas, e a letra em cada ponta. */
function cutMark(letter: string, a: Vec2, c: Vec2, orient: 'h' | 'v', P: (p: Vec2) => [number, number], T: number): string {
  const [ax, ay] = P(a);
  const [cx, cy] = P(c);
  const ext = 18;
  const out: string[] = [];
  const dash = { 'stroke-width': ST.view, 'stroke-dasharray': '5 1.2 0.6 1.2' };
  if (orient === 'h') {
    const x0 = ax - ext;
    const x1 = cx + ext;
    out.push(line(x0, ay, x1, ay, dash));
    // A olha para +y (para cima na folha).
    for (const [x, sx] of [[x0, 1], [x1, -1]] as const) {
      out.push(line(x, ay, x + sx * 3.5, ay, { 'stroke-width': ST.cut * 2 }), arrow(ST, x + sx * 1.7, ay, x + sx * 1.7, ay - 5.5, ST.view), tag('circle', { cx: x - sx * 3.2, cy: ay, r: 2.6, fill: '#fff', stroke: INK, 'stroke-width': ST.view }), text(x - sx * 3.2, ay + T * 0.35, letter, { 'font-size': T, 'font-weight': 700 }));
    }
  } else {
    const y0 = ay + ext;
    const y1 = cy - ext;
    out.push(line(ax, y0, ax, y1, dash));
    // B olha para −x (para a esquerda).
    for (const [y, sy] of [[y0, -1], [y1, 1]] as const) {
      out.push(line(ax, y, ax, y + sy * 3.5, { 'stroke-width': ST.cut * 2 }), arrow(ST, ax, y + sy * 1.7, ax - 5.5, y + sy * 1.7, ST.view), tag('circle', { cx: ax, cy: y - sy * 3.2, r: 2.6, fill: '#fff', stroke: INK, 'stroke-width': ST.view }), text(ax, y - sy * 3.2 + T * 0.35, letter, { 'font-size': T, 'font-weight': 700 }));
    }
  }
  return group(out.join(''), { 'data-role': 'cut-mark', 'data-cut': letter });
}

function openingSvg(o: ResolvedOpening, w: HostWall, P: (p: Vec2) => [number, number], k: number): string {
  const { at } = wallFrame(w);
  const h = w.thickness / 2;
  const width = o.u1 - o.u0;
  const parts: string[] = [];
  parts.push(poly([at(o.u0, -h - 0.01), at(o.u1, -h - 0.01), at(o.u1, h + 0.01), at(o.u0, h + 0.01)].map(P), { fill: '#fff', stroke: 'none' }));
  for (const u of [o.u0, o.u1]) {
    const [a, c] = [P(at(u, -h)), P(at(u, h))];
    parts.push(line(a[0], a[1], c[0], c[1], { 'stroke-width': ST.cut }));
  }
  const ln = (u0: number, s0: number, u1: number, s1: number, a: Record<string, string | number> = {}) => {
    const [p, q] = [P(at(u0, s0)), P(at(u1, s1))];
    return line(p[0], p[1], q[0], q[1], { 'stroke-width': ST.view, ...a });
  };
  if (o.type === 'window') {
    for (const s of [-h, 0, h]) parts.push(ln(o.u0, s, o.u1, s, { 'stroke-width': s === 0 ? ST.thin : ST.view }));
  } else if (o.type === 'door') {
    const sIn = w.exteriorSide === 'left' ? -1 : 1;
    parts.push(ln(o.u0, 0, o.u0, sIn * width, { 'stroke-width': ST.cut * 0.7 }));
    const e = P(at(o.u0, sIn * width));
    const j = P(at(o.u1, 0));
    const hinge = P(at(o.u0, 0));
    const cross = (e[0] - hinge[0]) * (j[1] - hinge[1]) - (e[1] - hinge[1]) * (j[0] - hinge[0]);
    parts.push(tag('path', { d: `M${n2(e[0])},${n2(e[1])} A${n2(width * k)},${n2(width * k)} 0 0 ${cross > 0 ? 1 : 0} ${n2(j[0])},${n2(j[1])}`, fill: 'none', stroke: INK, 'stroke-width': ST.thin }));
  } else if (o.type === 'sliding_door') {
    parts.push(ln(o.u0, -h / 2, o.u0 + width * 0.55, -h / 2, { 'stroke-width': ST.cut * 0.7 }));
    parts.push(ln(o.u0 + width * 0.45, h / 2, o.u1, h / 2, { 'stroke-width': ST.cut * 0.7 }));
  }
  return group(parts.join(''), { 'data-role': `opening-${o.type}`, 'data-id': o.id });
}

function stairSvg(st: ResolvedStair, ground: boolean, P: (p: Vec2) => [number, number], k: number): string {
  void k;
  const parts: string[] = [];
  for (const t of st.treads) {
    const r = (t.rotationZDeg * Math.PI) / 180;
    const [hx, hy] = [t.size[0] / 2, t.size[1] / 2];
    const pts = ([[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]] as Vec2[]).map(([x, y]): Vec2 => [t.center[0] + x * Math.cos(r) - y * Math.sin(r), t.center[1] + x * Math.sin(r) + y * Math.cos(r)]);
    parts.push(poly(pts.map(P), { fill: '#fff', stroke: INK, 'stroke-width': ST.thin }));
  }
  if (st.footprint.length > 2) parts.push(poly(st.footprint.map(P), { fill: 'none', stroke: INK, 'stroke-width': ST.view }));
  const first = st.treads[0];
  const last = st.treads[st.treads.length - 1];
  if (first && last && st.treads.length > 1) {
    const a = ground ? first.center : last.center;
    const c = ground ? last.center : first.center;
    const [pa, pc] = [P([a[0], a[1]]), P([c[0], c[1]])];
    parts.push(tag('circle', { cx: pa[0], cy: pa[1], r: 0.7, fill: INK }), arrow(ST, pa[0], pa[1], pc[0], pc[1], ST.view));
    parts.push(text((pa[0] + pc[0]) / 2 + 3.2, (pa[1] + pc[1]) / 2, ground ? 'SOBE' : 'DESCE', { 'font-size': 2, 'font-weight': 700, stroke: '#fff', 'stroke-width': 1, 'paint-order': 'stroke' }));
  }
  return group(parts.join(''), { 'data-role': 'stair', 'data-id': st.id, opacity: ground ? 1 : 0.7 });
}

