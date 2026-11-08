import { describe, expect, test } from 'vitest';
import { computeAll } from '../../../src/compute';
import type { ElectricalLayout } from '../../../src/schema/results';
import { testCatalog } from '../../helpers/catalog';
import { house } from './house';

type Mut = (l: ElectricalLayout) => void;

const auto = computeAll(house({}, { voltage: 220 }), testCatalog).installations!.electrical!;
const base = auto.layout;

/** Copia o traçado gerado para o projeto como `manual` (o que a interface faz) e aplica alterações. */
function manual(mut?: Mut, extra: Record<string, unknown> = {}) {
  const l = structuredClone(base) as ElectricalLayout;
  mut?.(l);
  const p = house({}, { voltage: 220, manual: true, points: l.points, conduits: l.conduits, circuits: l.circuits, ...extra });
  return computeAll(p, testCatalog);
}
const elec = (r: ReturnType<typeof manual>) => r.installations!.electrical!;
const codes = (r: ReturnType<typeof manual>) => r.warnings.filter((w) => w.code.startsWith('elec.')).map((w) => w.code);

describe('traçado manual', () => {
  test('o traçado copiado dá o mesmo resultado do gerado', () => {
    const r = elec(manual());
    expect(r.circuits.map((c) => [c.id, c.sectionMm2, c.breakerA, +c.voltageDropPct.toFixed(6)])).toEqual(
      auto.circuits.map((c) => [c.id, c.sectionMm2, c.breakerA, +c.voltageDropPct.toFixed(6)]),
    );
    expect(r.conduits.map((c) => [c.id, c.dn])).toEqual(auto.conduits.map((c) => [c.id, c.dn]));
    expect(r.layout.points).toEqual(base.points);
  });

  test('mover uma tomada para longe (com o eletroduto) aumenta o comprimento e a queda do circuito', () => {
    const sock = base.points.find((p) => p.kind === 'socket' && p.hostId === 'w1')!;
    const before = auto.circuits.find((c) => c.id === sock.circuitId)!;
    const r = elec(
      manual((l) => {
        const p = l.points.find((x) => x.id === sock.id)!;
        const old = [...p.position] as [number, number];
        p.position = [5.9, 7.9];
        for (const c of l.conduits) {
          for (const pt of [c.path[0]!, c.path[c.path.length - 1]!]) {
            if (Math.hypot(pt[0] - old[0], pt[1] - old[1]) < 0.02) {
              pt[0] = 5.9;
              pt[1] = 7.9;
            }
          }
        }
      }),
    );
    const after = r.circuits.find((c) => c.id === sock.circuitId)!;
    expect(after.lengthM).toBeGreaterThan(before.lengthM + 3);
    expect(after.voltageDropPct).toBeGreaterThan(before.voltageDropPct);
    expect(after.cable.phase).toBeGreaterThan(before.cable.phase);
  });

  test('ponto a até 30 cm de um eletroduto se liga a ele; mais longe fica sem ligação (estimado em linha reta)', () => {
    const sock = base.points.find((p) => p.kind === 'socket' && p.level === 'L0')!;
    const cond = base.conduits.find((c) => c.run === 'ceiling' && c.path.length === 2 && Math.abs(c.path[0]![0] - c.path[1]![0]) < 1e-6 && Math.abs(c.path[0]![1] - c.path[1]![1]) > 1)!;
    const mid: [number, number] = [cond.path[0]![0], (cond.path[0]![1] + cond.path[1]![1]) / 2];
    const near = (dx: number) =>
      manual((l) => {
        const p = l.points.find((x) => x.id === sock.id)!;
        p.position = [mid[0] + dx, mid[1]];
        delete p.hostId;
        l.conduits = l.conduits.filter((c) => !c.path.some((v) => Math.hypot(v[0] - sock.position[0], v[1] - sock.position[1]) < 0.02));
      });
    expect(codes(near(0.2))).not.toContain('elec.conduit.unreached');
    expect(codes(near(0.5))).toContain('elec.conduit.unreached');
  });

  test('pontos sem circuito vão para circuitos auto-* só no resultado', () => {
    const r = manual((l) => {
      for (const p of l.points) delete p.circuitId;
      l.circuits = [];
    });
    expect(elec(r).circuits.length).toBeGreaterThanOrEqual(5);
    expect(elec(r).circuits.every((c) => c.id.startsWith('auto-'))).toBe(true);
  });
});

describe('traçado manual: verificações e sobrescritas', () => {
  test('sem luz no cômodo e luz sem interruptor', () => {
    const lights = base.points.filter((p) => p.kind === 'light' && p.hostId === undefined);
    const bedroomLights = lights.filter((p) => p.position[0] < 3 && p.position[1] < 3);
    const r = manual((l) => {
      l.points = l.points.filter((p) => !bedroomLights.some((b) => b.id === p.id));
    });
    expect(codes(r)).toContain('elec.room.no_light');
    const r2 = manual((l) => {
      for (const p of l.points) if (p.kind === 'switch') p.controls = [];
    });
    expect(codes(r2)).toContain('elec.room.light_no_switch');
  });

  test('tomadas a menos do mínimo e tomada a menos de 0,60 m do box', () => {
    const living = base.points.filter((p) => p.kind === 'socket' && p.position[0] > 3 && p.position[1] > 3);
    const r = manual((l) => {
      l.points = l.points.filter((p) => !living.slice(1).some((x) => x.id === p.id));
    });
    expect(codes(r)).toContain('elec.room.sockets_min');
    const bathSock = base.points.find((p) => p.kind === 'socket_high' && p.position[0] > 3 && p.position[1] < 3)!;
    const r2 = manual((l) => {
      l.points.find((p) => p.id === bathSock.id)!.position = [5.3, 0.3];
    });
    expect(codes(r2)).toContain('elec.bath.socket_zone');
  });

  test('disjuntor de 25 A em cabo de 2,5 mm² é sobrecarga', () => {
    const c = base.circuits.find((x) => x.kind === 'sockets')!;
    const r = manual((l) => {
      Object.assign(l.circuits.find((x) => x.id === c.id)!, { sectionMm2: 2.5, breakerA: 25 });
    });
    const res = elec(r).circuits.find((x) => x.id === c.id)!;
    expect(res.sizingReason).toBe('user');
    expect(res.sectionMm2).toBe(2.5);
    expect(res.breakerA).toBe(25);
    expect(codes(r)).toContain('elec.circuit.overload');
  });

  test('cabo abaixo do mínimo e circuito de iluminação em 1,5 mm² (válido)', () => {
    const t = base.circuits.find((x) => x.kind === 'sockets')!;
    const r = manual((l) => {
      Object.assign(l.circuits.find((x) => x.id === t.id)!, { sectionMm2: 1.5 });
    });
    expect(codes(r)).toContain('elec.circuit.min_section');
    const lt = base.circuits.find((x) => x.kind === 'lighting')!;
    const r2 = manual((l) => {
      Object.assign(l.circuits.find((x) => x.id === lt.id)!, { sectionMm2: 1.5 });
    });
    expect(codes(r2)).not.toContain('elec.circuit.min_section');
  });

  test('sem DR onde a norma exige: elec.dr.missing; com DR dado pelo usuário no circuito sem exigência, vale', () => {
    const wet = base.circuits.find((x) => x.kind === 'wet_sockets')!;
    const r = manual((l) => {
      l.circuits.find((x) => x.id === wet.id)!.dr = false;
    });
    expect(codes(r)).toContain('elec.dr.missing');
    expect(elec(r).circuits.find((x) => x.id === wet.id)!.dr).toBe(false);
    const gen = base.circuits.find((x) => x.kind === 'sockets' && !elec(manual()).circuits.find((c) => c.id === x.id)!.dr)!;
    const r2 = manual((l) => {
      l.circuits.find((x) => x.id === gen.id)!.dr = true;
    });
    expect(elec(r2).circuits.find((x) => x.id === gen.id)!.dr).toBe(true);
    expect(codes(r2)).not.toContain('elec.dr.missing');
  });

  test('disjuntor e curva do usuário valem', () => {
    const sh = base.circuits.find((x) => x.kind === 'tue')!;
    const r = manual((l) => {
      Object.assign(l.circuits.find((x) => x.id === sh.id)!, { breakerA: 50, curve: 'C', sectionMm2: 6 });
    });
    const res = elec(r).circuits.find((x) => x.id === sh.id)!;
    expect([res.breakerA, res.curve, res.sectionMm2]).toEqual([50, 'C', 6]);
    expect(codes(r)).toContain('elec.circuit.overload'); // 50 A passa da capacidade de 6 mm² (41 A no máximo)
  });

  test('eletroduto: DN do usuário pequeno demais, trecho longo e curvas demais', () => {
    const big = elec(manual()).conduits.reduce((a, b) => (b.conductors > a.conductors ? b : a));
    const r = manual((l) => {
      l.conduits.find((c) => c.id === big.id)!.dn = 16;
    });
    expect(codes(r)).toContain('elec.conduit.fill');
    const c0 = base.conduits.find((c) => c.run === 'ceiling')!;
    const r2 = manual((l) => {
      const c = l.conduits.find((x) => x.id === c0.id)!;
      const [a] = c.path;
      c.path = [a!, [a![0] + 14, a![1]], [a![0] + 14, a![1] + 3], [a![0] + 10, a![1] + 3], [a![0] + 10, a![1] + 6], [a![0] + 14, a![1] + 6]];
    });
    expect(codes(r2)).toContain('elec.conduit.length');
    expect(codes(r2)).toContain('elec.conduit.bends');
  });

  test('tensão alta: cabo longo no alimentador e circuito com queda acima de 4% sobe de seção', () => {
    const near = elec(manual());
    const far = elec(manual(undefined, { feederLength: 120 }));
    expect(far.feeder.voltageDropPct).toBeGreaterThan(near.feeder.voltageDropPct);
    expect(far.circuits.every((c) => c.totalDropPct >= c.voltageDropPct)).toBe(true);
  });
});
