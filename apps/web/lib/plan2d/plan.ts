/** Planta baixa por nível em SVG, gerada a partir do `BuildingModel` (funções puras). */
import { getCatalog } from '@chalecad/catalog';
import type { BuildingModel, Furniture, HostWall, InstallationPoint, Project, ResolvedOpening, ResolvedStair, Vec2 } from '@chalecad/engine';
import { fmt } from '../project/format';
import { specOf } from '../project/furniture';
import { furnitureSymbol, placeStrokes } from './furnitureSymbols';
import { installationLegend, installationSymbols, type InstallationSymbol } from './installationSymbols';
import { ROOM_FILL, roomLabel, roomLabelPoint } from './rooms';
import { ACCENT, GUIDE, INK, MUTED, esc, group, hDim, line, meters, n2, northArrow, poly, rect, scaleBar, svgDocument, tag, text, vDim, type SvgDoc } from './svg';

export interface PlanLevel {
  id: string;
  name: string;
  elevation: number;
}

export interface PlanOptions {
  /** Nível a desenhar; omitido = térreo. */
  levelId?: string;
  /** Níveis do projeto (nomes e cotas). Sem isto são deduzidos do modelo. */
  levels?: PlanLevel[];
  /** Projeto, só para refinar nomes de níveis. */
  project?: Pick<Project, 'levels'> & Partial<Pick<Project, 'furniture'>>;
  /** Prefixo dos ids internos do SVG (padrões), para vários SVGs na mesma página. */
  idPrefix?: string;
  /** Pontos de instalações elétricas e hidráulicas; desenha os símbolos do nível e a legenda. */
  installations?: InstallationPoint[];
}

export const UNITS_PER_METER = 60;
const CUT_HEIGHT = 1.2;

const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];

/** Níveis do modelo, do mais baixo ao mais alto. */
export function deriveLevels(model: BuildingModel, project?: Pick<Project, 'levels'>): PlanLevel[] {
  const map = new Map<string, PlanLevel>();
  for (const l of project?.levels ?? []) map.set(l.id, { id: l.id, name: l.name ?? l.id, elevation: l.elevation });
  for (const s of model.slabs) {
    if (s.level && !map.has(s.level)) map.set(s.level, { id: s.level, name: s.kind === 'mezzanine' ? 'Mezanino' : s.level, elevation: s.topZ });
  }
  for (const w of model.walls) if (!map.has(w.level)) map.set(w.level, { id: w.level, name: w.level, elevation: w.baseZ });
  return [...map.values()].sort((a, b) => a.elevation - b.elevation);
}

const maxV = (w: HostWall) => w.outline.reduce((m, p) => Math.max(m, p[1]), 0);

/** Frame local de uma parede: ponto = from + d*u + n*s (n = normal à esquerda de from→to). */
function frame(w: HostWall) {
  const dx = (w.to[0] - w.from[0]) / (w.length || 1);
  const dy = (w.to[1] - w.from[1]) / (w.length || 1);
  const d: Vec2 = [dx, dy];
  const n: Vec2 = [-dy, dx];
  const at = (u: number, s: number): Vec2 => [w.from[0] + d[0] * u + n[0] * s, w.from[1] + d[1] * u + n[1] * s];
  return { d, n, at };
}

function wallPolygon(w: HostWall): Vec2[] {
  const { at } = frame(w);
  const h = w.thickness / 2;
  return [at(-h, -h), at(w.length + h, -h), at(w.length + h, h), at(-h, h)];
}

function centroid(pts: Vec2[]): Vec2 {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    const f = p[0] * q[1] - q[0] * p[1];
    a += f;
    cx += (p[0] + q[0]) * f;
    cy += (p[1] + q[1]) * f;
  }
  if (Math.abs(a) < 1e-9) return pts[0]!;
  return [cx / (3 * a), cy / (3 * a)];
}

const polyArea = (pts: Vec2[]) => Math.abs(pts.reduce((s, p, i) => s + (p[0] * pts[(i + 1) % pts.length]![1] - pts[(i + 1) % pts.length]![0] * p[1]), 0)) / 2;

export function planSvg(model: BuildingModel, opts: PlanOptions = {}): SvgDoc {
  const S = UNITS_PER_METER;
  const pid = opts.idPrefix ?? 'p';
  const levels = opts.levels ?? deriveLevels(model, opts.project);
  const level = levels.find((l) => l.id === opts.levelId) ?? levels[0] ?? { id: model.walls[0]?.level ?? 'L0', name: 'Térreo', elevation: 0 };
  const isGround = levels.length === 0 || level.elevation <= levels[0]!.elevation + 1e-6;

  // Paredes cortadas pelo plano deste nível: as do nível + as externas altas que o atravessam.
  const own = model.walls.filter((w) => w.level === level.id);
  const through = model.walls.filter(
    (w) => w.level !== level.id && w.kind !== 'interior' && w.baseZ <= level.elevation + 1e-6 && w.baseZ + maxV(w) > level.elevation + CUT_HEIGHT,
  );
  const cut = [...own, ...through];
  const cutIds = new Set(cut.map((w) => w.id));
  const ghosts = model.walls.filter((w) => !cutIds.has(w.id) && w.kind !== 'interior' && w.level !== level.id && w.baseZ < level.elevation - 1e-6);

  // Extensão da figura (faces externas).
  const polys = cut.map(wallPolygon);
  const allPts: Vec2[] = polys.flat();
  if (allPts.length === 0) for (const p of model.footprint) allPts.push(p);
  const minX = Math.min(...allPts.map((p) => p[0]));
  const maxX = Math.max(...allPts.map((p) => p[0]));
  const minY = Math.min(...allPts.map((p) => p[1]));
  const maxY = Math.max(...allPts.map((p) => p[1]));

  const ML = 118;
  const MR = 80;
  const MT = 70;
  const instPoints = (opts.installations ?? []).filter((p) => p.level === level.id);
  const legendItems = installationLegend(instPoints);
  const legendCols = 3;
  const MB = 150 + (legendItems.length > 0 ? 24 + Math.ceil(legendItems.length / legendCols) * 16 : 0);
  const planW = (maxX - minX) * S;
  const planH = (maxY - minY) * S;
  const width = Math.max(ML + planW + MR, 330, legendItems.length > 0 ? ML + legendCols * 104 + 10 : 0);
  const height = MT + planH + MB;
  const X = (x: number) => ML + (x - minX) * S;
  const Y = (y: number) => MT + (maxY - y) * S;
  const P = (p: Vec2): [number, number] => [X(p[0]), Y(p[1])];

  const defs = tag(
    'pattern',
    { id: `${pid}-hatch`, width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
    rect(0, 0, 5, 5, { fill: '#fff' }) + line(0, 0, 0, 5, { stroke: INK, 'stroke-width': 1.1 }),
  );

  const layers: string[] = [];

  // Radier (projeção) e mezanino(s) acima, tracejados no térreo.
  if (isGround) {
    for (const s of model.slabs.filter((x) => x.kind === 'radier')) {
      layers.push(poly(s.polygon.map(P), { fill: 'none', stroke: GUIDE, 'stroke-width': 0.7, 'stroke-dasharray': '1.5 3', 'data-role': 'radier' }));
    }
    for (const s of model.slabs.filter((x) => x.kind === 'mezzanine' && x.topZ > level.elevation)) {
      const c = centroid(s.polygon);
      layers.push(
        group(
          poly(s.polygon.map(P), { fill: 'rgba(217,119,6,0.05)', stroke: ACCENT, 'stroke-width': 1.1, 'stroke-dasharray': '7 4' }) +
            text(X(c[0]), Y(c[1]) - 14, 'MEZANINO ACIMA', { 'font-size': 8, fill: ACCENT, 'letter-spacing': 0.8 }) +
            text(X(c[0]), Y(c[1]) - 4, `${fmt(polyArea(s.polygon), 1)} m²`, { 'font-size': 8, fill: ACCENT }),
          { 'data-role': 'mezzanine-above' },
        ),
      );
    }
  } else {
    for (const s of model.slabs.filter((x) => x.level === level.id && x.kind !== 'radier')) {
      const c = centroid(s.polygon);
      layers.push(
        group(
          poly(s.polygon.map(P), { fill: 'rgba(217,119,6,0.09)', stroke: ACCENT, 'stroke-width': 1.2 }) +
            text(X(c[0]), Y(c[1]) - 4, level.name.toUpperCase(), { 'font-size': 9, fill: ACCENT, 'letter-spacing': 0.8, 'font-weight': 700 }) +
            text(X(c[0]), Y(c[1]) + 9, `${fmt(s.area, 2)} m²`, { 'font-size': 9, fill: ACCENT }),
          { 'data-role': 'mezzanine-floor' },
        ),
      );
    }
  }

  // Cômodos: preenchimento suave por uso (sob as paredes) e rótulo "Nome · área" no ponto mais interno.
  const roomLayers: string[] = [];
  for (const r of (model.rooms ?? []).filter((x) => x.level === level.id && x.polygon && x.polygon.length >= 3)) {
    const { point, radius } = roomLabelPoint(r.polygon!);
    const c = P(point);
    const label = roomLabel(r);
    const fits = label.length * 4.4 <= radius * 2 * S;
    const t = { 'font-size': 8.5, fill: INK, stroke: '#fff', 'stroke-width': 2.5, 'paint-order': 'stroke' } as const;
    roomLayers.push(
      group(
        poly(r.polygon!.map(P), { fill: ROOM_FILL[r.use], 'fill-opacity': 0.55, stroke: 'none' }) +
          (fits
            ? text(c[0], c[1] + 3, label, t)
            : text(c[0], c[1] - 2, r.name, { ...t, 'font-weight': 700 }) + text(c[0], c[1] + 9, `${fmt(r.area, 1)} m²`, t)),
        { 'data-role': 'room', 'data-id': r.id },
      ),
    );
  }
  layers.push(...roomLayers);

  // Paredes de níveis abaixo (contexto), em cinza.
  for (const w of ghosts) layers.push(poly(wallPolygon(w).map(P), { fill: '#f5f5f4', stroke: GUIDE, 'stroke-width': 0.6, 'data-role': 'wall-below' }));

  // Escadas (sob as paredes).
  for (const st of model.stairs) layers.push(stairSvg(st, isGround, P, S));

  // Móveis do nível: símbolo de arquitetura em traço fino (o mesmo da planta do editor).
  const furn = (opts.project?.furniture ?? []).filter((f) => f.level === level.id);
  if (furn.length > 0) layers.push(furnitureSvg(furn, P));

  // Instalações: símbolos elétricos e hidráulicos sobre as paredes (e sob as cotas).
  const instLayer = instPoints.length > 0 ? installationsSvg(installationSymbols(instPoints), P) : '';

  // Paredes: contorno (traço) + preenchimento hachurado por cima, para unir os cantos.
  const wallPolys = cut.map((w) => wallPolygon(w).map(P));
  layers.push(
    group(wallPolys.map((p) => poly(p, { fill: INK, stroke: INK, 'stroke-width': 2.4, 'stroke-linejoin': 'miter' })).join(''), { 'data-role': 'wall-outline' }),
    group(wallPolys.map((p) => poly(p, { fill: `url(#${pid}-hatch)`, stroke: 'none' })).join(''), { 'data-role': 'wall-hatch' }),
  );

  layers.push(instLayer);

  // Aberturas.
  const byId = new Map(cut.map((w) => [w.id, w]));
  const ownOpenings = model.openings.filter((o) => o.hostKind === 'wall' && o.valid && byId.get(o.hostId)?.level === level.id);
  for (const o of ownOpenings) layers.push(openingSvg(o, byId.get(o.hostId)!, P, S));

  // Cotas internas: comprimento livre de cada parede interna.
  for (const w of own.filter((x) => x.kind === 'interior')) {
    const { at, d } = frame(w);
    // Do lado oposto ao giro das portas, para não colidir com o arco.
    const side = ownOpenings.some((o) => o.hostId === w.id) ? -1 : 1;
    const mid = P(at(w.length / 2, side * (w.thickness / 2 + 0.11)));
    let ang = (Math.atan2(-d[1], d[0]) * 180) / Math.PI;
    if (ang > 90 || ang < -90) ang += 180;
    layers.push(text(mid[0], mid[1], meters(w.length), { 'font-size': 8, fill: MUTED, transform: `rotate(${n2(ang)} ${n2(mid[0])} ${n2(mid[1])})`, 'data-role': 'dim-inner' }));
  }
  // Cotas internas do mezanino (largura e profundidade).
  if (!isGround) {
    for (const s of model.slabs.filter((x) => x.level === level.id && x.kind !== 'radier')) {
      const xs = s.polygon.map((p) => p[0]);
      const ys = s.polygon.map((p) => p[1]);
      const x0 = Math.min(...xs);
      const x1 = Math.max(...xs);
      const y0 = Math.min(...ys);
      const y1 = Math.max(...ys);
      layers.push(
        group(hDim(X(x0), X(x1), Y(y0) - 16, meters(x1 - x0)) + vDim(Y(y1), Y(y0), X(x0) + 16, meters(y1 - y0)), { 'data-role': 'dim-inner' }),
      );
    }
  }

  // Cotas externas: cadeia de aberturas na fachada frontal e na esquerda + total.
  const dims: string[] = [];
  let rowH = 26;
  let rowV = 26;
  const front = cut.filter((w) => w.kind !== 'interior' && Math.abs(w.from[1] - w.to[1]) < 1e-6).sort((a, b) => a.from[1] - b.from[1])[0];
  if (front && Math.abs(front.from[1] - model.footprint.reduce((m, p) => Math.min(m, p[1]), Infinity)) < 0.3) {
    const stops = chain(minX, maxX, openingSpans(ownOpenings, front, 0));
    if (stops.length > 1) {
      stops.forEach(([a, b]) => dims.push(hDim(X(a), X(b), Y(minY) + 26, meters(b - a), Y(minY))));
      rowH = 52;
    }
  }
  const left = cut.filter((w) => w.kind !== 'interior' && Math.abs(w.from[0] - w.to[0]) < 1e-6).sort((a, b) => a.from[0] - b.from[0])[0];
  if (left && Math.abs(left.from[0] - model.footprint.reduce((m, p) => Math.min(m, p[0]), Infinity)) < 0.3) {
    const stops = chain(minY, maxY, openingSpans(ownOpenings, left, 1));
    if (stops.length > 1) {
      stops.forEach(([a, b]) => dims.push(vDim(Y(a), Y(b), X(minX) - 26, meters(b - a), X(minX))));
      rowV = 52;
    }
  }
  dims.push(hDim(X(minX), X(maxX), Y(minY) + rowH, meters(maxX - minX), Y(minY) + (rowH > 26 ? 26 : 0)));
  dims.push(vDim(Y(maxY), Y(minY), X(minX) - rowV, meters(maxY - minY), X(minX) - (rowV > 26 ? 26 : 0)));
  layers.push(group(dims.join(''), { 'data-role': 'dim-outer' }));

  // Decoração: título do nível, norte, escala.
  const deco =
    text(ML, 30, `PLANTA — ${level.name.toUpperCase()}`, { 'text-anchor': 'start', 'font-size': 13, 'font-weight': 700 }) +
    text(ML, 45, `Cota ${level.elevation >= 0 ? '+' : ''}${fmt(level.elevation, 2)} m · cotas em metros, faces externas`, { 'text-anchor': 'start', 'font-size': 8.5, fill: MUTED }) +
    northArrow(width - 40, 38) +
    scaleBar(ML, MT + planH + 108, S) +
    (legendItems.length > 0 ? installationLegendSvg(legendItems, ML, MT + planH + 144, legendCols) : '');

  return {
    svg: svgDocument(width, height, `<title>${esc(`Planta ${level.name}`)}</title>` + layers.join('') + deco, defs),
    width,
    height,
    unitsPerMeter: S,
  };
}

/** Trechos [início, fim] ao longo do eixo (0 = x, 1 = y) ocupados pelas aberturas de uma parede. */
function openingSpans(openings: ResolvedOpening[], w: HostWall, axis: 0 | 1): [number, number][] {
  const { at } = frame(w);
  return openings
    .filter((o) => o.hostId === w.id)
    .map((o) => {
      const a = at(o.u0, 0)[axis];
      const b = at(o.u1, 0)[axis];
      return (a < b ? [a, b] : [b, a]) as [number, number];
    })
    .sort((a, b) => a[0] - b[0]);
}

/** Divide [lo, hi] nos vãos das aberturas: cadeia de cotas. */
function chain(lo: number, hi: number, spans: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  let cur = lo;
  for (const [a, b] of spans) {
    if (a > cur + 0.005) out.push([cur, a]);
    out.push([a, b]);
    cur = b;
  }
  if (hi > cur + 0.005) out.push([cur, hi]);
  return out;
}

function openingSvg(o: ResolvedOpening, w: HostWall, P: (p: Vec2) => [number, number], S: number): string {
  const { at, n } = frame(w);
  const t = w.thickness;
  const h = t / 2;
  const width = o.u1 - o.u0;
  const parts: string[] = [];
  // Vão: apaga a parede.
  parts.push(poly([at(o.u0, -h - 0.01), at(o.u1, -h - 0.01), at(o.u1, h + 0.01), at(o.u0, h + 0.01)].map(P), { fill: '#fff', stroke: 'none' }));
  // Batentes.
  for (const u of [o.u0, o.u1]) {
    const [a, b] = [P(at(u, -h)), P(at(u, h))];
    parts.push(line(a[0], a[1], b[0], b[1], { 'stroke-width': 1.4 }));
  }
  const ln = (u0: number, s0: number, u1: number, s1: number, a: Record<string, string | number> = {}) => {
    const [p, q] = [P(at(u0, s0)), P(at(u1, s1))];
    return line(p[0], p[1], q[0], q[1], { 'stroke-width': 0.9, ...a });
  };
  if (o.type === 'window') {
    // Linha tripla: faces e eixo.
    for (const s of [-h, 0, h]) parts.push(ln(o.u0, s, o.u1, s, { 'stroke-width': s === 0 ? 0.7 : 1 }));
  } else if (o.type === 'door') {
    // Folha aberta para dentro (lado oposto ao exterior; paredes internas: à esquerda) e arco de giro.
    const sIn = w.exteriorSide === 'right' ? 1 : w.exteriorSide === 'left' ? -1 : 1;
    parts.push(ln(o.u0, 0, o.u0, sIn * width, { 'stroke-width': 1.5 }));
    const e = P(at(o.u0, sIn * width));
    const j = P(at(o.u1, 0));
    const hinge = P(at(o.u0, 0));
    const cross = (e[0] - hinge[0]) * (j[1] - hinge[1]) - (e[1] - hinge[1]) * (j[0] - hinge[0]);
    parts.push(tag('path', { d: `M${n2(e[0])},${n2(e[1])} A${n2(width * S)},${n2(width * S)} 0 0 ${cross > 0 ? 1 : 0} ${n2(j[0])},${n2(j[1])}`, fill: 'none', stroke: INK, 'stroke-width': 0.7, 'stroke-dasharray': '3 2' }));
  } else if (o.type === 'sliding_door') {
    parts.push(ln(o.u0, -h / 2, o.u0 + width * 0.55, -h / 2, { 'stroke-width': 1.3 }));
    parts.push(ln(o.u0 + width * 0.45, h / 2, o.u1, h / 2, { 'stroke-width': 1.3 }));
    parts.push(ln(o.u0, 0, o.u1, 0, { 'stroke-width': 0.5, 'stroke-dasharray': '2 2' }));
  }
  void n;
  return group(parts.join(''), { 'data-role': `opening-${o.type}`, 'data-id': o.id });
}

function stairSvg(st: ResolvedStair, ground: boolean, P: (p: Vec2) => [number, number], S: number): string {
  const parts: string[] = [];
  const op = ground ? 1 : 0.55;
  for (const t of st.treads) {
    const r = (t.rotationZDeg * Math.PI) / 180;
    const [hx, hy] = [t.size[0] / 2, t.size[1] / 2];
    const pts = ([[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]] as Vec2[]).map(([x, y]): Vec2 => [t.center[0] + x * Math.cos(r) - y * Math.sin(r), t.center[1] + x * Math.sin(r) + y * Math.cos(r)]);
    parts.push(poly(pts.map(P), { fill: '#fff', stroke: INK, 'stroke-width': 0.6 }));
  }
  if (st.footprint.length > 2) parts.push(poly(st.footprint.map(P), { fill: 'none', stroke: INK, 'stroke-width': 1 }));
  // Seta de subida do primeiro ao último degrau.
  const first = st.treads[0];
  const last = st.treads[st.treads.length - 1];
  if (first && last && st.treads.length > 1) {
    const a: Vec2 = ground ? [first.center[0], first.center[1]] : [last.center[0], last.center[1]];
    const b: Vec2 = ground ? [last.center[0], last.center[1]] : [first.center[0], first.center[1]];
    const [pa, pb] = [P(a), P(b)];
    const d = sub([pb[0], pb[1]], [pa[0], pa[1]]);
    const len = Math.hypot(d[0], d[1]) || 1;
    const u: Vec2 = [d[0] / len, d[1] / len];
    const nx: Vec2 = [-u[1], u[0]];
    parts.push(tag('circle', { cx: pa[0], cy: pa[1], r: 2.2, fill: INK }));
    parts.push(line(pa[0], pa[1], pb[0], pb[1], { 'stroke-width': 1 }));
    parts.push(poly([[pb[0], pb[1]], [pb[0] - u[0] * 9 + nx[0] * 4, pb[1] - u[1] * 9 + nx[1] * 4], [pb[0] - u[0] * 9 - nx[0] * 4, pb[1] - u[1] * 9 - nx[1] * 4]], { fill: INK }));
    const mx = (pa[0] + pb[0]) / 2;
    const my = (pa[1] + pb[1]) / 2;
    parts.push(text(mx + nx[0] * 0, my - 6, ground ? 'SOBE' : 'DESCE', { 'font-size': 7.5, fill: INK, 'letter-spacing': 0.6, stroke: '#fff', 'stroke-width': 3, 'paint-order': 'stroke' }));
  }
  void S;
  return group(parts.join(''), { 'data-role': 'stair', 'data-id': st.id, opacity: op });
}

/** Símbolos dos móveis: um grupo por móvel, traços do contorno em INK e detalhes internos mais leves. */
function furnitureSvg(items: Furniture[], P: (p: Vec2) => [number, number]): string {
  const catalog = getCatalog();
  const groups: string[] = [];
  for (const f of items) {
    const spec = specOf(catalog, f.item);
    if (!spec) continue;
    const paths = placeStrokes(furnitureSymbol(spec.model, spec.size), f.position as [number, number], f.rotation).map((st) => {
      const d = st.pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${n2(P(p)[0])} ${n2(P(p)[1])}`).join(' ') + (st.closed ? ' Z' : '');
      return tag('path', { d, fill: 'none', stroke: st.light ? MUTED : INK, 'stroke-width': st.light ? 0.4 : 0.7, 'stroke-linejoin': 'round' });
    });
    groups.push(group(paths.join(''), { 'data-role': 'furniture', 'data-id': f.id, 'data-item': f.item }));
  }
  return group(groups.join(''), { 'data-role': 'furniture-layer' });
}

function symbolPaths(sym: InstallationSymbol, P: (p: Vec2) => [number, number]): string {
  return sym.strokes
    .map((st) => {
      const d = st.pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${n2(P(p)[0])} ${n2(P(p)[1])}`).join(' ') + (st.closed ? ' Z' : '');
      return tag('path', { d, fill: sym.fill && !st.light && st.closed ? sym.color : '#fff', 'fill-opacity': sym.fill && !st.light && st.closed ? 0.85 : st.closed && !st.light ? 0.9 : 0, stroke: sym.color, 'stroke-width': st.light ? 0.6 : 1, 'stroke-linejoin': 'round' });
    })
    .join('');
}

/** Símbolos de instalações na planta: um grupo por ponto, com a cor do sistema. */
function installationsSvg(syms: InstallationSymbol[], P: (p: Vec2) => [number, number]): string {
  const groups = syms.map((sym) => {
    const [cx, cy] = P(sym.point);
    const label = sym.text ? text(cx, cy + (sym.text.length > 1 ? 2 : 2.5), sym.text, { 'font-size': sym.text.length > 1 ? 5 : 6, 'font-weight': 700, fill: sym.color }) : '';
    return group(symbolPaths(sym, P) + label, { 'data-role': 'installation', 'data-id': sym.id, 'data-kind': sym.kind });
  });
  return group(groups.join(''), { 'data-role': 'installations' });
}

function installationLegendSvg(items: { kind: InstallationSymbol['kind']; label: string }[], x: number, y: number, cols: number): string {
  const cell = 104;
  const parts = items.map((it, i) => {
    const sym = installationSymbols([{ id: 'lg', kind: it.kind, level: '', position: [0, 0], height: 0, roomId: null, hostId: null, furnitureId: null, circuitId: null, label: '' }])[0]!;
    const k = 0.8; // símbolos da legenda em escala reduzida (cabe na linha de texto)
    const scaled: InstallationSymbol = { ...sym, strokes: sym.strokes.map((st) => ({ ...st, pts: st.pts.map(([px, py]) => [px * k, py * k] as Vec2) })) };
    const ox = x + (i % cols) * cell + 8;
    const oy = y + Math.floor(i / cols) * 16;
    return group(symbolPaths(scaled, ([px, py]) => [ox + px * S_LEGEND, oy - py * S_LEGEND]) + text(ox + 16, oy + 3, it.label, { 'font-size': 7.5, 'text-anchor': 'start', fill: MUTED }), { 'data-kind': it.kind });
  });
  return group(text(x, y - 12, 'LEGENDA — INSTALAÇÕES', { 'font-size': 7.5, 'text-anchor': 'start', fill: MUTED, 'letter-spacing': 0.6 }) + parts.join(''), { 'data-role': 'installations-legend' });
}

const S_LEGEND = UNITS_PER_METER;
