/** Fachadas (elevações) em SVG a partir do `BuildingModel`: contorno das paredes, telhado e aberturas. */
import type { BuildingModel, HostWall, ResolvedOpening, RoofPlane, Vec2 } from '@chalecad/engine';
import { fmt } from '../project/format';
import { ACCENT, GUIDE, INK, MUTED, esc, group, hDim, line, meters, n2, poly, rect, scaleBar, svgDocument, tag, text, vDim, type SvgDoc } from './svg';

export type ElevationSide = 'front' | 'back' | 'left' | 'right';

export const ELEVATION_LABELS: Record<ElevationSide, string> = {
  front: 'Fachada frontal',
  back: 'Fachada posterior',
  left: 'Fachada lateral esquerda',
  right: 'Fachada lateral direita',
};

export interface ElevationOptions {
  idPrefix?: string;
}

const S = 60;

/** Coordenada horizontal da tela (cresce para a direita) e profundidade (menor = mais perto do observador). */
const axes: Record<ElevationSide, { h: (x: number, y: number) => number; depth: (x: number, y: number) => number }> = {
  front: { h: (x) => x, depth: (_x, y) => y },
  back: { h: (x) => -x, depth: (_x, y) => -y },
  right: { h: (_x, y) => y, depth: (x) => -x },
  left: { h: (_x, y) => -y, depth: (x) => x },
};

export function elevationSvg(model: BuildingModel, side: ElevationSide, opts: ElevationOptions = {}): SvgDoc {
  const pid = opts.idPrefix ?? 'e';
  const { h, depth } = axes[side];
  const exterior = model.walls.filter((w) => w.kind !== 'interior');
  // Paredes cujo plano é perpendicular à direção de visão (aparecem de frente).
  const facing = exterior.filter((w) => {
    const [a, b] = [w.from, w.to];
    return Math.abs(depth(a[0], a[1]) - depth(b[0], b[1])) < 1e-6;
  });
  const minDepth = Math.min(...facing.map((w) => depth(w.from[0], w.from[1])), Infinity);
  const wallPts = (w: HostWall): Vec2[] => {
    const dx = (w.to[0] - w.from[0]) / (w.length || 1);
    const dy = (w.to[1] - w.from[1]) / (w.length || 1);
    return w.outline.map(([u, v]): Vec2 => [h(w.from[0] + dx * u, w.from[1] + dy * u), w.baseZ + v]);
  };

  // Extensões: paredes, telhado e radier.
  const roofs = model.roofPlanes;
  const roofPts = (r: RoofPlane): Vec2[] => r.vertices.map((v): Vec2 => [h(v[0], v[1]), v[2]]);
  const xsAll = [...facing.flatMap((w) => wallPts(w).map((p) => p[0])), ...roofs.flatMap((r) => roofPts(r).map((p) => p[0]))];
  const radier = model.slabs.find((s) => s.kind === 'radier');
  const radierXs = radier ? radier.polygon.map((p) => h(p[0], p[1])) : [];
  const minH = Math.min(...xsAll, ...radierXs);
  const maxH = Math.max(...xsAll, ...radierXs);
  const topZ = Math.max(model.bbox.max[2], ...roofs.flatMap((r) => r.vertices.map((v) => v[2])));
  const found = radier?.thickness ?? 0.12;
  const wallMinH = facing.length ? Math.min(...facing.flatMap((w) => wallPts(w).map((p) => p[0]))) : minH;
  const wallMaxH = facing.length ? Math.max(...facing.flatMap((w) => wallPts(w).map((p) => p[0]))) : maxH;

  const ML = 110;
  const MR = 100;
  const MT = 70;
  const MB = 140;
  const groundPad = 0.5;
  const drawW = (maxH - minH + groundPad * 2) * S;
  const drawH = (topZ + found + 0.3) * S;
  const width = Math.max(ML + drawW + MR, 330);
  const height = MT + drawH + MB;
  const X = (v: number) => ML + (v - minH + groundPad) * S;
  const Z = (z: number) => MT + (topZ + 0.3 - z) * S;

  const defs =
    tag('pattern', { id: `${pid}-ground`, width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, rect(0, 0, 5, 5, { fill: '#fff' }) + line(0, 0, 0, 5, { stroke: INK, 'stroke-width': 0.8 })) +
    tag('pattern', { id: `${pid}-cladding`, width: 6, height: 6, patternUnits: 'userSpaceOnUse' }, rect(0, 0, 6, 6, { fill: '#fafaf9' }) + line(0, 5.5, 6, 5.5, { stroke: '#d6d3d1', 'stroke-width': 0.5 }));

  const layers: string[] = [];

  // Terreno e radier.
  layers.push(
    rect(X(minH - groundPad), Z(0), (maxH - minH + groundPad * 2) * S, found * S + 8, { fill: `url(#${pid}-ground)`, stroke: 'none', opacity: 0.55, 'data-role': 'ground' }),
    line(X(minH - groundPad), Z(0), X(maxH + groundPad), Z(0), { 'stroke-width': 1.6 }),
  );
  if (radier) {
    const a = Math.min(...radierXs);
    const b = Math.max(...radierXs);
    layers.push(rect(X(a), Z(0), (b - a) * S, found * S, { fill: '#d6d3d1', stroke: INK, 'stroke-width': 0.9, 'data-role': 'radier' }));
  }

  // Elementos em ordem de profundidade (mais longe primeiro).
  type Item = { d: number; svg: string };
  const items: Item[] = [];
  for (const r of roofs) {
    const pts = roofPts(r);
    const d = r.vertices.reduce((s, v) => s + depth(v[0], v[1]), 0) / r.vertices.length;
    items.push({
      d,
      svg: poly(pts.map(([a, z]): [number, number] => [X(a), Z(z)]), { fill: '#e7e5e4', stroke: INK, 'stroke-width': 1.8, 'stroke-linejoin': 'round', 'data-role': 'roof', 'data-id': r.id }),
    });
  }
  const openingsByWall = new Map<string, ResolvedOpening[]>();
  for (const o of model.openings) if (o.hostKind === 'wall' && o.valid) openingsByWall.set(o.hostId, [...(openingsByWall.get(o.hostId) ?? []), o]);
  for (const w of facing) {
    const near = Math.abs(depth(w.from[0], w.from[1]) - minDepth) < 0.05;
    const pts = wallPts(w).map(([a, z]): [number, number] => [X(a), Z(z)]);
    const dx = (w.to[0] - w.from[0]) / (w.length || 1);
    const dy = (w.to[1] - w.from[1]) / (w.length || 1);
    let svg = poly(pts, { fill: near ? `url(#${pid}-cladding)` : '#f5f5f4', stroke: near ? INK : GUIDE, 'stroke-width': near ? 1.6 : 0.8, 'stroke-linejoin': 'miter', 'data-role': 'wall', 'data-id': w.id });
    if (near) {
      for (const o of openingsByWall.get(w.id) ?? []) {
        const x0 = X(h(w.from[0] + dx * o.u0, w.from[1] + dy * o.u0));
        const x1 = X(h(w.from[0] + dx * o.u1, w.from[1] + dy * o.u1));
        svg += openingElevation(o.type, Math.min(x0, x1), Math.max(x0, x1), Z(w.baseZ + o.v1), Z(w.baseZ + o.v0), o.id);
      }
    }
    items.push({ d: depth(w.from[0], w.from[1]) + 1e-3, svg });
  }
  items.sort((a, b) => b.d - a.d);
  layers.push(...items.map((i) => i.svg));

  // Níveis (linhas de piso) na margem esquerda.
  const marks: { z: number; label: string }[] = [{ z: 0, label: '±0,00' }];
  for (const s of model.slabs.filter((x) => x.kind === 'mezzanine')) marks.push({ z: s.topZ, label: `+${fmt(s.topZ, 2)}` });
  marks.push({ z: topZ, label: `+${fmt(topZ, 2)}` });
  const lx = X(minH - groundPad) - 6;
  for (const m of marks) {
    layers.push(
      group(
        line(lx - 24, Z(m.z), X(maxH + groundPad), Z(m.z), { stroke: GUIDE, 'stroke-width': 0.5, 'stroke-dasharray': '8 3 1.5 3' }) +
          poly([[lx - 8, Z(m.z)], [lx, Z(m.z) - 5], [lx, Z(m.z) + 5]].map(([a, b]) => [a!, b!] as [number, number]), { fill: INK }) +
          text(lx - 12, Z(m.z) - 4, m.label, { 'text-anchor': 'end', 'font-size': 8.5, fill: ACCENT, 'font-weight': 700 }),
        { 'data-role': 'level-mark' },
      ),
    );
  }

  // Cotas: largura (paredes e telhado) e altura total.
  const bottom = Z(-found) + 24;
  const dims = [
    hDim(X(wallMinH), X(wallMaxH), bottom, meters(wallMaxH - wallMinH), Z(-found) + 4),
    maxH - minH - (wallMaxH - wallMinH) > 0.05 ? hDim(X(minH), X(maxH), bottom + 24, meters(maxH - minH), bottom) : '',
    vDim(Z(topZ), Z(0), X(maxH + groundPad) + 26, meters(topZ), X(maxH + groundPad)),
  ];
  layers.push(group(dims.join(''), { 'data-role': 'dim-outer' }));

  const deco =
    text(ML, 30, `${ELEVATION_LABELS[side].toUpperCase()}`, { 'text-anchor': 'start', 'font-size': 13, 'font-weight': 700 }) +
    text(ML, 45, `Cotas em metros · altura da cumeeira ${fmt(model.ridgeHeight, 2)} m`, { 'text-anchor': 'start', 'font-size': 8.5, fill: MUTED }) +
    scaleBar(ML, MT + drawH + 96, S);

  return { svg: svgDocument(width, height, `<title>${esc(ELEVATION_LABELS[side])}</title>` + layers.join('') + deco, defs), width, height, unitsPerMeter: S };
}

function openingElevation(type: ResolvedOpening['type'], x0: number, x1: number, yTop: number, yBot: number, id: string): string {
  const w = x1 - x0;
  const h = yBot - yTop;
  const parts: string[] = [];
  if (type === 'window' || type === 'skylight') {
    parts.push(rect(x0, yTop, w, h, { fill: '#e0f2fe', stroke: INK, 'stroke-width': 1.2 }));
    parts.push(rect(x0 + 3, yTop + 3, w - 6, h - 6, { fill: 'none', stroke: INK, 'stroke-width': 0.6 }));
    parts.push(line(x0 + w / 2, yTop + 3, x0 + w / 2, yBot - 3, { 'stroke-width': 0.6 }));
    parts.push(line(x0 + 6, yBot - 8, x0 + 16, yBot - 14, { stroke: '#fff', 'stroke-width': 1.2 }));
  } else {
    parts.push(rect(x0, yTop, w, h, { fill: type === 'sliding_door' ? '#e0f2fe' : '#d6a56b', stroke: INK, 'stroke-width': 1.2 }));
    if (type === 'sliding_door') parts.push(line(x0 + w / 2, yTop, x0 + w / 2, yBot, { 'stroke-width': 0.8 }));
    else parts.push(tag('circle', { cx: x0 + w - 6, cy: yTop + h * 0.52, r: 1.6, fill: INK }));
  }
  void n2;
  return group(parts.join(''), { 'data-role': `opening-${type}`, 'data-id': id });
}
