/**
 * Gerador do assistente: transforma as respostas num projeto completo (planta, cômodos, móveis, acabamentos).
 * Puro e determinístico: IDs sequenciais, sem relógio nem acaso. Reaproveita o `Builder` dos modelos prontos
 * e as funções de edição do editor; os móveis vão com `furnishRoom` e depois passam pelo próprio motor
 * (alertas de colisão, parede, porta, escada e pé-direito), que tira o que não cabe.
 */
import { buildModel, computeAll, Project, roofBelowAt, type Opening, type BuildingModel, type Furniture, type RoomUse, type Vec2 } from '@chalecad/engine';
import { getCatalog, type Catalog } from '@chalecad/catalog';
import { Builder } from '../presets/builder';
import { addFurniture, furnishRoom, furnitureFootprint, polysOverlap, rotationFacing, specOf, WALL_GAP } from '../furniture';
import { addExtra, patchExtra } from '../extras';
import { stairRun } from '../edit';
import { patchRoom } from '../rooms';
import { setStructure } from '../system';
import { makeSlopedSite } from '../terrain';
import { addAnnex } from '../annex';
import { round } from '../geometry';
import type { IdGen } from '../ids';
import { planNormFixes, type NormFixChange } from '../normfix';
import { ensureDaylight } from './daylight';
import { normalizeAnswers, type StyleKind, type WizardAnswers } from './answers';
import { effectiveMezzanine, resolveStyle, STYLE_NAMES } from './style';

export interface GenerateResult {
  project: Project;
  notes: string[];
  /** Pontos que ainda pedem revisão (alerta de atenção ou verificação reprovada). Vazio = dentro das verificações automáticas. */
  review: string[];
  /** O que o "Ajustar às normas" mudou no projeto (perfil, espaçamento, pé-direito, janelas). */
  fixes: NormFixChange[];
}

// ---------------------------------------------------------------------------
// Constantes do gerador (medidas de projeto, não constantes técnicas do catálogo)
// ---------------------------------------------------------------------------

const SEQ = (): IdGen => {
  const n: Record<string, number> = {};
  return (p) => `${p}-${(n[p] = (n[p] ?? 0) + 1)}`;
};
/** Profundidade típica de cada tipo de cômodo no bloco íntimo (m). */
const ROOM_DEPTH: Partial<Record<RoomUse, number>> = { bedroom: 3.0, bathroom: 2.4, laundry: 2.0, kitchen: 3.2 };
const BATH_W = 2.4;
const LAUNDRY_W = 2.0;
const CORRIDOR_W = 1.0;
const DOOR_W: Partial<Record<RoomUse, number>> = { bedroom: 0.8, bathroom: 0.7, laundry: 0.7, kitchen: 0.8, circulation: 0.8, living: 0.8 };
/** Folga entre o fim da escada (borda do mezanino) e a parede do bloco íntimo. */
const STAIR_GAP = 0.6;
/** Nas caixas (duas águas, celeiro) a parede do bloco íntimo fica na própria borda do mezanino: ela apoia as vigas. */
const BOX_GAP = 0;
/** Mureta do quarto/sala do mezanino (m): separa a faixa com pé-direito do canto baixo sob o telhado. */
const LOFT_KNEE = 1.1;
const STAIR_HALF = 0.4;
/** Acima desta profundidade (m) o mezanino das caixas passa a cobrir só a coluna da escada. */
const NARROW_MD = 4.8;
/** Distância da fachada da frente ao pé da escada (cabe a chegada de 0,8 m em parte). */
const STAIR_FOOT = 0.9;

interface RoomReq {
  use: RoomUse;
  name: string;
}

interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const f1 = (n: number) => String(round(n, 1)).replace('.', ',');

// ---------------------------------------------------------------------------
// Ajudantes
// ---------------------------------------------------------------------------

class Gen {
  readonly ids = SEQ();
  readonly notes: string[] = [];
  readonly catalog: Catalog = getCatalog();
  b!: Builder;
  /** Trechos já ocupados por aberturas, por hospedeiro: [u0, u1]. */
  private occ = new Map<string, [number, number][]>();
  /** Paredes internas já criadas (chave pelos extremos) para os cômodos vizinhos dividirem a mesma parede. */
  private walls = new Map<string, string>();

  note(s: string) {
    if (!this.notes.includes(s)) this.notes.push(s);
  }

  /** Posição ao longo do hospedeiro (a partir do `from`) do ponto projetado no eixo. */
  uOn(host: string, pt: Vec2): { u: number; len: number } | null {
    const w = this.b.model.walls.find((x) => x.id === host);
    if (!w) return null;
    const dx = (w.to[0] - w.from[0]) / w.length;
    const dy = (w.to[1] - w.from[1]) / w.length;
    return { u: (pt[0] - w.from[0]) * dx + (pt[1] - w.from[1]) * dy, len: w.length };
  }

  private free(host: string, u0: number, u1: number) {
    return !(this.occ.get(host) ?? []).some(([a, b]) => u0 < b + 0.1 && u1 > a - 0.1);
  }
  private take(host: string, u0: number, u1: number) {
    this.occ.set(host, [...(this.occ.get(host) ?? []), [u0, u1]]);
  }

  /** Abertura centrada no ponto do hospedeiro. Ajusta para caber; ignora se bater em outra abertura. */
  openAt(host: string, pt: Vec2, type: 'door' | 'window' | 'sliding_door', width: number, height: number, sill: number): boolean {
    const pos = this.uOn(host, pt);
    if (!pos) return false;
    const u0 = Math.min(Math.max(pos.u - width / 2, 0.2), Math.max(0.2, pos.len - width - 0.2));
    if (u0 + width > pos.len - 0.05 || !this.free(host, u0, u0 + width)) return false;
    this.take(host, u0, u0 + width);
    this.b.open(host, type, u0, width, height, sill);
    return true;
  }

  /** Parede interna entre dois pontos (reaproveita se já existe). Normaliza o sentido (menor coordenada primeiro). */
  wall(a: Vec2, c: Vec2, wet = false): string {
    const [p, q] = a[0] < c[0] - 1e-9 || (Math.abs(a[0] - c[0]) < 1e-9 && a[1] <= c[1]) ? [a, c] : [c, a];
    const key = [p[0], p[1], q[0], q[1]].map((n) => round(n, 3)).join(',');
    const had = this.walls.get(key);
    if (had) return had;
    const id = this.b.wall([round(p[0], 3), round(p[1], 3)], [round(q[0], 3), round(q[1], 3)], { wet });
    this.walls.set(key, id);
    return id;
  }

  /** Porta no meio de uma parede interna (centro em `c`, ao longo dela). */
  doorOn(wallId: string, from: Vec2, c: Vec2, width: number) {
    const dist = Math.hypot(c[0] - from[0], c[1] - from[1]);
    this.b.door(wallId, Math.max(0.15, dist - width / 2), width);
  }
}

/** Move o centro da porta para fora do pé da escada (que fica no meio da largura), dentro da parede do cômodo. */
function clearOfStair(c: number, dw: number, x0: number, x1: number, W: number): number {
  const lo = W / 2 - STAIR_HALF - 0.1;
  const hi = W / 2 + STAIR_HALF + 0.1;
  if (c + dw / 2 <= lo || c - dw / 2 >= hi) return c;
  const left = lo - dw / 2 - 0.05;
  const right = hi + dw / 2 + 0.05;
  if (left >= x0 + dw / 2 + 0.1) return left;
  if (right <= x1 - dw / 2 - 0.1) return right;
  return c;
}

/** Contorno fechado de um cômodo retangular com as quatro paredes (as que coincidem com a fachada ficam de fora). */
function roomWalls(g: Gen, r: Rect, ext: { x0?: number; x1?: number; y0?: number; y1?: number }, wet: boolean) {
  const e = (a: number | undefined, v: number) => a !== undefined && Math.abs(a - v) < 1e-6;
  const out: { top?: string; bottom?: string; left?: string; right?: string } = {};
  // "top" é o lado de menor y (frente), "bottom" o de maior y (fundos)
  if (!e(ext.y0, r.y0)) out.top = g.wall([r.x0, r.y0], [r.x1, r.y0], wet);
  if (!e(ext.y1, r.y1)) out.bottom = g.wall([r.x0, r.y1], [r.x1, r.y1], wet);
  if (!e(ext.x0, r.x0)) out.left = g.wall([r.x0, r.y0], [r.x0, r.y1], wet);
  if (!e(ext.x1, r.x1)) out.right = g.wall([r.x1, r.y0], [r.x1, r.y1], wet);
  return out;
}

// ---------------------------------------------------------------------------
// Programa (lista de cômodos) e dimensões
// ---------------------------------------------------------------------------

interface Program {
  style: StyleKind;
  mezz: 'none' | 'sleep' | 'living';
  bathUp: boolean;
  /** Quartos no térreo (o do mezanino, se for de dormir, já foi descontado). */
  groundBeds: number;
  groundBaths: number;
  laundryInside: boolean;
  kitchenSeparate: boolean;
}

function programOf(a: WizardAnswers, g: Gen): Program {
  const style = resolveStyle(a).kind;
  const mezz = effectiveMezzanine(a);
  const wantsMezz = a.mezzanine !== 'none' && !(['aframe', 'gable', 'gambrel'] as StyleKind[]).includes(style);
  if (wantsMezz) g.note(`O estilo ${STYLE_NAMES[style]} não tem mezanino; deixei tudo no térreo.`);
  let bathUp = a.bathUp && mezz !== 'none';
  if (mezz === 'none') bathUp = false;
  const groundBeds = Math.max(0, a.bedrooms - (mezz === 'sleep' ? 1 : 0));
  if (mezz === 'sleep' && a.bedrooms > 1) g.note('Um dos quartos fica no mezanino (aberto, com escada).');
  return { style, mezz, bathUp, groundBeds, groundBaths: a.bathrooms, laundryInside: a.laundry === 'inside', kitchenSeparate: a.kitchen === 'separate' };
}

/** Cômodos do bloco íntimo, na ordem: banheiro (junto da cozinha), lavanderia, quartos, 2º banheiro. */
function privateRooms(p: Program): RoomReq[] {
  const out: RoomReq[] = [{ use: 'bathroom', name: p.groundBaths > 1 ? 'Banheiro 1' : 'Banheiro' }];
  if (p.laundryInside) out.push({ use: 'laundry', name: 'Lavanderia' });
  for (let i = 0; i < p.groundBeds; i++) out.push({ use: 'bedroom', name: p.groundBeds > 1 ? `Quarto ${i + 1}` : 'Quarto' });
  if (p.groundBaths > 1) out.push({ use: 'bathroom', name: 'Banheiro 2' });
  return out;
}

interface RowItem {
  req: RoomReq;
  rect: Rect;
}

/**
 * Bloco íntimo de uma caixa retangular W × [yp, yp + pd]: poucos cômodos lado a lado; muitos, em duas colunas
 * com um corredor no meio. Devolve os retângulos (os cômodos úmidos ficam à direita, junto da cozinha).
 */
function planPrivateBlock(W: number, yp: number, rooms: RoomReq[], opts: { minPd?: number; corridorX?: number } = {}): { items: RowItem[]; pd: number; corridor: Rect | null } {
  const wet = rooms.filter((r) => r.use !== 'bedroom');
  const beds = rooms.filter((r) => r.use === 'bedroom');
  const depthOf = (r: RoomReq) => ROOM_DEPTH[r.use] ?? 3;
  if (rooms.length <= 2) {
    // lado a lado, encostados na direita; o quarto pega o resto da largura
    const ordered = [...beds, ...wet];
    const widths = ordered.map((r) => (r.use === 'bathroom' ? BATH_W : r.use === 'laundry' ? LAUNDRY_W : Math.max(3, W - wet.reduce((s, w) => s + (w.use === 'laundry' ? LAUNDRY_W : BATH_W), 0))));
    const pd = Math.max(opts.minPd ?? 0, 3.2, ...ordered.map(depthOf));
    let x = W - widths.reduce((s, w) => s + w, 0);
    const items = ordered.map((req, i) => {
      const rect = { x0: round(x, 3), x1: round(x + widths[i]!, 3), y0: yp, y1: round(yp + pd, 3) };
      x += widths[i]!;
      return { req, rect };
    });
    return { items, pd, corridor: null };
  }
  // duas colunas: úmidos à direita; quartos na coluna mais curta
  const cols: [RoomReq[], RoomReq[]] = [[], []];
  const sum = (c: RoomReq[]) => c.reduce((s, r) => s + depthOf(r), 0);
  cols[1].push(...wet.filter((r) => r.use !== 'bathroom' || r === wet[0]));
  const extraBaths = wet.filter((r) => r.use === 'bathroom' && r !== wet[0]);
  for (const r of [...beds, ...extraBaths]) (sum(cols[0]) <= sum(cols[1]) ? cols[0] : cols[1]).push(r);
  const pd = Math.max(opts.minPd ?? 0, 3.2, sum(cols[0]), sum(cols[1]));
  const cx = opts.corridorX ?? W / 2;
  const items: RowItem[] = [];
  cols.forEach((col, ci) => {
    const x0 = ci === 0 ? 0 : cx + CORRIDOR_W / 2;
    const x1 = ci === 0 ? cx - CORRIDOR_W / 2 : W;
    const extra = (pd - sum(col)) / Math.max(1, col.length);
    let y = yp;
    col.forEach((req, i) => {
      const d = depthOf(req) + extra;
      const y1 = i === col.length - 1 ? yp + pd : y + d;
      items.push({ req, rect: { x0: round(x0, 3), x1: round(x1, 3), y0: round(y, 3), y1: round(y1, 3) } });
      y = y1;
    });
  });
  return { items, pd, corridor: { x0: round(cx - CORRIDOR_W / 2, 3), x1: round(cx + CORRIDOR_W / 2, 3), y0: yp, y1: round(yp + pd, 3) } };
}

// ---------------------------------------------------------------------------
// Janelas e portas dos cômodos
// ---------------------------------------------------------------------------

type Ext = { x0: number; x1: number; y1: number; y0: number };

/** Janela do cômodo numa fachada que ele toca. Banheiro e lavanderia: basculante alta. */
function roomWindow(g: Gen, it: RowItem, ext: Ext, hostsOverride?: { host: string; pt: Vec2 }[]) {
  const { rect: r, req } = it;
  const cx = (r.x0 + r.x1) / 2;
  const cy = (r.y0 + r.y1) / 2;
  const small = req.use === 'bathroom' || req.use === 'laundry';
  const [w, h, sill] = small ? [1.0, 0.6, 1.5] : req.use === 'kitchen' ? [1.2, 1.0, 1.1] : [1.5, 1.2, 0.9];
  // a janela fica encostada num canto (a 0,3 m dele): sobra um painel liso largo para o contraventamento
  const sx = Math.min(r.x0 + 0.3 + w / 2, cx);
  const sy = Math.min(r.y0 + 0.3 + w / 2, cy);
  const cands: { host: string; pt: Vec2 }[] = hostsOverride ?? [];
  if (!hostsOverride) {
    if (Math.abs(r.x0 - ext.x0) < 1e-6) cands.push({ host: 'ext-left', pt: [ext.x0, sy] });
    if (Math.abs(r.x1 - ext.x1) < 1e-6) cands.push({ host: 'ext-right', pt: [ext.x1, sy] });
    if (Math.abs(r.y1 - ext.y1) < 1e-6) cands.push({ host: 'ext-back', pt: [sx, ext.y1] });
    if (Math.abs(r.y0 - ext.y0) < 1e-6) cands.push({ host: 'ext-front', pt: [sx, ext.y0] });
  }
  for (const c of cands) if (g.openAt(c.host, c.pt, 'window', w, h, sill)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Móveis: o motor valida e tira o que não cabe
// ---------------------------------------------------------------------------

const FURNITURE_BAD = new Set(['furniture.collision', 'furniture.wall', 'furniture.outside', 'furniture.door', 'furniture.stair', 'furniture.headroom', 'furniture.unknown']);

function badFurnitureIds(p: Project, catalog: Catalog): Set<string> {
  const r = computeAll(Project.parse(JSON.parse(JSON.stringify(p))), catalog);
  const bad = new Set<string>();
  for (const w of r.warnings) if (FURNITURE_BAD.has(w.code)) for (const id of w.refs ?? []) if (p.furniture.some((f) => f.id === id)) bad.add(id);
  return bad;
}

/** Tira, a cada rodada, o móvel que o motor aponta (o último colocado em cada par que colide). Devolve quantos saíram. */
function pruneFurniture(g: Gen): number {
  let removed = 0;
  for (let i = 0; i < 12; i++) {
    const bad = badFurnitureIds(g.b.p, g.catalog);
    if (bad.size === 0) break;
    // em colisões entre dois móveis, os dois entram na lista: tira só o mais novo
    const order = new Map(g.b.p.furniture.map((f, idx) => [f.id, idx]));
    const drop = new Set<string>();
    const coll = computeAll(Project.parse(JSON.parse(JSON.stringify(g.b.p))), g.catalog).warnings.filter((w) => w.code === 'furniture.collision');
    for (const w of coll) {
      const [a, c] = (w.refs ?? []) as string[];
      if (a && c) drop.add((order.get(a) ?? 0) > (order.get(c) ?? 0) ? a : c);
    }
    for (const id of bad) {
      const isColl = coll.some((w) => (w.refs ?? []).includes(id));
      if (!isColl) drop.add(id);
    }
    if (drop.size === 0) for (const id of bad) drop.add(id);
    g.b.p.furniture = g.b.p.furniture.filter((f) => !drop.has(f.id));
    removed += drop.size;
  }
  return removed;
}

/** Tenta pôr um móvel numa posição; fica só se o motor não reclamar dele. */
function tryAdd(g: Gen, level: string, item: string, pos: Vec2, rot = 0): boolean {
  const id = addFurniture(g.b.p, level, item, pos, rot, g.ids);
  if (badFurnitureIds(g.b.p, g.catalog).has(id)) {
    g.b.p.furniture = g.b.p.furniture.filter((f) => f.id !== id);
    return false;
  }
  return true;
}

const has = (p: Project, rooms: BuildingModel['rooms'], roomId: string, model: string, catalog: Catalog) => {
  const r = rooms.find((x) => x.id === roomId);
  if (!r?.polygon) return false;
  return p.furniture.some((f) => specOf(catalog, f.item)?.model === model && f.level === r.level && inPoly(f.position as Vec2, r.polygon as Vec2[]));
};

function inPoly(pt: Vec2, poly: Vec2[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Candidatos junto das arestas do cômodo (fundo do móvel encostado), do mais comprido para o mais curto. */
function edgeSpots(g: Gen, item: string, level: string, poly: Vec2[], thickness = 0.12): { pos: Vec2; rot: number }[] {
  const spec = specOf(g.catalog, item);
  if (!spec) return [];
  const cx = poly.reduce((s, v) => s + v[0], 0) / poly.length;
  const cy = poly.reduce((s, v) => s + v[1], 0) / poly.length;
  const others = g.b.p.furniture
    .filter((f) => f.level === level)
    .flatMap((f) => {
      const sp = specOf(g.catalog, f.item);
      return sp?.collides ? [furnitureFootprint(sp, f.position as Vec2, f.rotation)] : [];
    });
  const out: { pos: Vec2; rot: number; score: number }[] = [];
  poly.forEach((a, i) => {
    const c = poly[(i + 1) % poly.length]!;
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (len < spec.size.w + 0.1) return;
    const d: Vec2 = [(c[0] - a[0]) / len, (c[1] - a[1]) / len];
    let n: Vec2 = [-d[1], d[0]];
    const mid: Vec2 = [(a[0] + c[0]) / 2 + n[0] * 0.05, (a[1] + c[1]) / 2 + n[1] * 0.05];
    if (!inPoly(mid, poly)) n = [-n[0], -n[1]];
    const off = thickness / 2 + spec.size.d / 2 + WALL_GAP;
    for (let u = spec.size.w / 2 + 0.1; u <= len - spec.size.w / 2 - 0.1 + 1e-6; u += 0.3) {
      const pos: Vec2 = [round(a[0] + d[0] * u + n[0] * off, 3), round(a[1] + d[1] * u + n[1] * off, 3)];
      const rot = rotationFacing(n);
      const fp = furnitureFootprint(spec, pos, rot);
      if (!fp.every((q) => inPoly(q, poly) || true)) continue;
      if (spec.collides && others.some((o) => polysOverlap(fp, o))) continue;
      out.push({ pos, rot, score: Math.hypot(pos[0] - cx, pos[1] - cy) });
    }
  });
  return out.sort((x, y) => x.score - y.score).slice(0, 14);
}

/** Último recurso: pontos soltos dentro do cômodo (do centro para fora), nas quatro direções. */
function gridSpots(g: Gen, item: string, level: string, poly: Vec2[]): { pos: Vec2; rot: number }[] {
  const spec = specOf(g.catalog, item);
  if (!spec) return [];
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const others = g.b.p.furniture
    .filter((f) => f.level === level)
    .flatMap((f) => {
      const sp = specOf(g.catalog, f.item);
      return sp?.collides ? [furnitureFootprint(sp, f.position as Vec2, f.rotation)] : [];
    });
  const out: { pos: Vec2; rot: number; score: number }[] = [];
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.2)
    for (let y = Math.min(...ys); y <= Math.max(...ys); y += 0.2)
      for (const rot of [0, 90]) {
        const pos: Vec2 = [round(x, 2), round(y, 2)];
        const fp = furnitureFootprint(spec, pos, rot);
        if (!fp.every((q) => inPoly(q, poly))) continue;
        if (others.some((o) => polysOverlap(fp, o))) continue;
        out.push({ pos, rot, score: Math.hypot(x - cx, y - cy) });
      }
  return out.sort((a, b) => a.score - b.score).slice(0, 25);
}

function furnishAll(g: Gen, opts: { integratedRoomId?: string }) {
  const { b, catalog } = g;
  const model = buildModel(Project.parse(JSON.parse(JSON.stringify(b.p))), catalog);
  for (const room of model.rooms) {
    if (!room.polygon) continue;
    const ctx = { walls: model.walls.filter((w) => w.level === room.level), openings: model.openings };
    // sala e cozinha integradas: primeiro a cozinha, depois a sala
    const uses: RoomUse[] = room.id === opts.integratedRoomId ? ['kitchen', 'living'] : [room.use];
    for (const use of uses) {
      const out = furnishRoom(b.p, catalog, { ...room, use }, ctx, g.ids);
      b.p.furniture.push(...(out as Furniture[]));
    }
  }
  pruneFurniture(g);
  // o que o `furnishRoom` não achou (ou o motor tirou): tenta de novo em outros pontos
  const after = buildModel(Project.parse(JSON.parse(JSON.stringify(b.p))), catalog);
  for (const room of after.rooms) {
    if (!room.polygon) continue;
    const poly = room.polygon as Vec2[];
    const want: [string, string][] = [];
    const isInt = room.id === opts.integratedRoomId;
    if (room.use === 'bedroom') want.push(['bed', 'furn_bed_double'], ['wardrobe', 'furn_wardrobe_small']);
    if (room.use === 'kitchen' || isInt) want.push(['fridge', 'furn_fridge'], ['stove', 'furn_stove'], ['sink', 'furn_kitchen_sink']);
    if (room.use === 'living' || isInt) want.push(['sofa', 'furn_sofa_2']);
    for (const [, item] of want) {
      const spec = specOf(catalog, item);
      if (!spec || has(b.p, after.rooms, room.id, spec.model, catalog)) continue;
      let done = false;
      for (const c of edgeSpots(g, item, room.level, poly)) if ((done = tryAdd(g, room.level, item, c.pos, c.rot))) break;
      if (!done) for (const c of gridSpots(g, item, room.level, poly)) if (tryAdd(g, room.level, item, c.pos, c.rot)) break;
    }
  }
}

// ---------------------------------------------------------------------------
// Acabamentos
// ---------------------------------------------------------------------------

function applyFinishes(g: Gen, a: WizardAnswers, style: StyleKind) {
  const { b } = g;
  const rent = a.purpose === 'rent';
  const weekend = a.purpose === 'weekend';
  const facade = rent ? 'finish_facade_siding' : style === 'shed' || style === 'flat' ? 'finish_facade_texture' : 'finish_facade_wood';
  const roofColor = style === 'aframe' ? 'black' : rent ? 'graphite' : weekend ? 'terracotta' : 'graphite';
  b.finishes({ facade, roofColor, ...(style === 'aframe' || style === 'gambrel' ? { interiorRoof: weekend ? 'finish_ceiling_wood' : 'finish_ceiling_paint' } : {}) });
  for (const r of b.p.rooms) {
    if (r.use === 'bathroom') continue;
    if (rent) patchRoom(b.p, r.id, { floor: 'finish_floor_porcelain', walls: 'finish_wall_paint' });
    else if (weekend) patchRoom(b.p, r.id, { floor: r.use === 'kitchen' || r.use === 'laundry' ? 'finish_floor_porcelain' : 'finish_floor_vinyl', walls: r.use === 'living' ? 'finish_wall_wood' : 'finish_wall_paint' });
    else patchRoom(b.p, r.id, { floor: r.use === 'kitchen' || r.use === 'laundry' ? 'finish_floor_porcelain' : 'finish_floor_laminate', walls: 'finish_wall_paint' });
  }
  g.note(
    rent
      ? 'Como o chalé é para alugar, usei porcelanato no chão e pintura nas paredes: aguenta o uso e limpa fácil.'
      : weekend
        ? 'Como é para fim de semana, usei piso vinílico e madeira na sala: aconchegante e rápido de colocar.'
        : 'Como é para morar, usei piso laminado nos quartos e porcelanato na cozinha.',
  );
}

// ---------------------------------------------------------------------------
// Geração por estilo
// ---------------------------------------------------------------------------

function boxKind(style: StyleKind) {
  return style === 'gable' ? 'gable_mezzanine' : style === 'gambrel' ? 'gambrel' : style === 'shed' ? 'shed' : 'flat_roof';
}

function genBox(g: Gen, a: WizardAnswers, p: Program): void {
  const style = p.style;
  const hasStair = p.mezz !== 'none';
  const rooms = privateRooms(p);
  // largura: 6,5 a 7 conforme os quartos; moderno sem escada pode ir a 8 com 4 quartos
  const W = style === 'gable' ? (p.groundBeds >= 2 ? 7 : 6.5) : style === 'gambrel' ? (p.groundBeds >= 2 ? 7 : 6.5) : p.groundBeds >= 3 ? 8 : p.groundBeds >= 2 ? 7 : 6.5;
  const rise = 2.8;
  const run = stairRun(rise);
  // zona social: sala + cozinha ~24 m² (com escada, o mínimo é o comprimento dela)
  let yp = Math.max(4.4, round(Math.ceil((24 / W) * 2) / 2, 1));
  if (hasStair) yp = Math.max(yp, round(run + STAIR_FOOT + BOX_GAP, 2));
  // com escada, o corredor fica ao lado dela (a escada chega na parede do bloco íntimo, sem porta no caminho)
  const corridorX = hasStair ? round(W / 2 + STAIR_HALF + 0.5, 2) : undefined;
  let plan = planPrivateBlock(W, yp, rooms, { corridorX });
  // com mezanino, ele cobre o bloco íntimo: a parede da frente do bloco é a borda do mezanino e apoia as vigas
  const wantBathUp = p.bathUp;
  let md = hasStair ? plan.pd + BOX_GAP : 0;
  if (hasStair && wantBathUp) md = Math.max(md, 2.2 + 2.4);
  if (hasStair) md = Math.max(md, 3.0);
  if (hasStair && md > plan.pd + 1e-6) plan = planPrivateBlock(W, yp, rooms, { corridorX, minPd: md });
  const D = round(hasStair ? yp - BOX_GAP + md : yp + plan.pd, 2);
  const y0 = round(D - md, 2); // borda do mezanino
  // mezanino muito fundo (3+ quartos embaixo): a laje cobre só a coluna da escada e o corredor, e as vigas vencem essa largura
  // (apoiadas na parede externa e na parede do outro lado do corredor), em vez dos 7 m do comprimento
  const slabX1 = hasStair && plan.corridor && md > NARROW_MD ? plan.corridor.x1 : W;

  const params = { name: 'Meu chalé', region: a.uf, width: W, depth: D, mezzanine: style === 'gable' && hasStair, ...(style === 'gable' ? { wallHeight: 2.8, roofPitchDeg: 45 } : {}), ...(style === 'gambrel' ? { wallHeight: 2.8, lowerPitchDeg: 60, upperPitchDeg: 25, breakRatio: 0.4 } : {}), ...(style === 'shed' ? { lowHeight: 2.6, highHeight: 3.6, highSide: W <= D ? ('left' as const) : ('front' as const) } : {}), ...(style === 'flat' ? { wallHeight: 2.8 } : {}) };
  g.b = new Builder(boxKind(style), params, g.ids);
  const b = g.b;
  b.p.openings = [];
  b.p.walls = [];

  if (style === 'gable' && hasStair) {
    b.mezzanine({ depth: md, stairX: round(W / 2 - 0.4, 2) });
    const lv = b.p.levels.find((l) => l.elevation > 0)!;
    if (slabX1 < W) lv.polygon = [[0, y0], [slabX1, y0], [slabX1, D], [0, D]];
  }
  if (style === 'gambrel' && hasStair) {
    b.p.levels.push({ id: 'L1', name: 'Loft', elevation: rise, polygon: [[0, y0], [slabX1, y0], [slabX1, D], [0, D]], deck: 'osb18_wood', guardrail: true });
    b.p.stairs.push({ id: g.ids('s'), type: 'straight', from: 'L0', to: 'L1', position: [round(W / 2 - 0.4, 2), round(y0 - run, 2)], rotationDeg: 0, width: 0.8, turnRight: true });
  }

  const ext: Ext = { x0: 0, x1: W, y0: 0, y1: D };

  // --- fachada da zona social: porta, janelas
  const doorX = round(Math.max(1.1, W * 0.2), 2);
  g.openAt('ext-front', [doorX, 0], 'door', 0.9, 2.1, 0);
  const kw = hasStair ? round(W / 2 - 0.65, 2) : 3.0;
  if (p.kitchenSeparate) {
    g.openAt('ext-front', [W * 0.5, 0], 'window', 1.6, 1.2, 0.9);
  } else {
    g.openAt('ext-front', [W * 0.65, 0], 'window', 1.6, 1.2, 0.9);
  }
  g.openAt('ext-left', [0, yp * 0.5], 'window', 1.4, 1.2, 0.9);
  if (!p.kitchenSeparate) g.openAt('ext-right', [W, yp * 0.5], 'window', 1.4, 1.0, 1.1);

  // --- cozinha separada (frente à direita, de frente com o fundo no bloco íntimo)
  const livingSeed: Vec2 = [round(W * 0.3, 2), round(Math.min(1.5, yp * 0.4), 2)];
  if (p.kitchenSeparate) {
    const r: Rect = { x0: round(W - kw, 3), x1: W, y0: 0, y1: yp };
    // paredes da cozinha: a divisória com a sala e o fundo (que é a frente do bloco íntimo)
    const left = g.wall([r.x0, 0], [r.x0, yp], true);
    g.wall([r.x0, yp], [W, yp], true);
    g.doorOn(left, [r.x0, 0], [r.x0, yp * 0.55], 0.8);
    g.openAt('ext-right', [W, yp * 0.5], 'window', 1.2, 1.0, 1.1);
    b.room('kitchen', [round(W - kw / 2, 2), round(yp / 2, 2)], 'Cozinha', { floor: 'finish_floor_porcelain' });
    b.room('living', livingSeed, 'Sala');
  } else {
    b.room('kitchen', livingSeed, 'Sala e cozinha');
  }

  // --- bloco íntimo
  for (const it of plan.items) {
    const wet = it.req.use !== 'bedroom';
    const w = roomWalls(g, it.rect, { x0: 0, x1: W, y1: D }, wet);
    const cx = (it.rect.x0 + it.rect.x1) / 2;
    const cy = (it.rect.y0 + it.rect.y1) / 2;
    const dw = DOOR_W[it.req.use] ?? 0.8;
    if (plan.corridor) {
      // porta para o corredor
      const onLeft = it.rect.x1 <= plan.corridor.x0 + 1e-6;
      const wid = onLeft ? w.right : w.left;
      const cxw = onLeft ? it.rect.x1 : it.rect.x0;
      if (wid) g.doorOn(wid, [cxw, it.rect.y0], [cxw, cy], dw);
    } else if (w.top) {
      const c = hasStair ? clearOfStair(cx, dw, it.rect.x0, it.rect.x1, W) : cx;
      g.doorOn(w.top, [it.rect.x0, it.rect.y0], [c, it.rect.y0], dw);
    }
    b.room(it.req.use, [round(cx, 2), round(cy, 2)], it.req.name);
    roomWindow(g, it, ext);
  }
  if (plan.corridor) {
    const c = plan.corridor;
    const mouth = g.wall([c.x0, c.y0], [c.x1, c.y0]);
    g.doorOn(mouth, [c.x0, c.y0], [(c.x0 + c.x1) / 2, c.y0], 0.8);
    b.room('circulation', [round((c.x0 + c.x1) / 2, 2), round((c.y0 + c.y1) / 2, 2)], 'Corredor');
  }

  // --- mezanino
  if (hasStair) genLoft(g, p, { W, D, y0, rise, sx1: slabX1 });
}

// ---------------------------------------------------------------------------
// A-frame
// ---------------------------------------------------------------------------

interface WingItem {
  req: RoomReq;
  side: 'left' | 'right';
  rect: Rect;
}

function genAFrame(g: Gen, a: WizardAnswers, p: Program): void {
  const hasMezz = p.mezz !== 'none';
  // todos os cômodos íntimos, menos o banheiro 1 (fica no corpo, sob o mezanino)
  const all = privateRooms(p).slice(1);
  if (p.kitchenSeparate) all.unshift({ use: 'kitchen', name: 'Cozinha' });
  const W = p.groundBeds >= 3 ? 8 : p.groundBeds >= 2 || a.people >= 5 ? 7 : 6;
  const ridge = W === 6 ? 6 : W === 7 ? 6.5 : 7;
  const knee = 0.9;
  const rise = 2.8;
  const run = stairRun(rise);
  const yp = hasMezz ? round(run + STAIR_FOOT + STAIR_GAP, 2) : 4.6;
  const bathD = 2.4;
  let md = hasMezz ? bathD + STAIR_GAP : 0;
  if (hasMezz && p.bathUp) md = Math.max(md, 2.2 + 2.4);
  if (hasMezz) md = Math.max(md, 3.2);
  let D = round(hasMezz ? yp - STAIR_GAP + md : yp + bathD + 0.4, 2);

  // anexos: molhados à direita; quartos alternando (esquerda primeiro)
  const depthOf = (r: RoomReq) => ROOM_DEPTH[r.use] ?? 3;
  const sides: Record<'left' | 'right', RoomReq[]> = { left: [], right: [] };
  const sum = (c: RoomReq[]) => c.reduce((s, r) => s + depthOf(r), 0);
  const wantSides = a.wings === 'two' ? 2 : a.wings === 'one' ? 1 : 0;
  const wet = all.filter((r) => r.use !== 'bedroom');
  const beds = all.filter((r) => r.use === 'bedroom');
  if (all.length > 0) {
    const useBoth = wantSides === 2 || (wantSides === 0 && all.length > 3) || (wantSides === 1 && all.length > 3);
    if (wantSides === 0) g.note(`No A-frame os quartos e cômodos extras ficam nas laterais; coloquei ${useBoth ? 'os dois lados' : 'um lado'} para caber tudo.`);
    else if (wantSides === 1 && useBoth) g.note('Precisei dos dois lados do A-frame para caber todos os cômodos.');
    if (useBoth) {
      sides.right.push(...wet);
      for (const r of beds) (sum(sides.left) <= sum(sides.right) ? sides.left : sides.right).push(r);
    } else {
      sides.left.push(...wet, ...beds);
    }
    if (!useBoth && sum(sides.left) > D - 0.4 && wantSides !== 0) g.note('Os cômodos laterais ocupam toda a profundidade do A-frame.');
  }
  const need = Math.max(sum(sides.left), sum(sides.right));
  if (need > D - 0.4) {
    D = round(need + 0.4, 2);
    g.note(`Aumentei a profundidade do A-frame para ${f1(D)} m para caber os cômodos das laterais.`);
  }

  g.b = new Builder('a_frame', { name: 'Meu chalé', region: a.uf, width: W, depth: D, ridgeHeight: ridge, kneeWallHeight: knee, mezzanine: hasMezz }, g.ids);
  const b = g.b;
  b.p.openings = [];
  b.p.walls = [];
  const t = b.p.typology;
  if (t.kind !== 'a_frame') throw new Error('gerador: tipologia inesperada');
  if (hasMezz) b.mezzanine({ depth: md, elevation: rise, stairX: round(W / 2 - 0.4, 2) });
  const y0 = hasMezz ? round(D - md, 2) : D;

  // anexos
  const wingItems: WingItem[] = [];
  for (const side of ['left', 'right'] as const) {
    const col = sides[side];
    if (col.length === 0) continue;
    if (!addAnnex(b.p, side)) {
      g.note('Não coube um cômodo lateral neste A-frame.');
      continue;
    }
    const an = (b.p.typology as typeof t).annexes.find((x) => x.side === side)!;
    const len = Math.max(2, round(sum(col), 2));
    an.length = Math.min(len, D);
    an.offset = round(Math.max(0, (D - an.length) / 2), 2);
    Object.assign(an, { width: 3, height: 3, pitchDeg: 8 });
    const extra = (an.length - sum(col)) / col.length;
    let y = an.offset;
    const x0 = side === 'left' ? -an.width : W;
    const x1 = side === 'left' ? 0 : W + an.width;
    col.forEach((req, i) => {
      const y1 = i === col.length - 1 ? an.offset + an.length : y + depthOf(req) + extra;
      wingItems.push({ req, side, rect: { x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: round(y, 3), y1: round(y1, 3) } });
      y = y1;
    });
  }
  // portas e janelas do corpo
  g.openAt('ext-front', [W / 2, 0], 'door', 0.9, 2.1, 0);
  g.openAt('ext-front', [W / 2 - 1.6, 0], 'window', 1.4, 1.0, 0.9);
  g.openAt('ext-front', [W / 2 + 1.5, 0], 'sliding_door', 1.5, 2.1, 0);

  // banheiro 1 sob o mezanino, à direita da escada. Com mezanino, a parede da frente dele fica na borda do mezanino
  // e apoia as vigas (assim elas vencem o lado curto); o que sobra de profundidade vira depósito.
  const bx0 = round(W / 2 + 0.4, 2);
  const bx1 = round(bx0 + 1.8, 2);
  const bathDepth = hasMezz ? Math.min(md, 3.2) : bathD;
  const by0 = round(D - bathDepth, 2);
  const yFront = hasMezz ? y0 : by0;
  const pocket = hasMezz && md - bathDepth > 0.5;
  const bathLeft = g.wall([bx0, D], [bx0, yFront], true);
  g.wall([bx1, yFront], [bx1, D], true);
  const front = g.wall([bx0, yFront], [bx1, yFront], true);
  if (pocket) {
    g.wall([bx0, by0], [bx1, by0], true);
    g.doorOn(bathLeft, [bx0, yFront], [bx0, round((y0 + by0) / 2, 2)], 0.7);
    g.doorOn(bathLeft, [bx0, yFront], [bx0, round(D - bathDepth / 2, 2)], 0.7);
  } else {
    g.doorOn(front, [bx0, yFront], [bx0 + 0.5, yFront], 0.7);
  }
  g.openAt('ext-back', [(bx0 + bx1) / 2, D], 'window', 0.5, 0.5, 1.4);

  const livingSeed: Vec2 = [round(W * 0.3, 2), round(yp * 0.4, 2)];
  if (p.kitchenSeparate) b.room('living', livingSeed, 'Sala');
  else b.room('kitchen', livingSeed, 'Sala e cozinha');
  b.room('bathroom', [round((bx0 + bx1) / 2, 2), round(D - bathDepth / 2, 2)], p.groundBaths > 1 ? 'Banheiro 1' : 'Banheiro');
  if (pocket) b.room('storage', [round((bx0 + bx1) / 2, 2), round((y0 + by0) / 2, 2)], 'Depósito');

  // cômodos dos anexos
  const ext: Ext = { x0: -999, x1: 999, y0: 0, y1: D };
  for (const it of wingItems) {
    const sideX = it.side === 'left' ? 0 : W;
    // paredes: topo, fundo e divisória com o corpo (x = 0 ou W); a parede externa é a do anexo
    g.wall([it.rect.x0, it.rect.y0], [it.rect.x1, it.rect.y0], it.req.use !== 'bedroom');
    g.wall([it.rect.x0, it.rect.y1], [it.rect.x1, it.rect.y1], it.req.use !== 'bedroom');
    const div = g.wall([sideX, it.rect.y0], [sideX, it.rect.y1], it.req.use !== 'bedroom');
    const cy = (it.rect.y0 + it.rect.y1) / 2;
    g.doorOn(div, [sideX, it.rect.y0], [sideX, cy], DOOR_W[it.req.use] ?? 0.8);
    b.room(it.req.use, [round((it.rect.x0 + it.rect.x1) / 2, 2), round(cy, 2)], it.req.name);
    roomWindow(g, { req: it.req, rect: it.rect }, ext, [{ host: `annex-${it.side}-side`, pt: [it.side === 'left' ? it.rect.x0 : it.rect.x1, Math.min(it.rect.y0 + 0.3 + 0.75, cy)] }]);
  }
  if (hasMezz) genLoft(g, p, { W, D, y0, rise, sx1: W });
}

// ---------------------------------------------------------------------------
// Cômodo do mezanino (todas as tipologias)
// ---------------------------------------------------------------------------

/** Pé-direito médio que a norma pede para quarto e sala (com folga). */
const LOFT_CEILING = 2.52;

/**
 * Faixa [xa, xb] do mezanino em que o pé-direito médio chega ao que a norma pede para o cômodo. Sob telhado inclinado,
 * o canto junto às águas é baixo demais: o cômodo fica só na faixa com altura útil. Laje inteira: faixa centrada;
 * laje estreita (só a coluna da escada): faixa encostada na borda da escada.
 */
function loftBand(g: Gen, o: { W: number; sx1: number; y0: number; y1: number; elev: number; min: number }): { xa: number; xb: number } {
  const planes = g.b.model.roofPlanes;
  const narrow = o.sx1 < o.W - 0.1;
  const range = (w: number): [number, number] => (narrow ? [o.sx1 - w, o.sx1] : [o.W / 2 - w / 2, o.W / 2 + w / 2]);
  const avg = (w: number) => {
    const [a, c] = range(w);
    let sum = 0;
    let n = 0;
    for (let x = a + 0.125; x < c; x += 0.25)
      for (let y = o.y0 + 0.125; y < o.y1; y += 0.25) {
        sum += Math.max(0, (roofBelowAt(planes, [x, y]) ?? 99) - o.elev);
        n++;
      }
    return n ? sum / n : 0;
  };
  const full = narrow ? o.sx1 : o.W;
  for (let w = full; w >= o.min - 1e-9; w = round(w - 0.1, 2)) if (avg(w) >= LOFT_CEILING) return { xa: round(range(w)[0], 2), xb: round(range(w)[1], 2) };
  return { xa: round(range(o.min)[0], 2), xb: round(range(o.min)[1], 2) };
}

/** Mezanino: quarto (ou sala de cima) só na faixa com altura útil, com muretas dos lados, e o banheiro de fundos se pedido. */
function genLoft(g: Gen, p: Program, d: { W: number; D: number; y0: number; rise: number; sx1: number }) {
  const { b } = g;
  const { W, D, y0, rise, sx1 } = d;
  const use: RoomUse = p.mezz === 'sleep' ? 'bedroom' : 'living';
  const name = p.mezz === 'sleep' ? 'Quarto do mezanino' : 'Sala de cima';
  const L1 = 'L1';
  const narrow = sx1 < W - 0.1;
  const band = loftBand(g, { W, sx1, y0, y1: D, elev: rise, min: 2.0 });
  let { xa, xb } = band;
  const full = xa <= 0.05 && xb >= sx1 - 0.05;
  let yEnd = D;
  if (p.bathUp && xb - xa >= 1.4) {
    const bw = round(Math.min(Math.max(xb - xa, 1.8), 2.4), 2);
    const bd = 2.2;
    const x1 = narrow ? xb : round(W / 2 + bw / 2, 2);
    const x0 = round(x1 - bw, 2);
    const yb = round(D - bd, 2);
    b.wall([x0, D], [x0, yb], { level: L1, wet: true });
    const wf = b.wall([x0, yb], [x1, yb], { level: L1, wet: true });
    b.wall([x1, yb], [x1, D], { level: L1, wet: true });
    b.door(wf, 0.12, 0.7);
    b.room('bathroom', [round((x0 + x1) / 2, 2), round(D - bd / 2, 2)], 'Banheiro do mezanino', { level: L1 });
    b.window('ext-back', (x0 + x1) / 2 - 0.3, 0.6, 0.5, rise + 1.4);
    yEnd = yb;
    if (!full) {
      if (narrow) xa = x0;
      else {
        xa = x0;
        xb = x1;
      }
    }
  } else if (p.bathUp) {
    g.note('O mezanino é estreito demais para um banheiro; ele ficou só com o quarto.');
  }
  if (!full) {
    const xs = [xa > 0.05 ? xa : null, xb < sx1 - 0.05 ? xb : null].filter((x): x is number => x !== null);
    for (const x of xs) b.wall([round(x, 2), y0], [round(x, 2), yEnd], { level: L1, height: LOFT_KNEE });
    g.note(`No mezanino, o ${p.mezz === 'sleep' ? 'quarto' : 'ambiente'} ocupa só a faixa de ${f1(xb - xa)} m onde o pé-direito é bom; ao lado, junto ao telhado baixo, ficam muretas de ${f1(LOFT_KNEE)} m e dá para guardar caixas e malas.`);
  }
  b.room(use, [round((xa + xb) / 2, 2), round((y0 + yEnd) / 2, 2)], name, { level: L1 });
}

// ---------------------------------------------------------------------------
// Conformidade: janelas, ajustes às normas e revisão final
// ---------------------------------------------------------------------------

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
/** Avisos que são informação para o engenheiro (especificação), não pendência do desenho. */
const SPEC_ONLY = new Set(['norm.safety_glass', 'norm.aframe_thrust', 'steel.index']);

/**
 * Janelas pelo tamanho dos cômodos e "Ajustar às normas" (perfis, espaçamento, pé-direito). Se uma verga de janela
 * larga reprova, estreita as janelas daquela parede (até 1,0 m não há verga a verificar) e põe mais janelas em vez de uma enorme.
 */
function conformProject(g: Gen): NormFixChange[] {
  const fixes = new Map<string, NormFixChange>();
  const openings0 = clone(g.b.p.openings);
  const adjust = () => {
    const plan = planNormFixes(clone(g.b.p), g.catalog, g.ids);
    Object.assign(g.b.p, clone(plan.project));
    for (const c of plan.changes) fixes.set(c.label, c);
  };
  const daylight = () => ensureDaylight(g.b.p, g.catalog, g.ids);
  const failingHeaders = () => computeAll(g.b.p, g.catalog).structure?.checks.filter((c) => c.kind === 'header' && c.status === 'fail') ?? [];
  /** Tira a janela cuja verga reprova (as que o ajuste de janelas põe já passam; sobram as do desenho inicial). */
  const dropCulprits = () => {
    let any = false;
    for (const c of failingHeaders()) {
      const host = c.hostIds[0]!;
      const group = g.b.p.openings.filter((o) => o.host === host && o.type !== 'door' && `header:${host}|${Math.round(o.width * 100) / 100}` === c.id);
      let culprit = group.length === 1 ? group[0] : undefined;
      for (const o of group) {
        if (culprit) break;
        const without = g.b.p.openings.filter((x) => x.id !== o.id);
        const keep = g.b.p.openings;
        g.b.p.openings = without;
        if (!failingHeaders().some((x) => x.id === c.id)) culprit = o;
        g.b.p.openings = keep;
      }
      const drop = culprit ? [culprit] : group;
      g.b.p.openings = g.b.p.openings.filter((o) => !drop.includes(o));
      any = any || drop.length > 0;
    }
    return any;
  };
  const run = () => {
    let rep = daylight();
    adjust();
    for (let i = 0; i < 4 && dropCulprits(); i++) rep = daylight();
    adjust();
    return rep;
  };
  let rep = run();
  // cômodo grande com pouca fachada: janelas estreitas não bastam; montantes (e vergas em caixa) maiores deixam as janelas largas passarem
  const sys = g.b.p.system;
  if (rep.short.length > 0 && sys.structure === 'lsf' && sys.profiles.wallStud !== 'Ue140x40x0.95' && g.catalog.profiles.some((x) => x.id === 'Ue140x40x0.95')) {
    const was = sys.profiles.wallStud;
    sys.profiles.wallStud = 'Ue140x40x0.95';
    if (g.catalog.profiles.some((x) => x.id === 'U140x40x0.95')) sys.profiles.wallTrack = 'U140x40x0.95';
    g.b.p.openings = clone(openings0);
    rep = run();
    fixes.set('Montantes e vergas', { label: 'Montantes e vergas', detail: `${was} → Ue140x40x0.95 (janelas largas nos cômodos grandes)` });
  }
  // cômodo que precisa de luz e não achou lugar (o contraventamento limita as janelas): cede a janela do banheiro/lavanderia
  const nm = g.catalog.constants.norms;
  const isLight = (name: string) => g.b.p.rooms.some((r) => (r.name ?? '') === name && nm.rooms[r.use]?.light);
  const gaveUp = new Set<string>();
  for (let i = 0; i < 8 && rep.short.some(isLight); i++) {
    const m = buildModel(g.b.p, g.catalog);
    const cand = m.rooms
      .filter((x) => x.polygon && (x.use === 'bathroom' || x.use === 'laundry'))
      .flatMap((room) => room.openingIds.map((id) => ({ room, o: g.b.p.openings.find((x) => x.id === id) })))
      .filter((x): x is { room: (typeof x)['room']; o: Opening } => !!x.o && x.o.type === 'window')
      .sort((a, b) => b.o.width - a.o.width);
    const pick = cand[0];
    if (!pick) break;
    g.b.p.openings = g.b.p.openings.filter((x) => x.id !== pick.o.id);
    gaveUp.add(pick.room.name);
    rep = daylight();
  }
  if (gaveUp.size > 0) {
    adjust();
    g.note(`Para os quartos terem a luz que a norma pede sem tirar parede lisa do contraventamento, ${[...gaveUp].join(' e ')} ficou sem janela: use exaustor.`);
  }
  return [...fixes.values()];
}

/**
 * Contraventamento reprovado depois de tudo: tira a janela de um cômodo molhado (banheiro, lavanderia) que corta painel liso
 * da parede. Cômodo molhado sem janela é aceito com exaustão mecânica (a ventilação vira só informação).
 */
function relaxBracing(g: Gen) {
  const dropped: string[] = [];
  for (let i = 0; i < 6; i++) {
    const r = computeAll(g.b.p, g.catalog);
    const fail = r.structure?.checks.filter((c) => c.kind === 'bracing' && c.status === 'fail') ?? [];
    if (fail.length === 0) break;
    const hosts = new Set(fail.flatMap((c) => c.hostIds));
    const cand = r.model.rooms
      .filter((x) => x.polygon && !g.catalog.constants.norms.rooms[x.use]?.light && (x.use === 'bathroom' || x.use === 'laundry'))
      .flatMap((room) => room.openingIds.map((id) => ({ room, o: g.b.p.openings.find((x) => x.id === id) })))
      .filter((x): x is { room: (typeof x)['room']; o: Opening } => !!x.o && x.o.type === 'window' && hosts.has(x.o.host))
      .sort((a, b) => b.o.width - a.o.width);
    const pick = cand[0];
    if (!pick) break;
    g.b.p.openings = g.b.p.openings.filter((x) => x.id !== pick.o.id);
    dropped.push(pick.room.name);
  }
  if (dropped.length > 0) g.note(`Tirei a janela de ${[...new Set(dropped)].join(', ')} para sobrar parede lisa para o contraventamento: nesses cômodos use exaustor.`);
}

/** Pontos para revisar no projeto final e notas simples do que sobrou. */
function reviewProject(g: Gen, p: Project, fixes: NormFixChange[]): string[] {
  const r = computeAll(Project.parse(clone(p)), g.catalog);
  const firstSentence = (m: string) => m.split(/(?<=\.)\s/)[0]!.replace(/\.$/, '');
  const review: string[] = [
    ...(r.structure?.checks.filter((c) => c.status === 'fail').map((c) => `${c.label.replace(/\s*\(.*$/, '')}: taxa ${String(round(c.ratio, 2)).replace('.', ',')} (limite 1,00)`) ?? []),
    ...r.warnings.filter((w) => w.severity !== 'info' && !SPEC_ONLY.has(w.code)).map((w) => firstSentence(w.message)),
  ];
  const specs: string[] = [];
  if (r.warnings.some((w) => w.code === 'norm.safety_glass')) specs.push('vidro de segurança (laminado) e caixilharia da fachada envidraçada');
  if (r.warnings.some((w) => w.code === 'norm.aframe_thrust')) specs.push('amarração da base do A-frame (empuxo horizontal das águas)');
  if (fixes.length > 0) g.note(`Já ajustei ao que a norma pede: ${fixes.map((f) => `${f.label.toLowerCase()} (${f.detail})`).join('; ')}.`);
  const loft = r.model.rooms.find((x) => x.level !== 'L0' && x.polygon && r.warnings.some((w) => w.code === 'room.ceiling' && (w.refs ?? []).includes(x.id)));
  if (loft) g.note(`O ${loft.name.toLowerCase()} tem teto inclinado: fica abaixo dos 2,50 m médios que a norma pede para quarto. É comum em chalés (loft), mas o engenheiro ou a prefeitura pode exigir que conte como área de uso eventual.`);
  const talk = [...specs, ...review];
  if (talk.length > 0) g.note(`Vale conversar com o engenheiro sobre: ${talk.join('; ')}.`);
  return review;
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

export function generateProject(input: WizardAnswers, _catalog: Catalog = getCatalog()): GenerateResult {
  const a = normalizeAnswers(input);
  const first = generateOnce(a);
  // o banheiro de cima tomou a parede dos fundos e o quarto/sala do mezanino ficou sem luz natural: tenta sem ele
  const loftLight = (r: GenerateResult) => r.review.some((x) => /mezanino|Sala de cima/i.test(x));
  if (a.bathUp && loftLight(first)) {
    const second = generateOnce({ ...a, bathUp: false });
    if (second.review.length < first.review.length) {
      second.notes.push('Não coube o banheiro no mezanino com janela para o quarto: ele ficou só com o quarto, e o banheiro fica no térreo.');
      return second;
    }
  }
  return first;
}

function generateOnce(a: WizardAnswers): GenerateResult {
  const g = new Gen();
  const prog = programOf(a, g);
  if (prog.style === 'aframe') genAFrame(g, a, prog);
  else genBox(g, a, prog);
  const b = g.b;

  // acabamentos e cômodos
  applyFinishes(g, a, prog.style);

  // convenção: 'living' como sala integrada
  let integrated: string | undefined;
  if (!prog.kitchenSeparate) integrated = b.p.rooms.find((r) => r.name === 'Sala e cozinha')?.id;

  // deck e lavanderia externa
  if (a.deck !== 'none') {
    b.deck({ length: round(Math.min(b.p.typology.width, 4.5), 2), depth: 2.2, covered: a.deck === 'covered' });
  }
  if (a.laundry === 'outside') {
    const id = addExtra(b.p, 'deck', g.ids);
    patchExtra(b.p, id, { side: 'back', length: 2.5, offset: round(Math.max(0, (b.p.typology.width - 2.5) / 2), 2), depth: 1.5, covered: true, guardrail: false });
    g.note('A lavanderia ficou numa área coberta nos fundos, sem parede: leve o tanque e a máquina para lá.');
  }

  // terreno e região
  if (a.terrain === 'gentle') b.p.site = makeSlopedSite({ slopePct: 10 });
  if (a.terrain === 'steep') {
    b.p.site = makeSlopedSite({ slopePct: 30 });
    addExtra(b.p, 'retaining', g.ids);
    g.note('Terreno bem inclinado: incluí um muro de arrimo e o corte e aterro. Vale uma sondagem e um engenheiro antes de comprar.');
  } else if (a.terrain === 'gentle') g.note('Terreno com leve declive: o motor já calcula um pouco de corte e aterro.');
  b.p.meta.region = a.uf;
  if (a.mountain) {
    b.p.performance.zone = 2;
    b.p.design.windV0 = 40;
    g.note('Na serra o frio e o vento são maiores: usei a zona bioclimática 2 e vento de 40 m/s.');
  }
  if (a.structure === 'wood') setStructure(b.p, 'wood', g.catalog);
  else setStructure(b.p, 'lsf', g.catalog);
  b.p.performance.solar = a.solar;
  b.p.performance.rainwater = a.rainwater;
  b.p.installations.enabled = a.installations;
  b.p.installations.occupants = a.people;

  // torre da caixa d'água sobre o banheiro de cima
  if (prog.bathUp && b.p.rooms.some((r) => r.use === 'bathroom' && r.level === 'L1')) {
    const id = addExtra(b.p, 'water_tower', g.ids);
    g.note(`Pus a torre da caixa d'água sobre o banheiro do mezanino (caixa a ${f1((b.p.extras.find((e) => e.id === id) as { platformZ: number }).platformZ)} m): assim o chuveiro de cima tem pressão.`);
  } else if (prog.bathUp) {
    prog.bathUp = false;
  }

  // janelas pelo tamanho de cada cômodo e ajustes às normas (antes dos móveis: o pé-direito e o mezanino podem mudar)
  const fixes = conformProject(g);
  relaxBracing(g);

  // móveis
  if (a.furnish) {
    const roomIds = new Set(b.p.rooms.map((r) => r.id));
    furnishAll(g, integrated && roomIds.has(integrated) ? { integratedRoomId: integrated } : {});
  }

  // nome
  const W = b.p.typology.width;
  const D = b.p.typology.depth;
  b.p.meta.name = (a.name?.trim() || `${STYLE_NAMES[prog.style]} ${f1(W)} × ${f1(D)}`).slice(0, 120);

  // resumo das decisões
  const style = resolveStyle(a);
  if (style.why) g.notes.unshift(style.why);
  g.note(`Casa de ${f1(W)} × ${f1(D)} m, com ${a.bedrooms} ${a.bedrooms === 1 ? 'quarto' : 'quartos'} e ${a.bathrooms + (prog.bathUp ? 1 : 0)} ${a.bathrooms + (prog.bathUp ? 1 : 0) === 1 ? 'banheiro' : 'banheiros'}.`);

  const project = b.build();
  const review = reviewProject(g, project, fixes);
  return { project, notes: g.notes, review, fixes };
}
