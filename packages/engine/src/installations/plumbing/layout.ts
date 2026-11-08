import type { WaterPoint } from '../../schema/project';
import type { PlumbingLayout } from '../../schema/results';
import type { PlacedPoints } from '../points';
import { sizeTank } from '../tank';
import { type Ctx } from './context';
import type { GenPoint } from './layout-common';
import { genSewer } from './layout-sewer';
import { genWater } from './layout-water';
import { dist2, type P2 } from './vec';
import { nearestEdge, roomEdges } from '../geo';
import { pointInPolygon } from '../../geometry';

export interface EffectiveLayout {
  layout: PlumbingLayout;
  /** `true` se veio de `plumbing.manual`. */
  manual: boolean;
  /** Cômodo da caixa (apoio do aviso de peso). */
  tankRoomId: string | null;
}

/** Pontos de água dos móveis: chuveiro elétrico, ou misturador com água quente encanada (gás ou solar). */
export function generatePoints(ctx: Ctx, placed: PlacedPoints): GenPoint[] {
  const out: GenPoint[] = [];
  const hotLine = ctx.project.installations.waterHeater !== 'electric_shower';
  for (const f of ctx.model.furniture) {
    let key = ctx.k.water.fixtureByFurniture[f.item];
    if (!key) continue;
    if (key === 'shower_electric' && hotLine) key = 'shower_mixer';
    const spec = ctx.k.water.fixtures[key];
    if (!spec || !f.roomId) continue;
    const wp = placed.points.find((p) => p.kind === 'water_cold' && p.furnitureId === f.id);
    const [a, , c] = f.polygon as [P2, P2, P2, P2];
    const position: P2 = wp ? [wp.position[0], wp.position[1]] : [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
    const pt: WaterPoint = { id: `auto-pt-${f.id}`.slice(0, 64), fixture: key, level: f.level, position, furnitureId: f.id, label: spec.label };
    out.push({ pt, roomId: f.roomId, spec, z: ctx.elev(f.level) + spec.waterH });
  }
  separate(ctx, placed, out);
  return out;
}

/** Distância mínima entre pontos de aparelhos do mesmo cômodo (m): nichos de pia, tanque e máquina caem no mesmo trecho de parede. */
const MIN_POINT_GAP = 0.3;

/**
 * Pontos que caem no mesmo lugar (nicho da cozinha ou da lavanderia) ganham posições separadas ao longo da parede,
 * senão os ramais de esgoto dos aparelhos se fundem num nó só e a caixa de gordura da pia não existe.
 */
function separate(ctx: Ctx, placed: PlacedPoints, pts: GenPoint[]): void {
  const byRoom = new Map<string, GenPoint[]>();
  for (const p of pts) byRoom.set(p.roomId, [...(byRoom.get(p.roomId) ?? []), p]);
  for (const [roomId, group] of byRoom) {
    const room = placed.rooms.find((r) => r.id === roomId);
    const edges = room ? roomEdges(room, ctx.model) : [];
    const done: GenPoint[] = [];
    for (const p of group) {
      const at = (): P2 => [p.pt.position[0], p.pt.position[1]];
      const clash = () => done.some((q) => dist2(at(), q.pt.position) < MIN_POINT_GAP - 1e-9);
      if (clash()) {
        const ne = nearestEdge(edges, at());
        const dir: P2 = ne ? [ne.edge.dir[0], ne.edge.dir[1]] : [1, 0];
        const base = at();
        for (let k = 1; k <= 8 && clash(); k++) {
          const sign = k % 2 === 1 ? 1 : -1;
          const cand: P2 = [base[0] + sign * dir[0] * MIN_POINT_GAP * Math.ceil(k / 2), base[1] + sign * dir[1] * MIN_POINT_GAP * Math.ceil(k / 2)];
          if (room?.polygon && !pointInPolygon(cand, room.polygon, 0.1)) continue;
          if (!done.some((q) => dist2(cand, q.pt.position) < MIN_POINT_GAP - 1e-9)) p.pt.position = cand;
        }
      }
      done.push(p);
    }
  }
}

/**
 * Traçado efetivo: o salvo em `installations.plumbing` quando `manual`; senão o gerado (pontos dos móveis, caixa sobre
 * a torre ou no forro, água fria e quente, esgoto e ventilação). `null` se não há caixa nem como gerar.
 */
export function effectiveLayout(ctx: Ctx, placed: PlacedPoints): EffectiveLayout | null {
  const pl = ctx.project.installations.plumbing;
  const pt = placed.tank;
  const sized = pt ?? null;
  const liters = (): number => pl.tank?.liters ?? sized?.liters ?? sizeTank(ctx.project, ctx.catalog.constants.installations).liters;
  if (pl.manual) {
    const tank: PlumbingLayout['tank'] | null = pl.tank
      ? { level: pl.tank.level, position: pl.tank.position, bottomZ: pl.tank.bottomZ, liters: liters(), towerId: sized?.towerId ?? null }
      : pt
        ? generatedTank(ctx, placed)
        : null;
    if (!tank) return null;
    return { layout: { tank, points: pl.points, pipes: pl.pipes }, manual: true, tankRoomId: pt?.roomId ?? null };
  }
  if (!pt) return null;
  const tank = generatedTank(ctx, placed);
  if (pl.tank) {
    // posição e cota informadas pelo usuário valem mesmo sem `manual`
    tank.level = pl.tank.level;
    tank.position = pl.tank.position;
    tank.bottomZ = pl.tank.bottomZ;
    if (pl.tank.liters !== undefined) tank.liters = pl.tank.liters;
  }
  const pts = generatePoints(ctx, placed);
  const rooms = placed.rooms;
  const water = genWater(ctx, tank, pts, pt.roomId);
  const drainOf = (roomId: string): P2 | null => {
    const d = placed.points.find((p) => p.kind === 'drain' && p.roomId === roomId);
    return d ? [d.position[0], d.position[1]] : null;
  };
  const { sewer, vent } = genSewer(ctx, ctx.model, rooms, pts, drainOf);
  return {
    layout: { tank, points: pts.map((p) => p.pt), pipes: [...water, ...sewer, ...vent] },
    manual: false,
    tankRoomId: pt.roomId,
  };
}

/** Caixa sobre a torre (fundo na `platformZ`) ou no forro do banheiro (fundo `atticTankRise` acima do forro). */
function generatedTank(ctx: Ctx, placed: PlacedPoints): PlumbingLayout['tank'] {
  const t = placed.tank!;
  const base = ctx.elev(t.point.level) + t.point.height;
  return {
    level: t.point.level,
    position: [t.point.position[0], t.point.position[1]],
    bottomZ: base + (t.towerId ? 0 : ctx.k.water.atticTankRise),
    liters: t.liters,
    towerId: t.towerId ?? null,
  };
}
