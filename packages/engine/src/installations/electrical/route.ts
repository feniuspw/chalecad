import type { Vec2 } from '../../geometry';
import type { Conduit, ElecPoint } from '../../schema/project';
import { pathStats, runOk } from './conduits';
import { ampacity, breakerFor, conductorArea, groupingFactor, sectionsOf } from './tables';
import { ceilingAt } from './loads';
import { manhattan, type Ctx } from './types';

/**
 * Circuitos por eletroduto no traçado gerado. Com 4 circuitos o FCA é 0,65: acima disso a seção sobe demais.
 * (Constante de projeto do gerador; o catálogo ainda não tem um campo para isso.)
 */
const MAX_CIRCUITS_PER_CONDUIT = 4;
const SAME_SPOT = 0.02;
/** Peso do caminho até o quadro na escolha do pai (0 = Prim puro; 1 = caminhos mínimos). */
const RADIUS_WEIGHT = 0.4;

interface Node {
  xy: Vec2;
  level: string;
  /** Cota absoluta da caixa e do forro (m). */
  zBox: number;
  zRun: number;
  circuit: string | null;
  /** Parede onde a caixa está (ponto de parede) e se o circuito é pesado (corrente alta). */
  host: string | null;
  heavy: boolean;
  parent: number;
  kind: 'panel' | 'point' | 'riser';
  sub: Set<string>;
  /** Distância ortogonal acumulada do quadro ao nó pela árvore (m). */
  root: number;
}

/** Circuito com corrente acima disso (A) segue em eletroduto só dele (chuveiro, forno, cooktop). */
const HEAVY_A = 16;
const MAX_CIRCUITS_HEAVY = 1;
/** Trecho reto pela parede (furos dos montantes) só até esta distância (m); acima disso, pelo forro. */
const MAX_WALL_RUN = 4;
/** Condutores por circuito para estimar a ocupação (fase, neutro, terra e retornos de interruptor). */
const CONDUCTORS_PER_CIRCUIT = 4.5;

export interface RoutePanel {
  level: string;
  position: Vec2;
  height: number;
}

/** Vértice de curva de um caminho em L entre dois pontos (curva no eixo de maior deslocamento primeiro). */
function lPath(a: Vec2, b: Vec2): Vec2[] {
  if (Math.abs(a[0] - b[0]) < 0.01 || Math.abs(a[1] - b[1]) < 0.01) return [a, b];
  const corner: Vec2 = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? [b[0], a[1]] : [a[0], b[1]];
  return [a, corner, b];
}

/**
 * Divide o caminho com caixas de passagem até cada trecho respeitar 15 m − 3 m/curva e 3 curvas. `jd` dá a descida
 * numa caixa de passagem (não zero quando ela cai sobre a caixa de um ponto, como no cálculo).
 */
function splitRuns(ctx: Ctx, path: Vec2[], dropA: number, dropB: number, jd: (xy: Vec2) => number, depth = 0): Vec2[][] {
  if (depth > 8 || runOk(ctx.k, pathStats(path, dropA, dropB))) return [path];
  if (path.length > 2) {
    const j = jd(path[1]!);
    return [...splitRuns(ctx, path.slice(0, 2), dropA, j, jd, depth + 1), ...splitRuns(ctx, path.slice(1), j, dropB, jd, depth + 1)];
  }
  const [a, b] = path as [Vec2, Vec2];
  const m: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const j = jd(m);
  return [...splitRuns(ctx, [a, m], dropA, j, jd, depth + 1), ...splitRuns(ctx, [m, b], j, dropB, jd, depth + 1)];
}

const round3 = (p: Vec2): Vec2 => [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000];

/**
 * Eletrodutos pelo forro: árvore a partir do quadro (Prim com o vizinho mais próximo, distância ortogonal), trechos
 * em L, descida na parede até cada caixa, no máximo 4 circuitos por eletroduto e caixa de passagem onde o trecho
 * passaria de 15 m − 3 m por curva. Pavimentos acima do térreo sobem por um prumo a partir do ponto de forro mais
 * próximo (pontas coincidentes em cotas diferentes ligam por prumo no cálculo).
 */
export function routeConduits(ctx: Ctx, points: ElecPoint[], panel: RoutePanel, circuitIb: Map<string, number> = new Map()): Conduit[] {
  const elev = (l: string) => ctx.elev.get(l) ?? 0;
  const nodes: Node[] = [];
  const mk = (n: Omit<Node, 'sub' | 'parent' | 'root'>): number => nodes.push({ ...n, parent: -1, root: 0, sub: new Set() }) - 1;
  const pz = elev(panel.level);
  mk({ xy: panel.position, level: panel.level, zBox: pz + panel.height, zRun: pz + ceilingAt(ctx, panel.level, panel.position), circuit: null, host: null, heavy: false, kind: 'panel' });
  const pending: number[] = [];
  for (const p of points) {
    if (p.kind === 'data' || !p.circuitId) continue;
    const z = elev(p.level);
    pending.push(mk({ xy: p.position, level: p.level, zBox: z + p.height, zRun: z + ceilingAt(ctx, p.level, p.position), circuit: p.circuitId, host: p.hostId ?? null, heavy: (circuitIb.get(p.circuitId) ?? 0) > HEAVY_A, kind: 'point' }));
  }

  const levels = [...new Set([panel.level, ...pending.map((i) => nodes[i]!.level)])].sort(
    (a, b) => (a === panel.level ? -1 : b === panel.level ? 1 : elev(a) - elev(b)),
  );
  // Área estimada dos cabos de cada circuito (seção pelo disjuntor com FCA de 4 circuitos): limita a ocupação do DN maior.
  const k = ctx.k;
  const fcaGuess = groupingFactor(k, MAX_CIRCUITS_PER_CONDUIT);
  const areaOf = new Map<string, number>();
  for (const [c, ib] of circuitIb) {
    const inA = breakerFor(k, ib);
    const s = sectionsOf(k).find((x) => ampacity(k, x, 'B1', 2) * fcaGuess >= inA - 1e-9) ?? sectionsOf(k)[sectionsOf(k).length - 1]!;
    areaOf.set(c, CONDUCTORS_PER_CIRCUIT * conductorArea(k, s));
  }
  const biggest = [...k.conduit.sizes].sort((a, b) => b.dn - a.dn)[0]!;
  const maxArea = 0.85 * k.conduit.fillMax.many * ((Math.PI * biggest.di * biggest.di) / 4);
  const heavySet = new Set<string>();
  for (const nd of nodes) if (nd.heavy && nd.circuit) heavySet.add(nd.circuit);
  const feasible = (parent: number, c: string): boolean => {
    for (let v = parent; v > 0; v = nodes[v]!.parent) {
      const sub = nodes[v]!.sub;
      if (sub.has(c)) continue;
      const heavy = heavySet.has(c) || [...sub].some((x) => heavySet.has(x));
      if (sub.size + 1 > (heavy ? MAX_CIRCUITS_HEAVY : MAX_CIRCUITS_PER_CONDUIT)) return false;
      let area = areaOf.get(c) ?? 0;
      for (const x of sub) area += areaOf.get(x) ?? 0;
      if (area > maxArea && sub.size > 0) return false;
    }
    return true;
  };
  const attach = (child: number, parent: number) => {
    const c = nodes[child]!.circuit;
    nodes[child]!.parent = parent;
    nodes[child]!.root = nodes[parent]!.root + manhattan(nodes[child]!.xy, nodes[parent]!.xy);
    if (c) {
      nodes[child]!.sub.add(c);
      for (let v = parent; v > 0; v = nodes[v]!.parent) nodes[v]!.sub.add(c);
    }
  };

  for (const level of levels) {
    const todo = pending.filter((i) => nodes[i]!.level === level);
    if (todo.length === 0) continue;
    const tree: number[] = [];
    if (level === panel.level) tree.push(0);
    else {
      // prumo: ponto de forro do térreo (luz) mais próximo do centro do pavimento; sem luz, qualquer nó do térreo
      const cx = todo.reduce((s, i) => s + nodes[i]!.xy[0], 0) / todo.length;
      const cy = todo.reduce((s, i) => s + nodes[i]!.xy[1], 0) / todo.length;
      const ground = nodes.map((_, i) => i).filter((i) => nodes[i]!.level === panel.level && (nodes[i]!.parent >= 0 || i === 0));
      const ceil = ground.filter((i) => nodes[i]!.kind === 'point' && Math.abs(nodes[i]!.zBox - nodes[i]!.zRun) < 1e-6);
      const pool = ceil.length > 0 ? ceil : ground;
      const anchor = pool.reduce((a, b) => (manhattan(nodes[b]!.xy, [cx, cy]) < manhattan(nodes[a]!.xy, [cx, cy]) ? b : a));
      const an = nodes[anchor]!;
      const z = elev(level);
      const r = mk({ xy: an.xy, level, zBox: z + ceilingAt(ctx, level, an.xy), zRun: z + ceilingAt(ctx, level, an.xy), circuit: null, host: null, heavy: false, kind: 'riser' });
      nodes[r]!.zBox = nodes[r]!.zRun;
      nodes[r]!.parent = anchor;
      nodes[r]!.root = nodes[anchor]!.root;
      tree.push(r);
    }
    const best = new Map<number, { p: number; d: number }>();
    const consider = (u: number, t: number) => {
      // Prim-Dijkstra: distância ao nó + parte do caminho até o quadro (árvore mais rasa, cabos menos sinuosos)
      const d = manhattan(nodes[u]!.xy, nodes[t]!.xy) + RADIUS_WEIGHT * nodes[t]!.root;
      const b = best.get(u);
      if (!b || d < b.d - 1e-9) best.set(u, { p: t, d });
    };
    for (const u of todo) for (const t of tree) consider(u, t);
    const left = new Set(todo);
    while (left.size > 0) {
      let pick = -1;
      let pd = Infinity;
      for (const u of left) {
        const b = best.get(u)!;
        if (b.d < pd - 1e-9) {
          pd = b.d;
          pick = u;
        }
      }
      const c = nodes[pick]!.circuit!;
      let parent = best.get(pick)!.p;
      if (!feasible(parent, c)) {
        const alt = [...tree].sort((a, b) => manhattan(nodes[a]!.xy, nodes[pick]!.xy) - manhattan(nodes[b]!.xy, nodes[pick]!.xy));
        const ok = alt.find((t) => feasible(t, c));
        if (ok !== undefined) parent = ok;
        else if (level !== panel.level) {
          // o prumo existente já está cheio: novo prumo direto do quadro (pontas coincidentes no mesmo lugar)
          const z = elev(level);
          const zc = z + ceilingAt(ctx, level, panel.position);
          parent = mk({ xy: panel.position, level, zBox: zc, zRun: zc, circuit: null, host: null, heavy: false, kind: 'riser' });
          nodes[parent]!.parent = 0;
          tree.push(parent);
          for (const u of left) consider(u, parent);
        }
      }
      attach(pick, parent);
      left.delete(pick);
      tree.push(pick);
      for (const u of left) consider(u, pick);
    }
  }

  // Emissão: um caminho em L por aresta da árvore, dividido por caixas de passagem quando passa do limite.
  const out: Conduit[] = [];
  let n = 0;
  const drop = (i: number) => Math.abs(nodes[i]!.zRun - nodes[i]!.zBox);
  const junctionDrop = (level: string) => (xy: Vec2): number => {
    for (const nd of nodes) if (nd.level === level && nd.kind === 'point' && manhattan(nd.xy, xy) <= 2 * SAME_SPOT) return Math.abs(nd.zRun - nd.zBox);
    return 0;
  };
  for (let i = 1; i < nodes.length; i++) {
    const nd = nodes[i]!;
    if (nd.parent < 0 || nd.kind === 'riser') continue;
    const par = nodes[nd.parent]!;
    const same = manhattan(par.xy, nd.xy) <= SAME_SPOT;
    if (same && par.kind !== 'riser') continue; // a mesma caixa
    // Mesma parede: segue pela parede, de caixa em caixa (furos dos montantes), sem subir ao forro.
    if (par.host && par.host === nd.host && par.level === nd.level && !same) {
      const path: Vec2[] = [par.xy, nd.xy];
      const st = pathStats(path, 0, Math.abs(par.zBox - nd.zBox));
      if (st.horizontal <= MAX_WALL_RUN && runOk(ctx.k, st)) {
        n++;
        out.push({ id: `auto-cd${n}`, level: nd.level, path: path.map(round3), run: 'wall' });
        continue;
      }
    }
    const path = same ? [par.xy, nd.xy] : lPath(par.xy, nd.xy);
    for (const piece of splitRuns(ctx, path, par.kind === 'riser' ? 0 : drop(nd.parent), drop(i), junctionDrop(nd.level))) {
      n++;
      out.push({ id: `auto-cd${n}`, level: nd.level, path: piece.map(round3), run: 'ceiling' });
    }
  }
  return out;
}
