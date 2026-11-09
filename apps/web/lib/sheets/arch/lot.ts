/** Planta de situação e de implantação (conteúdos `situation` e `implantation`), em mm de papel. */
import type { Vec2 } from '@chalecad/engine';
import { fmt } from '../../project/format';
import { bounds, naturalZ, polyArea } from '../../plan2d/geom';
import { crossPattern, fmtLevel, hatchPattern, pDimH, pDimV, paperNorth, arrow } from '../../plan2d/paper';
import { GUIDE, INK, MUTED, group, line, n2, poly, rect, tag, text } from '../../plan2d/svg';
import type { ContentRenderer, SheetContext } from '../types';
import { LEGEND, ST, axisBox, lotPolygon, mmPerM, northRotation, safeId, toLot } from './common';

/** Primeiro cruzamento de um raio com o contorno: distância ao longo de `dir`, ou null. */
export function rayHit(polygon: Vec2[], o: Vec2, dir: Vec2): number | null {
  let best: number | null = null;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const c = polygon[(i + 1) % polygon.length]!;
    const ex = c[0] - a[0];
    const ey = c[1] - a[1];
    const den = dir[0] * ey - dir[1] * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((a[0] - o[0]) * ey - (a[1] - o[1]) * ex) / den;
    const s = ((a[0] - o[0]) * dir[1] - (a[1] - o[1]) * dir[0]) / den;
    if (t > 1e-9 && s >= -1e-9 && s <= 1 + 1e-9 && (best === null || t < best)) best = t;
  }
  return best;
}

export interface Setbacks {
  front: number;
  back: number;
  left: number;
  right: number;
}

/** Caixa (em coordenadas do lote) da face externa das paredes da edificação (de onde se medem os recuos, como no motor). */
export function houseBox(ctx: SheetContext): { x0: number; x1: number; y0: number; y1: number; poly: Vec2[] } {
  const poly2 = ctx.results.model.footprint.map((p) => toLot(ctx, p));
  return { ...bounds(poly2), poly: poly2 };
}

/** Recuos da edificação (face externa das paredes) a cada divisa, medidos perpendicularmente a partir do meio de cada lado. */
export function setbacksOf(ctx: SheetContext): (Setbacks & { box: ReturnType<typeof houseBox> }) | null {
  const lp = lotPolygon(ctx);
  if (!lp) return null;
  const box = houseBox(ctx);
  const mx = (box.x0 + box.x1) / 2;
  const my = (box.y0 + box.y1) / 2;
  const hit = (o: Vec2, d: Vec2) => rayHit(lp, o, d) ?? 0;
  return {
    box,
    front: hit([mx, box.y0], [0, -1]),
    back: hit([mx, box.y1], [0, 1]),
    left: hit([box.x0, my], [-1, 0]),
    right: hit([box.x1, my], [1, 0]),
  };
}

const lotArea = (lp: Vec2[]) => polyArea(lp);

/** Projeção da cobertura (beiral) no lote: águas projetadas em planta. */
function roofProjection(ctx: SheetContext): Vec2[][] {
  return ctx.results.model.roofPlanes.map((r) => r.vertices.map((v): Vec2 => toLot(ctx, [v[0], v[1]])));
}

function lotFrame(ctx: SheetContext, scale: number, margin: { l: number; r: number; t: number; b: number }, extra?: { x0: number; x1: number; y0: number; y1: number }) {
  const lp = lotPolygon(ctx)!;
  const lb = bounds(lp);
  const e = extra ?? lb;
  const x0 = Math.min(lb.x0, e.x0);
  const x1 = Math.max(lb.x1, e.x1);
  const y0 = Math.min(lb.y0, e.y0);
  const y1 = Math.max(lb.y1, e.y1);
  const k = mmPerM(scale);
  const width = margin.l + (x1 - x0) * k + margin.r;
  const height = margin.t + (y1 - y0) * k + margin.b;
  const P = (p: Vec2): [number, number] => [margin.l + (p[0] - x0) * k, margin.t + (y1 - p[1]) * k];
  return { lp, lb, k, width, height, P, x0, x1, y0, y1 };
}

const streetName = (ctx: SheetContext) => (ctx.project.legal.lot?.streetName || ctx.project.legal.address.street || '').trim();

/** Faixa da rua abaixo da divisa da frente. */
function streetBand(ctx: SheetContext, P: (p: Vec2) => [number, number], k: number, x0: number, x1: number, yFront: number, bandM: number): string {
  const [a, b] = P([x0, yFront]);
  const [c] = P([x1, yFront]);
  const h = bandM * k;
  const name = streetName(ctx);
  return group(
    rect(a, b + 0.6, c - a, h, { fill: '#f5f5f4', stroke: INK, 'stroke-width': ST.view }) +
      line(a, b + 0.6 + h / 2, c, b + 0.6 + h / 2, { stroke: GUIDE, 'stroke-width': ST.thin, 'stroke-dasharray': '4 3' }) +
      text((a + c) / 2, b + 0.6 + h / 2 - 1, name ? name.toUpperCase() : 'RUA', { 'font-size': ST.text, 'font-weight': 700, stroke: '#f5f5f4', 'stroke-width': 1.4, 'paint-order': 'stroke' }),
    { 'data-role': 'street' },
  );
}

/** Comprimento de cada divisa em texto, para lotes poligonais. */
function edgeLabels(lp: Vec2[], P: (p: Vec2) => [number, number]): string {
  const out: string[] = [];
  for (let i = 0; i < lp.length; i++) {
    const a = lp[i]!;
    const c = lp[(i + 1) % lp.length]!;
    const [ax, ay] = P(a);
    const [cx, cy] = P(c);
    const mx = (ax + cx) / 2;
    const my = (ay + cy) / 2;
    const ang = (Math.atan2(cy - ay, cx - ax) * 180) / Math.PI;
    const rot = ang > 90 || ang < -90 ? ang + 180 : ang;
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    out.push(text(mx, my - 1.2, fmt(len, 2), { 'font-size': ST.text, transform: `rotate(${n2(rot)} ${n2(mx)} ${n2(my - 1.2)})` }));
  }
  return group(out.join(''), { 'data-role': 'lot-edges' });
}

const isRectLot = (ctx: SheetContext) => !ctx.project.legal.lot?.polygon;

export const situationRenderer: ContentRenderer = (ctx, content, scale) => {
  const lot = ctx.project.legal.lot;
  const lp = lotPolygon(ctx);
  if (!lot || !lp) return null;
  const pid = safeId('situation');
  const lb = bounds(lp);
  const side = (lb.x1 - lb.x0) * 0.5;
  const street = 8;
  const f = lotFrame(ctx, scale, { l: 14, r: 12, t: 24, b: 12 }, { x0: lb.x0 - side, x1: lb.x1 + side, y0: lb.y0 - street, y1: lb.y1 });
  const { P, k } = f;
  const L: string[] = [];
  const hatchId = `${pid}-hatch`;

  // Rua e lotes vizinhos (tracejados).
  L.push(streetBand(ctx, P, k, f.x0, f.x1, lb.y0, street));
  for (const [xa, xb] of [[lb.x0 - side, lb.x0], [lb.x1, lb.x1 + side]] as const) {
    const [ax, ay] = P([xa, lb.y1]);
    const [bx, by] = P([xb, lb.y0]);
    L.push(rect(ax, ay, bx - ax, by - ay, { fill: 'none', stroke: INK, 'stroke-width': ST.view, 'stroke-dasharray': '2.4 1.2', 'data-role': 'neighbor' }));
    {
      const [tx, ty] = [(ax + bx) / 2, ay + (by - ay) * 0.72];
      L.push(text(tx, ty, 'LOTE VIZINHO', { 'font-size': 2, fill: MUTED, transform: `rotate(-90 ${n2(tx)} ${n2(ty)})` }));
    }
  }
  L.push(poly(lp.map(P), { fill: '#fff', stroke: INK, 'stroke-width': ST.cut, 'data-role': 'lot' }));
  const fp = ctx.results.model.footprint.map((p) => toLot(ctx, p));
  L.push(poly(fp.map(P), { fill: `url(#${hatchId})`, stroke: INK, 'stroke-width': ST.view, 'data-role': 'house' }));
  const hb = bounds(fp);
  const [hx, hy] = P([(hb.x0 + hb.x1) / 2, hb.y1]);
  L.push(text(hx, hy - 1.8, 'EDIFICAÇÃO', { 'font-size': ST.text, 'font-weight': 700 }));

  // Dimensões do lote.
  if (isRectLot(ctx)) {
    const [x0, yt] = P([lb.x0, lb.y1]);
    const [x1] = P([lb.x1, lb.y1]);
    const [, yb] = P([lb.x0, lb.y0]);
    L.push(group(pDimH(ST, x0, x1, yt - 6, fmt(lb.x1 - lb.x0, 2), yt) + pDimV(ST, yb, yt, x0 - 6, fmt(lb.y1 - lb.y0, 2), x0), { 'data-role': 'dim-lot' }));
  } else L.push(edgeLabels(lp, P));

  L.push(paperNorth(ST, f.width - 9, 11, northRotation(ctx, lot.rotationDeg)));
  return {
    body: L.join(''),
    defs: hatchPattern(hatchId, ST),
    width: f.width,
    height: f.height,
    scale,
    title: content.title,
    legend: [LEGEND.cutWall()],
    notes: ['Lotes vizinhos e rua apenas ilustrativos, fora de escala de levantamento.'],
  };
};

export const implantationRenderer: ContentRenderer = (ctx, content, scale) => {
  const lot = ctx.project.legal.lot;
  const sb = setbacksOf(ctx);
  const lp = lotPolygon(ctx);
  if (!lot || !lp || !sb) return null;
  const pid = safeId('implantation');
  const roofs = roofProjection(ctx);
  const f = lotFrame(ctx, scale, { l: 26, r: 24, t: 24, b: 14 }, undefined);
  const k = f.k;
  const street = Math.max(5, 14 / k);
  // Recalcula o quadro incluindo a faixa da rua.
  const fr = lotFrame(ctx, scale, { l: 26, r: 24, t: 24, b: 14 }, { x0: f.lb.x0, x1: f.lb.x1, y0: f.lb.y0 - street, y1: f.lb.y1 });
  const { P } = fr;
  const lb = f.lb;
  const hatchId = `${pid}-hatch`;
  const grassId = `${pid}-grass`;
  const L: string[] = [];

  L.push(streetBand(ctx, P, k, lb.x0 - 1, lb.x1 + 1, lb.y0, street));
  // Lote: área permeável hachurada; projeções brancas por cima.
  L.push(poly(lp.map(P), { fill: `url(#${grassId})`, stroke: INK, 'stroke-width': ST.cut, 'data-role': 'lot' }));
  for (const r of roofs) L.push(poly(r.map(P), { fill: '#fff', stroke: 'none' }));
  for (const r of roofs) L.push(poly(r.map(P), { fill: 'none', stroke: INK, 'stroke-width': ST.view, 'stroke-dasharray': '2.4 1.2', 'data-role': 'eave' }));
  const fp = ctx.results.model.footprint.map((p) => toLot(ctx, p));
  L.push(poly(fp.map(P), { fill: `url(#${hatchId})`, stroke: INK, 'stroke-width': ST.cut, 'data-role': 'house' }));

  // Recuos cotados até cada divisa (a partir do meio de cada lado da edificação).
  const { box } = sb;
  const mx = (box.x0 + box.x1) / 2;
  const my = (box.y0 + box.y1) / 2;
  const dims: string[] = [];
  const hd = (xa: number, xb: number, y: number, v: number) => {
    const [a, yy] = P([xa, y]);
    const [c] = P([xb, y]);
    dims.push(pDimH(ST, Math.min(a, c), Math.max(a, c), yy, fmt(v, 2)));
  };
  const vd = (x: number, ya: number, yb: number, v: number) => {
    const [xx, a] = P([x, ya]);
    const [, c] = P([x, yb]);
    dims.push(pDimV(ST, Math.min(a, c), Math.max(a, c), xx, fmt(v, 2)));
  };
  const qx = box.x0 + (box.x1 - box.x0) * 0.2;
  const fq = rayHit(lp, [qx, box.y0], [0, -1]) ?? sb.front;
  const bq = rayHit(lp, [qx, box.y1], [0, 1]) ?? sb.back;
  vd(qx, box.y0 - fq, box.y0, fq);
  vd(qx, box.y1, box.y1 + bq, bq);
  hd(box.x0 - sb.left, box.x0, my, sb.left);
  hd(box.x1, box.x1 + sb.right, my, sb.right);
  L.push(group(dims.join(''), { 'data-role': 'setbacks' }));

  // Cotas do lote.
  if (isRectLot(ctx)) {
    const [x0, yt] = P([lb.x0, lb.y1]);
    const [x1] = P([lb.x1, lb.y1]);
    const [, yb] = P([lb.x0, lb.y0]);
    L.push(group(pDimH(ST, x0, x1, yt - 7, fmt(lb.x1 - lb.x0, 2), yt) + pDimV(ST, yb, yt, x0 - 7, fmt(lb.y1 - lb.y0, 2), x0), { 'data-role': 'dim-lot' }));
  } else L.push(edgeLabels(lp, P));

  // Níveis em terreno inclinado: terreno natural nos cantos e cota do platô.
  const site = ctx.project.site;
  if (site.type === 'sloped') {
    const model = ctx.results.model;
    const bb = bounds(model.footprint);
    const nat = naturalZ(site, (bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2);
    const pz = ctx.results.terrain?.platformZ ?? 0;
    for (const c of axisBox(ctx)) {
      const [cx, cy] = P(toLot(ctx, c));
      const z = nat(c[0], c[1]) - pz;
      const out = [c[0] < (bb.x0 + bb.x1) / 2 ? -1 : 1, c[1] < (bb.y0 + bb.y1) / 2 ? 1 : -1] as const;
      L.push(group(tag('circle', { cx, cy, r: 0.7, fill: INK }) + text(cx + out[0] * 3, cy + out[1] * 3.4, `NT ${fmtLevel(z)}`, { 'font-size': 2, 'text-anchor': out[0] < 0 ? 'end' : 'start', stroke: '#fff', 'stroke-width': 1, 'paint-order': 'stroke' }), { 'data-role': 'natural-level' }));
    }
    // Áreas aplainadas e muros de arrimo (motor): contorno tracejado com a cota e traço grosso nos muros.
    const terr = ctx.results.terrain;
    for (const pad of terr?.pads ?? []) {
      if (pad.id === 'house') continue;
      const pts = pad.polygon.map((v) => P(toLot(ctx, v)));
      const name = site.pads.find((q) => q.id === pad.id)?.name || 'ÁREA';
      L.push(poly(pts, { fill: 'none', stroke: INK, 'stroke-width': ST.view, 'stroke-dasharray': '3 1.2', 'data-role': 'terrain-pad' }));
      const cx = pts.reduce((s2, q) => s2 + q[0], 0) / pts.length;
      const cy = pts.reduce((s2, q) => s2 + q[1], 0) / pts.length;
      L.push(text(cx, cy, `${name.toUpperCase()} ${fmtLevel(pad.z - pz)}`, { 'font-size': ST.text, 'font-weight': 700, 'text-anchor': 'middle', stroke: '#fff', 'stroke-width': 1.2, 'paint-order': 'stroke', 'data-role': 'terrain-pad-level' }));
    }
    for (const w of terr?.walls ?? []) {
      const pts = w.path.map((v) => P(toLot(ctx, v)));
      L.push(tag('polyline', { points: pts.map(([x, y]) => `${n2(x)},${n2(y)}`).join(' '), fill: 'none', stroke: INK, 'stroke-width': ST.cut * 2.2, 'stroke-linejoin': 'round', 'data-role': 'terrain-wall', 'data-wall': w.id }));
      const m = pts[Math.floor(pts.length / 2)]!;
      L.push(text(m[0], m[1] - 1.6, `ARRIMO h = ${fmt(w.maxHeight, 2)}`, { 'font-size': ST.text * 0.85, 'font-weight': 700, 'text-anchor': 'middle', stroke: '#fff', 'stroke-width': 1, 'paint-order': 'stroke', 'data-role': 'terrain-wall-label' }));
    }
    const [hx, hy] = P([mx, my]);
    L.push(text(hx, hy, 'PLATÔ ±0,00', { 'font-size': ST.text, 'font-weight': 700, stroke: '#fff', 'stroke-width': 1.2, 'paint-order': 'stroke', 'data-role': 'platform-level' }));
  } else {
    const [hx, hy] = P([mx, my]);
    L.push(text(hx, hy, 'PISO ±0,00', { 'font-size': ST.text, 'font-weight': 700, stroke: '#fff', 'stroke-width': 1.2, 'paint-order': 'stroke' }));
  }

  // Fossa/sumidouro e poço.
  const legal = ctx.project.legal;
  const mark = (pos: Vec2, r: number, label: string) => {
    const [cx, cy] = P(pos);
    const rr = Math.max(1.6, r * k);
    return group(tag('circle', { cx, cy, r: rr, fill: '#fff', stroke: INK, 'stroke-width': ST.view }) + line(cx - rr, cy, cx + rr, cy, { 'stroke-width': ST.thin }) + line(cx, cy - rr, cx, cy + rr, { 'stroke-width': ST.thin }) + text(cx, cy + rr + 3, label, { 'font-size': 2.2, 'font-weight': 700, stroke: '#fff', 'stroke-width': 1, 'paint-order': 'stroke' }), { 'data-role': label.toLowerCase() });
  };
  if (legal.septicPosition) L.push(mark(legal.septicPosition, 1, 'FOSSA/SUMIDOURO'));
  if (legal.wellPosition) L.push(mark(legal.wellPosition, 0.5, 'POÇO'));
  if (legal.septicPosition && legal.wellPosition) {
    const [a, c] = [P(legal.septicPosition), P(legal.wellPosition)];
    const d = Math.hypot(legal.septicPosition[0] - legal.wellPosition[0], legal.septicPosition[1] - legal.wellPosition[1]);
    const mxp = (a[0] + c[0]) / 2;
    const myp = (a[1] + c[1]) / 2;
    L.push(group(line(a[0], a[1], c[0], c[1], { 'stroke-width': ST.dim, 'stroke-dasharray': '3 1' }) + text(mxp, myp - 1.2, `${fmt(d, 2)} m`, { 'font-size': ST.text, 'font-weight': 700, stroke: '#fff', 'stroke-width': 1, 'paint-order': 'stroke' }), { 'data-role': 'well-septic-distance', 'data-distance': n2(d) }));
  }

  // Acesso: da divisa da frente até a porta de entrada.
  const model = ctx.results.model;
  const door = model.openings.find((o) => o.type === 'door' && o.hostKind === 'wall');
  const doorWall = door ? model.walls.find((w) => w.id === door.hostId) : undefined;
  if (door && doorWall) {
    const um = (door.u0 + door.u1) / 2;
    const len = doorWall.length || 1;
    const pt = toLot(ctx, [doorWall.from[0] + ((doorWall.to[0] - doorWall.from[0]) / len) * um, doorWall.from[1] + ((doorWall.to[1] - doorWall.from[1]) / len) * um]);
    const hit = rayHit(lp, pt, [0, -1]);
    if (hit !== null) {
      const [a, c] = [P([pt[0], pt[1] - hit]), P(pt)];
      L.push(group(arrow(ST, a[0], a[1], c[0], c[1] + 0.5, ST.view) + text(a[0] + 2.2, (a[1] + c[1]) / 2, 'ACESSO', { 'font-size': 2.2, 'font-weight': 700, 'text-anchor': 'start', stroke: '#fff', 'stroke-width': 1, 'paint-order': 'stroke' }), { 'data-role': 'access' }));
    }
  }

  // Quadro rápido de áreas e permeabilidade.
  const urban = ctx.results.approval?.urban;
  const area = lotArea(lp);
  const proj = roofs.reduce((s, r) => s + polyArea(r), 0);
  const permeable = urban?.permeableArea ?? Math.max(0, area - proj - (lot.pavedArea ?? 0));
  const [px, py] = P([(lb.x0 + lb.x1) / 2, lb.y1]);
  L.push(text(px, py + 7, `ÁREA PERMEÁVEL ${fmt(permeable, 2)} m² (${fmt(area > 0 ? (permeable / area) * 100 : 0, 1)}%)`, { 'font-size': 2.2, 'font-weight': 700, stroke: '#fff', 'stroke-width': 1.4, 'paint-order': 'stroke', 'data-role': 'permeable-label' }));

  L.push(paperNorth(ST, fr.width - 10, 11, northRotation(ctx, lot.rotationDeg)));

  return {
    body: L.join(''),
    defs: hatchPattern(hatchId, ST) + crossPattern(grassId, ST),
    width: fr.width,
    height: fr.height,
    scale,
    title: content.title,
    legend: [LEGEND.cutWall(), LEGEND.dashed('Projeção do beiral'), { symbol: rect(0, 0, 8, 4, { fill: `url(#${grassId})`, stroke: INK, 'stroke-width': 0.2 }), label: 'Área permeável' }],
    notes: [
      `Terreno ${fmt(area, 2)} m²; projeção da cobertura ${fmt(proj, 2)} m².`,
      // com o motor, a nota dos recuos vem do quadro urbanístico (evita repetir na coluna de notas)
      ...(ctx.results.approval?.urban ? ['Cotas em metros.'] : ['Recuos medidos da face externa das paredes à divisa, perpendicularmente, sem beiral. Cotas em metros.']),
      ...(site.type === 'sloped' ? ['NT = cota do terreno natural nos cantos da edificação, em relação ao platô (±0,00).'] : []),
    ],
  };
};

