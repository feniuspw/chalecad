import { describe, expect, test } from 'vitest';
import { buildModel } from '../../../src/model';
import { distributeCircuits, makeCtx } from '../../../src/installations/electrical';
import { demandOf, drGroups, entranceFor, feederFor, panelModules } from '../../../src/installations/electrical/panel';
import type { ElecPoint } from '../../../src/schema/project';
import { testCatalog } from '../../helpers/catalog';
import { house } from './house';

const k = testCatalog.constants.electrical;
const project = house({}, { voltage: 220 });
const ctx = makeCtx(project, buildModel(project, testCatalog), testCatalog);

const sock = (id: string, position: [number, number], extra: Partial<ElecPoint> = {}): ElecPoint => ({ id, kind: 'socket', level: 'L0', position, height: 0.3, ...extra });
const light = (id: string, position: [number, number]): ElecPoint => ({ id, kind: 'light', level: 'L0', position, height: 2.6 });
const kindsOf = (d: ReturnType<typeof distributeCircuits>) => d.circuits.map((c) => c.kind);

describe('divisão em circuitos (NBR 5410 9.5.3)', () => {
  test('iluminação separada de tomadas', () => {
    const d = distributeCircuits(ctx, [light('l1', [1.5, 1.5]), sock('s1', [1.5, 1])], [3, 1.5], new Set());
    expect(kindsOf(d).sort()).toEqual(['lighting', 'sockets']);
    expect(d.assign.get('l1')).not.toBe(d.assign.get('s1'));
  });

  test('tomadas de cozinha em circuito exclusivo (wet_sockets), sem misturar com a sala', () => {
    const d = distributeCircuits(ctx, [sock('k1', [1.5, 5.5]), sock('v1', [4.5, 5.5])], [3, 1.5], new Set());
    expect(d.assign.get('k1')).not.toBe(d.assign.get('v1'));
    expect(d.circuits.find((c) => c.id === d.assign.get('k1'))!.kind).toBe('wet_sockets');
    expect(d.circuits.find((c) => c.id === d.assign.get('v1'))!.kind).toBe('sockets');
  });

  test('TUE acima de 10 A fica isolada; abaixo, divide com as tomadas', () => {
    const d = distributeCircuits(
      ctx,
      [sock('ch', [4.5, 1], { kind: 'socket_tue', appliance: 'electric_shower', height: 2.2 }), sock('gl', [4.5, 6], { kind: 'socket_tue', appliance: 'fridge' }), sock('s1', [4.5, 7])],
      [3, 1.5],
      new Set(),
    );
    const shower = d.circuits.find((c) => c.id === d.assign.get('ch'))!;
    expect(shower.kind).toBe('tue');
    expect([...d.assign].filter(([, c]) => c === shower.id)).toHaveLength(1);
    expect(d.assign.get('gl')).toBe(d.assign.get('s1')); // geladeira de 375 VA vai com as tomadas da sala
  });

  test('limite de corrente por circuito: 10 A em tomadas gerais (2.200 VA em 220 V)', () => {
    // 30 tomadas de 100 VA = 3.000 VA: dois circuitos
    const pts = Array.from({ length: 30 }, (_, i) => sock(`s${i}`, [3.2 + (i % 5) * 0.5, 4 + Math.floor(i / 5) * 0.5]));
    const d = distributeCircuits(ctx, pts, [3, 1.5], new Set());
    expect(d.circuits.length).toBe(2);
    expect(d.circuits.every((c) => c.kind === 'sockets')).toBe(true);
  });

  test('luz de área molhada abaixo de 2,5 m (pede DR) vai para circuito próprio', () => {
    const d = distributeCircuits(ctx, [light('a', [1.5, 1.5]), { ...light('b', [4.5, 1.5]), height: 2.4 }], [3, 1.5], new Set());
    expect(d.assign.get('a')).not.toBe(d.assign.get('b'));
    expect(d.circuits.map((c) => c.name).some((n) => n.includes('molhadas'))).toBe(true);
    // a 2,5 m ou mais, a luz do banheiro fica fora do DR e vai com as outras
    const d2 = distributeCircuits(ctx, [light('a', [1.5, 1.5]), { ...light('b', [4.5, 1.5]), height: 2.6 }], [3, 1.5], new Set());
    expect(d2.assign.get('a')).toBe(d2.assign.get('b'));
  });

  test('ids auto-cN determinísticos e sem colidir com os do usuário', () => {
    const d = distributeCircuits(ctx, [light('a', [1.5, 1.5])], [3, 1.5], new Set(['auto-c1']));
    expect(d.circuits[0]!.id).toBe('auto-c2');
  });
});

describe('demanda, entrada, quadro e DR', () => {
  const info = (kind: ElecPoint['kind'], loadVA: number, appliance?: string) => ({ p: { kind, ...(appliance ? { appliance } : {}) }, loadVA }) as never;

  test('demanda: fator único pela faixa de iluminação + tomadas e fator de aquecimento pelo número de aparelhos', () => {
    // 3 kVA em luz/tomadas (faixa ≤ 3 kW: 0,66); 2 chuveiros de 5,5 kW (fator 1,0)
    const d = demandOf(k, [info('light', 1000), info('socket', 2000), info('socket_tue', 5500, 'electric_shower'), info('socket_tue', 5500, 'electric_shower'), info('socket_tue', 300, 'fridge')]);
    expect(d.groups.lightSockets.demand).toBeCloseTo(3 * 0.66, 6);
    expect(d.groups.heating.demand).toBeCloseTo(11, 6);
    expect(d.demandKw).toBeCloseTo(1.98 + 11 + 0.3, 6);
    expect(d.installedKw).toBeCloseTo(14.3, 6);
    // 3 aparelhos de aquecimento: 0,84
    const d3 = demandOf(k, Array.from({ length: 3 }, () => info('socket_tue', 5500, 'electric_shower')));
    expect(d3.groups.heating.demand).toBeCloseTo(16.5 * 0.84, 6);
  });

  test('categoria da entrada pela demanda e pela corrente por fase', () => {
    expect(entranceFor(k, 6, 220).phases).toBe(1);
    expect(entranceFor(k, 8.2, 127).phases).toBe(2); // 65 A por fase > 50 A do monofásico
    expect(entranceFor(k, 15, 220).phases).toBe(2);
    expect(entranceFor(k, 40, 220).phases).toBe(3);
  });

  test('alimentador: seção cobre o geral e a queda fica em 1% (5% − 4%)', () => {
    const f = feederFor(k, 50, 1, 15, 220, 1);
    expect(f.sectionMm2).toBe(16); // 10 mm² suporta 50 A (57 A) mas cai 1,6% em 15 m
    expect(f.voltageDropPct).toBeLessThanOrEqual(1);
    expect(feederFor(k, 50, 1, 60, 220, 1).sectionMm2).toBeGreaterThan(16);
  });

  test('quadro: módulos, reservas pela tabela e tamanho comercial', () => {
    const m = panelModules(k, 8, 0, 2, 1);
    expect(m.reserves).toBe(3); // 7 a 12 circuitos
    expect(m.ways).toBe(8 + 4 + 2 + 1);
    expect(m.size).toBe(18); // 15 + 3 reservas = 18 módulos
    expect([8, 12, 18, 24, 36, 48]).toContain(m.size);
    expect(m.size).toBeGreaterThanOrEqual(m.ways + m.reserves);
    expect(panelModules(k, 4, 0, 0, 1).reserves).toBe(2);
    expect(panelModules(k, 40, 0, 4, 1).reserves).toBe(6); // 15% de 40
  });

  test('DR por cômodo molhado, até 5 circuitos por DR e corrente pela soma', () => {
    const cs = [
      ...Array.from({ length: 6 }, (_, i) => ({ id: `k${i}`, breakerA: 10, ib: 5, room: 'cozinha' })),
      { id: 'ch', breakerA: 25, ib: 25, room: 'banho' },
      { id: 'bs', breakerA: 10, ib: 8, room: 'banho' },
    ];
    const drs = drGroups(k, cs);
    expect(drs).toHaveLength(3);
    expect(drs.find((d) => d.circuitIds.includes('ch'))!.ratingA).toBe(40); // 25 + 8 = 33 A
    expect(drs.filter((d) => d.circuitIds.some((c) => c.startsWith('k'))).map((d) => d.circuitIds.length).sort()).toEqual([1, 5]);
  });
});
