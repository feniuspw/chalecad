import type { Tree } from './graph';
import { deflection, unit, type V3 } from './vec';

export type FitKind = 'elbow90' | 'elbow45' | 'teeStraight' | 'teeBranch' | 'entrance' | 'gateValve' | 'pressureValve';
export type Fittings = Record<FitKind, number>;

export const emptyFittings = (): Fittings => ({ elbow90: 0, elbow45: 0, teeStraight: 0, teeBranch: 0, entrance: 0, gateValve: 0, pressureValve: 0 });

export interface FittingOpts {
  tree: Tree;
  /** Número de saídas extras (aparelhos) em cada nó, além dos tubos filhos. */
  pointsAtNode: (node: number) => number;
  /** O tubo que chega a este nó leva registro de pressão (sub-ramal de aparelho com `pressureValve`). */
  pressureValveAt: (node: number) => boolean;
  /** Registro de gaveta no sub-ramal deste nó (pia, tanque, máquina). */
  gateAtLeaf: (node: number) => boolean;
  /** Registro de gaveta no início dos tubos de profundidade até este valor (0 = nenhum). */
  gateDepth: number;
  /** Primeiro tubo sai de uma caixa d'água: conta "entrada normal". */
  entranceAtRoot: boolean;
}

/** Joelho conforme o desvio entre duas direções: 35 a 55° = 45°; 55° ou mais = 90°; menos de 35° = curva leve, sem peça. */
function elbowKind(defl: number): 'elbow90' | 'elbow45' | null {
  if (defl < 35) return null;
  if (defl <= 55) return 'elbow45';
  return 'elbow90';
}

/** Última direção (não nula) de um caminho. */
function lastDir(path: V3[]): V3 | null {
  for (let i = path.length - 1; i >= 1; i--) {
    const d = unit(path[i - 1]!, path[i]!);
    if (d) return d;
  }
  return null;
}
function firstDir(path: V3[]): V3 | null {
  for (let i = 1; i < path.length; i++) {
    const d = unit(path[i - 1]!, path[i]!);
    if (d) return d;
  }
  return null;
}

/**
 * Conexões inferidas do traçado, por aresta da árvore (atribuídas ao tubo que sai da conexão):
 * vértice interno vira joelho 90° ou 45°; nó com 3 ou mais saídas vira tê (o primeiro tubo alinhado com o que
 * chega é passagem direta, os demais saída lateral); nó de passagem com mudança de direção vira joelho; saída da
 * caixa vira entrada normal; registro de gaveta nos tubos de profundidade até `gateDepth` e nos sub-ramais de
 * `gateAtLeaf`; registro de pressão no sub-ramal de `pressureValveAt`.
 */
export function inferFittings(o: FittingOpts): Fittings[] {
  const { tree } = o;
  const out: Fittings[] = tree.edges.map(() => emptyFittings());
  tree.edges.forEach((e, idx) => {
    const f = out[idx]!;
    // vértices internos
    for (let i = 1; i < e.path.length - 1; i++) {
      const d1 = unit(e.path[i - 1]!, e.path[i]!);
      const d2 = unit(e.path[i]!, e.path[i + 1]!);
      if (!d1 || !d2) continue;
      const k = elbowKind(deflection(d1, d2));
      if (k) f[k] += 1;
    }
    // nó de origem
    const parentIdx = tree.parentEdge.get(e.from);
    if (parentIdx === undefined) {
      if (o.entranceAtRoot) f.entrance += 1;
    } else {
      const siblings = tree.childEdges.get(e.from) ?? [];
      const outlets = siblings.length + o.pointsAtNode(e.from);
      const inDir = lastDir(tree.edges[parentIdx]!.path);
      const outDir = firstDir(e.path);
      if (outlets >= 2 && inDir && outDir) {
        // o primeiro filho alinhado é passagem direta; os outros, saída lateral
        const aligned = siblings.filter((s) => {
          const d = firstDir(tree.edges[s]!.path);
          return d !== null && deflection(inDir, d) < 10;
        });
        if (aligned[0] === idx) f.teeStraight += 1;
        else f.teeBranch += 1;
      } else if (inDir && outDir) {
        const k = elbowKind(deflection(inDir, outDir));
        if (k) f[k] += 1;
      }
    }
    if (o.gateDepth > 0 && e.depth <= o.gateDepth) f.gateValve += 1;
    if (o.gateAtLeaf(e.to)) f.gateValve += 1;
    if (o.pressureValveAt(e.to)) f.pressureValve += 1;
  });
  return out;
}
