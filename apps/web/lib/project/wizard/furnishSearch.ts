/**
 * Mobiliário do assistente por busca: para cada cômodo, gera candidatos de posição e fica com o primeiro de melhor
 * nota que passa nas métricas de `layoutQuality` (o mesmo oráculo que a matriz de testes usa). Puro e determinístico.
 */
import { pointInPolygon, type BuildingModel, type Project, type Vec2 } from '@chalecad/engine';
import type { Catalog, FurnitureSpec } from '@chalecad/catalog';
import { addFurniture, normalizeRotation, rotationFacing, specOf, WALL_GAP } from '../furniture';
import type { IdGen } from '../ids';
import {
  backingWall,
  bathProblems,
  bedProblems,
  circulationProblems,
  furnitureProblems,
  livingPairProblems,
  makeLF,
  normalOf,
  polyDist,
  roomAt,
  sofaLowWall,
  windowOver,
  type LCtx,
  type LF,
} from '../layoutQuality';

type V = Vec2;
type Room = LCtx['rooms'][number];
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const dist = (a: V, b: V) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** O que a busca precisa do gerador. */
export interface FEnv {
  catalog: Catalog;
  ids: IdGen;
  p: Project;
  ctx: LCtx;
  /** Cota do telhado sobre o ponto (99 se não há). */
  roofAt(pt: V): number;
  /** Áreas que o desenho reservou (chegada da escada de cima etc.). */
  avoid: { level: string; rect: Rect }[];
  slabs: BuildingModel['slabs'];
}

/** Folga (m) ao lado da zona da folha da porta em que não se põe móvel (passagem de 0,8 m). */
const DOOR_MARGIN = 0.3;
const TALL = new Set(['wardrobe', 'fridge', 'shelf', 'bunk']);
const rectPoly = (r: Rect): V[] => [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]];

function overlaps(a: V[], b: V[]): boolean {
  // SAT simples (convexos), encostar não conta
  for (const poly of [a, b])
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      const n: V = [-(q[1] - p[1]) / l, (q[0] - p[0]) / l];
      const rng = (s: V[]) => {
        const d = s.map((v) => v[0] * n[0] + v[1] * n[1]);
        return [Math.min(...d), Math.max(...d)] as const;
      };
      const [a0, a1] = rng(a);
      const [b0, b1] = rng(b);
      if (Math.min(a1, b1) - Math.max(a0, b0) <= 0.003) return false;
    }
  return true;
}

const elevOf = (e: FEnv, level: string) => e.ctx.elev.get(level) ?? 0;

/** Pé-direito sobre o móvel (telhado e laje de cima), como o motor confere. */
function headroomOk(e: FEnv, lf: LF): boolean {
  const elev = elevOf(e, lf.level);
  const c: V = [lf.polygon.reduce((s, p) => s + p[0], 0) / 4, lf.polygon.reduce((s, p) => s + p[1], 0) / 4];
  let min = Infinity;
  for (const p of [...lf.polygon, c]) {
    let top = e.roofAt(p);
    for (const s of e.slabs) {
      const bottom = s.topZ - s.thickness;
      if (s.kind === 'mezzanine' && bottom >= elev + 0.05 && pointInPolygon(p, s.polygon as V[], 0)) top = Math.min(top, bottom);
    }
    min = Math.min(min, top - elev);
  }
  return min >= lf.height - 1e-9;
}

/** Regras de arquiteto que o motor não cobra: bancada com pé-direito pleno na frente, sofá fora da água baixa, áreas reservadas. */
function rulesOk(e: FEnv, lf: LF): boolean {
  const { spec } = lf;
  if (e.avoid.some((a) => a.level === lf.level && overlaps(lf.polygon, rectPoly(a.rect)))) return false;
  const elev = elevOf(e, lf.level);
  if (['counter_sink', 'stove', 'fridge', 'counter'].includes(spec.model)) {
    const k = spec.size.d / 2 + 0.6;
    if (e.roofAt([lf.pos[0] + lf.n[0] * k, lf.pos[1] + lf.n[1] * k]) - elev < 2.3) return false;
  }
  if (spec.model === 'sofa' && !lf.polygon.every((q) => e.roofAt(q) - elev >= 1.4)) return false;
  if (TALL.has(spec.model) || spec.size.h >= 1.5) {
    if (spec.model !== 'shower') {
      const b = backingWall(e.ctx, lf);
      if (b && windowOver(e.ctx, b.wall, b.u0, b.u1, spec.size.h, lf.level)) return false;
    }
  }
  return true;
}

/** O móvel pode ficar aqui? (cômodo, parede, porta, escada, colisão, pé-direito e regras acima) */
export function valid(e: FEnv, lf: LF, margin = DOOR_MARGIN): boolean {
  return rulesOk(e, lf) && headroomOk(e, lf) && furnitureProblems(e.ctx, lf, { doorMargin: margin, firstOnly: true }).length === 0;
}

let tmpSeq = 0;
export function mk(e: FEnv, item: string, level: string, pos: V, rot: number): LF | null {
  const spec = specOf(e.catalog, item);
  if (!spec) return null;
  return makeLF(spec, `tmp-${tmpSeq++}`, level, [r3(pos[0]), r3(pos[1])], normalizeRotation(rot));
}

/** Põe o móvel se passar; devolve o móvel (com o ID real) ou null. */
export function put(e: FEnv, item: string, level: string, pos: V, rot = 0, margin = DOOR_MARGIN): LF | null {
  const lf = mk(e, item, level, pos, rot);
  if (!lf || !valid(e, lf, margin)) return null;
  return commit(e, lf);
}

function commit(e: FEnv, lf: LF): LF {
  const id = addFurniture(e.p, lf.level, lf.item, lf.pos, lf.rot, e.ids);
  const real = { ...lf, id };
  e.ctx.furniture.push(real);
  return real;
}

/** Tira um móvel (do projeto e do contexto). */
export function drop(e: FEnv, id: string) {
  e.p.furniture = e.p.furniture.filter((f) => f.id !== id);
  e.ctx.furniture = e.ctx.furniture.filter((f) => f.id !== id);
}

function withTemp<T>(e: FEnv, lf: LF, fn: () => T): T {
  e.ctx.furniture.push(lf);
  try {
    return fn();
  } finally {
    e.ctx.furniture.pop();
  }
}

// ---------------------------------------------------------------------------
// Candidatos junto das paredes do cômodo
// ---------------------------------------------------------------------------

export interface Spot {
  pos: V;
  rot: number;
  wallId: string;
  /** Posição do centro ao longo do trecho e comprimento do trecho. */
  u: number;
  len: number;
  /** Normal para dentro do cômodo. */
  n: V;
}

export function wallSpots(e: FEnv, room: Room, spec: FurnitureSpec, step = 0.1, overhang = 0): Spot[] {
  const out: Spot[] = [];
  for (const edge of room.edges) {
    if (!edge.hostId) continue;
    const w = e.ctx.walls.find((x) => x.id === edge.hostId);
    if (!w) continue;
    const from = edge.from as V;
    const to = edge.to as V;
    const len = dist(from, to);
    if (len < spec.size.w + 0.04 - 2 * overhang) continue;
    const d: V = [(to[0] - from[0]) / len, (to[1] - from[1]) / len];
    let n: V = [-d[1], d[0]];
    const probe: V = [(from[0] + to[0]) / 2 + n[0] * 0.05, (from[1] + to[1]) / 2 + n[1] * 0.05];
    if (!pointInPolygon(probe, room.polygon, 0)) n = [-n[0], -n[1]];
    const off = w.thickness / 2 + spec.size.d / 2 + WALL_GAP;
    const rot = rotationFacing(n);
    const us = new Set<number>();
    const lo = spec.size.w / 2 + 0.01 - overhang;
    const hi = len - spec.size.w / 2 - 0.01 + overhang;
    for (let u = lo; u <= hi + 1e-6; u += step) us.add(r3(u));
    us.add(r3(hi));
    // encostado nos móveis já postos neste trecho
    for (const o of e.ctx.furniture) {
      if (o.level !== room.level) continue;
      const proj = o.polygon.map((q) => (q[0] - from[0]) * d[0] + (q[1] - from[1]) * d[1]);
      const side = Math.abs((o.pos[0] - from[0]) * n[0] + (o.pos[1] - from[1]) * n[1]);
      if (side > 1.4) continue;
      us.add(r3(Math.max(...proj) + spec.size.w / 2 + 0.003));
      us.add(r3(Math.min(...proj) - spec.size.w / 2 - 0.003));
    }
    for (const u of us) {
      if (u < lo - 0.2 || u > hi + 0.2) continue;
      out.push({ pos: [r3(from[0] + d[0] * u + n[0] * off), r3(from[1] + d[1] * u + n[1] * off)], rot, wallId: w.id, u, len, n });
    }
  }
  return out;
}

/** O trecho tem porta ou janela perto de `u`? (0 nenhuma, 1 janela, 2 porta) */
function openingNear(e: FEnv, wallId: string, pos: V, half: number): 0 | 1 | 2 {
  const w = e.ctx.walls.find((x) => x.id === wallId);
  if (!w) return 0;
  const dx = (w.to[0] - w.from[0]) / (w.length || 1);
  const dy = (w.to[1] - w.from[1]) / (w.length || 1);
  const u = (pos[0] - w.from[0]) * dx + (pos[1] - w.from[1]) * dy;
  let r: 0 | 1 | 2 = 0;
  for (const o of e.ctx.openings) {
    if (o.hostId !== wallId || Math.min(o.u1, u + half) - Math.max(o.u0, u - half) <= 0) continue;
    r = o.type === 'door' || o.type === 'sliding_door' ? 2 : Math.max(r, 1) as 1 | 2;
  }
  return r;
}

const wallHasDoor = (e: FEnv, wallId: string) => e.ctx.openings.some((o) => o.hostId === wallId && (o.type === 'door' || o.type === 'sliding_door'));
const isWet = (e: FEnv, wallId: string) => e.p.walls.find((w) => w.id === wallId)?.wet === true;
const inRoom = (room: Room, f: LF) => f.level === room.level && pointInPolygon(f.pos, room.polygon, 1e-6);
const has = (e: FEnv, room: Room, model: string) => e.ctx.furniture.some((f) => f.spec.model === model && inRoom(room, f));

function best<T>(items: T[], cost: (t: T) => number): T | undefined {
  let b: T | undefined;
  let bc = Infinity;
  for (const t of items) {
    const c = cost(t);
    if (c < bc) {
      bc = c;
      b = t;
    }
  }
  return b;
}

// ---------------------------------------------------------------------------
// Quarto
// ---------------------------------------------------------------------------

/** Quanto da largura do móvel passa do fim do trecho de parede (m). */
const overhangOf = (s: Spot, w: number) => Math.max(0, w / 2 - s.u, s.u + w / 2 - s.len);

const usableOf = (room: Room) => {
  const xs = room.polygon.map((p) => p[0]);
  const ys = room.polygon.map((p) => p[1]);
  return Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
};

export function furnishBedroom(e: FEnv, room: Room, hint?: { wall?: string }) {
  const double = room.level !== 'L0' || usableOf(room) >= 2.6;
  const bedItem = double ? 'furn_bed_double' : 'furn_bed_single';
  const bedSpec = specOf(e.catalog, bedItem);
  if (!bedSpec) return;
  let bed = e.ctx.furniture.find((f) => f.spec.model === 'bed' && inRoom(room, f));
  if (!bed) {
    const find = (margin: number) =>
      wallSpots(e, room, bedSpec, 0.05, bedSpec.size.w * 0.3)
        .map((s) => ({ s, lf: mk(e, bedItem, room.level, s.pos, s.rot)! }))
        .filter((c) => valid(e, c.lf, margin))
        .map((c) => ({ ...c, problems: withTemp(e, c.lf, () => bedProblems(e.ctx, c.lf)).length }));
    let cands = find(DOOR_MARGIN);
    if (!cands.some((c) => c.problems === 0)) cands = [...cands, ...find(0)];
    const pick = best(cands, (c) => c.problems * 100 + (wallHasDoor(e, c.s.wallId) ? 4 : 0) + openingNear(e, c.s.wallId, c.s.pos, 0.9) + Math.abs(c.s.u - c.s.len / 2) * 0.6 + overhangOf(c.s, bedSpec.size.w) * 2 + (hint?.wall === c.s.wallId ? -2 : 0));
    if (pick) bed = commit(e, pick.lf);
  }
  if (!bed) return;
  const bedLf = bed;
  // criados-mudos nas duas pontas da cabeceira
  const night = specOf(e.catalog, 'furn_nightstand');
  if (night && !has(e, room, 'nightstand'))
    for (const s of [-1, 1]) {
      const local: V = [s * (bedLf.spec.size.w / 2 + night.size.w / 2 + 0.02), bedLf.spec.size.d / 2 - night.size.d / 2];
      const c = Math.cos((bedLf.rot * Math.PI) / 180);
      const sn = Math.sin((bedLf.rot * Math.PI) / 180);
      const pos: V = [bedLf.pos[0] + local[0] * c - local[1] * sn, bedLf.pos[1] + local[0] * sn + local[1] * c];
      const lf = mk(e, 'furn_nightstand', room.level, pos, bedLf.rot);
      if (lf && valid(e, lf) && withTemp(e, lf, () => bedProblems(e.ctx, bedLf)).length === 0) commit(e, lf);
    }
  // guarda-roupa: numa parede sem porta, sem tirar o acesso à cama
  if (!has(e, room, 'wardrobe')) {
    for (const item of ['furn_wardrobe', 'furn_wardrobe_small']) {
      const spec = specOf(e.catalog, item);
      if (!spec) continue;
      const cands = wallSpots(e, room, spec, 0.1)
        .map((s) => ({ s, lf: mk(e, item, room.level, s.pos, s.rot)! }))
        .filter((c) => valid(e, c.lf) && withTemp(e, c.lf, () => bedProblems(e.ctx, bedLf)).length === 0);
      const pick = best(cands, (c) => (wallHasDoor(e, c.s.wallId) ? 3 : 0) + openingNear(e, c.s.wallId, c.s.pos, 1.0) * 0.5 + Math.min(c.s.u, c.s.len - c.s.u) * 0.3);
      if (pick) {
        commit(e, pick.lf);
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Banheiro
// ---------------------------------------------------------------------------

export function furnishBath(e: FEnv, room: Room) {
  if (has(e, room, 'toilet') && has(e, room, 'basin') && has(e, room, 'shower')) return;
  const specs = { shower: specOf(e.catalog, 'furn_shower'), toilet: specOf(e.catalog, 'furn_toilet'), basin: specOf(e.catalog, 'furn_bath_sink') };
  if (!specs.shower || !specs.toilet || !specs.basin) return;
  const cand = (item: string, spec: FurnitureSpec, corner: boolean, max: number) =>
    wallSpots(e, room, spec, 0.1)
      .map((s) => ({ s, lf: mk(e, item, room.level, s.pos, s.rot)! }))
      .filter((c) => valid(e, c.lf))
      .sort((a, b) => {
        const k = (c: (typeof a)) => (corner ? Math.min(c.s.u - spec.size.w / 2, c.s.len - c.s.u - spec.size.w / 2) : 0) + (wallHasDoor(e, c.s.wallId) ? 1.5 : 0) + openingNear(e, c.s.wallId, c.s.pos, 0.5) * 0.2 + (isWet(e, c.s.wallId) ? -0.6 : 0);
        return k(a) - k(b);
      })
      .slice(0, max);
  const showers = cand('furn_shower', specs.shower, true, 10);
  for (const sh of showers) {
    const ok = withTemp(e, sh.lf, () => {
      for (const t of cand('furn_toilet', specs.toilet!, false, 14)) {
        const hit = withTemp(e, t.lf, () => {
          for (const b of cand('furn_bath_sink', specs.basin!, false, 14)) {
            if (withTemp(e, b.lf, () => bathProblems(e.ctx, room).length === 0 && furnitureProblems(e.ctx, b.lf).length === 0)) return { b };
          }
          return null;
        });
        if (hit) return { t, b: hit.b };
      }
      return null;
    });
    if (ok) {
      commit(e, sh.lf);
      commit(e, ok.t.lf);
      commit(e, ok.b.lf);
      return;
    }
  }
  // sem solução completa: o que couber, em ordem
  for (const [item, spec, corner] of [['furn_shower', specs.shower, true], ['furn_toilet', specs.toilet, false], ['furn_bath_sink', specs.basin, false]] as const) {
    if (has(e, room, spec.model)) continue;
    const c = cand(item, spec, corner, 1)[0];
    if (c) commit(e, c.lf);
  }
}

// ---------------------------------------------------------------------------
// Cozinha
// ---------------------------------------------------------------------------

interface KC {
  lf: LF;
  s: Spot | null;
  fixed: boolean;
}

export function furnishKitchen(e: FEnv, room: Room) {
  if (has(e, room, 'counter_sink') && has(e, room, 'stove') && has(e, room, 'fridge')) return;
  const items: [string, string][] = [['furn_kitchen_sink', 'counter_sink'], ['furn_stove', 'stove'], ['furn_fridge', 'fridge']];
  const pre = (model: string) => e.ctx.furniture.find((f) => f.spec.model === model && inRoom(room, f));
  const cands = (item: string, model: string, max: number, cost: (c: KC) => number): KC[] => {
    const spec = specOf(e.catalog, item)!;
    const fixed = pre(model);
    if (fixed) return [{ lf: fixed, s: null, fixed: true }];
    return wallSpots(e, room, spec, 0.1)
      .map((s): KC => ({ s, lf: mk(e, item, room.level, s.pos, s.rot)!, fixed: false }))
      .filter((c) => valid(e, c.lf))
      .filter((c) => {
        if (model !== 'stove') return true;
        const b = backingWall(e.ctx, c.lf);
        return !(b && windowOver(e.ctx, b.wall, b.u0, b.u1, 1.6, c.lf.level));
      })
      .sort((a, b) => cost(a) - cost(b))
      .slice(0, max);
  };
  const wetCost = (c: KC) => (c.s ? (isWet(e, c.s.wallId) ? 0 : 1.5) + (wallHasDoor(e, c.s.wallId) ? 1 : 0) : 0);
  const sinks = cands('furn_kitchen_sink', 'counter_sink', 30, (c) => wetCost(c) + (c.s && openingNear(e, c.s.wallId, c.s.pos, 0.9) === 1 ? -0.4 : 0));
  const stoves = cands('furn_stove', 'stove', 400, () => 0);
  const fridges = cands('furn_fridge', 'fridge', 400, () => 0);
  const apart = (a: KC, b: KC) => a.fixed || b.fixed || !overlaps(a.lf.polygon, b.lf.polygon);
  const plans: { cost: number; all: KC[]; sink: KC }[] = [];
  for (const sk of sinks) {
    for (const st of stoves) {
      const d1 = dist(st.lf.pos, sk.lf.pos);
      if (d1 < 0.95 || d1 > 2.6 || !apart(sk, st)) continue;
      let n = 0;
      for (const fr of fridges) {
        const d2 = dist(fr.lf.pos, st.lf.pos);
        const d3 = dist(fr.lf.pos, sk.lf.pos);
        if (d2 < 0.9 || d2 > 3.2 || d3 < 0.9 || d3 > 4.2 || !apart(sk, fr) || !apart(st, fr) || polyDist(st.lf.polygon, fr.lf.polygon) < 0.3) continue;
        const sum = d1 + d2 + d3;
        if (sum < 3.7 || sum > 7.8) continue;
        plans.push({ cost: wetCost(sk) + sum * 0.4 + Math.abs(d1 - 1.3) * 0.5 + Math.abs(d2 - 1.2) * 0.3, all: [sk, st, fr], sink: sk });
        if (++n >= 2) break;
      }
    }
  }
  plans.sort((a, b) => a.cost - b.cost);
  // um plano por pia primeiro (diversidade), depois o resto
  const seen = new Set<KC>();
  const ordered = [...plans.filter((pl) => (seen.has(pl.sink) ? false : (seen.add(pl.sink), true))), ...plans];
  // a bancada não pode fechar o caminho até as portas: confere os melhores planos
  const base = room.level === 'L0' ? circBase(e) : 0;
  let bestPlan: { cost: number; lfs: LF[] } | null = null;
  for (const pl of ordered.slice(0, 16)) {
    const lfs = pl.all.filter((x) => !x.fixed).map((x) => x.lf);
    e.ctx.furniture.push(...lfs);
    const ok = room.level !== 'L0' || circulationProblems(e.ctx, 'L0').length <= base;
    for (let i = 0; i < lfs.length; i++) e.ctx.furniture.pop();
    if (ok) {
      bestPlan = { cost: pl.cost, lfs };
      break;
    }
  }
  if (!bestPlan && plans[0]) bestPlan = { cost: plans[0].cost, lfs: plans[0].all.filter((x) => !x.fixed).map((x) => x.lf) };
  const plan = bestPlan as { cost: number; lfs: LF[] } | null;
  if (plan) for (const lf of plan.lfs) commit(e, lf);
  else
    for (const [item, model] of items) {
      if (has(e, room, model)) continue;
      const c = cands(item, model, 1, () => 0)[0];
      if (c && !c.fixed) commit(e, c.lf);
    }
}

// ---------------------------------------------------------------------------
// Sala
// ---------------------------------------------------------------------------

export interface LivingOpts {
  /** Fachada de vidro (A-frame): o sofá pode ficar de frente para o vidro, sem TV. */
  glass?: { depth: number };
  /** Pontos a evitar (bancada, entrada): o sofá fica longe. */
  keepAway?: V[];
}

/** Pontos e folga da circulação: o sofá não pode piorar os caminhos até as portas. */
const circBase = (e: FEnv) => circulationProblems(e.ctx, 'L0').length;

export function furnishLiving(e: FEnv, room: Room, opts: LivingOpts = {}) {
  if (has(e, room, 'sofa') && has(e, room, 'rack')) return;
  const rackSpec = specOf(e.catalog, 'furn_tv_rack');
  const sofaSpecs = ['furn_sofa_3', 'furn_sofa_2'].map((id) => specOf(e.catalog, id)).filter((s): s is FurnitureSpec => !!s);
  if (!rackSpec || sofaSpecs.length === 0) return;
  const base = room.level === 'L0' ? circBase(e) : 0;
  const away = (p: V) => (opts.keepAway ?? []).reduce((s, q) => s + Math.max(0, 1.6 - dist(p, q)), 0);
  const stairNear = (f: LF) => (e.ctx.stairs.some((st) => st.level === f.level && polyDist(f.polygon, st.footprint) < 0.5) ? 1.2 : 0);
  const fixtures = e.ctx.furniture.filter((f) => f.level === room.level && ['counter_sink', 'stove', 'fridge', 'counter'].includes(f.spec.model));
  const awayFix = (p: V) => fixtures.reduce((s, f) => s + Math.max(0, 1.5 - dist(p, f.pos)), 0);
  const cands: { rack: LF | null; sofa: LF; cost: number }[] = [];
  const rackCost = (c: { s: Spot }) => (wallHasDoor(e, c.s.wallId) ? 2 : 0) + openingNear(e, c.s.wallId, c.s.pos, 0.9) + Math.abs(c.s.u - c.s.len / 2) * 0.2;
  const rackAll = wallSpots(e, room, rackSpec, 0.15)
    .map((s) => ({ s, lf: mk(e, 'furn_tv_rack', room.level, s.pos, s.rot)! }))
    .filter((c) => valid(e, c.lf))
    .sort((a, b) => rackCost(a) - rackCost(b));
  // varia as paredes e as posições: ao longo de cada parede, uma posição a cada 0,45 m (as de menor custo primeiro)
  const perWall = new Map<string, typeof rackAll>();
  for (const c of rackAll) {
    const list = perWall.get(c.s.wallId) ?? [];
    if (list.length < 18 && list.every((o) => dist(o.lf.pos, c.lf.pos) >= 0.45)) list.push(c);
    perWall.set(c.s.wallId, list);
  }
  const racks = [...perWall.values()].flat().sort((a, b) => rackCost(a) - rackCost(b));
  for (const rk of racks) {
    const tang: V = [-rk.s.n[1], rk.s.n[0]];
    for (const sofaSpec of sofaSpecs) {
      for (let gap = 1.15; gap <= 3.3; gap += 0.2)
        for (const off of [0, -0.3, 0.3, -0.6, 0.6, -0.9, 0.9]) {
          const c = rk.s.pos;
          const dd = rackSpec.size.d / 2 + gap + sofaSpec.size.d / 2;
          const pos: V = [c[0] + rk.s.n[0] * dd + tang[0] * off, c[1] + rk.s.n[1] * dd + tang[1] * off];
          const sofa = mk(e, sofaSpec.id, room.level, pos, rotationFacing([-rk.s.n[0], -rk.s.n[1]]))!;
          if (!valid(e, sofa)) continue;
          if (livingPairProblems(e.ctx, sofa, rk.lf).length > 0 || sofaLowWall(e.ctx, sofa)) continue;
          const back = backingWall(e.ctx, sofa);
          const cost = (back ? 0 : 1.6) + Math.abs(gap - 2.0) * 0.5 + Math.abs(off) * 0.4 + awayFix(sofa.pos) * 1.5 + awayFix(rk.lf.pos) + away(sofa.pos) + (sofaSpec.size.w < 2 ? 0.8 : 0) + stairNear(sofa) + (wallHasDoor(e, rk.s.wallId) ? 2 : 0) + openingNear(e, rk.s.wallId, rk.s.pos, 0.9) * 0.6;
          cands.push({ rack: rk.lf, sofa, cost });
        }
    }
  }
  // A-frame com vidro: sofá virado para a fachada, na metade da frente
  if (opts.glass) {
    const { depth } = opts.glass;
    const xs = room.polygon.map((p) => p[0]);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const tMax = Math.max(0.1, ...room.edges.map((ed) => e.ctx.walls.find((w) => w.id === ed.hostId)?.thickness ?? 0));
    for (const sofaSpec of sofaSpecs) {
      // além da grade, o sofá encostado em cada lateral (sobra o máximo de passagem do outro lado)
      const xsC = new Set<number>([r3(x0 + tMax / 2 + sofaSpec.size.w / 2 + 0.005), r3(x1 - tMax / 2 - sofaSpec.size.w / 2 - 0.005)]);
      for (let x = x0 + 0.5; x <= x1 - 0.5; x += 0.15) xsC.add(r3(x));
      for (const x of xsC)
        for (let y = 1.4; y <= depth / 2 - 0.4; y += 0.15) {
          const sofa = mk(e, sofaSpec.id, room.level, [x, y], 0)!;
          if (roomAt(e.ctx, sofa.level, sofa.pos)?.id !== room.id || !valid(e, sofa) || sofaLowWall(e.ctx, sofa)) continue;
          const back = backingWall(e.ctx, sofa);
          cands.push({ rack: null, sofa, cost: (back ? 0 : 0.5) + Math.abs(y - 2.6) * 0.5 + away(sofa.pos) * 2 + awayFix(sofa.pos) * 1.5 + (sofaSpec.size.w < 2 ? 0.8 : 0) + stairNear(sofa) });
        }
    }
  }
  // A-frame com vidro: a sala fica na metade da frente
  const front = opts.glass ? cands.filter((c) => c.sofa.pos[1] < opts.glass!.depth / 2) : cands;
  if (front.length > 0) cands.splice(0, cands.length, ...front);
  cands.sort((a, b) => a.cost - b.cost);
  const tried: { item: string; pos: V; rack: V | null }[] = [];
  for (const c of cands) {
    // varia as tentativas: pula quem fica a menos de 0,35 m de uma já tentada (mesmo sofá e mesma TV)
    if (tried.some((t) => t.item === c.sofa.item && dist(t.pos, c.sofa.pos) < 0.35 && ((!t.rack && !c.rack) || (t.rack && c.rack && dist(t.rack, c.rack.pos) < 0.35)))) continue;
    if (tried.length >= 40) break;
    tried.push({ item: c.sofa.item, pos: c.sofa.pos, rack: c.rack?.pos ?? null });
    const ok = withTemp(e, c.sofa, () => (c.rack ? withTemp(e, c.rack, () => room.level !== 'L0' || circulationProblems(e.ctx, 'L0').length <= base) : room.level !== 'L0' || circulationProblems(e.ctx, 'L0').length <= base));
    if (!ok) continue;
    if (c.rack) commit(e, c.rack);
    const sofa = commit(e, c.sofa);
    placeCoffeeTable(e, room, sofa, c.rack);
    return;
  }
}

function placeCoffeeTable(e: FEnv, room: Room, sofa: LF, rack: LF | null) {
  const table = specOf(e.catalog, 'furn_coffee_table');
  if (!table) return;
  const n = sofa.n;
  const sofaFront = sofa.spec.size.d / 2;
  const face = rack ? Math.abs((rack.pos[0] - sofa.pos[0]) * n[0] + (rack.pos[1] - sofa.pos[1]) * n[1]) - rack.spec.size.d / 2 : 2.4;
  if (face - sofaFront < table.size.d + 0.7) return;
  const mid = (sofaFront + face) / 2;
  putChecked(e, 'furn_coffee_table', room.level, [sofa.pos[0] + n[0] * mid, sofa.pos[1] + n[1] * mid], sofa.rot);
}

/** Põe o móvel só se não piorar os caminhos até as portas (térreo). */
export function putChecked(e: FEnv, item: string, level: string, pos: V, rot: number): LF | null {
  const base = level === 'L0' ? circBase(e) : 0;
  const lf = put(e, item, level, pos, rot);
  if (lf && level === 'L0' && circulationProblems(e.ctx, 'L0').length > base) {
    drop(e, lf.id);
    return null;
  }
  return lf;
}

/** Mesa de jantar perto da bancada, no que sobrar da sala, sem piorar a circulação. */
export function furnishDining(e: FEnv, room: Room, near: V | null) {
  if (e.ctx.furniture.some((f) => f.spec.model === 'dining' || f.spec.model === 'round_table')) return;
  const base = room.level === 'L0' ? circBase(e) : 0;
  const xs = room.polygon.map((p) => p[0]);
  const ys = room.polygon.map((p) => p[1]);
  const cands: { lf: LF; cost: number }[] = [];
  for (const item of ['furn_dining_4', 'furn_round_table'])
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.2)
      for (let y = Math.min(...ys); y <= Math.max(...ys); y += 0.2)
        for (const rot of item === 'furn_round_table' ? [0] : [0, 90]) {
          const lf = mk(e, item, room.level, [x, y], rot)!;
          if (roomAt(e.ctx, lf.level, lf.pos)?.id !== room.id || !valid(e, lf)) continue;
          // faixa de uso: cadeiras e passagem livres de parede e móvel
          const c = lf.spec.clearance;
          const half = Math.max(c.sides, c.front, c.back) * 0.8;
          const grown = [[-lf.spec.size.w / 2 - half, -lf.spec.size.d / 2 - half], [lf.spec.size.w / 2 + half, -lf.spec.size.d / 2 - half], [lf.spec.size.w / 2 + half, lf.spec.size.d / 2 + half], [-lf.spec.size.w / 2 - half, lf.spec.size.d / 2 + half]] as V[];
          const ang = (lf.rot * Math.PI) / 180;
          const poly = grown.map(([gx, gy]): V => [lf.pos[0] + gx * Math.cos(ang) - gy * Math.sin(ang), lf.pos[1] + gx * Math.sin(ang) + gy * Math.cos(ang)]);
          if (e.ctx.walls.some((w) => w.level === lf.level && overlaps(poly, w.rect))) continue;
          if (e.ctx.furniture.some((o) => o.level === lf.level && o.spec.collides && overlaps(poly, o.polygon))) continue;
          const d = near ? dist(lf.pos, near) : 0;
          cands.push({ lf, cost: d + (item === 'furn_round_table' ? 0.3 : 0) });
        }
  cands.sort((a, b) => a.cost - b.cost);
  for (const c of cands.slice(0, 8)) {
    if (withTemp(e, c.lf, () => room.level !== 'L0' || circulationProblems(e.ctx, 'L0').length <= base)) {
      commit(e, c.lf);
      return;
    }
  }
}

export interface AutoOpts {
  /** A sala e a cozinha dividem este cômodo? */
  integrated: (room: Room) => boolean;
  /** Parede em que o desenho quer a cabeceira (opcional). */
  bedWall?: (room: Room) => string | undefined;
  /** Tapete, poltrona e vaso na sala (modelos prontos). */
  decor?: boolean;
}

/** Mobília todos os cômodos: cozinhas, banheiros, quartos e por fim as salas (que usam o que sobrou). */
export function furnishRooms(e: FEnv, o: AutoOpts) {
  const rooms = e.ctx.rooms;
  for (const room of rooms) if (room.use === 'kitchen' || o.integrated(room)) furnishKitchen(e, room);
  for (const room of rooms) if (room.use === 'bathroom') furnishBath(e, room);
  for (const room of rooms) if (room.use === 'bedroom') furnishBedroom(e, room, { wall: o.bedWall?.(room) });
  const entries = e.ctx.openings
    .filter((x) => x.type === 'door' || x.type === 'sliding_door')
    .flatMap((x) => {
      const w = e.ctx.walls.find((y) => y.id === x.hostId && y.id.startsWith('ext-'));
      if (!w) return [];
      const c = (x.u0 + x.u1) / 2;
      return [[w.from[0] + ((w.to[0] - w.from[0]) / w.length) * c, w.from[1] + ((w.to[1] - w.from[1]) / w.length) * c] as V];
    });
  const glass = e.ctx.glassFront;
  for (const room of rooms) {
    if (room.use !== 'living' && !o.integrated(room)) continue;
    furnishLiving(e, room, { ...(glass && room.level === 'L0' ? { glass: { depth: glass.depth } } : {}), keepAway: entries });
    const sink = e.ctx.furniture.find((f) => f.spec.model === 'counter_sink' && f.level === room.level && pointInPolygon(f.pos, room.polygon, 1e-6));
    if (o.integrated(room) || sink) furnishDining(e, room, sink ? sink.pos : null);
    if (o.decor) furnishDecor(e, room);
  }
}

/** Tapete sob a mesa de centro, poltrona ao lado do sofá e vaso no canto da sala. */
function furnishDecor(e: FEnv, room: Room) {
  const sofa = e.ctx.furniture.find((f) => f.spec.model === 'sofa' && inRoom(room, f));
  const table = e.ctx.furniture.find((f) => f.spec.model === 'coffee_table' && inRoom(room, f));
  if (table) put(e, 'furn_rug', room.level, table.pos, table.rot);
  if (sofa && table) {
    const arm = specOf(e.catalog, 'furn_armchair');
    const t: V = [-sofa.n[1], sofa.n[0]];
    if (arm)
      for (const side of [1, -1])
        for (const fwd of [0.9, 1.2, 1.5]) {
          const k = side * (sofa.spec.size.w / 2 + arm.size.w / 2 + 0.15);
          const pos: V = [sofa.pos[0] + t[0] * k + sofa.n[0] * fwd, sofa.pos[1] + t[1] * k + sofa.n[1] * fwd];
          // vira para a mesa de centro
          const to: V = [table.pos[0] - pos[0], table.pos[1] - pos[1]];
          if (putChecked(e, 'furn_armchair', room.level, pos, rotationFacing(to))) return furnishPlant(e, room);
        }
  }
  furnishPlant(e, room);
}

function furnishPlant(e: FEnv, room: Room) {
  const spec = specOf(e.catalog, 'furn_plant');
  if (!spec || e.ctx.furniture.some((f) => f.spec.model === 'plant' && inRoom(room, f))) return;
  const spots = wallSpots(e, room, spec, 0.1).sort((a, b) => Math.min(a.u, a.len - a.u) - Math.min(b.u, b.len - b.u));
  for (const s of spots.slice(0, 30)) if (putChecked(e, 'furn_plant', room.level, s.pos, s.rot)) return;
}

export { normalOf, roomAt };
