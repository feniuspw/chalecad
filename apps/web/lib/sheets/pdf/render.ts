/**
 * Desenha o SVG de uma folha numa página do jsPDF como traços e texto vetoriais (sem rasterizar).
 * Cobre o subconjunto de SVG que as pranchas usam: g, line, rect, polygon, polyline, path, circle, ellipse, text,
 * transformações, tracejado, opacidade e padrões de hachura (linhas paralelas recortadas pela forma).
 */
import type { jsPDF } from 'jspdf';
import { IDENTITY, apply, mul, parseColor, parsePath, parseTransform, parseSvg, type Matrix, type PathOp, type SvgNode } from './svg';

interface Style {
  fill: string;
  stroke: string;
  strokeWidth: number;
  dash: string;
  cap: string;
  join: string;
  opacity: number;
  fillOpacity: number;
  strokeOpacity: number;
  fontSize: number;
  fontWeight: string;
  anchor: string;
  paintOrder: string;
}

const BASE: Style = { fill: '#000000', stroke: 'none', strokeWidth: 1, dash: 'none', cap: 'butt', join: 'miter', opacity: 1, fillOpacity: 1, strokeOpacity: 1, fontSize: 10, fontWeight: '400', anchor: 'start', paintOrder: 'normal' };

function styleAttrs(node: SvgNode): Record<string, string> {
  const a = { ...node.attrs };
  if (a.style) for (const decl of a.style.split(';')) {
    const [k, ...v] = decl.split(':');
    if (k && v.length) a[k.trim()] = v.join(':').trim();
  }
  return a;
}

function inherit(s: Style, a: Record<string, string>): Style {
  const n = (v: string | undefined, d: number) => (v !== undefined && Number.isFinite(parseFloat(v)) ? parseFloat(v) : d);
  return {
    fill: a.fill ?? s.fill,
    stroke: a.stroke ?? s.stroke,
    strokeWidth: n(a['stroke-width'], s.strokeWidth),
    dash: a['stroke-dasharray'] ?? s.dash,
    cap: a['stroke-linecap'] ?? s.cap,
    join: a['stroke-linejoin'] ?? s.join,
    opacity: s.opacity * n(a.opacity, 1),
    fillOpacity: n(a['fill-opacity'], s.fillOpacity),
    strokeOpacity: n(a['stroke-opacity'], s.strokeOpacity),
    fontSize: n(a['font-size'], s.fontSize),
    fontWeight: a['font-weight'] ?? s.fontWeight,
    anchor: a['text-anchor'] ?? s.anchor,
    paintOrder: a['paint-order'] ?? s.paintOrder,
  };
}

interface Pattern {
  w: number;
  h: number;
  m: Matrix;
  children: SvgNode[];
}

type Ops = PathOp[];

const num = (s: string | undefined, d = 0) => (s !== undefined && Number.isFinite(parseFloat(s)) ? parseFloat(s) : d);

function rectOps(x: number, y: number, w: number, h: number): Ops {
  return [{ op: 'M', pts: [x, y] }, { op: 'L', pts: [x + w, y] }, { op: 'L', pts: [x + w, y + h] }, { op: 'L', pts: [x, y + h] }, { op: 'Z', pts: [] }];
}

function ellipseOps(cx: number, cy: number, rx: number, ry: number): Ops {
  const k = 0.5522847498;
  return [
    { op: 'M', pts: [cx + rx, cy] },
    { op: 'C', pts: [cx + rx, cy + k * ry, cx + k * rx, cy + ry, cx, cy + ry] },
    { op: 'C', pts: [cx - k * rx, cy + ry, cx - rx, cy + k * ry, cx - rx, cy] },
    { op: 'C', pts: [cx - rx, cy - k * ry, cx - k * rx, cy - ry, cx, cy - ry] },
    { op: 'C', pts: [cx + k * rx, cy - ry, cx + rx, cy - k * ry, cx + rx, cy] },
    { op: 'Z', pts: [] },
  ];
}

function pointsOps(points: string, close: boolean): Ops {
  const v = points.trim().split(/[\s,]+/).map(Number);
  const out: Ops = [];
  for (let i = 0; i + 1 < v.length; i += 2) out.push({ op: i === 0 ? 'M' : 'L', pts: [v[i]!, v[i + 1]!] });
  if (close && out.length) out.push({ op: 'Z', pts: [] });
  return out;
}

function transformOps(ops: Ops, m: Matrix): Ops {
  return ops.map((o) => {
    const p: number[] = [];
    for (let i = 0; i < o.pts.length; i += 2) {
      const [x, y] = apply(m, o.pts[i]!, o.pts[i + 1]!);
      p.push(x, y);
    }
    return { op: o.op, pts: p };
  });
}

const scaleOf = (m: Matrix) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;

export interface RenderOptions {
  /** Largura e altura da página em mm (o `viewBox` do SVG é mapeado nela). */
  widthMm: number;
  heightMm: number;
}

export function renderSvgToPdf(doc: jsPDF, svgSource: string, o: RenderOptions): void {
  const root = parseSvg(svgSource);
  const vb = (root.attrs.viewBox ?? `0 0 ${o.widthMm} ${o.heightMm}`).split(/[\s,]+/).map(Number);
  const sx = o.widthMm / (vb[2] || o.widthMm);
  const sy = o.heightMm / (vb[3] || o.heightMm);
  const base: Matrix = [sx, 0, 0, sy, -(vb[0] ?? 0) * sx, -(vb[1] ?? 0) * sy];

  const patterns = new Map<string, Pattern>();
  const collect = (n: SvgNode) => {
    if (n.name === 'pattern' && n.attrs.id) {
      patterns.set(n.attrs.id, { w: num(n.attrs.width, 1), h: num(n.attrs.height, 1), m: parseTransform(n.attrs.patternTransform), children: n.children });
    }
    n.children.forEach(collect);
  };
  collect(root);

  const solid = (c: string, op: number) => {
    const col = parseColor(c);
    return col ? { rgb: col.rgb, alpha: col.alpha * op } : null;
  };

  const withAlpha = (alpha: number, strokeAlpha: number, fn: () => void) => {
    if (alpha >= 0.999 && strokeAlpha >= 0.999) return fn();
    doc.saveGraphicsState();
    const G = (doc as unknown as { GState: new (o: object) => unknown }).GState;
    doc.setGState(new G({ opacity: alpha, 'stroke-opacity': strokeAlpha }) as never);
    fn();
    doc.restoreGraphicsState();
  };

  const emitPath = (ops: Ops, style: 'S' | 'F' | 'FD' | null) => {
    const lines = ops.map((p) => {
      if (p.op === 'M') return { op: 'm', c: p.pts };
      if (p.op === 'L') return { op: 'l', c: p.pts };
      if (p.op === 'C') return { op: 'c', c: p.pts };
      return { op: 'h' };
    });
    // jsPDF.path só monta o caminho; o pintar (ou o recorte, com `style` nulo) vem depois.
    const d = doc as unknown as { path: (l: unknown[]) => void; stroke: () => void; fill: () => void; fillStroke: () => void };
    d.path(lines);
    if (style === 'S') d.stroke();
    else if (style === 'F') d.fill();
    else if (style === 'FD') d.fillStroke();
  };

  const bboxOf = (ops: Ops) => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const p of ops) for (let i = 0; i < p.pts.length; i += 2) { xs.push(p.pts[i]!); ys.push(p.pts[i + 1]!); }
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  };

  const fillPattern = (pat: Pattern, ops: Ops, ctm: Matrix) => {
    if (ops.length === 0) return;
    const M = mul(ctm, pat.m);
    const bb = bboxOf(ops);
    const inv = invert(M);
    const corners = [apply(inv, bb.x0, bb.y0), apply(inv, bb.x1, bb.y0), apply(inv, bb.x1, bb.y1), apply(inv, bb.x0, bb.y1)];
    const tx0 = Math.min(...corners.map((c) => c[0]));
    const tx1 = Math.max(...corners.map((c) => c[0]));
    const ty0 = Math.min(...corners.map((c) => c[1]));
    const ty1 = Math.max(...corners.map((c) => c[1]));
    doc.saveGraphicsState();
    emitPath(ops, null);
    (doc as unknown as { clip: () => void }).clip();
    (doc as unknown as { discardPath: () => void }).discardPath();
    for (const ch of pat.children) {
      const a = styleAttrs(ch);
      if (ch.name === 'rect') {
        const col = solid(a.fill ?? '#000', 1);
        if (col) {
          doc.setFillColor(col.rgb[0], col.rgb[1], col.rgb[2]);
          doc.rect(bb.x0 - 1, bb.y0 - 1, bb.x1 - bb.x0 + 2, bb.y1 - bb.y0 + 2, 'F');
        }
      }
    }
    for (const ch of pat.children) {
      if (ch.name !== 'line') continue;
      const a = styleAttrs(ch);
      const col = solid(a.stroke ?? '#000', 1);
      if (!col) continue;
      const [x1, y1, x2, y2] = [num(a.x1), num(a.y1), num(a.x2), num(a.y2)];
      doc.setDrawColor(col.rgb[0], col.rgb[1], col.rgb[2]);
      doc.setLineWidth(num(a['stroke-width'], 1) * scaleOf(M));
      const seg = (ax: number, ay: number, bx: number, by: number) => {
        const [p, q] = [apply(M, ax, ay), apply(M, bx, by)];
        doc.line(p[0], p[1], q[0], q[1]);
      };
      if (Math.abs(x1 - x2) < 1e-9) {
        for (let k = Math.floor((tx0 - x1) / pat.w); x1 + k * pat.w <= tx1 + 1e-6; k++) seg(x1 + k * pat.w, ty0 - 1, x1 + k * pat.w, ty1 + 1);
      } else if (Math.abs(y1 - y2) < 1e-9) {
        for (let k = Math.floor((ty0 - y1) / pat.h); y1 + k * pat.h <= ty1 + 1e-6; k++) seg(tx0 - 1, y1 + k * pat.h, tx1 + 1, y1 + k * pat.h);
      }
    }
    doc.restoreGraphicsState();
  };

  const strokeSetup = (s: Style, m: Matrix) => {
    const col = solid(s.stroke, s.strokeOpacity);
    if (!col) return false;
    doc.setDrawColor(col.rgb[0], col.rgb[1], col.rgb[2]);
    doc.setLineWidth(s.strokeWidth * scaleOf(m));
    doc.setLineCap(s.cap === 'round' ? 'round' : s.cap === 'square' ? 'square' : 'butt');
    doc.setLineJoin(s.join === 'round' ? 'round' : s.join === 'bevel' ? 'bevel' : 'miter');
    const dash = s.dash === 'none' ? [] : s.dash.split(/[\s,]+/).map(Number).filter((v) => Number.isFinite(v));
    const k = scaleOf(m);
    doc.setLineDashPattern(dash.length ? (dash.length % 2 ? [...dash, ...dash] : dash).map((v) => v * k) : [], 0);
    return true;
  };

  const drawShape = (ops: Ops, s: Style, m: Matrix, closed: boolean) => {
    if (ops.length === 0) return;
    const page = transformOps(ops, m);
    const fillUrl = /^url\(#([^)]+)\)$/.exec(s.fill.trim());
    const fillCol = fillUrl ? null : closed ? solid(s.fill, s.fillOpacity) : null;
    withAlpha(s.opacity * (fillCol?.alpha ?? 1), s.opacity, () => {
      const hasStroke = strokeSetup(s, m);
      if (fillUrl) {
        const pat = patterns.get(fillUrl[1]!);
        if (pat) fillPattern(pat, page, m);
        if (hasStroke) emitPath(page, 'S');
        return;
      }
      if (fillCol) doc.setFillColor(fillCol.rgb[0], fillCol.rgb[1], fillCol.rgb[2]);
      const style = fillCol && hasStroke ? 'FD' : fillCol ? 'F' : hasStroke ? 'S' : null;
      if (style) emitPath(page, style);
      doc.setLineDashPattern([], 0);
    });
  };

  const textOf = (n: SvgNode): string => n.text + n.children.filter((c) => c.name === 'tspan').map(textOf).join('');

  const drawText = (n: SvgNode, a: Record<string, string>, s: Style, m: Matrix) => {
    const str = textOf(n).replace(/\s+/g, ' ').trim();
    if (!str) return;
    const [x, y] = [num(a.x), num(a.y)];
    const [px, py] = apply(m, x, y);
    const k = scaleOf(m);
    const sizeMm = s.fontSize * k;
    const rot = (Math.atan2(m[1], m[0]) * 180) / Math.PI;
    doc.setFont('helvetica', parseInt(s.fontWeight, 10) >= 600 || s.fontWeight === 'bold' ? 'bold' : 'normal');
    doc.setFontSize((sizeMm * 72) / 25.4);
    const w = doc.getTextWidth(str);
    const off = s.anchor === 'middle' ? -w / 2 : s.anchor === 'end' ? -w : 0;
    const r = (rot * Math.PI) / 180;
    const tx = px + off * Math.cos(r);
    const ty = py + off * Math.sin(r);
    const fill = solid(s.fill, s.fillOpacity);
    const haloCol = s.paintOrder.startsWith('stroke') ? solid(s.stroke, 1) : null;
    withAlpha(s.opacity, s.opacity, () => {
      if (haloCol && s.strokeWidth > 0) {
        doc.setDrawColor(haloCol.rgb[0], haloCol.rgb[1], haloCol.rgb[2]);
        doc.setLineWidth(s.strokeWidth * k);
        doc.setLineJoin('round');
        doc.text(str, tx, ty, { angle: -rot, renderingMode: 'stroke' } as never);
      }
      if (fill) {
        doc.setTextColor(fill.rgb[0], fill.rgb[1], fill.rgb[2]);
        doc.text(str, tx, ty, { angle: -rot } as never);
      }
    });
  };

  const walk = (n: SvgNode, s0: Style, m0: Matrix) => {
    if (['defs', 'pattern', 'title', 'desc', 'clipPath', 'marker', 'mask', 'style', 'metadata'].includes(n.name)) return;
    const a = styleAttrs(n);
    if (a.display === 'none' || a.visibility === 'hidden') return;
    const s = inherit(s0, a);
    const m = n.name === 'svg' ? m0 : mul(m0, parseTransform(a.transform));
    switch (n.name) {
      case 'svg':
      case 'g':
      case 'a':
        n.children.forEach((c) => walk(c, s, m));
        break;
      case 'line':
        drawShape([{ op: 'M', pts: [num(a.x1), num(a.y1)] }, { op: 'L', pts: [num(a.x2), num(a.y2)] }], s, m, false);
        break;
      case 'rect':
        drawShape(rectOps(num(a.x), num(a.y), num(a.width), num(a.height)), s, m, true);
        break;
      case 'polygon':
        drawShape(pointsOps(a.points ?? '', true), s, m, true);
        break;
      case 'polyline':
        drawShape(pointsOps(a.points ?? '', false), s, m, true);
        break;
      case 'circle':
        drawShape(ellipseOps(num(a.cx), num(a.cy), num(a.r), num(a.r)), s, m, true);
        break;
      case 'ellipse':
        drawShape(ellipseOps(num(a.cx), num(a.cy), num(a.rx), num(a.ry)), s, m, true);
        break;
      case 'path':
        drawShape(parsePath(a.d ?? ''), s, m, true);
        break;
      case 'text':
        drawText(n, a, s, m);
        break;
      default:
        break;
    }
  };

  walk(root, BASE, mul(base, IDENTITY));
}

function invert(m: Matrix): Matrix {
  const det = m[0] * m[3] - m[1] * m[2] || 1e-12;
  const a = m[3] / det;
  const b = -m[1] / det;
  const c = -m[2] / det;
  const d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}
