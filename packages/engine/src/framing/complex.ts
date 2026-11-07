import type { Catalog } from '@chalecad/catalog';
import { add3, cross3, dot3, pointInPolygon, scale3, type Vec2, type Vec3 } from '../geometry';
import { combinedGeometry } from '../model/combined';
import { gambrelGeometry } from '../model/gambrel';
import type { RoofPlane } from '../schema/results';
import type { RoofFramer } from './roof';
import { PieceSink, subtractIntervals, uVariant, profileOf } from './util';

const UP: Vec3 = [0, 0, 1];
const COLLAR_EVERY = 2;

const steps = (len: number, step: number): number[] => {
  const out: number[] = [];
  for (let k = 0; k * step < len - 0.02; k++) out.push(k * step);
  out.push(len);
  return out;
};

interface PlaneOpts {
  /** Direção da cumeeira (eixo l). */
  ridgeDir: Vec3;
  rake: number;
  /** Início do caibro (v) na posição l; padrão 0 (beiral). */
  rafterV0?: (l: number) => number;
  /** Trechos de l removidos da terça na posição v (entalhe do rincão). */
  purlinCuts?: (v: number) => [number, number][];
  /** Posições l dos caibros; padrão: de 0 a L a cada espaçamento. */
  ls?: number[];
}

/** Caibros e terças de uma água retangular em coordenadas (l ao longo da cumeeira, v subindo). */
export function framePlane(p: RoofPlane, o: PlaneOpts, catalog: Catalog, spacing: number, purlinId: string, rafterId: string, sink: PieceSink) {
  const c = catalog.constants;
  const sgn = dot3(p.uAxis, o.ridgeDir) > 0 ? 1 : -1;
  const L = p.uLength - 2 * o.rake;
  const pointOf = (l: number, v: number): Vec3 => {
    const u = sgn > 0 ? o.rake + l : p.uLength - o.rake - l;
    return add3(add3(p.origin, scale3(p.uAxis, u)), scale3(p.vAxis, v));
  };
  const normal = cross3(p.uAxis, p.vAxis);
  for (const l of o.ls ?? steps(L, spacing)) {
    sink.add(p.id, 'rafter', rafterId, pointOf(l, o.rafterV0?.(l) ?? 0), pointOf(l, p.vLength), normal);
  }
  for (const v of steps(p.vLength, c.roof.purlinSpacing)) {
    const a = add3(p.origin, scale3(p.vAxis, v));
    const cuts = o.purlinCuts?.(v) ?? [];
    // cortes em l -> u
    const uCuts: [number, number][] = cuts.map(([l0, l1]) =>
      sgn > 0 ? [o.rake + l0, o.rake + l1] : [p.uLength - o.rake - l1, p.uLength - o.rake - l0],
    );
    for (const [u0, u1] of subtractIntervals(0, p.uLength, uCuts)) {
      sink.add(p.id, 'purlin', purlinId, add3(a, scale3(p.uAxis, u0)), add3(a, scale3(p.uAxis, u1)), normal);
    }
  }
  return pointOf;
}

/**
 * Gambrel: caibros quebrados (um segmento por água, inferior e superior), terças por água, cumeeira e
 * travessas (collar_tie) na quebra, exceto onde um mezanino no nível da quebra já amarra os pares.
 */
const gambrelFramer: RoofFramer = (model, project, catalog, sink) => {
  const t = project.typology;
  if (t.kind !== 'gambrel') return;
  const sys = project.system;
  const rafter = profileOf(catalog, sys.profiles.rafter);
  const spacing = Math.min(catalog.constants.roof.rafterSpacing, sys.studSpacing);
  const ridgeDir: Vec3 = project.roof.ridgeAxis === 'width' ? [1, 0, 0] : [0, 1, 0];
  const g = gambrelGeometry(t, project.roof.ridgeAxis);
  const byId = new Map(model.roofPlanes.map((p) => [p.id, p]));
  const pts = new Map<string, (l: number, v: number) => Vec3>();
  const L = (project.roof.ridgeAxis === 'width' ? t.width : t.depth);
  const ls = steps(L, spacing);
  for (const id of ['roof-a', 'roof-a2', 'roof-b', 'roof-b2']) {
    const p = byId.get(id);
    if (!p) continue;
    pts.set(id, framePlane(p, { ridgeDir, rake: t.rake, ls }, catalog, spacing, sys.profiles.purlin, rafter.id, sink));
  }
  const upA = byId.get('roof-a2');
  if (upA) {
    const r0 = add3(upA.origin, scale3(upA.vAxis, upA.vLength));
    sink.add(upA.id, 'ridge', uVariant(catalog, rafter.id), r0, add3(r0, scale3(upA.uAxis, upA.uLength)), UP);
  }
  const lowA = byId.get('roof-a');
  const lowB = byId.get('roof-b');
  const pa = pts.get('roof-a');
  const pb = pts.get('roof-b');
  if (lowA && lowB && pa && pb) {
    const mezz = model.slabs.filter((s) => s.kind === 'mezzanine');
    ls.forEach((l, k) => {
      if (k % COLLAR_EVERY !== 0) return;
      const a = pa(l, lowA.vLength);
      const b = pb(l, lowB.vLength);
      const mid: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      // mezanino no nível da quebra amarra o par de caibros: sem travessa
      if (mezz.some((s) => Math.abs(s.topZ - g.breakHeight) < 0.4 && pointInPolygon(mid, s.polygon, 1e-6))) return;
      sink.add(lowA.id, 'collar_tie', rafter.id, a, b, UP);
    });
  }
};

/**
 * Módulo combinado L/T: volume principal em duas águas (caibros do fundo encurtados no entalhe do rincão),
 * ala em duas águas com caibros que partem do beiral e terminam no rincão, cumeeiras e terças recortadas.
 */
const combinedFramer: RoofFramer = (model, project, catalog, sink) => {
  const t = project.typology;
  if (t.kind !== 'combined') return;
  const g = combinedGeometry(t);
  const sys = project.system;
  const rafter = profileOf(catalog, sys.profiles.rafter);
  const ridgeId = uVariant(catalog, rafter.id);
  const spacing = Math.min(catalog.constants.roof.rafterSpacing, sys.studSpacing);
  const planes = new Map(model.roofPlanes.map((p) => [p.id, p]));
  const e = t.eave;
  const D = t.depth;
  const { x0, x1 } = g.wingRect;
  const wW = x1 - x0;
  const xm = (x0 + x1) / 2;
  const cos = Math.cos((t.roofPitchDeg * Math.PI) / 180);
  const mezz = model.slabs.filter((s) => s.kind === 'mezzanine').map((s) => s.polygon);

  // --- Volume principal ---
  const a = planes.get('roof-a');
  const b = planes.get('roof-b');
  const ls = steps(t.width, spacing);
  let pa: ((l: number, v: number) => Vec3) | undefined;
  let pb: ((l: number, v: number) => Vec3) | undefined;
  if (a) pa = framePlane(a, { ridgeDir: [1, 0, 0], rake: t.rake, ls }, catalog, spacing, sys.profiles.purlin, rafter.id, sink);
  if (b) {
    pb = framePlane(
      b,
      {
        ridgeDir: [1, 0, 0],
        rake: t.rake,
        ls,
        // valor v do vale sobre o caibro em x = l: (D + e - yv) / cos, yv = D - wW/2 + |x - xm|
        rafterV0: (l) => {
          const d = wW / 2 + e - Math.abs(l - xm);
          return l > x0 - e && l < x1 + e && d > 0 ? d / cos : 0;
        },
        purlinCuts: (v) => {
          // y da terça = D + e - v cos; entalhe com meia-largura hw = y - (D - wW/2)
          const hw = D + e - v * cos - (D - wW / 2);
          return hw > 0 ? [[xm - hw, xm + hw]] : [];
        },
      },
      catalog,
      spacing,
      sys.profiles.purlin,
      rafter.id,
      sink,
    );
  }
  if (a) {
    const r0 = add3(a.origin, scale3(a.vAxis, a.vLength));
    sink.add(a.id, 'ridge', ridgeId, r0, add3(r0, scale3(a.uAxis, a.uLength)), UP);
  }
  if (a && b && pa && pb) {
    ls.forEach((l, k) => {
      if (k % COLLAR_EVERY !== 0) return;
      if (l > x0 - e - 0.05 && l < x1 + e + 0.05) return; // sob a ala: o rincão e a ala amarram
      const p = pa(l, a.vLength * (2 / 3));
      const q = pb(l, b.vLength * (2 / 3));
      const mid: Vec2 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      if (mezz.some((poly) => pointInPolygon(mid, poly, 1e-6))) return;
      sink.add(a.id, 'collar_tie', rafter.id, p, q, UP);
    });
  }

  // --- Ala ---
  const wa = planes.get('wing-roof-a');
  const wb = planes.get('wing-roof-b');
  const yB = D + t.wing.depth + t.rake;
  for (const [p, isA] of [[wa, true], [wb, false]] as const) {
    if (!p) continue;
    const normal = cross3(p.uAxis, p.vAxis);
    // u -> y: plano a: u cresce para -y a partir de yB; plano b: u cresce para +y a partir da frente do retângulo
    const yOf = (u: number) => (isA ? yB - u : p.origin[1] + u);
    for (const u of steps(p.uLength, spacing)) {
      const y = yOf(u);
      // distância horizontal do beiral ao rincão neste y: D + e - y (limitada ao vão do plano)
      const run = Math.min(Math.max(D + e - y, 0), wW / 2 + e);
      if (run >= wW / 2 + e - 0.02) continue; // chegou ao ápice do rincão
      const at = (v: number) => add3(add3(p.origin, scale3(p.uAxis, u)), scale3(p.vAxis, v));
      sink.add(p.id, 'rafter', rafter.id, at(run / cos), at(p.vLength), normal);
    }
    for (const v of steps(p.vLength, catalog.constants.roof.purlinSpacing)) {
      // x da terça: beiral + v cos; o rincão limita a terça em y >= D + e - (x distância ao beiral)
      const run = v * cos; // distância horizontal do beiral
      const yMin = D + e - run; // y do rincão nessa distância
      const base = add3(p.origin, scale3(p.vAxis, v));
      // intervalo de u disponível: y de yMin até yB
      const uStart = isA ? 0 : Math.max(0, yMin - p.origin[1]);
      const uEnd = isA ? Math.min(p.uLength, yB - yMin) : p.uLength;
      if (uEnd - uStart < 0.02) continue;
      sink.add(p.id, 'purlin', sys.profiles.purlin, add3(base, scale3(p.uAxis, uStart)), add3(base, scale3(p.uAxis, uEnd)), normal);
    }
  }
  // cumeeira da ala: do ápice do rincão até a empena
  if (wa) {
    const top = add3(wa.origin, scale3(wa.vAxis, wa.vLength));
    sink.add(wa.id, 'ridge', ridgeId, top, add3(top, scale3(wa.uAxis, wa.uLength)), UP);
  }
};

export const complexFramers = { gambrel: gambrelFramer, combined: combinedFramer };
