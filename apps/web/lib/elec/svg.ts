/**
 * Planta elétrica em SVG (PDF e exportações): o mesmo modelo da camada da cena (`buildElecPlan`), em traços finos.
 * Puro (string); `P` converte metros da planta em unidades do SVG e `S` é a escala (unidades por metro).
 */
import { symbolShape, SYMBOL_LEGEND, type ElecPlanModel, type PlanLabel } from './symbols';
import type { SymbolKind } from './kinds';
import { CONDUIT_COLOR } from './kinds';
import type { Vec2 } from '@chalecad/engine';
import { group, n2, tag, text } from '../plan2d/svg';

const MUTED = '#78716c';
type Proj = (p: Vec2) => [number, number];

const path = (pts: Vec2[], P: Proj, closed: boolean) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${n2(P(p)[0])} ${n2(P(p)[1])}`).join(' ') + (closed ? ' Z' : '');

function labelSvg(l: PlanLabel, P: Proj, S: number): string {
  const [x, y] = P(l.at);
  const size = Math.max(5.5, l.size * S * 0.62);
  return text(x, y + size * 0.35, l.text, { 'font-size': size, 'font-weight': 700, fill: l.color, stroke: '#fff', 'stroke-width': size * 0.28, 'paint-order': 'stroke', 'stroke-linejoin': 'round' });
}

/** Camada elétrica do nível: eletrodutos, ligações de comando, símbolos por circuito e rótulos. */
export function elecPlanSvg(plan: ElecPlanModel, P: Proj, S: number): string {
  const parts: string[] = [];
  const conduits = plan.conduits.map((c) => {
    const w = 1.1;
    if (c.run === 'ceiling') return tag('path', { d: path(c.path, P, false), fill: 'none', stroke: CONDUIT_COLOR, 'stroke-width': w, 'data-id': c.id, 'data-run': c.run });
    const dash = c.run === 'floor' ? '5 3' : '2 2';
    return tag('path', { d: path(c.path, P, false), fill: 'none', stroke: CONDUIT_COLOR, 'stroke-width': w, 'stroke-dasharray': dash, 'data-id': c.id, 'data-run': c.run });
  });
  parts.push(group(conduits.join(''), { 'data-role': 'elec-conduits' }));
  const links = plan.links.map((l) => tag('path', { d: path([l.from, l.to], P, false), fill: 'none', stroke: l.color, 'stroke-width': 0.5, 'stroke-dasharray': '3 2', 'data-letter': l.letter }));
  parts.push(group(links.join(''), { 'data-role': 'elec-control' }));
  const syms = plan.points.map((it) => {
    const d = it.shape.outline.map((s) => tag('path', { d: path(s.pts, P, s.closed), fill: 'none', stroke: it.color, 'stroke-width': 0.9, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' })).join('');
    const f = it.shape.fills.map((poly) => tag('path', { d: path(poly, P, true), fill: it.color, stroke: 'none' })).join('');
    return group(f + d, { 'data-role': 'elec-point', 'data-id': it.id, 'data-kind': it.kind, 'data-circuit': it.circuit });
  });
  parts.push(group(syms.join(''), { 'data-role': 'elec-points' }));
  const labels = [...plan.points.flatMap((it) => it.labels), ...plan.conduits.flatMap((c) => (c.label ? [c.label] : []))].map((l) => labelSvg(l, P, S));
  parts.push(group(labels.join(''), { 'data-role': 'elec-labels' }));
  return group(parts.join(''), { 'data-role': 'electrical' });
}

/** Legenda dos símbolos presentes (NBR 5444) mais as convenções de eletroduto. */
export function elecLegendSvg(kinds: SymbolKind[], x: number, y: number, cols: number): string {
  const cell = 150;
  const parts = kinds.map((kind, i) => {
    const sh = symbolShape(kind, [0, 0], [0, 1]);
    const k = 40; // unidades do SVG por metro na legenda
    const ox = x + (i % cols) * cell + 10;
    const oy = y + Math.floor(i / cols) * 16 + 5;
    const P: Proj = ([px, py]) => [ox + px * k, oy - py * k];
    const d = sh.outline.map((s) => tag('path', { d: path(s.pts, P, s.closed), fill: 'none', stroke: '#44403c', 'stroke-width': 0.8 })).join('');
    const f = sh.fills.map((poly) => tag('path', { d: path(poly, P, true), fill: '#44403c' })).join('');
    return group(f + d + text(ox + 16, oy + 2, SYMBOL_LEGEND[kind], { 'font-size': 7.5, 'text-anchor': 'start', fill: MUTED }), { 'data-kind': kind });
  });
  const rows = Math.ceil(kinds.length / cols);
  const ly = y + rows * 16 + 5;
  const conv =
    tag('path', { d: `M${x + 8} ${ly} L${x + 30} ${ly}`, stroke: CONDUIT_COLOR, 'stroke-width': 1.1 }) +
    text(x + 36, ly + 2.5, 'Eletroduto no forro', { 'font-size': 7.5, 'text-anchor': 'start', fill: MUTED }) +
    tag('path', { d: `M${x + 158} ${ly} L${x + 180} ${ly}`, stroke: CONDUIT_COLOR, 'stroke-width': 1.1, 'stroke-dasharray': '5 3' }) +
    text(x + 186, ly + 2.5, 'Eletroduto no piso', { 'font-size': 7.5, 'text-anchor': 'start', fill: MUTED }) +
    text(x + 8, ly + 16, 'Ø = DN do eletroduto (mm) · nº depois do Ø = circuitos no trecho · cor e nº do símbolo = circuito · letra = comando (a, b...)', { 'font-size': 7, 'text-anchor': 'start', fill: MUTED });
  return group(text(x, y - 12, 'LEGENDA — ELÉTRICA (NBR 5444)', { 'font-size': 7.5, 'text-anchor': 'start', fill: MUTED, 'letter-spacing': 0.6 }) + parts.join('') + conv, { 'data-role': 'elec-legend' });
}

