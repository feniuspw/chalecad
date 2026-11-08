import { LOCAL, type Ctx, type FixtureSpec } from './context';
import { buildGraph, nodeAt, nodesAtXY, rootTree, type AbsPipe, type RawGraph, type Tree } from './graph';
import type { PlumbingLayout } from '../../schema/results';
import { solveWater, type WaterCalc, type WaterTerminal } from './water';
import type { V3 } from './vec';

export interface WaterNet {
  system: 'cold' | 'hot';
  pipes: AbsPipe[];
  graph: RawGraph;
  tree: Tree;
  calc: WaterCalc;
}

export interface WaterNetworks {
  cold: WaterNet | null;
  hot: WaterNet | null;
  /** Pontos que precisam de água e não chegam à raiz, por sistema. */
  disconnected: { pointId: string; fixture: string; system: 'cold' | 'hot' }[];
  /** Pressão (m.c.a.) na entrada do aquecedor, se há rede quente ligada a uma rede fria. */
  heaterInletHead: number | null;
}

/** Tubos do sistema com as cotas em absoluto (z do tubo é relativa ao piso do nível). */
export function absPipes(ctx: Ctx, layout: PlumbingLayout, systems: AbsPipe['system'][]): AbsPipe[] {
  return layout.pipes
    .filter((p) => (systems as string[]).includes(p.system))
    .map((p) => {
      const e = ctx.elev(p.level);
      return {
        id: p.id,
        system: p.system,
        level: p.level,
        path: p.path.map((v): V3 => [v[0], v[1], v[2] + e]),
        dn: p.dn,
        slope: p.slope,
      };
    });
}

export function terminalsFor(ctx: Ctx, layout: PlumbingLayout, graph: RawGraph, tree: Tree, hot: boolean): { reached: WaterTerminal[]; lost: { pointId: string; fixture: string }[] } {
  const reached: WaterTerminal[] = [];
  const lost: { pointId: string; fixture: string }[] = [];
  for (const p of layout.points) {
    const spec: FixtureSpec | undefined = ctx.k.water.fixtures[p.fixture];
    if (!spec) continue;
    if ((hot ? spec.wHot : spec.w) <= 0) continue;
    const z = ctx.elev(p.level) + spec.waterH;
    const node = nodeAt(graph, [p.position[0], p.position[1], z]);
    if (node < 0 || !tree.reached.has(node)) lost.push({ pointId: p.id, fixture: p.fixture });
    else reached.push({ pointId: p.id, fixture: p.fixture, spec, z, level: p.level, node });
  }
  return { reached, lost };
}

/**
 * Redes de água fria e quente do traçado. Fria: raiz no nó sob a caixa (planta); a carga na raiz é o desnível entre o
 * fundo da caixa e o nó. Quente: raiz no nó coincidente com a rede fria (aquecedor), carga = a da fria menos a perda
 * interna do aquecedor; sem coincidência, usa o fundo da caixa.
 */
export function computeWaterNetworks(ctx: Ctx, layout: PlumbingLayout): WaterNetworks {
  const disconnected: WaterNetworks['disconnected'] = [];
  let cold: WaterNet | null = null;
  let hot: WaterNet | null = null;
  let heaterInletHead: number | null = null;

  const coldPipes = absPipes(ctx, layout, ['cold']);
  const bottomZ = layout.tank.bottomZ;
  if (coldPipes.length > 0) {
    const graph = buildGraph(coldPipes);
    const cand = nodesAtXY(graph, layout.tank.position);
    const root = cand[0];
    if (root) {
      const tree = rootTree(graph, coldPipes, root.id);
      const t = terminalsFor(ctx, layout, graph, tree, false);
      const calc = solveWater({
        system: 'cold',
        ctx,
        pipes: coldPipes,
        tree,
        terminals: t.reached,
        rootHead: bottomZ - root.pos[2],
        rootZ: root.pos[2],
        gateDepth: 2,
        entranceAtRoot: true,
      });
      cold = { system: 'cold', pipes: coldPipes, graph, tree, calc };
      t.lost.forEach((l) => disconnected.push({ ...l, system: 'cold' }));
    }
  }
  if (!cold) {
    for (const p of layout.points) {
      const spec = ctx.k.water.fixtures[p.fixture];
      if (spec && spec.w > 0) disconnected.push({ pointId: p.id, fixture: p.fixture, system: 'cold' });
    }
  }

  const hotPipes = absPipes(ctx, layout, ['hot']);
  if (hotPipes.length > 0) {
    const graph = buildGraph(hotPipes);
    // raiz: nó quente que coincide com um nó frio (o aquecedor), o mais perto da caixa; senão ponta livre
    let rootNode = -1;
    let coldNode = -1;
    if (cold) {
      let bestDepth = Infinity;
      for (const n of graph.nodes) {
        const c = nodeAt(cold.graph, n.pos);
        if (c < 0 || !cold.tree.reached.has(c)) continue;
        const e = cold.tree.parentEdge.get(c);
        const depth = e === undefined ? 0 : cold.tree.edges[e]!.depth;
        if (depth < bestDepth) {
          bestDepth = depth;
          rootNode = n.id;
          coldNode = c;
        }
      }
    }
    if (rootNode < 0) {
      const free = graph.nodes.filter((n) => n.ends.length === 1).sort((a, b) => a.id - b.id)[0];
      rootNode = free ? free.id : (graph.nodes[0]?.id ?? -1);
    }
    if (rootNode >= 0) {
      const root = graph.nodes[rootNode]!;
      const heater = ctx.project.installations.waterHeater;
      const loss = heater === 'gas' ? LOCAL.heaterLossMca.gas : heater === 'solar' ? LOCAL.heaterLossMca.solar : 0;
      const inlet =
        cold && coldNode >= 0 ? (cold.calc.head.get(coldNode) ?? 0) + (nodeZOf(cold, coldNode) - root.pos[2]) : bottomZ - root.pos[2];
      heaterInletHead = inlet;
      const tree = rootTree(graph, hotPipes, rootNode);
      const t = terminalsFor(ctx, layout, graph, tree, true);
      const calc = solveWater({
        system: 'hot',
        ctx,
        pipes: hotPipes,
        tree,
        terminals: t.reached,
        rootHead: inlet - loss,
        rootZ: root.pos[2],
        gateDepth: 0,
        entranceAtRoot: false,
      });
      hot = { system: 'hot', pipes: hotPipes, graph, tree, calc };
      t.lost.forEach((l) => disconnected.push({ ...l, system: 'hot' }));
    }
  }
  return { cold, hot, disconnected, heaterInletHead };
}

function nodeZOf(net: WaterNet, node: number): number {
  return net.graph.nodes[node]!.pos[2];
}
