/**
 * Edição de paredes na planta (puro, sem React nem three). Tudo opera sobre dados JSON do projeto:
 * funções que devolvem mudanças (`WallChange`) não mutam; as que recebem `draft` rodam dentro de `update(...)`.
 */
import type { Wall } from '@chalecad/engine';
import { closestOnSegment, dist, mid, pointInPolygon, polygonArea, round, sub, unit, type V2 } from './geom';

/** Pontas a menos disto (m) estão ligadas. */
export const JOIN_TOL = 0.02;
export const MIN_WALL = 0.1;
export const MIN_RECT_SIDE = 0.3;

export interface SegLike {
  id?: string;
  from: V2;
  to: V2;
}

export interface WallChange {
  id: string;
  from: V2;
  to: V2;
}

const r3 = (p: V2): V2 => [round(p[0], 3), round(p[1], 3)];
const same = (a: V2, b: V2, tol = JOIN_TOL) => dist(a, b) <= tol;
const cross = (a: V2, b: V2) => a[0] * b[1] - a[1] * b[0];
const v2 = (p: readonly number[]): V2 => [p[0]!, p[1]!];

// ---------------------------------------------------------------------------
// Retângulo
// ---------------------------------------------------------------------------

/** Trechos [u0,u1] do segmento a->b já cobertos por paredes colineares existentes. */
function coveredIntervals(a: V2, b: V2, existing: SegLike[]): [number, number][] {
  const len = dist(a, b);
  const u = unit(sub(b, a));
  const out: [number, number][] = [];
  for (const s of existing) {
    const f = v2(s.from);
    const t = v2(s.to);
    const df = Math.abs(cross(u, sub(f, a)));
    const dt = Math.abs(cross(u, sub(t, a)));
    if (df > JOIN_TOL || dt > JOIN_TOL) continue;
    const pf = (f[0] - a[0]) * u[0] + (f[1] - a[1]) * u[1];
    const pt = (t[0] - a[0]) * u[0] + (t[1] - a[1]) * u[1];
    const lo = Math.max(0, Math.min(pf, pt));
    const hi = Math.min(len, Math.max(pf, pt));
    if (hi - lo > 1e-6) out.push([lo, hi]);
  }
  return out.sort((x, y) => x[0] - y[0]);
}

/** Partes do segmento a->b não cobertas por `existing`. Trechos menores que MIN_WALL são descartados. */
export function uncoveredParts(a: V2, b: V2, existing: SegLike[]): { from: V2; to: V2 }[] {
  const len = dist(a, b);
  if (len < 1e-6) return [];
  const u = unit(sub(b, a));
  const at = (d: number): V2 => r3([a[0] + u[0] * d, a[1] + u[1] * d]);
  const gaps: [number, number][] = [];
  let cursor = 0;
  for (const [lo, hi] of coveredIntervals(a, b, existing)) {
    if (lo - cursor > MIN_WALL - 1e-9) gaps.push([cursor, lo]);
    cursor = Math.max(cursor, hi);
  }
  if (len - cursor > MIN_WALL - 1e-9) gaps.push([cursor, len]);
  return gaps.map(([lo, hi]) => ({ from: lo === 0 ? r3(a) : at(lo), to: hi === len ? r3(b) : at(hi) }));
}

/** Cantos do retângulo (anti-horário) entre dois pontos opostos. */
export function rectCorners(a: V2, b: V2): V2[] {
  const x0 = Math.min(a[0], b[0]);
  const x1 = Math.max(a[0], b[0]);
  const y0 = Math.min(a[1], b[1]);
  const y1 = Math.max(a[1], b[1]);
  return [r3([x0, y0]), r3([x1, y0]), r3([x1, y1]), r3([x0, y1])];
}

/**
 * Paredes novas de um retângulo: as 4 arestas, sem duplicar o que já existe (paredes colineares e sobrepostas).
 * Arestas parcialmente cobertas geram só o trecho que falta. Lados menores que 30 cm: nenhuma parede.
 */
export function rectWalls(existing: SegLike[], a: V2, b: V2): { from: V2; to: V2 }[] {
  if (Math.abs(a[0] - b[0]) < MIN_RECT_SIDE || Math.abs(a[1] - b[1]) < MIN_RECT_SIDE) return [];
  const c = rectCorners(a, b);
  const out: { from: V2; to: V2 }[] = [];
  for (let i = 0; i < 4; i++) out.push(...uncoveredParts(c[i]!, c[(i + 1) % 4]!, existing));
  return out;
}

// ---------------------------------------------------------------------------
// Cotas
// ---------------------------------------------------------------------------

export interface ParallelGap {
  distance: number;
  /** Ponto no trecho em desenho e ponto correspondente na parede paralela (para desenhar a cota). */
  from: V2;
  to: V2;
  segmentId?: string;
}

/**
 * Parede paralela mais próxima do trecho a->b (ângulo até 2°), que se sobrepõe ao trecho na projeção.
 * Ignora as que estão coladas (< 2 cm), pois essas são a própria parede.
 */
export function nearestParallel(a: V2, b: V2, segments: SegLike[], maxDist = 12): ParallelGap | null {
  const len = dist(a, b);
  if (len < 0.2) return null;
  const u = unit(sub(b, a));
  let best: ParallelGap | null = null;
  for (const s of segments) {
    const sl = dist(v2(s.from), v2(s.to));
    if (sl < 1e-6) continue;
    const su = unit(sub(v2(s.to), v2(s.from)));
    if (Math.abs(cross(u, su)) > Math.sin((2 * Math.PI) / 180)) continue;
    const pf = (s.from[0] - a[0]) * u[0] + (s.from[1] - a[1]) * u[1];
    const pt = (s.to[0] - a[0]) * u[0] + (s.to[1] - a[1]) * u[1];
    const lo = Math.max(0, Math.min(pf, pt));
    const hi = Math.min(len, Math.max(pf, pt));
    if (hi - lo < 0.05) continue;
    const m = (lo + hi) / 2;
    const p: V2 = [a[0] + u[0] * m, a[1] + u[1] * m];
    const d = cross(u, sub(v2(s.from), a)); // distância assinada ao eixo
    const ad = Math.abs(d);
    if (ad < 0.02 || ad > maxDist) continue;
    if (!best || ad < best.distance) {
      const n: V2 = [-u[1], u[0]];
      best = { distance: ad, from: p, to: [p[0] + n[0] * d, p[1] + n[1] * d], segmentId: s.id };
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Mover pontas e paredes (ligadas acompanham)
// ---------------------------------------------------------------------------

const onLevel = (walls: Wall[], id: string) => walls.filter((w) => w.level === walls.find((x) => x.id === id)?.level);

/** Move uma ponta; as pontas das outras paredes do nível que estavam no mesmo ponto vão junto. */
export function moveWallEnd(walls: Wall[], id: string, which: 'from' | 'to', p: V2): WallChange[] {
  const w = walls.find((x) => x.id === id);
  if (!w) return [];
  const old = v2(w[which]);
  const target = r3(p);
  if (same(old, target, 1e-9)) return [];
  const out: WallChange[] = [{ id, from: which === 'from' ? target : v2(w.from), to: which === 'to' ? target : v2(w.to) }];
  for (const o of onLevel(walls, id)) {
    if (o.id === id) continue;
    const f = same(v2(o.from), old);
    const t = same(v2(o.to), old);
    if (!f && !t) continue;
    out.push({ id: o.id, from: f ? target : v2(o.from), to: t ? target : v2(o.to) });
  }
  return out;
}

function lineIntersection(p: V2, d: V2, q: V2, e: V2): { t: number; point: V2 } | null {
  const den = cross(d, e);
  if (Math.abs(den) < 1e-9) return null;
  const t = cross(sub(q, p), e) / den;
  return { t, point: [p[0] + d[0] * t, p[1] + d[1] * t] };
}

/**
 * Desloca a parede paralelamente (`offset` m ao longo da normal à direita de from->to).
 * Paredes ligadas às pontas, ou encostadas no meio dela (T), esticam: a ponta delas desliza pelo próprio eixo
 * até o novo eixo da parede movida. Se forem paralelas à parede, a ponta só acompanha o deslocamento.
 */
export function moveWallParallel(walls: Wall[], id: string, offset: number): WallChange[] {
  const w = walls.find((x) => x.id === id);
  if (!w || Math.abs(offset) < 1e-9) return [];
  const f = v2(w.from);
  const t = v2(w.to);
  const len = dist(f, t);
  if (len < 1e-6) return [];
  const u = unit(sub(t, f));
  const n: V2 = [u[1], -u[0]];
  const shift: V2 = [n[0] * offset, n[1] * offset];
  const nf = r3([f[0] + shift[0], f[1] + shift[1]]);
  const nt = r3([t[0] + shift[0], t[1] + shift[1]]);
  const out: WallChange[] = [{ id, from: nf, to: nt }];
  for (const o of onLevel(walls, id)) {
    if (o.id === id) continue;
    let from = v2(o.from);
    let to = v2(o.to);
    let changed = false;
    for (const end of ['from', 'to'] as const) {
      const e = end === 'from' ? from : to;
      const h = closestOnSegment(e, f, t);
      if (h.dist > JOIN_TOL) continue;
      const other = end === 'from' ? to : from;
      const od = unit(sub(e, other));
      const hit = lineIntersection(other, od, nf, u);
      const moved = hit && Math.abs(hit.t) < 100 ? r3(hit.point) : r3([e[0] + shift[0], e[1] + shift[1]]);
      if (end === 'from') from = moved;
      else to = moved;
      changed = true;
    }
    if (changed) out.push({ id: o.id, from, to });
  }
  return out;
}

/** Alguma parede ficaria menor que 10 cm? */
export const hasTooShort = (changes: WallChange[]) => changes.some((c) => dist(c.from, c.to) < MIN_WALL);

/** Aplica mudanças a um rascunho do projeto. */
export function applyWallChanges(draft: { walls: Wall[] }, changes: WallChange[]): void {
  for (const c of changes) {
    const w = draft.walls.find((x) => x.id === c.id);
    if (!w) continue;
    w.from = [c.from[0], c.from[1]];
    w.to = [c.to[0], c.to[1]];
  }
}

// ---------------------------------------------------------------------------
// Dividir e juntar
// ---------------------------------------------------------------------------

interface OpeningLike {
  id: string;
  host: string;
  offset: number;
  width: number;
}
export interface WallDraft {
  walls: Wall[];
  openings: OpeningLike[];
}

export type EditResult = { ok: true } | { ok: false; message: string };

/**
 * Divide a parede em `at` (ponto sobre ela). A original fica com o primeiro trecho; o segundo é uma parede nova
 * (mesma composição, área molhada e altura). Aberturas passam para o trecho onde estão; se o corte cair no meio
 * de uma abertura, não divide.
 */
export function splitWall(draft: WallDraft, id: string, at: V2, newId: string): EditResult {
  const w = draft.walls.find((x) => x.id === id);
  if (!w) return { ok: false, message: 'Parede não encontrada.' };
  const f = v2(w.from);
  const t = v2(w.to);
  const h = closestOnSegment(at, f, t);
  const len = dist(f, t);
  if (h.u < MIN_WALL || len - h.u < MIN_WALL) return { ok: false, message: 'Cada trecho precisa ter pelo menos 10 cm.' };
  const ops = draft.openings.filter((o) => o.host === id);
  if (ops.some((o) => o.offset < h.u - 1e-6 && o.offset + o.width > h.u + 1e-6)) return { ok: false, message: 'O corte cairia no meio de uma porta ou janela. Escolha outro ponto.' };
  const p = r3(h.point);
  const second: Wall = { ...w, id: newId, from: p, to: t };
  w.to = p;
  const i = draft.walls.findIndex((x) => x.id === id);
  draft.walls.splice(i + 1, 0, second);
  for (const o of ops) {
    if (o.offset >= h.u - 1e-6) {
      o.host = newId;
      o.offset = round(Math.max(0, o.offset - h.u), 3);
    }
  }
  return { ok: true };
}

/**
 * Junta duas paredes colineares que se encontram numa ponta, de mesmo nível, composição, área molhada e altura.
 * A primeira (na ordem do desenho) fica com o trecho todo; as aberturas da segunda seguem com o deslocamento certo.
 */
export function joinWalls(draft: WallDraft, idA: string, idB: string): EditResult {
  const a = draft.walls.find((x) => x.id === idA);
  const b = draft.walls.find((x) => x.id === idB);
  if (!a || !b || a === b) return { ok: false, message: 'Escolha duas paredes diferentes.' };
  if (a.level !== b.level) return { ok: false, message: 'As paredes são de níveis diferentes.' };
  if (a.assembly !== b.assembly || (a.wet ?? false) !== (b.wet ?? false) || a.height !== b.height) return { ok: false, message: 'As paredes têm composição, área molhada ou altura diferentes.' };
  // orienta: first.to == second.from
  let first = a;
  let second = b;
  if (same(v2(b.to), v2(a.from))) [first, second] = [b, a];
  else if (!same(v2(a.to), v2(b.from))) return { ok: false, message: 'As paredes não se encontram numa ponta, com o mesmo sentido de desenho.' };
  const fu = unit(sub(v2(first.to), v2(first.from)));
  const su = unit(sub(v2(second.to), v2(second.from)));
  if (Math.abs(cross(fu, su)) > 1e-3 || fu[0] * su[0] + fu[1] * su[1] < 0) return { ok: false, message: 'As paredes não são colineares.' };
  const lenFirst = dist(v2(first.from), v2(first.to));
  for (const o of draft.openings) {
    if (o.host === second.id) {
      o.host = first.id;
      o.offset = round(o.offset + lenFirst, 3);
    }
  }
  first.to = [second.to[0], second.to[1]];
  const i = draft.walls.findIndex((x) => x.id === second.id);
  draft.walls.splice(i, 1);
  return { ok: true };
}

/** Parede colinear que pode ser juntada à `id` (ou null). */
export function findJoinPartner(draft: WallDraft, id: string): string | null {
  for (const o of draft.walls) {
    if (o.id === id) continue;
    // simulação em cópia rasa: só testa, não aplica
    const copy: WallDraft = { walls: draft.walls.map((w) => ({ ...w })), openings: draft.openings.map((x) => ({ ...x })) };
    if (joinWalls(copy, id, o.id).ok) return o.id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Ponto interno de um contorno (semente do cômodo)
// ---------------------------------------------------------------------------

/** Ponto dentro do polígono: o centroide, ou (côncavo) o meio do maior trecho interno da linha horizontal que o cruza. */
export function interiorPoint(poly: V2[]): V2 {
  const A = polygonArea(poly);
  let cx = 0;
  let cy = 0;
  if (Math.abs(A) > 1e-9) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      const k = p[0] * q[1] - q[0] * p[1];
      cx += (p[0] + q[0]) * k;
      cy += (p[1] + q[1]) * k;
    }
    cx /= 6 * A;
    cy /= 6 * A;
  } else {
    cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
    cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  }
  const c: V2 = [cx, cy];
  if (pointInPolygon(c, poly)) return r3(c);
  const xs: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    if (p[1] > cy !== q[1] > cy) xs.push(p[0] + ((cy - p[1]) / (q[1] - p[1])) * (q[0] - p[0]));
  }
  xs.sort((a, b) => a - b);
  let best: V2 = r3(poly[0]!);
  let bestLen = -1;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    const l = xs[i + 1]! - xs[i]!;
    if (l > bestLen) {
      bestLen = l;
      best = r3(mid([xs[i]!, cy], [xs[i + 1]!, cy]));
    }
  }
  return best;
}
