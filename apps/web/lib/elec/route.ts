/**
 * "Rotear automaticamente" para o traçado desenhado: árvore mínima (Prim, distância ortogonal) por circuito, a partir
 * do quadro, com trechos em L pelo forro. Cada trecho vira um eletroduto cujas pontas caem sobre os pontos (a menos
 * de 0,3 m o motor conecta). É o roteador simples da interface; o gerador do motor (que divide em caixas de
 * passagem pelo limite de 15 m e 3 curvas) só vale no traçado automático.
 */
import type { Conduit, ElecPoint, Vec2 } from '@chalecad/engine';

const manhattan = (a: Vec2, b: Vec2) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

/** Trecho em L: a curva fica no eixo de maior deslocamento primeiro. */
export function lPath(a: Vec2, b: Vec2): Vec2[] {
  if (Math.abs(a[0] - b[0]) < 0.01 || Math.abs(a[1] - b[1]) < 0.01) return [a, b];
  const corner: Vec2 = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? [b[0], a[1]] : [a[0], b[1]];
  return [a, corner, b];
}

export interface RouteInput {
  points: ElecPoint[];
  panel: { level: string; position: Vec2 };
  /** Gerador de ids dos eletrodutos novos. */
  newId: () => string;
}

export function routeConduits(input: RouteInput): Conduit[] {
  const out: Conduit[] = [];
  const levels = [...new Set(input.points.map((p) => p.level))];
  for (const level of levels) {
    const here = input.points.filter((p) => p.level === level && p.kind !== 'data');
    const groups = new Map<string, ElecPoint[]>();
    for (const p of here) {
      const key = p.circuitId ?? '-';
      groups.set(key, [...(groups.get(key) ?? []), p]);
    }
    for (const pts of groups.values()) {
      // raiz: o quadro (no nível dele) ou o ponto mais próximo do quadro (outros níveis: o motor liga o prumo)
      const nodes: Vec2[] = pts.map((p) => p.position);
      const root: Vec2 = level === input.panel.level ? input.panel.position : nodes.reduce((a, b) => (manhattan(b, input.panel.position) < manhattan(a, input.panel.position) ? b : a));
      const inTree: Vec2[] = [root];
      const rest = nodes.filter((n) => manhattan(n, root) > 0.02);
      while (rest.length > 0) {
        let bi = 0;
        let bp: Vec2 = inTree[0]!;
        let bd = Infinity;
        for (let i = 0; i < rest.length; i++)
          for (const t of inTree) {
            const d = manhattan(rest[i]!, t);
            if (d < bd) {
              bd = d;
              bi = i;
              bp = t;
            }
          }
        const n = rest.splice(bi, 1)[0]!;
        out.push({ id: input.newId(), level, path: lPath(bp, n), run: 'ceiling' });
        inTree.push(n);
      }
    }
  }
  return out;
}

/** Pontos que nenhum eletroduto toca (a menos de 0,3 m de um vértice ou trecho): serve de verificação. */
export function unreachedPoints(points: ElecPoint[], conduits: Conduit[], tol = 0.3): string[] {
  const near = (p: Vec2, a: Vec2, b: Vec2) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)) <= tol;
  };
  return points
    .filter((p) => p.kind !== 'data' && !conduits.some((c) => c.level === p.level && c.path.some((v, i) => i > 0 && near(p.position, c.path[i - 1]!, v))))
    .map((p) => p.id);
}
