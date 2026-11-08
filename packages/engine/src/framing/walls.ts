import type { Catalog } from '@chalecad/catalog';
import { distToSegment, type Vec2, type Vec3 } from '../geometry';
import type { Project } from '../schema/project';
import type { BuildingModel, HostWall, ResolvedOpening } from '../schema/results';
import { PieceSink, POS_TOL, profileOf, subtractIntervals } from './util';

const STRAP = 'Fita70x0.95';
const ENCOUNTER_TOL = 0.05;
const X_BRACE_MIN = 1.2;
const GLAZED_STUD_SPACING = 1.2;
const EPS = 1e-9;
/** Montante mais curto que vale a pena gerar (ponta do triângulo entre águas). */
const MIN_STUD = 0.05;

/** Altura do contorno (v máximo) na coordenada local u. */
export function topAt(outline: Vec2[], u: number): number {
  let best = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    const du = b[0] - a[0];
    if (Math.abs(du) < EPS) continue;
    const t = (u - a[0]) / du;
    if (t < -1e-9 || t > 1 + 1e-9) continue;
    best = Math.max(best, a[1] + t * (b[1] - a[1]));
  }
  return best;
}

/**
 * Base do contorno (v mínimo) na coordenada u. Quase sempre 0; paredes de ponta dos anexos do A-frame têm um
 * trecho apoiado sobre a água (base inclinada).
 */
export function bottomAt(outline: Vec2[], u: number): number {
  let best = Infinity;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    const du = b[0] - a[0];
    if (du <= EPS) continue; // arestas de base andam em +u (anti-horário)
    const t = (u - a[0]) / du;
    if (t < -1e-9 || t > 1 + 1e-9) continue;
    best = Math.min(best, a[1] + t * (b[1] - a[1]));
  }
  return Number.isFinite(best) ? best : 0;
}

function outlineArea(outline: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}

export function generateWalls(
  model: BuildingModel,
  project: Project,
  catalog: Catalog,
  sink: PieceSink,
): void {
  const c = catalog.constants;
  const sys = project.system;
  const stud = profileOf(catalog, sys.profiles.wallStud);
  const s = sys.studSpacing;

  for (const w of model.walls) {
    const openings = model.openings.filter((o) => o.hostKind === 'wall' && o.hostId === w.id && o.valid);
    wall(w, openings);
  }

  function wall(w: HostWall, allOpenings: ResolvedOpening[]): void {
    const len = w.length;
    const dx = (w.to[0] - w.from[0]) / len;
    const dy = (w.to[1] - w.from[1]) / len;
    const normal: Vec3 = [-dy, dx, 0];
    const P = (u: number, v: number): Vec3 => [w.from[0] + dx * u, w.from[1] + dy * u, w.baseZ + v];
    const glazed = w.assemblyId === 'gable_glazed';
    const openings = glazed ? [] : allOpenings;
    // empenas podem ter montante próprio (reforço só onde precisa); a guia acompanha o montante
    const own = w.kind === 'gable' && sys.profiles.gableStud ? profileOf(catalog, sys.profiles.gableStud) : stud;
    const ownTrack = catalog.profiles.find((p) => p.family === 'U' && p.web === own.web && p.thickness === own.thickness);
    const trackId = own === stud ? sys.profiles.wallTrack : (ownTrack?.id ?? sys.profiles.wallTrack);
    const studId = own.id;
    const fl = own.flange / 1000;
    const webM = own.web / 1000;
    const exterior = w.exteriorSide !== null;

    // --- Painéis ---------------------------------------------------------
    const nPanels = Math.max(1, Math.ceil(len / c.lsf.maxPanelLength - 1e-9));
    const bounds: number[] = [];
    for (let k = 0; k <= nPanels; k++) bounds.push((len * k) / nPanels);
    const panels: [number, number][] = [];
    for (let k = 0; k < nPanels; k++) panels.push([bounds[k]!, bounds[k + 1]!]);

    // --- Guia inferior (interrompida em portas) -------------------------------
    const doorGaps: [number, number][] = openings
      .filter((o) => (o.type === 'door' || o.type === 'sliding_door') && o.v0 <= 1e-6)
      .map((o) => [o.u0, o.u1]);
    const flatBase = w.outline.every((a, i) => {
      const b = w.outline[(i + 1) % w.outline.length]!;
      return b[0] - a[0] <= EPS || (Math.abs(a[1]) <= EPS && Math.abs(b[1]) <= EPS);
    });
    if (flatBase) {
      for (const [pa, pb] of panels) {
        for (const [a, b] of subtractIntervals(pa, pb, doorGaps)) {
          sink.add(w.id, 'track_bottom', trackId, P(a, 0), P(b, 0), normal);
        }
      }
    } else {
      // base em mais de um trecho (parte apoiada na água): uma guia por aresta de base, por painel
      for (let i = 0; i < w.outline.length; i++) {
        const a = w.outline[i]!;
        const b = w.outline[(i + 1) % w.outline.length]!;
        if (b[0] - a[0] <= EPS) continue;
        const vAt = (u: number) => a[1] + ((u - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
        for (const [pa, pb] of panels) {
          const lo = Math.max(a[0], pa);
          const hi = Math.min(b[0], pb);
          if (hi - lo <= EPS) continue;
          const flat = Math.abs(a[1]) <= EPS && Math.abs(b[1]) <= EPS;
          for (const [x, y] of flat ? subtractIntervals(lo, hi, doorGaps) : [[lo, hi] as [number, number]]) {
            sink.add(w.id, 'track_bottom', trackId, P(x, vAt(x)), P(y, vAt(y)), normal);
          }
        }
      }
    }

    // --- Guia superior (arestas de topo do contorno, por painel) ---------------
    for (let i = 0; i < w.outline.length; i++) {
      const a = w.outline[i]!;
      const b = w.outline[(i + 1) % w.outline.length]!;
      if (b[0] - a[0] >= -EPS) continue; // arestas de topo andam em -u (anti-horário)
      const [ua, va, ub, vb] = [b[0], b[1], a[0], a[1]]; // ordena em +u
      const vAt = (u: number) => va + ((u - ua) / (ub - ua)) * (vb - va);
      for (const [pa, pb] of panels) {
        const lo = Math.max(ua, pa);
        const hi = Math.min(ub, pb);
        if (hi - lo > EPS) sink.add(w.id, 'track_top', trackId, P(lo, vAt(lo)), P(hi, vAt(hi)), normal);
      }
    }

    // --- Posições de montantes -------------------------------------------------
    const step = glazed ? GLAZED_STUD_SPACING : s;
    const pos: number[] = [];
    const addPos = (u: number): void => {
      if (u < -POS_TOL || u > len + POS_TOL) return;
      const uu = Math.min(Math.max(u, 0), len);
      if (!pos.some((x) => Math.abs(x - uu) < POS_TOL)) pos.push(uu);
    };
    for (let k = 0; k * step < len - POS_TOL; k++) addPos(k * step);
    addPos(len);
    const doubles: number[] = [];
    for (let k = 1; k < nPanels; k++) {
      addPos(bounds[k]!);
      doubles.push(bounds[k]! + fl);
    }
    if (!glazed) {
      // encontros de paredes internas
      for (const o of model.walls) {
        if (o.id === w.id || o.kind !== 'interior') continue;
        if (w.kind === 'interior' && w.level !== o.level) continue;
        for (const p of [o.from, o.to]) {
          if (distToSegment(p, w.from, w.to) > ENCOUNTER_TOL) continue;
          if (o.baseZ + EPS < w.baseZ) continue;
          addPos((p[0] - w.from[0]) * dx + (p[1] - w.from[1]) * dy);
        }
      }
    }
    pos.sort((a, b) => a - b);

    const zone = (o: ResolvedOpening): [number, number] => [o.u0 - 1.5 * fl - 1e-6, o.u1 + 1.5 * fl + 1e-6];
    const inOpening = (u: number): boolean =>
      openings.some((o) => {
        const [a, b] = zone(o);
        return u >= a && u <= b;
      });
    const vertical = (role: 'stud' | 'stud_corner' | 'king' | 'jack', u: number, v0: number, v1: number): void => {
      sink.add(w.id, role, studId, P(u, v0), P(u, v1), normal);
    };

    const members: number[] = []; // u de todo elemento vertical (para os bloqueadores)
    for (const u of [...pos, ...doubles]) {
      if (inOpening(u)) continue;
      const v0 = bottomAt(w.outline, u);
      const v1 = topAt(w.outline, u);
      if (v1 - v0 < MIN_STUD) continue;
      vertical('stud', u, v0, v1);
      members.push(u);
    }
    if (exterior && !glazed) {
      for (const u of [fl, len - fl]) {
        const v0 = bottomAt(w.outline, u);
        const v1 = topAt(w.outline, u);
        if (v1 - v0 < MIN_STUD) continue;
        vertical('stud_corner', u, v0, v1);
        members.push(u);
      }
    }

    // --- Aberturas -----------------------------------------------------------------
    for (const o of openings) {
      const kingL = Math.max(o.u0 - 1.5 * fl, 0);
      const kingR = Math.min(o.u1 + 1.5 * fl, len);
      const jackL = Math.max(o.u0 - 0.5 * fl, 0);
      const jackR = Math.min(o.u1 + 0.5 * fl, len);
      vertical('king', kingL, 0, topAt(w.outline, kingL));
      vertical('king', kingR, 0, topAt(w.outline, kingR));
      vertical('jack', jackL, 0, o.v1);
      vertical('jack', jackR, 0, o.v1);
      members.push(kingL, kingR, jackL, jackR);

      // verga em caixa: 2 Ue com a alma vertical, uma de cada lado do plano da parede
      const bearing = c.lsf.headerBearing;
      const hu0 = Math.max(o.u0 - bearing, 0);
      const hu1 = Math.min(o.u1 + bearing, len);
      for (const side of [-1, 1]) {
        const off = (side * fl) / 2;
        const a = P(hu0, o.v1 + webM / 2);
        const b = P(hu1, o.v1 + webM / 2);
        sink.add(w.id, 'header', studId, [a[0] + normal[0] * off, a[1] + normal[1] * off, a[2]], [b[0] + normal[0] * off, b[1] + normal[1] * off, b[2]], [0, 0, 1]);
      }
      const inside = [...pos, ...doubles].filter((u) => u > o.u0 && u < o.u1);
      for (const u of inside) sink.add(w.id, 'cripple', studId, P(u, o.v1 + webM), P(u, topAt(w.outline, u)), normal);
      if (o.v0 > 1e-6) {
        sink.add(w.id, 'sill', trackId, P(o.u0, o.v0), P(o.u1, o.v0), normal);
        for (const u of inside) sink.add(w.id, 'cripple', studId, P(u, 0), P(u, o.v0), normal);
      }
    }

    if (glazed) return;

    // --- Bloqueadores e fitas ---------------------------------------------------------
    const avgH = outlineArea(w.outline) / len;
    const blocked = (u: number, v: number): boolean =>
      openings.some((o) => u > o.u0 && u < o.u1 && v >= o.v0 - 1e-6 && v <= o.v1 + webM + 1e-6);

    const rows = Math.floor(avgH / c.lsf.blockingSpacing + 1e-9);
    const sorted = [...new Set(members.map((u) => Math.round(u * 1e6) / 1e6))].sort((a, b) => a - b);
    for (let r = 1; r <= rows; r++) {
      const v = (avgH * r) / (rows + 1);
      for (let i = 0; i + 1 < sorted.length; i++) {
        const a = sorted[i]!;
        const b = sorted[i + 1]!;
        const mid = (a + b) / 2;
        if (b - a < 0.1 || blocked(mid, v) || v > topAt(w.outline, mid) - 0.05 || v < bottomAt(w.outline, mid) + 0.05) continue;
        sink.add(w.id, 'blocking', trackId, P(a, v), P(b, v), normal);
      }
    }

    // fita horizontal a meia altura
    const vMid = avgH / 2;
    const hCuts: [number, number][] = openings
      .filter((o) => vMid >= o.v0 - 1e-6 && vMid <= o.v1 + webM + 1e-6)
      .map((o) => [o.u0, o.u1]);
    for (const [pa, pb] of panels) {
      for (const [a, b] of subtractIntervals(pa, pb, hCuts)) {
        if (vMid <= Math.min(topAt(w.outline, a), topAt(w.outline, b)) + EPS && vMid >= Math.max(bottomAt(w.outline, a), bottomAt(w.outline, b)) - EPS) {
          sink.add(w.id, 'strap', STRAP, P(a, vMid), P(b, vMid), normal);
        }
      }
    }

    // fitas em X nos painéis externos sem abertura
    if (sys.bracing === 'strap' && exterior) {
      for (const [pa, pb] of panels) {
        if (pb - pa < X_BRACE_MIN) continue;
        if (openings.some((o) => o.u0 < pb && o.u1 > pa)) continue;
        const h = Math.min(topAt(w.outline, pa + fl), topAt(w.outline, pb - fl));
        const b0 = Math.max(bottomAt(w.outline, pa + fl), bottomAt(w.outline, pb - fl));
        if (h - b0 < 0.5) continue;
        sink.add(w.id, 'strap', STRAP, P(pa + fl, b0), P(pb - fl, h), normal);
        sink.add(w.id, 'strap', STRAP, P(pb - fl, b0), P(pa + fl, h), normal);
      }
    }
  }
}
