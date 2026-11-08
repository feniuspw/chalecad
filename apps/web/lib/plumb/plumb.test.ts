import { beforeAll, describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { getCatalog } from '@chalecad/catalog';
import { computeAll, roofBelowAt, type Pipe, type PlumbingLayout, type Project, type Results } from '@chalecad/engine';
import { DEFAULT_ANSWERS } from '../project/wizard/answers';
import { generateProject } from '../project/wizard/generate';
import { inferSewer } from './devices';
import { hitTest } from './hit';
import { liveLayout } from './live';
import { addPipe, addPoint, autoRoute, backToAuto, deletePipe, ensureManual, horizontalRunZ, moveNode, movePoint, moveTank, patchPipe, raiseTankToMeet, requiredRise, setPipeZ, setTankBottom } from './ops';
import { pressureRows, sealMissing, sealRows, sealText } from './report';
import { snapPipe, splitPipe } from './snap';
import { buildPipePath, defaultSlope, sewerStartZ, waterZ, type PlumbEnv } from './zdefaults';
import type { V3 } from './geometry';

const catalog = getCatalog();
const k = catalog.constants.plumbing;
let base: Project;
let results: Results;

const withPlumbing = (p: Project): Project => {
  const q = structuredClone(p);
  q.installations.enabled = true;
  return q;
};
const envOf = (project: Project, res: Results, levelId = 'L0'): PlumbEnv => ({ project, model: res.model, layout: liveLayout(project, res.installations!.plumbing!)!, k, levelId });
const compute = (p: Project) => computeAll(p, catalog);
let ids = 0;
const newId = () => `t-${++ids}`;

beforeAll(() => {
  base = withPlumbing(generateProject({ ...DEFAULT_ANSWERS, style: 'gable', bedrooms: 2, mezzanine: 'sleep', bathUp: true }).project);
  results = compute(base);
});

describe('traçado gerado: ponto de partida', () => {
  it('o modelo de teste tem caixa na torre, banheiro no mezanino e pressão calculada por ponto', () => {
    const pl = results.installations!.plumbing!;
    expect(pl.layout.tank.towerId).toBeTruthy();
    expect(pl.layout.points.some((p) => p.level === 'L1')).toBe(true);
    expect(pl.water.points.length).toBeGreaterThan(4);
    const rows = pressureRows(pl, base, k);
    expect(rows.every((r) => Number.isFinite(r.mca) && r.minMca > 0)).toBe(true);
    expect(sealRows(rows).size).toBe(new Set(rows.map((r) => r.pointId)).size);
  });

  it('infere caixa sifonada, caixa de gordura e a caixa de inspeção da saída', () => {
    const pl = results.installations!.plumbing!;
    const inf = inferSewer(pl.layout, base, k);
    const kinds = inf.devices.map((d) => d.kind);
    expect(kinds).toContain('cs');
    expect(kinds).toContain('cg');
    expect(kinds.filter((x) => x === 'ci')).toHaveLength(1);
    // todo tubo ligado à saída tem sentido de escoamento
    expect(inf.flowForward.size).toBeGreaterThan(5);
  });
});

describe('cotas padrão por sistema', () => {
  it('água: forro menos 10 cm (pé-direito do cômodo)', () => {
    const env = envOf(base, results);
    const bath = results.model.rooms.find((r) => r.use === 'bathroom' && r.level === 'L0')!;
    const c = bath.polygon!.reduce((a, p) => [a[0] + p[0] / bath.polygon!.length, a[1] + p[1] / bath.polygon!.length], [0, 0]) as [number, number];
    expect(waterZ(env, c)).toBeCloseTo(bath.ceiling.min - 0.1, 6);
    const path = buildPipePath('cold', [{ xy: c }, { xy: [c[0] + 1, c[1]] }], env);
    expect(path.map((v) => v[2])).toEqual([waterZ(env, c), waterZ(env, [c[0] + 1, c[1]])]);
  });

  it('água que termina num ponto desce na vertical até a altura do aparelho', () => {
    const env = envOf(base, results);
    const pt = env.layout.points.find((p) => p.fixture === 'lavatory' && p.level === 'L0')!;
    const snap = snapPipe([pt.position[0] + 0.03, pt.position[1]], 'cold', env, 0.15)!;
    expect(snap.kind).toBe('point');
    expect(snap.z).toBe(k.water.fixtures.lavatory!.waterH);
    const start: [number, number] = [pt.position[0] + 1, pt.position[1]];
    const path = buildPipePath('cold', [{ xy: start }, { xy: snap.xy, snap }], env);
    expect(path).toHaveLength(3);
    expect(path[1]![2]).toBeCloseTo(waterZ(env, snap.xy), 6);
    expect(path[2]).toEqual([snap.xy[0], snap.xy[1], 0.6]);
  });

  it('esgoto: sob o piso, descendo pela declividade do DN (2% até 75, 1% de 100)', () => {
    const env = envOf(base, results);
    expect(defaultSlope(k, 50)).toBe(0.02);
    expect(defaultSlope(k, 100)).toBe(0.01);
    const path = buildPipePath('sewer', [{ xy: [0, 0] }, { xy: [2, 0] }, { xy: [2, 3] }], env, { dn: 100 });
    expect(path[0]![2]).toBeCloseTo(sewerStartZ(env), 6);
    expect(path[1]![2]).toBeCloseTo(sewerStartZ(env) - 0.02, 6);
    expect(path[2]![2]).toBeCloseTo(sewerStartZ(env) - 0.05, 6);
    expect(sewerStartZ(env)).toBe(-k.sewer.startDepth);
    // as duas pontas com cota: interpola
    const a = buildPipePath('sewer', [{ xy: [0, 0], snap: { xy: [0, 0], kind: 'end', z: -0.3 } }, { xy: [4, 0], snap: { xy: [4, 0], kind: 'end', z: -0.34 } }], env);
    expect(a.map((v) => v[2])).toEqual([-0.3, -0.34]);
    // só a ponta final conhecida: a montante sobe
    const b = buildPipePath('sewer', [{ xy: [0, 0] }, { xy: [2, 0], snap: { xy: [2, 0], kind: 'end', z: -0.5 } }], env);
    expect(b[0]![2]).toBeCloseTo(-0.5 + 0.04, 6);
  });

  it('ventilação sobe do esgoto até 30 cm acima do telhado', () => {
    const env = envOf(base, results);
    const sewer = env.layout.pipes.find((p) => p.system === 'sewer' && p.level === 'L0')!;
    const at = sewer.path[0]!;
    const path = buildPipePath('vent', [{ xy: [at[0], at[1]], snap: { xy: [at[0], at[1]], kind: 'end', z: at[2] } }], env);
    expect(path).toHaveLength(2);
    expect(path[0]![2]).toBe(at[2]);
    const roof = roofBelowAt(results.model.roofPlanes, [at[0], at[1]])!;
    expect(path[1]![2]).toBeGreaterThanOrEqual(roof + k.sewer.ventTerminalAboveRoof - 1e-9);
  });
});

describe('snap do tubo e divisão de trecho', () => {
  it('a ponta de outro tubo atrai (ponta) e leva a cota dela', () => {
    const env = envOf(base, results);
    const pipe = env.layout.pipes.find((p) => p.system === 'cold' && p.level === 'L0' && p.path.length >= 3)!;
    const end = pipe.path[pipe.path.length - 1]!;
    const s = snapPipe([end[0] + 0.05, end[1] - 0.03], 'cold', { ...env, layout: { ...env.layout, points: [] } }, 0.2)!;
    expect(['end', 'segment']).toContain(s.kind);
    expect(s.z).toBeDefined();
  });

  it('o meio de um trecho vira ligação (segment) com a cota interpolada; esgoto não liga em água', () => {
    const env = envOf(base, results);
    const pipe = env.layout.pipes.find((p) => p.system === 'sewer' && p.level === 'L0' && p.path.length >= 2 && Math.hypot(p.path[1]![0] - p.path[0]![0], p.path[1]![1] - p.path[0]![1]) > 1)!;
    const a = pipe.path[0]!;
    const b = pipe.path[1]!;
    const m: [number, number] = [(a[0] + b[0]) / 2 + 0.02, (a[1] + b[1]) / 2 + 0.02];
    const noPts = { ...env, layout: { ...env.layout, points: [] } };
    const s = snapPipe(m, 'sewer', noPts, 0.1)!;
    expect(s.kind).toBe('segment');
    expect(s.z!).toBeCloseTo((a[2] + b[2]) / 2, 2);
    expect(snapPipe(m, 'cold', noPts, 0.05)?.pipeId).not.toBe(pipe.id);
  });

  it('splitPipe: divide em dois tubos com as mesmas propriedades e as pontas coincidem', () => {
    const pipes: Pipe[] = [{ id: 'a', system: 'cold', level: 'L0', path: [[0, 0, 2], [4, 0, 2], [4, 3, 2]], dn: 25 }];
    const second = splitPipe(pipes, 'a', 0, [1.5, 0, 2], 'b');
    expect(second).toBe('b');
    expect(pipes).toHaveLength(2);
    expect(pipes[0]!.path).toEqual([[0, 0, 2], [1.5, 0, 2]]);
    expect(pipes[1]!.path).toEqual([[1.5, 0, 2], [4, 0, 2], [4, 3, 2]]);
    expect(pipes[1]!.dn).toBe(25);
    // numa ponta ou vértice existente: não divide de novo
    expect(splitPipe(pipes, 'b', 0, [4, 0, 2], 'c')).toBe('c');
    expect(splitPipe(pipes, 'a', 0, [0, 0, 2], 'd')).toBeNull();
    expect(pipes).toHaveLength(3);
  });
});

describe('ligação na caixa', () => {
  it('o tubo que sai da caixa nasce na cota do fundo e o motor o liga à raiz', () => {
    const pl = results.installations!.plumbing!;
    const env = envOf(base, results);
    const t = pl.layout.tank;
    const s = snapPipe([t.position[0] + 0.05, t.position[1]], 'cold', { ...env, layout: { ...env.layout, points: [] } }, 0.2)!;
    expect(s.kind).toBe('tank');
    expect(s.z).toBeCloseTo(t.bottomZ, 6);
    const pt = pl.layout.points.find((p) => p.fixture === 'lavatory' && p.level === 'L0')!;
    const end = snapPipe(pt.position as [number, number], 'cold', env, 0.1)!;
    // só a tubulação nova: o motor deve achar a raiz e ligar o ponto
    const only = produce(base, (d) => {
      ensureManual(d, pl.layout);
      d.installations.plumbing.pipes = d.installations.plumbing.pipes.filter((p) => p.system !== 'cold');
      addPipe(d, { system: 'cold', env, newId, verts: [{ xy: s.xy, snap: s }, { xy: end.xy, snap: end }] });
    });
    const r = compute(only).installations!.plumbing!;
    expect(r.water.points.find((p) => p.pointId === pt.id)).toBeTruthy();
  });
});

describe('edição manual', () => {
  it('a primeira edição copia o traçado efetivo para o projeto com manual: true', () => {
    const pl = results.installations!.plumbing!;
    const next = produce(base, (d) => {
      expect(ensureManual(d, pl.layout)).toBe(true);
      expect(ensureManual(d, pl.layout)).toBe(false);
    });
    const m = next.installations.plumbing;
    expect(m.manual).toBe(true);
    expect(m.pipes).toEqual(pl.layout.pipes);
    expect(m.points).toEqual(pl.layout.points);
    expect(m.tank?.bottomZ).toBe(pl.layout.tank.bottomZ);
    // o motor aceita e dá o mesmo resultado
    const again = compute(next).installations!.plumbing!;
    expect(again.water.points.map((p) => p.dynamicHead.toFixed(6))).toEqual(pl.water.points.map((p) => p.dynamicHead.toFixed(6)));
    // "Gerar automaticamente" volta a manual: false
    expect(produce(next, (d) => backToAuto(d)).installations.plumbing).toMatchObject({ manual: false, pipes: [], points: [] });
  });

  it('desenhar um tubo que termina no meio de outro divide o outro e o ponto fica ligado', () => {
    const pl = results.installations!.plumbing!;
    const sink = pl.layout.points.find((p) => p.fixture === 'kitchen_sink')!;
    const subId = pl.water.points.find((p) => p.pointId === sink.id)!.path.at(-1)!;
    // apaga o sub-ramal do ponto: fica desconectado
    const cut = produce(base, (d) => {
      deletePipe(d, pl.layout, subId);
    });
    const r0 = compute(cut);
    expect(r0.warnings.some((w) => w.code === 'water.disconnected' && w.refs?.includes(sink.id))).toBe(true);
    // redesenha: começa no meio da coluna e termina no ponto
    const env = envOf(cut, r0, sink.level);
    const col = env.layout.pipes.filter((p) => p.system === 'cold' && p.level === sink.level && p.id !== subId);
    // trecho horizontal da coluna do ambiente mais perto do ponto
    let best: { snapAt: [number, number]; pipe: Pipe } | null = null;
    for (const p of col) {
      for (let i = 0; i + 1 < p.path.length; i++) {
        const a = p.path[i]!;
        const b = p.path[i + 1]!;
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.6) continue;
        const at: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (!best || Math.hypot(at[0] - sink.position[0], at[1] - sink.position[1]) < Math.hypot(best.snapAt[0] - sink.position[0], best.snapAt[1] - sink.position[1])) best = { snapAt: at, pipe: p };
      }
    }
    expect(best).not.toBeNull();
    const start = snapPipe(best!.snapAt, 'cold', { ...env, layout: { ...env.layout, points: [] } }, 0.1)!;
    expect(start.kind).toBe('segment');
    const end = snapPipe(sink.position as [number, number], 'cold', env, 0.1)!;
    expect(end.kind).toBe('point');
    const nPipes = cut.installations.plumbing.pipes.length;
    const drawn = produce(cut, (d) => {
      addPipe(d, { system: 'cold', env, newId, verts: [{ xy: start.xy, snap: start }, { xy: end.xy, snap: end }] });
    });
    // +1 do tubo novo, +1 da divisão do trecho tocado
    expect(drawn.installations.plumbing.pipes.length).toBe(nPipes + 2);
    const r1 = compute(drawn);
    expect(r1.warnings.some((w) => w.code === 'water.disconnected' && w.refs?.includes(sink.id))).toBe(false);
    const row = r1.installations!.plumbing!.water.points.find((p) => p.pointId === sink.id)!;
    expect(row.dynamicHead).toBeGreaterThan(0);
  });

  it('mover um ponto leva as pontas dos tubos ligados; mover a caixa idem (manual) e só grava o override (automático)', () => {
    const pl = results.installations!.plumbing!;
    const pt = pl.layout.points.find((p) => p.fixture === 'lavatory' && p.level === 'L0')!;
    const moved = produce(base, (d) => movePoint(d, pl.layout, pt.id, [pt.position[0] + 0.1, pt.position[1]]));
    const m = moved.installations.plumbing;
    expect(m.manual).toBe(true);
    expect(m.points.find((p) => p.id === pt.id)!.position[0]).toBeCloseTo(pt.position[0] + 0.1, 6);
    const ends = m.pipes.flatMap((p) => [p.path[0]!, p.path.at(-1)!]).filter((v) => Math.abs(v[0] - (pt.position[0] + 0.1)) < 1e-6 && Math.abs(v[1] - pt.position[1]) < 1e-6);
    expect(ends.length).toBeGreaterThan(0);
    expect(compute(moved).warnings.some((w) => w.code === 'water.disconnected')).toBe(false);

    const tankMoved = produce(base, (d) => moveTank(d, pl.layout, 'L0', [pl.layout.tank.position[0] + 0.3, pl.layout.tank.position[1]]));
    expect(tankMoved.installations.plumbing.manual).toBe(false);
    expect(tankMoved.installations.plumbing.tank?.bottomZ).toBe(pl.layout.tank.bottomZ);
    expect(compute(tankMoved).installations!.plumbing!.layout.tank.position[0]).toBeCloseTo(pl.layout.tank.position[0] + 0.3, 6);
  });

  it('ponto de água novo, troca de DN travado e declividade só no esgoto', () => {
    const pl = results.installations!.plumbing!;
    const withPt = produce(base, (d) => addPoint(d, pl.layout, { id: 'pt-x', fixture: 'garden_tap', level: 'L0', xy: [1, 1] }));
    expect(withPt.installations.plumbing.points.at(-1)).toMatchObject({ id: 'pt-x', fixture: 'garden_tap' });
    const cold = pl.layout.pipes.find((p) => p.system === 'cold')!;
    const sewer = pl.layout.pipes.find((p) => p.system === 'sewer')!;
    const edited = produce(base, (d) => {
      patchPipe(d, pl.layout, cold.id, { dn: 32, slope: 0.05 });
      patchPipe(d, pl.layout, sewer.id, { slope: 0.03, dn: 100 });
    });
    const pipes = edited.installations.plumbing.pipes;
    expect(pipes.find((p) => p.id === cold.id)).toMatchObject({ dn: 32 });
    expect(pipes.find((p) => p.id === cold.id)!.slope).toBeUndefined();
    expect(pipes.find((p) => p.id === sewer.id)).toMatchObject({ dn: 100, slope: 0.03 });
    const r = compute(edited).installations!.plumbing!;
    expect(r.water.pipes.find((p) => p.pipeId === cold.id)!.dn).toBe(32);
    expect(r.sewer.pipes.find((p) => p.pipeId === sewer.id)!.slope).toBe(0.03);
  });

  it('cota do trecho horizontal: as pernas verticais se ajustam e as pontas coladas acompanham', () => {
    const pl = results.installations!.plumbing!;
    const sub = pl.layout.pipes.find((p) => p.system === 'cold' && p.level === 'L0' && p.path.length >= 3 && horizontalRunZ(p.path) !== null && Math.abs(p.path.at(-1)![2] - horizontalRunZ(p.path)!) > 1e-6)!;
    const z0 = horizontalRunZ(sub.path)!;
    const next = produce(base, (d) => void setPipeZ(d, pl.layout, sub.id, z0 - 0.2));
    const moved = next.installations.plumbing.pipes.find((p) => p.id === sub.id)!;
    expect(horizontalRunZ(moved.path)).toBeCloseTo(z0 - 0.2, 9);
    // o ponto de água (última ponta) não muda de cota: continua ligado
    expect(moved.path.at(-1)![2]).toBe(sub.path.at(-1)![2]);
    expect(compute(next).warnings.some((w) => w.code === 'water.disconnected')).toBe(false);
    // prumada (sem trecho horizontal) não aceita cota
    const vertical = pl.layout.pipes.find((p) => horizontalRunZ(p.path) === null)!;
    produce(base, (d) => void expect(setPipeZ(d, pl.layout, vertical.id, 1)).toBe(false));
  });

  it('moveNode só mexe nos vértices do nível pedido', () => {
    const pipes: Pipe[] = [
      { id: 'a', system: 'cold', level: 'L0', path: [[1, 1, 1], [2, 1, 1]] },
      { id: 'b', system: 'cold', level: 'L1', path: [[1, 1, 1], [1, 2, 1]] },
    ];
    moveNode(pipes, [1, 1], [5, 5], 'L0');
    expect(pipes[0]!.path[0]).toEqual([5, 5, 1]);
    expect(pipes[1]!.path[0]).toEqual([1, 1, 1]);
  });

  it('rotear automaticamente troca os tubos do sistema pelos do motor', () => {
    const pl = results.installations!.plumbing!;
    const broken = produce(base, (d) => {
      ensureManual(d, pl.layout);
      d.installations.plumbing.pipes = d.installations.plumbing.pipes.filter((p) => p.system !== 'cold');
    });
    expect(compute(broken).warnings.some((w) => w.code === 'water.disconnected')).toBe(true);
    const fixed = produce(broken, (d) => void autoRoute(d, liveLayout(broken, compute(broken).installations!.plumbing!)!, pl.layout, ['cold']));
    expect(compute(fixed).warnings.some((w) => w.code === 'water.disconnected')).toBe(false);
  });
});

describe('caixa d\'água: "Subir até atender"', () => {
  const lowTank = (): { p: Project; r: Results } => {
    const pl = results.installations!.plumbing!;
    const p = produce(base, (d) => setTankBottom(d, pl.layout, 3.2));
    return { p, r: compute(p) };
  };

  it('com a caixa baixa há ponto sem pressão; subir pelo maior requiredTankRise faz todos atenderem', () => {
    const { p, r } = lowTank();
    const rep = r.installations!.plumbing!;
    const failing = rep.water.points.filter((x) => !x.ok);
    expect(failing.length).toBeGreaterThan(0);
    const rise = requiredRise(rep);
    expect(rise).toBeGreaterThanOrEqual(Math.max(...failing.map((x) => x.requiredTankRise)));
    const up = produce(p, (d) => void raiseTankToMeet(d, rep));
    expect(up.installations.plumbing.tank!.bottomZ).toBeCloseTo(rep.layout.tank.bottomZ + rise, 6);
    const after = compute(up).installations!.plumbing!;
    expect(after.water.points.every((x) => x.ok)).toBe(true);
    expect(requiredRise(after)).toBe(0);
  });

  it('com os DN travados, subir a caixa 1 m aumenta a pressão de cada ponto em exatamente 1 m.c.a.', () => {
    const pl = results.installations!.plumbing!;
    const dnOf = new Map(pl.water.pipes.map((p) => [p.pipeId, p.dn]));
    const pinned = produce(base, (d) => {
      ensureManual(d, pl.layout);
      for (const p of d.installations.plumbing.pipes) if (dnOf.has(p.id)) p.dn = dnOf.get(p.id)!;
    });
    const r0 = compute(pinned).installations!.plumbing!;
    const up = compute(produce(pinned, (d) => setTankBottom(d, r0.layout, r0.layout.tank.bottomZ + 1))).installations!.plumbing!;
    for (const before of r0.water.points) {
      const a = up.water.points.find((p) => p.pointId === before.pointId && p.system === before.system)!;
      expect(a.dynamicHead - before.dynamicHead).toBeCloseTo(1, 3);
    }
  });

  it('com o traçado automático, a pressão estática sobe 1 m e a dinâmica sobe (o motor pode reduzir o DN com mais carga)', () => {
    const pl = results.installations!.plumbing!;
    const up = compute(produce(base, (d) => setTankBottom(d, pl.layout, pl.layout.tank.bottomZ + 1))).installations!.plumbing!;
    for (const before of pl.water.points) {
      const a = up.water.points.find((p) => p.pointId === before.pointId && p.system === before.system)!;
      expect(a.staticHead - before.staticHead).toBeCloseTo(1, 6);
      expect(a.dynamicHead).toBeGreaterThan(before.dynamicHead);
    }
  });

  it('selo: texto em m.c.a. e kPa, e "faltam X m" só quando não atende', () => {
    const { r, p } = lowTank();
    const rows = pressureRows(r.installations!.plumbing!, p, k);
    const bad = rows.find((x) => !x.ok)!;
    expect(sealText(bad)).toMatch(/^\d+,\d{2} m\.c\.a\. · \d+,\d kPa$/);
    expect(sealMissing(bad)).toMatch(/^faltam \d+,\d{2} m$/);
    expect(sealMissing({ ok: true, rise: 0 })).toBeNull();
  });
});

describe('seleção por clique', () => {
  it('ponto > caixa > tubo, e só os sistemas visíveis', () => {
    const pl = results.installations!.plumbing!;
    const all = { cold: true, hot: true, sewer: true, vent: true };
    const pt = pl.layout.points.find((p) => p.level === 'L0')!;
    expect(hitTest(pl.layout, 'L0', pt.position as [number, number], 0.1, all)?.sel).toEqual({ kind: 'point', id: pt.id });
    const t = pl.layout.tank;
    const farFromPoints: [number, number] = [t.position[0], t.position[1]];
    expect(hitTest({ ...pl.layout, points: [] }, 'L0', farFromPoints, 0.1, all)?.sel.kind).toBe('tank');
    const cold = pl.layout.pipes.find((p) => p.system === 'cold' && p.level === 'L0' && Math.hypot(p.path[1]![0] - p.path[0]![0], p.path[1]![1] - p.path[0]![1]) > 0.5)!;
    const a = cold.path[0] as V3;
    const b = cold.path[1] as V3;
    const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const only: PlumbingLayout = { ...pl.layout, points: [], tank: { ...t, position: [999, 999] } };
    expect(hitTest(only, 'L0', mid, 0.05, all)?.sel).toEqual({ kind: 'pipe', id: expect.any(String) });
    expect(hitTest(only, 'L0', mid, 0.05, { ...all, cold: false, hot: false, sewer: false, vent: false })).toBeNull();
  });
});
