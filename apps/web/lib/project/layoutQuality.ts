/**
 * Qualidade da planta "como um arquiteto faria": métricas puras sobre o projeto e o modelo do motor.
 * `layoutProblems` devolve a lista de problemas (vazia = passa). As verificações pequenas são exportadas e
 * servem de oráculo ao gerador do assistente (ele só aceita uma posição de móvel que passa nelas).
 *
 * Referencial do motor: metros, graus, z para cima. Móvel em rotação 0: frente para −y; `rotation` anti-horária.
 */
import { distToSegment, pointInPolygon, type BuildingModel, type Project, type ResolvedOpening, type RoomModel, type Vec2 } from '@chalecad/engine';
import { getCatalog, type Catalog, type FurnitureSpec } from '@chalecad/catalog';
import { furnitureFootprint } from './furniture';

// ---------------------------------------------------------------------------
// Limites das regras (medidas de arquiteto, não constantes técnicas do catálogo)
// ---------------------------------------------------------------------------

export const LQ = {
  /** Desvio máximo (graus) entre as frentes opostas de sofá e TV. */
  facingTol: 20,
  viewMin: 1.8,
  viewMax: 4.0,
  /** Parede de qualquer altura acima disto corta a linha de visão. */
  sightWall: 0.9,
  /** Móvel mais alto que isto corta a linha de visão (geladeira, armário). */
  sightFurniture: 1.5,
  /** Sofá e cabeceira não encostam em parede mais baixa que isto. */
  lowWall: 1.2,
  /** Tolerância (m) do móvel dentro do cômodo. */
  inside: 0.02,
  stairTop: 0.6,
  bedAccess: 0.6,
  /** Largura útil a partir da qual a cama de casal pede acesso pelos dois lados. */
  bedBothSides: 2.8,
  headSill: 1.0,
  tri: { min: 3.6, max: 7.9, side: 0.9 },
  stoveFridge: 0.3,
  bathFront: 0.6,
  showerMin: 0.8,
  wallShare: 0.7,
  /** Parede interna abaixo disto é meia-parede ou mureta (precisa de função). */
  halfWall: 1.5,
  /** Quanto o anexo do A-frame pode entrar no corpo (o motor fecha o triângulo entre as águas). */
  annexStub: 1.3,
  pathWidth: 0.8,
  grid: 0.1,
  /** Tolerância da grade (meia célula): o caminho livre conta de 0,75 m para cima. */
  pathTol: 0.05,
  livingFree: 0.4,
} as const;

type V = Vec2;
const EPS = 1e-9;

// ---------------------------------------------------------------------------
// Contexto de geometria
// ---------------------------------------------------------------------------

export interface LF {
  id: string;
  item: string;
  level: string;
  spec: FurnitureSpec;
  pos: V;
  rot: number;
  polygon: V[];
  /** Normal da frente (unitária). */
  n: V;
  height: number;
}

export interface LWall {
  id: string;
  level: string;
  kind: string;
  from: V;
  to: V;
  thickness: number;
  baseZ: number;
  /** Altura da parede (maior v do contorno). */
  top: number;
  rect: V[];
  /** Altura da parede só no trecho dado (o contorno pode ser inclinado); aqui é o máximo. */
  length: number;
}

export interface LStair {
  id: string;
  level: string;
  footprint: V[];
  /** Zona de chegada ao pé (0,8 m) e à saída (0,6 m). */
  foot: V[];
  top: V[];
  /** Centro do primeiro degrau (pé) e do último (topo). */
  footPoint: V;
  topPoint: V;
}

export interface LCtx {
  catalog: Catalog;
  elev: Map<string, number>;
  walls: LWall[];
  openings: ResolvedOpening[];
  stairs: LStair[];
  rooms: (RoomModel & { polygon: V[] })[];
  furniture: LF[];
  /** A-frame com fachada de vidro: profundidade e lado da frente (y = 0). */
  glassFront: { depth: number; width: number } | null;
  /** Anexos do A-frame: lado e largura do corpo. */
  bodyWidth: number | null;
  /** Bordas dos pavimentos superiores (para reconhecer a parede que apoia o mezanino). */
  upperPolys: V[][];
  /** Lajes de mezanino (para a altura livre sob elas). */
  slabs?: { polygon: V[]; bottom: number }[];
  /** Cache das zonas de giro de porta. */
  zones?: { id: string; level: string; rect: V[] }[];
}

export { orient as orientedRect };
export const normalOf = (rot: number): V => [Math.sin((rot * Math.PI) / 180), -Math.cos((rot * Math.PI) / 180)];

export function makeLF(spec: FurnitureSpec, id: string, level: string, pos: V, rot: number): LF {
  return { id, item: spec.id, level, spec, pos, rot, polygon: furnitureFootprint(spec, pos, rot), n: normalOf(rot), height: spec.size.h };
}

const wallRect = (from: V, to: V, thickness: number): V[] => {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const l = Math.hypot(dx, dy) || 1;
  const nx = (-dy / l) * (thickness / 2);
  const ny = (dx / l) * (thickness / 2);
  return [[from[0] - nx, from[1] - ny], [to[0] - nx, to[1] - ny], [to[0] + nx, to[1] + ny], [from[0] + nx, from[1] + ny]];
};

export function makeWall(w: { id: string; level: string; kind: string; from: V; to: V; thickness: number; baseZ: number; top: number }): LWall {
  return { ...w, rect: wallRect(w.from, w.to, w.thickness), length: Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]) };
}

/** Contexto a partir do modelo do motor (móveis do projeto, contornos do modelo). */
export function ctxFromModel(project: Project, model: BuildingModel, catalog: Catalog = getCatalog()): LCtx {
  const specs = new Map(catalog.furniture.map((s) => [s.id, s]));
  const furniture: LF[] = [];
  for (const f of project.furniture) {
    const spec = specs.get(f.item);
    if (spec) furniture.push(makeLF(spec, f.id, f.level, [f.position[0], f.position[1]], f.rotation));
  }
  const walls = model.walls.map((w) =>
    makeWall({ id: w.id, level: w.level, kind: w.kind, from: [w.from[0], w.from[1]], to: [w.to[0], w.to[1]], thickness: w.thickness, baseZ: w.baseZ, top: Math.max(0, ...w.outline.map((q) => q[1])) }),
  );
  const stairs: LStair[] = [];
  for (const st of model.stairs) {
    const def = project.stairs.find((s) => s.id === st.id);
    const first = st.treads[0];
    const last = st.treads[st.treads.length - 1];
    if (!def || !first || !last) continue;
    const th = (first.rotationZDeg * Math.PI) / 180;
    const fwd: V = [-Math.sin(th), Math.cos(th)];
    const rectAt = (c: V, w: number, d: number): V[] => orient(c, w, d, first.rotationZDeg);
    const k = first.size[1] / 2 + 0.4;
    const kt = last.size[1] / 2 + LQ.stairTop / 2;
    stairs.push({
      id: st.id,
      level: def.from,
      footprint: st.footprint.map((q): V => [q[0], q[1]]),
      foot: rectAt([first.center[0] - fwd[0] * k, first.center[1] - fwd[1] * k], first.size[0], 0.8),
      top: rectAt([last.center[0] + fwd[0] * kt, last.center[1] + fwd[1] * kt], last.size[0], LQ.stairTop),
      footPoint: [first.center[0], first.center[1]],
      topPoint: [last.center[0], last.center[1]],
    });
  }
  const t = project.typology;
  const upperPolys = project.levels.filter((l) => l.elevation > 0 && l.polygon).map((l) => (l.polygon as number[][]).map((q): V => [q[0]!, q[1]!]));
  return {
    catalog,
    elev: new Map(project.levels.map((l) => [l.id, l.elevation])),
    walls,
    openings: model.openings.filter((o) => o.valid && o.hostKind === 'wall'),
    stairs,
    rooms: model.rooms.filter((r): r is RoomModel & { polygon: V[] } => !!r.polygon).map((r) => ({ ...r, polygon: r.polygon.map((q): V => [q[0], q[1]]) })),
    furniture,
    glassFront: t.kind === 'a_frame' && t.frontGable === 'glazed' ? { depth: t.depth, width: t.width } : null,
    bodyWidth: t.kind === 'a_frame' ? t.width : null,
    upperPolys,
    slabs: model.slabs.filter((sl) => sl.kind === 'mezzanine').map((sl) => ({ polygon: sl.polygon.map((q): V => [q[0], q[1]]), bottom: sl.topZ - sl.thickness })),
  };
}

// ---------------------------------------------------------------------------
// Geometria
// ---------------------------------------------------------------------------

function orient(center: V, w: number, d: number, rotDeg: number, off: V = [0, 0]): V[] {
  const c = Math.cos((rotDeg * Math.PI) / 180);
  const s = Math.sin((rotDeg * Math.PI) / 180);
  return ([[off[0] - w / 2, off[1] - d / 2], [off[0] + w / 2, off[1] - d / 2], [off[0] + w / 2, off[1] + d / 2], [off[0] - w / 2, off[1] + d / 2]] as V[]).map(([x, y]): V => [center[0] + x * c - y * s, center[1] + x * s + y * c]);
}

/** Retângulo no referencial do móvel: centro local (lx, ly), tamanho (w, d). */
export function localRect(f: Pick<LF, 'pos' | 'rot'>, lx: number, ly: number, w: number, d: number): V[] {
  return orient(f.pos, w, d, f.rot, [lx, ly]);
}

const signedArea = (p: V[]) => p.reduce((s, a, i) => s + (a[0] * p[(i + 1) % p.length]![1] - p[(i + 1) % p.length]![0] * a[1]), 0) / 2;
export const polyArea = (p: V[]) => Math.abs(signedArea(p));

/** Área de sobreposição de dois polígonos convexos. */
export function overlapArea(a: V[], b: V[]): number {
  const ccw = (p: V[]) => (signedArea(p) >= 0 ? p : [...p].reverse());
  const clip = ccw(b);
  let poly = ccw(a);
  for (let i = 0; i < clip.length && poly.length > 0; i++) {
    const c0 = clip[i]!;
    const c1 = clip[(i + 1) % clip.length]!;
    const side = (p: V) => (c1[0] - c0[0]) * (p[1] - c0[1]) - (c1[1] - c0[1]) * (p[0] - c0[0]);
    const next: V[] = [];
    poly.forEach((p, k) => {
      const q = poly[(k + 1) % poly.length]!;
      const [sp, sq] = [side(p), side(q)];
      if (sp >= 0) next.push(p);
      if (sp >= 0 !== sq >= 0) {
        const t = sp / (sp - sq);
        next.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    });
    poly = next;
  }
  return poly.length < 3 ? 0 : polyArea(poly);
}

/** Penetração (SAT) entre convexos: ≤ 0 se separados ou apenas encostados. */
export function penetration(a: V[], b: V[]): number {
  let min = Infinity;
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      const n: V = [-(q[1] - p[1]) / l, (q[0] - p[0]) / l];
      const range = (s: V[]) => {
        const d = s.map((v) => v[0] * n[0] + v[1] * n[1]);
        return [Math.min(...d), Math.max(...d)] as const;
      };
      const [a0, a1] = range(a);
      const [b0, b1] = range(b);
      min = Math.min(min, Math.min(a1, b1) - Math.max(a0, b0));
    }
  }
  return min;
}

const segSeg = (a: V, b: V, c: V, d: V): boolean => {
  const o = (p: V, q: V, r: V) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a);
  const d2 = o(c, d, b);
  const d3 = o(a, b, c);
  const d4 = o(a, b, d);
  return ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS));
};

/** O segmento a→b entra no polígono (cruza uma aresta ou tem uma ponta dentro). */
export function segHitsPoly(a: V, b: V, poly: V[]): boolean {
  if (pointInPolygon(a, poly, -1) || pointInPolygon(b, poly, -1)) return true;
  return poly.some((p, i) => segSeg(a, b, p, poly[(i + 1) % poly.length]!));
}

/** Distância mínima entre dois polígonos convexos (0 se se sobrepõem). */
export function polyDist(a: V[], b: V[]): number {
  if (penetration(a, b) > 0) return 0;
  let best = Infinity;
  for (const [p, q] of [[a, b], [b, a]] as const)
    for (const v of p) for (let i = 0; i < q.length; i++) best = Math.min(best, distToSegment(v, q[i]!, q[(i + 1) % q.length]!));
  return best;
}

/** Distância do segmento a→b ao polígono (0 se cruza ou está dentro). */
export function segPolyDist(a: V, b: V, poly: V[]): number {
  if (segHitsPoly(a, b, poly)) return 0;
  return Math.min(...poly.map((v) => distToSegment(v, a, b)), ...poly.map((v, i) => Math.min(distToSegment(a, v, poly[(i + 1) % poly.length]!), distToSegment(b, v, poly[(i + 1) % poly.length]!))));
}

export const inPolyTol = (p: V, poly: V[], tol: number) => pointInPolygon(p, poly, tol);
const dist = (a: V, b: V) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

/** Paredes que valem para um móvel do nível `level` (as do nível e as altas que passam pelo piso dele, como as da fachada). */
export function wallsAt(ctx: LCtx, level: string): LWall[] {
  const e = ctx.elev.get(level) ?? 0;
  return ctx.walls.filter((w) => w.level === level || (w.baseZ <= e + 0.01 && w.baseZ + w.top > e + 0.1));
}

export function roomAt(ctx: LCtx, level: string, p: V): LCtx['rooms'][number] | undefined {
  return ctx.rooms.find((r) => r.level === level && pointInPolygon(p, r.polygon, 1e-6));
}

const nameOf = (f: LF) => f.spec.name;
const f1 = (n: number) => n.toFixed(1).replace('.', ',');

/** Parede de apoio do fundo do móvel (até 8 cm, paralela ao fundo) e a posição ao longo dela. */
export function backingWall(ctx: LCtx, f: LF): { wall: LWall; u0: number; u1: number } | null {
  const back = (sx: number): V => localRect(f, (sx * f.spec.size.w) / 2, f.spec.size.d / 2, 0, 0)[0]!;
  const b0 = back(-1);
  const b1 = back(1);
  const dir: V = [(b1[0] - b0[0]) / (dist(b0, b1) || 1), (b1[1] - b0[1]) / (dist(b0, b1) || 1)];
  let best: { wall: LWall; gap: number } | null = null;
  for (const w of wallsAt(ctx, f.level)) {
    const wd: V = [(w.to[0] - w.from[0]) / (w.length || 1), (w.to[1] - w.from[1]) / (w.length || 1)];
    if (Math.abs(wd[0] * dir[1] - wd[1] * dir[0]) > 0.05) continue;
    const gap = segPolyDist(b0, b1, w.rect);
    if (gap <= 0.08 && (!best || gap < best.gap)) best = { wall: w, gap };
  }
  if (!best) return null;
  const w = best.wall;
  const wd: V = [(w.to[0] - w.from[0]) / (w.length || 1), (w.to[1] - w.from[1]) / (w.length || 1)];
  const us = [b0, b1].map((q) => (q[0] - w.from[0]) * wd[0] + (q[1] - w.from[1]) * wd[1]);
  return { wall: w, u0: Math.min(...us), u1: Math.max(...us) };
}

/** Janela da parede sobre o trecho [u0, u1] (com peitoril abaixo de `sill`). */
export function windowOver(ctx: LCtx, wall: LWall, u0: number, u1: number, sill: number, level = 'L0'): ResolvedOpening | undefined {
  // janela do pavimento de baixo (acaba abaixo do piso de cima) não conta para o móvel de cima
  const e = ctx.elev.get(level) ?? 0;
  return ctx.openings.find((o) => o.hostId === wall.id && o.type !== 'door' && o.v1 > e + 0.05 && o.v0 - e < sill && Math.min(o.u1, u1) - Math.max(o.u0, u0) > 0.05);
}

// ---------------------------------------------------------------------------
// Móveis: dentro do cômodo, sem atravessar parede, porta nem escada
// ---------------------------------------------------------------------------

export const doorZones = (ctx: LCtx): { id: string; level: string; rect: V[] }[] => (ctx.zones ??= computeDoorZones(ctx));
const computeDoorZones = (ctx: LCtx): { id: string; level: string; rect: V[] }[] =>
  ctx.openings
    .filter((o) => o.type === 'door' || o.type === 'sliding_door')
    .flatMap((o) => {
      const w = ctx.walls.find((x) => x.id === o.hostId);
      if (!w) return [];
      const dx = (w.to[0] - w.from[0]) / (w.length || 1);
      const dy = (w.to[1] - w.from[1]) / (w.length || 1);
      const width = o.u1 - o.u0;
      const depth = o.type === 'sliding_door' ? 0.6 : width;
      const c = (o.u0 + o.u1) / 2;
      return [{ id: o.id, level: w.level, rect: orient([w.from[0] + dx * c, w.from[1] + dy * c], width, 2 * depth, (Math.atan2(dy, dx) * 180) / Math.PI) }];
    });

/** Retângulo (cantos 0→1 é o lado largo) alargado em `m` nas duas pontas desse lado. */
function growAlongFirst(r: V[], m: number): V[] {
  const dx = r[1]![0] - r[0]![0];
  const dy = r[1]![1] - r[0]![1];
  const l = Math.hypot(dx, dy) || 1;
  const u: V = [(dx / l) * m, (dy / l) * m];
  return [[r[0]![0] - u[0], r[0]![1] - u[1]], [r[1]![0] + u[0], r[1]![1] + u[1]], [r[2]![0] + u[0], r[2]![1] + u[1]], [r[3]![0] - u[0], r[3]![1] - u[1]]];
}

/** Problemas de um móvel isolado: fora do cômodo, parede, porta, escada. `others` entra para a colisão. */
export function furnitureProblems(ctx: LCtx, f: LF, opts: { collide?: boolean; doorMargin?: number; firstOnly?: boolean } = {}): string[] {
  const out: string[] = [];
  const room = roomAt(ctx, f.level, f.pos);
  if (!room) out.push(`${nameOf(f)} (${f.id}) fica fora de qualquer cômodo`);
  else if (!f.polygon.every((p) => inPolyTol(p, room.polygon, LQ.inside))) out.push(`${nameOf(f)} (${f.id}) passa do contorno de ${room.name}`);
  if (opts.firstOnly && out.length) return out;
  for (const w of wallsAt(ctx, f.level)) if (penetration(f.polygon, w.rect) > 0.01) out.push(`${nameOf(f)} (${f.id}) atravessa a parede ${w.id}`);
  if (opts.firstOnly && out.length) return out;
  if (f.spec.collides) {
    const m = opts.doorMargin ?? 0;
    for (const z of doorZones(ctx)) {
      if (z.level !== f.level) continue;
      // `doorMargin` alarga a zona ao longo da parede: sobra passagem ao lado da folha
      const rect = m > 0 ? growAlongFirst(z.rect, m) : z.rect;
      if (overlapArea(f.polygon, rect) > 0.01) out.push(`${nameOf(f)} (${f.id}) invade a porta ${z.id}`);
    }
    for (const s of ctx.stairs) {
      if (s.level !== f.level) continue;
      if (overlapArea(f.polygon, s.footprint) > 0.01 || overlapArea(f.polygon, s.foot) > 0.01) out.push(`${nameOf(f)} (${f.id}) ocupa a escada ou a chegada dela`);
      else if (overlapArea(f.polygon, s.top) > 0.01 && room && pointInPolygon(s.footPoint, room.polygon, 0.3)) out.push(`${nameOf(f)} (${f.id}) fica a menos de ${LQ.stairTop} m do topo da escada`);
    }
  }
  if (opts.firstOnly && out.length) return out;
  if (opts.collide !== false && f.spec.collides)
    for (const o of ctx.furniture) if (o.id !== f.id && o.level === f.level && o.spec.collides && penetration(f.polygon, o.polygon) > 0.01) out.push(`${nameOf(f)} (${f.id}) colide com ${nameOf(o)} (${o.id})`);
  return out;
}

// ---------------------------------------------------------------------------
// Sala de estar
// ---------------------------------------------------------------------------

const frontCenter = (f: LF): V => [f.pos[0] + f.n[0] * f.spec.size.d / 2, f.pos[1] + f.n[1] * f.spec.size.d / 2];

/** Linha de visão entre as frentes de A e B livre de parede (> 0,9 m), escada e móvel alto. */
export function sightBlocked(ctx: LCtx, a: LF, b: LF): string | null {
  const p = frontCenter(a);
  const q = frontCenter(b);
  const l = dist(p, q) || 1;
  const sh = 0.04 / l;
  const p2: V = [p[0] + (q[0] - p[0]) * sh, p[1] + (q[1] - p[1]) * sh];
  const q2: V = [q[0] + (p[0] - q[0]) * sh, q[1] + (p[1] - q[1]) * sh];
  for (const w of wallsAt(ctx, a.level)) if (w.top > LQ.sightWall && segHitsPoly(p2, q2, w.rect)) return `a parede ${w.id}`;
  for (const s of ctx.stairs) if (s.level === a.level && segHitsPoly(p2, q2, s.footprint)) return 'a escada';
  for (const o of ctx.furniture) if (o.level === a.level && o.id !== a.id && o.id !== b.id && o.height >= LQ.sightFurniture && o.spec.collides && segHitsPoly(p2, q2, o.polygon)) return nameOf(o);
  return null;
}

/** Sofá e TV de frente, entre 1,8 e 4,0 m, com linha de visão livre; sofá fora de parede baixa. */
export function livingPairProblems(ctx: LCtx, sofa: LF, rack: LF): string[] {
  const out: string[] = [];
  const dot = sofa.n[0] * rack.n[0] + sofa.n[1] * rack.n[1];
  const ang = (Math.acos(Math.max(-1, Math.min(1, -dot))) * 180) / Math.PI;
  if (ang > LQ.facingTol) out.push(`sofá (${sofa.id}) e TV (${rack.id}) não ficam de frente (desvio de ${Math.round(ang)} graus)`);
  const d = dist(sofa.pos, rack.pos);
  if (d < LQ.viewMin || d > LQ.viewMax) out.push(`sofá e TV a ${f1(d)} m (de ${f1(LQ.viewMin)} a ${f1(LQ.viewMax)} m)`);
  // a TV precisa estar na frente do sofá (não só com normais opostas)
  const to: V = [(rack.pos[0] - sofa.pos[0]) / (d || 1), (rack.pos[1] - sofa.pos[1]) / (d || 1)];
  if (to[0] * sofa.n[0] + to[1] * sofa.n[1] < Math.cos((LQ.facingTol * Math.PI) / 180)) out.push(`a TV (${rack.id}) não está na frente do sofá (${sofa.id})`);
  if (out.length) return out;
  const blocker = sightBlocked(ctx, sofa, rack);
  if (blocker) out.push(`linha de visão do sofá (${sofa.id}) à TV cortada por ${blocker}`);
  return out;
}

/** Sofá encostado em parede baixa (mureta, parede de joelho sob a água). */
export function sofaLowWall(ctx: LCtx, sofa: LF): LWall | undefined {
  const b = backingWall(ctx, sofa);
  return b && b.wall.top < LQ.lowWall ? b.wall : undefined;
}

function livingProblems(ctx: LCtx): string[] {
  const out: string[] = [];
  // sala sem sofá (ou sala e cozinha integradas sem sofá) é sala que não foi montada
  for (const room of ctx.rooms) {
    const isSala = room.use === 'living' || (room.use === 'kitchen' && /sala/i.test(room.name));
    if (isSala && !ctx.furniture.some((f) => f.spec.model === 'sofa' && inRoom(ctx, room, f))) out.push(`${room.name}: sem sofá`);
  }
  for (const sofa of ctx.furniture.filter((f) => f.spec.model === 'sofa')) {
    const racks = ctx.furniture.filter((f) => f.spec.model === 'rack' && f.level === sofa.level);
    const low = sofaLowWall(ctx, sofa);
    if (low) out.push(`sofá (${sofa.id}) encostado na parede baixa ${low.id} (${f1(low.top)} m)`);
    const g = ctx.glassFront;
    const facesGlass = !!g && sofa.n[1] < -Math.cos((LQ.facingTol * Math.PI) / 180) && sofa.pos[1] < g.depth / 2;
    if (g && sofa.level === 'L0' && sofa.pos[1] >= g.depth / 2 && !racks.some((r) => r.pos[1] < g.depth / 2)) out.push(`A-frame: sofá (${sofa.id}) nos fundos, longe da fachada de vidro`);
    if (racks.length === 0) continue;
    const results = racks.map((r) => livingPairProblems(ctx, sofa, r));
    if (results.some((r) => r.length === 0) || (facesGlass && sofa.level === 'L0')) continue;
    out.push(...results.sort((a, b) => a.length - b.length)[0]!);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cama, cozinha, banheiro
// ---------------------------------------------------------------------------

function usableWidth(room: { polygon: V[] }): number {
  const xs = room.polygon.map((p) => p[0]);
  const ys = room.polygon.map((p) => p[1]);
  return Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

/** Acesso à cama pelo lado `side` (−1 esquerda, +1 direita): faixa de 0,6 m ao longo do comprimento, sem o trecho da cabeceira. */
export function bedSideFree(ctx: LCtx, bed: LF, side: -1 | 1): boolean {
  const { w, d } = bed.spec.size;
  const headEnd = 0.5;
  const strip = localRect(bed, side * (w / 2 + LQ.bedAccess / 2), -headEnd / 2, LQ.bedAccess, d - headEnd);
  const room = roomAt(ctx, bed.level, bed.pos);
  if (room && !strip.every((p) => inPolyTol(p, room.polygon, 0.15))) return false;
  if (wallsAt(ctx, bed.level).some((x) => overlapArea(strip, x.rect) > 0.02)) return false;
  return !ctx.furniture.some((o) => o.id !== bed.id && o.level === bed.level && o.spec.collides && overlapArea(strip, o.polygon) > 0.02);
}

export function bedProblems(ctx: LCtx, bed: LF): string[] {
  const out: string[] = [];
  const room = roomAt(ctx, bed.level, bed.pos);
  const left = bedSideFree(ctx, bed, -1);
  const right = bedSideFree(ctx, bed, 1);
  const double = bed.spec.size.w >= 1.4;
  const both = double && !!room && usableWidth(room) >= LQ.bedBothSides;
  if (both ? !(left && right) : !(left || right)) out.push(`cama (${bed.id}) sem acesso de ${LQ.bedAccess} m ${both ? 'pelos dois lados' : 'por um lado'}`);
  const back = backingWall(ctx, bed);
  if (!back) out.push(`cabeceira da cama (${bed.id}) não encosta numa parede`);
  else {
    if (back.wall.top < LQ.halfWall) out.push(`cabeceira da cama (${bed.id}) encostada em parede baixa ${back.wall.id} (${f1(back.wall.top)} m)`);
    if (windowOver(ctx, back.wall, back.u0, back.u1, LQ.headSill, bed.level)) out.push(`cabeceira da cama (${bed.id}) sob janela baixa`);
  }
  return out;
}

const inRoom = (ctx: LCtx, room: LCtx['rooms'][number], f: LF) => f.level === room.level && pointInPolygon(f.pos, room.polygon, 1e-6);

export function kitchenProblems(ctx: LCtx, room: LCtx['rooms'][number]): string[] {
  const out: string[] = [];
  const mine = ctx.furniture.filter((f) => inRoom(ctx, room, f));
  const sink = mine.find((f) => f.spec.model === 'counter_sink');
  const stove = mine.find((f) => f.spec.model === 'stove');
  const fridge = mine.find((f) => f.spec.model === 'fridge');
  if (!sink || !stove || !fridge) return [`${room.name}: falta ${[!sink && 'pia', !stove && 'fogão', !fridge && 'geladeira'].filter(Boolean).join(', ')}`];
  const sides = [dist(sink.pos, stove.pos), dist(stove.pos, fridge.pos), dist(sink.pos, fridge.pos)];
  const sum = sides.reduce((a, b) => a + b, 0);
  if (sum < LQ.tri.min || sum > LQ.tri.max) out.push(`${room.name}: triângulo pia-fogão-geladeira de ${f1(sum)} m (de ${f1(LQ.tri.min)} a ${f1(LQ.tri.max)} m)`);
  if (sides.some((s) => s < LQ.tri.side)) out.push(`${room.name}: lado do triângulo menor que ${f1(LQ.tri.side)} m`);
  if (polyDist(stove.polygon, fridge.polygon) < LQ.stoveFridge - 0.005) {
    const between = mine.some((c) => (c.spec.model === 'counter' || c.spec.model === 'counter_sink') && polyDist(c.polygon, stove.polygon) < 0.05 && polyDist(c.polygon, fridge.polygon) < 0.05);
    if (!between) out.push(`${room.name}: fogão encostado na geladeira (precisa de ${LQ.stoveFridge} m ou bancada entre eles)`);
  }
  const back = backingWall(ctx, stove);
  if (back && windowOver(ctx, back.wall, back.u0, back.u1, 1.6, stove.level)) out.push(`${room.name}: fogão embaixo de janela`);
  return out;
}

const clearanceBlocked = (ctx: LCtx, f: LF): boolean => {
  const { w, d } = f.spec.size;
  const rect = localRect(f, 0, -d / 2 - LQ.bathFront / 2, w, LQ.bathFront);
  if (wallsAt(ctx, f.level).some((x) => overlapArea(rect, x.rect) > 0.01)) return true;
  return ctx.furniture.some((o) => o.id !== f.id && o.level === f.level && o.spec.collides && overlapArea(rect, o.polygon) > 0.01);
};

export function bathProblems(ctx: LCtx, room: LCtx['rooms'][number]): string[] {
  const out: string[] = [];
  const mine = ctx.furniture.filter((f) => inRoom(ctx, room, f));
  const toilet = mine.find((f) => f.spec.model === 'toilet');
  const basin = mine.find((f) => f.spec.model === 'basin');
  const shower = mine.find((f) => f.spec.model === 'shower');
  if (!toilet || !basin || !shower) return [`${room.name}: falta ${[!toilet && 'bacia', !basin && 'lavatório', !shower && 'chuveiro'].filter(Boolean).join(', ')}`];
  if (clearanceBlocked(ctx, toilet)) out.push(`${room.name}: sem ${LQ.bathFront} m livres na frente da bacia`);
  if (clearanceBlocked(ctx, basin)) out.push(`${room.name}: sem ${LQ.bathFront} m livres na frente do lavatório`);
  if (Math.min(shower.spec.size.w, shower.spec.size.d) < LQ.showerMin) out.push(`${room.name}: box menor que ${LQ.showerMin} × ${LQ.showerMin} m`);
  return out;
}

// ---------------------------------------------------------------------------
// Paredes com sentido
// ---------------------------------------------------------------------------

/** Fração do comprimento da parede em que um lado dela é cômodo diferente do outro (cômodo e exterior contam). */
export function wallSeparation(ctx: LCtx, w: LWall): number {
  const dx = (w.to[0] - w.from[0]) / (w.length || 1);
  const dy = (w.to[1] - w.from[1]) / (w.length || 1);
  const off = w.thickness / 2 + 0.15;
  const n = Math.max(1, Math.ceil(w.length / 0.1));
  let diff = 0;
  let cnt = 0;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) * (w.length / n);
    const c: V = [w.from[0] + dx * u, w.from[1] + dy * u];
    const a = roomAt(ctx, w.level, [c[0] - dy * off, c[1] + dx * off])?.id ?? null;
    const b = roomAt(ctx, w.level, [c[0] + dy * off, c[1] - dx * off])?.id ?? null;
    cnt++;
    if (a !== b) diff++;
  }
  return diff / cnt;
}

/** Fração da parede encostada (≤ 25 cm da face) em escada ou bancada de cozinha. */
function wallFunction(ctx: LCtx, w: LWall, kinds: (f: LF) => boolean, stairs: boolean): number {
  const n = Math.max(1, Math.ceil(w.length / 0.1));
  const dx = (w.to[0] - w.from[0]) / (w.length || 1);
  const dy = (w.to[1] - w.from[1]) / (w.length || 1);
  const polys: V[][] = [...(stairs ? ctx.stairs.filter((s) => s.level === w.level).map((s) => s.footprint) : []), ...ctx.furniture.filter((f) => f.level === w.level && kinds(f)).map((f) => f.polygon)];
  let hit = 0;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) * (w.length / n);
    const c: V = [w.from[0] + dx * u, w.from[1] + dy * u];
    if (polys.some((p) => [-1, 1].some((s) => pointInPolygon([c[0] - dy * s * (w.thickness / 2 + 0.25), c[1] + dx * s * (w.thickness / 2 + 0.25)], p, 0.0)))) hit++;
  }
  return hit / n;
}

const COUNTER_MODELS = new Set(['counter_sink', 'counter', 'stove', 'fridge', 'island', 'washer', 'tank']);

/** A parede apoia a borda de um pavimento superior (mezanino)? Colinear com uma aresta da laje. */
function supportsMezzanine(ctx: LCtx, w: LWall): boolean {
  return ctx.upperPolys.some((poly) => poly.some((a, i) => {
    const b = poly[(i + 1) % poly.length]!;
    return distToSegment(w.from, a, b) < 0.1 && distToSegment(w.to, a, b) < 0.1;
  }));
}

export function wallSenseProblems(ctx: LCtx): string[] {
  const out: string[] = [];
  for (const w of ctx.walls) {
    if (w.kind === 'interior') {
      const share = wallSeparation(ctx, w);
      if (share >= LQ.wallShare - 1e-6) continue;
      // exceções de função: meia-parede de bancada ou escada, a parede da escada (encosto exigido), apoio do mezanino
      const lowFn = w.top < LQ.halfWall && wallFunction(ctx, w, (f) => COUNTER_MODELS.has(f.spec.model), true) >= 0.5;
      const stairWall = w.top >= LQ.halfWall && wallFunction(ctx, w, () => false, true) >= 0.4;
      if (lowFn || stairWall || supportsMezzanine(ctx, w)) continue;
      out.push(`parede ${w.id} (${f1(w.length)} m) separa ambientes em só ${Math.round(share * 100)}% do comprimento`);
    } else if (w.id.startsWith('annex-') && ctx.bodyWidth !== null) {
      const stub = Math.max(0, ...[w.from, w.to].map((p) => (p[0] > 0 && p[0] < ctx.bodyWidth! / 2 ? p[0] : p[0] < ctx.bodyWidth! && p[0] >= ctx.bodyWidth! / 2 ? ctx.bodyWidth! - p[0] : 0)));
      if (stub > LQ.annexStub) out.push(`parede do anexo ${w.id} entra ${f1(stub)} m no corpo do A-frame`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Circulação
// ---------------------------------------------------------------------------

/** Portas do térreo sem caminho de 0,8 m livre até a porta de entrada (grade de 0,1 m, BFS). */
export function circulationProblems(ctx: LCtx, level = 'L0'): string[] {
  const walls = wallsAt(ctx, level);
  const doors = ctx.openings
    .filter((o) => (o.type === 'door' || o.type === 'sliding_door') && ctx.walls.some((w) => w.id === o.hostId && w.level === level))
    .map((o) => {
      const w = ctx.walls.find((x) => x.id === o.hostId)!;
      const dx = (w.to[0] - w.from[0]) / (w.length || 1);
      const dy = (w.to[1] - w.from[1]) / (w.length || 1);
      const c = (o.u0 + o.u1) / 2;
      return { o, w, p: [w.from[0] + dx * c, w.from[1] + dy * c] as V, width: o.u1 - o.u0 };
    });
  if (doors.length === 0) return [];
  const exterior = (d: (typeof doors)[number]) => d.w.kind !== 'interior';
  const entry = doors.find((d) => exterior(d) && d.o.type === 'door') ?? doors.find(exterior);
  if (!entry) return ['sem porta de entrada na fachada'];
  const pts = [...walls.flatMap((w) => w.rect), ...ctx.furniture.flatMap((f) => f.polygon)];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const g = LQ.grid;
  const x0 = Math.min(...xs) - 0.5;
  const y0 = Math.min(...ys) - 0.5;
  const nx = Math.ceil((Math.max(...xs) + 0.5 - x0) / g);
  const ny = Math.ceil((Math.max(...ys) + 0.5 - y0) / g);
  const half = LQ.pathWidth / 2 - LQ.pathTol;
  const solids: V[][] = [...ctx.furniture.filter((f) => f.level === level && f.spec.collides).map((f) => f.polygon), ...ctx.stairs.filter((s) => s.level === level).map((s) => s.footprint)];
  const dp = (p: V, poly: V[]) => (pointInPolygon(p, poly, 0) ? 0 : Math.min(...poly.map((a, i) => distToSegment(p, a, poly[(i + 1) % poly.length]!))));
  const near = (p: V, polys: V[][], r: number) => polys.some((q) => {
    const bx = q.map((v) => v[0]);
    const by = q.map((v) => v[1]);
    if (p[0] < Math.min(...bx) - r || p[0] > Math.max(...bx) + r || p[1] < Math.min(...by) - r || p[1] > Math.max(...by) + r) return false;
    return dp(p, q) < r;
  });
  // o toco do anexo do A-frame fica acima da água do corpo (não há parede ali no piso): só vale a parte de fora
  const clipAnnex = (w: LWall): V[] => {
    if (!w.id.startsWith('annex-') || ctx.bodyWidth === null) return w.rect;
    const W = ctx.bodyWidth;
    const clip = (p: V): V => (p[0] > 0 && p[0] < W / 2 ? [0, p[1]] : p[0] >= W / 2 && p[0] < W ? [W, p[1]] : p);
    return wallRect(clip(w.from), clip(w.to), w.thickness);
  };
  const wallRects = walls.map(clipAnnex);
  const free = new Uint8Array(nx * ny);
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++) {
      const p: V = [x0 + (i + 0.5) * g, y0 + (j + 0.5) * g];
      const carved = doors.some((d) => dist(p, d.p) <= Math.max(0.45, d.width / 2 + 0.1)) && !near(p, solids, 0.2);
      free[i * ny + j] = carved || (!near(p, wallRects, half) && !near(p, solids, half)) ? 1 : 0;
    }
  const cell = (p: V): [number, number] => [Math.floor((p[0] - x0) / g), Math.floor((p[1] - y0) / g)];
  const seen = new Uint8Array(nx * ny);
  const [sx, sy] = cell(entry.p);
  const queue: number[] = [];
  if (free[sx * ny + sy]) {
    seen[sx * ny + sy] = 1;
    queue.push(sx * ny + sy);
  }
  for (let h = 0; h < queue.length; h++) {
    const c = queue[h]!;
    const i = Math.floor(c / ny);
    const j = c % ny;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const a = i + di;
      const b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= ny || seen[a * ny + b] || !free[a * ny + b]) continue;
      seen[a * ny + b] = 1;
      queue.push(a * ny + b);
    }
  }
  const out: string[] = [];
  for (const d of doors) {
    if (d === entry) continue;
    const [ci, cj] = cell(d.p);
    if (!seen[ci * ny + cj]) out.push(`a porta ${d.o.id} (parede ${d.w.id}) não tem caminho livre de ${LQ.pathWidth} m até a entrada`);
  }
  return out;
}

/** Cômodos com sofá têm pelo menos 40% de piso livre. */
function livingFreeProblems(ctx: LCtx): string[] {
  const out: string[] = [];
  for (const room of ctx.rooms) {
    const mine = ctx.furniture.filter((f) => inRoom(ctx, room, f));
    if (!mine.some((f) => f.spec.model === 'sofa')) continue;
    const taken = mine.filter((f) => f.spec.collides).reduce((s, f) => s + polyArea(f.polygon), 0);
    const free = (room.area - taken) / room.area;
    if (free < LQ.livingFree) out.push(`${room.name}: só ${Math.round(free * 100)}% de piso livre (mínimo ${Math.round(LQ.livingFree * 100)}%)`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

/** Todos os problemas de qualidade de planta e mobiliário do projeto (vazio = passa). */
export function layoutProblems(project: Project, model: BuildingModel, catalog: Catalog = getCatalog()): string[] {
  return ctxProblems(ctxFromModel(project, model, catalog));
}

export function ctxProblems(ctx: LCtx): string[] {
  const out: string[] = [];
  for (const f of ctx.furniture) out.push(...furnitureProblems(ctx, f));
  out.push(...livingProblems(ctx));
  for (const bed of ctx.furniture.filter((f) => f.spec.model === 'bed')) out.push(...bedProblems(ctx, bed));
  for (const room of ctx.rooms) {
    if (room.use === 'kitchen') out.push(...kitchenProblems(ctx, room));
    if (room.use === 'bathroom') out.push(...bathProblems(ctx, room));
  }
  out.push(...wallSenseProblems(ctx));
  out.push(...circulationProblems(ctx));
  out.push(...livingFreeProblems(ctx));
  return [...new Set(out)];
}
