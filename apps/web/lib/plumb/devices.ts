/**
 * Dispositivos do esgoto inferidos do traçado (o layout só guarda tubos e pontos): caixa sifonada (CS), caixa de gordura
 * (CG), caixa de inspeção na saída (CI) e tubos de queda; e o sentido do escoamento de cada tubo. Segue as mesmas regras
 * do motor (ligação por pontas coincidentes em 3D, raiz = ponta livre mais baixa sem aparelho).
 */
import type { PlumbingLayout, Project } from '@chalecad/engine';
import { dist2, dist3, levelElevation, TOL, type V2, type V3 } from './geometry';
import type { PlumbingK } from './zdefaults';

export type DeviceKind = 'cs' | 'cg' | 'ci';

export interface PlumbDevice {
  kind: DeviceKind;
  xy: V2;
  level: string;
  label: string;
}

export interface SewerInference {
  devices: PlumbDevice[];
  /** `true` = o escoamento segue o sentido do desenho (início -> fim). */
  flowForward: Map<string, boolean>;
}

const isToilet = (f: string) => f.startsWith('toilet');
const isSink = (f: string) => f === 'kitchen_sink';

export function inferSewer(layout: PlumbingLayout, project: Pick<Project, 'levels'>, k: PlumbingK): SewerInference {
  const out: SewerInference = { devices: [], flowForward: new Map() };
  const sewer = layout.pipes.filter((p) => p.system === 'sewer');
  const abs = (p: (typeof sewer)[number], i: number): V3 => {
    const v = p.path[i]!;
    return [v[0], v[1], v[2] + levelElevation(project, p.level)];
  };
  if (sewer.length === 0) return out;

  // nós por coincidência 3D das pontas
  const nodes: { pos: V3; ends: { pipe: number; end: 0 | 1 }[] }[] = [];
  const nodeOf: [number, number][] = sewer.map(() => [-1, -1]);
  sewer.forEach((p, pi) => {
    ([0, 1] as const).forEach((e) => {
      const pos = abs(p, e === 0 ? 0 : p.path.length - 1);
      let id = nodes.findIndex((n) => dist3(n.pos, pos) <= TOL);
      if (id < 0) {
        nodes.push({ pos, ends: [] });
        id = nodes.length - 1;
      }
      nodes[id]!.ends.push({ pipe: pi, end: e });
      nodeOf[pi]![e] = id;
    });
  });
  // aparelhos nos nós
  const terms = new Map<number, string[]>();
  for (const pt of layout.points) {
    const spec = k.water.fixtures[pt.fixture];
    if (!spec || spec.sewerDn === undefined) continue;
    const e = levelElevation(project, pt.level);
    const cand = nodes
      .map((n, i) => ({ n, i }))
      .filter(({ n }) => dist2(n.pos, pt.position) <= TOL && n.pos[2] >= e - 1.5 && n.pos[2] <= e + 1)
      .sort((a, b) => Math.abs(a.n.pos[2] - (e - k.sewer.startDepth)) - Math.abs(b.n.pos[2] - (e - k.sewer.startDepth)))[0];
    if (cand) terms.set(cand.i, [...(terms.get(cand.i) ?? []), pt.fixture]);
  }
  const free = nodes.map((n, i) => ({ n, i })).filter(({ n, i }) => n.ends.length === 1 && !terms.has(i)).sort((a, b) => a.n.pos[2] - b.n.pos[2]);
  const root = free[0]?.i ?? nodes.map((n, i) => ({ n, i })).sort((a, b) => a.n.pos[2] - b.n.pos[2])[0]!.i;

  // busca em largura a partir da raiz
  const parentEdge = new Map<number, { pipe: number; from: number }>();
  const kids = new Map<number, { pipe: number; to: number }[]>();
  const seen = new Set<number>([root]);
  const used = new Set<number>();
  const queue = [root];
  while (queue.length > 0) {
    const u = queue.shift()!;
    for (const e of [...nodes[u]!.ends].sort((a, b) => a.pipe - b.pipe)) {
      if (used.has(e.pipe)) continue;
      used.add(e.pipe);
      const other = nodeOf[e.pipe]![e.end === 0 ? 1 : 0]!;
      if (other === u || seen.has(other)) continue;
      seen.add(other);
      parentEdge.set(other, { pipe: e.pipe, from: u });
      kids.set(u, [...(kids.get(u) ?? []), { pipe: e.pipe, to: other }]);
      // o fluxo vai de `other` (longe da raiz) para `u`: acompanha o desenho quando `u` é a ponta final do tubo
      out.flowForward.set(sewer[e.pipe]!.id, e.end === 1);
      queue.push(other);
    }
  }
  const leaf = (c: { to: number }) => (kids.get(c.to) ?? []).length === 0;
  const bathOnly = (n: number) => (terms.get(n) ?? []).some((f) => !isToilet(f) && !isSink(f));
  const sinkOnly = (n: number) => (terms.get(n) ?? []).some(isSink);
  const xyOf = (n: number): V2 => [nodes[n]!.pos[0], nodes[n]!.pos[1]];
  const levelOfNode = (n: number): string => sewer[nodes[n]!.ends[0]!.pipe]!.level;
  let cs = 0;
  let cg = 0;
  for (const n of seen) {
    if (n === root) continue;
    const ks = kids.get(n) ?? [];
    if (ks.some((c) => leaf(c) && bathOnly(c.to))) out.devices.push({ kind: 'cs', xy: xyOf(n), level: levelOfNode(n), label: `CS-${++cs}` });
    else if (ks.length === 1 && leaf(ks[0]!) && sinkOnly(ks[0]!.to) && !terms.has(n)) out.devices.push({ kind: 'cg', xy: xyOf(n), level: levelOfNode(n), label: `CG-${++cg}` });
  }
  out.devices.push({ kind: 'ci', xy: xyOf(root), level: levelOfNode(root), label: 'CI · saída' });
  return out;
}
