/**
 * Extras do projeto (varanda/deck, muro, cerca, muro de arrimo): criação com padrões coerentes, edição de
 * caminhos, duplicação e resumo. Funções puras que mutam um rascunho Immer.
 */
import {
  axisFootprint,
  buildModel,
  deckDoorCenters,
  deckFaceCount,
  deckFaceLength,
  deckGeometry,
  Project as ProjectSchema,
  type BuildingModel,
  type DeckStairModel,
  type Extra,
  type ExtraModel,
  type Project,
  type Vec2,
  type Vec3,
} from '@chalecad/engine';
import { getCatalog } from '@chalecad/catalog';
import { clamp, planBounds, round } from './geometry';
import { newId, type IdGen } from './ids';

export type ExtraKind = Extra['kind'];
type Of<K extends ExtraKind> = Extract<Extra, { kind: K }>;

export const EXTRA_LABELS: Record<ExtraKind, string> = {
  deck: 'Varanda / deck',
  wall: 'Muro',
  fence: 'Cerca',
  retaining: 'Muro de arrimo',
  water_tower: "Torre da caixa d'água",
};

export const SIDE_LABELS = { front: 'Frente', back: 'Fundos', left: 'Esquerda', right: 'Direita' } as const;
export type Side = keyof typeof SIDE_LABELS;

export const FENCE_CLEARANCE = 3;

/** Comprimento total do caminho (fecha o último vértice no primeiro se `closed`). */
export function pathLength(path: Vec2[], closed: boolean): number {
  let n = 0;
  for (let i = 0; i + 1 < path.length; i++) n += Math.hypot(path[i + 1]![0] - path[i]![0], path[i + 1]![1] - path[i]![1]);
  if (closed && path.length > 2) n += Math.hypot(path[0]![0] - path[path.length - 1]![0], path[0]![1] - path[path.length - 1]![1]);
  return n;
}

/** Retângulo em volta da casa com folga `gap`, sentido anti-horário. */
export function perimeterPath(p: Project, gap = FENCE_CLEARANCE): Vec2[] {
  const b = planBounds(p.typology);
  return [
    [round(b.x0 - gap, 2), round(b.y0 - gap, 2)],
    [round(b.x1 + gap, 2), round(b.y0 - gap, 2)],
    [round(b.x1 + gap, 2), round(b.y1 + gap, 2)],
    [round(b.x0 - gap, 2), round(b.y1 + gap, 2)],
  ];
}

/** Lado da edificação mais próximo da subida do terreno (onde o corte pede arrimo). */
export function uphillSide(p: Project): Side {
  const s = p.site;
  const az = s.type === 'sloped' ? s.downhillAzimuthDeg : 180;
  const dx = Math.sin((az * Math.PI) / 180);
  const dy = Math.cos((az * Math.PI) / 180);
  // O terreno sobe no sentido oposto ao da descida.
  if (Math.abs(dy) >= Math.abs(dx)) return dy > 0 ? 'front' : 'back';
  return dx > 0 ? 'left' : 'right';
}

/** Caminho do arrimo: reta paralela à fachada do lado da subida, na borda do platô. */
export function retainingPath(p: Project, side: Side = uphillSide(p)): Vec2[] {
  const b = planBounds(p.typology);
  const m = p.site.type === 'sloped' ? p.site.platformMargin : { front: 3, back: 1.5, left: 1.5, right: 1.5 };
  switch (side) {
    case 'front':
      return [[round(b.x0 - m.left, 2), round(b.y0 - m.front, 2)], [round(b.x1 + m.right, 2), round(b.y0 - m.front, 2)]];
    case 'back':
      return [[round(b.x0 - m.left, 2), round(b.y1 + m.back, 2)], [round(b.x1 + m.right, 2), round(b.y1 + m.back, 2)]];
    case 'left':
      return [[round(b.x0 - m.left, 2), round(b.y0 - m.front, 2)], [round(b.x0 - m.left, 2), round(b.y1 + m.back, 2)]];
    case 'right':
      return [[round(b.x1 + m.right, 2), round(b.y0 - m.front, 2)], [round(b.x1 + m.right, 2), round(b.y1 + m.back, 2)]];
  }
}

const modelCache = new WeakMap<object, BuildingModel | null>();

/** Modelo da casa (contorno, portas, paredes) para o deck; memorizado por objeto de projeto (o Immer congela e troca a cada edição). */
export function houseModel(p: Project): BuildingModel | null {
  if (modelCache.has(p)) return modelCache.get(p) ?? null;
  let m: BuildingModel | null = null;
  try {
    m = buildModel(ProjectSchema.parse(JSON.parse(JSON.stringify(p))), getCatalog());
  } catch {
    m = null;
  }
  modelCache.set(p, m);
  return m;
}

/** Contorno externo das paredes (cai no retângulo dos eixos se o modelo não existe). */
export const deckFootprint = (p: Project): Vec2[] => houseModel(p)?.footprint ?? axisFootprint(p);

/** Comprimento (m) da face externa escolhida de cada lado (planta em L e anexos têm mais de uma face por lado). */
export function sideLength(p: Project, side: Side, facadeIndex = 0): number {
  return deckFaceLength(p, side, deckFootprint(p), facadeIndex);
}

/** Quantas faces externas voltam para o lado (para o seletor de fachada). */
export const sideFaceCount = (p: Project, side: Side): number => deckFaceCount(p, side, deckFootprint(p));

export type DeckAlignMode = 'start' | 'center' | 'end' | 'door';

/**
 * Patch de alinhamento do deck: Início/Centro/Fim voltam o deslocamento a zero; "porta" centraliza o deck na primeira
 * porta da face (o deslocamento é limitado para o deck continuar de quina a quina). `null` se não há porta.
 */
export function deckAlignPatch(p: Project, e: Of<'deck'>, mode: DeckAlignMode): { align: 'start' | 'center' | 'end'; offset: number } | null {
  if (mode !== 'door') return { align: mode, offset: 0 };
  const model = houseModel(p);
  if (!model) return null;
  const doors = deckDoorCenters(p, e, model, getCatalog());
  const door = doors[0];
  if (door === undefined) return null;
  const faceLen = sideLength(p, e.side, e.facadeIndex);
  const len = Math.min(e.length ?? faceLen, faceLen);
  const c = clamp(door, len / 2, faceLen - len / 2);
  return { align: 'center', offset: round(c - faceLen / 2, 2) };
}

/** Faixa [início, fim] do deck ao longo da face (a mesma do motor). */
export function deckSpan(p: Project, e: Of<'deck'>): { a0: number; a1: number; faceLength: number } {
  const g = deckGeometry(p, e, { footprint: deckFootprint(p) });
  return { a0: g.a0, a1: g.a1, faceLength: g.face.len };
}

/** Altura do chuveiro mais alto + folga da caixa acima dele (m): a caixa precisa ficar ~1 m acima. */
export const TOWER_SHOWER_HEIGHT = 2.1;
export const TOWER_HEAD = 1.2;

/**
 * Onde pôr a torre da caixa d'água: sobre o banheiro do mezanino; senão sobre o do térreo; senão no centro da planta.
 * A cota do piso da caixa é o piso do banheiro + chuveiro (2,1 m) + 1,2 m de coluna d'água.
 */
export function towerSpot(p: Project): { position: Vec2; platformZ: number; roomId: string | null } {
  const baths = p.rooms.filter((r) => r.use === 'bathroom');
  const elevOf = (level: string) => p.levels.find((l) => l.id === level)?.elevation ?? 0;
  const pick = [...baths].sort((a, b) => elevOf(b.level) - elevOf(a.level))[0];
  if (pick) {
    let c: Vec2 = [pick.seed[0], pick.seed[1]];
    try {
      const room = buildModel(ProjectSchema.parse(JSON.parse(JSON.stringify(p))), getCatalog()).rooms.find((r) => r.id === pick.id);
      if (room?.polygon && room.polygon.length > 2) c = [room.polygon.reduce((s, v) => s + v[0], 0) / room.polygon.length, room.polygon.reduce((s, v) => s + v[1], 0) / room.polygon.length];
    } catch {
      // sem modelo: usa o ponto do cômodo
    }
    return { position: [round(c[0], 2), round(c[1], 2)], platformZ: round(clamp(elevOf(pick.level) + TOWER_SHOWER_HEIGHT + TOWER_HEAD, 2, 10), 2), roomId: pick.id };
  }
  const b = planBounds(p.typology);
  return { position: [round((b.x0 + b.x1) / 2, 2), round((b.y0 + b.y1) / 2, 2)], platformZ: 5, roomId: null };
}

/** Cria o extra com padrões coerentes com o projeto. Devolve o ID. */
export function addExtra(draft: Project, kind: ExtraKind, ids: IdGen = newId): string {
  const id = ids('x');
  switch (kind) {
    case 'deck': {
      const side: Side = 'front';
      const len = sideLength(draft, side);
      // Fachada inteira por padrão: o deck vai de quina a quina da face externa, na cota do degrau (-3 cm); o guarda-corpo e a escada são automáticos.
      draft.extras.push({ id, kind, side, length: round(Math.min(len, 4), 2), offset: 0, depth: 2, facadeIndex: 0, align: 'center', covered: false, guardrail: 'auto', stairs: 'auto', support: 'auto', footing: 'auto', boards: 'parallel' });
      break;
    }
    case 'wall':
      draft.extras.push({ id, kind, path: perimeterPath(draft), closed: true, height: 2, system: 'concrete_block', foundation: 'strip' });
      break;
    case 'fence':
      draft.extras.push({ id, kind, path: perimeterPath(draft), closed: true, height: 1.8, postType: 'concrete', postSpacing: 2.5, mesh: 'welded', baseWallHeight: 0.2 });
      break;
    case 'retaining':
      draft.extras.push({ id, kind, path: retainingPath(draft), height: 1.5, type: 'block', drainage: true });
      break;
    case 'water_tower': {
      const spot = towerSpot(draft);
      draft.extras.push({ id, kind, position: spot.position, width: 1.6, depth: 1.6, platformZ: spot.platformZ, roof: 'gable' });
      break;
    }
  }
  return id;
}

export const findExtra = (p: Project, id: string): Extra | undefined => p.extras.find((e) => e.id === id);

export function removeExtra(draft: Project, id: string): boolean {
  const n = draft.extras.length;
  draft.extras = draft.extras.filter((e) => e.id !== id);
  return draft.extras.length < n;
}

/** Duplica o extra com deslocamento (caminhos: 1 m; deck: ao lado, se couber). Devolve o novo ID. */
export function duplicateExtra(draft: Project, id: string, ids: IdGen = newId): string | null {
  const src = findExtra(draft, id);
  if (!src) return null;
  const copy = JSON.parse(JSON.stringify(src)) as Extra;
  copy.id = ids('x');
  if (copy.kind === 'deck') {
    const len = sideLength(draft, copy.side, copy.facadeIndex);
    copy.align = 'start';
    copy.offset = round(clamp(copy.offset + (copy.length ?? len) + 0.2, 0, Math.max(0, len - 1)), 2);
  } else if (copy.kind === 'water_tower') {
    copy.position = [round(copy.position[0] + 1, 2), round(copy.position[1] + 1, 2)];
  } else {
    copy.path = copy.path.map(([x, y]) => [round(x + 1, 2), round(y + 1, 2)] as Vec2);
  }
  draft.extras.push(copy);
  return copy.id;
}

/** Altera campos do extra (a união discriminada é preservada por quem chama). */
export function patchExtra(draft: Project, id: string, patch: Record<string, unknown>): void {
  const e = draft.extras.find((x) => x.id === id) as Record<string, unknown> | undefined;
  if (!e) return;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete e[k];
    else e[k] = v;
  }
}

type PathExtra = Of<'fence'> | Of<'wall'> | Of<'retaining'>;
export const isPathExtra = (e: Extra): e is PathExtra => e.kind !== 'deck' && e.kind !== 'water_tower';

export function setVertex(draft: Project, id: string, index: number, v: Vec2): void {
  const e = draft.extras.find((x) => x.id === id);
  if (!e || !isPathExtra(e) || !e.path[index]) return;
  e.path[index] = [round(v[0], 3), round(v[1], 3)];
}

/** Insere um vértice depois de `index` (no ponto médio até o próximo; no fim, estende 1 m). */
export function addVertex(draft: Project, id: string, index: number): void {
  const e = draft.extras.find((x) => x.id === id);
  if (!e || !isPathExtra(e)) return;
  const a = e.path[index];
  if (!a) return;
  const closed = e.kind !== 'retaining' && e.closed;
  const next = e.path[index + 1] ?? (closed ? e.path[0] : undefined);
  const v: Vec2 = next ? [round((a[0] + next[0]) / 2, 3), round((a[1] + next[1]) / 2, 3)] : [round(a[0] + 1, 3), a[1]];
  e.path.splice(index + 1, 0, v);
}

/** Remove um vértice (mantém no mínimo 2). */
export function removeVertex(draft: Project, id: string, index: number): void {
  const e = draft.extras.find((x) => x.id === id);
  if (!e || !isPathExtra(e) || e.path.length <= 2) return;
  e.path.splice(index, 1);
}

export function resetPathToPerimeter(draft: Project, id: string): void {
  const e = draft.extras.find((x) => x.id === id);
  if (!e || !isPathExtra(e)) return;
  e.path = e.kind === 'retaining' ? retainingPath(draft) : perimeterPath(draft);
}

/** Resumo de uma linha ("Fechada · 42 m · 1,8 m de altura"). */
export function extraSummary(e: Extra): { title: string; detail: string } {
  const f = (n: number, d = 1) => String(round(n, d)).replace('.', ',');
  switch (e.kind) {
    case 'deck':
      return { title: EXTRA_LABELS.deck, detail: `${SIDE_LABELS[e.side]} · ${e.length ? `${f(e.length)} × ` : ''}${f(e.depth)} m${e.covered ? ' · coberto' : ''}` };
    case 'wall':
      return { title: EXTRA_LABELS.wall, detail: `${f(pathLength(e.path, e.closed), 0)} m · ${f(e.height)} m de altura` };
    case 'fence':
      return { title: EXTRA_LABELS.fence, detail: `${f(pathLength(e.path, e.closed), 0)} m · ${f(e.height)} m de altura` };
    case 'retaining':
      return { title: EXTRA_LABELS.retaining, detail: `${f(pathLength(e.path, false), 0)} m · ${f(e.height)} m de altura` };
    case 'water_tower':
      return { title: EXTRA_LABELS.water_tower, detail: `${f(e.width)} × ${f(e.depth)} m · caixa a ${f(e.platformZ)} m` };
  }
}

/** Nome numerado por tipo na ordem do projeto ("Cerca 2"). */
export function extraLabel(p: Project, id: string): string {
  const e = findExtra(p, id);
  if (!e) return id;
  const same = p.extras.filter((x) => x.kind === e.kind);
  return same.length > 1 ? `${EXTRA_LABELS[e.kind]} ${same.findIndex((x) => x.id === id) + 1}` : EXTRA_LABELS[e.kind];
}

// ---------------------------------------------------------------------------
// Layout 3D do deck (dados puros para a cena: caixas orientadas, em coordenadas do motor, z para cima)
// ---------------------------------------------------------------------------

/** Caixa orientada: `size` = [comprimento (x local), largura (y local), altura (z local)]; yaw em z, pitch em torno de y. */
export interface DeckBox {
  center: Vec3;
  yaw: number;
  pitch: number;
  size: [number, number, number];
}

/** Barra entre dois pontos 3D com seção `w` × `h` (comprimento no x local). */
export function rodBox(a: Vec3, b: Vec3, w: number, h: number): DeckBox {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const horiz = Math.hypot(dx, dy);
  return {
    center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
    yaw: Math.atan2(dy, dx),
    pitch: -Math.atan2(dz, horiz),
    size: [Math.max(1e-3, Math.hypot(horiz, dz)), w, h],
  };
}

/** Faixa [a, q] (ao longo e para fora da face) coberta pelo polígono do deck. */
function deckRange(em: ExtraModel): { a0: number; a1: number; q0: number; q1: number } | null {
  const d = em.deck;
  if (!d || !em.polygon || em.polygon.length < 3) return null;
  const o = d.facade.origin;
  const a: number[] = [];
  const q: number[] = [];
  for (const p of em.polygon) {
    a.push((p[0] - o[0]) * d.facade.t[0] + (p[1] - o[1]) * d.facade.t[1]);
    q.push((p[0] - o[0]) * d.facade.n[0] + (p[1] - o[1]) * d.facade.n[1]);
  }
  return { a0: Math.min(...a), a1: Math.max(...a), q0: Math.min(...q), q1: Math.max(...q) };
}

/** Tábuas do piso no `boardDir`, preenchendo o deck com juntas de `gap`. Vazio sem estrutura do motor. */
export function deckBoardLayout(em: ExtraModel, board: { width: number; gap: number }): DeckBox[] {
  const d = em.deck;
  const r = deckRange(em);
  if (!d || !r || em.topZ === undefined) return [];
  const o = d.facade.origin;
  const { t, n } = d.facade;
  const along = d.boardDir; // direção das tábuas
  const parallel = Math.abs(along[0] * t[0] + along[1] * t[1]) > 0.5;
  const lenSpan = parallel ? r.a1 - r.a0 : r.q1 - r.q0;
  const acrossSpan = parallel ? r.q1 - r.q0 : r.a1 - r.a0;
  const count = Math.max(1, Math.round((acrossSpan + board.gap) / (board.width + board.gap)));
  const pitch = (acrossSpan + board.gap) / count;
  const width = pitch - board.gap;
  const yaw = Math.atan2(along[1], along[0]);
  const out: DeckBox[] = [];
  for (let i = 0; i < count; i++) {
    const across = (parallel ? r.q0 : r.a0) + pitch * i + width / 2;
    const mid = (parallel ? r.a0 : r.q0) + lenSpan / 2;
    const a = parallel ? mid : across;
    const q = parallel ? across : mid;
    out.push({
      center: [o[0] + t[0] * a + n[0] * q, o[1] + t[1] * a + n[1] * q, em.topZ - d.boardThickness / 2],
      yaw,
      pitch: 0,
      size: [lenSpan, width, d.boardThickness],
    });
  }
  return out;
}

/** Testeira (borda de acabamento) nas três bordas livres; o lado da casa não leva. */
export function deckFasciaLayout(em: ExtraModel, depth: number, thickness = 0.02): DeckBox[] {
  const d = em.deck;
  const r = deckRange(em);
  if (!d || !r || em.topZ === undefined) return [];
  const o = d.facade.origin;
  const { t, n } = d.facade;
  const P = (a: number, q: number, z: number): Vec3 => [o[0] + t[0] * a + n[0] * q, o[1] + t[1] * a + n[1] * q, z];
  const zc = em.topZ - depth / 2;
  const off = thickness / 2;
  return [
    rodBox(P(r.a0 - off, r.q0, zc), P(r.a0 - off, r.q1 + thickness, zc), thickness, depth),
    rodBox(P(r.a0 - thickness, r.q1 + off, zc), P(r.a1 + thickness, r.q1 + off, zc), thickness, depth),
    rodBox(P(r.a1 + off, r.q1 + thickness, zc), P(r.a1 + off, r.q0, zc), thickness, depth),
  ];
}

/** Barrotes, vigas e ledger como caixas (o topo do membro é `topZ`). */
export function deckMemberBoxes(members: { from: Vec2; to: Vec2; topZ: number; width: number; depth: number }[]): DeckBox[] {
  return members.map((m) => rodBox([m.from[0], m.from[1], m.topZ - m.depth / 2], [m.to[0], m.to[1], m.topZ - m.depth / 2], m.width, m.depth));
}

export interface DeckRailLayout {
  /** Montantes, balaústres, corrimão e travessa baixa (mesmo material). */
  boxes: DeckBox[];
}

/** LOCAL: afastamento dos montantes e dos balaústres do guarda-corpo (vão máx. 11 cm, NBR 14718). */
const RAIL_POST_STEP = 1.2;
const RAIL_BALUSTER_STEP = 0.13;

/** Guarda-corpo de cada segmento `rail`: montantes, balaústres verticais e corrimão. */
export function deckRailLayout(segments: ExtraModel['segments']): DeckRailLayout {
  const boxes: DeckBox[] = [];
  for (const s of segments) {
    if (s.material !== 'rail') continue;
    const len = Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1]);
    if (len < 0.05) continue;
    const dir: Vec2 = [(s.to[0] - s.from[0]) / len, (s.to[1] - s.from[1]) / len];
    const yaw = Math.atan2(dir[1], dir[0]);
    const at = (u: number): Vec2 => [s.from[0] + dir[0] * u, s.from[1] + dir[1] * u];
    const nPost = Math.max(1, Math.ceil(len / RAIL_POST_STEP));
    for (let i = 0; i <= nPost; i++) {
      const p = at((len * i) / nPost);
      boxes.push({ center: [p[0], p[1], s.baseZ + s.height / 2], yaw, pitch: 0, size: [0.05, 0.05, s.height] });
    }
    const nBal = Math.max(1, Math.floor(len / RAIL_BALUSTER_STEP));
    for (let i = 0; i < nBal; i++) {
      const p = at(((i + 0.5) * len) / nBal);
      boxes.push({ center: [p[0], p[1], s.baseZ + 0.06 + (s.height - 0.12) / 2], yaw, pitch: 0, size: [0.02, 0.02, s.height - 0.12] });
    }
    const mid = at(len / 2);
    boxes.push({ center: [mid[0], mid[1], s.baseZ + s.height - 0.02], yaw, pitch: 0, size: [len, 0.07, 0.04] });
    boxes.push({ center: [mid[0], mid[1], s.baseZ + 0.06], yaw, pitch: 0, size: [len, 0.04, 0.04] });
  }
  return { boxes };
}

export interface DeckStairLayout {
  treads: DeckBox[];
  stringers: DeckBox[];
  /** Montantes e corrimãos inclinados dos dois lados. */
  rails: DeckBox[];
}

/** LOCAL: espessura do degrau, seção da longarina e altura do corrimão da escada (m). */
const STAIR_TREAD_THICKNESS = 0.04;
const STAIR_STRINGER = { width: 0.05, depth: 0.25 };
const STAIR_HANDRAIL_HEIGHT = 0.92;

/** Degraus, longarinas e corrimão de uma escada do deck. */
export function deckStairLayout(s: DeckStairModel): DeckStairLayout {
  const { top, dir, width, risers, riserHeight, tread, topZ } = s;
  const side: Vec2 = [-dir[1], dir[0]];
  const at = (u: number, lat: number): Vec2 => [top[0] + dir[0] * u + side[0] * lat, top[1] + dir[1] * u + side[1] * lat];
  const treads: DeckBox[] = [];
  for (let i = 1; i <= Math.max(1, risers - 1); i++) {
    const c = at((i - 0.5) * tread, 0);
    const z = topZ - i * riserHeight - STAIR_TREAD_THICKNESS / 2;
    treads.push({ center: [c[0], c[1], z], yaw: Math.atan2(dir[1], dir[0]), pitch: 0, size: [tread, width, STAIR_TREAD_THICKNESS] });
  }
  const run = (risers - 1) * tread;
  const zTopNose = topZ - riserHeight; // topo do primeiro degrau
  const zBottom = topZ - risers * riserHeight;
  const stringers: DeckBox[] = [];
  const rails: DeckBox[] = [];
  for (const lat of [-(width / 2 - STAIR_STRINGER.width / 2), width / 2 - STAIR_STRINGER.width / 2]) {
    const a = at(0, lat);
    const b = at(run, lat);
    const drop = STAIR_STRINGER.depth / 2 + STAIR_TREAD_THICKNESS;
    stringers.push(rodBox([a[0], a[1], zTopNose - drop], [b[0], b[1], zBottom - drop + riserHeight], STAIR_STRINGER.width, STAIR_STRINGER.depth));
    // corrimão acima do bico dos degraus: de h acima do primeiro degrau até h acima do último
    const h = STAIR_HANDRAIL_HEIGHT;
    const last = topZ - Math.max(1, risers - 1) * riserHeight;
    rails.push(rodBox([a[0], a[1], zTopNose + h], [b[0], b[1], last + h], 0.05, 0.04));
    const nPost = Math.max(2, Math.min(risers, 4));
    for (let k = 0; k < nPost; k++) {
      const u = (run * k) / Math.max(1, nPost - 1);
      const p = at(u, lat);
      const zt = zTopNose + h - (run > 0 ? ((zTopNose - last) * u) / run : 0);
      const zb = zt - h;
      rails.push({ center: [p[0], p[1], (zt + zb) / 2], yaw: 0, pitch: 0, size: [0.04, 0.04, h] });
    }
  }
  return { treads, stringers, rails };
}

export interface DeckPillarLayout {
  pillars: { box: DeckBox; material: 'wood' | 'steel' | 'concrete' }[];
  /** Sapatas (caixas) e brocas (cilindros) aparentes acima do chão. */
  pads: DeckBox[];
  bored: { center: Vec3; radius: number; height: number }[];
  braces: DeckBox[];
}

/** LOCAL: quanto a sapata/broca aparece acima do chão (m) e a seção da mão-francesa. */
const FOOTING_REVEAL = 0.1;
const BRACE = { size: 0.05, reach: 0.6 };

/** Pilares do chão até a viga, com a sapata/broca aparente e a mão-francesa dos pilares altos. */
export function deckPillarLayout(em: ExtraModel): DeckPillarLayout {
  const d = em.deck;
  const out: DeckPillarLayout = { pillars: [], pads: [], bored: [], braces: [] };
  const r = deckRange(em);
  if (!d || !r) return out;
  const o = d.facade.origin;
  const { t, n } = d.facade;
  for (const s of d.supports) {
    const h = Math.max(0, s.topZ - s.groundZ);
    if (h > 1e-6) {
      out.pillars.push({ box: { center: [s.position[0], s.position[1], s.groundZ + h / 2], yaw: 0, pitch: 0, size: [s.size, s.size, h] }, material: s.material });
    }
    if (s.footing.kind === 'pad') {
      const w = s.footing.width;
      out.pads.push({ center: [s.position[0], s.position[1], s.groundZ + FOOTING_REVEAL / 2 - 0.02], yaw: 0, pitch: 0, size: [w, w, FOOTING_REVEAL + 0.04] });
    } else {
      out.bored.push({ center: [s.position[0], s.position[1], s.groundZ + FOOTING_REVEAL / 2 - 0.02], radius: s.footing.width / 2, height: FOOTING_REVEAL + 0.04 });
    }
    if (s.braced && h > BRACE.reach) {
      const a = (s.position[0] - o[0]) * t[0] + (s.position[1] - o[1]) * t[1];
      const toCenter = a < (r.a0 + r.a1) / 2 ? 1 : -1;
      const zTop = s.topZ;
      const zLow = zTop - BRACE.reach;
      // uma mão-francesa para o meio da viga e outra para a casa
      const dirs: Vec2[] = [
        [t[0] * toCenter, t[1] * toCenter],
        [-n[0], -n[1]],
      ];
      for (const dv of dirs) {
        out.braces.push(rodBox([s.position[0], s.position[1], zLow], [s.position[0] + dv[0] * BRACE.reach, s.position[1] + dv[1] * BRACE.reach, zTop], BRACE.size, BRACE.size));
      }
    }
  }
  return out;
}
