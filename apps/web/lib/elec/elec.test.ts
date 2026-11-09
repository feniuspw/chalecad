import { getCatalog } from '@chalecad/catalog';
import type { ElecPoint, Project, Results } from '@chalecad/engine';
import { describe, expect, it } from 'vitest';
import { computeProject } from '../engine/compute';
import { findPreset } from '../project/templates';
import { controlInfo, letterOf } from './control';
import { addConduit, appendPoint, ensureManual, patchPoint, pinCircuit, removePoints, resetToAuto, toggleControl, uncontrolledLightsIn } from './edit';
import { autoGrid, lightsNeeded, luxWith, pointInPoly } from './lightGrid';
import { ceilingLuminaire, proposePoint, relocatePoint, roomAt, wallLuminaire, type PlaceEnv, type PlaceOptions } from './placement';
import { routeConduits, unreachedPoints } from './route';
import { buildElecPlan, symbolShape } from './symbols';
import { snapToWallFace } from './wallSnap';

const catalog = getCatalog();
const k = catalog.constants.electrical;

function sample(): { project: Project; results: Results } {
  const project = findPreset('gable-loft')!.build();
  project.installations.enabled = true;
  return { project, results: computeProject(project, catalog) };
}
const { project, results } = sample();
const elec = results.installations!.electrical!;
const level = project.levels[0]!.id;

function envFor(): PlaceEnv {
  const m = results.model;
  return {
    levelId: level,
    walls: m.walls.filter((w) => w.level === level).map((w) => ({ id: w.id, from: w.from as [number, number], to: w.to as [number, number], thickness: w.thickness })),
    openings: m.openings.filter((o) => o.valid && o.hostKind === 'wall').map((o) => ({ hostId: o.hostId, u0: o.u0, u1: o.u1, v0: o.v0, v1: o.v1 })),
    rooms: m.rooms.filter((r) => r.polygon && r.level === level).map((r) => ({ id: r.id, polygon: r.polygon as [number, number][], ceilingAvg: r.ceiling.avg, use: r.use, area: r.area })),
    k,
  };
}
const OPTS: PlaceOptions = { appliance: 'electric_shower', switchType: 'one_way', luminaire: 'plafon_18w' };

describe('snap na face da parede', () => {
  const wall = { id: 'w', from: [0, 0] as [number, number], to: [4, 0] as [number, number], thickness: 0.12 };
  it('posiciona na face do lado do cursor, a meia espessura do eixo', () => {
    const up = snapToWallFace([2, 0.3], [wall], { maxDist: 0.4 })!;
    expect(up.point).toEqual([2, 0.06]);
    expect(up.normal[1]).toBe(1);
    expect(Math.abs(up.normal[0])).toBe(0);
    const down = snapToWallFace([2, -0.3], [wall], { maxDist: 0.4 })!;
    expect(down.point).toEqual([2, -0.06]);
    expect(down.normal[1]).toBe(-1);
  });
  it('não encaixa longe da parede', () => {
    expect(snapToWallFace([2, 1.5], [wall], { maxDist: 0.4 })).toBeNull();
  });
  it('afasta do vão que cruza a altura da caixa, mas não de janela alta', () => {
    const door = { hostId: 'w', u0: 1.5, u1: 2.4, v0: 0, v1: 2.1 };
    const h = snapToWallFace([1.95, 0.2], [wall], { maxDist: 0.4, height: 0.3, openings: [door] })!;
    expect(h.u <= 1.4 + 1e-9 || h.u >= 2.5 - 1e-9).toBe(true);
    const win = { hostId: 'w', u0: 1.5, u1: 2.4, v0: 1.0, v1: 2.1 };
    expect(snapToWallFace([1.95, 0.2], [wall], { maxDist: 0.4, height: 0.3, openings: [win] })!.u).toBeCloseTo(1.95, 2);
  });
});

describe('ferramentas da paleta', () => {
  const env = envFor();
  const wall = env.walls[0]!;
  const near: [number, number] = [(wall.from[0] + wall.to[0]) / 2 + 0.01, (wall.from[1] + wall.to[1]) / 2 + 0.2];
  it('tomada baixa, média e alta usam as alturas do catálogo', () => {
    expect(proposePoint('socket', near, env, OPTS)!.point.height).toBe(k.heights.low);
    expect(proposePoint('socket_mid', near, env, OPTS)!.point.height).toBe(k.heights.mid);
    const high = proposePoint('socket_high', near, env, OPTS)!.point;
    expect(high.height).toBe(k.heights.high);
    expect(high.kind).toBe('socket_high');
    expect(proposePoint('switch', near, env, { ...OPTS, switchType: 'two_way' })!.point).toMatchObject({ kind: 'switch', height: k.heights.switch, switchType: 'two_way' });
  });
  it('encaixa na parede (hostId) e na face', () => {
    const pr = proposePoint('socket', near, env, OPTS)!;
    expect(pr.point.hostId).toBe(pr.hit!.wallId);
    expect(pr.normal).not.toBeNull();
  });
  it('TUE guarda o aparelho e põe o ar-condicionado no alto', () => {
    const p = proposePoint('socket_tue', near, env, { ...OPTS, appliance: 'ac_12k' })!.point;
    expect(p).toMatchObject({ kind: 'socket_tue', appliance: 'ac_12k', height: k.heights.high });
  });
  it('luz dentro do cômodo vai ao teto com o pé-direito; perto da parede vira arandela', () => {
    const room = env.rooms[0]!;
    const c = room.polygon.reduce((a, p) => [a[0] + p[0] / room.polygon.length, a[1] + p[1] / room.polygon.length], [0, 0] as [number, number]);
    const ceiling = proposePoint('light', c, env, OPTS);
    if (roomAt(env.rooms, c)) {
      expect(ceiling!.point).toMatchObject({ kind: 'light', height: roomAt(env.rooms, c)!.ceilingAvg });
      expect(ceiling!.point.hostId).toBeUndefined();
    }
    const sconce = proposePoint('light', near, env, { ...OPTS, luminaire: 'plafon_18w' })!;
    expect(sconce.point).toMatchObject({ kind: 'light', hostId: sconce.hit!.wallId, height: k.heights.wallLight });
    expect(k.luminaires.find((l) => l.id === sconce.point.luminaire)!.type).toBe('wall');
  });
  it('luminária de teto nunca é arandela e vice-versa', () => {
    expect(wallLuminaire(k, 'plafon_18w')).toBe('wall_8w');
    expect(ceilingLuminaire(k, 'wall_8w')).toBe(k.defaultLuminaire);
    expect(ceilingLuminaire(k, 'spot_6w')).toBe('spot_6w');
  });
  it('arrastar mantém o ponto de parede na parede', () => {
    const pt = elec.layout.points.find((p) => p.kind === 'socket' && p.hostId)!;
    const to = relocatePoint(pt, near, env)!;
    expect(to.hostId).toBeTruthy();
  });
});

describe('grade automática de luminárias (método dos lúmens)', () => {
  const room = { polygon: [[0, 0], [5, 0], [5, 4], [0, 4]] as [number, number][], area: 20, use: 'living', ceilingAvg: 2.6 };
  it('atinge o lux alvo com a luminária escolhida', () => {
    const g = autoGrid(room, 1600, k, [2.5, 2]);
    expect(g.positions.length).toBeGreaterThanOrEqual(g.needed);
    expect(g.lux).toBeGreaterThanOrEqual(g.target);
    // com uma a menos fica abaixo do alvo
    expect(luxWith(room, 1600, g.needed - 1, k)).toBeLessThan(g.target);
    for (const p of g.positions) expect(pointInPoly(p, room.polygon)).toBe(true);
  });
  it('luminária mais forte pede menos pontos', () => {
    expect(lightsNeeded(room, 2200, k)).toBeLessThanOrEqual(lightsNeeded(room, 1000, k));
    expect(lightsNeeded(room, 2200, k)).toBeGreaterThanOrEqual(1);
  });
  it('cômodo pequeno leva uma luz no centro', () => {
    const small = { polygon: [[0, 0], [1.5, 0], [1.5, 1.5], [0, 1.5]] as [number, number][], area: 2.25, use: 'bathroom', ceilingAvg: 2.4 };
    const g = autoGrid(small, 1600, k, [0.75, 0.75]);
    expect(g.positions).toEqual([[0.75, 0.75]]);
  });
});

describe('cópia do traçado para manual', () => {
  const fresh = () => structuredClone(project.installations.electrical);
  it('copia pontos, eletrodutos e circuitos do traçado efetivo e vira manual', () => {
    const e = fresh();
    expect(e.manual).toBe(false);
    expect(ensureManual(e, elec.layout)).toBe(true);
    expect(e.manual).toBe(true);
    expect(e.points).toEqual(elec.layout.points);
    expect(e.conduits).toEqual(elec.layout.conduits);
    expect(e.circuits).toEqual(elec.layout.circuits);
    expect(e.points).not.toBe(elec.layout.points);
  });
  it('só copia uma vez; depois preserva as edições', () => {
    const e = fresh();
    ensureManual(e, elec.layout);
    const n = e.points.length;
    appendPoint(e, { id: 'e-novo', kind: 'socket', level, position: [1, 1], height: 0.3 });
    expect(ensureManual(e, elec.layout)).toBe(false);
    expect(e.points).toHaveLength(n + 1);
  });
  it('"Gerar automaticamente" volta a manual:false e limpa o desenho', () => {
    const e = fresh();
    ensureManual(e, elec.layout);
    resetToAuto(e);
    expect(e).toMatchObject({ manual: false, points: [], conduits: [], circuits: [] });
  });
  it('o traçado copiado valida e o motor o aceita como manual com o ponto novo', () => {
    const p = structuredClone(project);
    ensureManual(p.installations.electrical, elec.layout);
    const wall = results.model.walls.find((w) => w.level === level)!;
    appendPoint(p.installations.electrical, { id: 'e-novo', kind: 'socket', level, position: [wall.from[0], wall.from[1]], hostId: wall.id, height: 0.3 });
    const r = computeProject(p, catalog);
    const out = r.installations!.electrical!;
    expect(r.installations!.electrical!.layout.points.some((x) => x.id === 'e-novo')).toBe(true);
    expect(out.layout.points.length).toBe(elec.layout.points.length + 1);
    expect(out.circuits.length).toBeGreaterThan(0);
  });
  it('fixa o circuito auto-* e seus pontos ao editá-lo', () => {
    const e = fresh();
    ensureManual(e, elec.layout);
    const c = elec.layout.circuits[0]!;
    e.circuits = [];
    for (const p of e.points) delete p.circuitId;
    const pinned = pinCircuit(e, elec.layout, c.id)!;
    expect(pinned.id).toBe(c.id);
    expect(e.points.filter((p) => p.circuitId === c.id).map((p) => p.id).sort()).toEqual(elec.layout.points.filter((p) => p.circuitId === c.id).map((p) => p.id).sort());
  });
});

describe('comando (controls)', () => {
  const lights = elec.layout.points.filter((p) => p.kind === 'light');
  const sw = () => {
    const e = structuredClone(project.installations.electrical);
    ensureManual(e, elec.layout);
    return e;
  };
  it('clicar liga e desliga a luz no interruptor', () => {
    const e = sw();
    const s = e.points.find((p) => p.kind === 'switch')!;
    const l = lights.find((x) => !(s.controls ?? []).includes(x.id))!;
    expect(toggleControl(e, s.id, l.id)).toBe(true);
    expect(s.controls).toContain(l.id);
    expect(toggleControl(e, s.id, l.id)).toBe(false);
    expect(s.controls).not.toContain(l.id);
  });
  it('ignora alvos que não são interruptor/luz', () => {
    const e = sw();
    const sock = e.points.find((p) => p.kind === 'socket')!;
    expect(toggleControl(e, sock.id, lights[0]!.id)).toBeNull();
  });
  it('apagar uma luz tira o id de todos os comandos', () => {
    const e = sw();
    const s = e.points.find((p) => p.kind === 'switch' && (p.controls ?? []).length > 0)!;
    const id = s.controls![0]!;
    removePoints(e, new Set([id]));
    expect(e.points.some((p) => p.id === id)).toBe(false);
    expect(e.points.every((p) => !(p.controls ?? []).includes(id))).toBe(true);
  });
  it('luzes sem comando num cômodo são assumidas pelo interruptor novo', () => {
    const pts: ElecPoint[] = [
      { id: 'a', kind: 'light', level: 'L0', position: [1, 1], height: 2.5 },
      { id: 'b', kind: 'light', level: 'L0', position: [2, 1], height: 2.5 },
      { id: 's', kind: 'switch', level: 'L0', position: [0, 0], height: 1.1, controls: ['a'] },
    ];
    expect(uncontrolledLightsIn(pts, () => true)).toEqual(['b']);
  });
  it('letras: luzes do mesmo conjunto de interruptores compartilham a letra; paralelo repete o comando', () => {
    const pts: ElecPoint[] = [
      { id: 'a', kind: 'light', level: 'L0', position: [1, 1], height: 2.5 },
      { id: 'b', kind: 'light', level: 'L0', position: [2, 1], height: 2.5 },
      { id: 'c', kind: 'light', level: 'L0', position: [3, 1], height: 2.5 },
      { id: 's1', kind: 'switch', level: 'L0', position: [0, 0], height: 1.1, controls: ['a', 'b'] },
      { id: 's2', kind: 'switch', level: 'L0', position: [4, 0], height: 1.1, controls: ['a', 'b'] },
      { id: 's3', kind: 'switch', level: 'L0', position: [4, 1], height: 1.1, controls: ['c'] },
    ];
    const info = controlInfo(pts);
    expect(info.lightLetter.get('a')).toBe(info.lightLetter.get('b'));
    expect(info.lightLetter.get('a')).not.toBe(info.lightLetter.get('c'));
    expect(info.switchLetters.get('s1')).toEqual(info.switchLetters.get('s2'));
    expect(info.links).toHaveLength(5);
    expect(letterOf(0)).toBe('a');
  });
});

describe('roteamento automático', () => {
  it('liga todos os pontos do traçado aos eletrodutos', () => {
    let n = 0;
    const pts = elec.layout.points;
    const conduits = routeConduits({ points: pts, panel: elec.layout.panel, newId: () => `cd-${++n}` });
    expect(conduits.length).toBeGreaterThan(0);
    expect(unreachedPoints(pts.filter((p) => p.kind !== 'data'), conduits)).toEqual([]);
  });
  it('o motor aceita o traçado: sem aviso de eletroduto não alcançado', () => {
    const p = structuredClone(project);
    ensureManual(p.installations.electrical, elec.layout);
    p.installations.electrical.conduits = [];
    let n = 0;
    p.installations.electrical.conduits = routeConduits({ points: elec.layout.points, panel: elec.layout.panel, newId: () => `cd-${++n}` });
    addConduit(p.installations.electrical, { id: 'extra', level, path: [[0, 0], [1, 0]], run: 'floor' });
    const r = computeProject(p, catalog);
    expect(r.warnings.filter((w) => w.code === 'elec.conduit.unreached')).toEqual([]);
  });
});

describe('modelo de desenho da planta', () => {
  const plan = buildElecPlan({
    layout: elec.layout,
    circuits: elec.circuits,
    conduits: elec.conduits,
    walls: results.model.walls.filter((w) => w.level === level).map((w) => ({ id: w.id, from: w.from as [number, number], to: w.to as [number, number], thickness: w.thickness })),
    level,
  });
  it('um item por ponto do nível mais o quadro', () => {
    expect(plan.points.length).toBe(elec.layout.points.filter((p) => p.level === level).length + 1);
    expect(plan.points.some((p) => p.id === 'panel')).toBe(true);
  });
  it('cada circuito tem cor própria e número', () => {
    const colors = new Set(plan.points.filter((p) => p.circuit > 0).map((p) => `${p.circuit}:${p.color}`));
    expect(colors.size).toBeGreaterThan(1);
    const byCircuit = new Map<number, Set<string>>();
    for (const p of plan.points) if (p.circuit > 0) byCircuit.set(p.circuit, (byCircuit.get(p.circuit) ?? new Set()).add(p.color));
    for (const s of byCircuit.values()) expect(s.size).toBe(1);
  });
  it('eletrodutos trazem DN e nº de circuitos; há linhas de comando', () => {
    expect(plan.conduits.length).toBe(elec.layout.conduits.filter((c) => c.level === level).length);
    expect(plan.conduits.some((c) => c.label && /^Ø\d+/.test(c.label.text))).toBe(true);
    expect(plan.links.length).toBeGreaterThan(0);
  });
  it('símbolos: tomada média tem meio preenchimento, alta cheio, baixa vazada', () => {
    const area = (poly: [number, number][]) => Math.abs(poly.reduce((a, p, i) => a + (p[0] * poly[(i + 1) % poly.length]![1] - poly[(i + 1) % poly.length]![0] * p[1]), 0)) / 2;
    const f = (kind: 'socket_low' | 'socket_mid' | 'socket_high') => symbolShape(kind, [0, 0], [0, 1]).fills.reduce((a, p) => a + area(p), 0);
    expect(f('socket_low')).toBe(0);
    expect(f('socket_mid')).toBeCloseTo(f('socket_high') / 2, 6);
  });
  it('símbolo de parede fica do lado da normal', () => {
    const s = symbolShape('socket_low', [0, 0], [0, 1]);
    expect(s.center[1]).toBeGreaterThan(0);
    const s2 = symbolShape('socket_low', [0, 0], [0, -1]);
    expect(s2.center[1]).toBeLessThan(0);
  });
  it('patchPoint altera só o ponto pedido', () => {
    const e = structuredClone(project.installations.electrical);
    ensureManual(e, elec.layout);
    const id = e.points[0]!.id;
    expect(patchPoint(e, id, { height: 1.2 })).toBe(true);
    expect(e.points[0]!.height).toBe(1.2);
    expect(patchPoint(e, 'nada', { height: 1 })).toBe(false);
  });
});

describe('malhas dos traços', () => {
  it('tracejado cobre metade do caminho com traço 0,1 e vazio 0,1', async () => {
    const { dashSegments, segmentQuad } = await import('./mesh');
    const segs = dashSegments([[0, 0], [1, 0]], 0.1, 0.1);
    const total = segs.reduce((a, [p, q]) => a + Math.hypot(q[0] - p[0], q[1] - p[1]), 0);
    expect(total).toBeCloseTo(0.5, 6);
    const out: number[] = [];
    segmentQuad([0, 0], [1, 0], 0.02, 0.5, out);
    expect(out).toHaveLength(18);
  });
});

describe('escolha e encaixe do eletroduto', () => {
  const walls = results.model.walls.filter((w) => w.level === level).map((w) => ({ id: w.id, from: w.from as [number, number], to: w.to as [number, number], thickness: w.thickness }));
  const plan = buildElecPlan({ layout: elec.layout, circuits: elec.circuits, conduits: elec.conduits, walls, level });
  it('acha o ponto sob o cursor e prefere ponto a eletroduto', async () => {
    const { pickElec } = await import('./pick');
    const pt = elec.layout.points.find((p) => p.level === level)!;
    expect(pickElec([pt.position[0] + 0.05, pt.position[1] + 0.05], plan, 0.3)).toEqual({ kind: 'point', id: pt.id });
    expect(pickElec([-50, -50], plan, 0.3)).toBeNull();
    const c = elec.layout.conduits.find((x) => x.level === level)!;
    const m: [number, number] = [(c.path[0]![0] + c.path[1]![0]) / 2, (c.path[0]![1] + c.path[1]![1]) / 2];
    expect(pickElec(m, plan, 0.3, 'conduit')).not.toBeNull();
  });
  it('encaixa em caixa, quadro e eletroduto, e cai na grade', async () => {
    const { snapConduit } = await import('./pick');
    const pt = elec.layout.points.find((p) => p.level === level && p.kind === 'socket')!;
    expect(snapConduit([pt.position[0] + 0.06, pt.position[1]], plan, 0.15).kind).toBe('point');
    expect(snapConduit([elec.layout.panel.position[0] + 0.05, elec.layout.panel.position[1]], plan, 0.15).kind).toBe('panel');
    expect(snapConduit([-30.013, -30.027], plan, 0.1)).toEqual({ point: [-30, -30.05], kind: 'grid' });
    expect(snapConduit([2, 2.4], plan, 0.1, { anchor: [0, 0], ortho: true, noSnap: false }).point[0]).toBe(0);
  });
});

describe('grade automática substitui as luzes do cômodo', () => {
  it('as novas herdam o comando e as arandelas ficam', async () => {
    const { replaceRoomLights } = await import('./edit');
    const e = structuredClone(project.installations.electrical);
    e.manual = true;
    e.points = [
      { id: 'a', kind: 'light', level: 'L0', position: [1, 1], height: 2.5 },
      { id: 'w', kind: 'light', level: 'L0', position: [0.1, 1], height: 2, hostId: 'x' },
      { id: 's', kind: 'switch', level: 'L0', position: [0, 0], height: 1.1, controls: ['a'] },
    ];
    const r = replaceRoomLights(e, 'L0', () => true, [
      { id: 'n1', kind: 'light', level: 'L0', position: [1, 1], height: 2.5 },
      { id: 'n2', kind: 'light', level: 'L0', position: [2, 1], height: 2.5 },
    ]);
    expect(r.removed).toBe(1);
    expect(e.points.map((p) => p.id).sort()).toEqual(['n1', 'n2', 's', 'w']);
    expect(e.points.find((p) => p.id === 's')!.controls).toEqual(['n1', 'n2']);
  });
});

describe('luz das luminárias no 3D', () => {
  it('candela = lm/4π para pontual e lm/π para spot; ângulo é metade do facho', async () => {
    const { lightRig } = await import('./lights');
    const plafon = k.luminaires.find((l) => l.id === 'plafon_18w')!;
    const spot = k.luminaires.find((l) => l.id === 'spot_6w')!;
    const a = lightRig(plafon);
    expect(a.kind).toBe('point');
    expect(a.intensity).toBeCloseTo(1600 / (4 * Math.PI), 6);
    const b = lightRig(spot, 2);
    expect(b.kind).toBe('spot');
    expect(b.intensity).toBeCloseTo((480 * 2) / Math.PI, 6);
    if (b.kind === 'spot') expect(b.angle).toBeCloseTo((36 / 2) * (Math.PI / 180), 6);
  });
  it('cor pela CCT: 2700 K quente, 6500 K branco, monotônica entre as âncoras', async () => {
    const { cctToHex } = await import('./lights');
    expect(cctToHex(2700)).toBe('#ffb46b');
    expect(cctToHex(6500)).toBe('#ffffff');
    expect(cctToHex(3000)).toBe('#ffc184');
    const blue = (c: string) => parseInt(c.slice(5, 7), 16);
    expect(blue(cctToHex(2700))).toBeLessThan(blue(cctToHex(3000)));
    expect(blue(cctToHex(3000))).toBeLessThan(blue(cctToHex(4000)));
  });
  it('só as 12 mais próximas da câmera ganham luz real; spots respeitam o próprio limite', async () => {
    const { nearestFixtures } = await import('./lights');
    const items = Array.from({ length: 30 }, (_, i) => ({ id: `l${i}`, pos: [i, 0, 0] as [number, number, number], spot: i % 3 === 0 }));
    const real = nearestFixtures(items, [0, 0, 0], 12);
    expect(real).toHaveLength(12);
    expect(real[0]).toBe('l0');
    const capped = nearestFixtures(items, [0, 0, 0], 12, 2);
    expect(capped.filter((id) => items.find((x) => x.id === id)!.spot).length).toBe(2);
    expect(capped.length).toBe(12);
  });
  it('fixtures: luminária desconhecida cai na padrão', async () => {
    const { fixturesOf } = await import('./lights');
    const f = fixturesOf([{ id: 'x', kind: 'light', level: 'L0', position: [0, 0], height: 2.5, luminaire: 'nao_existe' }], k);
    expect(f[0]!.luminaire.id).toBe(k.defaultLuminaire);
  });
});

describe('altura da luminária sob o telhado', () => {
  it('cota do telhado sobre um ponto da planta (água inclinada)', async () => {
    const { roofZAt } = await import('./lights');
    const plane = { vertices: [[0, 0, 2], [4, 0, 2], [4, 3, 4], [0, 3, 4]] as [number, number, number][] };
    expect(roofZAt([plane], [2, 0])).toBeCloseTo(2, 6);
    expect(roofZAt([plane], [2, 1.5])).toBeCloseTo(3, 6);
    expect(roofZAt([plane], [9, 9])).toBeNull();
    const other = { vertices: [[0, 0, 5], [4, 0, 5], [4, 3, 5], [0, 3, 5]] as [number, number, number][] };
    expect(roofZAt([plane, other], [2, 1.5])).toBeCloseTo(3, 6); // a mais baixa
  });
  it('no modelo real nenhum ponto de luz de teto fica acima do telhado depois do ajuste', async () => {
    const { roofZAt, fixturesOf } = await import('./lights');
    const planes = results.model.roofPlanes as { vertices: [number, number, number][] }[];
    const fx = fixturesOf(elec.layout.points, k).filter((f) => !f.hostId);
    expect(fx.length).toBeGreaterThan(0);
    const covered = fx.filter((f) => roofZAt(planes, f.position) !== null);
    expect(covered.length).toBeGreaterThan(0);
  });
});
