import { describe, expect, test } from 'vitest';
import { computeAll } from '../../../src/compute';
import { conduitDn } from '../../../src/installations/electrical/conduits';
import { roomLighting } from '../../../src/installations/electrical/lighting';
import { lightingLoadVA, minSockets } from '../../../src/installations/electrical/loads';
import { sizeCircuit } from '../../../src/installations/electrical/sizing';
import { ampacity, groupingFactor, peSection, tempFactor, voltageDropPct } from '../../../src/installations/electrical/tables';
import type { PointInfo } from '../../../src/installations/electrical/types';
import { testCatalog } from '../../helpers/catalog';
import { mk } from '../../helpers/inline';
import { gable } from './house';

const k = testCatalog.constants.electrical;

/** Testes de referência da pesquisa (docs/research/eletrica.md, seção 8.7). */
describe('NBR 5410: valores de referência', () => {
  test('iluminação: 6 m² → 100 VA; 9,9 → 100; 10 → 160; 14 → 220', () => {
    expect(lightingLoadVA(6, k)).toBe(100);
    expect(lightingLoadVA(9.9, k)).toBe(100);
    expect(lightingLoadVA(10, k)).toBe(160);
    expect(lightingLoadVA(14, k)).toBe(220);
  });

  test('tomadas: cozinha de 3 x 3,5 m (perímetro 13 m) → 4 pontos, 600 x 3 + 100 = 1.900 VA; sala 4 x 5 → 4 pontos', () => {
    expect(minSockets({ use: 'kitchen', area: 10.5, perimeter: 13 }, k)).toBe(4);
    expect(minSockets({ use: 'living', area: 20, perimeter: 18 }, k)).toBe(4);
    const r = computeAll(
      mk(gable, {
        walls: [{ id: 'w1', level: 'L0', from: [3.5, 0], to: [3.5, 3] }, { id: 'w2', level: 'L0', from: [0, 3], to: [3.5, 3] }],
        rooms: [{ id: 'c', level: 'L0', use: 'kitchen', seed: [1, 1] }],
        installations: { enabled: true, waterHeater: 'gas' },
      }),
      testCatalog,
    );
    const e = r.installations!.electrical!;
    const sockets = e.layout.points.filter((p) => p.kind === 'socket' || p.kind === 'socket_high');
    expect(sockets).toHaveLength(4);
    const c = e.circuits.find((x) => x.kind === 'wet_sockets')!;
    expect(c.powerVA).toBeCloseTo(1900, 6);
  });

  test('chuveiro 5.500 W em 220 V (F-N, B1, FCA 1): Ib 25 A, disjuntor 25 A, 4 mm², queda 2,69% em 20 m', () => {
    const ib = 5500 / 220;
    const s = sizeCircuit({ k, kind: 'tue', ib, method: 'B1', fca: 1, fct: 1, dropAt: (S) => voltageDropPct(k, S, 20, ib, 220), feederDropPct: 0, curve: 'B' });
    expect(ib).toBeCloseTo(25, 6);
    expect(s.breakerA).toBe(25);
    expect(s.sectionMm2).toBe(4);
    expect(s.curve).toBe('B');
    expect(s.drop).toBeCloseTo(2.69, 2);
    expect(s.overload).toBe(false);
    // com FCA 0,8 (2 circuitos) ainda 4 mm²: 32 x 0,8 = 25,6 A ≥ 25 A
    expect(sizeCircuit({ k, kind: 'tue', ib, method: 'B1', fca: 0.8, fct: 1, dropAt: () => 0, feederDropPct: 0, curve: 'B' }).sectionMm2).toBe(4);
  });

  test('o mesmo chuveiro em 127 V: 43,3 A, disjuntor 50 A, 10 mm²', () => {
    const ib = 5500 / 127;
    const s = sizeCircuit({ k, kind: 'tue', ib, method: 'B1', fca: 1, fct: 1, dropAt: (S) => voltageDropPct(k, S, 20, ib, 127), feederDropPct: 0, curve: 'B' });
    expect(ib).toBeCloseTo(43.3, 1);
    expect(s.breakerA).toBe(50);
    expect(s.sectionMm2).toBe(10);
  });

  test('tomadas de 2.200 VA em 220 V: Ib 10 A, 2,5 mm² (mínimo de força); disjuntor de 16 A com FCA 0,65 = sobrecarga', () => {
    const ib = 2200 / 220;
    const base = { k, kind: 'sockets' as const, ib, method: 'B1' as const, fct: 1, dropAt: () => 0, feederDropPct: 0, curve: 'C' as const };
    const ok = sizeCircuit({ ...base, fca: 1 });
    expect(ok.breakerA).toBe(10);
    expect(ok.sectionMm2).toBe(2.5);
    const bad = sizeCircuit({ ...base, fca: groupingFactor(k, 4), override: { sectionMm2: 2.5, breakerA: 16 } });
    expect(groupingFactor(k, 4)).toBe(0.65);
    expect(bad.izCorrected).toBeCloseTo(15.6, 6);
    expect(bad.overload).toBe(true);
    expect(bad.reason).toBe('user');
  });

  test('ocupação: 3 circuitos de 2,5 mm² (F, N e PE) → DN 20 não serve (40%), DN 25 sim', () => {
    const sections = Array(9).fill(2.5) as number[];
    const r = conduitDn(k, sections);
    expect(r.dn).toBe(25);
    expect(r.fill).toBeLessThanOrEqual(0.4);
    // 9 x 10,2 mm² = 91,8 mm² (diâmetro 3,6 mm): 91,6 / 299 = 31% no DN 25
    expect(r.fill * 299).toBeCloseTo(91.6, 0);
  });

  test('luminotécnica: sala 4 x 5 com 4 x 1.800 lm → cerca de 158 lux', () => {
    const room = { id: 's', use: 'living', area: 20, ceiling: { min: 2.6, avg: 2.6, max: 2.6 }, polygon: [[0, 0], [4, 0], [4, 5], [0, 5]] } as never;
    const lights = Array.from({ length: 4 }, (_, i) => ({ p: { id: `l${i}`, kind: 'light', luminaire: 'x', count: 1 } }) as unknown as PointInfo);
    const kk = { ...k, luminaires: [{ id: 'x', label: 'x', type: 'plafon' as const, watts: 18, lumens: 1800, cct: 3000 }] };
    const r = roomLighting(room, lights, kk);
    expect(r.k).toBeCloseTo(1.2, 1);
    expect(r.fu).toBeCloseTo(0.55, 1);
    expect(r.avgLux).toBeGreaterThan(155);
    expect(r.avgLux).toBeLessThan(161);
    expect(r.status).toBe('ok');
  });
});

describe('tabelas', () => {
  test('capacidade, FCA, FCT e PE', () => {
    expect(ampacity(k, 4, 'B1', 2)).toBe(32);
    expect(ampacity(k, 4, 'B1', 3)).toBe(28);
    expect(ampacity(k, 1.5, 'A1', 2)).toBe(14.5);
    expect(groupingFactor(k, 1)).toBe(1);
    expect(groupingFactor(k, 3)).toBe(0.7);
    expect(groupingFactor(k, 50)).toBe(0.5);
    expect(tempFactor(k, 30)).toBe(1);
    expect(tempFactor(k, 32.5)).toBeCloseTo(0.97, 6);
    expect(peSection(10)).toBe(10);
    expect(peSection(25)).toBe(16);
    expect(peSection(70)).toBe(35);
  });

  test('queda de tensão: 6 mm², 15 m, 25 A, 220 V = 1,35%', () => {
    expect(voltageDropPct(k, 6, 15, 25, 220)).toBeCloseTo(1.35, 2);
  });

  test('queda de tensão sobe a seção: 2,5 mm² longe vira 4 mm²', () => {
    const ib = 10;
    const s = sizeCircuit({ k, kind: 'sockets', ib, method: 'B1', fca: 1, fct: 1, dropAt: (S) => voltageDropPct(k, S, 45, ib, 127), feederDropPct: 0, curve: 'C' });
    expect(s.reason).toBe('voltage_drop');
    expect(s.drop).toBeLessThanOrEqual(4);
    expect(s.sectionMm2).toBeGreaterThan(2.5);
  });
});
