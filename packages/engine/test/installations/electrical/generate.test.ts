import { describe, expect, test } from 'vitest';
import { computeAll } from '../../../src/compute';
import { buildModel } from '../../../src/model';
import { computeElectrical } from '../../../src/installations';
import { Electrical } from '../../../src/schema';
import { testCatalog } from '../../helpers/catalog';
import { house } from './house';
import { mk } from '../../helpers/inline';
import { gable } from './house';

const elecOf = (p = house()) => computeAll(p, testCatalog).installations!.electrical!;

describe('traçado gerado', () => {
  const r = computeAll(house(), testCatalog);
  const e = r.installations!.electrical!;
  const L = e.layout;

  test('todo cômodo tem luz no teto e um interruptor que a comanda', () => {
    const model = buildModel(house(), testCatalog);
    for (const room of model.rooms) {
      const lights = L.points.filter((p) => p.kind === 'light' && p.position && room.polygon && p.level === room.level);
      const inRoom = lights.filter((p) => {
        const xs = room.polygon!.map((v) => v[0]);
        const ys = room.polygon!.map((v) => v[1]);
        return p.position[0] > Math.min(...xs) && p.position[0] < Math.max(...xs) && p.position[1] > Math.min(...ys) && p.position[1] < Math.max(...ys);
      });
      expect(inRoom.length, room.id).toBeGreaterThan(0);
      for (const l of inRoom) {
        expect(L.points.some((s) => s.kind === 'switch' && s.controls?.includes(l.id)), l.id).toBe(true);
      }
    }
    expect(r.warnings.filter((w) => w.code === 'elec.room.no_light' || w.code === 'elec.room.light_no_switch')).toEqual([]);
  });

  test('interruptor junto à porta: a 0,15 m do batente e 1,10 m de altura', () => {
    const sw = L.points.find((p) => p.kind === 'switch' && p.hostId === 'w2')!;
    expect(sw.height).toBe(1.1);
    // porta de w2 vai de x = 1 a 1,8
    expect(Math.min(Math.abs(sw.position[0] - 1), Math.abs(sw.position[0] - 1.8))).toBeCloseTo(0.15, 2);
  });

  test('todos os pontos estão em algum circuito', () => {
    const ids = new Set(L.circuits.map((c) => c.id));
    for (const p of L.points.filter((x) => x.kind !== 'data')) {
      expect(p.circuitId, p.id).toBeDefined();
      expect(ids.has(p.circuitId!), p.id).toBe(true);
    }
    expect(e.circuits.reduce((n, c) => n + c.pointIds.length, 0)).toBe(L.points.length);
  });

  test('todos os pontos estão ligados ao quadro por eletroduto', () => {
    expect(r.warnings.filter((w) => w.code === 'elec.conduit.unreached')).toEqual([]);
    expect(L.conduits.length).toBeGreaterThan(L.points.length / 2);
    for (const c of e.circuits) expect(c.lengthM).toBeGreaterThan(0);
  });

  test('regras de circuitos: luz separada de tomadas, cozinha exclusiva, chuveiro isolado', () => {
    const byId = new Map(L.points.map((p) => [p.id, p]));
    for (const c of e.circuits) {
      const kinds = new Set(c.pointIds.map((id) => byId.get(id)!.kind));
      expect(kinds.has('light') && kinds.has('socket')).toBe(false);
    }
    const shower = L.points.find((p) => p.appliance === 'electric_shower')!;
    expect(shower.height).toBeGreaterThan(2);
    const sc = e.circuits.find((c) => c.id === shower.circuitId)!;
    expect(sc.kind).toBe('tue');
    expect(sc.pointIds).toEqual([shower.id]);
    expect(sc.curve).toBe('B');
    const wet = e.circuits.filter((c) => c.kind === 'wet_sockets');
    expect(wet.length).toBeGreaterThan(0);
    expect(r.warnings.filter((w) => w.code === 'elec.circuit.wet_shared' || w.code === 'elec.circuit.tue_shared' || w.code === 'elec.circuit.mixed')).toEqual([]);
  });

  test('mínimos da norma atendidos: sem erros de norma no traçado gerado', () => {
    const errors = r.warnings.filter((w) => w.code.startsWith('elec.') && w.severity === 'error');
    expect(errors.map((w) => `${w.code}: ${w.message}`)).toEqual([]);
  });

  test('ids com prefixo auto- e determinísticos', () => {
    expect(L.points.every((p) => p.id.startsWith('auto-'))).toBe(true);
    expect(L.conduits.every((c) => c.id.startsWith('auto-'))).toBe(true);
    expect(L.circuits.every((c) => c.id.startsWith('auto-'))).toBe(true);
    expect(JSON.stringify(elecOf())).toBe(JSON.stringify(e));
  });

  test('o layout é um Electrical válido (a interface o copia ao "editar à mão")', () => {
    const parsed = Electrical.parse({ manual: true, points: L.points, conduits: L.conduits, circuits: L.circuits });
    expect(parsed.points).toHaveLength(L.points.length);
    expect(parsed.conduits).toHaveLength(L.conduits.length);
  });

  test('cada eletroduto respeita 15 m − 3 m por curva e no máximo 3 curvas', () => {
    for (const c of e.conduits) {
      expect(c.bends90).toBeLessThanOrEqual(3);
      expect(c.length).toBeLessThanOrEqual(15 - 3 * c.bends90 + 1e-9);
      expect(c.fillPct).toBeLessThanOrEqual(c.fillLimitPct + 1e-9);
    }
  });

  test('FCA ≥ 0,65 no gerado (no máximo 4 circuitos por eletroduto) e quedas dentro do limite', () => {
    for (const c of e.circuits) {
      expect(c.fca).toBeGreaterThanOrEqual(0.65 - 1e-9);
      expect(c.voltageDropPct).toBeLessThanOrEqual(4);
      expect(c.totalDropPct).toBeLessThanOrEqual(5);
      expect(c.breakerA).toBeGreaterThanOrEqual(c.ib - 1e-9);
      expect(c.breakerA).toBeLessThanOrEqual(c.izCorrected + 1e-9);
    }
  });

  test('quadro: DR nos circuitos de banheiro e cozinha, DPS e reservas', () => {
    expect(e.panel.drs.length).toBeGreaterThan(0);
    const drCircuits = new Set(e.panel.drs.flatMap((d) => d.circuitIds));
    for (const c of e.circuits) expect(c.dr).toBe(drCircuits.has(c.id));
    expect(e.circuits.filter((c) => c.dr).length).toBeGreaterThanOrEqual(3);
    expect(e.panel.dps.ucV).toBe(e.voltage === 127 ? 175 : 275);
    expect(e.panel.reserves).toBeGreaterThanOrEqual(2);
    expect(e.panel.size).toBeGreaterThanOrEqual(e.panel.ways + e.panel.reserves);
    expect(e.demandKw).toBeGreaterThan(0);
    expect(e.demandKw).toBeLessThan(e.installedKw);
    expect(e.entrance.breakerA).toBeGreaterThanOrEqual(e.panel.mainBreakerA);
  });

  test('luminotécnica: todo cômodo no alvo ou acima do mínimo', () => {
    expect(e.lighting).toHaveLength(4);
    for (const l of e.lighting) expect(['ok', 'high']).toContain(l.status);
  });
});

describe('tensão', () => {
  test('127 V: chuveiro de 5.500 W gera 43 A, 10 mm² ou mais e aviso elec.shower.127v', () => {
    const r = computeAll(house({}, { voltage: 127 }), testCatalog);
    const e = r.installations!.electrical!;
    const sc = e.circuits.find((c) => c.kind === 'tue')!;
    expect(sc.ib).toBeCloseTo(43.3, 1);
    expect(sc.breakerA).toBe(50);
    expect(sc.sectionMm2).toBeGreaterThanOrEqual(10);
    expect(r.warnings.some((w) => w.code === 'elec.shower.127v')).toBe(true);
  });

  test('220 V: chuveiro de 25 A, disjuntor 25 A, curva B, sem aviso de 127 V', () => {
    const r = computeAll(house({}, { voltage: 220 }), testCatalog);
    const e = r.installations!.electrical!;
    const sc = e.circuits.find((c) => c.kind === 'tue')!;
    expect(sc.ib).toBeCloseTo(25, 1);
    expect(sc.breakerA).toBe(25);
    expect(sc.curve).toBe('B');
    expect(sc.sectionMm2).toBeGreaterThanOrEqual(4);
    expect(sc.sectionMm2).toBeLessThanOrEqual(6);
    expect(r.warnings.some((w) => w.code === 'elec.shower.127v')).toBe(false);
    expect(e.panel.dps.ucV).toBe(275);
  });

  test('sem tensão no projeto vale a da UF', () => {
    expect(elecOf(house()).voltage).toBe(127); // SP
    const p = house({ meta: { name: 'x', region: 'CE' } });
    expect(elecOf(p).voltage).toBe(220);
  });
});

describe('escada e corredor', () => {
  test('corredor de 6 m ganha interruptores em paralelo', () => {
    const p = mk(
      { kind: 'gable_mezzanine', width: 3, depth: 8, wallHeight: 2.8, roofPitchDeg: 20 },
      {
        walls: [{ id: 'w1', level: 'L0', from: [0, 7], to: [3, 7] }],
        rooms: [{ id: 'k', level: 'L0', use: 'circulation', seed: [1.5, 3.5] }],
        openings: [{ id: 'd1', host: 'w1', type: 'door', offset: 1, width: 0.8, height: 2.1 }],
        installations: { enabled: true, waterHeater: 'gas' },
      },
    );
    const sw = elecOf(p).layout.points.filter((x) => x.kind === 'switch');
    expect(sw).toHaveLength(2);
    expect(sw.every((s) => s.switchType === 'two_way')).toBe(true);
    expect(sw[0]!.controls).toEqual(sw[1]!.controls);
  });
});

test('computeElectrical sem cômodos devolve null', () => {
  const p = mk(gable, { installations: { enabled: true } });
  expect(computeElectrical(p, buildModel(p, testCatalog), testCatalog)).toBeNull();
});

