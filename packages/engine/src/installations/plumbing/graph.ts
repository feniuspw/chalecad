import { LOCAL } from './context';
import { dist2, dist3, length3, type V3 } from './vec';

/** Tubo com o traçado em cota absoluta (m). */
export interface AbsPipe {
  id: string;
  system: 'cold' | 'hot' | 'sewer' | 'vent';
  level: string;
  path: V3[];
  dn?: number | undefined;
  slope?: number | undefined;
}

export interface GNode {
  id: number;
  pos: V3;
  /** Extremidades de tubo neste nó: índice do tubo e ponta. */
  ends: { pipe: number; end: 'start' | 'end' }[];
}

export interface RawGraph {
  nodes: GNode[];
  /** Nó de cada ponta de cada tubo. */
  pipeNodes: { start: number; end: number }[];
}

/** Agrupa as pontas coincidentes (3D, `tol`) em nós. */
export function buildGraph(pipes: AbsPipe[], tol = LOCAL.tol): RawGraph {
  const items: { pipe: number; end: 'start' | 'end'; pos: V3 }[] = [];
  pipes.forEach((p, i) => {
    items.push({ pipe: i, end: 'start', pos: p.path[0]! }, { pipe: i, end: 'end', pos: p.path[p.path.length - 1]! });
  });
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (dist3(items[i]!.pos, items[j]!.pos) <= tol) parent[find(j)] = find(i);
    }
  }
  const ids = new Map<number, number>();
  const nodes: GNode[] = [];
  const pipeNodes = pipes.map(() => ({ start: -1, end: -1 }));
  items.forEach((it, i) => {
    const r = find(i);
    let nid = ids.get(r);
    if (nid === undefined) {
      nid = nodes.length;
      ids.set(r, nid);
      nodes.push({ id: nid, pos: it.pos, ends: [] });
    }
    nodes[nid]!.ends.push({ pipe: it.pipe, end: it.end });
    pipeNodes[it.pipe]![it.end] = nid;
  });
  return { nodes, pipeNodes };
}

/** Nó mais próximo de `pos` (3D) dentro da tolerância, ou -1. */
export function nodeAt(g: RawGraph, pos: V3, tol = LOCAL.tol): number {
  let best = -1;
  let bd = tol;
  for (const n of g.nodes) {
    const d = dist3(n.pos, pos);
    if (d <= bd) {
      bd = d;
      best = n.id;
    }
  }
  return best;
}

/** Nós cuja posição em planta coincide com `xy`; mais alto primeiro. */
export function nodesAtXY(g: RawGraph, xy: [number, number], tol = LOCAL.tol): GNode[] {
  return g.nodes.filter((n) => dist2(n.pos, xy) <= tol).sort((a, b) => b.pos[2] - a.pos[2]);
}

export interface TreeEdge {
  /** Índice do tubo em `pipes`. */
  pipe: number;
  /** Nó mais perto da raiz e nó mais longe. */
  from: number;
  to: number;
  /** Caminho orientado de `from` para `to`. */
  path: V3[];
  length: number;
  /** 1 = tubo que sai da raiz. */
  depth: number;
}

export interface Tree {
  root: number;
  /** Arestas na ordem da busca em largura (pais antes dos filhos). */
  edges: TreeEdge[];
  parentEdge: Map<number, number>;
  childEdges: Map<number, number[]>;
  reached: Set<number>;
  /** Tubos fora da árvore (desconectados da raiz ou fechando ciclo). */
  unreachedPipes: number[];
  cyclePipes: number[];
}

/** Árvore geradora por busca em largura a partir de `root`. Ordem dos filhos: ordem dos tubos (determinística). */
export function rootTree(g: RawGraph, pipes: AbsPipe[], root: number): Tree {
  const edges: TreeEdge[] = [];
  const parentEdge = new Map<number, number>();
  const childEdges = new Map<number, number[]>();
  const reached = new Set<number>([root]);
  const usedPipes = new Set<number>();
  const depthOf = new Map<number, number>([[root, 0]]);
  const queue = [root];
  while (queue.length > 0) {
    const u = queue.shift()!;
    const incident = [...g.nodes[u]!.ends].sort((a, b) => a.pipe - b.pipe);
    for (const e of incident) {
      if (usedPipes.has(e.pipe)) continue;
      const pn = g.pipeNodes[e.pipe]!;
      const other = e.end === 'start' ? pn.end : pn.start;
      if (other === u) {
        usedPipes.add(e.pipe); // laço (as duas pontas no mesmo nó)
        continue;
      }
      usedPipes.add(e.pipe);
      if (reached.has(other)) continue; // fecha ciclo: ignorado
      const raw = pipes[e.pipe]!.path;
      const path = e.end === 'start' ? raw : [...raw].reverse();
      const idx = edges.length;
      const depth = (depthOf.get(u) ?? 0) + 1;
      edges.push({ pipe: e.pipe, from: u, to: other, path, length: length3(path), depth });
      parentEdge.set(other, idx);
      childEdges.set(u, [...(childEdges.get(u) ?? []), idx]);
      reached.add(other);
      depthOf.set(other, depth);
      queue.push(other);
    }
  }
  const inTree = new Set(edges.map((e) => e.pipe));
  const unreachedPipes: number[] = [];
  const cyclePipes: number[] = [];
  pipes.forEach((_, i) => {
    if (inTree.has(i)) return;
    const pn = g.pipeNodes[i]!;
    if (reached.has(pn.start) && reached.has(pn.end)) cyclePipes.push(i);
    else unreachedPipes.push(i);
  });
  return { root, edges, parentEdge, childEdges, reached, unreachedPipes, cyclePipes };
}
