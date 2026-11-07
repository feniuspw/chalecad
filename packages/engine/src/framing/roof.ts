import type { Catalog } from '@chalecad/catalog';
import { add3, cross3, dot3, pointInPolygon, scale3, type Vec2, type Vec3 } from '../geometry';
import type { Project, TypologyKind } from '../schema/project';
import type { BuildingModel, RoofPlane } from '../schema/results';
import { PieceSink, profileOf, uVariant } from './util';

export type RoofFramer = (model: BuildingModel, project: Project, catalog: Catalog, sink: PieceSink) => void;

const UP: Vec3 = [0, 0, 1];
const COLLAR_EVERY = 2;
/** Fração do comprimento do caibro (do beiral/base à cumeeira) onde fica a travessa. */
const COLLAR_AT = 2 / 3;

/** Cobertura de duas águas simétricas (gable_mezzanine e a_frame). */
const twoPlaneFramer: RoofFramer = (model, project, catalog, sink) => {
  const c = catalog.constants;
  const sys = project.system;
  const rafter = profileOf(catalog, sys.profiles.rafter);
  const ridgeId = uVariant(catalog, rafter.id);
  const t = project.typology;
  if (t.kind !== 'gable_mezzanine' && t.kind !== 'a_frame') return;
  const rake = t.rake;
  const ridgeDir: Vec3 = project.roof.ridgeAxis === 'width' && t.kind === 'gable_mezzanine' ? [1, 0, 0] : [0, 1, 0];
  const planes = model.roofPlanes;
  if (planes.length === 0) return;
  const mezz = model.slabs.filter((s) => s.kind === 'mezzanine').map((s) => s.polygon);

  const pointOf = (p: RoofPlane, l: number, v: number): Vec3 => {
    const sgn = dot3(p.uAxis, ridgeDir) > 0 ? 1 : -1;
    const u = sgn > 0 ? rake + l : p.uLength - rake - l;
    return add3(add3(p.origin, scale3(p.uAxis, u)), scale3(p.vAxis, v));
  };

  const ref = planes[0]!;
  const L = ref.uLength - 2 * rake;
  const ls: number[] = [];
  for (let k = 0; k * c.roof.rafterSpacing < L - 0.02; k++) ls.push(k * c.roof.rafterSpacing);
  ls.push(L);

  for (const p of planes) {
    const normal = cross3(p.uAxis, p.vAxis);
    for (const l of ls) {
      sink.add(p.id, 'rafter', rafter.id, pointOf(p, l, 0), pointOf(p, l, p.vLength), normal);
    }
    const vs: number[] = [];
    for (let k = 0; k * c.roof.purlinSpacing < p.vLength - 0.02; k++) vs.push(k * c.roof.purlinSpacing);
    vs.push(p.vLength);
    for (const v of vs) {
      const a = add3(p.origin, scale3(p.vAxis, v));
      sink.add(p.id, 'purlin', sys.profiles.purlin, a, add3(a, scale3(p.uAxis, p.uLength)), normal);
    }
  }

  // cumeeira
  const first = planes[0]!;
  const r0 = add3(first.origin, scale3(first.vAxis, first.vLength));
  sink.add(first.id, 'ridge', ridgeId, r0, add3(r0, scale3(first.uAxis, first.uLength)), UP);

  // travessas (par de caibros)
  const second = planes[1];
  if (second) {
    ls.forEach((l, k) => {
      if (k % COLLAR_EVERY !== 0) return;
      const a = pointOf(first, l, first.vLength * COLLAR_AT);
      const b = pointOf(second, l, second.vLength * COLLAR_AT);
      const mid: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (mezz.some((poly) => pointInPolygon(mid, poly, 1e-6))) return;
      sink.add(first.id, 'collar_tie', rafter.id, a, b, UP);
    });
  }
};

/** Tipologias sem framer não geram peças de cobertura (sem erro). */
export const framers: Partial<Record<TypologyKind, RoofFramer>> = {
  gable_mezzanine: twoPlaneFramer,
  a_frame: twoPlaneFramer,
};
