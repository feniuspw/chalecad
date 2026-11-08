import { describe, expect, test } from 'vitest';
import { computeAll } from '../../../src/compute';
import { computeInstallations } from '../../../src/installations';
import { buildModel } from '../../../src/model';
import { testCatalog } from '../../helpers/catalog';
import { house } from './house';

const r = computeAll(house({}, { voltage: 220 }), testCatalog);
const e = r.installations!.electrical!;
const lines = r.quantities.lines.filter((l) => l.stage === 'installations');
const net = (id: string) => lines.filter((l) => l.itemId === id).reduce((s, l) => s + l.netQty, 0);

describe('itens do orçamento elétrico', () => {
  test('cabos por seção: soma do cabo dos circuitos (com sobra por caixa)', () => {
    const bySection = new Map<number, number>();
    for (const c of e.circuits) {
      bySection.set(c.sectionMm2, (bySection.get(c.sectionMm2) ?? 0) + c.cable.phase + c.cable.neutral + c.cable.return);
      bySection.set(c.sectionMm2, (bySection.get(c.sectionMm2) ?? 0) + c.cable.pe);
    }
    for (const [s, len] of bySection) expect(net(`wire_${String(s).replace('.', '_')}`)).toBeCloseTo(len, 4);
  });

  test('eletrodutos por DN, caixas, módulos, luminárias, proteções e quadro', () => {
    const conduit = e.conduits.reduce((s, c) => s + c.length, 0);
    const total = [16, 20, 25, 32, 40].reduce((s, dn) => s + net(`conduit_${dn}`), 0);
    expect(total).toBeCloseTo(conduit, 4);
    const lights = e.layout.points.filter((p) => p.kind === 'light').length;
    expect(net('lum_plafon_18w') + net('lum_plafon_24w')).toBe(lights);
    expect(net('box_octagonal')).toBe(lights);
    const switches = e.layout.points.filter((p) => p.kind === 'switch').length;
    expect(net('switch_simple') + net('switch_two_way')).toBe(switches);
    const sockets = e.layout.points.filter((p) => p.kind === 'socket' || p.kind === 'socket_high' || p.kind === 'socket_tue').length;
    expect(net('outlet_2pt') + net('outlet_20a')).toBe(sockets);
    expect(net('box_4x2')).toBe(switches + sockets);
    expect(net('breaker')).toBe(e.circuits.length);
    expect(net('breaker_main')).toBe(1);
    expect(net('dps_275')).toBe(1);
    expect(net('breaker_dr') + net('dr_25') + net('dr_63') + net('dr_80')).toBe(e.panel.drs.length);
    expect(net(e.panel.size === 18 ? 'panel_box' : `panel_${e.panel.size}`)).toBe(1);
  });

  test('os itens elétricos estimados saem (sem contar duas vezes): luminária genérica e disjuntor de reserva', () => {
    expect(net('light_fixture')).toBe(0);
    const inst = computeInstallations(house(), buildModel(house(), testCatalog), testCatalog)!;
    expect(inst.items.filter((i) => i.itemId === 'light_fixture')).toEqual([]);
    expect(inst.items.filter((i) => i.itemId === 'breaker')).toHaveLength(1);
    // as peças hidráulicas continuam
    expect(net('pvc_water_25')).toBeGreaterThan(0);
  });

  test('todos os itens têm preço', () => {
    expect(r.budget.missingPrices).toEqual([]);
    expect(r.budget.total).toBeGreaterThan(0);
  });
});

describe('desempenho', () => {
  test('instalações de um chalé típico em menos de 15 ms (média de 20 execuções após aquecer)', () => {
    const p = house();
    const model = buildModel(p, testCatalog);
    for (let i = 0; i < 5; i++) computeInstallations(p, model, testCatalog);
    const n = 20;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) computeInstallations(p, model, testCatalog);
    const ms = (performance.now() - t0) / n;
    console.info(`[elétrica] computeInstallations: ${ms.toFixed(2)} ms`);
    expect(ms).toBeLessThan(15);
  });
});
