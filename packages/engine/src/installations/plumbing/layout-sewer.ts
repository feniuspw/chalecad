import { roofBelowAt } from '../../model/rooms';
import type { Pipe } from '../../schema/project';
import type { BuildingModel, RoomModel } from '../../schema/results';
import { nearestOnContour, polygonCentroid } from '../geo';
import { LOCAL, type Ctx } from './context';
import { idMaker, mean2, toPipe, type GenPoint } from './layout-common';
import { dist2, manhattan2, slopedPath, type P2, type V3 } from './vec';

interface RoomPlan {
  roomId: string;
  level: string;
  elev: number;
  upper: boolean;
  /** Nó do esgoto do ambiente: bacia, senão caixa sifonada, senão caixa de gordura. */
  A: P2;
  toilets: GenPoint[];
  bath: GenPoint[];
  sinks: GenPoint[];
  C: P2 | null;
  G: P2 | null;
  hasToilet: boolean;
}
type Local = { specs: { prefix: string; path: V3[]; level: string }[]; maxZ: number; zC: number | null; zG: number | null };

const isToilet = (f: string) => f.startsWith('toilet');
const isSink = (f: string) => f === 'kitchen_sink';
const xyOf = (p: GenPoint): P2 => [p.pt.position[0], p.pt.position[1]];

/** Caminho em planta em L (x depois y), sem trechos nulos. */
function manh2(a: P2, b: P2): P2[] {
  const out: P2[] = [a];
  for (const p of [[b[0], a[1]], b] as P2[]) if (dist2(out[out.length - 1]!, p) > 1e-6) out.push(p);
  return out;
}
const len2 = (path: P2[]) => path.slice(1).reduce((s, p, i) => s + dist2(path[i]!, p), 0);

/**
 * Esgoto e ventilação gerados. Por ambiente: aparelhos de banho/serviço descarregam numa caixa sifonada (CS), a bacia
 * (DN 100) entra direto no nó do ambiente, a pia passa por uma caixa de gordura. Os nós do térreo formam uma cadeia
 * até a saída (contorno do radier, ou ligação do terreno); ambientes do mezanino descem por um tubo de queda.
 * Cotas de cima para baixo com a declividade mínima (2% DN ≤ 75, 1% DN 100); a saída fica na profundidade necessária.
 */
export function genSewer(
  ctx: Ctx,
  model: BuildingModel,
  rooms: RoomModel[],
  pts: GenPoint[],
  drainOf: (roomId: string) => P2 | null,
): { sewer: Pipe[]; vent: Pipe[] } {
  const k = ctx.k.sewer;
  const s2 = k.slopeMin.upTo75;
  const s1 = k.slopeMin.from100;
  const mk = idMaker();
  const sewer: Pipe[] = [];
  const vent: Pipe[] = [];
  const groundElev = Math.min(...ctx.project.levels.map((l) => l.elevation));
  const groundLevel = (ctx.project.levels.find((l) => l.elevation === groundElev) ?? ctx.project.levels[0]!).id;

  // --- planos por ambiente --------------------------------------------------------------------------------------
  const plans: RoomPlan[] = [];
  const roomOrder = new Map(rooms.map((r, i) => [r.id, i]));
  const byRoom = new Map<string, GenPoint[]>();
  for (const p of pts) if (p.spec.sewerDn !== undefined) byRoom.set(p.roomId, [...(byRoom.get(p.roomId) ?? []), p]);
  const roomIds = [...byRoom.keys()].sort((a, b) => (roomOrder.get(a) ?? 0) - (roomOrder.get(b) ?? 0));
  for (const id of roomIds) {
    const ps = byRoom.get(id)!;
    const room = rooms.find((r) => r.id === id);
    const level = ps[0]!.pt.level;
    const toilets = ps.filter((p) => isToilet(p.pt.fixture));
    const sinks = ps.filter((p) => isSink(p.pt.fixture));
    const bath = ps.filter((p) => !isToilet(p.pt.fixture) && !isSink(p.pt.fixture));
    let C: P2 | null = null;
    if (bath.length > 0) {
      C = drainOf(id) ?? mean2(bath.map(xyOf));
      const c0: P2 = C;
      if (bath.some((b) => dist2(xyOf(b), c0) < LOCAL.minPipe)) C = [c0[0] + 0.15, c0[1]];
    }
    let A: P2 | null = toilets.length > 0 ? xyOf(toilets[0]!) : C;
    const centroid: P2 = room?.polygon ? polygonCentroid(room.polygon) : sinks.length > 0 ? xyOf(sinks[0]!) : [0, 0];
    let G: P2 | null = null;
    if (sinks.length > 0) {
      const S = xyOf(sinks[0]!);
      const target = A ?? centroid;
      const d = dist2(S, target);
      const step = d < 1e-6 ? 0.6 : Math.min(0.6, d / 2);
      const u: P2 = d < 1e-6 ? [1, 0] : [(target[0] - S[0]) / d, (target[1] - S[1]) / d];
      G = [S[0] + u[0] * step, S[1] + u[1] * step];
      // ambiente só com pia: o nó do ambiente fica logo depois da caixa de gordura (que precisa ser dedicada)
      if (!A) A = [G[0] + u[0] * 0.6, G[1] + u[1] * 0.6];
    }
    if (!A) continue;
    const el = ctx.elev(level);
    plans.push({ roomId: id, level, elev: el, upper: el > groundElev + 1e-6, A, toilets, bath, sinks, C, G, hasToilet: toilets.length > 0 });
  }
  if (plans.length === 0) return { sewer, vent };

  // --- cadeia no térreo e saída -------------------------------------------------------------------------------------
  const radier = model.slabs.find((s) => s.kind === 'radier');
  const contour: P2[] = (radier?.polygon ?? model.footprint).map((p) => [p[0], p[1]] as P2);
  const nodes: { xy: P2; plans: RoomPlan[] }[] = [];
  for (const p of plans) {
    const hit = nodes.find((n) => dist2(n.xy, p.A) <= LOCAL.tol);
    if (hit) hit.plans.push(p);
    else nodes.push({ xy: p.A, plans: [p] });
  }
  const util = ctx.project.utilities.find((u) => u.kind === 'sewer');
  const center = mean2(nodes.map((n) => n.xy));
  let E: P2 = contour.length >= 3 ? (nearestOnContour(util ? [util.position[0], util.position[1]] : center, contour) as P2) : center;
  nodes.sort((a, b) => manhattan2(b.xy, E) - manhattan2(a.xy, E));
  const lastXY = nodes[nodes.length - 1]!.xy;
  if (dist2(lastXY, E) < LOCAL.exitMin) {
    const d = dist2(lastXY, E);
    const u: P2 = d < 1e-6 ? [0, -1] : [(E[0] - lastXY[0]) / d, (E[1] - lastXY[1]) / d];
    E = [lastXY[0] + u[0] * LOCAL.exitMin, lastXY[1] + u[1] * LOCAL.exitMin];
  }
  const chain: P2[] = [...nodes.map((n) => n.xy), E];
  const pathOf = (i: number) => manh2(chain[i]!, chain[i + 1]!);
  // 1% se há bacia a montante (DN 100), senão 2%
  const toiletUpTo = (i: number) => nodes.slice(0, i + 1).some((n) => n.plans.some((p) => p.hasToilet));
  const sOf = (i: number) => (toiletUpTo(i) ? s1 : s2);
  const zRel = new Array<number>(chain.length).fill(0);
  for (let i = nodes.length - 1; i >= 0; i--) zRel[i] = zRel[i + 1]! + sOf(i) * len2(pathOf(i));

  /** Trechos locais do ambiente com o nó A na cota `zA`; `maxZ` = cota da ponta mais alta. */
  const local = (p: RoomPlan, zA: number) => {
    const specs: { prefix: string; path: V3[]; level: string }[] = [];
    let maxZ = zA;
    let zCOut: number | null = null;
    let zGOut: number | null = null;
    const seg = (prefix: string, from: P2, to: P2, zTo: number, s: number) => {
      const path2 = manh2(from, to);
      const zFrom = zTo + s * len2(path2);
      specs.push({ prefix, path: slopedPath(path2, zFrom, s), level: p.level });
      maxZ = Math.max(maxZ, zFrom);
      return zFrom;
    };
    if (p.C) {
      const zC = dist2(p.C, p.A) > 1e-6 ? seg('cs', p.C, p.A, zA, s2) : zA;
      zCOut = zC;
      for (const b of p.bath) seg('ramal', xyOf(b), p.C, zC, s2);
    }
    if (p.G) {
      const zG = dist2(p.G, p.A) > 1e-6 ? seg('cg', p.G, p.A, zA, s2) : zA;
      zGOut = zG;
      for (const s of p.sinks) if (dist2(xyOf(s), p.G) > 1e-6) seg('ramal-pia', xyOf(s), p.G, zG, s2);
    }
    p.toilets.slice(1).forEach((t) => {
      if (dist2(xyOf(t), p.A) > 1e-6) seg('ramal-bacia', xyOf(t), p.A, zA, s1);
    });
    return { specs, maxZ, zC: zCOut, zG: zGOut } satisfies Local;
  };

  let rise = 0;
  nodes.forEach((n, i) => {
    for (const p of n.plans) if (!p.upper) rise = Math.max(rise, zRel[i]! + local(p, 0).maxZ);
  });
  const zExit = groundElev - k.startDepth - rise;
  const zNode = (i: number) => zExit + zRel[i]!;

  for (let i = 0; i < nodes.length; i++) {
    sewer.push(toPipe(ctx, mk(i === nodes.length - 1 ? 'esgoto-saida' : 'esgoto-coletor'), 'sewer', groundLevel, slopedPath(pathOf(i), zNode(i), sOf(i))));
  }
  nodes.forEach((n, i) => {
    for (const p of n.plans) {
      let zA = zNode(i);
      if (p.upper) {
        zA = p.elev - k.startDepth - LOCAL.upperBranchMargin;
        sewer.push(toPipe(ctx, mk('esgoto-queda'), 'sewer', p.level, [[p.A[0], p.A[1], zA], [p.A[0], p.A[1], zNode(i)]]));
      }
      for (const s of local(p, zA).specs) sewer.push(toPipe(ctx, mk(`esgoto-${s.prefix}`), 'sewer', s.level, s.path));
      // ventilação: do nó do ambiente até acima do telhado
      const room = rooms.find((r) => r.id === p.roomId);
      const topAt = (xy: P2) => {
        const roof = roofBelowAt(model.roofPlanes, xy);
        return roof !== null ? roof + k.ventTerminalAboveRoof : p.elev + (room?.ceiling.max ?? 2.5) + LOCAL.ventFallbackRise;
      };
      const top = topAt(p.A);
      vent.push(toPipe(ctx, mk('ventilacao'), 'vent', p.level, [[p.A[0], p.A[1], zA], [p.A[0], p.A[1], Math.max(top, zA + 0.5)]]));
      // caixa sifonada além da distância máxima do ventilador (DN 50): coluna de ventilação própria
      const loc = local(p, zA);
      if (p.C && loc.zC !== null && len2(manh2(p.C, p.A)) > (k.ventMaxDistance['50'] ?? 1.2) + 1e-6) {
        vent.push(toPipe(ctx, mk('ventilacao'), 'vent', p.level, [[p.C[0], p.C[1], loc.zC], [p.C[0], p.C[1], Math.max(topAt(p.C), loc.zC + 0.5)]]));
      }
      // caixa de gordura (saída DN 75) longe do ventilador do ambiente: idem (cozinha na frente, banheiro nos fundos)
      if (p.G && loc.zG !== null && len2(manh2(p.G, p.A)) > (k.ventMaxDistance['75'] ?? 1.8) + 1e-6) {
        vent.push(toPipe(ctx, mk('ventilacao'), 'vent', p.level, [[p.G[0], p.G[1], loc.zG], [p.G[0], p.G[1], Math.max(topAt(p.G), loc.zG + 0.5)]]));
      }
    }
  });
  return { sewer, vent };
}
