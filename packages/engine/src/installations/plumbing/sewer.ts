import { roofBelowAt } from '../../model/rooms';
import type { EngineWarning, PlumbingLayout, SewerPipeResult } from '../../schema/results';
import { LOCAL, type Ctx, type FixtureSpec } from './context';
import { inferFittings } from './fittings';
import { buildGraph, nodesAtXY, rootTree, type AbsPipe, type RawGraph, type Tree } from './graph';
import { absPipes } from './network';
import { dist2, horizontalLength, verticalDrop, type V3 } from './vec';

export interface SewerOutput {
  results: SewerPipeResult[];
  totalUhc: number;
  vented: boolean;
  warnings: EngineWarning[];
  devices: { siphonBoxes: number; greaseTraps: number; inspectionBoxes: number };
  /** Joelhos e tês/junções (esgoto e ligação da ventilação), para o orçamento. */
  fittings: { elbows: number; tees: number };
  /** Comprimento e DN finais por tubo (itens do orçamento). */
  lengths: { pipeId: string; system: 'sewer' | 'vent'; dn: number; length: number }[];
}

interface Term {
  pointId: string;
  fixture: string;
  spec: FixtureSpec;
  node: number;
}

const isToilet = (fixture: string) => fixture.startsWith('toilet');
const isSink = (fixture: string) => fixture === 'kitchen_sink';
const fmt1 = (n: number) => n.toFixed(1).replace('.', ',');

/** Menor DN da tabela (UHC máx. por DN) que comporta `uhc`; o maior se nenhum comporta. */
export function dnForUhc(table: Record<string, number>, uhc: number): number {
  const rows = Object.entries(table)
    .map(([dn, max]) => [Number(dn), max] as const)
    .sort((a, b) => a[0] - b[0]);
  return (rows.find((r) => r[1] >= uhc - 1e-9) ?? rows[rows.length - 1]!)[0];
}

export function minSlopeFor(ctx: Ctx, dn: number): number {
  return dn <= 75 ? ctx.k.sewer.slopeMin.upTo75 : ctx.k.sewer.slopeMin.from100;
}

/** Esgoto e ventilação: UHC, DN, declividade, cotas, desconectores, ventilação e dispositivos inferidos. */
export function computeSewer(ctx: Ctx, layout: PlumbingLayout): SewerOutput {
  const k = ctx.k.sewer;
  const warnings: EngineWarning[] = [];
  const results: SewerPipeResult[] = [];
  const lengths: SewerOutput['lengths'] = [];
  const devices = { siphonBoxes: 0, greaseTraps: 0, inspectionBoxes: 0 };
  const fixtures = layout.points
    .map((p) => ({ p, spec: ctx.k.water.fixtures[p.fixture] as FixtureSpec | undefined }))
    .filter((x): x is { p: (typeof layout.points)[number]; spec: FixtureSpec } => x.spec !== undefined && x.spec.sewerDn !== undefined);
  const totalUhc = fixtures.reduce((s, f) => s + f.spec.uhc, 0);
  const pipes = absPipes(ctx, layout, ['sewer']);
  const ventPipes = absPipes(ctx, layout, ['vent']);
  const fittingsOut = { elbows: 0, tees: 0 };
  if (pipes.length === 0) return { results, totalUhc, vented: false, warnings, devices, fittings: fittingsOut, lengths };

  const g = buildGraph(pipes);
  // raiz: ponta livre sem aparelho, a mais baixa (saída do esgoto)
  const termNodes = new Map<number, Term[]>();
  const lost: string[] = [];
  const startDepth = k.startDepth;
  for (const f of fixtures) {
    const e = ctx.elev(f.p.level);
    const cand = nodesAtXY(g, f.p.position)
      .filter((n) => n.pos[2] >= e - 1.5 && n.pos[2] <= e + 1.0)
      .sort((a, b) => Math.abs(a.pos[2] - (e - startDepth)) - Math.abs(b.pos[2] - (e - startDepth)));
    const n = cand[0];
    if (!n) lost.push(f.p.id);
    else termNodes.set(n.id, [...(termNodes.get(n.id) ?? []), { pointId: f.p.id, fixture: f.p.fixture, spec: f.spec, node: n.id }]);
  }
  const free = g.nodes.filter((n) => n.ends.length === 1 && !termNodes.has(n.id)).sort((a, b) => a.pos[2] - b.pos[2]);
  const rootNode = free[0]?.id ?? g.nodes.slice().sort((a, b) => a.pos[2] - b.pos[2])[0]!.id;
  const tree = rootTree(g, pipes, rootNode);
  for (const t of [...termNodes.keys()]) {
    if (tree.reached.has(t)) continue;
    for (const x of termNodes.get(t)!) lost.push(x.pointId);
    termNodes.delete(t);
  }
  for (const id of lost) {
    warnings.push({ code: 'sewer.disconnected', severity: 'warn', message: 'Aparelho sem ligação ao esgoto: ligue o tubo ao ponto até a saída da casa', refs: [id] });
  }

  const n = tree.edges.length;
  const termAt = (node: number) => termNodes.get(node) ?? [];
  const children = (node: number) => tree.childEdges.get(node) ?? [];

  // UHC e bacia a montante (pós-ordem)
  const uhc = new Array<number>(n).fill(0);
  const toiletUp = new Array<boolean>(n).fill(false);
  for (let i = n - 1; i >= 0; i--) {
    const e = tree.edges[i]!;
    for (const t of termAt(e.to)) {
      uhc[i]! += t.spec.uhc;
      if (isToilet(t.fixture)) toiletUp[i] = true;
    }
    for (const c of children(e.to)) {
      uhc[i]! += uhc[c]!;
      if (toiletUp[c]) toiletUp[i] = true;
    }
  }

  // desconectores inferidos: caixa sifonada (pontas de aparelhos de banho/serviço chegam num nó) e caixa de gordura
  const leaf = (c: number) => children(tree.edges[c]!.to).length === 0;
  const csNodes = new Set<number>();
  const greaseNodes = new Set<number>();
  const toiletInCs: number[] = [];
  const sinksWithoutTrap: Term[] = [];
  for (const node of tree.reached) {
    const kids = children(node);
    const bathLeaves = kids.filter((c) => leaf(c) && termAt(tree.edges[c]!.to).some((t) => !isToilet(t.fixture) && !isSink(t.fixture)));
    if (bathLeaves.length > 0 && tree.parentEdge.has(node)) {
      csNodes.add(node);
      const toiletHere = termAt(node).some((t) => isToilet(t.fixture)) || kids.some((c) => leaf(c) && termAt(tree.edges[c]!.to).some((t) => isToilet(t.fixture)));
      if (toiletHere) toiletInCs.push(node);
    }
    const sinkLeaves = kids.filter((c) => leaf(c) && termAt(tree.edges[c]!.to).some((t) => isSink(t.fixture)));
    if (sinkLeaves.length > 0) {
      const dedicated = kids.length === sinkLeaves.length && sinkLeaves.length === 1 && termAt(node).length === 0 && tree.parentEdge.has(node);
      if (dedicated) greaseNodes.add(node);
      else for (const c of sinkLeaves) for (const t of termAt(tree.edges[c]!.to)) if (isSink(t.fixture)) sinkWarn(t);
    }
  }
  function sinkWarn(t: Term) {
    sinksWithoutTrap.push(t);
  }
  // pia no próprio nó (sem tubo de ramal) também precisa de caixa de gordura
  for (const [node, ts] of termNodes) for (const t of ts) if (isSink(t.fixture) && !greaseNodes.has(node) && !sinksWithoutTrap.includes(t)) {
    const parent = tree.parentEdge.get(node);
    const sole = parent !== undefined && children(node).length === 0;
    if (!sole) sinksWithoutTrap.push(t);
  }
  devices.siphonBoxes = csNodes.size;
  devices.greaseTraps = greaseNodes.size;

  // DN (pós-ordem: montante ≥ jusante... no esgoto o DN não diminui no sentido do escoamento, que é para a raiz)
  const dn = new Array<number>(n).fill(0);
  const locked = new Array<boolean>(n).fill(false);
  const stack = new Array<boolean>(n).fill(false);
  const need = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const e = tree.edges[i]!;
    const path = e.path;
    const horiz = horizontalLength(path);
    const vert = Math.abs(path[0]![2] - path[path.length - 1]![2]);
    stack[i] = vert > 0.3 && vert > horiz;
  }
  // do upstream para o downstream: o DN do tubo é ≥ o DN de qualquer filho (que está a montante no fluxo)
  for (let i = n - 1; i >= 0; i--) {
    const e = tree.edges[i]!;
    const table = stack[i] ? k.stackMaxUhc : k.branchMaxUhc;
    let req = dnForUhc(table, uhc[i]!);
    for (const t of termAt(e.to)) req = Math.max(req, t.spec.sewerDn ?? 0);
    if (toiletUp[i]) req = Math.max(req, 100);
    if (csNodes.has(e.to)) req = Math.max(req, 50);
    if (greaseNodes.has(e.to)) req = Math.max(req, 75);
    need[i] = req;
    const user = pipes[e.pipe]!.dn;
    let d = user ?? req;
    if (user !== undefined) locked[i] = true;
    else for (const c of children(e.to)) d = Math.max(d, dn[c]!);
    dn[i] = d;
  }

  // cotas e declividade (pós-ordem: do ponto mais alto para a saída)
  const slope = new Array<number>(n).fill(0);
  const zUp = new Array<number>(n).fill(0);
  const zDown = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    const e = tree.edges[i]!;
    const rev = [...e.path].reverse() as V3[]; // sentido do escoamento: do nó `to` para o nó `from`
    const own = rev[0]![2];
    let z = own;
    for (const c of children(e.to)) z = Math.min(z, zDown[c]!);
    zUp[i] = z;
    const s = pipes[e.pipe]!.slope ?? (stack[i] ? 0 : minSlopeFor(ctx, dn[i]!));
    slope[i] = s;
    zDown[i] = z - s * horizontalLength(rev) - verticalDrop(rev);
  }

  // avisos por tubo
  const refsOf = (i: number) => [pipes[tree.edges[i]!.pipe]!.id];
  for (let i = 0; i < n; i++) {
    const e = tree.edges[i]!;
    const id = pipes[e.pipe]!.id;
    const toiletHere = termAt(e.to).some((t) => isToilet(t.fixture));
    if (toiletHere && dn[i]! < 100) {
      warnings.push({ code: 'sewer.toilet_dn', severity: 'error', message: `Ramal da bacia sanitária com DN ${dn[i]}: use DN 100 (NBR 8160)`, refs: refsOf(i) });
    }
    const table = stack[i] ? k.stackMaxUhc : k.branchMaxUhc;
    const cap = table[String(dn[i])];
    if (cap !== undefined && uhc[i]! > cap + 1e-9) {
      warnings.push({
        code: 'sewer.uhc_exceeded',
        severity: 'error',
        message: `Tubo ${id} recebe ${fmt1(uhc[i]!)} UHC, mais que os ${cap} do DN ${dn[i]}: aumente o diâmetro`,
        refs: refsOf(i),
      });
    }
    for (const c of children(e.to)) {
      if (dn[c]! > dn[i]!) {
        warnings.push({ code: 'sewer.dn_reduction', severity: 'error', message: `O DN diminui no sentido do escoamento em ${id} (DN ${dn[c]} para ${dn[i]}): não reduza o diâmetro`, refs: [id, pipes[tree.edges[c]!.pipe]!.id] });
      }
    }
    if (!stack[i]) {
      const min = minSlopeFor(ctx, dn[i]!);
      if (slope[i]! < min - 1e-9) {
        warnings.push({ code: 'sewer.slope', severity: 'error', message: `Declividade de ${fmt1(slope[i]! * 100)}% em ${id}, abaixo do mínimo de ${fmt1(min * 100)}% para DN ${dn[i]}`, refs: refsOf(i) });
      } else if (slope[i]! > k.slopeMax + 1e-9) {
        warnings.push({ code: 'sewer.slope', severity: 'warn', message: `Declividade de ${fmt1(slope[i]! * 100)}% em ${id}, acima do máximo recomendado de ${fmt1(k.slopeMax * 100)}%`, refs: refsOf(i) });
      }
    }
  }
  for (const node of csNodes) {
    // a caixa sifonada recebe só os aparelhos que descarregam nela (o tubo de saída pode levar mais, a montante)
    const into = children(node)
      .filter((c) => leaf(c) && termAt(tree.edges[c]!.to).some((t) => !isToilet(t.fixture) && !isSink(t.fixture)))
      .reduce((s, c) => s + termAt(tree.edges[c]!.to).filter((t) => !isToilet(t.fixture) && !isSink(t.fixture)).reduce((a, t) => a + t.spec.uhc, 0), 0);
    if (into > k.siphonBoxMaxUhc + 1e-9) {
      const pe = tree.parentEdge.get(node)!;
      warnings.push({ code: 'sewer.uhc_exceeded', severity: 'warn', message: `Caixa sifonada recebe ${fmt1(into)} UHC, mais que os ${k.siphonBoxMaxUhc} da caixa DN 100: divida os aparelhos`, refs: refsOf(pe) });
    }
  }
  for (const node of toiletInCs) {
    warnings.push({ code: 'sewer.toilet_in_siphon_box', severity: 'error', message: 'A bacia sanitária não pode descarregar em caixa sifonada: ligue direto ao ramal DN 100', refs: [`node:${node}`] });
  }
  for (const t of sinksWithoutTrap) {
    warnings.push({ code: 'sewer.grease_trap', severity: 'warn', message: 'Pia de cozinha sem caixa de gordura: passe o ramal por uma caixa de gordura antes de ligar à rede', refs: [t.pointId] });
  }
  // profundidade da saída
  const rootEdges = children(tree.root);
  const groundZ = Math.min(...ctx.project.levels.map((l) => l.elevation));
  for (const r of rootEdges) {
    if (groundZ - zDown[r]! > k.inspection.maxDepth + 1e-9) {
      warnings.push({ code: 'sewer.inspection_depth', severity: 'warn', message: `Esgoto sai a ${fmt1(groundZ - zDown[r]!)} m de profundidade (máx. ${fmt1(k.inspection.maxDepth)} m para caixa de inspeção): reduza o percurso ou aumente a declividade`, refs: refsOf(r) });
    }
  }

  // ventilação
  const vent = computeVent(ctx, g, tree, ventPipes, uhc, tree.edges, totalUhc);
  const vented = vent.vented;
  if (!vented) {
    warnings.push({ code: 'sewer.no_vent', severity: 'error', message: `Nenhum tubo ventilador ligado ao esgoto que passe pelo menos ${fmt1(k.ventTerminalAboveRoof)} m acima do telhado`, refs: [] });
  }
  const distance = (node: number): number => vent.dist.get(node) ?? Infinity;
  const checkVent = (node: number, dnLimit: number, what: string, ref: string) => {
    const lim = k.ventMaxDistance[String(dnLimit)] ?? k.ventMaxDistance['100']!;
    const d = distance(node);
    if (vented && d > lim + 1e-9) {
      warnings.push({
        code: 'sewer.vent_distance',
        severity: 'warn',
        message: `${what} a ${Number.isFinite(d) ? fmt1(d) : 'mais de 50'} m do tubo ventilador (máx. ${fmt1(lim)} m para DN ${dnLimit}, NBR 8160)`,
        refs: [ref],
      });
    }
  };
  for (const [node, ts] of termNodes) for (const t of ts) if (isToilet(t.fixture)) checkVent(node, 100, 'Sifão da bacia', t.pointId);
  for (const node of csNodes) {
    const pe = tree.parentEdge.get(node)!;
    checkVent(node, dn[pe]!, 'Caixa sifonada', pipes[tree.edges[pe]!.pipe]!.id);
  }
  for (const node of greaseNodes) {
    const pe = tree.parentEdge.get(node)!;
    checkVent(node, dn[pe]!, 'Caixa de gordura', pipes[tree.edges[pe]!.pipe]!.id);
  }

  // caixas de inspeção: saída + junções enterradas
  const buried = (node: number) => g.nodes[node]!.pos[2] < groundZ - 1e-9;
  let ci = 1; // na saída
  for (const node of tree.reached) {
    if (node === tree.root || csNodes.has(node) || greaseNodes.has(node)) continue;
    if (buried(node) && children(node).length >= 2) ci += 1;
  }
  devices.inspectionBoxes = ci;

  // resultados na ordem dos tubos
  const idxOfPipe = new Map(tree.edges.map((e, i) => [e.pipe, i]));
  pipes.forEach((p, pi) => {
    const i = idxOfPipe.get(pi);
    if (i === undefined) return;
    results.push({ pipeId: p.id, system: 'sewer', uhc: uhc[i]!, dn: dn[i]!, slope: slope[i]!, zFrom: zUp[i]!, zTo: zDown[i]! });
    lengths.push({ pipeId: p.id, system: 'sewer', dn: dn[i]!, length: tree.edges[i]!.length });
  });
  for (const v of vent.results) {
    results.push(v.result);
    lengths.push({ pipeId: v.result.pipeId, system: 'vent', dn: v.result.dn, length: v.length });
  }
  warnings.push(...vent.warnings);
  const fits = inferFittings({
    tree,
    pointsAtNode: (node) => termAt(node).length,
    pressureValveAt: () => false,
    gateAtLeaf: () => false,
    gateDepth: 0,
    entranceAtRoot: false,
  });
  for (const f of fits) {
    fittingsOut.elbows += f.elbow90 + f.elbow45;
    fittingsOut.tees += f.teeStraight + f.teeBranch;
  }
  fittingsOut.tees += vent.results.length;
  return { results, totalUhc, vented, warnings, devices, fittings: fittingsOut, lengths };
}

interface VentOut {
  vented: boolean;
  dist: Map<number, number>;
  results: { result: SewerPipeResult; length: number }[];
  warnings: EngineWarning[];
}

/** Tubos ventiladores: ligam ao esgoto por coincidência em planta; terminal acima do telhado; distância pela árvore. */
function computeVent(ctx: Ctx, g: RawGraph, tree: Tree, vent: AbsPipe[], uhc: number[], edges: Tree['edges'], totalUhc: number): VentOut {
  const k = ctx.k.sewer;
  const out: VentOut = { vented: false, dist: new Map(), results: [], warnings: [] };
  const sources: number[] = [];
  for (const v of vent) {
    const ends: V3[] = [v.path[0]!, v.path[v.path.length - 1]!];
    let conn: { node: number; top: V3; bottom: V3 } | null = null;
    ends.forEach((end, idx) => {
      const top = ends[1 - idx]!;
      const cand = g.nodes.filter((nd) => tree.reached.has(nd.id) && dist2(nd.pos, end) <= LOCAL.tol).sort((a, b) => Math.abs(a.pos[2] - end[2]) - Math.abs(b.pos[2] - end[2]))[0];
      if (cand && (!conn || top[2] > conn.top[2])) conn = { node: cand.id, top, bottom: end };
    });
    const length = (() => {
      let s = 0;
      for (let i = 1; i < v.path.length; i++) s += Math.hypot(v.path[i]![0] - v.path[i - 1]![0], v.path[i]![1] - v.path[i - 1]![1], v.path[i]![2] - v.path[i - 1]![2]);
      return s;
    })();
    if (!conn) continue;
    const c: { node: number; top: V3; bottom: V3 } = conn;
    const roof = roofBelowAt(ctx.model.roofPlanes, [c.top[0], c.top[1]]);
    const needZ = roof === null ? c.bottom[2] + LOCAL.ventFallbackRise : roof + k.ventTerminalAboveRoof;
    const topOk = c.top[2] >= needZ - 1e-6;
    if (topOk) {
      out.vented = true;
      sources.push(c.node);
    } else {
      out.warnings.push({
        code: 'sewer.vent_terminal',
        severity: 'warn',
        message: `Terminal do ventilador ${v.id} a ${(c.top[2] - (roof ?? c.bottom[2])).toFixed(2).replace('.', ',')} m do telhado: suba até pelo menos ${k.ventTerminalAboveRoof.toFixed(2).replace('.', ',')} m acima`,
        refs: [v.id],
      });
    }
    // DN: grupo com bacia até 17 UHC = 50; acima = 75 (NBR 8160 Tab. 9). UHC servido = subárvore da ligação.
    const e = tree.parentEdge.get(c.node);
    const served = e === undefined ? totalUhc : uhc[e]!;
    const dn = v.dn ?? (served > LOCAL.ventDn.splitUhc ? LOCAL.ventDn.large : LOCAL.ventDn.small);
    out.results.push({ result: { pipeId: v.id, system: 'vent', uhc: served, dn, slope: 0, zFrom: c.bottom[2], zTo: c.top[2] }, length });
  }
  // distância pela árvore (comprimento dos tubos) até o ventilador mais próximo
  const adj = new Map<number, { to: number; len: number }[]>();
  for (const e of edges) {
    adj.set(e.from, [...(adj.get(e.from) ?? []), { to: e.to, len: e.length }]);
    adj.set(e.to, [...(adj.get(e.to) ?? []), { to: e.from, len: e.length }]);
  }
  const queue: number[] = [];
  for (const s of sources) {
    out.dist.set(s, 0);
    queue.push(s);
  }
  while (queue.length > 0) {
    queue.sort((a, b) => out.dist.get(a)! - out.dist.get(b)!);
    const u = queue.shift()!;
    for (const a of adj.get(u) ?? []) {
      const d = out.dist.get(u)! + a.len;
      if (d < (out.dist.get(a.to) ?? Infinity) - 1e-9) {
        out.dist.set(a.to, d);
        queue.push(a.to);
      }
    }
  }
  return out;
}
