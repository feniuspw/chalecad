import type { Catalog } from '@chalecad/catalog';
import { add3, cross3, dot3, pointInPolygon, scale3, type Vec2, type Vec3 } from '../geometry';
import type { Project, TypologyKind } from '../schema/project';
import type { BuildingModel, RoofPlane } from '../schema/results';
import { slopedFrame } from '../model/sloped';
import { annexGeometry } from '../model/annex';
import { complexFramers, framePlane } from './complex';
import { PieceSink, profileOf, rafterSpacingOf, uVariant } from './util';

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
  // Estrutura alinhada (in-line framing): caibros sobre os montantes, nunca mais espaçados que o catálogo permite.
  // No A-frame as águas apoiam no radier e podem ter espaçamento próprio; os anexos seguem os montantes.
  const spacing = rafterSpacingOf(project, catalog);
  const annexSpacing = Math.min(c.roof.rafterSpacing, sys.studSpacing);
  for (let k = 0; k * spacing < L - 0.02; k++) ls.push(k * spacing);
  ls.push(L);

  // Anexos do A-frame: recorte na água (de l0 a l1, da base até vn) com caibros de borda inteiros.
  const annexes = t.kind === 'a_frame' ? annexGeometry(t) : [];
  const cut = new Map<string, { l0: number; l1: number; vn: number }>();
  for (const g of annexes) {
    const p = planes.find((x) => x.id === g.hostPlaneId);
    if (!p) continue;
    cut.set(p.id, { l0: g.y0, l1: g.y1, vn: g.reach / Math.cos((p.slopeDeg * Math.PI) / 180) });
  }

  for (const p of planes) {
    if (p.id.startsWith('annex-')) continue;
    const normal = cross3(p.uAxis, p.vAxis);
    const n = cut.get(p.id);
    const pls = n ? [...new Set([...ls, n.l0, n.l1])].sort((a, b) => a - b) : ls;
    for (const l of pls) {
      const v0 = n && l > n.l0 + 0.01 && l < n.l1 - 0.01 ? n.vn : 0;
      sink.add(p.id, 'rafter', rafter.id, pointOf(p, l, v0), pointOf(p, l, p.vLength), normal);
    }
    const vs: number[] = [];
    for (let k = 0; k * c.roof.purlinSpacing < p.vLength - 0.02; k++) vs.push(k * c.roof.purlinSpacing);
    vs.push(p.vLength);
    if (n) vs.push(n.vn);
    for (const v of [...new Set(vs)].sort((a, b) => a - b)) {
      if (n && v < n.vn - 1e-6) {
        // terça interrompida no recorte
        for (const [l0, l1] of [[-rake, n.l0], [n.l1, L + rake]] as const) {
          if (l1 - l0 > 0.02) sink.add(p.id, 'purlin', sys.profiles.purlin, pointOf(p, l0, v), pointOf(p, l1, v), normal);
        }
        continue;
      }
      const a = add3(p.origin, scale3(p.vAxis, v));
      sink.add(p.id, 'purlin', sys.profiles.purlin, a, add3(a, scale3(p.uAxis, p.uLength)), normal);
    }
    // travessa (verga) no topo do recorte, onde chegam os caibros do anexo
    if (n) sink.add(p.id, 'header', ridgeId, pointOf(p, n.l0, n.vn), pointOf(p, n.l1, n.vn), normal);
  }

  for (const g of annexes) {
    const p = planes.find((x) => x.id === g.roofPlane.id);
    if (!p) continue;
    const e = t.kind === 'a_frame' ? (t.annexes.find((a) => a.side === g.side)?.eave ?? 0) : 0;
    const len = g.y1 - g.y0;
    const cos = Math.cos((p.slopeDeg * Math.PI) / 180);
    const outside = g.width + e; // trecho horizontal da água fora da base do A-frame
    framePlane(
      p,
      {
        ridgeDir: [0, 1, 0],
        rake: e,
        purlinCuts: (v) => (v * cos > outside + 1e-6 ? [[-e, 0], [len, len + e]] : []),
      },
      catalog,
      annexSpacing,
      sys.profiles.purlin,
      rafter.id,
      sink,
    );
  }
  const mainPlanes = planes.filter((p) => !p.id.startsWith('annex-'));

  // cumeeira
  const first = mainPlanes[0]!;
  const r0 = add3(first.origin, scale3(first.vAxis, first.vLength));
  sink.add(first.id, 'ridge', ridgeId, r0, add3(r0, scale3(first.uAxis, first.uLength)), UP);

  // travessas (par de caibros)
  const second = mainPlanes[1];
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

/**
 * Meia-água (`shed`): caibros do lado baixo ao alto, alinhados aos montantes, terças e viga de topo.
 * Telhado plano (`flat_roof`): vigas de cobertura niveladas sobre as paredes no menor vão e cartolas
 * perpendiculares seguindo a água (a diferença de cota da queda é vencida pelas cartolas/calços, não modelados).
 */
const slopedFramer: RoofFramer = (model, project, catalog, sink) => {
  const c = catalog.constants;
  const sys = project.system;
  const t = project.typology;
  const plane = model.roofPlanes[0];
  if (!plane || (t.kind !== 'shed' && t.kind !== 'flat_roof')) return;
  const f = slopedFrame(t.kind === 'shed' ? t.highSide : 'front', t.width, t.depth);
  const eave = t.kind === 'shed' ? t.eave : 0;
  const normal = cross3(plane.uAxis, plane.vAxis);
  const spacing = Math.min(c.roof.rafterSpacing, sys.studSpacing);
  const sgn = dot3(plane.uAxis, [f.lDir[0], f.lDir[1], 0]) > 0 ? 1 : -1;
  /** Ponto na água: l ao longo do beiral (0 = canto da parede), v ao longo da água a partir do beiral. */
  const pointOf = (l: number, v: number): Vec3 => {
    const u = sgn > 0 ? eave + l : plane.uLength - eave - l;
    return add3(add3(plane.origin, scale3(plane.uAxis, u)), scale3(plane.vAxis, v));
  };
  const steps = (len: number, step: number): number[] => {
    const out: number[] = [];
    for (let k = 0; k * step < len - 0.02; k++) out.push(k * step);
    out.push(len);
    return out;
  };

  if (t.kind === 'shed') {
    const rafter = profileOf(catalog, sys.profiles.rafter);
    for (const l of steps(f.L, spacing)) {
      sink.add(plane.id, 'rafter', rafter.id, pointOf(l, 0), pointOf(l, plane.vLength), normal);
    }
    for (const v of steps(plane.vLength, c.roof.purlinSpacing)) {
      const a = add3(plane.origin, scale3(plane.vAxis, v));
      sink.add(plane.id, 'purlin', sys.profiles.purlin, a, add3(a, scale3(plane.uAxis, plane.uLength)), normal);
    }
    const top = add3(plane.origin, scale3(plane.vAxis, plane.vLength));
    sink.add(plane.id, 'ridge', uVariant(catalog, rafter.id), top, add3(top, scale3(plane.uAxis, plane.uLength)), UP);
    return;
  }

  // flat_roof: vigas no menor vão (nível das paredes), cartolas perpendiculares.
  const joist = sys.profiles.joist;
  const z = t.wallHeight;
  const alongX = t.width <= t.depth;
  const span = alongX ? t.width : t.depth;
  const run = alongX ? t.depth : t.width;
  for (const p of steps(run, spacing)) {
    const a: Vec3 = alongX ? [0, p, z] : [p, 0, z];
    const b: Vec3 = alongX ? [span, p, z] : [p, span, z];
    sink.add(plane.id, 'joist', joist, a, b, UP);
  }
  if (alongX) {
    // vigas em x: cartolas descem a água (direção v) a cada purlinSpacing ao longo de x
    for (const l of steps(f.L, c.roof.purlinSpacing)) {
      sink.add(plane.id, 'purlin', sys.profiles.purlin, pointOf(l, 0), pointOf(l, plane.vLength), normal);
    }
  } else {
    for (const v of steps(plane.vLength, c.roof.purlinSpacing)) {
      const a = add3(plane.origin, scale3(plane.vAxis, v));
      sink.add(plane.id, 'purlin', sys.profiles.purlin, a, add3(a, scale3(plane.uAxis, plane.uLength)), normal);
    }
  }
};

/** Tipologias sem framer não geram peças de cobertura (sem erro). */
export const framers: Partial<Record<TypologyKind, RoofFramer>> = {
  gable_mezzanine: twoPlaneFramer,
  a_frame: twoPlaneFramer,
  shed: slopedFramer,
  flat_roof: slopedFramer,
  ...complexFramers,
};
