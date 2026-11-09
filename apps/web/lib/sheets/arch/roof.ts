/** Planta de cobertura em mm de papel (conteúdo `roof`): águas, cumeeira, caimentos, calhas e condutores. */
import type { RoofPlane, Vec2 } from '@chalecad/engine';
import { fmt } from '../../project/format';
import { bounds, centroid } from '../../plan2d/geom';
import { arrow, pDimH, pDimV, paperNorth } from '../../plan2d/paper';
import { INK, MUTED, group, line, n2, poly, tag, text } from '../../plan2d/svg';
import type { ContentRenderer } from '../types';
import { LEGEND, ST, mmPerM, northRotation } from './common';
import { materialsOf } from './elevation';

const EPS = 0.02;

/** Caimento (direção de descida em planta, unitária) e inclinação em % de uma água. */
export function roofFall(r: RoofPlane): { dir: Vec2; pct: number } {
  const v = r.vertices;
  // Plano z = a x + b y + c pelos três primeiros vértices não colineares.
  for (let i = 0; i + 2 < v.length; i++) {
    const [p, q, s] = [v[0]!, v[i + 1]!, v[i + 2]!];
    const [ux, uy, uz] = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
    const [vx, vy, vz] = [s[0] - p[0], s[1] - p[1], s[2] - p[2]];
    const det = ux * vy - uy * vx;
    if (Math.abs(det) < 1e-9) continue;
    const a = (uz * vy - uy * vz) / det;
    const b = (ux * vz - uz * vx) / det;
    const g = Math.hypot(a, b) || 1;
    return { dir: [-a / g, -b / g], pct: Math.tan((r.slopeDeg * Math.PI) / 180) * 100 };
  }
  return { dir: [0, -1], pct: Math.tan((r.slopeDeg * Math.PI) / 180) * 100 };
}

/** Arestas horizontais da água na cota mais alta (cumeeira) ou mais baixa (beiral). */
function horizontalEdges(r: RoofPlane, which: 'max' | 'min'): [Vec2, Vec2][] {
  const zs = r.vertices.map((v) => v[2]);
  const ref = which === 'max' ? Math.max(...zs) : Math.min(...zs);
  const out: [Vec2, Vec2][] = [];
  for (let i = 0; i < r.vertices.length; i++) {
    const a = r.vertices[i]!;
    const b = r.vertices[(i + 1) % r.vertices.length]!;
    if (Math.abs(a[2] - ref) < EPS && Math.abs(b[2] - ref) < EPS) out.push([[a[0], a[1]], [b[0], b[1]]]);
  }
  return out;
}

export const roofRenderer: ContentRenderer = (ctx, content, scale) => {
  const model = ctx.results.model;
  const planes = model.roofPlanes;
  if (planes.length === 0) return null;
  const k = mmPerM(scale);
  const all: Vec2[] = [...planes.flatMap((r) => r.vertices.map((v): Vec2 => [v[0], v[1]])), ...model.footprint];
  const b = bounds(all);
  const ML = 24;
  const MB = 24;
  const MT = 20;
  const MR = 26;
  const width = ML + (b.x1 - b.x0) * k + MR;
  const height = MT + (b.y1 - b.y0) * k + MB;
  const P = (p: Vec2): [number, number] => [ML + (p[0] - b.x0) * k, MT + (b.y1 - p[1]) * k];
  const L: string[] = [];

  // Edificação sob o telhado, tracejada.
  L.push(poly(model.footprint.map(P), { fill: 'none', stroke: INK, 'stroke-width': ST.view, 'stroke-dasharray': '2.4 1.2', 'data-role': 'footprint' }));

  // Águas.
  const ridgeSeen = new Set<string>();
  const ridgeZ = Math.max(...planes.flatMap((r) => r.vertices.map((v) => v[2])));
  for (const r of planes) {
    const poly2 = r.vertices.map((v): Vec2 => [v[0], v[1]]);
    L.push(poly(poly2.map(P), { fill: 'none', stroke: INK, 'stroke-width': ST.cut, 'stroke-linejoin': 'round', 'data-role': 'roof-plane', 'data-id': r.id }));
    const { dir, pct } = roofFall(r);
    const c = centroid(poly2);
    const len = Math.min(14, Math.max(8, (r.uLength * k) / 5));
    const [cx, cy] = P(c);
    // Seta no sentido da descida (em planta, y para cima na folha).
    const ax = cx - (dir[0] * len) / 2;
    const ay = cy + (dir[1] * len) / 2;
    const bx = cx + (dir[0] * len) / 2;
    const by = cy - (dir[1] * len) / 2;
    L.push(
      group(
        arrow(ST, ax, ay, bx, by, ST.view) + text(cx + (-dir[1]) * 4.2 - dir[0] * 0, cy - dir[0] * 4.2 + 0.9, `i = ${fmt(pct, 1)}%`, { 'font-size': ST.text, 'font-weight': 700, stroke: '#fff', 'stroke-width': 1, 'paint-order': 'stroke' }),
        { 'data-role': 'roof-fall', 'data-id': r.id, 'data-pct': n2(pct) },
      ),
    );
    for (const [p, q] of horizontalEdges(r, 'max')) {
      const key = [p, q].map((x) => `${n2(x[0])},${n2(x[1])}`).sort().join('|');
      const zmax = Math.max(...r.vertices.map((v) => v[2]));
      if (ridgeSeen.has(key) || Math.abs(zmax - ridgeZ) > EPS) continue;
      ridgeSeen.add(key);
      const [pa, qa] = [P(p), P(q)];
      L.push(line(pa[0], pa[1], qa[0], qa[1], { 'stroke-width': ST.cut * 1.4, 'data-role': 'ridge' }));
      const rot = Math.abs(qa[1] - pa[1]) > Math.abs(qa[0] - pa[0]) ? -90 : 0;
      const [tx, ty] = [(pa[0] + qa[0]) / 2 + (rot ? -1.4 : 0), (pa[1] + qa[1]) / 2 + (rot ? 0 : -1.4)];
      L.push(text(tx, ty, 'CUMEEIRA', { 'font-size': 2.2, 'font-weight': 700, transform: `rotate(${rot} ${n2(tx)} ${n2(ty)})` }));
    }
  }

  // Calhas e condutores.
  if (ctx.project.roof.gutters) {
    let first = true;
    for (const r of planes.filter((x) => !x.isWall)) {
      const { dir } = roofFall(r);
      for (const [p, q] of horizontalEdges(r, 'min')) {
        // Calha: linha dupla junto ao beiral, para dentro da água.
        const [pa, qa] = [P(p), P(q)];
        const off = 1.3;
        const inward: [number, number] = [-dir[0] * off, dir[1] * off];
        L.push(line(pa[0], pa[1], qa[0], qa[1], { 'stroke-width': ST.view, 'data-role': 'gutter' }), line(pa[0] + inward[0], pa[1] + inward[1], qa[0] + inward[0], qa[1] + inward[1], { 'stroke-width': ST.thin }));
        const end = pa[0] <= qa[0] ? pa : qa;
        L.push(tag('circle', { cx: end[0] + inward[0] * 1.2, cy: end[1] + inward[1] * 1.2, r: 1.1, fill: '#fff', stroke: INK, 'stroke-width': ST.view, 'data-role': 'downspout' }));
        if (first) {
          L.push(text((pa[0] + qa[0]) / 2 + inward[0] * 3.2, (pa[1] + qa[1]) / 2 + inward[1] * 3.2 + 0.8, 'CALHA', { 'font-size': 2, fill: MUTED }));
          first = false;
        }
      }
    }
  }

  // Cotas gerais.
  const [x0, y0] = P([b.x0, b.y0]);
  const [x1] = P([b.x1, b.y0]);
  const [, y1] = P([b.x0, b.y1]);
  L.push(group(pDimH(ST, x0, x1, y0 + 8, fmt(b.x1 - b.x0, 2), y0) + pDimV(ST, y1, y0, x0 - 8, fmt(b.y1 - b.y0, 2), x0), { 'data-role': 'dim-outer' }));
  L.push(paperNorth(ST, width - 12, 12, northRotation(ctx)));

  const mats = materialsOf(ctx);
  return {
    body: L.join(''),
    width,
    height,
    scale,
    title: content.title,
    legend: [LEGEND.dashed('Edificação sob a cobertura')],
    notes: [mats.roof + '.', 'Inclinações em % (i); setas indicam o sentido do caimento.', ctx.project.roof.gutters ? 'Calhas e condutores conforme indicado; ligar à drenagem pluvial do lote.' : 'Cobertura sem calhas.', 'Cotas em metros, de beiral a beiral.'],
  };
};
