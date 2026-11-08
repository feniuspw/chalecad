/**
 * Janelas pelo tamanho do cômodo: depois da planta pronta, cada cômodo que a norma pede luz e ventilação ganha
 * vidro suficiente (área/6) e área que abre suficiente (área/12), com folga. Usa o próprio motor para saber onde
 * a abertura é válida, e acrescenta mais janelas (nunca uma enorme: vergas grandes reprovam).
 */
import { buildModel, computeAll, roomVentilation, type BuildingModel, type Opening, type Project, type RoomModel, type Vec2 } from '@chalecad/engine';
import type { Catalog } from '@chalecad/catalog';
import { generatedHosts } from '../edit';
import { round } from '../geometry';
import type { IdGen } from '../ids';

/** Folga sobre o mínimo da norma. */
export const DAYLIGHT_MARGIN = 1.12;
const CORNER = 0.6;
const CORNER_MIN = 0.3;
const GAP = 0.15;
const MAX_WIDTH = 1.5;
/** ID provisório das tentativas (o ID de verdade só sai quando a janela fica). */
const TRY = '__tentativa';


/** Vidro e área que abre (m²) de um cômodo, no modelo atual. */
export function roomLight(room: RoomModel, model: BuildingModel, catalog: Catalog): { glazing: number; open: number } {
  return { glazing: room.glazing, open: roomVentilation(room, model, catalog) };
}

type WindowShape = { w: number; h: number; sill: number; type?: 'window' | 'sliding_door' };

function shapesFor(use: RoomModel['use'], baseZ: number): WindowShape[] {
  const small = use === 'bathroom' || use === 'laundry';
  if (small) return [{ w: 1.0, h: 0.6, sill: baseZ + 1.5 }, { w: 0.6, h: 0.6, sill: baseZ + 1.5 }];
  if (use === 'kitchen') return [{ w: 1.5, h: 2.1, sill: 0, type: 'sliding_door' as const }, { w: 1.5, h: 1.0, sill: baseZ + 1.1 }, { w: 1.2, h: 1.0, sill: baseZ + 1.1 }, { w: 1.0, h: 0.8, sill: baseZ + 1.1 }];
  return [
    ...(use === 'living' && baseZ === 0 ? [{ w: 1.5, h: 2.1, sill: 0, type: 'sliding_door' as const }] : []),
    { w: 1.5, h: 1.5, sill: baseZ + 0.7 },
    { w: 1.4, h: 1.5, sill: baseZ + 0.7 },
    { w: 1.5, h: 1.2, sill: baseZ + 0.9 },
    { w: 1.3, h: 1.5, sill: baseZ + 0.7 },
    { w: 1.2, h: 1.5, sill: baseZ + 0.7 },
    { w: 1.2, h: 1.2, sill: baseZ + 0.9 },
    { w: 1.0, h: 1.5, sill: baseZ + 0.7 },
    { w: 1.0, h: 1.0, sill: baseZ + 0.9 },
    { w: 0.8, h: 0.8, sill: baseZ + 1.1 },
  ];
}

interface Slot {
  host: string;
  /** Intervalo livre em u (ao longo do hospedeiro) onde cabe abertura. */
  a: number;
  b: number;
  /** Quanto o hospedeiro é "fachada principal" (menor = antes). */
  rank: number;
}

/** Intervalos livres das arestas externas do cômodo, descontando as aberturas já postas. */
function slotsOf(project: Project, model: BuildingModel, room: RoomModel, corner: number): Slot[] {
  const out: Slot[] = [];
  for (const e of room.edges) {
    if (!e.hostId) continue;
    const w = model.walls.find((x) => x.id === e.hostId);
    if (!w || w.kind === 'interior' || w.kind === 'parapet') continue;
    const dx = (w.to[0] - w.from[0]) / w.length;
    const dy = (w.to[1] - w.from[1]) / w.length;
    const uOf = (p: Vec2) => (p[0] - w.from[0]) * dx + (p[1] - w.from[1]) * dy;
    let a = Math.min(uOf(e.from), uOf(e.to)) + corner;
    let b = Math.max(uOf(e.from), uOf(e.to)) - corner;
    // pontas do hospedeiro: a quina já é a da parede
    a = Math.max(a, 0.2);
    b = Math.min(b, w.length - 0.2);
    if (b - a < 0.5) continue;
    const taken = project.openings.filter((o) => o.host === w.id).sort((p, q) => p.offset - q.offset);
    let cur = a;
    for (const o of taken) {
      if (o.offset - GAP > cur && Math.min(o.offset - GAP, b) - cur >= 0.5) out.push({ host: w.id, a: cur, b: Math.min(o.offset - GAP, b), rank: w.id === 'ext-front' ? 0 : 1 });
      cur = Math.max(cur, o.offset + o.width + GAP);
    }
    if (b - cur >= 0.5) out.push({ host: w.id, a: cur, b, rank: w.id === 'ext-front' ? 0 : 1 });
  }
  return out;
}

/** Razão de contraventamento por direção (painéis sem abertura ≥ 1,2 m sobre o comprimento das fachadas), como o motor mede. */
export function bracingRatios(model: BuildingModel): [number, number] {
  const out: [number, number] = [1, 1];
  for (const axis of [0, 1] as const) {
    const ws = model.walls.filter((w) => w.kind !== 'interior' && w.kind !== 'parapet' && (Math.abs(w.to[0] - w.from[0]) >= Math.abs(w.to[1] - w.from[1]) ? 0 : 1) === axis);
    const total = ws.reduce((a, w) => a + w.length, 0);
    if (total <= 0) continue;
    let braced = 0;
    for (const w of ws) {
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
      braced += panels.filter((q) => q >= 1.2 - 1e-9).reduce((a, q) => a + q, 0);
    }
    out[axis] = braced / total;
  }
  return out;
}

type Verdict = 'ok' | 'invalid' | 'brace' | 'header';

/** A abertura (já posta em `p.openings`) é válida para o motor e não derruba o contraventamento nem a verga da parede? */
function acceptOpening(p: Project, o: Opening, catalog: Catalog, before: [number, number]): Verdict {
  const minBrace = catalog.constants.bracingMinRatio * 1.05;
  try {
    const m = buildModel(p, catalog);
    if (!(m.openings.find((x) => x.id === o.id)?.valid ?? false)) return 'invalid';
    const after = bracingRatios(m);
    if (([0, 1] as const).some((i) => after[i] < before[i] - 1e-9 && after[i] < minBrace)) return 'brace';
    if (o.width > 1.0 + 1e-9) {
      // a verga do vão (mesma parede e largura) precisa passar; vergas de outros vãos não são culpa deste
      const key = `header:${o.host}|${Math.round(o.width * 100) / 100}`;
      const bad = computeAll(p, catalog).structure?.checks.some((c) => c.kind === 'header' && c.status === 'fail' && c.id === key);
      if (bad) return 'header';
    }
    return 'ok';
  } catch {
    return 'invalid';
  }
}

function validOpening(p: Project, o: Opening, catalog: Catalog, before: [number, number]): Verdict {
  p.openings.push(o);
  const v = acceptOpening(p, o, catalog, before);
  if (v !== 'ok') p.openings.pop();
  return v;
}

/** Janela do cômodo mais alta (1,5 m, peitoril 0,7 m): mais vidro sem mais parede cortada. Devolve se alguma cresceu. */
function growOne(p: Project, room: RoomModel, model: BuildingModel, catalog: Catalog): boolean {
  if (room.use === 'bathroom' || room.use === 'laundry') return false;
  const baseZ = p.levels.find((l) => l.id === room.level)?.elevation ?? 0;
  const before = bracingRatios(model);
  for (const id of room.openingIds) {
    const i = p.openings.findIndex((x) => x.id === id);
    const o = p.openings[i];
    if (!o || o.type !== 'window' || o.height >= 1.5 - 1e-9) continue;
    p.openings[i] = { ...o, height: 1.5, sill: round(Math.min(o.sill, baseZ + 0.7), 2) };
    if (acceptOpening(p, p.openings[i]!, catalog, before) === 'ok') return true;
    p.openings[i] = o;
  }
  return false;
}

/** Janela numa parede: tenta formas do maior vidro ao menor, em poucas posições (e varre o trecho se o vão não cabe no contorno da parede). */
function placeWall(p: Project, catalog: Catalog, ids: IdGen, slot: Slot, shapes: WindowShape[], maxW: number): boolean {
  const before = bracingRatios(buildModel(p, catalog));
  /** Altura e peitoril que o motor recusou em todas as posições tentadas (não adianta tentar a mesma altura mais estreita). */
  const dead = new Set<string>();
  for (const s of shapes) {
    if (s.type === 'sliding_door' && (slot.host !== 'ext-front' || p.openings.some((o) => o.type === 'sliding_door'))) continue;
    const hs = `${s.type ?? 'window'}|${s.h}|${round(s.sill, 2)}`;
    if (dead.has(hs)) continue;
    const w = Math.min(s.w, maxW);
    if (slot.b - slot.a < w - 1e-6) continue;
    const mid = (slot.a + slot.b - w) / 2;
    // trecho largo: encosta numa ponta (sobra painel liso para o contraventamento e cabe outra janela ao lado)
    const quick: number[] = slot.b - slot.a >= 2 * w + GAP - 1e-6 ? [slot.a, slot.b - w, mid] : [mid, slot.a, slot.b - w];
    // se o vão não cabe no contorno da parede (empena), varre algumas posições a partir do meio
    const sweep: number[] = [];
    for (let d = 0.5; d <= (slot.b - slot.a - w) / 2 + 1e-6 && sweep.length < 4; d += 0.5) sweep.push(mid - d, mid + d);
    const seen = new Set<number>();
    let onlyInvalid = true;
    for (const off of [...quick, ...sweep]) {
      const offset = round(Math.min(Math.max(off, slot.a), slot.b - w), 2);
      if (seen.has(offset)) continue;
      seen.add(offset);
      const v = validOpening(p, { id: TRY, host: slot.host, type: s.type ?? 'window', offset, width: w, height: s.h, sill: round(s.sill, 2) }, catalog, before);
      if (v === 'ok') {
        p.openings[p.openings.length - 1]!.id = ids('o');
        return true;
      }
      if (v !== 'invalid') {
        onlyInvalid = false;
        // contraventamento e verga dependem pouco da posição: vai para outra forma
        if (seen.size >= 3) break;
      }
    }
    if (onlyInvalid) dead.add(hs);
  }
  return false;
}

/** Claraboia numa água sobre o cômodo (cômodo de cima). Devolve se pôs. */
function placeSkylight(p: Project, model: BuildingModel, room: RoomModel, catalog: Catalog, ids: IdGen): boolean {
  const poly = room.polygon;
  if (!poly) return false;
  const roofs = generatedHosts(p).roofs;
  const xs = poly.map((v) => v[0]);
  const ys = poly.map((v) => v[1]);
  const pts: Vec2[] = [];
  for (let x = Math.min(...xs) + 0.4; x <= Math.max(...xs) - 0.4 + 1e-6; x += 0.2)
    for (let y = Math.min(...ys) + 0.8; y <= Math.max(...ys) - 0.8 + 1e-6; y += 0.9) pts.push([round(x, 2), round(y, 2)]);
  // do meio para fora
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  pts.sort((a, b) => Math.abs(a[0] - cx) - Math.abs(b[0] - cx));
  const W = 0.9;
  const H = 1.2;
  let tries = 0;
  for (const pt of pts) {
    for (const pl of model.roofPlanes) {
      if (!roofs.has(pl.id)) continue;
      // resolve (u, v) tal que origem + u·uAxis + v·vAxis = pt em planta
      const [ux, uy] = [pl.uAxis[0], pl.uAxis[1]];
      const [vx, vy] = [pl.vAxis[0], pl.vAxis[1]];
      const det = ux * vy - uy * vx;
      if (Math.abs(det) < 1e-6) continue;
      const rx = pt[0] - pl.origin[0];
      const ry = pt[1] - pl.origin[1];
      const u = (rx * vy - ry * vx) / det;
      const v = (ux * ry - uy * rx) / det;
      if (u - W / 2 < 0.3 || u + W / 2 > pl.uLength - 0.3 || v - H / 2 < 0.2 || v + H / 2 > pl.vLength - 0.2 || v - H / 2 > 5) continue;
      const o: Opening = { id: TRY, host: pl.id, type: 'skylight', offset: round(u - W / 2, 2), width: W, height: H, sill: round(v - H / 2, 2) };
      if (p.openings.some((x) => x.host === pl.id && x.offset < o.offset + W + 0.2 && o.offset < x.offset + x.width + 0.2 && x.sill < o.sill + H + 0.2 && o.sill < x.sill + x.height + 0.2)) continue;
      if (++tries > 14) return false;
      const before = room.glazing;
      p.openings.push(o);
      let gain = 0;
      try {
        const m = buildModel(p, catalog);
        const r = m.rooms.find((x) => x.id === room.id);
        gain = (r?.glazing ?? 0) - before;
      } catch {
        gain = 0;
      }
      if (gain > 0.1) {
        o.id = ids('o');
        return true;
      }
      p.openings.pop();
    }
  }
  return false;
}

export interface DaylightReport {
  /** Cômodos que não chegaram ao mínimo mesmo depois de tudo. */
  short: string[];
}

/**
 * Acrescenta janelas até cada cômodo passar na iluminação e na ventilação. Muda `p` no lugar.
 * `maxWidth` limita a largura por hospedeiro (as paredes que sustentam o telhado pedem vergas menores).
 */
export function ensureDaylight(p: Project, catalog: Catalog, ids: IdGen, maxWidth: (host: string) => number = () => MAX_WIDTH): DaylightReport {
  const nm = catalog.constants.norms;
  /** Cômodos em que nada mais coube: não insiste nas passadas seguintes. */
  const stuck = new Set<string>();
  for (let pass = 0; pass < 8; pass++) {
    const model = buildModel(p, catalog);
    let progressed = false;
    // salas e cozinha primeiro (mais área, mais janelas), depois o resto
    const rooms = [...model.rooms].filter((r) => r.polygon && !stuck.has(r.id)).sort((a, b) => b.area - a.area);
    for (const room of rooms) {
      const rule = nm.rooms[room.use];
      if (!rule || (!rule.light && !rule.vent)) continue;
      const needGlass = rule.light ? room.area * nm.lightRatio * DAYLIGHT_MARGIN : 0;
      const needOpen = rule.vent ? room.area * nm.ventRatio * DAYLIGHT_MARGIN : 0;
      let cur = buildModel(p, catalog);
      for (let n = 0; n < 8; n++) {
        const r = cur.rooms.find((x) => x.id === room.id);
        if (!r?.polygon) break;
        const { glazing, open } = roomLight(r, cur, catalog);
        if (glazing >= needGlass && open >= needOpen) break;
        const baseZ = p.levels.find((l) => l.id === r.level)?.elevation ?? 0;
        if (glazing < needGlass && growOne(p, r, cur, catalog)) {
          progressed = true;
          cur = buildModel(p, catalog);
          continue;
        }
        const shapes = shapesFor(r.use, baseZ);
        let placed = false;
        for (const corner of [CORNER, CORNER_MIN]) {
          const slots = slotsOf(p, cur, r, corner).sort((a, b) => a.rank - b.rank || b.b - b.a - (a.b - a.a));
          for (const s of slots) {
            if ((placed = placeWall(p, catalog, ids, s, shapes, maxWidth(s.host)))) break;
          }
          if (placed) break;
        }
        if (!placed && (baseZ > 0 || r.ceiling.max >= 3.2)) placed = placeSkylight(p, cur, r, catalog, ids);
        if (!placed) {
          stuck.add(room.id);
          break;
        }
        progressed = true;
        cur = buildModel(p, catalog);
      }
    }
    if (!progressed) break;
  }
  const model = buildModel(p, catalog);
  const short: string[] = [];
  for (const r of model.rooms) {
    const rule = nm.rooms[r.use];
    if (!r.polygon || !rule) continue;
    const { glazing, open } = roomLight(r, model, catalog);
    if ((rule.light && glazing < r.area * nm.lightRatio) || (rule.vent && open < r.area * nm.ventRatio)) short.push(r.name);
  }
  return { short };
}

