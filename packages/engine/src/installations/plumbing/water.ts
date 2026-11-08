import { LOCAL, type Ctx, type FixtureSpec, type PlumbingK } from './context';
import { inferFittings, type Fittings, type FitKind } from './fittings';
import type { AbsPipe, Tree } from './graph';

export interface WaterTerminal {
  pointId: string;
  fixture: string;
  spec: FixtureSpec;
  /** Cota absoluta do ponto (m). */
  z: number;
  level: string;
  /** Nó do grafo onde o ponto está ligado. */
  node: number;
}

export interface WaterInput {
  system: 'cold' | 'hot';
  ctx: Ctx;
  pipes: AbsPipe[];
  tree: Tree;
  terminals: WaterTerminal[];
  /** Carga (m.c.a.) no nó raiz e sua cota (m). Cold: bottomZ − z_raiz. */
  rootHead: number;
  rootZ: number;
  gateDepth: number;
  entranceAtRoot: boolean;
}

export interface WaterEdgeCalc {
  edge: number;
  pipeId: string;
  sumWeights: number;
  flowLps: number;
  dn: number;
  di: number;
  locked: boolean;
  velocity: number;
  length: number;
  leq: number;
  fittings: Fittings;
  headLoss: number;
  /** Carga (m.c.a.) ao chegar no nó `to`. */
  headOut: number;
  material: string;
}

export interface WaterPointCalc {
  terminal: WaterTerminal;
  staticHead: number;
  headLoss: number;
  dynamicHead: number;
  dynamicKpa: number;
  minKpa: number;
  minMca: number;
  ok: boolean;
  requiredTankRise: number;
  pathEdges: number[];
}

export interface WaterCalc {
  system: 'cold' | 'hot';
  edges: WaterEdgeCalc[];
  points: WaterPointCalc[];
  /** Carga em cada nó (m.c.a.). */
  head: Map<number, number>;
}

/** Fair-Whipple-Hsiao: J (m/m) com Q em L/s e D interno em m. */
export function fwhJ(k: PlumbingK, system: 'cold' | 'hot', qLps: number, di: number): number {
  const f = k.water.fwh[system];
  return (f.k * Math.pow(qLps / 1000, f.qExp)) / Math.pow(di, f.dExp);
}

/** Vazão de projeto (L/s): máx(C·√ΣP, maior vazão unitária a jusante). */
export function designFlow(k: PlumbingK, sumWeights: number, qMax: number): number {
  return Math.max(k.water.simultaneityC * Math.sqrt(Math.max(0, sumWeights)), qMax);
}

/** Valor da tabela de comprimentos equivalentes para o DN (o menor DN tabelado ≥ DN, ou o último). */
export function leqAt(k: PlumbingK, table: number[], dn: number): number {
  const dns = k.water.leq.dn;
  let i = dns.findIndex((d) => d >= dn);
  if (i < 0) i = dns.length - 1;
  return table[i] ?? table[table.length - 1] ?? 0;
}

const LEQ_KEY: Record<FitKind, keyof PlumbingK['water']['leq']> = {
  elbow90: 'elbow90',
  elbow45: 'elbow45',
  teeStraight: 'teeStraight',
  teeBranch: 'teeBranch',
  entrance: 'entrance',
  gateValve: 'gateValve',
  pressureValve: 'pressureValve',
};

export function fittingsLeq(k: PlumbingK, f: Fittings, dn: number): number {
  let s = 0;
  (Object.keys(f) as FitKind[]).forEach((kind) => {
    if (f[kind] > 0) s += f[kind] * leqAt(k, k.water.leq[LEQ_KEY[kind]] as number[], dn);
  });
  return s;
}

/** Tubo (material) do sistema: o primeiro do catálogo com `hot` correspondente. */
export function pipeMaterial(k: PlumbingK, system: 'cold' | 'hot'): { id: string; sizes: { dn: number; di: number }[] } {
  const entry = Object.entries(k.water.pipes).find(([, v]) => v.hot === (system === 'hot')) ?? Object.entries(k.water.pipes)[0]!;
  return { id: entry[0], sizes: [...entry[1].sizes].sort((a, b) => a.dn - b.dn) };
}

function minKpaOf(k: PlumbingK, t: WaterTerminal): number {
  return t.spec.minKpa ?? (k.water.minDynamicKpa as Record<string, number>)[t.fixture] ?? k.water.minDynamicKpa.default;
}

/** Cálculo da rede (pesos, vazões, DN, perdas e pressões) sem otimização. `bumps` sobe DN dos tubos não travados. */
export function calcWater(inp: WaterInput, bumps: Map<number, number> = new Map()): WaterCalc {
  const { ctx, tree } = inp;
  const k = ctx.k;
  const mat = pipeMaterial(k, inp.system);
  const sizes = mat.sizes;
  const hot = inp.system === 'hot';
  const termAt = new Map<number, WaterTerminal[]>();
  for (const t of inp.terminals) termAt.set(t.node, [...(termAt.get(t.node) ?? []), t]);
  const wOf = (t: WaterTerminal) => (hot ? t.spec.wHot : t.spec.w);
  const qOf = (t: WaterTerminal) => (hot ? (t.spec.qHot ?? t.spec.q) : t.spec.q);
  const n = tree.edges.length;

  // pesos e vazão máxima a jusante (pós-ordem: as arestas estão em BFS, então percorre ao contrário)
  const sumW = new Array<number>(n).fill(0);
  const qMax = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    const e = tree.edges[i]!;
    for (const t of termAt.get(e.to) ?? []) {
      sumW[i]! += wOf(t);
      qMax[i] = Math.max(qMax[i]!, qOf(t));
    }
    for (const c of tree.childEdges.get(e.to) ?? []) {
      sumW[i]! += sumW[c]!;
      qMax[i] = Math.max(qMax[i]!, qMax[c]!);
    }
  }

  // conexões
  const fits = inferFittings({
    tree,
    pointsAtNode: (node) => (termAt.get(node) ?? []).length,
    pressureValveAt: (node) => (termAt.get(node) ?? []).some((t) => t.spec.pressureValve === true),
    gateAtLeaf: (node) => (termAt.get(node) ?? []).some((t) => LOCAL.gateOnBranch.has(t.fixture)),
    gateDepth: inp.gateDepth,
    entranceAtRoot: inp.entranceAtRoot,
  });

  // DN: velocidade-alvo e mínimo do aparelho; não diminui rumo à caixa (montante ≥ jusante), salvo `dn` do usuário
  const sizeIdx = new Array<number>(n).fill(0);
  const locked = new Array<boolean>(n).fill(false);
  const flow = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    const e = tree.edges[i]!;
    const q = designFlow(k, sumW[i]!, qMax[i]!);
    flow[i] = q;
    const user = inp.pipes[e.pipe]!.dn;
    if (user !== undefined) {
      locked[i] = true;
      let best = 0;
      sizes.forEach((s, j) => {
        if (Math.abs(s.dn - user) < Math.abs(sizes[best]!.dn - user)) best = j;
      });
      sizeIdx[i] = best;
      continue;
    }
    const minDn = Math.max(0, ...(termAt.get(e.to) ?? []).map((t) => t.spec.dnMin));
    let idx = sizes.findIndex((s) => s.dn >= minDn && q / 1000 / (Math.PI * (s.di / 2) ** 2) <= k.water.velocityTarget);
    if (idx < 0) idx = sizes.length - 1;
    idx = Math.min(sizes.length - 1, idx + (bumps.get(i) ?? 0));
    for (const c of tree.childEdges.get(e.to) ?? []) idx = Math.max(idx, sizeIdx[c]!);
    sizeIdx[i] = idx;
  }

  // perdas e pressões (pré-ordem)
  const head = new Map<number, number>([[tree.root, inp.rootHead]]);
  const edges: WaterEdgeCalc[] = [];
  tree.edges.forEach((e, i) => {
    const s = sizes[sizeIdx[i]!]!;
    const q = flow[i]!;
    const area = Math.PI * (s.di / 2) ** 2;
    const leq = fittingsLeq(k, fits[i]!, s.dn);
    const hf = fwhJ(k, inp.system, q, s.di) * (e.length + leq);
    const zFrom = e.path[0]![2];
    const zTo = e.path[e.path.length - 1]![2];
    const hOut = (head.get(e.from) ?? 0) + (zFrom - zTo) - hf;
    head.set(e.to, hOut);
    edges.push({
      edge: i,
      pipeId: inp.pipes[e.pipe]!.id,
      sumWeights: sumW[i]!,
      flowLps: q,
      dn: s.dn,
      di: s.di,
      locked: locked[i]!,
      velocity: q / 1000 / area,
      length: e.length,
      leq,
      fittings: fits[i]!,
      headLoss: hf,
      headOut: hOut,
      material: mat.id,
    });
  });

  const points: WaterPointCalc[] = inp.terminals.map((t) => {
    const pathEdges: number[] = [];
    let node = t.node;
    for (let p = tree.parentEdge.get(node); p !== undefined; p = tree.parentEdge.get(tree.edges[p]!.from)) {
      pathEdges.unshift(p);
      node = tree.edges[p]!.from;
    }
    const zNode = tree.reached.has(t.node) ? nodeZ(tree, t.node, inp.rootZ) : t.z;
    const dynamicHead = (head.get(t.node) ?? 0) + (zNode - t.z);
    const loss = pathEdges.reduce((s, p) => s + edges[p]!.headLoss, 0);
    const minKpa = minKpaOf(k, t);
    const minMca = minKpa / k.kPaPerMca;
    const ok = dynamicHead * k.kPaPerMca >= minKpa - 1e-9;
    return {
      terminal: t,
      staticHead: inp.rootHead + (inp.rootZ - t.z),
      headLoss: loss,
      dynamicHead,
      dynamicKpa: dynamicHead * k.kPaPerMca,
      minKpa,
      minMca,
      ok,
      requiredTankRise: ok ? 0 : Math.max(0, minMca - dynamicHead),
      pathEdges,
    };
  });
  return { system: inp.system, edges, points, head };
}

function nodeZ(tree: Tree, node: number, rootZ: number): number {
  if (node === tree.root) return rootZ;
  const e = tree.edges[tree.parentEdge.get(node)!]!;
  return e.path[e.path.length - 1]![2];
}

/**
 * Cálculo com dimensionamento: enquanto algum ponto falhar, sobe um DN do tubo não travado de maior perda no
 * caminho do ponto mais deficitário (até 30 passos; seção 10.3, item 8).
 */
export function solveWater(inp: WaterInput): WaterCalc {
  const bumps = new Map<number, number>();
  let calc = calcWater(inp, bumps);
  const maxIdx = pipeMaterial(inp.ctx.k, inp.system).sizes.length - 1;
  for (let it = 0; it < 30; it++) {
    const failing = calc.points.filter((p) => !p.ok).sort((a, b) => b.requiredTankRise - a.requiredTankRise);
    let bumped = false;
    for (const f of failing) {
      const cand = f.pathEdges
        .map((e) => calc.edges[e]!)
        .filter((e) => !e.locked && sizesIndex(inp, e.dn) < maxIdx)
        .sort((a, b) => b.headLoss - a.headLoss)[0];
      if (cand) {
        bumps.set(cand.edge, (bumps.get(cand.edge) ?? 0) + 1);
        bumped = true;
        break;
      }
    }
    if (!bumped) break;
    calc = calcWater(inp, bumps);
  }
  return calc;
}

const sizesIndex = (inp: WaterInput, dn: number) => pipeMaterial(inp.ctx.k, inp.system).sizes.findIndex((s) => s.dn === dn);
