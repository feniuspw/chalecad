import { describe, expect, test } from 'vitest';
import { computeAll } from '../../src/compute';
import { wallAreas } from '../../src/quantities/items';
import { testCatalog } from '../helpers/catalog';
import { mk } from '../helpers/inline';

const gable = { kind: 'gable_mezzanine', width: 6, depth: 8, wallHeight: 2.8, roofPitchDeg: 20 };
const wall = (id: string, from: [number, number], to: [number, number], extra: object = {}) => ({ id, level: 'L0', from, to, ...extra });
const room = (id: string, seed: [number, number], use = 'living', extra: object = {}) => ({ id, level: 'L0', use, seed, ...extra });
const run = (typology: unknown, extra: Record<string, unknown>) => computeAll(mk(typology, extra), testCatalog);
const rm = (r: ReturnType<typeof run>, id: string) => r.model.rooms.find((x) => x.id === id)!;
const codes = (r: ReturnType<typeof run>) => r.warnings.map((w) => w.code);

describe('cômodos: contornos', () => {
  test('parede interna em y = 5 divide 6 × 8 em 30 e 18 m²', () => {
    const r = run(gable, {
      walls: [wall('w1', [0, 5], [6, 5])],
      rooms: [room('a', [3, 2.5]), room('b', [3, 6.5])],
    });
    expect(rm(r, 'a').area).toBeCloseTo(30, 6);
    expect(rm(r, 'b').area).toBeCloseTo(18, 6);
    expect(rm(r, 'a').edges.map((e) => e.hostId)).toContain('w1');
    expect(rm(r, 'a').edges.map((e) => e.hostId)).toContain('ext-front');
    expect(rm(r, 'a').name).toBe('Sala');
    expect(rm(r, 'a').perimeter).toBeCloseTo(22, 6);
  });

  test('parede em T fecha um banheiro de 2 × 2 no canto', () => {
    const r = run(gable, {
      walls: [wall('w1', [2, 0], [2, 8]), wall('w2', [0, 2], [2, 2])],
      rooms: [room('bath', [1, 1], 'bathroom', { name: 'Lavabo' })],
    });
    expect(rm(r, 'bath').area).toBeCloseTo(4, 6);
    expect(rm(r, 'bath').name).toBe('Lavabo');
    expect(rm(r, 'bath').polygon).toHaveLength(4);
    expect(rm(r, 'bath').wet).toBe(true);
  });

  test('parede que para a 10 cm da externa ainda fecha o cômodo', () => {
    const r = run(gable, {
      walls: [wall('w1', [0, 5], [5.9, 5])],
      rooms: [room('a', [3, 2.5]), room('b', [3, 6.5])],
    });
    expect(rm(r, 'a').area).toBeCloseTo(30, 6);
    expect(rm(r, 'b').area).toBeCloseTo(18, 6);
    // o trecho estendido continua sendo a parede w1
    const w1 = rm(r, 'a').edges.filter((e) => e.hostId === 'w1');
    expect(w1.reduce((s, e) => s + Math.hypot(e.to[0] - e.from[0], e.to[1] - e.from[1]), 0)).toBeCloseTo(6, 6);
  });

  test('ponta solta é ignorada; seed fora de face fechada dá polygon null e room.open', () => {
    const r = run(gable, {
      walls: [wall('w1', [0, 5], [3, 5])],
      rooms: [room('a', [3, 2.5]), room('out', [20, 20])],
    });
    expect(rm(r, 'a').area).toBeCloseTo(48, 6);
    const out = rm(r, 'out');
    expect(out.polygon).toBeNull();
    expect(out.area).toBe(0);
    const w = r.warnings.find((x) => x.code === 'room.open')!;
    expect(w.refs).toEqual(['out']);
  });

  test('mezanino: cômodo com borda da laje (hostId null) e pé-direito sob telhado inclinado', () => {
    const r = run(
      { kind: 'gable_mezzanine', width: 6.5, depth: 8.5, wallHeight: 2.8, roofPitchDeg: 35 },
      {
        levels: [
          { id: 'L0', elevation: 0, floor: 'polished_concrete' },
          { id: 'L1', elevation: 2.8, polygon: [[0, 5], [6.5, 5], [6.5, 8.5], [0, 8.5]], deck: 'osb18' },
        ],
        rooms: [{ id: 'm', level: 'L1', use: 'bedroom', seed: [3, 7] }],
      },
    );
    const m = rm(r, 'm');
    expect(m.area).toBeCloseTo(6.5 * 3.5, 6);
    const free = m.edges.filter((e) => e.hostId === null);
    expect(free.length).toBeGreaterThan(0);
    expect(free.some((e) => e.from[1] === 5 && e.to[1] === 5)).toBe(true);
    expect(m.ceiling.min).toBeLessThan(m.ceiling.avg);
    expect(m.ceiling.avg).toBeLessThan(m.ceiling.max);
    expect(m.ceiling.max).toBeGreaterThan(1.5);
  });

  test('A-frame com anexo: cômodo dentro do anexo, com a janela do anexo', () => {
    const r = run(
      {
        kind: 'a_frame', width: 6, depth: 9, ridgeHeight: 7.5, frontGable: 'glazed', backGable: 'closed',
        annexes: [{ side: 'right', width: 2.5, length: 8, offset: 0.5, height: 3.17, pitchDeg: 12, eave: 0.4 }],
      },
      {
        walls: [wall('w-annex', [6, 0.5], [6, 8.5])],
        openings: [{ id: 'o2', host: 'annex-right-side', type: 'window', offset: 1.4, width: 1.2, height: 1, sill: 1 }],
        rooms: [room('annex', [7.2, 4], 'bedroom'), room('body', [3, 4])],
      },
    );
    const a = rm(r, 'annex');
    expect(a.area).toBeCloseTo(20, 6);
    expect(a.edges.some((e) => e.hostId?.startsWith('annex-right-'))).toBe(true);
    expect(a.edges.some((e) => e.hostId === 'w-annex')).toBe(true);
    expect(a.openingIds).toEqual(['o2']);
    expect(a.glazing).toBeCloseTo(1.2, 6);
    // corpo do A-frame: contém a fachada envidraçada
    const body = rm(r, 'body');
    expect(body.area).toBeCloseTo(6 * 9 - 0.0, 0);
    expect(body.glazing).toBeGreaterThan(5);
  });
});

describe('cômodos: paredes molhadas e alertas', () => {
  test('parede interna de banheiro vira molhada; a que só separa sala não', () => {
    const r = run(gable, {
      walls: [wall('wb', [2, 0], [2, 2]), wall('wc', [0, 2], [2, 2]), wall('wx', [4, 0], [4, 8])],
      rooms: [room('bath', [1, 1], 'bathroom')],
    });
    const w = (id: string) => r.model.walls.find((x) => x.id === id)!;
    expect(w('wb').wet).toBe(true);
    expect(w('wb').assemblyId).toBe(mkAssemblyWet());
    expect(w('wc').wet).toBe(true);
    expect(w('wx').wet).toBe(false);
  });

  test('assembly explícita não é trocada', () => {
    const r = run(gable, {
      walls: [wall('wb', [2, 0], [2, 2], { assembly: mk(gable).system.assemblies.interior }), wall('wc', [0, 2], [2, 2])],
      rooms: [room('bath', [1, 1], 'bathroom')],
    });
    expect(r.model.walls.find((x) => x.id === 'wb')!.assemblyId).toBe(mk(gable).system.assemblies.interior);
  });

  test('quarto sem janela alerta iluminação; cozinha com janela suficiente não', () => {
    const closed = [wall('w1', [3, 0], [3, 3]), wall('w2', [0, 3], [3, 3])];
    const bed = run(gable, { walls: closed, rooms: [room('q', [1.5, 1.5], 'bedroom')] });
    const w = bed.warnings.find((x) => x.code === 'room.lighting');
    expect(w?.refs).toEqual(['q']);
    expect(w?.severity).toBe('warn');

    const kit = run(gable, {
      walls: closed,
      openings: [{ id: 'j', host: 'ext-front', type: 'window', offset: 0.5, width: 1.5, height: 1.2, sill: 0.9 }],
      rooms: [room('k', [1.5, 1.5], 'kitchen')],
    });
    expect(rm(kit, 'k').glazing).toBeCloseTo(1.8, 6);
    expect(codes(kit).filter((c) => c.startsWith('room.'))).toEqual([]);
    // com cômodos cobrindo menos de 90%, o alerta por volume só considera o que sobra
    expect(kit.warnings.some((x) => x.code === 'norm.lighting')).toBe(true);
  });

  test('cômodos que cobrem 90% do volume suprimem o alerta por volume', () => {
    const r = run(gable, {
      walls: [wall('w1', [0, 5], [6, 5])],
      rooms: [room('a', [3, 2.5]), room('b', [3, 6.5])],
    });
    expect(codes(r)).toContain('room.lighting');
    expect(codes(r)).not.toContain('norm.lighting');
  });

  test('banheiro sem janela: info de ventilação; área abaixo do mínimo: info', () => {
    const r = run(gable, {
      walls: [wall('w1', [1, 0], [1, 1]), wall('w2', [0, 1], [1, 1])],
      rooms: [room('b', [0.5, 0.5], 'bathroom')],
    });
    expect(r.warnings.find((x) => x.code === 'room.ventilation')?.severity).toBe('info');
    expect(r.warnings.find((x) => x.code === 'room.area')?.severity).toBe('info');
  });

  test('pé-direito abaixo da norma no teto inclinado cita mínimo e média', () => {
    const r = run(
      { kind: 'gable_mezzanine', width: 6.5, depth: 8.5, wallHeight: 2.8, roofPitchDeg: 35 },
      {
        levels: [
          { id: 'L0', elevation: 0, floor: 'polished_concrete' },
          { id: 'L1', elevation: 2.8, polygon: [[0, 5], [6.5, 5], [6.5, 8.5], [0, 8.5]], deck: 'osb18' },
        ],
        rooms: [{ id: 'm', level: 'L1', use: 'bedroom', seed: [3, 7] }],
      },
    );
    const w = r.warnings.find((x) => x.code === 'room.ceiling');
    expect(w?.message).toMatch(/mínimo de .* médio de/);
  });
});

describe('acabamentos', () => {
  const inner = [
    wall('i1', [1, 1], [4, 1], { height: 2.5 }),
    wall('i2', [4, 1], [4, 4], { height: 2.5 }),
    wall('i3', [4, 4], [1, 4], { height: 2.5 }),
    wall('i4', [1, 4], [1, 1], { height: 2.5 }),
  ];
  const line = (r: ReturnType<typeof run>, id: string) => r.quantities.lines.find((l) => l.itemId === id);

  test('piso vinílico de 3 × 3 dá 9 m² líquidos; pintura = perímetro × altura − aberturas', () => {
    const r = run(gable, {
      walls: inner,
      openings: [{ id: 'd', host: 'i1', type: 'door', offset: 1, width: 0.9, height: 2.1 }],
      rooms: [room('q', [2.5, 2.5], 'bedroom', { floor: 'finish_floor_vinyl', walls: 'finish_wall_paint' })],
    });
    expect(line(r, 'finish_floor_vinyl')!.netQty).toBeCloseTo(9, 6);
    expect(line(r, 'finish_wall_paint')!.netQty).toBeCloseTo(12 * 2.5 - 0.9 * 2.1, 6);
    expect(line(r, 'finish_floor_vinyl')!.hostIds).toEqual(['q']);
  });

  test('sem escolha, nada é orçado', () => {
    const r = run(gable, { walls: inner, rooms: [room('q', [2.5, 2.5], 'bedroom')] });
    expect(r.quantities.lines.filter((l) => l.itemId.startsWith('finish_'))).toEqual([]);
  });

  test('fachada e forro de lambri do A-frame', () => {
    const r = run(
      {
        kind: 'a_frame', width: 6, depth: 9, ridgeHeight: 7.5, kneeWallHeight: 0.6, frontGable: 'glazed', backGable: 'closed',
        annexes: [{ side: 'right', width: 2.5, length: 8, offset: 0.5, height: 3.17, pitchDeg: 12, eave: 0.4 }],
      },
      {
        openings: [{ id: 'o2', host: 'annex-right-side', type: 'window', offset: 1.4, width: 1.2, height: 1, sill: 1 }],
        finishes: { facade: 'finish_facade_wood', interiorRoof: 'finish_ceiling_wood' },
      },
    );
    const exp = r.model.walls
      .filter((w) => w.kind !== 'interior' && w.assemblyId !== 'gable_glazed')
      .reduce((s, w) => s + wallAreas(w, r.model.openings.filter((o) => o.valid && o.hostId === w.id)).net, 0);
    expect(exp).toBeGreaterThan(20);
    expect(line(r, 'finish_facade_wood')!.netQty).toBeCloseTo(exp, 6);
    expect(r.model.walls.some((w) => w.id.startsWith('annex-right-'))).toBe(true);
    const roofs = r.model.roofPlanes.filter((p) => p.isWall);
    expect(roofs.length).toBeGreaterThan(0);
    expect(line(r, 'finish_ceiling_wood')!.netQty).toBeCloseTo(roofs.reduce((s, p) => s + p.area, 0), 6);
  });
});

function mkAssemblyWet(): string {
  return mk(gable).system.assemblies.wet;
}
