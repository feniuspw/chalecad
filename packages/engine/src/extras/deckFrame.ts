import type { Catalog } from '@chalecad/catalog';
import type { Vec2 } from '../geometry';
import type { Project } from '../schema/project';
import type {
  BuildingModel,
  DeckCheck,
  DeckMember,
  DeckStairModel,
  DeckSupport,
  ExtraModel,
  HostWall,
  ResolvedOpening,
  RoofPlane,
} from '../schema/results';
import { flatSurface, GROUND_BELOW_FLOOR, type SiteSurface } from '../terrain/surface';
import { deckRoof } from './deckRoof';
import { deckGeometry, deckTopZ, type DeckE, type DeckGeometry, type ExtrasConstants } from './geometry';

/** O que o deck precisa do resto do modelo: contorno, telhado, aberturas e o terreno acabado. */
export interface DeckEnv {
  footprint: Vec2[];
  roofPlanes: RoofPlane[];
  surface: SiteSurface;
  openings: ResolvedOpening[];
  walls: HostWall[];
}

const flatSurfaceStub = flatSurface();
const DOOR_TYPES = new Set(['door', 'sliding_door']);
/** LOCAL: passo de amostragem do desnível nas bordas livres (m). */
const DROP_SAMPLE_STEP = 0.25;
/** LOCAL: largura de escada padrão quando o deck é pequeno demais para o valor do schema (m). */
const STAIR_MIN_WIDTH = 0.8;

const fmt = (n: number, d = 2) => n.toFixed(d).replace('.', ',');

const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];

/** Centros (ao longo da face, a partir da quina) das portas das paredes externas coladas à face do deck. */
function doorCenters(g: DeckGeometry, env: DeckEnv, withinDeck = true): number[] {
  const out: number[] = [];
  for (const o of env.openings) {
    if (!o.valid || o.hostKind !== 'wall' || !DOOR_TYPES.has(o.type)) continue;
    const w = env.walls.find((x) => x.id === o.hostId);
    if (!w || !w.exteriorSide) continue;
    const len = Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]);
    if (len < 1e-6) continue;
    const dir: Vec2 = [(w.to[0] - w.from[0]) / len, (w.to[1] - w.from[1]) / len];
    if (Math.abs(dir[0] * g.t[1] - dir[1] * g.t[0]) > 1e-3) continue;
    // o eixo da parede fica atrás da face externa (até a espessura)
    const d = dot(sub(w.from, g.face.origin), g.n);
    if (d > 0.1 || d < -(w.thickness + 0.1)) continue;
    const u = (o.u0 + o.u1) / 2;
    const p: Vec2 = [w.from[0] + dir[0] * u, w.from[1] + dir[1] * u];
    const a = dot(sub(p, g.face.origin), g.t);
    if (!withinDeck || (a > g.a0 && a < g.a1)) out.push(a);
  }
  return out.sort((p, q) => p - q);
}

/** Escada com espelho e piso dentro de NBR 9050/Blondel; o pé é refinado uma vez com a cota real do terreno. */
function solveStair(top: Vec2, dir: Vec2, width: number, topZ: number, surface: SiteSurface, X: ExtrasConstants['deck']): DeckStairModel {
  const st = X.stair;
  const calc = (drop: number) => {
    const n = Math.max(1, Math.ceil(drop / st.riserMax - 1e-9));
    const riser = drop / n;
    const tread = Math.max(st.treadMin, (st.blondelMin + st.blondelMax) / 2 - 2 * riser);
    return { n, riser, tread, run: (n - 1) * tread };
  };
  const foot = (run: number): Vec2 => [top[0] + dir[0] * run, top[1] + dir[1] * run];
  let s = calc(Math.max(0.05, topZ - surface.groundZ(top[0], top[1])));
  const f = foot(s.run);
  s = calc(Math.max(0.05, topZ - surface.groundZ(f[0], f[1])));
  const f2 = foot(s.run);
  return {
    top,
    dir,
    width,
    risers: s.n,
    riserHeight: s.riser,
    tread: s.tread,
    topZ,
    bottomZ: surface.groundZ(f2[0], f2[1]),
  };
}

interface Interval {
  s0: number;
  s1: number;
}

/** Mantém só as partes de [0, len] fora dos vãos. */
function subtractGaps(len: number, gaps: Interval[]): Interval[] {
  let rest: Interval[] = [{ s0: 0, s1: len }];
  for (const g of gaps) {
    const next: Interval[] = [];
    for (const r of rest) {
      if (g.s1 <= r.s0 || g.s0 >= r.s1) next.push(r);
      else {
        if (g.s0 > r.s0) next.push({ s0: r.s0, s1: g.s0 });
        if (g.s1 < r.s1) next.push({ s0: g.s1, s1: r.s1 });
      }
    }
    rest = next;
  }
  return rest.filter((r) => r.s1 - r.s0 > 0.05);
}

/** Deck completo: piso, estrutura, pilares até o terreno, escadas, guarda-corpo, cobertura e verificações. */
export function buildDeckModel(project: Project, e: DeckE, x: ExtrasConstants, env: DeckEnv): ExtraModel {
  const X = x.deck;
  const g = deckGeometry(project, e, { x, footprint: env.footprint });
  const topZ = deckTopZ(e, x);
  const m: ExtraModel = { id: e.id, kind: 'deck', segments: [], posts: [], polygon: g.polygon, topZ };
  if (g.polygon.length === 0) return m;

  const found = project.system.foundation;
  const { surface } = env;
  const { at, a0, a1, q0, q1 } = g;
  const alen = a1 - a0;
  const jw = X.joist.width;
  const jd = X.joist.depth;
  const bw = X.beam.width;
  const bd = X.beam.depth;
  const lw = X.ledger.width;
  const joistTop = topZ - X.board.thickness;
  const beamTop = joistTop - jd;
  const pillarTop = beamTop - bd;
  const parallel = e.boards === 'parallel';
  const boardDir: Vec2 = parallel ? g.t : g.n;
  const ledgerOn = joistTop >= -found.edgeBeamDepth - 1e-9;
  const ins = bw / 2;

  const joists: DeckMember[] = [];
  const beams: DeckMember[] = [];
  const pillarsAQ: { a: number; q: number; outer: boolean }[] = [];
  const member = (from: Vec2, to: Vec2, top: number, width: number, depth: number): DeckMember => ({ from, to, topZ: top, width, depth });

  let joistSpan = 0;
  let beamSpan = 0;
  /** Largura de influência perpendicular à viga e ao longo dela, no pior pilar (m). */
  let tribAcross = 0;
  let tribAlong = 0;
  const outerA: number[] = [];

  const ledger: DeckMember | null = ledgerOn
    ? member(at(a0, q0 + lw / 2), at(a1, q0 + lw / 2), joistTop, lw, X.ledger.depth)
    : null;
  const nDiv = (len: number, step: number) => Math.max(1, Math.ceil(len / step - 1e-9));

  if (parallel) {
    // Tábuas ao longo da fachada; barrotes saem da casa (q) e apoiam em vigas paralelas à fachada.
    const nJ = nDiv(alen - jw, X.joist.spacing);
    for (let k = 0; k <= nJ; k++) {
      const a = a0 + jw / 2 + (k * (alen - jw)) / nJ;
      joists.push(member(at(a, q0 + (ledgerOn ? lw : 0)), at(a, q1), joistTop, jw, jd));
    }
    const qRef = ledgerOn ? q0 + lw / 2 : q0 + bw / 2;
    const qLast = q1 - bw / 2;
    const span = Math.max(0.1, qLast - qRef);
    const nS = nDiv(span, X.joist.maxSpan);
    joistSpan = span / nS;
    const lines: number[] = [];
    for (let k = ledgerOn ? 1 : 0; k <= nS; k++) lines.push(qRef + (k * span) / nS);
    const bl = alen - 2 * ins;
    const nb = nDiv(bl, X.beam.maxSpan);
    beamSpan = bl / nb;
    for (const q of lines) {
      beams.push(member(at(a0 + ins, q), at(a1 - ins, q), beamTop, bw, bd));
      for (let i = 0; i <= nb; i++) pillarsAQ.push({ a: a0 + ins + (i * bl) / nb, q, outer: q === lines[lines.length - 1] });
    }
    for (let i = 0; i <= nb; i++) outerA.push(a0 + ins + (i * bl) / nb);
    tribAlong = beamSpan;
    tribAcross = nS >= 2 ? span / nS : span / nS / 2;
  } else {
    // Tábuas perpendiculares à fachada; barrotes correm ao longo dela e apoiam em vigas perpendiculares.
    const qa = q0 + (ledgerOn ? lw : 0);
    const qb = q1;
    const nJ = nDiv(qb - qa - jw, X.joist.spacing);
    for (let k = 0; k <= nJ; k++) {
      const q = qa + jw / 2 + (k * (qb - qa - jw)) / nJ;
      joists.push(member(at(a0, q), at(a1, q), joistTop, jw, jd));
    }
    const span = Math.max(0.1, alen - 2 * ins);
    const nS = nDiv(span, X.joist.maxSpan);
    joistSpan = span / nS;
    const qFirst = ledgerOn ? q0 + lw / 2 : q0 + ins;
    const qEnd = q1 - ins;
    const bl = Math.max(0.1, qEnd - qFirst);
    const nb = nDiv(bl, X.beam.maxSpan);
    beamSpan = bl / nb;
    for (let k = 0; k <= nS; k++) {
      const a = a0 + ins + (k * span) / nS;
      beams.push(member(at(a, ledgerOn ? q0 + lw : q0), at(a, q1), beamTop, bw, bd));
      outerA.push(a);
      for (let i = ledgerOn ? 1 : 0; i <= nb; i++) pillarsAQ.push({ a, q: qFirst + (i * bl) / nb, outer: Math.abs(qFirst + (i * bl) / nb - qEnd) < 1e-9 });
    }
    tribAlong = beamSpan;
    tribAcross = nS >= 2 ? span / nS : span / nS / 2;
  }

  // ---- Pilares: altura calculada por pilar contra o terreno acabado.
  const supports: DeckSupport[] = [];
  const bored = surface.slopePct > X.footing.boredSlopePct;
  let maxNaturalDiff = 0;
  for (const p of pillarsAQ) {
    const pos = at(p.a, p.q);
    const gz = surface.groundZ(pos[0], pos[1]);
    // Sobre talude/muro: o terreno acabado nem é o platô da casa nem o solo natural.
    const offNatural = Math.abs(gz - surface.naturalZ(pos[0], pos[1]));
    if (Math.abs(gz + GROUND_BELOW_FLOOR) > 0.3 + 1e-9) maxNaturalDiff = Math.max(maxNaturalDiff, offNatural);
    const h = pillarTop - gz;
    if (h <= 1e-9) {
      // Sem altura livre: apoio direto (bloco/sapata rasa).
      supports.push({
        position: pos,
        topZ: gz,
        groundZ: gz,
        material: 'concrete',
        size: X.support.size.concrete,
        footing: { kind: 'pad', width: X.footing.padWidth, depth: X.footing.padDepth },
        braced: false,
      });
      continue;
    }
    const material = e.support !== 'auto' ? e.support : h <= X.support.woodMaxHeight ? 'wood' : h <= X.support.steelMaxHeight ? 'steel' : 'concrete';
    const kind = e.footing !== 'auto' ? e.footing : bored ? 'bored' : 'pad';
    supports.push({
      position: pos,
      topZ: pillarTop,
      groundZ: gz,
      material,
      size: X.support.size[material],
      footing:
        kind === 'bored'
          ? { kind, width: X.footing.boredDiameter, depth: X.footing.boredDepth }
          : { kind, width: X.footing.padWidth, depth: X.footing.padDepth },
      braced: h > X.braceHeight,
    });
  }

  // ---- Bordas livres, desnível e guarda-corpo.
  let maxDrop = 0;
  for (const [from, to] of g.rails) {
    const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const n = Math.max(1, Math.ceil(len / DROP_SAMPLE_STEP));
    for (let i = 0; i <= n; i++) {
      const px = from[0] + ((to[0] - from[0]) * i) / n;
      const py = from[1] + ((to[1] - from[1]) * i) / n;
      maxDrop = Math.max(maxDrop, topZ - surface.groundZ(px, py));
    }
  }
  const guardrail = e.guardrail === true || (e.guardrail === 'auto' && maxDrop > X.guardrailDrop);

  // ---- Escadas.
  const stairs: DeckStairModel[] = [];
  const edgeGaps: Interval[][] = [[], [], []]; // start, outer, end (parâmetro ao longo de cada borda de `g.rails`)
  const clampAt = (center: number, lo: number, hi: number, w: number) => Math.min(Math.max(center, lo + w / 2), Math.max(lo + w / 2, hi - w / 2));
  const addStair = (edge: 'outer' | 'start' | 'end', atParam: number, width: number) => {
    if (edge === 'outer') {
      const w = Math.min(width, Math.max(STAIR_MIN_WIDTH, alen - 0.2));
      const c = clampAt(a0 + atParam, a0, a1, w);
      stairs.push(solveStair(at(c, q1), g.n, w, topZ, surface, X));
      edgeGaps[1]!.push({ s0: c - w / 2 - a0, s1: c + w / 2 - a0 });
    } else {
      const w = Math.min(width, Math.max(STAIR_MIN_WIDTH, q1 - q0 - 0.2));
      const c = clampAt(q0 + atParam, q0, q1, w);
      const aEdge = edge === 'start' ? a0 : a1;
      const dir: Vec2 = edge === 'start' ? [-g.t[0], -g.t[1]] : [g.t[0], g.t[1]];
      stairs.push(solveStair(at(aEdge, c), dir, w, topZ, surface, X));
      // a borda `start` corre de q0 a q1; a `end` corre de q1 a q0 (sentido de `g.rails`)
      edgeGaps[edge === 'start' ? 0 : 2]!.push(
        edge === 'start' ? { s0: c - w / 2 - q0, s1: c + w / 2 - q0 } : { s0: q1 - (c + w / 2), s1: q1 - (c - w / 2) },
      );
    }
  };
  if (e.stairs === 'auto') {
    if (maxDrop > X.stair.singleStepMax) {
      const doors = doorCenters(g, env);
      const target = doors.length > 0 ? doors[0]! : (a0 + a1) / 2;
      addStair('outer', target - a0, 1.2);
    }
  } else {
    for (const s of e.stairs) addStair(s.edge, s.at, s.width);
  }

  const railGaps: [Vec2, Vec2][] = [];
  if (guardrail) {
    g.rails.forEach(([from, to], i) => {
      const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
      const dirv: Vec2 = [(to[0] - from[0]) / len, (to[1] - from[1]) / len];
      const pt = (s: number): Vec2 => [from[0] + dirv[0] * s, from[1] + dirv[1] * s];
      const gaps = edgeGaps[i]!;
      for (const gp of gaps) railGaps.push([pt(gp.s0), pt(gp.s1)]);
      for (const r of subtractGaps(len, gaps)) {
        m.segments.push({ from: pt(r.s0), to: pt(r.s1), height: x.guardrailHeight, thickness: x.guardrailThickness, baseZ: topZ, material: 'rail' });
      }
    });
  }

  // ---- Cobertura: pilares sobre os da estrutura (borda externa) e água sem atravessar o telhado principal.
  let roofClipped = false;
  if (e.covered) {
    const rr = deckRoof(e.id, g, project, x, topZ, env.roofPlanes, e.side);
    m.roof = rr.roof;
    roofClipped = rr.clipped;
    const qPost = q1 - ins;
    const roofZ = (q: number) => rr.zHigh - (q - rr.q0) * rr.tan;
    const post = (a: number): void => {
      m.posts.push({ position: at(a, qPost), height: Math.max(0.1, roofZ(qPost) - topZ), size: x.deckPostSize });
    };
    const gapsA = edgeGaps[1]!.map((gp) => ({ s0: gp.s0 + a0, s1: gp.s1 + a0 }));
    const free = outerA.filter((a) => !gapsA.some((gp) => a > gp.s0 + 1e-6 && a < gp.s1 - 1e-6));
    const cands = free.length >= 2 ? free : outerA;
    const chosen = [cands[0]!];
    const end = cands[cands.length - 1]!;
    while (chosen[chosen.length - 1]! < end - 1e-9) {
      const last = chosen[chosen.length - 1]!;
      const within = cands.filter((c) => c > last + 1e-9 && c - last <= x.deckPostSpacing + 1e-9);
      chosen.push(within.length > 0 ? within[within.length - 1]! : cands.find((c) => c > last + 1e-9)!);
    }
    for (const a of chosen) post(a);
  }

  // ---- Verificações.
  const checks: DeckCheck[] = [];
  const check = (id: string, label: string, value: string, limit: string, ok: boolean, norm?: string, bad: 'warn' | 'fail' = 'fail'): void => {
    const c: DeckCheck = { id, label, value, limit, status: ok ? 'ok' : bad };
    if (norm) c.norm = norm;
    checks.push(c);
  };
  check('joist_span', 'Vão do barrote', `${fmt(joistSpan)} m`, `${fmt(X.joist.maxSpan)} m`, joistSpan <= X.joist.maxSpan + 1e-9, 'nbr7190');
  check('beam_span', 'Vão da viga entre pilares', `${fmt(beamSpan)} m`, `${fmt(X.beam.maxSpan)} m`, beamSpan <= X.beam.maxSpan + 1e-9, 'nbr7190');
  const maxH = supports.reduce((s, p) => Math.max(s, p.topZ - p.groundZ), 0);
  const unbraced = supports.some((p) => p.topZ - p.groundZ > X.braceHeight + 1e-9 && !p.braced);
  const woodTall = supports.some((p) => p.material === 'wood' && p.topZ - p.groundZ > X.support.woodMaxHeight + 1e-9);
  check(
    'support_height',
    'Pilares: altura e contraventamento',
    `${fmt(maxH)} m${maxH > X.braceHeight ? ' (com mão-francesa)' : ''}`,
    `${fmt(X.braceHeight)} m sem contraventar; madeira até ${fmt(X.support.woodMaxHeight)} m`,
    !unbraced && !woodTall,
    'nbr7190',
    'warn',
  );
  const required = maxDrop > X.guardrailDrop;
  check(
    'guardrail',
    'Guarda-corpo',
    `desnível ${fmt(maxDrop)} m; ${guardrail ? `guarda-corpo de ${fmt(x.guardrailHeight)} m` : 'sem guarda-corpo'}`,
    required ? `exigido acima de ${fmt(X.guardrailDrop)} m` : `dispensado até ${fmt(X.guardrailDrop)} m`,
    !required || guardrail,
    'nbr14718',
  );
  const needStair = maxDrop > X.stair.singleStepMax;
  if (needStair && stairs.length === 0) {
    check('stair_missing', 'Escada', `desnível ${fmt(maxDrop)} m, sem escada`, `degrau único até ${fmt(X.stair.singleStepMax)} m`, false, 'nbr9050', 'warn');
  }
  stairs.forEach((s, i) => {
    const st = X.stair;
    const blondel = 2 * s.riserHeight + s.tread;
    const tag = stairs.length > 1 ? ` ${i + 1}` : '';
    check(`stair_riser_${i}`, `Escada${tag}: espelho`, `${fmt(s.riserHeight * 100, 1)} cm (${s.risers} espelhos)`, `${fmt(st.riserMin * 100, 0)} a ${fmt(st.riserMax * 100, 0)} cm`, s.riserHeight <= st.riserMax + 1e-6, 'nbr9050');
    check(`stair_tread_${i}`, `Escada${tag}: piso`, `${fmt(s.tread * 100, 1)} cm`, `mínimo ${fmt(st.treadMin * 100, 0)} cm`, s.tread >= st.treadMin - 1e-6, 'nbr9050');
    check(`stair_blondel_${i}`, `Escada${tag}: Blondel (2e + p)`, `${fmt(blondel * 100, 1)} cm`, `${fmt(st.blondelMin * 100, 0)} a ${fmt(st.blondelMax * 100, 0)} cm`, blondel >= st.blondelMin - 1e-6 && blondel <= st.blondelMax + 1e-6, 'nbr9050');
  });
  // Tensão aproximada no solo: área de influência × (cargas) / área da sapata.
  const load = X.liveLoadKPa + X.deadLoadKPa;
  let worstStress = 0;
  for (const s of supports) {
    const area = s.footing.kind === 'pad' ? s.footing.width * s.footing.width : (Math.PI * s.footing.width * s.footing.width) / 4;
    worstStress = Math.max(worstStress, (tribAlong * tribAcross * load) / area);
  }
  check(
    'footing_stress',
    'Fundação: tensão aproximada no solo',
    `${fmt(worstStress, 0)} kPa`,
    `${fmt(project.design.soilBearingKPa, 0)} kPa (solo admitido)`,
    worstStress <= project.design.soilBearingKPa + 1e-9,
    'nbr6122',
  );
  if (maxNaturalDiff > 0.3) {
    check('on_slope', 'Deck sobre talude ou muro', `terreno acabado até ${fmt(maxNaturalDiff)} m do natural`, 'apoiar em solo natural', false, 'nbr6122', 'warn');
  }
  if (roofClipped) {
    check('roof_clearance', 'Cobertura do deck: pé-direito livre', 'abaixo do mínimo do catálogo', `${fmt(x.deckCoverMinClearance)} m`, false, undefined, 'warn');
  }

  m.deck = {
    facade: { origin: g.face.origin, t: g.face.t, n: g.face.n, length: g.face.len },
    topZ,
    boardThickness: X.board.thickness,
    boardDir,
    joists,
    beams,
    ledger,
    supports,
    stairs,
    maxDrop,
    guardrail,
    railGaps,
    checks,
  };
  return m;
}

/**
 * Fase 18 (card F18-D). Refaz cada deck com a estrutura (barrotes, vigas, ledger), os pilares até o terreno acabado,
 * as fundações, escadas, guarda-corpo e verificações. Roda em `compute` depois do terreno; muta `model.extras`.
 */
export function attachDeckFrames(project: Project, model: BuildingModel, surface: SiteSurface, catalog: Catalog): void {
  const x = catalog.constants.extras;
  model.extras.forEach((em, i) => {
    const e = project.extras.find((p) => p.id === em.id);
    if (!e || e.kind !== 'deck') return;
    model.extras[i] = buildDeckModel(project, e, x, {
      footprint: model.footprint,
      roofPlanes: model.roofPlanes,
      surface,
      openings: model.openings,
      walls: model.walls,
    });
  });
}

/** Centros (ao longo da face escolhida, a partir da quina) de todas as portas dessa face, dentro do deck ou não: para "centralizar na porta". */
export function deckDoorCenters(project: Project, e: DeckE, model: BuildingModel, catalog: Catalog): number[] {
  const g = deckGeometry(project, e, { x: catalog.constants.extras, footprint: model.footprint });
  if (g.polygon.length === 0) return [];
  return doorCenters(g, { footprint: model.footprint, roofPlanes: [], surface: flatSurfaceStub, openings: model.openings, walls: model.walls }, false);
}
