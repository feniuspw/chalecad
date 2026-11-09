/** Fachadas em mm de papel (conteúdo `elevation`): níveis, cotas de altura, materiais e linha do terreno. */
import type { HostWall, ResolvedOpening, RoofPlane, Vec2 } from '@chalecad/engine';
import { fmt } from '../../project/format';
import { bounds } from '../../plan2d/geom';
import { fmtLevel, hatchPattern, levelMark, pDimH, pDimV } from '../../plan2d/paper';
import { terrainProfile } from '../../plan2d/section';
import { GUIDE, INK, MUTED, group, line, n2, poly, rect, tag, text } from '../../plan2d/svg';
import type { ContentRenderer, SheetContext } from '../types';
import { LEGEND, ST, mmPerM, safeId } from './common';

type Side = 'front' | 'back' | 'left' | 'right';
const SIDES: Record<Side, { h: (x: number, y: number) => number; depth: (x: number, y: number) => number; name: string }> = {
  front: { h: (x) => x, depth: (_x, y) => y, name: 'frontal' },
  back: { h: (x) => -x, depth: (_x, y) => -y, name: 'posterior' },
  right: { h: (_x, y) => y, depth: (x) => -x, name: 'lateral direita' },
  left: { h: (_x, y) => -y, depth: (x) => x, name: 'lateral esquerda' },
};

const ROOF_COLORS: Record<string, string> = { graphite: 'grafite', black: 'preta', terracotta: 'terracota', white: 'branca', green: 'verde' };

export function materialsOf(ctx: SheetContext): { facade: string; roof: string } {
  const cat = ctx.catalog;
  const f = ctx.project.finishes;
  const facadeMat = f.facade ? cat.materials.find((m) => m.id === f.facade)?.name : undefined;
  const ext = cat.assemblies.find((a) => a.id === ctx.project.system.assemblies.exterior)?.name;
  const roofMat = cat.materials.find((m) => m.id === ctx.project.roof.cladding)?.name ?? ctx.project.roof.cladding;
  const color = f.roofColor ? `, cor ${ROOF_COLORS[f.roofColor] ?? f.roofColor}` : '';
  return {
    facade: facadeMat ? `Fachada: ${facadeMat}` : `Fachada: ${ext ? ext.replace(/^Parede externa:\s*/i, 'LSF com ') : 'fechamento externo em placa cimentícia'}`,
    roof: `Cobertura: ${roofMat}${color}`,
  };
}

export const elevationRenderer: ContentRenderer = (ctx, content, scale) => {
  const side = (content.target && content.target in SIDES ? content.target : 'front') as Side;
  const model = ctx.results.model;
  const k = mmPerM(scale);
  const { h, depth } = SIDES[side];
  const pid = safeId('elev', side);

  const exterior = model.walls.filter((w) => w.kind !== 'interior');
  const facing = exterior.filter((w) => Math.abs(depth(w.from[0], w.from[1]) - depth(w.to[0], w.to[1])) < 1e-6);
  const minDepth = Math.min(...facing.map((w) => depth(w.from[0], w.from[1])), Infinity);
  const wallPts = (w: HostWall): Vec2[] => {
    const len = w.length || 1;
    const dx = (w.to[0] - w.from[0]) / len;
    const dy = (w.to[1] - w.from[1]) / len;
    return w.outline.map(([u, v]): Vec2 => [h(w.from[0] + dx * u, w.from[1] + dy * u), w.baseZ + v]);
  };
  const roofPts = (r: RoofPlane): Vec2[] => r.vertices.map((v): Vec2 => [h(v[0], v[1]), v[2]]);
  const roofs = model.roofPlanes;
  const xsAll = [...facing.flatMap((w) => wallPts(w).map((p) => p[0])), ...roofs.flatMap((r) => roofPts(r).map((p) => p[0]))];
  const radier = model.slabs.find((s) => s.kind === 'radier');
  const radierXs = radier ? radier.polygon.map((p) => h(p[0], p[1])) : [];
  const all = [...xsAll, ...radierXs];
  if (all.length === 0) return null;
  const minH = Math.min(...all);
  const maxH = Math.max(...all);
  const topZ = Math.max(model.bbox.max[2], ...roofs.flatMap((r) => r.vertices.map((v) => v[2])));
  const wallsH = facing.flatMap((w) => wallPts(w).map((p) => p[0]));
  const wMin = wallsH.length ? Math.min(...wallsH) : minH;
  const wMax = wallsH.length ? Math.max(...wallsH) : maxH;
  const found = radier?.thickness ?? 0.12;

  // Terreno ao longo da fachada.
  const fp = bounds(model.footprint.length ? model.footprint : [[0, 0]]);
  const pad = 1;
  const nearDepthPt = (hh: number): Vec2 => {
    // ponto em planta cuja coordenada horizontal é hh, na linha da fachada mais próxima.
    switch (side) {
      case 'front': return [hh, fp.y0];
      case 'back': return [-hh, fp.y1];
      case 'right': return [fp.x1, hh];
      default: return [fp.x0, -hh];
    }
  };
  const terrain = terrainProfile(fp, ctx.project.site, ctx.results.terrain?.platformZ ?? 0, nearDepthPt, minH - pad, maxH + pad);
  const zLow = Math.min(-found, ...terrain.final.map((p) => p[1]), ...(terrain.natural ?? []).map((p) => p[1]));
  const hLo = (terrain.natural ? minH - pad - 1 : minH - pad);
  const hHi = (terrain.natural ? maxH + pad + 1 : maxH + pad);

  const ML = 40;
  const MR = 62;
  const MT = 12;
  const MB = 22;
  const width = ML + (hHi - hLo) * k + MR;
  const height = MT + (topZ + 0.3 - zLow) * k + MB;
  const X = (v: number) => ML + (v - hLo) * k;
  const Z = (z: number) => MT + (topZ + 0.3 - z) * k;

  const hatchG = `${pid}-ground`;
  const clad = `${pid}-clad`;
  const defs =
    hatchPattern(hatchG, { ...ST, hatch: 2 }) +
    tag('pattern', { id: clad, width: 4, height: 1.6, patternUnits: 'userSpaceOnUse' }, rect(0, 0, 4, 1.6, { fill: '#fff' }) + line(0, 1.6, 4, 1.6, { stroke: GUIDE, 'stroke-width': ST.thin }));

  const L: string[] = [];
  const gp = terrain.final.map(([hh, z]): [number, number] => [X(hh), Z(z)]);
  const gb = Z(zLow - 0.2);
  L.push(poly([...gp, [gp[gp.length - 1]![0], gb], [gp[0]![0], gb]], { fill: `url(#${hatchG})`, stroke: 'none', opacity: 0.5, 'data-role': 'ground' }));
  if (terrain.natural) L.push(tag('polyline', { points: terrain.natural.map(([hh, z]) => `${n2(X(hh))},${n2(Z(z))}`).join(' '), fill: 'none', stroke: MUTED, 'stroke-width': ST.view, 'stroke-dasharray': '2.5 1.2', 'data-role': 'natural-terrain' }));
  if (radier) {
    const a = Math.min(...radierXs);
    const c = Math.max(...radierXs);
    L.push(rect(X(a), Z(0), (c - a) * k, found * k, { fill: '#e7e5e4', stroke: INK, 'stroke-width': ST.view, 'data-role': 'radier' }));
  }

  type Item = { d: number; svg: string };
  const items: Item[] = [];
  for (const r of roofs) {
    const d = r.vertices.reduce((s, v) => s + depth(v[0], v[1]), 0) / r.vertices.length;
    items.push({ d, svg: poly(roofPts(r).map(([a, z]): [number, number] => [X(a), Z(z)]), { fill: '#f5f5f4', stroke: INK, 'stroke-width': ST.cut, 'stroke-linejoin': 'round', 'data-role': 'roof', 'data-id': r.id }) });
  }
  const byWall = new Map<string, ResolvedOpening[]>();
  for (const o of model.openings) if (o.hostKind === 'wall' && o.valid) byWall.set(o.hostId, [...(byWall.get(o.hostId) ?? []), o]);
  for (const w of facing) {
    const near = Math.abs(depth(w.from[0], w.from[1]) - minDepth) < 0.05;
    const pts = wallPts(w).map(([a, z]): [number, number] => [X(a), Z(z)]);
    const len = w.length || 1;
    const dx = (w.to[0] - w.from[0]) / len;
    const dy = (w.to[1] - w.from[1]) / len;
    let svg = poly(pts, { fill: near ? `url(#${clad})` : '#fafaf9', stroke: INK, 'stroke-width': near ? ST.cut : ST.view, 'stroke-linejoin': 'miter', 'data-role': 'wall', 'data-id': w.id });
    if (near) {
      for (const o of byWall.get(w.id) ?? []) {
        const x0 = X(h(w.from[0] + dx * o.u0, w.from[1] + dy * o.u0));
        const x1 = X(h(w.from[0] + dx * o.u1, w.from[1] + dy * o.u1));
        svg += openingSvg(o.type, Math.min(x0, x1), Math.max(x0, x1), Z(w.baseZ + o.v1), Z(w.baseZ + o.v0), o.id);
      }
    }
    items.push({ d: depth(w.from[0], w.from[1]) + 1e-3, svg });
  }
  items.sort((a, b) => b.d - a.d);
  L.push(...items.map((i) => i.svg));
  L.push(tag('polyline', { points: gp.map(([x, z]) => `${n2(x)},${n2(z)}`).join(' '), fill: 'none', stroke: INK, 'stroke-width': ST.cut, 'data-role': 'ground-line' }));

  // Níveis (esquerda) e cotas de altura (direita).
  const marks: { z: number; label: string }[] = [{ z: 0, label: fmtLevel(0) }];
  for (const s of model.slabs.filter((x) => x.kind === 'mezzanine')) marks.push({ z: s.topZ, label: fmtLevel(s.topZ) });
  marks.push({ z: topZ, label: fmtLevel(topZ) });
  const lx = X(hLo) + 2;
  const dimL: string[] = [];
  for (const m of marks) {
    dimL.push(line(lx + 2, Z(m.z), X(hHi), Z(m.z), { stroke: GUIDE, 'stroke-width': ST.thin, 'stroke-dasharray': '5 1.2 0.6 1.2' }));
    dimL.push(levelMark(ST, lx, Z(m.z), m.label, 'start'));
  }
  const xr = X(wMax) + 2;
  const heights = marks.map((m) => m.z).sort((a, b) => a - b);
  const dimR: string[] = [];
  for (let i = 0; i + 1 < heights.length; i++) dimR.push(pDimV(ST, Z(heights[i + 1]!), Z(heights[i]!), X(hHi) + 6, fmt(heights[i + 1]! - heights[i]!, 2), xr));
  dimR.push(pDimV(ST, Z(topZ), Z(0), X(hHi) + 13, fmt(topZ, 2), xr));
  const bottom = Z(-found) + 7;
  dimR.push(pDimH(ST, X(wMin), X(wMax), bottom, fmt(wMax - wMin, 2), Z(-found) + 1));
  if (maxH - minH - (wMax - wMin) > 0.05) dimR.push(pDimH(ST, X(minH), X(maxH), bottom + 6, fmt(maxH - minH, 2), bottom));

  // Materiais (texto com linha de chamada).
  const mats = materialsOf(ctx);
  const callouts: string[] = [];
  const nearWall = facing.find((w) => Math.abs(depth(w.from[0], w.from[1]) - minDepth) < 0.05);
  const roofTop = roofs.map(roofPts).sort((a, b) => Math.max(...b.map((p) => p[1])) - Math.max(...a.map((p) => p[1])))[0];
  if (roofTop) {
    const pt = roofTop.reduce((m, p) => (p[1] > m[1] ? p : m), roofTop[0]!);
    const tx = X(hHi) + 17;
    callouts.push(line(X(pt[0]), Z(pt[1]), tx - 1, Z(pt[1]), { 'stroke-width': ST.thin }), text(tx, Z(pt[1]) - 0.8, mats.roof, { 'font-size': 2, 'text-anchor': 'start' }));
  }
  if (nearWall) {
    const wp = wallPts(nearWall);
    const midZ = (nearWall.baseZ + Math.max(...wp.map((p) => p[1]))) / 2;
    const px = Math.max(...wp.map((p) => p[0]));
    const tx = X(hHi) + 17;
    const ty = Z(midZ);
    callouts.push(line(X(px) - 3, ty, tx - 1, ty, { 'stroke-width': ST.thin }), text(tx, ty - 0.8, mats.facade, { 'font-size': 2, 'text-anchor': 'start' }));
  }
  if (terrain.natural) callouts.push(text(X(hLo) + 3, Z(terrain.natural[0]![1]) - 1.5, 'TERRENO NATURAL', { 'font-size': 2, 'text-anchor': 'start', fill: MUTED }));
  if (terrain.natural) callouts.push(text(X(hLo) + 3, Z(0) + 4, 'PLATÔ / TERRENO FINAL', { 'font-size': 2, 'text-anchor': 'start', fill: MUTED }));

  const body = `<title>${SIDES[side].name}</title>` + L.join('') + group(dimL.join('') + dimR.join('') + callouts.join(''), { 'data-role': 'elevation-annotations' });
  return {
    body,
    defs,
    width,
    height,
    scale,
    title: content.title,
    legend: [LEGEND.level()],
    notes: [mats.facade + '.', mats.roof + '.', 'Cotas e níveis em metros; ±0,00 = piso acabado do térreo.'],
  };
};

function openingSvg(type: ResolvedOpening['type'], x0: number, x1: number, yTop: number, yBot: number, id: string): string {
  const w = x1 - x0;
  const h = yBot - yTop;
  const p: string[] = [];
  if (type === 'window' || type === 'skylight') {
    p.push(rect(x0, yTop, w, h, { fill: '#fff', stroke: INK, 'stroke-width': ST.view }));
    p.push(rect(x0 + 0.8, yTop + 0.8, w - 1.6, h - 1.6, { fill: 'none', stroke: INK, 'stroke-width': ST.thin }));
    p.push(line(x0 + w / 2, yTop + 0.8, x0 + w / 2, yBot - 0.8, { 'stroke-width': ST.thin }));
  } else {
    p.push(rect(x0, yTop, w, h, { fill: '#fff', stroke: INK, 'stroke-width': ST.view }));
    if (type === 'sliding_door') p.push(line(x0 + w / 2, yTop, x0 + w / 2, yBot, { 'stroke-width': ST.thin }));
    else p.push(tag('circle', { cx: x0 + w - 1.5, cy: yTop + h * 0.52, r: 0.5, fill: INK }));
  }
  return group(p.join(''), { 'data-role': `opening-${type}`, 'data-id': id });
}

