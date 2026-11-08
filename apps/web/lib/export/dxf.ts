/**
 * Exportação DXF (AutoCAD/LibreCAD/QCAD) em texto ASCII, formato R12 (AC1009), sem dependências.
 * Unidades: metros (`$INSUNITS = 6`), mesmas coordenadas do motor (x, y em planta; nas fachadas, x horizontal e y = cota z).
 * Acentos saem como `\U+XXXX` (escape padrão do DXF), então o arquivo é ASCII puro e abre igual em qualquer página de código.
 */
import { getCatalog } from '@chalecad/catalog';
import type { BuildingModel, HostWall, Project, ResolvedOpening, ResolvedStair, Vec2 } from '@chalecad/engine';
import { fmt } from '../project/format';
import { specOf } from '../project/furniture';
import { furnitureSymbol, placeStrokes } from '../plan2d/furnitureSymbols';
import { roomLabel, roomLabelPoint } from '../plan2d/rooms';
import { deriveLevels, type PlanLevel } from '../plan2d/plan';
import { ELEVATION_LABELS, type ElevationSide } from '../plan2d/elevation';

/** Camadas: nome, cor ACI e tipo de linha. */
export const DXF_LAYERS = [
  { name: '0', color: 7, ltype: 'CONTINUOUS' },
  { name: 'PAREDES', color: 7, ltype: 'CONTINUOUS' },
  { name: 'PAREDES-INT', color: 8, ltype: 'CONTINUOUS' },
  { name: 'ABERTURAS', color: 4, ltype: 'CONTINUOUS' },
  { name: 'ESCADA', color: 6, ltype: 'CONTINUOUS' },
  { name: 'COMODOS', color: 3, ltype: 'CONTINUOUS' },
  { name: 'MOVEIS', color: 9, ltype: 'CONTINUOUS' },
  { name: 'COTAS', color: 2, ltype: 'CONTINUOUS' },
  { name: 'FACHADA', color: 7, ltype: 'CONTINUOUS' },
  { name: 'TELHADO', color: 1, ltype: 'CONTINUOUS' },
  { name: 'EIXOS', color: 8, ltype: 'DASHED' },
  { name: 'TEXTO', color: 7, ltype: 'CONTINUOUS' },
] as const;
export type DxfLayer = (typeof DXF_LAYERS)[number]['name'];

export const DXF_STAMP_NOTICE = 'Estimativa — não substitui projeto com ART';

/** Caracteres do Windows-1252 fora do Latin-1 (0x80–0x9F), pelo ponto de código Unicode. */
const CP1252_EXTRA: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88,
  0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93,
  0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

const cp1252Byte = (c: number): number | null =>
  (c >= 32 && c < 127) || (c >= 0xa0 && c <= 0xff) ? c : (CP1252_EXTRA[c] ?? null);

/**
 * Texto seguro para DXF R12 (`$DWGCODEPAGE` ANSI_1252): mantém acentos e símbolos do Windows-1252
 * (o arquivo é gravado nessa codificação por `dxfBytes`); o resto vira `?`.
 */
export function dxfText(s: string): string {
  let out = '';
  for (const ch of s.replace(/[\r\n]+/g, ' ')) out += cp1252Byte(ch.codePointAt(0)!) === null ? '?' : ch;
  return out;
}

/** Codifica o DXF em Windows-1252, como declara o cabeçalho (o leitor de R12 não entende UTF-8). */
export function dxfBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  let i = 0;
  for (const ch of text) out[i++] = cp1252Byte(ch.codePointAt(0)!) ?? (ch === '\n' ? 10 : 63);
  return out.subarray(0, i);
}

const num = (n: number) => {
  const r = Math.round(n * 10000) / 10000;
  return String(Object.is(r, -0) ? 0 : r);
};

/** Escritor mínimo: acumula pares código/valor de entidades. */
export class DxfWriter {
  private ents: string[] = [];
  readonly usedLayers = new Set<string>();
  private minX = Infinity;
  private minY = Infinity;
  private maxX = -Infinity;
  private maxY = -Infinity;

  private pair(code: number, value: string | number) {
    this.ents.push(`${code}\n${typeof value === 'number' ? num(value) : value}`);
  }
  private begin(type: string, layer: DxfLayer) {
    this.usedLayers.add(layer);
    this.pair(0, type);
    this.pair(8, layer);
  }
  private ext(x: number, y: number) {
    this.minX = Math.min(this.minX, x);
    this.minY = Math.min(this.minY, y);
    this.maxX = Math.max(this.maxX, x);
    this.maxY = Math.max(this.maxY, y);
  }
  private pt(i: number, p: Vec2) {
    this.pair(10 + i, p[0]);
    this.pair(20 + i, p[1]);
    this.pair(30 + i, 0);
    this.ext(p[0], p[1]);
  }

  line(layer: DxfLayer, a: Vec2, b: Vec2) {
    this.begin('LINE', layer);
    this.pt(0, a);
    this.pt(1, b);
  }
  /** POLYLINE R12 com VERTEX/SEQEND. */
  poly(layer: DxfLayer, pts: Vec2[], closed: boolean) {
    if (pts.length < 2) return;
    this.begin('POLYLINE', layer);
    this.pair(66, 1);
    this.pair(10, 0);
    this.pair(20, 0);
    this.pair(30, 0);
    this.pair(70, closed ? 1 : 0);
    for (const p of pts) {
      this.begin('VERTEX', layer);
      this.pt(0, p);
    }
    this.begin('SEQEND', layer);
  }
  circle(layer: DxfLayer, c: Vec2, r: number) {
    this.begin('CIRCLE', layer);
    this.pt(0, c);
    this.pair(40, r);
  }
  /** Arco anti-horário de `a0` a `a1` (graus). */
  arc(layer: DxfLayer, c: Vec2, r: number, a0: number, a1: number) {
    this.begin('ARC', layer);
    this.pt(0, c);
    this.pair(40, r);
    this.pair(50, ((a0 % 360) + 360) % 360);
    this.pair(51, ((a1 % 360) + 360) % 360);
  }
  /** Texto; `center` centraliza horizontalmente em `at`. */
  text(layer: DxfLayer, at: Vec2, height: number, value: string, center = false, rotation = 0) {
    this.begin('TEXT', layer);
    this.pt(0, at);
    this.pair(40, height);
    this.pair(1, dxfText(value));
    if (rotation) this.pair(50, rotation);
    if (center) {
      this.pair(72, 1);
      this.pt(1, at);
      this.pair(73, 0);
    }
  }

  toString(): string {
    const out: string[] = [];
    const p = (code: number, value: string | number) => out.push(`${code}\n${typeof value === 'number' ? num(value) : value}`);
    const has = Number.isFinite(this.minX);
    p(0, 'SECTION');
    p(2, 'HEADER');
    p(9, '$ACADVER');
    p(1, 'AC1009');
    p(9, '$INSUNITS');
    p(70, 6);
    p(9, '$DWGCODEPAGE');
    p(3, 'ANSI_1252');
    p(9, '$LTSCALE');
    p(40, 1);
    if (has) {
      p(9, '$EXTMIN');
      p(10, this.minX);
      p(20, this.minY);
      p(30, 0);
      p(9, '$EXTMAX');
      p(10, this.maxX);
      p(20, this.maxY);
      p(30, 0);
    }
    p(0, 'ENDSEC');
    p(0, 'SECTION');
    p(2, 'TABLES');
    p(0, 'TABLE');
    p(2, 'LTYPE');
    p(70, 2);
    p(0, 'LTYPE');
    p(2, 'CONTINUOUS');
    p(70, 0);
    p(3, 'Solid line');
    p(72, 65);
    p(73, 0);
    p(40, 0);
    p(0, 'LTYPE');
    p(2, 'DASHED');
    p(70, 0);
    p(3, 'Dashed');
    p(72, 65);
    p(73, 2);
    p(40, 0.75);
    p(49, 0.5);
    p(49, -0.25);
    p(0, 'ENDTAB');
    p(0, 'TABLE');
    p(2, 'LAYER');
    p(70, DXF_LAYERS.length);
    for (const l of DXF_LAYERS) {
      p(0, 'LAYER');
      p(2, l.name);
      p(70, 0);
      p(62, l.color);
      p(6, l.ltype);
    }
    p(0, 'ENDTAB');
    p(0, 'ENDSEC');
    p(0, 'SECTION');
    p(2, 'BLOCKS');
    p(0, 'ENDSEC');
    p(0, 'SECTION');
    p(2, 'ENTITIES');
    const body = out.join('\n') + '\n' + this.ents.join('\n') + '\n';
    return body + '0\nENDSEC\n0\nEOF\n';
  }
}

// ---------------------------------------------------------------------------
// Geometria
// ---------------------------------------------------------------------------

const CUT_HEIGHT = 1.2;
const GAP = 3;
const TEXT_H = 0.15;

const maxV = (w: HostWall) => w.outline.reduce((m, p) => Math.max(m, p[1]), 0);

function frame(w: HostWall) {
  const L = w.length || 1;
  const d: Vec2 = [(w.to[0] - w.from[0]) / L, (w.to[1] - w.from[1]) / L];
  const n: Vec2 = [-d[1], d[0]];
  const at = (u: number, s: number): Vec2 => [w.from[0] + d[0] * u + n[0] * s, w.from[1] + d[1] * u + n[1] * s];
  return { d, n, at };
}

function wallCorners(w: HostWall): Vec2[] {
  const { at } = frame(w);
  const h = w.thickness / 2;
  return [at(-h, -h), at(w.length + h, -h), at(w.length + h, h), at(-h, h)];
}

type Shift = (p: Vec2) => Vec2;

/** Trechos [a, b] de [lo, hi] que sobram depois de remover os vãos. */
function subtractSpans(lo: number, hi: number, spans: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  let cur = lo;
  for (const [a, b] of [...spans].sort((x, y) => x[0] - y[0])) {
    if (a > cur + 1e-6) out.push([cur, Math.min(a, hi)]);
    cur = Math.max(cur, b);
  }
  if (hi > cur + 1e-6) out.push([cur, hi]);
  return out;
}

function planWalls(model: BuildingModel, level: PlanLevel) {
  const own = model.walls.filter((w) => w.level === level.id);
  const through = model.walls.filter(
    (w) => w.level !== level.id && w.kind !== 'interior' && w.baseZ <= level.elevation + 1e-6 && w.baseZ + maxV(w) > level.elevation + CUT_HEIGHT,
  );
  return [...own, ...through];
}

function drawOpening(dxf: DxfWriter, o: ResolvedOpening, w: HostWall, sh: Shift) {
  const { d, at } = frame(w);
  const h = w.thickness / 2;
  const width = o.u1 - o.u0;
  const ln = (u0: number, s0: number, u1: number, s1: number) => dxf.line('ABERTURAS', sh(at(u0, s0)), sh(at(u1, s1)));
  for (const u of [o.u0, o.u1]) ln(u, -h, u, h);
  if (o.type === 'window') {
    for (const s of [-h, 0, h]) ln(o.u0, s, o.u1, s);
  } else if (o.type === 'door') {
    const sIn = w.exteriorSide === 'left' ? -1 : 1;
    ln(o.u0, 0, o.u0, sIn * width);
    const a = (Math.atan2(d[1], d[0]) * 180) / Math.PI;
    const c = sh(at(o.u0, 0));
    if (sIn === 1) dxf.arc('ABERTURAS', c, width, a, a + 90);
    else dxf.arc('ABERTURAS', c, width, a - 90, a);
  } else if (o.type === 'sliding_door') {
    ln(o.u0, -h / 2, o.u0 + width * 0.55, -h / 2);
    ln(o.u0 + width * 0.45, h / 2, o.u1, h / 2);
  } else {
    ln(o.u0, 0, o.u1, 0);
  }
}

function drawStair(dxf: DxfWriter, st: ResolvedStair, sh: Shift, ground: boolean) {
  for (const t of st.treads) {
    const r = (t.rotationZDeg * Math.PI) / 180;
    const [hx, hy] = [t.size[0] / 2, t.size[1] / 2];
    const pts = ([[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]] as Vec2[]).map(([x, y]): Vec2 =>
      sh([t.center[0] + x * Math.cos(r) - y * Math.sin(r), t.center[1] + x * Math.sin(r) + y * Math.cos(r)]),
    );
    dxf.poly('ESCADA', pts, true);
  }
  if (st.footprint.length > 2) dxf.poly('ESCADA', st.footprint.map(sh), true);
  const first = st.treads[0];
  const last = st.treads[st.treads.length - 1];
  if (first && last && st.treads.length > 1) {
    const a: Vec2 = ground ? [first.center[0], first.center[1]] : [last.center[0], last.center[1]];
    const b: Vec2 = ground ? [last.center[0], last.center[1]] : [first.center[0], first.center[1]];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const u: Vec2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    const nx: Vec2 = [-u[1], u[0]];
    const hd = 0.2;
    dxf.circle('ESCADA', sh(a), 0.05);
    dxf.line('ESCADA', sh(a), sh(b));
    dxf.line('ESCADA', sh(b), sh([b[0] - u[0] * hd + nx[0] * hd * 0.4, b[1] - u[1] * hd + nx[1] * hd * 0.4]));
    dxf.line('ESCADA', sh(b), sh([b[0] - u[0] * hd - nx[0] * hd * 0.4, b[1] - u[1] * hd - nx[1] * hd * 0.4]));
    dxf.text('ESCADA', sh([(a[0] + b[0]) / 2 + nx[0] * 0.2, (a[1] + b[1]) / 2 + nx[1] * 0.2]), 0.12, ground ? 'SOBE' : 'DESCE', true);
  }
}

function dimension(dxf: DxfWriter, a: Vec2, b: Vec2, off: Vec2, label: string, rotation: number) {
  const pa: Vec2 = [a[0] + off[0], a[1] + off[1]];
  const pb: Vec2 = [b[0] + off[0], b[1] + off[1]];
  dxf.line('COTAS', a, pa);
  dxf.line('COTAS', b, pb);
  dxf.line('COTAS', pa, pb);
  const t = 0.08;
  const u: Vec2 = [(pb[0] - pa[0]) / (Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) || 1), (pb[1] - pa[1]) / (Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) || 1)];
  for (const p of [pa, pb]) dxf.line('COTAS', [p[0] - (u[0] + u[1]) * t, p[1] - (u[1] - u[0]) * t], [p[0] + (u[0] + u[1]) * t, p[1] + (u[1] - u[0]) * t]);
  const mid: Vec2 = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
  const side: Vec2 = rotation === 0 ? [0, Math.sign(off[1]) * 0.1] : [Math.sign(off[0]) * 0.1, 0];
  dxf.text('COTAS', [mid[0] + side[0], mid[1] + side[1]], 0.2, label, true, rotation);
}

interface Block {
  width: number;
  minY: number;
  maxY: number;
}

function drawPlan(dxf: DxfWriter, model: BuildingModel, project: Project, level: PlanLevel, isGround: boolean, ox: number): Block {
  const cut = planWalls(model, level);
  const pts: Vec2[] = cut.flatMap(wallCorners);
  if (pts.length === 0) pts.push(...model.footprint);
  if (pts.length === 0) pts.push([0, 0]);
  const minX = Math.min(...pts.map((p) => p[0]));
  const maxX = Math.max(...pts.map((p) => p[0]));
  const minY = Math.min(...pts.map((p) => p[1]));
  const maxY = Math.max(...pts.map((p) => p[1]));
  const sh: Shift = (p) => [p[0] - minX + ox, p[1]];

  // Paredes: duas faces, cortadas pelos vãos.
  const byId = new Map(cut.map((w) => [w.id, w]));
  const openings = model.openings.filter((o) => o.hostKind === 'wall' && o.valid && byId.has(o.hostId));
  for (const w of cut) {
    const { at } = frame(w);
    const h = w.thickness / 2;
    const layer: DxfLayer = w.kind === 'interior' ? 'PAREDES-INT' : 'PAREDES';
    const spans = openings.filter((o) => o.hostId === w.id).map((o): [number, number] => [o.u0, o.u1]);
    for (const s of [-h, h]) for (const [a, b] of subtractSpans(-h, w.length + h, spans)) dxf.line(layer, sh(at(a, s)), sh(at(b, s)));
    dxf.line('EIXOS', sh(at(0, 0)), sh(at(w.length, 0)));
  }
  for (const o of openings) drawOpening(dxf, o, byId.get(o.hostId)!, sh);

  for (const st of model.stairs) drawStair(dxf, st, sh, isGround);

  // Cômodos.
  for (const r of (model.rooms ?? []).filter((x) => x.level === level.id && x.polygon && x.polygon.length >= 3)) {
    const { point } = roomLabelPoint(r.polygon!);
    dxf.text('COMODOS', sh(point), TEXT_H, roomLabel(r), true);
  }

  // Móveis.
  const catalog = getCatalog();
  for (const f of project.furniture.filter((x) => x.level === level.id)) {
    const spec = specOf(catalog, f.item);
    if (!spec) continue;
    for (const st of placeStrokes(furnitureSymbol(spec.model, spec.size), f.position as [number, number], f.rotation)) {
      const p = st.pts.map(sh);
      if (p.length === 2 && !st.closed) dxf.line('MOVEIS', p[0]!, p[1]!);
      else dxf.poly('MOVEIS', p, st.closed);
    }
  }

  // Cotas totais (uma horizontal e uma vertical) e título.
  const wTotal = maxX - minX;
  dimension(dxf, sh([minX, minY]), sh([maxX, minY]), [0, -0.8], `${fmt(wTotal, 2)}`, 0);
  dimension(dxf, sh([minX, minY]), sh([minX, maxY]), [-0.8, 0], `${fmt(maxY - minY, 2)}`, 90);
  dxf.text('TEXTO', sh([minX, maxY + 0.8]), 0.3, `PLANTA — ${level.name.toUpperCase()}`);
  dxf.text('TEXTO', sh([minX, maxY + 0.5]), 0.12, `Cota ${level.elevation >= 0 ? '+' : ''}${fmt(level.elevation, 2)} m`);
  return { width: wTotal, minY: minY - 1.2, maxY: maxY + 1.2 };
}

const axes: Record<ElevationSide, { h: (x: number, y: number) => number; depth: (x: number, y: number) => number }> = {
  front: { h: (x) => x, depth: (_x, y) => y },
  back: { h: (x) => -x, depth: (_x, y) => -y },
  right: { h: (_x, y) => y, depth: (x) => -x },
  left: { h: (_x, y) => -y, depth: (x) => x },
};

function drawElevation(dxf: DxfWriter, model: BuildingModel, side: ElevationSide, ox: number, baseY: number): number {
  const { h, depth } = axes[side];
  const exterior = model.walls.filter((w) => w.kind !== 'interior');
  const facing = exterior.filter((w) => Math.abs(depth(w.from[0], w.from[1]) - depth(w.to[0], w.to[1])) < 1e-6);
  const minDepth = Math.min(...facing.map((w) => depth(w.from[0], w.from[1])), Infinity);
  const wallPts = (w: HostWall): Vec2[] => {
    const { d } = frame(w);
    return w.outline.map(([u, v]): Vec2 => [h(w.from[0] + d[0] * u, w.from[1] + d[1] * u), w.baseZ + v]);
  };
  const roofPts = model.roofPlanes.map((r) => r.vertices.map((v): Vec2 => [h(v[0], v[1]), v[2]]));
  const xs = [...facing.flatMap((w) => wallPts(w).map((p) => p[0])), ...roofPts.flat().map((p) => p[0])];
  if (xs.length === 0) return 0;
  const minH = Math.min(...xs);
  const maxH = Math.max(...xs);
  const sh: Shift = (p) => [p[0] - minH + ox, baseY + p[1]];

  dxf.line('FACHADA', sh([minH - 0.5, 0]), sh([maxH + 0.5, 0]));
  const openingsByWall = new Map<string, ResolvedOpening[]>();
  for (const o of model.openings) if (o.hostKind === 'wall' && o.valid) openingsByWall.set(o.hostId, [...(openingsByWall.get(o.hostId) ?? []), o]);
  for (const w of facing) {
    const near = Math.abs(depth(w.from[0], w.from[1]) - minDepth) < 0.05;
    if (!near) continue; // paredes ao fundo ficam atrás da fachada: não entram no desenho
    dxf.poly('FACHADA', wallPts(w).map(sh), true);
    const { d } = frame(w);
    for (const o of openingsByWall.get(w.id) ?? []) {
      const a = h(w.from[0] + d[0] * o.u0, w.from[1] + d[1] * o.u0);
      const b = h(w.from[0] + d[0] * o.u1, w.from[1] + d[1] * o.u1);
      const [x0, x1] = a < b ? [a, b] : [b, a];
      const z0 = w.baseZ + o.v0;
      const z1 = w.baseZ + o.v1;
      dxf.poly('ABERTURAS', [sh([x0, z0]), sh([x1, z0]), sh([x1, z1]), sh([x0, z1])], true);
      if (o.type === 'window') dxf.line('ABERTURAS', sh([(x0 + x1) / 2, z0]), sh([(x0 + x1) / 2, z1]));
    }
  }
  for (const r of roofPts) dxf.poly('TELHADO', r.map(sh), true);
  const topZ = Math.max(model.bbox.max[2], ...roofPts.flat().map((p) => p[1]));
  dxf.text('TEXTO', sh([minH, -0.9]), 0.25, ELEVATION_LABELS[side].toUpperCase());
  dimension(dxf, sh([maxH + 0.5, 0]), sh([maxH + 0.5, topZ]), [0.8, 0], fmt(topZ, 2), 90);
  return maxH - minH + 1.5;
}

export interface DxfOptions {
  /** Data do carimbo (AAAA-MM-DD); omitido = hoje. */
  date?: string;
  /** Níveis do projeto; omitido = deduzidos de `project`/`model`. */
  levels?: PlanLevel[];
}

/** Gera o DXF (texto) com a planta de cada nível, as quatro fachadas e o carimbo. */
export function exportDxf(project: Project, model: BuildingModel, opts: DxfOptions = {}): string {
  const dxf = new DxfWriter();
  const levels = opts.levels ?? deriveLevels(model, project);
  const list = levels.length > 0 ? levels : [{ id: model.walls[0]?.level ?? 'L0', name: 'Térreo', elevation: 0 }];

  let ox = 0;
  let minY = Infinity;
  list.forEach((lv, i) => {
    const b = drawPlan(dxf, model, project, lv, i === 0, ox);
    ox += b.width + GAP + 1.6; // largura + 3 m (+ folga das cotas laterais)
    minY = Math.min(minY, b.minY);
  });
  const plansRight = ox - GAP;

  // Fachadas abaixo das plantas.
  const topZ = Math.max(model.bbox.max[2], ...model.roofPlanes.flatMap((r) => r.vertices.map((v) => v[2])), 3);
  const baseY = (Number.isFinite(minY) ? minY : 0) - 3 - topZ;
  let ex = 0;
  for (const side of ['front', 'back', 'left', 'right'] as const) ex += drawElevation(dxf, model, side, ex, baseY) + GAP;

  // Carimbo no canto inferior esquerdo.
  const sy = baseY - 4.5;
  const sw = Math.max(9, Math.min(plansRight, 12));
  const sx = 0;
  dxf.poly('TEXTO', [[sx, sy], [sx + sw, sy], [sx + sw, sy + 3.5], [sx, sy + 3.5]], true);
  dxf.line('TEXTO', [sx, sy + 2.2], [sx + sw, sy + 2.2]);
  dxf.text('TEXTO', [sx + 0.3, sy + 2.7], 0.3, project.meta.name);
  dxf.text('TEXTO', [sx + 0.3, sy + 1.7], 0.18, `Data: ${opts.date ?? new Date().toISOString().slice(0, 10)}`);
  dxf.text('TEXTO', [sx + 0.3, sy + 1.2], 0.18, `Area construida: ${fmt(model.builtArea, 2)} m²`);
  dxf.text('TEXTO', [sx + 0.3, sy + 0.5], 0.15, DXF_STAMP_NOTICE);
  return dxf.toString();
}

/** Nome de arquivo seguro a partir do nome do projeto. */
export function dxfFileName(name: string): string {
  const slug = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  return `${slug || 'projeto'}.dxf`;
}
