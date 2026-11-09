/**
 * Corte (seção vertical) em SVG a partir do `BuildingModel`, função pura.
 *
 * Eixo A: corte transversal, plano em y = `at`, olhando para os fundos (+y); horizontal da figura = x.
 * Eixo B: corte longitudinal, plano em x = `at`, olhando para −x; horizontal da figura = y.
 * Mostra o perfil do terreno (natural e platô), o radier, as paredes cortadas (hachura) e as vistas além, o piso do
 * mezanino, a escada, o telhado (águas com a espessura da telha), aberturas cortadas, cotas verticais e níveis.
 */
import type { BuildingModel, HostWall, ResolvedOpening, RoofPlane, Site, Vec2 } from '@chalecad/engine';
import { fmt } from '../project/format';
import { deckPillarLayout, deckStairLayout, type DeckBox } from '../project/extras';
import { bounds, crossings, finalZ, naturalZ } from './geom';
import { PAPER, SCREEN, fmtLevel, hatchPattern, levelMark, pDimV, type PaperStyle } from './paper';
import { GUIDE, INK, MUTED, esc, group, line, n2, poly, rect, svgDocument, tag, text, type SvgDoc } from './svg';

export type SectionAxis = 'A' | 'B';

export interface SectionOptions {
  /** Unidades de SVG por metro: 60 na tela (padrão); 1000 / escala no papel. */
  unitsPerMeter?: number;
  /** Papel (mm, espessuras ABNT, sem fundo branco). Padrão: false (tela). */
  paper?: boolean;
  idPrefix?: string;
  site?: Site;
  /** `terrain.platformZ`: cota do platô em relação ao terreno natural no centro (terreno inclinado). */
  platformZ?: number;
  /** Espessura da telha/painel de cobertura (m). */
  roofThickness?: number;
  /** Nomes dos níveis (id → nome). */
  levelNames?: Record<string, string>;
}

export interface SectionDim {
  kind: 'ceiling' | 'floor' | 'eave' | 'ridge';
  /** Valor em metros. */
  value: number;
  label: string;
  level?: string;
}

export interface SectionDoc extends SvgDoc {
  axis: SectionAxis;
  /** Coordenada do plano de corte (y no eixo A, x no B). */
  at: number;
  dims: SectionDim[];
  /** Níveis marcados (cota e rótulo). */
  levels: { z: number; label: string }[];
  /** Conteúdo e `<defs>` separados, para compor numa folha. */
  body: string;
  defs: string;
}

const EPS = 1e-6;

/** Posição padrão do plano: A no meio da profundidade; B no meio da largura, deslocado para a escada (ou banheiro). */
export function defaultSectionAt(model: BuildingModel, axis: SectionAxis): number {
  const b = bounds(model.footprint.length ? model.footprint : [[0, 0]]);
  if (axis === 'A') return round((b.y0 + b.y1) / 2);
  const stair = model.stairs.find((s) => s.footprint.length > 2);
  if (stair) {
    const sb = bounds(stair.footprint);
    return round((sb.x0 + sb.x1) / 2);
  }
  const bath = model.rooms.find((r) => r.use === 'bathroom' && r.polygon);
  if (bath?.polygon) {
    const bb = bounds(bath.polygon);
    return round((bb.x0 + bb.x1) / 2);
  }
  return round((b.x0 + b.x1) / 2);
}
const round = (v: number) => Math.round(v * 100) / 100;

const wallTop = (w: HostWall) => w.outline.reduce((m, p) => Math.max(m, p[1]), 0);

/** Faixa vertical [vmin, vmax] do contorno da parede na posição u. */
function outlineSpan(w: HostWall, u: number): [number, number] | null {
  const vs = crossings(w.outline, 0, u);
  if (vs.length < 2) return null;
  return [vs[0]!, vs[vs.length - 1]!];
}

/**
 * Perfil do terreno ao longo de uma linha em planta: `final` (platô e taludes; plano em z = 0 no terreno plano) e,
 * em terreno inclinado, o `natural`. `point(h)` dá o ponto (x, y) da linha para a coordenada horizontal h.
 */
export function terrainProfile(
  fpb: { x0: number; x1: number; y0: number; y1: number },
  site: Site | undefined,
  platformZ: number,
  point: (h: number) => Vec2,
  hMin: number,
  hMax: number,
): { natural?: Vec2[]; final: Vec2[] } {
  if (site?.type !== 'sloped') return { final: [[hMin, 0], [hMax, 0]] };
  const nat = naturalZ(site, (fpb.x0 + fpb.x1) / 2, (fpb.y0 + fpb.y1) / 2);
  const m = site.platformMargin;
  const plat = { x0: fpb.x0 - m.left, x1: fpb.x1 + m.right, y0: fpb.y0 - m.front, y1: fpb.y1 + m.back };
  const natural: Vec2[] = [];
  const final: Vec2[] = [];
  const steps = 80;
  for (let i = 0; i <= steps; i++) {
    const h = hMin - 1 + ((hMax - hMin + 2) * i) / steps;
    const [x, y] = point(h);
    const n = nat(x, y) - platformZ;
    const dist = Math.hypot(Math.max(plat.x0 - x, 0, x - plat.x1), Math.max(plat.y0 - y, 0, y - plat.y1));
    natural.push([h, n]);
    final.push([h, finalZ(n, dist, 0, site)]);
  }
  return { natural, final };
}

export function sectionSvg(model: BuildingModel, axis: SectionAxis, at?: number, opts: SectionOptions = {}): SectionDoc {
  const paper = opts.paper ?? false;
  const st: PaperStyle = paper ? PAPER : SCREEN;
  const u = opts.unitsPerMeter ?? (paper ? 20 : 60);
  const pid = opts.idPrefix ?? 's';
  const T = st.text;
  const cutAt = at ?? defaultSectionAt(model, axis);
  const roofT = opts.roofThickness ?? 0.03;

  // Eixos: H = coordenada horizontal da figura; D = profundidade (cresce para longe do observador).
  const H = (x: number, y: number) => (axis === 'A' ? x : y);
  const D = (x: number, y: number) => (axis === 'A' ? y : -x);
  const atD = axis === 'A' ? cutAt : -cutAt;
  const planeAxis: 0 | 1 = axis === 'A' ? 1 : 0; // coordenada fixa no plano

  // --- Elementos ------------------------------------------------------------------------------------------------
  interface Cut { h0: number; h1: number; z0: number; z1: number }
  const cuts: Cut[] = [];
  const glass: { h: number; z0: number; z1: number }[] = [];
  const beyond: { pts: Vec2[]; depth: number; thin?: boolean }[] = [];
  const stairCuts: Cut[] = [];
  const stairBeyond: { h0: number; h1: number; z0: number; z1: number; depth: number }[] = [];

  const openingsByWall = new Map<string, ResolvedOpening[]>();
  for (const o of model.openings) if (o.hostKind === 'wall' && o.valid) openingsByWall.set(o.hostId, [...(openingsByWall.get(o.hostId) ?? []), o]);

  for (const w of model.walls) {
    const da = D(w.from[0], w.from[1]) - atD;
    const db = D(w.to[0], w.to[1]) - atD;
    const len = w.length || 1;
    const dx = (w.to[0] - w.from[0]) / len;
    const dy = (w.to[1] - w.from[1]) / len;
    if (da * db < 0 && Math.abs(da - db) > EPS) {
      const t = da / (da - db);
      const uu = t * len;
      const hc = H(w.from[0] + dx * uu, w.from[1] + dy * uu);
      const width = (w.thickness * len) / Math.abs(da - db);
      const span = outlineSpan(w, uu);
      if (!span) continue;
      const ops = (openingsByWall.get(w.id) ?? []).filter((o) => uu >= o.u0 - EPS && uu <= o.u1 + EPS).sort((a, b) => a.v0 - b.v0);
      let lo = span[0];
      for (const o of ops) {
        if (o.v0 > lo + EPS) cuts.push({ h0: hc - width / 2, h1: hc + width / 2, z0: w.baseZ + lo, z1: w.baseZ + o.v0 });
        glass.push({ h: hc, z0: w.baseZ + o.v0, z1: w.baseZ + o.v1 });
        lo = Math.max(lo, o.v1);
      }
      if (span[1] > lo + EPS) cuts.push({ h0: hc - width / 2, h1: hc + width / 2, z0: w.baseZ + lo, z1: w.baseZ + span[1] });
    } else if (Math.min(da, db) >= -EPS && Math.max(da, db) > EPS) {
      // Além do plano: projeção do contorno, longe primeiro.
      const pts = w.outline.map(([uu, vv]): Vec2 => [H(w.from[0] + dx * uu, w.from[1] + dy * uu), w.baseZ + vv]);
      beyond.push({ pts, depth: Math.min(da, db), thin: Math.abs(da - db) > EPS });
    }
  }

  // Lajes: radier, mezanino, deck.
  const slabCuts: Cut[] = [];
  const slabBeyond: { h0: number; h1: number; z0: number; z1: number; depth: number }[] = [];
  for (const s of model.slabs) {
    const z0 = s.topZ - s.thickness;
    const ds = s.polygon.map((p) => D(p[0], p[1]) - atD);
    if (Math.max(...ds) > EPS) {
      const hs = s.polygon.filter((_, i) => ds[i]! > -EPS).map((p) => H(p[0], p[1]));
      if (hs.length) slabBeyond.push({ h0: Math.min(...hs), h1: Math.max(...hs), z0, z1: s.topZ, depth: Math.min(...ds.filter((d) => d > -EPS)) });
    }
    const xs = crossings(s.polygon, planeAxis, cutAt);
    for (let i = 0; i + 1 < xs.length; i += 2) slabCuts.push({ h0: xs[i]!, h1: xs[i + 1]!, z0, z1: s.topZ });
  }

  // Escada: degraus cortados pelo plano ou além dele.
  for (const stair of model.stairs) {
    for (const t of stair.treads) {
      const r = (t.rotationZDeg * Math.PI) / 180;
      const [hx, hy] = [t.size[0] / 2, t.size[1] / 2];
      const pts = ([[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]] as Vec2[]).map(([x, y]): Vec2 => [t.center[0] + x * Math.cos(r) - y * Math.sin(r), t.center[1] + x * Math.sin(r) + y * Math.cos(r)]);
      const z0 = t.center[2] - t.size[2] / 2;
      const z1 = t.center[2] + t.size[2] / 2;
      const ds = pts.map((p) => D(p[0], p[1]) - atD);
      const crossed = Math.min(...ds) < -EPS && Math.max(...ds) > EPS;
      if (crossed) {
        const xs = crossings(pts, planeAxis, cutAt);
        if (xs.length >= 2) stairCuts.push({ h0: xs[0]!, h1: xs[xs.length - 1]!, z0, z1 });
      } else if (Math.min(...ds) >= -EPS) {
        const hs = pts.map((p) => H(p[0], p[1]));
        stairBeyond.push({ h0: Math.min(...hs), h1: Math.max(...hs), z0, z1, depth: Math.min(...ds) });
      }
    }
  }

  // Deck (F18-D): piso, pilares e escada do deck cortados pelo plano ou além dele; a água da cobertura entra no telhado.
  const deckCuts: Cut[] = [];
  const deckBeyond: { h0: number; h1: number; z0: number; z1: number; depth: number }[] = [];
  const deckRoofs: RoofPlane[] = [];
  const addDeckBox = (b: DeckBox) => {
    const r = b.yaw;
    const [hx, hy] = [b.size[0] / 2, b.size[1] / 2];
    const pts = ([[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]] as Vec2[]).map(([x, y]): Vec2 => [b.center[0] + x * Math.cos(r) - y * Math.sin(r), b.center[1] + x * Math.sin(r) + y * Math.cos(r)]);
    const z0 = b.center[2] - b.size[2] / 2;
    const z1 = b.center[2] + b.size[2] / 2;
    const ds = pts.map((p) => D(p[0], p[1]) - atD);
    if (Math.min(...ds) < -EPS && Math.max(...ds) > EPS) {
      const xs = crossings(pts, planeAxis, cutAt);
      if (xs.length >= 2) deckCuts.push({ h0: xs[0]!, h1: xs[xs.length - 1]!, z0, z1 });
    } else if (Math.min(...ds) >= -EPS) {
      const hs = pts.map((p) => H(p[0], p[1]));
      deckBeyond.push({ h0: Math.min(...hs), h1: Math.max(...hs), z0, z1, depth: Math.min(...ds) });
    }
  };
  for (const em of model.extras ?? []) {
    if (em.kind !== 'deck') continue;
    if (em.roof) deckRoofs.push(em.roof);
    const d = em.deck;
    if (!d || !em.polygon) continue;
    const zFloor0 = d.topZ - d.boardThickness - (d.joists[0]?.depth ?? 0.15);
    const xs = crossings(em.polygon, planeAxis, cutAt);
    for (let i = 0; i + 1 < xs.length; i += 2) deckCuts.push({ h0: xs[i]!, h1: xs[i + 1]!, z0: zFloor0, z1: d.topZ });
    const dsPoly = em.polygon.map((p) => D(p[0], p[1]) - atD);
    if (Math.max(...dsPoly) > EPS && Math.min(...dsPoly) >= -EPS) {
      const hs = em.polygon.map((p) => H(p[0], p[1]));
      deckBeyond.push({ h0: Math.min(...hs), h1: Math.max(...hs), z0: zFloor0, z1: d.topZ, depth: Math.min(...dsPoly) });
    }
    for (const pl of deckPillarLayout(em).pillars) addDeckBox(pl.box);
    for (const stair of d.stairs) for (const t of deckStairLayout(stair).treads) addDeckBox(t);
  }

  // Telhado: interseção de cada água com o plano.
  interface Seg { p: Vec2; q: Vec2 }
  const roofSegs: Seg[] = [];
  const roofPts = (r: RoofPlane) => r.vertices;
  for (const r of [...model.roofPlanes, ...deckRoofs]) {
    const vs = roofPts(r);
    const hits: Vec2[] = [];
    for (let i = 0; i < vs.length; i++) {
      const a = vs[i]!;
      const b = vs[(i + 1) % vs.length]!;
      const da = D(a[0], a[1]) - atD;
      const db = D(b[0], b[1]) - atD;
      if (da > 0 !== db > 0) {
        const t = da / (da - db);
        hits.push([H(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t), a[2] + (b[2] - a[2]) * t]);
      }
    }
    if (hits.length >= 2) {
      hits.sort((a, b) => a[0] - b[0]);
      roofSegs.push({ p: hits[0]!, q: hits[hits.length - 1]! });
    }
  }

  // --- Extensões ------------------------------------------------------------------------------------------------
  const allH: number[] = [
    ...cuts.flatMap((c) => [c.h0, c.h1]),
    ...slabCuts.flatMap((c) => [c.h0, c.h1]),
    ...deckCuts.flatMap((c) => [c.h0, c.h1]),
    ...beyond.flatMap((b) => b.pts.map((p) => p[0])),
    ...roofSegs.flatMap((s) => [s.p[0], s.q[0]]),
  ];
  const fpb = bounds(model.footprint.length ? model.footprint : [[0, 0]]);
  if (allH.length === 0) allH.push(axis === 'A' ? fpb.x0 : fpb.y0, axis === 'A' ? fpb.x1 : fpb.y1);
  const pad = 1.2;
  const hMin = Math.min(...allH) - pad;
  const hMax = Math.max(...allH) + pad;
  const ridgeZ = Math.max(model.ridgeHeight, ...roofSegs.flatMap((s) => [s.p[1], s.q[1]]), 0);
  const wallsTopZ = Math.max(0, ...model.walls.map((w) => w.baseZ + wallTop(w)));
  const topZ = Math.max(ridgeZ, wallsTopZ);

  // --- Terreno --------------------------------------------------------------------------------------------------
  const site = opts.site;
  const terrain = terrainProfile(fpb, site, opts.platformZ ?? 0, (h) => (axis === 'A' ? [h, cutAt] : [cutAt, h]), hMin, hMax);
  const zGround = Math.min(-0.12, ...terrain.final.map((p) => p[1]), ...(terrain.natural ?? []).map((p) => p[1]), ...slabCuts.map((c) => c.z0));
  const hMinG = terrain.natural ? hMin - 1 : hMin;
  const hMaxG = terrain.natural ? hMax + 1 : hMax;

  // --- Folha ----------------------------------------------------------------------------------------------------
  const ML = 15 * T;
  const MR = 14 * T;
  const MT = 5 * T;
  const MB = 3 * T + (zGround < -0.5 ? 0 : 0);
  const X = (h: number) => ML + (h - hMinG) * u;
  const Z = (z: number) => MT + (topZ + 0.3 - z) * u;
  const width = ML + (hMaxG - hMinG) * u + MR;
  const height = MT + (topZ + 0.3 - zGround) * u + MB;

  const hatchId = `${pid}-cut`;
  const groundId = `${pid}-ground`;
  const defs = hatchPattern(hatchId, st) + tag('pattern', { id: groundId, width: st.hatch * 1.5, height: st.hatch * 1.5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, rect(0, 0, st.hatch * 1.5, st.hatch * 1.5, { fill: '#fff' }) + line(0, 0, 0, st.hatch * 1.5, { stroke: GUIDE, 'stroke-width': st.thin }));

  const L: string[] = [];
  // Solo abaixo do perfil final.
  const gpts = terrain.final.map(([h, z]): [number, number] => [X(h), Z(z)]);
  const groundBottom = Z(zGround - 0.25);
  L.push(poly([...gpts, [gpts[gpts.length - 1]![0], groundBottom], [gpts[0]![0], groundBottom]], { fill: `url(#${groundId})`, stroke: 'none', 'data-role': 'ground' }));
  if (terrain.natural) {
    L.push(tag('polyline', { points: terrain.natural.map(([h, z]) => `${n2(X(h))},${n2(Z(z))}`).join(' '), fill: 'none', stroke: MUTED, 'stroke-width': st.view, 'stroke-dasharray': `${n2(T)} ${n2(T * 0.5)}`, 'data-role': 'natural-terrain' }));
    const last = terrain.natural[terrain.natural.length - 1]!;
    L.push(text(X(last[0]) - T, Z(last[1]) - T * 0.6, 'TERRENO NATURAL', { 'font-size': T * 0.9, 'text-anchor': 'end', fill: MUTED }));
  }
  L.push(tag('polyline', { points: gpts.map(([x, z]) => `${n2(x)},${n2(z)}`).join(' '), fill: 'none', stroke: INK, 'stroke-width': st.cut, 'data-role': terrain.natural ? 'platform' : 'ground-line' }));
  if (terrain.natural) L.push(text(X(fpb.x0 + 0) , Z(0) + T * 1.4, 'PLATÔ', { 'font-size': T * 0.9, 'text-anchor': 'start', fill: MUTED, 'data-role': 'platform-label' }));

  // Vistas além do plano: longe primeiro.
  beyond.sort((a, b) => b.depth - a.depth);
  for (const b of beyond) {
    L.push(poly(b.pts.map(([h, z]): [number, number] => [X(h), Z(z)]), { fill: '#fafaf9', stroke: INK, 'stroke-width': st.view, 'stroke-linejoin': 'miter', 'data-role': 'wall-beyond' }));
  }
  slabBeyond.sort((a, b) => b.depth - a.depth);
  for (const s of slabBeyond) L.push(rect(X(s.h0), Z(s.z1), (s.h1 - s.h0) * u, (s.z1 - s.z0) * u, { fill: '#fff', stroke: INK, 'stroke-width': st.view, 'data-role': 'slab-beyond' }));
  stairBeyond.sort((a, b) => b.depth - a.depth);
  deckBeyond.sort((a, b) => b.depth - a.depth);
  for (const s of deckBeyond) L.push(rect(X(s.h0), Z(s.z1), (s.h1 - s.h0) * u, (s.z1 - s.z0) * u, { fill: '#fff', stroke: INK, 'stroke-width': st.thin, 'data-role': 'deck-beyond' }));
  for (const s of stairBeyond) L.push(rect(X(s.h0), Z(s.z1), (s.h1 - s.h0) * u, (s.z1 - s.z0) * u, { fill: '#fff', stroke: INK, 'stroke-width': st.thin, 'data-role': 'stair-beyond' }));

  // Elementos cortados (hachura, traço de corte).
  const cutRect = (c: Cut, role: string) => rect(X(c.h0), Z(c.z1), Math.max(0, (c.h1 - c.h0) * u), Math.max(0, (c.z1 - c.z0) * u), { fill: `url(#${hatchId})`, stroke: INK, 'stroke-width': st.cut, 'stroke-linejoin': 'miter', 'data-role': role });
  for (const c of slabCuts) L.push(cutRect(c, 'slab-cut'));
  for (const c of stairCuts) L.push(cutRect(c, 'stair-cut'));
  for (const c of deckCuts) L.push(cutRect(c, 'deck-cut'));
  for (const c of cuts) L.push(cutRect(c, 'wall-cut'));
  for (const g of glass) L.push(line(X(g.h), Z(g.z1), X(g.h), Z(g.z0), { 'stroke-width': st.view, 'data-role': 'opening-cut' }));

  // Telhado: faixa com a espessura da telha, por baixo da linha da água.
  for (const s of roofSegs) {
    const dh = s.q[0] - s.p[0];
    const dz = s.q[1] - s.p[1];
    const len = Math.hypot(dh, dz) || 1;
    let nh = dz / len;
    let nz = -dh / len;
    if (nz > 0) { nh = -nh; nz = -nz; }
    const t = roofT;
    const pts: [number, number][] = [[X(s.p[0]), Z(s.p[1])], [X(s.q[0]), Z(s.q[1])], [X(s.q[0] + nh * t), Z(s.q[1] + nz * t)], [X(s.p[0] + nh * t), Z(s.p[1] + nz * t)]];
    L.push(poly(pts, { fill: INK, stroke: INK, 'stroke-width': st.cut, 'stroke-linejoin': 'round', 'data-role': 'roof-cut' }));
  }

  // Cumeeira: marca no ponto mais alto.
  const ridgeHit = roofSegs.map((s) => (s.p[1] > s.q[1] ? s.p : s.q)).sort((a, b) => b[1] - a[1])[0];
  if (ridgeHit && ridgeHit[1] > ridgeZ - 0.15) L.push(text(X(ridgeHit[0]), Z(ridgeHit[1]) - T * 0.8, 'CUMEEIRA', { 'font-size': T * 0.9, fill: INK, 'data-role': 'ridge-label' }));

  // --- Níveis e cotas --------------------------------------------------------------------------------------------
  const floors = [...model.slabs.filter((s) => s.kind === 'radier' || s.kind === 'mezzanine')]
    .map((s) => ({ z: s.topZ, thickness: s.thickness, kind: s.kind, level: s.level ?? 'L0' }))
    .sort((a, b) => a.z - b.z);
  const floorZs = floors.filter((f) => f.kind === 'mezzanine').map((f) => f);
  const groundFloor = { z: 0, thickness: 0.12, kind: 'radier' as const, level: model.walls[0]?.level ?? 'L0' };
  const stack = [groundFloor, ...floorZs];
  const dims: SectionDim[] = [];
  const xb = X(Math.min(...allH) + pad * 0.5);
  const xr = X(Math.max(...allH) - pad * 0.5);
  const colA = xb - 2.4 * T;
  const colB = xb - 4.8 * T;
  const markX = xb - 7.4 * T;
  const dimLayer: string[] = [];
  const levelsOut: { z: number; label: string }[] = [];
  const nameOf = (id: string, i: number) => opts.levelNames?.[id] ?? (i === 0 ? 'Térreo' : 'Pavimento');
  for (let i = 0; i < stack.length; i++) {
    const f = stack[i]!;
    const next = stack[i + 1];
    const top = next ? next.z - next.thickness : ridgeZ;
    if (top - f.z > 0.05) {
      dims.push({ kind: 'ceiling', value: round(top - f.z), label: fmt(top - f.z, 2), level: f.level });
      dimLayer.push(pDimV(st, Z(top), Z(f.z), colA, fmt(top - f.z, 2), xb));
    }
    if (next) {
      dims.push({ kind: 'floor', value: round(next.z - f.z), label: fmt(next.z - f.z, 2), level: f.level });
      dimLayer.push(pDimV(st, Z(next.z), Z(f.z), colB, fmt(next.z - f.z, 2), xb));
    }
    levelsOut.push({ z: f.z, label: nameOf(f.level, i) });
    dimLayer.push(levelMark(st, markX, Z(f.z), fmtLevel(f.z), 'start'));
    dimLayer.push(line(markX, Z(f.z), xb - 0.5 * T, Z(f.z), { stroke: GUIDE, 'stroke-width': st.thin, 'stroke-dasharray': `${n2(T * 2)} ${n2(T * 0.6)} ${n2(T * 0.25)} ${n2(T * 0.6)}` }));
  }
  dimLayer.push(levelMark(st, markX, Z(ridgeZ), fmtLevel(ridgeZ), 'start'));
  levelsOut.push({ z: ridgeZ, label: 'Cumeeira' });

  // Beiral (menor cota da água externa) e cumeeira (total a partir do terreno): lado direito.
  const eaveZ = Math.min(...model.roofPlanes.filter((r) => !r.isWall).flatMap((r) => r.vertices.map((v) => v[2])), Infinity);
  const dimX1 = xr + 3 * T;
  const dimX2 = xr + 8 * T;
  if (Number.isFinite(eaveZ) && eaveZ > 0.05) {
    dims.push({ kind: 'eave', value: round(eaveZ), label: fmt(eaveZ, 2) });
    dimLayer.push(pDimV(st, Z(eaveZ), Z(0), dimX1, fmt(eaveZ, 2), xr));
    dimLayer.push(text(dimX1 + T * 1.1, Z(eaveZ / 2), 'BEIRAL', { 'font-size': T * 0.8, fill: MUTED, 'text-anchor': 'middle', transform: `rotate(-90 ${n2(dimX1 + T * 1.1)} ${n2(Z(eaveZ / 2))})` }));
  }
  dims.push({ kind: 'ridge', value: round(ridgeZ), label: fmt(ridgeZ, 2) });
  dimLayer.push(pDimV(st, Z(ridgeZ), Z(0), dimX2, fmt(ridgeZ, 2), xr));
  dimLayer.push(text(dimX2 + T * 1.1, Z(ridgeZ / 2), 'CUMEEIRA', { 'font-size': T * 0.8, fill: MUTED, 'text-anchor': 'middle', transform: `rotate(-90 ${n2(dimX2 + T * 1.1)} ${n2(Z(ridgeZ / 2))})` }));

  const body = `<title>${esc(`Corte ${axis}`)}</title>` + L.join('') + group(dimLayer.join(''), { 'data-role': 'dim-section' });
  const svg = paper ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n2(width)} ${n2(height)}" width="${n2(width)}" height="${n2(height)}"><defs>${defs}</defs>${body}</svg>` : svgDocument(width, height, body, defs);
  return { svg, width, height, unitsPerMeter: u, axis, at: cutAt, dims, levels: levelsOut, body, defs };
}
