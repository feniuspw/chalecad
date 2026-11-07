import type { Catalog } from '@chalecad/catalog';
import { bbox2, length2, type Vec2, type Vec3 } from '../geometry';
import type { Project } from '../schema/project';
import type { BuildingModel, SlabModel } from '../schema/results';
import { PieceSink, profileOf, uVariant } from './util';

const EDGE_TOL = 0.05;
const BLOCKING_SPAN_MIN = 3;
const UP: Vec3 = [0, 0, 1];

/** Há parede externa ou portante coincidindo com a borda (reta x = c ou y = c) ao longo de [lo, hi]? */
function supported(model: BuildingModel, axis: 0 | 1, c: number, lo: number, hi: number): boolean {
  const o = (1 - axis) as 0 | 1;
  return model.walls.some((w) => {
    if (w.kind === 'interior' && !w.loadBearing) return false;
    if (Math.abs(w.from[axis] - c) > EDGE_TOL || Math.abs(w.to[axis] - c) > EDGE_TOL) return false;
    const a = Math.min(w.from[o], w.to[o]);
    const b = Math.max(w.from[o], w.to[o]);
    return Math.min(b, hi) - Math.max(a, lo) > EDGE_TOL;
  });
}

/** Cortes de uma reta (coordenada `c` do eixo `perp`) com o polígono: pares [a, b] ao longo do outro eixo. */
function clip(poly: Vec2[], perp: 0 | 1, c: number): [number, number][] {
  const along = (1 - perp) as 0 | 1;
  const xs: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    if ((a[perp] - c) * (b[perp] - c) < 0) {
      const t = (c - a[perp]) / (b[perp] - a[perp]);
      xs.push(a[along] + t * (b[along] - a[along]));
    }
  }
  xs.sort((p, q) => p - q);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i]!, xs[i + 1]!]);
  return out;
}

export function generateMezzanines(model: BuildingModel, project: Project, catalog: Catalog, sink: PieceSink): void {
  const joist = profileOf(catalog, project.system.profiles.joist);
  const rimId = uVariant(catalog, joist.id);
  const s = project.system.studSpacing;
  for (const slab of model.slabs) {
    if (slab.kind === 'mezzanine') one(slab);
  }

  function one(slab: SlabModel): void {
    const poly = slab.polygon;
    const bb = bbox2(poly);
    const zc = slab.topZ - slab.thickness + joist.web / 2000;
    // spanAxis: eixo ao longo do qual a viga corre (0 = x, 1 = y)
    const ok = (axis: 0 | 1): boolean => {
      const o = (1 - axis) as 0 | 1;
      return (
        supported(model, axis, bb.min[axis], bb.min[o], bb.max[o]) &&
        supported(model, axis, bb.max[axis], bb.min[o], bb.max[o])
      );
    };
    const extent = (axis: 0 | 1) => bb.max[axis] - bb.min[axis];
    const okX = ok(0);
    const okY = ok(1);
    let spanAxis: 0 | 1;
    if (okX && okY) spanAxis = extent(0) <= extent(1) ? 0 : 1;
    else if (okX) spanAxis = 0;
    else if (okY) spanAxis = 1;
    else spanAxis = extent(0) <= extent(1) ? 0 : 1;
    const perp = (1 - spanAxis) as 0 | 1; // eixo onde as vigas se distribuem

    const pt = (a: number, p: number): Vec3 => {
      const xy: Vec2 = spanAxis === 0 ? [a, p] : [p, a];
      return [xy[0], xy[1], zc];
    };

    const lo = bb.min[perp];
    const hi = bb.max[perp];
    const positions: number[] = [];
    for (let k = 0; lo + k * s < hi - 0.05; k++) positions.push(lo + k * s);
    positions.push(hi);

    const spans: { c: number; a: number; b: number }[] = [];
    for (const c of positions) {
      const cc = c <= lo ? lo + 1e-6 : c >= hi ? hi - 1e-6 : c;
      for (const [a, b] of clip(poly, perp, cc)) {
        sink.add(slab.id, 'joist', joist.id, pt(a, c), pt(b, c), UP);
        spans.push({ c, a, b });
      }
    }

    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      if (length2(a, b) > 0) sink.add(slab.id, 'rim', rimId, [a[0], a[1], zc], [b[0], b[1], zc], UP);
    }

    // bloqueadores no meio do vão
    for (let i = 0; i + 1 < spans.length; i++) {
      const p = spans[i]!;
      const q = spans[i + 1]!;
      if (Math.abs(p.c - q.c) < 0.05) continue;
      const span = (p.b - p.a + (q.b - q.a)) / 2;
      if (span <= BLOCKING_SPAN_MIN) continue;
      const mid = ((p.a + p.b) / 2 + (q.a + q.b) / 2) / 2;
      sink.add(slab.id, 'blocking', project.system.profiles.wallTrack, pt(mid, p.c), pt(mid, q.c), UP);
    }
  }
}
