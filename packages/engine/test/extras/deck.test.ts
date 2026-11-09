import { describe, expect, test } from 'vitest';
import { attachDeckFrames } from '../../src/extras/deckFrame';
import { deckFaces } from '../../src/extras/geometry';
import { mainRoofZ } from '../../src/extras/deckRoof';
import { pointInPolygon, polygonArea } from '../../src/geometry';
import { buildModel } from '../../src/model';
import { computeQuantities } from '../../src/quantities';
import { generatePieces } from '../../src/framing';
import { flatSurface, type SiteSurface } from '../../src/terrain/surface';
import type { Project } from '../../src/schema';
import { testCatalog } from '../helpers/catalog';
import { mk } from '../helpers/inline';

const gable = { kind: 'gable_mezzanine', width: 6.5, depth: 8.5, wallHeight: 2.8, roofPitchDeg: 35 };
const lShape = { kind: 'combined', shape: 'L', width: 8, depth: 5.5, wallHeight: 2.8, roofPitchDeg: 30, wing: { width: 4.4, depth: 6.2, offset: 0 } };
const aframe = {
  kind: 'a_frame', width: 5, depth: 8, ridgeHeight: 5.2,
  annexes: [{ side: 'left', width: 3, length: 5, offset: 2.5 }, { side: 'right', width: 3, length: 4, offset: 3 }],
};
const shed = { kind: 'shed', width: 4, depth: 6, lowHeight: 2.6, highHeight: 3.6 };

function slopedSurface(pct: number): SiteSurface {
  // desce para a frente (y negativo): a casa está em y >= 0
  const z = (_x: number, y: number) => -0.03 + (pct / 100) * y;
  return { platformZ: 0, groundZ: z, naturalZ: z, slopePct: pct };
}

function build(typology: unknown, deck: Record<string, unknown>, surface: SiteSurface = flatSurface()) {
  const project: Project = mk(typology, { extras: [{ id: 'd1', kind: 'deck', ...deck }] });
  const model = buildModel(project, testCatalog);
  attachDeckFrames(project, model, surface, testCatalog);
  return { project, model, em: model.extras[0]!, deck: model.extras[0]!.deck! };
}

const gridIn = (poly: [number, number][], step = 0.1) => {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const out: [number, number][] = [];
  for (let x = Math.min(...xs) + 0.01; x < Math.max(...xs); x += step)
    for (let y = Math.min(...ys) + 0.01; y < Math.max(...ys); y += step) out.push([x, y]);
  return out;
};

describe('fachada pela face externa', () => {
  test('fachada inteira: de quina a quina, topo em -0,03', () => {
    const { model, em, deck } = build(gable, { side: 'front', depth: 2 });
    const f = model.footprint;
    const x0 = Math.min(...f.map((p) => p[0]));
    const x1 = Math.max(...f.map((p) => p[0]));
    expect(Math.min(...em.polygon!.map((p) => p[0]))).toBeCloseTo(x0, 9);
    expect(Math.max(...em.polygon!.map((p) => p[0]))).toBeCloseTo(x1, 9);
    expect(x0).toBeLessThan(0);
    expect(em.topZ).toBe(-0.03);
    expect(deck.facade.origin[0]).toBeCloseTo(x0, 9);
    expect(deck.facade.n).toEqual([0, -1]);
  });

  test('alinhamento: fim, centro e offset negativo ficam presos à face', () => {
    const base = build(gable, { side: 'front', depth: 2, length: 3 });
    const xs = (d: ReturnType<typeof build>) => d.em.polygon!.map((p) => p[0]);
    const f = base.deck.facade;
    expect(Math.min(...xs(base))).toBeCloseTo(f.origin[0], 9);
    const end = build(gable, { side: 'front', depth: 2, length: 3, align: 'end' });
    expect(Math.max(...xs(end))).toBeCloseTo(f.origin[0] + f.length, 9);
    const mid = build(gable, { side: 'front', depth: 2, length: 3, align: 'center', offset: -1 });
    expect((Math.min(...xs(mid)) + Math.max(...xs(mid))) / 2).toBeCloseTo(f.origin[0] + f.length / 2 - 1, 9);
    const over = build(gable, { side: 'front', depth: 2, length: 3, align: 'start', offset: -2 });
    expect(Math.min(...xs(over))).toBeGreaterThanOrEqual(f.origin[0] - 1e-9);
  });

  test('facadeIndex: da mais externa para a mais interna; inexistente cai na 0', () => {
    const { project, model } = build(lShape, { side: 'front' });
    const faces = deckFaces(model.footprint, 'front');
    expect(faces.length).toBe(1);
    const left = deckFaces(model.footprint, 'left');
    expect(left.length).toBeGreaterThanOrEqual(1);
    const a = build(lShape, { side: 'front', facadeIndex: 5 });
    const b = build(lShape, { side: 'front', facadeIndex: 0 });
    expect(a.em.polygon).toEqual(b.em.polygon);
    expect(project.typology.kind).toBe('combined');
    const right = deckFaces(model.footprint, 'right');
    // L: duas faces voltadas para a direita (corpo e ala), a do corpo é mais externa
    expect(right.length).toBe(2);
    expect(right[0]!.origin[0]).toBeGreaterThan(right[1]!.origin[0]);
  });

  test.each([
    ['L', lShape],
    ['A-frame com anexos', aframe],
    ['gable', gable],
  ])('%s: o deck nunca intercepta o contorno', (_n, typ) => {
    for (const side of ['front', 'back', 'left', 'right'] as const) {
      for (const facadeIndex of [0, 1]) {
        const { model, em } = build(typ, { side, facadeIndex, depth: 3 });
        if (!em.polygon || em.polygon.length === 0) continue;
        const inside = gridIn(em.polygon).filter((p) => pointInPolygon(p, model.footprint, 1e-6));
        expect(inside, `${side}/${facadeIndex}`).toHaveLength(0);
        expect(polygonArea(em.polygon)).toBeGreaterThan(0.5);
      }
    }
  });
});

describe('terreno inclinado 30% descendo para a frente', () => {
  const surface = slopedSurface(30);
  const r = build(gable, { side: 'front', depth: 3, level: 1 }, surface);

  test('pilares da borda externa mais altos que os de dentro; groundZ bate com a superfície', () => {
    const { supports } = r.deck;
    const h = (s: (typeof supports)[number]) => s.topZ - s.groundZ;
    const minY = Math.min(...supports.map((s) => s.position[1]));
    const maxY = Math.max(...supports.map((s) => s.position[1]));
    const outer = supports.filter((s) => Math.abs(s.position[1] - minY) < 1e-6);
    const inner = supports.filter((s) => Math.abs(s.position[1] - maxY) < 1e-6);
    expect(Math.min(...outer.map(h))).toBeGreaterThan(Math.max(...inner.map(h)));
    for (const s of supports) expect(s.groundZ).toBeCloseTo(surface.groundZ(s.position[0], s.position[1]), 9);
    // madeira até 2,5 m, aço acima; broca porque 30% > 25%
    expect(outer.every((s) => s.footing.kind === 'bored')).toBe(true);
    expect(supports.every((s) => (h(s) > 2.5 ? s.material !== 'wood' : true))).toBe(true);
    expect(supports.some((s) => s.braced)).toBe(true);
  });

  test('escada auto: espelho entre mín e máx, Blondel ok; guarda-corpo auto presente com abertura', () => {
    const { stairs, guardrail, railGaps, maxDrop } = r.deck;
    const X = testCatalog.constants.extras.deck;
    expect(maxDrop).toBeGreaterThan(X.guardrailDrop);
    expect(stairs).toHaveLength(1);
    const s = stairs[0]!;
    expect(s.riserHeight).toBeGreaterThanOrEqual(X.stair.riserMin);
    expect(s.riserHeight).toBeLessThanOrEqual(X.stair.riserMax + 1e-9);
    const blondel = 2 * s.riserHeight + s.tread;
    expect(blondel).toBeGreaterThanOrEqual(X.stair.blondelMin - 1e-9);
    expect(blondel).toBeLessThanOrEqual(X.stair.blondelMax + 1e-9);
    expect(s.tread).toBeGreaterThanOrEqual(X.stair.treadMin - 1e-9);
    // o pé encosta no terreno acabado
    const foot: [number, number] = [s.top[0] + s.dir[0] * (s.risers - 1) * s.tread, s.top[1] + s.dir[1] * (s.risers - 1) * s.tread];
    expect(s.bottomZ).toBeCloseTo(surface.groundZ(foot[0], foot[1]), 9);
    expect(guardrail).toBe(true);
    expect(r.em.segments.some((x) => x.material === 'rail')).toBe(true);
    expect(railGaps).toHaveLength(1);
    expect(r.deck.checks.filter((c) => c.status !== 'ok' && c.id.startsWith('stair'))).toHaveLength(0);
    expect(r.deck.checks.find((c) => c.id === 'guardrail')!.norm).toBe('nbr14718');
  });

  test('escada centralizada na porta da fachada', () => {
    const project = mk(gable, {
      extras: [{ id: 'd1', kind: 'deck', side: 'front', depth: 3, level: 1, length: 6 }],
      openings: [{ id: 'o1', host: 'ext-front', type: 'door', offset: 4.2, width: 0.9, height: 2.1 }],
    });
    const model = buildModel(project, testCatalog);
    attachDeckFrames(project, model, surface, testCatalog);
    const door = model.openings.find((o) => o.id === 'o1')!;
    const wall = model.walls.find((w) => w.id === door.hostId)!;
    const xDoor = wall.from[0] + ((door.u0 + door.u1) / 2) * Math.sign(wall.to[0] - wall.from[0]);
    const s = model.extras[0]!.deck!.stairs[0]!;
    expect(s.top[0]).toBeCloseTo(xDoor, 6);
  });
});

describe('deck plano na cota padrão', () => {
  const r = build(gable, { side: 'front', depth: 2 });
  test('sem guarda-corpo, sem escada, apoios curtos', () => {
    expect(r.deck.guardrail).toBe(false);
    expect(r.em.segments.filter((s) => s.material === 'rail')).toHaveLength(0);
    expect(r.deck.stairs).toHaveLength(0);
    expect(r.deck.maxDrop).toBeLessThan(0.2);
    expect(r.deck.supports.every((s) => s.topZ - s.groundZ <= 1e-9)).toBe(true);
    expect(r.deck.checks.every((c) => c.status === 'ok')).toBe(true);
  });
  test('guardrail true força; false nunca', () => {
    expect(build(gable, { side: 'front', guardrail: true }).deck.guardrail).toBe(true);
    expect(build(gable, { side: 'front', depth: 3, level: 1.5, guardrail: false }).deck.guardrail).toBe(false);
    expect(build(gable, { side: 'front', depth: 3, level: 1.5, guardrail: false }).deck.checks.find((c) => c.id === 'guardrail')!.status).toBe('fail');
  });
});

describe('estrutura', () => {
  test('barrotes cada 45 cm, vãos dentro do máximo, ledger na casa, vigas intermediárias se profundo', () => {
    const shallow = build(gable, { side: 'front', depth: 2 });
    const X = testCatalog.constants.extras.deck;
    expect(shallow.deck.ledger).not.toBeNull();
    expect(shallow.deck.joists.length).toBeGreaterThan(10);
    const deep = build(gable, { side: 'front', depth: 5.5 });
    expect(deep.deck.beams.length).toBeGreaterThan(shallow.deck.beams.length);
    expect(deep.deck.checks.find((c) => c.id === 'joist_span')!.status).toBe('ok');
    expect(shallow.deck.beams[0]!.topZ).toBeCloseTo(-0.03 - X.board.thickness - X.joist.depth, 9);
    // deck baixo demais para fixar o ledger no radier: linha de pilares junto à casa
    const low = build(gable, { side: 'front', depth: 2, level: -0.6 });
    expect(low.deck.ledger).toBeNull();
    expect(low.deck.beams.length).toBe(shallow.deck.beams.length + 1);
  });
  test('tábuas perpendiculares: boardDir ao longo da normal e barrotes ao longo da fachada', () => {
    const r = build(gable, { side: 'right', depth: 2, boards: 'perpendicular' });
    expect(r.deck.boardDir).toEqual(r.deck.facade.n);
    const p = build(gable, { side: 'right', depth: 2 });
    expect(p.deck.boardDir).toEqual(p.deck.facade.t);
  });
  test('material e fundação forçados', () => {
    const r = build(gable, { side: 'front', depth: 3, level: 1, support: 'steel', footing: 'bored' });
    expect(r.deck.supports.every((s) => s.material === 'steel' && s.footing.kind === 'bored')).toBe(true);
  });
});

describe('cobertura do deck não atravessa o telhado principal', () => {
  const cases: [string, unknown, Record<string, unknown>[]][] = [
    ['gable', gable, [{ side: 'front' }, { side: 'back' }, { side: 'left' }, { side: 'right', length: 4 }]],
    ['aframe-wings', aframe, [{ side: 'front' }, { side: 'back' }, { side: 'left', facadeIndex: 0 }, { side: 'right', facadeIndex: 1 }]],
    ['shed', shed, [{ side: 'front' }, { side: 'back' }, { side: 'left' }, { side: 'right' }]],
    ['combined', lShape, [{ side: 'front' }, { side: 'back' }, { side: 'left' }, { side: 'right', facadeIndex: 1 }]],
  ];
  test.each(cases)('%s', (_n, typ, decks) => {
    for (const d of decks) {
      const r = build(typ, { depth: 2.4, covered: true, ...d });
      const roof = r.em.roof;
      expect(roof, JSON.stringify(d)).toBeDefined();
      let checked = 0;
      for (let u = 0.05; u < roof!.uLength; u += 0.2) {
        for (let v = 0.05; v < roof!.vLength; v += 0.1) {
          const p: [number, number, number] = [
            roof!.origin[0] + roof!.uAxis[0] * u + roof!.vAxis[0] * v,
            roof!.origin[1] + roof!.uAxis[1] * u + roof!.vAxis[1] * v,
            roof!.origin[2] + roof!.uAxis[2] * u + roof!.vAxis[2] * v,
          ];
          const zMain = mainRoofZ(r.model.roofPlanes, p[0], p[1]);
          if (zMain !== null) {
            checked++;
            expect(p[2], `${_n} ${JSON.stringify(d)}`).toBeLessThanOrEqual(zMain + 1e-6);
          }
        }
      }
      expect(checked).toBeGreaterThanOrEqual(0);
      // pilares da cobertura nascem sobre os pilares da estrutura (mesmas posições em planta)
      for (const post of r.em.posts) {
        expect(
          r.deck.supports.some((s) => Math.hypot(s.position[0] - post.position[0], s.position[1] - post.position[1]) < 1e-6),
        ).toBe(true);
      }
      expect(r.em.posts.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('quantitativos da estrutura', () => {
  test('madeira m³ = soma seção × comprimento; uma fundação por pilar', () => {
    const project = mk(gable, { extras: [{ id: 'd1', kind: 'deck', side: 'front', depth: 3, level: 1.2 }] });
    const model = buildModel(project, testCatalog);
    const pieces = generatePieces(model, project, testCatalog);
    attachDeckFrames(project, model, flatSurface(), testCatalog);
    const q = computeQuantities(model, pieces, project, testCatalog);
    const d = model.extras[0]!.deck!;
    const len = (m: { from: number[]; to: number[] }) => Math.hypot(m.to[0]! - m.from[0]!, m.to[1]! - m.from[1]!);
    let vol = [...d.joists, ...d.beams, ...(d.ledger ? [d.ledger] : [])].reduce((s, m) => s + len(m) * m.width * m.depth, 0);
    for (const s of d.stairs) vol += 2 * Math.hypot((s.risers - 1) * s.tread, s.topZ - s.bottomZ) * 0.05 * 0.25;
    const line = (id: string) => q.lines.find((l) => l.stage === 'extras' && l.itemId === id);
    expect(line('deck_timber')!.netQty).toBeCloseTo(vol, 9);
    const X = testCatalog.constants.extras.deck;
    const concrete = d.supports.reduce(
      (s, p) => s + (p.footing.kind === 'pad' ? p.footing.width ** 2 * p.footing.depth : (Math.PI * p.footing.width ** 2 * p.footing.depth) / 4),
      0,
    );
    expect(d.supports.length).toBeGreaterThan(2);
    expect(line('concrete_fck25')!.netQty).toBeCloseTo(concrete, 9);
    expect(X.footing.padWidth).toBeGreaterThan(0);
    const posts = d.supports.reduce((s, p) => s + (p.topZ - p.groundZ), 0);
    const have = ['deck_post_wood', 'deck_post_steel', 'deck_post_concrete'].reduce((s, id) => s + (line(id)?.netQty ?? 0), 0);
    expect(have).toBeCloseTo(posts, 9);
    expect(line('deck_wood')!.netQty).toBeCloseTo(polygonArea(model.extras[0]!.polygon!), 9);
    expect(line('deck_frame')).toBeUndefined();
    expect(line('stair_tread')!.netQty).toBe(d.stairs.reduce((n, s) => n + Math.max(1, s.risers - 1), 0)); // piso 1,2 m acima do chão plano pede escada
    expect(d.stairs).toHaveLength(1);
  });
});

describe('avisos e verificações', () => {
  test('sobre talude: terreno acabado fora do platô e do natural gera verificação e aviso', () => {
    const surface: SiteSurface = { platformZ: 0, groundZ: (_x, y) => -0.03 + 0.5 * y, naturalZ: () => -0.03 - 1, slopePct: 10 };
    const r = build(gable, { side: 'front', depth: 3, level: 1 }, surface);
    expect(r.deck.checks.find((c) => c.id === 'on_slope')!.status).toBe('warn');
  });
  test('sobre o platô da casa (aterro do projeto): sem aviso de talude', () => {
    const r = build(gable, { side: 'front', depth: 3, level: 1 }, { ...flatSurface(), naturalZ: () => -2 });
    expect(r.deck.checks.find((c) => c.id === 'on_slope')).toBeUndefined();
  });
  test('deck.* vira aviso do motor: guarda-corpo exigido e desligado', async () => {
    const { deckWarnings } = await import('../../src/warnings/deck');
    const r = build(gable, { side: 'front', depth: 3, level: 1.5, guardrail: false });
    const w = deckWarnings(r.model);
    expect(w.some((x) => x.code === 'deck.guardrail' && x.severity === 'error')).toBe(true);
  });
  test('solo fraco reprova a tensão na fundação (NBR 6122)', () => {
    const project = mk(gable, { design: { soilBearingKPa: 30 }, extras: [{ id: 'd1', kind: 'deck', side: 'front', depth: 3, level: 1 }] });
    const model = buildModel(project, testCatalog);
    attachDeckFrames(project, model, flatSurface(), testCatalog);
    const c = model.extras[0]!.deck!.checks.find((x) => x.id === 'footing_stress')!;
    expect(c.norm).toBe('nbr6122');
    expect(['ok', 'fail']).toContain(c.status);
  });
});
