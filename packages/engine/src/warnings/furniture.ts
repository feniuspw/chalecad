import type { Catalog, FurnitureSpec } from '@chalecad/catalog';
import { distToSegment, pointInPolygon, polygonArea, type Vec2 } from '../geometry';
import { convexOverlapArea, orientedRect, penetration, wallRect } from '../model/furniture';
import { roofBelowAt } from '../model/rooms';
import type { Project } from '../schema/project';
import type { BuildingModel, EngineWarning, FurnitureModel } from '../schema/results';

const EPS = 1e-9;
/** Tolerância do contorno do nível (m). */
const OUTSIDE_TOL = 0.02;
/** Penetração mínima (m) para contar como parede ou colisão. */
const TOUCH_TOL = 0.01;
/** Invasão mínima (m²) da faixa de uso. */
const CLEARANCE_AREA = 0.02;
/** Invasão mínima (m²) da zona de porta ou chegada da escada. */
const ZONE_AREA = 0.01;
/** Cômodo apertado: área livre abaixo desta fração. */
const TIGHT_FRACTION = 0.4;
const SLIDING_STRIP = 0.6;
const STAIR_ARRIVAL = 0.8;

const fmt = (n: number, d = 2) => n.toFixed(d).replace('.', ',');

export interface FurnitureWarningContext {
  project: Project;
  model: BuildingModel;
  catalog: Catalog;
}

/**
 * Alertas de layout dos móveis (`project.furniture`): encaixe, paredes, colisão, folga de uso, portas, escada, pé-direito,
 * ponto de água e cômodo apertado. Todos com `refs: [furniture.id]` (ou o cômodo, em `furniture.circulation`).
 *
 * Circulação: versão simples (área livre do cômodo < 40%), sem busca de caminho de 0,80 m.
 */
export function furnitureWarnings({ project, model, catalog }: FurnitureWarningContext): EngineWarning[] {
  const out: EngineWarning[] = [];
  const specOf = new Map<string, FurnitureSpec>(catalog.furniture.map((s) => [s.id, s]));

  for (const f of project.furniture) {
    if (!specOf.has(f.item)) {
      out.push({
        code: 'furniture.unknown',
        severity: 'info',
        message: `Móvel "${f.id}": o item "${f.item}" não existe no catálogo e foi ignorado. Troque por um item do catálogo.`,
        refs: [f.id],
      });
    }
  }
  if (model.furniture.length === 0) return out;

  const nameOf = (f: FurnitureModel) => specOf.get(f.item)?.name ?? f.item;
  const elevOf = (levelId: string) => project.levels.find((l) => l.id === levelId)?.elevation ?? 0;
  const walls = model.walls.map((w) => ({ w, rect: wallRect(w) }));
  const extThickness = Math.max(0, ...model.walls.filter((w) => w.exteriorSide).map((w) => w.thickness));

  // --- fora do contorno ---------------------------------------------------------------
  const extWalls = model.walls.filter((w) => w.exteriorSide);
  const onExterior = (a: Vec2, b: Vec2) =>
    extWalls.some((w) => distToSegment(a, w.from, w.to) <= 0.05 && distToSegment(b, w.from, w.to) <= 0.05);
  /** Ponto cabe no nível: dentro do contorno e a meia espessura (ou a espessura, no contorno externo) das paredes externas. */
  const fits = (p: Vec2, levelId: string): boolean => {
    const level = project.levels.find((l) => l.id === levelId);
    if (level?.polygon && level.elevation > 0) {
      const poly = level.polygon.map((q): Vec2 => [q[0], q[1]]);
      if (!pointInPolygon(p, poly, OUTSIDE_TOL)) return false;
      return poly.every((a, i) => {
        const b = poly[(i + 1) % poly.length]!;
        return !onExterior(a, b) || distToSegment(p, a, b) >= extThickness / 2 - OUTSIDE_TOL;
      });
    }
    // térreo: `footprint` é a face externa (eixo + meia espessura); a face interna fica a uma espessura para dentro
    const poly = model.footprint;
    if (!pointInPolygon(p, poly, OUTSIDE_TOL)) return false;
    return poly.every((a, i) => distToSegment(p, a, poly[(i + 1) % poly.length]!) >= extThickness - OUTSIDE_TOL);
  };
  const midpoints = (poly: Vec2[]): Vec2[] => poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length]!;
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Vec2;
  });
  for (const f of model.furniture) {
    if ([...f.polygon, ...midpoints(f.polygon)].some((p) => !fits(p, f.level))) {
      out.push({
        code: 'furniture.outside',
        severity: 'warn',
        message: `${nameOf(f)} sai do contorno do chalé. Mova o móvel para dentro, junto à face interna das paredes.`,
        refs: [f.id],
      });
    }
  }

  // --- parede ----------------------------------------------------------------------------
  for (const f of model.furniture) {
    const hit = walls.find(({ w, rect }) => w.level === f.level && penetration(f.polygon, rect) > TOUCH_TOL);
    if (hit) {
      out.push({
        code: 'furniture.wall',
        severity: 'warn',
        message: `${nameOf(f)} atravessa a parede "${hit.w.id}". Afaste o móvel até a face da parede.`,
        refs: [f.id],
      });
    }
  }

  // --- colisão -----------------------------------------------------------------------------
  const solid = model.furniture.filter((f) => specOf.get(f.item)?.collides);
  for (let i = 0; i < solid.length; i++) {
    for (let j = i + 1; j < solid.length; j++) {
      const a = solid[i]!;
      const b = solid[j]!;
      if (a.level !== b.level) continue;
      if (penetration(a.polygon, b.polygon) > TOUCH_TOL) {
        out.push({
          code: 'furniture.collision',
          severity: 'warn',
          message: `${nameOf(a)} e ${nameOf(b)} se sobrepõem. Afaste um dos móveis.`,
          refs: [a.id, b.id],
        });
      }
    }
  }

  // --- faixa de uso -------------------------------------------------------------------------
  for (const f of model.furniture) {
    if (!f.clearance) continue;
    const spec = specOf.get(f.item)!;
    const cl = spec.clearance;
    const blockers: Vec2[][] = [
      ...solid.filter((o) => o.id !== f.id && o.level === f.level).map((o) => o.polygon),
      ...walls.filter(({ w }) => w.level === f.level).map(({ rect }) => rect),
    ];
    const invaded = blockers.reduce((s, r) => s + convexOverlapArea(f.clearance!, r), 0);
    if (invaded > CLEARANCE_AREA) {
      const where = cl.back > 0 || cl.sides > 0 ? 'ao redor de' : 'na frente de';
      out.push({
        code: 'furniture.clearance',
        severity: 'info',
        message: `Pouco espaço ${where} ${nameOf(f)}: deixe ${fmt(cl.front)} m livres.`,
        refs: [f.id],
      });
    }
  }

  // --- porta ---------------------------------------------------------------------------------
  const zones: { id: string; level: string; rect: Vec2[] }[] = [];
  for (const o of model.openings) {
    if (!o.valid || o.hostKind !== 'wall' || (o.type !== 'door' && o.type !== 'sliding_door')) continue;
    const w = model.walls.find((x) => x.id === o.hostId);
    if (!w) continue;
    const dx = (w.to[0] - w.from[0]) / (w.length || 1);
    const dy = (w.to[1] - w.from[1]) / (w.length || 1);
    const width = o.u1 - o.u0;
    const depth = o.type === 'sliding_door' ? SLIDING_STRIP : width;
    const c = (o.u0 + o.u1) / 2;
    const center: Vec2 = [w.from[0] + dx * c, w.from[1] + dy * c];
    // largura do vão ao longo da parede (x local), `2 × depth` atravessando a parede (y local)
    zones.push({
      id: o.id,
      level: w.level,
      rect: orientedRect(center, width, 2 * depth, (Math.atan2(dy, dx) * 180) / Math.PI),
    });
  }
  for (const f of model.furniture) {
    const z = zones.find((x) => x.level === f.level && convexOverlapArea(f.polygon, x.rect) > ZONE_AREA);
    if (z) {
      out.push({
        code: 'furniture.door',
        severity: 'warn',
        message: `${nameOf(f)} invade o espaço da porta "${z.id}". Afaste o móvel para a folha abrir e a passagem ficar livre.`,
        refs: [f.id],
      });
    }
  }

  // --- escada (projeção dos degraus e chegada de 0,80 m ao pé) -----------------------------------
  const stairZones: { id: string; level: string; rects: Vec2[][] }[] = [];
  for (const st of model.stairs) {
    const def = project.stairs.find((s) => s.id === st.id);
    if (!def) continue;
    const rects = st.treads.map((t) => orientedRect([t.center[0], t.center[1]], t.size[0], t.size[1], t.rotationZDeg));
    const first = st.treads[0];
    if (first) {
      const th = (first.rotationZDeg * Math.PI) / 180;
      const fwd: Vec2 = [-Math.sin(th), Math.cos(th)];
      const k = first.size[1] / 2 + STAIR_ARRIVAL / 2;
      rects.push(
        orientedRect([first.center[0] - fwd[0] * k, first.center[1] - fwd[1] * k], first.size[0], STAIR_ARRIVAL, first.rotationZDeg),
      );
    }
    stairZones.push({ id: st.id, level: def.from, rects });
  }
  for (const f of model.furniture) {
    const z = stairZones.find((x) => x.level === f.level && x.rects.some((r) => convexOverlapArea(f.polygon, r) > ZONE_AREA));
    if (z) {
      out.push({
        code: 'furniture.stair',
        severity: 'warn',
        message: `${nameOf(f)} ocupa a escada "${z.id}" ou a chegada dela (0,80 m ao pé). Afaste o móvel.`,
        refs: [f.id],
      });
    }
  }

  // --- pé-direito sobre o móvel ----------------------------------------------------------------
  for (const f of model.furniture) {
    const elev = elevOf(f.level);
    const cx = f.polygon.reduce((s, p) => s + p[0], 0) / f.polygon.length;
    const cy = f.polygon.reduce((s, p) => s + p[1], 0) / f.polygon.length;
    let minClear = Infinity;
    for (const p of [...f.polygon, [cx, cy] as Vec2]) {
      let top = roofBelowAt(model.roofPlanes, p) ?? Infinity;
      for (const s of model.slabs) {
        const bottom = s.topZ - s.thickness;
        if (s.kind === 'mezzanine' && bottom >= elev + 0.05 && pointInPolygon(p, s.polygon, 0)) top = Math.min(top, bottom);
      }
      minClear = Math.min(minClear, top - elev);
    }
    if (Number.isFinite(minClear) && minClear < f.height - EPS) {
      out.push({
        code: 'furniture.headroom',
        severity: 'warn',
        message: `${nameOf(f)} (${fmt(f.height)} m) passa da altura livre de ${fmt(minClear)} m: faltam ${fmt(f.height - minClear)} m. Afaste-o da parte baixa do teto ou troque por um móvel mais baixo.`,
        refs: [f.id],
      });
    }
  }

  // --- ponto de água -----------------------------------------------------------------------------
  for (const f of model.furniture) {
    if (!specOf.get(f.item)?.water) continue;
    const room = f.roomId ? model.rooms.find((r) => r.id === f.roomId) : undefined;
    if (!room || !room.wet) {
      out.push({
        code: 'furniture.water',
        severity: 'info',
        message: `${nameOf(f)}: precisa de ponto de água e esgoto, e este local não é cômodo molhado. Mova para banheiro, cozinha ou lavanderia, ou prever a instalação.`,
        refs: [f.id],
      });
    }
  }

  // --- circulação (versão simples: área livre do cômodo) -----------------------------------------
  for (const r of model.rooms) {
    if (!r.polygon || r.area <= 0) continue;
    const inside = model.furniture.filter((f) => f.roomId === r.id && specOf.get(f.item)?.collides);
    if (inside.length === 0) continue;
    const taken = inside.reduce((s, f) => s + polygonArea(f.polygon), 0);
    const free = Math.max(0, r.area - taken);
    if (free < r.area * TIGHT_FRACTION - EPS) {
      out.push({
        code: 'furniture.circulation',
        severity: 'info',
        message: `Cômodo apertado: ${r.name} fica com ${fmt(free, 1)} m² livres de ${fmt(r.area, 1)} m² (${fmt((free / r.area) * 100, 0)}%). Tire móveis ou use um cômodo maior para sobrar passagem de ${fmt(catalog.constants.norms.circulationMin)} m.`,
        refs: [r.id, ...inside.map((f) => f.id)],
      });
    }
  }

  return out;
}
