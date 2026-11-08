import type { Vec2 } from '../../geometry';
import type { Conduit } from '../../schema/project';
import type { ElectricalLayout } from '../../schema/results';
import { pathStats } from './conduits';
import { ceilingAt } from './loads';
import type { Ctx, PointInfo } from './types';

/** Pontas a até 2 cm se ligam; ponto a até 30 cm da polilinha se liga a ela (NBR/prática: caixa na face da parede). */
export const JOIN_TOL = 0.02;
export const SNAP_TOL = 0.3;

export interface GNode {
  level: string;
  xy: Vec2;
  /** Cota absoluta da caixa (m). */
  zBox: number;
  /** Quantas pontas de eletroduto chegam aqui (0 = só ponto ou quadro). */
  ends: number;
  pointIds: string[];
  isPanel: boolean;
}

export interface GEdge {
  a: number;
  b: number;
  /** Comprimento real (m): horizontal + descidas/prumos. */
  len: number;
  /** Eletroduto de origem; null em ramal curto até a caixa e em prumo entre pavimentos. */
  conduitId: string | null;
}

export interface ConduitGeom {
  id: string;
  run: Conduit['run'];
  /** Comprimento (m) e curvas de 90° do eletroduto inteiro, com as descidas nas pontas. */
  length: number;
  bends90: number;
  edges: number[];
}

export interface Graph {
  nodes: GNode[];
  edges: GEdge[];
  nodeOfPoint: Map<string, number>;
  panel: number;
  /** Menor distância do quadro a cada nó (m); Infinity se não ligado. */
  dist: number[];
  /** Aresta pela qual se chega a cada nó no caminho mais curto (−1 no quadro e nos não ligados). */
  prevEdge: number[];
  conduits: ConduitGeom[];
}

class Dsu {
  p: number[];
  constructor(n: number) {
    this.p = Array.from({ length: n }, (_, i) => i);
  }
  find(i: number): number {
    while (this.p[i] !== i) {
      this.p[i] = this.p[this.p[i]!]!;
      i = this.p[i]!;
    }
    return i;
  }
  union(a: number, b: number) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.p[Math.max(ra, rb)] = Math.min(ra, rb);
  }
}

interface Term {
  xy: Vec2;
  level: string;
}

/** Aglomera terminais a até `tol` (opcionalmente só no mesmo nível) por hash espacial. */
function cluster(terms: Term[], dsu: Dsu, tol: number, sameLevel: boolean, accept?: (i: number, j: number) => boolean): void {
  const cell = (v: number) => Math.round(v / tol);
  const map = new Map<string, number[]>();
  terms.forEach((t, i) => {
    const kx = cell(t.xy[0]);
    const ky = cell(t.xy[1]);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const j of map.get(`${sameLevel ? t.level : ''}|${kx + dx}|${ky + dy}`) ?? []) {
          const o = terms[j]!;
          if ((!sameLevel && o.level === t.level) || (sameLevel && o.level !== t.level)) continue;
          if (Math.hypot(o.xy[0] - t.xy[0], o.xy[1] - t.xy[1]) <= tol + 1e-9 && (!accept || accept(i, j))) dsu.union(i, j);
        }
      }
    }
    const key = `${sameLevel ? t.level : ''}|${kx}|${ky}`;
    (map.get(key) ?? map.set(key, []).get(key)!).push(i);
  });
}

function projectOnPath(p: Vec2, path: Vec2[]): { d: number; q: Vec2; s: number } {
  let best = { d: Infinity, q: path[0]!, s: 0 };
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
    const q: Vec2 = [a[0] + t * dx, a[1] + t * dy];
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    const len = Math.sqrt(l2);
    if (d < best.d) best = { d, q, s: acc + t * len };
    acc += len;
  }
  return best;
}

/**
 * Grafo de eletrodutos: nós nas pontas, nos pontos e no quadro; pontas coincidentes a 2 cm formam um nó (caixa);
 * ponto a até 0,3 m da polilinha se liga a ela por ramal curto (a polilinha é dividida ali); pontas em cotas
 * diferentes no mesmo lugar ligam por prumo. Caminhos mínimos a partir do quadro.
 */
export function buildGraph(ctx: Ctx, layout: ElectricalLayout, infos: PointInfo[]): Graph {
  const elev = (l: string) => ctx.elev.get(l) ?? 0;
  const conduits = layout.conduits;
  const terms: Term[] = [];
  const tag: ({ t: 'panel' } | { t: 'point'; i: number } | { t: 'end'; c: number; end: 0 | 1 })[] = [];
  const panelZ = elev(layout.panel.level) + ctx.k.heights.panel;
  terms.push({ xy: layout.panel.position, level: layout.panel.level });
  tag.push({ t: 'panel' });
  infos.forEach((info, i) => {
    terms.push({ xy: info.p.position, level: info.p.level });
    tag.push({ t: 'point', i });
  });
  conduits.forEach((c, ci) => {
    terms.push({ xy: c.path[0]!, level: c.level });
    tag.push({ t: 'end', c: ci, end: 0 });
    terms.push({ xy: c.path[c.path.length - 1]!, level: c.level });
    tag.push({ t: 'end', c: ci, end: 1 });
  });
  const dsu = new Dsu(terms.length);
  cluster(terms, dsu, JOIN_TOL, true);

  // nós
  const nodeOfRoot = new Map<number, number>();
  const nodes: GNode[] = [];
  const nodeOfTerm: number[] = [];
  terms.forEach((t, i) => {
    const r = dsu.find(i);
    let n = nodeOfRoot.get(r);
    if (n === undefined) {
      n = nodes.length;
      nodeOfRoot.set(r, n);
      nodes.push({ level: t.level, xy: t.xy, zBox: Number.NaN, ends: 0, pointIds: [], isPanel: false });
    }
    nodeOfTerm.push(n);
    const g = nodes[n]!;
    const tg = tag[i]!;
    if (tg.t === 'panel') {
      g.isPanel = true;
      g.zBox = panelZ;
      g.xy = t.xy;
    } else if (tg.t === 'point') {
      const info = infos[tg.i]!;
      g.pointIds.push(info.p.id);
      if (Number.isNaN(g.zBox)) g.zBox = info.zBox;
    } else g.ends++;
  });
  const nodeOfPoint = new Map<string, number>();
  infos.forEach((info, i) => nodeOfPoint.set(info.p.id, nodeOfTerm[1 + i]!));

  // cota de forro/piso do eletroduto e cota das caixas só de junção
  /** Cota em que o eletroduto corre; no trecho de parede vale a da caixa inicial (a diferença até a outra é vertical). */
  const runZ = (c: Conduit, n: GNode, ci?: number): number => {
    if (c.run === 'floor') return elev(c.level);
    if (c.run === 'wall') {
      const i = ci ?? conduits.indexOf(c);
      const start = nodes[nodeOfTerm[1 + infos.length + i * 2]!]!;
      return Number.isNaN(start.zBox) ? elev(c.level) + ceilingAt(ctx, c.level, start.xy) : start.zBox;
    }
    return elev(c.level) + ceilingAt(ctx, c.level, n.xy);
  };
  conduits.forEach((c, ci) => {
    for (const end of [0, 1] as const) {
      const g = nodes[nodeOfTerm[1 + infos.length + ci * 2 + end]!]!;
      if (Number.isNaN(g.zBox)) g.zBox = runZ(c, g);
    }
  });

  const edges: GEdge[] = [];
  const geoms: ConduitGeom[] = [];
  // pontos soltos que se ligam à polilinha mais próxima
  type Split = { s: number; node: number };
  const splits = new Map<number, Split[]>();
  const stubs: GEdge[] = [];
  const loose = nodes.map((g, i) => ({ g, i })).filter(({ g }) => g.ends === 0 && !g.isPanel && g.pointIds.length > 0);
  for (const { g, i } of loose) {
    let best: { ci: number; d: number; q: Vec2; s: number } | null = null;
    conduits.forEach((c, ci) => {
      if (c.level !== g.level) return;
      const pr = projectOnPath(g.xy, c.path);
      if (pr.d <= SNAP_TOL && (!best || pr.d < best.d)) best = { ci, ...pr };
    });
    if (!best) continue;
    const b = best as { ci: number; d: number; q: Vec2; s: number };
    const c = conduits[b.ci]!;
    const a0 = nodeOfTerm[1 + infos.length + b.ci * 2]!;
    const a1 = nodeOfTerm[1 + infos.length + b.ci * 2 + 1]!;
    if (Math.hypot(b.q[0] - c.path[0]![0], b.q[1] - c.path[0]![1]) <= JOIN_TOL) {
      stubs.push({ a: i, b: a0, len: b.d + Math.abs(g.zBox - nodes[a0]!.zBox), conduitId: null });
    } else if (Math.hypot(b.q[0] - c.path[c.path.length - 1]![0], b.q[1] - c.path[c.path.length - 1]![1]) <= JOIN_TOL) {
      stubs.push({ a: i, b: a1, len: b.d + Math.abs(g.zBox - nodes[a1]!.zBox), conduitId: null });
    } else {
      const jn = nodes.length;
      nodes.push({ level: g.level, xy: b.q, zBox: runZ(c, g), ends: 0, pointIds: [], isPanel: false });
      (splits.get(b.ci) ?? splits.set(b.ci, []).get(b.ci)!).push({ s: b.s, node: jn });
      stubs.push({ a: i, b: jn, len: b.d + Math.abs(g.zBox - runZ(c, g)), conduitId: null });
    }
  }

  // arestas dos eletrodutos (divididas nos ramais)
  conduits.forEach((c, ci) => {
    const n0 = nodeOfTerm[1 + infos.length + ci * 2]!;
    const n1 = nodeOfTerm[1 + infos.length + ci * 2 + 1]!;
    // descida só onde há caixa de ponto ou quadro; caixa de passagem (só pontas de eletroduto) fica na cota do trecho
    const dropAt = (n: GNode) => (n.pointIds.length > 0 || n.isPanel ? Math.abs(n.zBox - runZ(c, n, ci)) : 0);
    const dA = dropAt(nodes[n0]!);
    const dB = dropAt(nodes[n1]!);
    const st = pathStats(c.path, dA, dB);
    const chain = [{ s: 0, node: n0 }, ...(splits.get(ci) ?? []).sort((x, y) => x.s - y.s), { s: st.horizontal, node: n1 }];
    const idx: number[] = [];
    for (let i = 1; i < chain.length; i++) {
      const len = chain[i]!.s - chain[i - 1]!.s + (i === 1 ? dA : 0) + (i === chain.length - 1 ? dB : 0);
      idx.push(edges.push({ a: chain[i - 1]!.node, b: chain[i]!.node, len, conduitId: c.id }) - 1);
    }
    geoms.push({ id: c.id, run: c.run, length: st.length, bends90: st.bends90, edges: idx });
  });
  edges.push(...stubs);

  // prumos entre pavimentos: nós em cotas diferentes no mesmo lugar (um deles com ponta de eletroduto)
  const nterms: Term[] = nodes.map((g) => ({ xy: g.xy, level: g.level }));
  const risers = new Dsu(nodes.length);
  cluster(nterms, risers, JOIN_TOL, false, (i, j) => nodes[i]!.ends > 0 || nodes[j]!.ends > 0);
  const seen = new Set<number>();
  nodes.forEach((_, i) => {
    const r = risers.find(i);
    if (seen.has(r)) return;
    seen.add(r);
    const members = nodes.map((__, j) => j).filter((j) => risers.find(j) === r);
    for (let x = 1; x < members.length; x++) {
      const a = members[x - 1]!;
      const b = members[x]!;
      if (nodes[a]!.level === nodes[b]!.level) continue;
      edges.push({ a, b, len: Math.abs(nodes[a]!.zBox - nodes[b]!.zBox), conduitId: null });
    }
  });

  // caminhos mínimos a partir do quadro
  const adj: number[][] = nodes.map(() => []);
  edges.forEach((e, i) => {
    if (e.a === e.b) return;
    adj[e.a]!.push(i);
    adj[e.b]!.push(i);
  });
  const panel = nodeOfTerm[0]!;
  const dist = nodes.map(() => Infinity);
  const prevEdge = nodes.map(() => -1);
  const done = nodes.map(() => false);
  dist[panel] = 0;
  for (let it = 0; it < nodes.length; it++) {
    let u = -1;
    for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i]! < Infinity && (u < 0 || dist[i]! < dist[u]!)) u = i;
    if (u < 0) break;
    done[u] = true;
    for (const ei of adj[u]!) {
      const e = edges[ei]!;
      const v = e.a === u ? e.b : e.a;
      const nd = dist[u]! + e.len;
      if (nd < dist[v]! - 1e-12) {
        dist[v] = nd;
        prevEdge[v] = ei;
      }
    }
  }
  return { nodes, edges, nodeOfPoint, panel, dist, prevEdge, conduits: geoms };
}

/** Arestas do caminho do quadro até o nó (do nó para o quadro). Vazio se o nó não é alcançável. */
export function pathEdges(g: Graph, node: number): number[] {
  const out: number[] = [];
  let v = node;
  let guard = g.nodes.length + 1;
  while (g.prevEdge[v]! >= 0 && guard-- > 0) {
    const ei = g.prevEdge[v]!;
    out.push(ei);
    const e = g.edges[ei]!;
    v = e.a === v ? e.b : e.a;
  }
  return out;
}
