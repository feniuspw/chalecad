import type { Pipe } from '../../schema/project';
import type { PlumbingLayout } from '../../schema/results';
import { LOCAL, type Ctx } from './context';
import { idMaker, mean2, toPipe, type GenPoint } from './layout-common';
import { cleanPath, type P2, type V3 } from './vec';

/**
 * Água fria e quente geradas: barrilete sob a caixa até a coluna do ambiente de referência (o da caixa), coluna
 * por ambiente molhado até o registro (1,20 m do piso) e sub-ramais em trechos ortogonais até cada ponto.
 * Água quente (gás ou solar): raiz no registro do ambiente de referência (o aquecedor), mesmo desenho.
 */
export function genWater(ctx: Ctx, tank: PlumbingLayout['tank'], pts: GenPoint[], refRoomId: string | null): Pipe[] {
  const mk = idMaker();
  const groups = new Map<string, GenPoint[]>();
  for (const p of pts) groups.set(p.roomId, [...(groups.get(p.roomId) ?? []), p]);
  if (groups.size === 0) return [];
  const order = [...groups.keys()];
  const ref = refRoomId && groups.has(refRoomId) ? refRoomId : order[0]!;
  order.sort((a, b) => (a === ref ? -1 : b === ref ? 1 : 0));

  const anchor = new Map<string, P2>();
  const level = new Map<string, string>();
  for (const [r, ps] of groups) {
    anchor.set(r, mean2(ps.map((p) => [p.pt.position[0], p.pt.position[1]] as P2)));
    level.set(r, ps[0]!.pt.level);
  }
  const zReg = (r: string) => ctx.elev(level.get(r)!) + LOCAL.registerHeight;
  const out: Pipe[] = [];
  const add = (prefix: string, system: Pipe['system'], lvl: string, path: V3[]) => {
    const p = cleanPath(path);
    if (p.length >= 2) out.push(toPipe(ctx, mk(prefix), system, lvl, p));
  };

  const a0 = anchor.get(ref)!;
  const zBar = tank.bottomZ - LOCAL.barreleDrop;
  const [tx, ty] = tank.position;
  add('cold-barrilete', 'cold', tank.level, [
    [tx, ty, tank.bottomZ],
    [tx, ty, zBar],
    [a0[0], ty, zBar],
    [a0[0], a0[1], zBar],
  ]);

  const branches = (system: 'cold' | 'hot', r: string, filter: (p: GenPoint) => boolean) => {
    const [ax, ay] = anchor.get(r)!;
    const z0 = zReg(r);
    for (const p of groups.get(r)!) {
      if (!filter(p)) continue;
      const [px, py] = p.pt.position;
      add(`${system}-sub`, system, p.pt.level, [
        [ax, ay, z0],
        [px, ay, z0],
        [px, py, z0],
        [px, py, p.z],
      ]);
    }
  };

  for (const r of order) {
    const [ax, ay] = anchor.get(r)!;
    add('cold-coluna', 'cold', level.get(r)!, [
      [a0[0], a0[1], zBar],
      [ax, a0[1], zBar],
      [ax, ay, zBar],
      [ax, ay, zReg(r)],
    ]);
    branches('cold', r, () => true);
  }

  const heater = ctx.project.installations.waterHeater;
  if (heater !== 'electric_shower') {
    const zRef = zReg(ref);
    for (const r of order) {
      const hotPts = groups.get(r)!.filter((p) => p.spec.wHot > 0);
      if (hotPts.length === 0) continue;
      if (r !== ref) {
        const [ax, ay] = anchor.get(r)!;
        add('hot-coluna', 'hot', level.get(r)!, [
          [a0[0], a0[1], zRef],
          [ax, a0[1], zRef],
          [ax, ay, zRef],
          [ax, ay, zReg(r)],
        ]);
      }
      branches('hot', r, (p) => p.spec.wHot > 0);
    }
  }
  return out;
}
