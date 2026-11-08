/** Camada Hidráulica em SVG (PDF): tubos por sistema, DN, pontos, caixa d'água e selos de pressão do nível. Puro. */
import type { PipeSystem, PlumbingReport, Project, Vec2 } from '@chalecad/engine';
import type { TechnicalConstants } from '@chalecad/catalog';
import { circleSvg, groupSvg, lineSvg, rectSvg, textSvg } from './svgBits';
import { FALLBACK_COLORS, fmtM, isVertical, type V3 } from './geometry';
import { inferSewer } from './devices';
import { pressureRows, sealMissing, sealRows, sealText } from './report';
import { flowArrows, longestSegment, pipeInfo, pipeTag, stackTag, tankSide } from './symbols';

const WIDTH: Record<PipeSystem, number> = { cold: 1.6, hot: 1.6, sewer: 2.4, vent: 1.2 };

export function plumbingOverlay(report: PlumbingReport, project: Pick<Project, 'levels'>, k: TechnicalConstants['plumbing'], levelId: string, P: (p: Vec2) => [number, number], S: number): string {
  const colors = k.colors as Record<PipeSystem, string>;
  const col = (s: PipeSystem) => colors[s] ?? FALLBACK_COLORS[s];
  const layout = report.layout;
  const info = pipeInfo(report);
  const sewer = inferSewer(layout, project, k);
  const out: string[] = [];
  for (const p of layout.pipes.filter((x) => x.level === levelId)) {
    const path = p.path as V3[];
    const c = col(p.system);
    if (isVertical(path)) {
      const [x, y] = P([path[0]![0], path[0]![1]]);
      out.push(circleSvg(x, y, 0.08 * S, { fill: '#fff', stroke: c, 'stroke-width': 1.4 }), textSvg(x, y + 0.08 * S + 8, stackTag(p), { fill: c, 'font-size': 6.5, 'font-weight': 700 }));
      continue;
    }
    const pts = path.map((v) => P([v[0], v[1]]));
    for (let i = 0; i + 1 < pts.length; i++) out.push(lineSvg(pts[i]![0], pts[i]![1], pts[i + 1]![0], pts[i + 1]![1], { stroke: c, 'stroke-width': WIDTH[p.system], ...(p.system === 'vent' ? { 'stroke-dasharray': '5 2' } : {}), 'stroke-linecap': 'round' }));
    if (p.system === 'sewer') {
      const fwd = sewer.flowForward.get(p.id) ?? path[0]![2] >= path[path.length - 1]![2];
      for (const a of flowArrows(path, fwd)) {
        const [x, y] = P(a.at);
        const dx = a.dir[0];
        const dy = -a.dir[1];
        const n: Vec2 = [-dy, dx];
        const l = 0.09 * S;
        const w = 0.06 * S;
        out.push(lineSvg(x - dx * l + n[0] * w, y - dy * l + n[1] * w, x + dx * l, y + dy * l, { stroke: '#fff', 'stroke-width': 1.1 }), lineSvg(x - dx * l - n[0] * w, y - dy * l - n[1] * w, x + dx * l, y + dy * l, { stroke: '#fff', 'stroke-width': 1.1 }));
      }
    }
    const seg = longestSegment(path);
    const tag = pipeTag(p, info.get(p.id));
    if (seg && tag && seg.length >= 0.55) {
      const a = P([path[seg.index]![0], path[seg.index]![1]]);
      const b = P([path[seg.index + 1]![0], path[seg.index + 1]![1]]);
      out.push(textSvg((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 3, tag, { fill: c, 'font-size': 6.5, 'font-weight': 700, stroke: '#fff', 'stroke-width': 2, 'paint-order': 'stroke' }));
    }
  }
  for (const d of sewer.devices.filter((x) => x.level === levelId)) {
    const [x, y] = P(d.xy);
    const s = (d.kind === 'ci' ? 0.3 : 0.2) * S;
    out.push(rectSvg(x - s / 2, y - s / 2, s, s, { fill: '#fff', stroke: col('sewer'), 'stroke-width': 1.2 }), textSvg(x, y + s / 2 + 8, d.label, { fill: col('sewer'), 'font-size': 6.5, 'font-weight': 700 }));
  }
  const t = layout.tank;
  if (t.level === levelId) {
    const [x, y] = P([t.position[0], t.position[1]]);
    const s = tankSide(t.liters) * S;
    out.push(rectSvg(x - s / 2, y - s / 2, s, s, { fill: '#fff', stroke: col('cold'), 'stroke-width': 1.8 }), textSvg(x, y + 2, `CX ${t.liters} L`, { fill: col('cold'), 'font-size': 6.5, 'font-weight': 700 }), textSvg(x, y + 10, `fundo ${fmtM(t.bottomZ)} m`, { fill: col('cold'), 'font-size': 6 }));
  }
  const rows = sealRows(pressureRows(report, project, k));
  const placed = layout.points.filter((p) => p.level === levelId).sort((a, b) => b.position[1] - a.position[1]);
  placed.forEach((p, i) => {
    const spec = k.water.fixtures[p.fixture];
    const [x, y] = P([p.position[0], p.position[1]]);
    out.push(circleSvg(x, y, 0.09 * S, { fill: (spec?.wHot ?? 0) > 0 ? col('hot') : col('cold'), stroke: col('cold'), 'stroke-width': 1.2 }));
    const r = rows.get(p.id);
    if (!r) return;
    const near = placed.slice(0, i).filter((q) => Math.hypot(q.position[0] - p.position[0], q.position[1] - p.position[1]) < 1.6).length;
    const c = r.ok ? '#15803d' : '#dc2626';
    const bx = x + 0.2 * S;
    const by = y - 0.35 * S + near * 21;
    const miss = sealMissing(r);
    out.push(
      rectSvg(bx, by, 96, 19, { fill: r.ok ? '#f0fdf4' : '#fef2f2', stroke: c, 'stroke-width': 0.8, rx: 2 }),
      textSvg(bx + 3, by + 8, sealText(r), { fill: c, 'font-size': 6.3, 'font-weight': 700, 'text-anchor': 'start' }),
      textSvg(bx + 3, by + 16, `${r.label.slice(0, 22)}${miss ? ` · ${miss}` : ''}`, { fill: c, 'font-size': 5.6, 'text-anchor': 'start' }),
    );
  });
  return groupSvg(out.join(''), { 'data-role': 'plumbing' });
}
