import { getProfile, type Catalog, type Profile } from '@chalecad/catalog';
import type { Project } from '../schema/project';
import {
  DISCLAIMER,
  type BuildingModel,
  type CheckStatus,
  type HostWall,
  type Piece,
  type QuantityReport,
  type StructuralCheck,
  type StructuralReport,
  type WeightReport,
} from '../schema/results';
import { compression, G, momentResistance, simpleBeam } from './capacity';
import { nf } from './format';
import { computeLoads, type LoadSet } from './loads';
import { suggest, type SuggestSpec } from './suggest';

export { windPressure } from './loads';
export * as structuralCapacity from './capacity';

export interface StructureContext {
  project: Project;
  model: BuildingModel;
  pieces: Piece[];
  weight: WeightReport;
  catalog: Catalog;
  /** Opcional: contagem real de chumbadores e hold-downs. Sem ela, estima-se pelo espaçamento do catálogo. */
  quantities?: QuantityReport;
}

const RATIO_CAP = 99;
const safe = (v: number) => (Number.isFinite(v) ? Math.min(Math.max(v, 0), RATIO_CAP) : RATIO_CAP);

export function statusOf(ratio: number, usage: { warn: number; fail: number }): CheckStatus {
  if (ratio < usage.warn) return 'ok';
  return ratio <= usage.fail ? 'warn' : 'fail';
}

// ---------------------------------------------------------------------------
// Geometria auxiliar
// ---------------------------------------------------------------------------

type V2 = [number, number];
const dirOf = (w: HostWall): V2 => {
  const L = Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]) || 1;
  return [(w.to[0] - w.from[0]) / L, (w.to[1] - w.from[1]) / L];
};
/** Coordenada ao longo da parede (m) do ponto p. */
const uOf = (w: HostWall, p: V2): number => {
  const d = dirOf(w);
  return (p[0] - w.from[0]) * d[0] + (p[1] - w.from[1]) * d[1];
};
const distToLine = (w: HostWall, p: V2): number => {
  const d = dirOf(w);
  return Math.abs((p[0] - w.from[0]) * d[1] - (p[1] - w.from[1]) * d[0]);
};
const wallAxis = (w: HostWall): 0 | 1 => (Math.abs(w.to[0] - w.from[0]) >= Math.abs(w.to[1] - w.from[1]) ? 0 : 1);

interface LineLoad {
  /** Permanente e variável em kN/m de parede. */
  dead: number;
  live: number;
}

interface WallLoads {
  roof: LineLoad;
  /** Mezanino que apoia na parede, com o trecho [u0, u1] onde a laje se apoia. */
  floor: { dead: number; live: number; u0: number; u1: number; span: number } | null;
  own: number;
}

function wallLoadsAt(wl: WallLoads, u0: number, u1: number): LineLoad {
  let dead = wl.roof.dead + wl.own;
  let live = wl.roof.live;
  if (wl.floor && Math.min(u1, wl.floor.u1) - Math.max(u0, wl.floor.u0) > 1e-6) {
    dead += wl.floor.dead;
    live += wl.floor.live;
  }
  return { dead, live };
}

const eaveOf = (project: Project): number => (project.typology as { eave?: number }).eave ?? 0;

/** Distribui a carga das águas e dos mezaninos nas paredes que as recebem. */
function assignWallLoads(ctx: StructureContext, ls: LoadSet): Map<string, WallLoads> {
  const { model, project, catalog, pieces } = ctx;
  const l = catalog.constants.loads;
  const map = new Map<string, WallLoads>();
  const bearing = model.walls.filter((w) => w.kind !== 'interior' || w.loadBearing);
  for (const w of bearing) {
    const kg = ctx.weight.byElement.find((e) => e.id === w.id)?.kg ?? 0;
    map.set(w.id, { roof: { dead: 0, live: 0 }, floor: null, own: w.length > 0 ? (kg * G) / 1000 / w.length : 0 });
  }

  // Cobertura: cada água descarrega nas paredes paralelas ao beiral (e à cumeeira, se houver apoio no alto da água).
  const near = eaveOf(project) + 0.15;
  const eaveWalls = bearing.filter((w) => w.kind !== 'parapet');
  for (const p of model.roofPlanes) {
    const cos = Math.cos((p.slopeDeg * Math.PI) / 180);
    const dead = ls.roofDeadKPa * p.vLength;
    const live = l.liveRoof * cos * p.vLength;
    const o: V2 = [p.origin[0], p.origin[1]];
    const top: V2 = [p.origin[0] + p.vAxis[0] * p.vLength, p.origin[1] + p.vAxis[1] * p.vLength];
    const uLen = Math.hypot(p.uAxis[0], p.uAxis[1]);
    if (uLen < 0.5) continue; // água inclinada demais em planta para este critério
    const ua: V2 = [p.uAxis[0] / uLen, p.uAxis[1] / uLen];
    const cand = eaveWalls.filter((w) => {
      const d = dirOf(w);
      if (Math.abs(d[0] * ua[1] - d[1] * ua[0]) > 0.05) return false;
      const a = uOf(w, [o[0], o[1]]);
      const b = uOf(w, [o[0] + ua[0] * p.uLength, o[1] + ua[1] * p.uLength]);
      return Math.min(Math.max(a, b), w.length) - Math.max(Math.min(a, b), 0) > 0.1;
    });
    if (cand.length === 0) continue;
    const nearest = (pt: V2) => cand.reduce((b, w) => (distToLine(w, pt) < distToLine(b, pt) ? w : b));
    const wB = nearest(o);
    const wT = nearest(top);
    const targets: { w: HostWall; share: number }[] = [];
    const bOk = distToLine(wB, o) <= near;
    const tOk = distToLine(wT, top) <= near;
    if (bOk && tOk && wB.id !== wT.id) targets.push({ w: wB, share: 0.5 }, { w: wT, share: 0.5 });
    else if (bOk) targets.push({ w: wB, share: 1 });
    else if (tOk) targets.push({ w: wT, share: 1 });
    else {
      const w = distToLine(wB, o) <= distToLine(wT, top) ? wB : wT;
      targets.push({ w, share: 1 });
    }
    for (const t of targets) {
      const wl = map.get(t.w.id);
      if (!wl) continue;
      wl.roof.dead += dead * t.share;
      wl.roof.live += live * t.share;
    }
  }

  // Mezanino: vigas apoiam nas paredes perpendiculares a elas, sobre as bordas da laje.
  for (const s of model.slabs) {
    if (s.kind !== 'mezzanine') continue;
    const joists = pieces.filter((p) => p.hostId === s.id && p.role === 'joist');
    if (joists.length === 0) continue;
    const span = Math.max(...joists.map((j) => j.length));
    const j0 = joists[0]!;
    const spanAxis: 0 | 1 = Math.abs(j0.end[0] - j0.start[0]) >= Math.abs(j0.end[1] - j0.start[1]) ? 0 : 1;
    const perp = (1 - spanAxis) as 0 | 1;
    const xs = s.polygon.map((q) => q[spanAxis]);
    const ps = s.polygon.map((q) => q[perp]);
    const [aMin, aMax] = [Math.min(...xs), Math.max(...xs)];
    const [pMin, pMax] = [Math.min(...ps), Math.max(...ps)];
    const dead = ((ls.slabSelfKPa.get(s.id) ?? 0) + l.superimposedFloor) * (span / 2);
    const live = l.liveMezzanine * (span / 2);
    for (const w of bearing) {
      if (wallAxis(w) !== perp || w.baseZ >= s.topZ - 0.5) continue;
      const c = w.from[spanAxis];
      if (Math.abs(c - aMin) > 0.05 && Math.abs(c - aMax) > 0.05) continue;
      const wa = Math.min(w.from[perp], w.to[perp]);
      const wb = Math.max(w.from[perp], w.to[perp]);
      const lo = Math.max(wa, pMin);
      const hi = Math.min(wb, pMax);
      if (hi - lo < 0.1) continue;
      const wl = map.get(w.id);
      if (!wl) continue;
      const sgn = w.to[perp] >= w.from[perp] ? 1 : -1;
      const uA = sgn > 0 ? lo - w.from[perp] : w.from[perp] - hi;
      const uB = sgn > 0 ? hi - w.from[perp] : w.from[perp] - lo;
      wl.floor = { dead, live, u0: uA, u1: uB, span };
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Verificações
// ---------------------------------------------------------------------------

function medianOf(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * Altura de cálculo do montante. Parede retangular: o maior montante. Empena/meia-água (contorno não retangular):
 * os montantes variam; assume-se travamento lateral na linha do beiral (guia superior do pavimento, mezanino e OSB),
 * então vale o menor entre o comprimento mediano e a altura do beiral.
 */
function studDesignLength(w: HostWall, lengths: number[]): number {
  const vs = [...new Set(w.outline.map((p) => Math.round(p[1] * 1000) / 1000))].filter((v) => v > 1e-6);
  const max = Math.max(...lengths);
  if (vs.length <= 1) return max;
  const eave = Math.min(...vs.filter((v) => v >= 1), ...(vs.some((v) => v >= 1) ? [] : [Math.max(...vs)]));
  return Math.min(medianOf(lengths), eave);
}

export function computeStructure(ctx: StructureContext): StructuralReport {
  const { project, model, pieces, weight, catalog } = ctx;
  const c = catalog.constants;
  const l = c.loads;
  const E = c.steelE;
  const ls = computeLoads(project, model, weight, catalog);
  const lo = ls.report;
  const spacing0 = project.system.studSpacing;
  const wallLoads = assignWallLoads(ctx, ls);
  const drafts: { check: StructuralCheck; spec?: SuggestSpec }[] = [];

  const push = (
    check: Omit<StructuralCheck, 'ratio' | 'status'> & { ratio?: number },
    spec?: Omit<SuggestSpec, 'currentRatio'>,
  ) => {
    const ratio = safe(check.ratio ?? check.demand / check.capacity);
    const full: StructuralCheck = { ...check, ratio, status: statusOf(ratio, c.usage) };
    drafts.push({ check: full, spec: spec ? { ...spec, currentRatio: ratio } : undefined });
  };
  const piecesOf = (hostId: string, roles: Piece['role'][]) =>
    pieces.filter((p) => p.hostId === hostId && roles.includes(p.role));
  const profileFor = (p: Piece | undefined, fallback: string): Profile => getProfile(catalog, p?.profileId ?? fallback);

  // 1. Montantes -----------------------------------------------------------
  for (const w of model.walls) {
    const wl = wallLoads.get(w.id);
    const studs = piecesOf(w.id, ['stud', 'stud_corner']);
    if (!wl || studs.length === 0) continue;
    const prof = profileFor(studs[0], project.system.profiles.wallStud);
    const L = studDesignLength(w, studs.map((p) => p.length));
    const G_ = wl.roof.dead + wl.own + (wl.floor?.dead ?? 0);
    const Q_ = wl.roof.live + (wl.floor?.live ?? 0);
    const evalStud = (p: Profile, s: number) => {
      const cp = compression(p, E, L, c.lsf.blockingSpacing, c.structureFactors);
      const Mw = (lo.windWallKPa * s * L * L) / 8;
      const Mrd = momentResistance(p, c.structureFactors);
      // C1: sobrecarga principal, vento secundário. C2: vento principal, sobrecarga secundária.
      const N1 = (l.gammaG * G_ + l.gammaQ * Q_) * s;
      const M1 = c.structureFactors.psiWind * l.gammaW * Mw;
      const N2 = (l.gammaG * G_ + c.structureFactors.psiLive * l.gammaQ * Q_) * s;
      const M2 = l.gammaW * Mw;
      const r1 = N1 / cp.NcRd + M1 / Mrd;
      const r2 = N2 / cp.NcRd + M2 / Mrd;
      const first = r1 >= r2;
      return { cp, Mrd, ratio: Math.max(r1, r2), N: first ? N1 : N2, M: first ? M1 : M2, combo: first ? 1 : 2 };
    };
    const e = evalStud(prof, spacing0);
    push(
      {
        id: `stud:${w.id}`,
        kind: 'stud',
        label: `Montantes da parede ${w.id} (${prof.id} a cada ${nf(spacing0, 1)} m)`,
        pieceIds: studs.map((p) => p.id),
        hostIds: [w.id],
        demand: e.N,
        capacity: e.cp.NcRd,
        unit: 'kN',
        ratio: e.ratio,
        detail:
          `N = ${nf(e.N)} kN; Nc,Rd = ${nf(e.cp.NcRd)} kN (χ = ${nf(e.cp.chi)}, λ0 = ${nf(e.cp.lambda0)}, L = ${nf(L)} m); ` +
          `M = ${nf(e.M)} kN·m; Mrd = ${nf(e.Mrd)} kN·m; N/Nc,Rd + M/Mrd = ${nf(e.ratio)} (combinação ${e.combo === 1 ? '1,4G + 1,5Q + 0,6·1,4W' : '1,4G + 0,5·1,5Q + 1,4W'})`,
      },
      { pieces: studs, profile: prof, spacing: spacing0, ratioFn: (p, s) => evalStud(p, s).ratio, allowSpacing: true },
    );
  }

  // 2. Vigas do mezanino ---------------------------------------------------
  for (const s of model.slabs) {
    if (s.kind !== 'mezzanine') continue;
    const joists = piecesOf(s.id, ['joist']);
    if (joists.length === 0) continue;
    const prof = profileFor(joists[0], project.system.profiles.joist);
    const L = Math.max(...joists.map((j) => j.length));
    const self = ls.slabSelfKPa.get(s.id) ?? 0;
    const g = self + l.superimposedFloor;
    const evalJoist = (p: Profile, sp: number) =>
      simpleBeam({
        profile: p,
        L,
        wUls: (l.gammaG * g + l.gammaQ * l.liveMezzanine) * sp,
        wServ: (g + l.liveMezzanine) * sp,
        deflDen: c.deflection.floor,
        E,
        factors: c.structureFactors,
      });
    const r = evalJoist(prof, spacing0);
    push(
      {
        id: `joist:${s.id}`,
        kind: 'joist',
        label: `Vigas do mezanino ${s.id} (${prof.id}, vão ${nf(L)} m)`,
        pieceIds: joists.map((p) => p.id),
        hostIds: [s.id],
        demand: Math.max(r.M, 0),
        capacity: r.Mrd,
        unit: 'kN·m',
        ratio: r.ratio,
        detail:
          `q = ${nf((g + l.liveMezzanine) * spacing0)} kN/m (serviço); M = ${nf(r.M)} kN·m, Mrd = ${nf(r.Mrd)} kN·m (taxa ${nf(r.rM)}); ` +
          `V = ${nf(r.V)} kN, Vrd = ${nf(r.Vrd)} kN (${nf(r.rV)}); flecha = ${nf(r.delta)} cm, limite L/${c.deflection.floor} = ${nf(r.deltaLim)} cm (${nf(r.rD)})`,
      },
      { pieces: joists, profile: prof, spacing: spacing0, ratioFn: (p, sp) => evalJoist(p, sp).ratio, allowSpacing: true },
    );
  }

  // 3. Caibros -------------------------------------------------------------
  const rafters = pieces.filter((p) => p.role === 'rafter');
  if (rafters.length > 0) {
    const longest = rafters.reduce((b, p) => (p.length > b.length ? p : b));
    const plane = model.roofPlanes.find((p) => p.id === longest.hostId);
    const prof = profileFor(longest, project.system.profiles.rafter);
    const cos = Math.cos(((plane?.slopeDeg ?? 0) * Math.PI) / 180);
    const g = ls.roofDeadKPa;
    const evalRafter = (p: Profile, sp: number) => {
      const s = Math.min(c.roof.rafterSpacing, sp);
      const grav = s * cos * (l.gammaG * g + l.gammaQ * l.liveRoof * cos);
      const uplift = s * (l.gammaW * lo.windRoofUpliftKPa - 0.9 * g * cos);
      const wUls = Math.max(grav, uplift);
      return {
        ...simpleBeam({ profile: p, L: longest.length, wUls, wServ: s * cos * (g + l.liveRoof * cos), deflDen: c.deflection.roof, E, factors: c.structureFactors }),
        governs: uplift > grav ? 'sucção (0,9G − 1,4W)' : 'gravidade (1,4G + 1,5Q)',
        s,
      };
    };
    const r = evalRafter(prof, spacing0);
    push(
      {
        id: 'rafter',
        kind: 'rafter',
        label: `Caibros (${prof.id}, vão inclinado ${nf(longest.length)} m, a cada ${nf(r.s, 1)} m)`,
        pieceIds: rafters.map((p) => p.id),
        hostIds: [...new Set(rafters.map((p) => p.hostId))],
        demand: r.M,
        capacity: r.Mrd,
        unit: 'kN·m',
        ratio: r.ratio,
        detail:
          `Rege ${r.governs}; M = ${nf(r.M)} kN·m, Mrd = ${nf(r.Mrd)} kN·m (${nf(r.rM)}); V = ${nf(r.V)} kN, Vrd = ${nf(r.Vrd)} kN (${nf(r.rV)}); ` +
          `flecha = ${nf(r.delta)} cm, limite L/${c.deflection.roof} = ${nf(r.deltaLim)} cm (${nf(r.rD)})`,
      },
      { pieces: rafters, profile: prof, spacing: spacing0, ratioFn: (p, sp) => evalRafter(p, sp).ratio, allowSpacing: true },
    );
  }

  // 4. Terças / cartolas -----------------------------------------------------
  const purlins = pieces.filter((p) => p.role === 'purlin');
  if (purlins.length > 0) {
    const prof = profileFor(purlins[0], project.system.profiles.purlin);
    const L = Math.min(c.roof.rafterSpacing, spacing0);
    let worst: { r: ReturnType<typeof simpleBeam>; governs: string } | null = null;
    const planeIds = [...new Set(purlins.map((p) => p.hostId))];
    for (const id of planeIds) {
      const plane = model.roofPlanes.find((p) => p.id === id);
      const cos = Math.cos(((plane?.slopeDeg ?? 0) * Math.PI) / 180);
      const g = ls.roofDeadKPa;
      const t = c.roof.purlinSpacing;
      const grav = t * cos * (l.gammaG * g + l.gammaQ * l.liveRoof * cos);
      const uplift = t * (l.gammaW * lo.windRoofUpliftKPa - 0.9 * g * cos);
      const r = simpleBeam({
        profile: prof,
        L,
        wUls: Math.max(grav, uplift),
        wServ: t * cos * (g + l.liveRoof * cos),
        deflDen: c.deflection.roof,
        E,
        factors: c.structureFactors,
      });
      if (!worst || r.ratio > worst.r.ratio) worst = { r, governs: uplift > grav ? 'sucção' : 'gravidade' };
    }
    if (worst) {
      const r = worst.r;
      push({
        id: 'purlin',
        kind: 'purlin',
        label: `Terças/cartolas (${prof.id}, vão ${nf(L)} m)`,
        pieceIds: purlins.map((p) => p.id),
        hostIds: planeIds,
        demand: r.M,
        capacity: r.Mrd,
        unit: 'kN·m',
        ratio: r.ratio,
        detail:
          `Rege ${worst.governs}; M = ${nf(r.M)} kN·m, Mrd = ${nf(r.Mrd)} kN·m (${nf(r.rM)}); ` +
          `flecha = ${nf(r.delta)} cm, limite L/${c.deflection.roof} = ${nf(r.deltaLim)} cm (${nf(r.rD)})`,
      });
    }
  }

  // 5. Vergas ----------------------------------------------------------------
  const groups = new Map<string, { host: HostWall; width: number; ops: BuildingModel['openings'] }>();
  for (const o of model.openings) {
    if (!o.valid || o.hostKind !== 'wall' || o.u1 - o.u0 <= 1) continue;
    const host = model.walls.find((w) => w.id === o.hostId);
    if (!host) continue;
    const width = Math.round((o.u1 - o.u0) * 100) / 100;
    const key = `${o.hostId}|${width}`;
    const gr = groups.get(key) ?? { host, width, ops: [] };
    gr.ops.push(o);
    groups.set(key, gr);
  }
  for (const [key, gr] of groups) {
    const wl = wallLoads.get(gr.host.id) ?? { roof: { dead: 0, live: 0 }, floor: null, own: 0 };
    const hdrs = piecesOf(gr.host.id, ['header']).filter((p) => {
      const u = uOf(gr.host, [(p.start[0] + p.end[0]) / 2, (p.start[1] + p.end[1]) / 2]);
      return gr.ops.some((o) => u >= o.u0 - 1e-6 && u <= o.u1 + 1e-6);
    });
    const prof = profileFor(hdrs[0], project.system.profiles.wallStud);
    const nBox = Math.max(1, Math.round(hdrs.length / gr.ops.length));
    let worst: ReturnType<typeof simpleBeam> | null = null;
    let wWorst = 0;
    for (const o of gr.ops) {
      const ll = wallLoadsAt(wl, o.u0, o.u1);
      const wUls = l.gammaG * ll.dead + l.gammaQ * ll.live;
      const r = simpleBeam({ profile: prof, L: gr.width, wUls, wServ: ll.dead + ll.live, deflDen: c.deflection.header, E, factors: c.structureFactors, n: nBox });
      if (!worst || r.ratio > worst.ratio) {
        worst = r;
        wWorst = wUls;
      }
    }
    if (!worst) continue;
    push({
      id: `header:${key}`,
      kind: 'header',
      label: `Verga de ${nf(gr.width)} m em ${gr.host.id} (${gr.ops.length} abertura${gr.ops.length > 1 ? 's' : ''}, ${nBox} × ${prof.id})`,
      pieceIds: hdrs.map((p) => p.id),
      hostIds: [gr.host.id],
      demand: worst.M,
      capacity: worst.Mrd,
      unit: 'kN·m',
      ratio: worst.ratio,
      detail:
        `q = ${nf(wWorst)} kN/m (ELU); M = ${nf(worst.M)} kN·m, Mrd = ${nf(worst.Mrd)} kN·m (${nf(worst.rM)}); ` +
        `V = ${nf(worst.V)} kN, Vrd = ${nf(worst.Vrd)} kN (${nf(worst.rV)}); flecha = ${nf(worst.delta)} cm, limite L/${c.deflection.header} = ${nf(worst.deltaLim)} cm (${nf(worst.rD)})`,
    });
  }

  // 6. Contraventamento ------------------------------------------------------
  const extWalls = model.walls.filter((w) => w.kind !== 'interior' && w.kind !== 'parapet');
  for (const axis of [0, 1] as const) {
    const ws = extWalls.filter((w) => wallAxis(w) === axis);
    const total = ws.reduce((a, w) => a + w.length, 0);
    if (total <= 0) continue;
    let braced = 0;
    const strapIds: string[] = [];
    for (const w of ws) {
      if (project.system.bracing === 'strap') {
        const straps = piecesOf(w.id, ['strap']);
        const proj = straps.reduce((a, p) => {
          const u0 = uOf(w, [p.start[0], p.start[1]]);
          const u1 = uOf(w, [p.end[0], p.end[1]]);
          return a + Math.abs(u1 - u0);
        }, 0);
        braced += Math.min(proj / 2, w.length); // um X = duas fitas sobre o mesmo painel
        strapIds.push(...straps.map((p) => p.id));
      } else {
        const ivs = model.openings
          .filter((o) => o.valid && o.hostId === w.id && o.hostKind === 'wall')
          .map((o) => [Math.max(0, o.u0), Math.min(w.length, o.u1)] as [number, number])
          .sort((a, b) => a[0] - b[0]);
        let cursor = 0;
        const panels: number[] = [];
        for (const [a, b] of ivs) {
          panels.push(a - cursor);
          cursor = Math.max(cursor, b);
        }
        panels.push(w.length - cursor);
        braced += panels.filter((p) => p >= 1.2 - 1e-9).reduce((a, p) => a + p, 0);
      }
    }
    const capacity = braced / total;
    const demand = c.bracingMinRatio;
    const name = axis === 0 ? 'x (fachadas frontal e posterior)' : 'y (fachadas laterais)';
    push({
      id: `bracing:${axis === 0 ? 'x' : 'y'}`,
      kind: 'bracing',
      label: `Contraventamento na direção ${name}`,
      pieceIds: strapIds,
      hostIds: ws.map((w) => w.id),
      demand,
      capacity,
      unit: 'razão de comprimento',
      ratio: capacity > 0 ? demand / capacity : RATIO_CAP,
      detail:
        `${project.system.bracing === 'strap' ? 'Fitas em X' : 'OSB (painéis sem abertura ≥ 1,2 m)'}: ${nf(braced)} m contraventados de ${nf(total)} m de fachada ` +
        `(razão ${nf(capacity)}); mínimo ${nf(demand)}; taxa = mínimo / razão`,
    });
  }

  // 7. Ancoragem -------------------------------------------------------------
  {
    const planArea = model.roofPlanes.reduce((a, p) => a + p.area * Math.cos((p.slopeDeg * Math.PI) / 180), 0);
    const suction = lo.windRoofUpliftKPa * planArea;
    const selfWeight = 0.9 * (weight.superstructureKg * G) / 1000;
    const uplift = Math.max(0, suction - selfWeight);
    const ql = ctx.quantities?.lines;
    const exteriorLen = model.walls.filter((w) => w.kind !== 'interior').reduce((a, w) => a + w.length, 0);
    const anchors = ql ? (ql.find((x) => x.itemId === 'anchor_bolt')?.netQty ?? 0) : Math.ceil(exteriorLen / c.lsf.anchorSpacing);
    const holdDowns = ql ? (ql.find((x) => x.itemId === 'hold_down')?.netQty ?? 0) : 0;
    const capacity = anchors * c.anchorage.anchorKN + holdDowns * c.anchorage.holdDownKN;
    push({
      id: 'anchorage',
      kind: 'anchorage',
      label: 'Ancoragem ao radier (arrancamento)',
      pieceIds: [],
      hostIds: ['radier'],
      demand: uplift,
      capacity,
      unit: 'kN',
      ratio: capacity > 0 ? uplift / capacity : uplift > 0 ? RATIO_CAP : 0,
      detail:
        `Sucção = ${nf(lo.windRoofUpliftKPa)} kPa × ${nf(planArea, 1)} m² = ${nf(suction)} kN; menos 0,9 × peso próprio (${nf(selfWeight)} kN) = ${nf(uplift)} kN; ` +
        `capacidade = ${nf(anchors, 0)} chumbadores × ${nf(c.anchorage.anchorKN, 0)} kN + ${nf(holdDowns, 0)} hold-downs × ${nf(c.anchorage.holdDownKN, 0)} kN = ${nf(capacity, 0)} kN`,
    });
  }

  // 8. Radier ----------------------------------------------------------------
  {
    const slab = model.slabs.find((s) => s.kind === 'radier');
    if (slab && slab.area > 0) {
      const roofPlan = model.roofPlanes.reduce((a, p) => a + p.area * Math.cos((p.slopeDeg * Math.PI) / 180), 0);
      const mezzArea = model.slabs.filter((s) => s.kind === 'mezzanine').reduce((a, s) => a + s.area, 0);
      const permanent = (weight.totalKg * G) / 1000 + l.superimposedRoof * roofPlan + l.superimposedFloor * mezzArea;
      const live = l.liveRoof * roofPlan + l.liveMezzanine * mezzArea;
      const pressure = (permanent + live) / slab.area;
      const allow = project.design.soilBearingKPa;
      push({
        id: 'soil',
        kind: 'soil',
        label: 'Tensão no solo sob o radier',
        pieceIds: [],
        hostIds: [slab.id],
        demand: pressure,
        capacity: allow,
        unit: 'kPa',
        ratio: pressure / allow,
        detail:
          `Carga de serviço = ${nf(permanent)} kN permanente (inclui radier) + ${nf(live)} kN de sobrecarga = ${nf(permanent + live)} kN; ` +
          `área = ${nf(slab.area, 1)} m²; pressão = ${nf(pressure)} kPa; admissível = ${nf(allow, 0)} kPa`,
      });
    }
  }

  // Sugestões ----------------------------------------------------------------
  const checks = drafts.map(({ check, spec }) => {
    if (check.status === 'ok' || !spec) return check;
    const suggestion = suggest(spec, project, catalog);
    return suggestion ? { ...check, suggestion } : check;
  });

  const summary = {
    ok: checks.filter((x) => x.status === 'ok').length,
    warn: checks.filter((x) => x.status === 'warn').length,
    fail: checks.filter((x) => x.status === 'fail').length,
    maxRatio: checks.reduce((a, x) => Math.max(a, x.ratio), 0),
  };
  return { checks, loads: lo, summary, disclaimer: DISCLAIMER };
}

