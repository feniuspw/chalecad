import { describe, expect, it } from 'vitest';
import { getCatalog } from '@chalecad/catalog';
import { computeAll } from '@chalecad/engine';
import { createProject } from '../project/templates';
import { buildPerformancePdf } from '../pdf/performance';
import { handPerformance } from './performance.fixture';
import {
  barFill,
  capitalZone,
  coveragePct,
  ctStatus,
  elementStatus,
  moduleSize,
  pointInPolygon,
  rainSummary,
  rainTankPosition,
  rainTankSize,
  slotTransform,
  solarLayout,
  solarPlacement,
  solarSummary,
  thermalAdvice,
  uStatus,
  worstStatus,
} from './performance';

const wall = handPerformance.thermal[0]!;
const roof = handPerformance.thermal[1]!;
const SIZE = moduleSize(2.58);

describe('status térmico', () => {
  it('verde, âmbar e vermelho', () => {
    expect(uStatus({ U: 1.1, limitU: 3.7, okU: true })).toBe('ok');
    expect(uStatus({ U: 3.5, limitU: 3.7, okU: true })).toBe('near');
    expect(uStatus({ U: 2.6, limitU: 1.5, okU: false })).toBe('fail');
    expect(ctStatus({ CT: 160, limitCT: 130, okCT: true })).toBe('ok');
    expect(ctStatus({ CT: 135, limitCT: 130, okCT: true })).toBe('near');
    expect(ctStatus({ CT: 100, limitCT: 130, okCT: false })).toBe('fail');
    expect(ctStatus({ CT: 8, limitCT: null, okCT: true })).toBe('na');
  });

  it('pior status vence e sem exigência de CT não vira cinza no elemento', () => {
    expect(worstStatus('ok', 'near', 'na')).toBe('near');
    expect(worstStatus('ok', 'fail')).toBe('fail');
    expect(elementStatus(wall)).toBe('ok');
    expect(elementStatus(roof)).toBe('fail');
    expect(elementStatus({ ...roof, okU: true, U: 1, limitCT: null })).toBe('ok');
  });

  it('barras ficam entre 0 e 1', () => {
    expect(barFill(0, 2)).toBe(0);
    expect(barFill(1.5, 1.5)).toBeCloseTo(1 / 1.5);
    expect(barFill(99, 1)).toBe(1);
    expect(barFill(1, 0)).toBe(0);
  });

  it('conselhos só para o que reprova', () => {
    expect(thermalAdvice([wall])).toEqual([]);
    const advice = thermalAdvice(handPerformance.thermal);
    expect(advice).toHaveLength(1);
    expect(advice[0]).toMatch(/Cobertura/);
    expect(thermalAdvice([{ ...wall, okCT: false }])[0]).toMatch(/capacidade térmica/);
  });
});

describe('resumos', () => {
  it('formata em pt-BR', () => {
    expect(solarSummary(handPerformance.solar!)).toMatch(/3,30 kWp · 6 módulos · R\$\s14\.000 a R\$\s17\.000 · retorno em 3,8 anos/);
    expect(rainSummary(handPerformance.rain!)).toBe('70.000 L/ano · reservatório de 5.000 L');
    expect(coveragePct(handPerformance.rain!)).toBe('62%');
  });

  it('zona da capital pelo catálogo', () => {
    const zones = getCatalog().constants.performance.thermal.zoneByUF;
    expect(capitalZone(zones, 'SC')).toBe(3);
    expect(capitalZone(zones, 'XX')).toBeNull();
  });
});

describe('solarLayout', () => {
  const inside = (poly: [number, number][], s: { u: number; v: number; w: number; h: number }, margin: number) => {
    const corners: [number, number][] = [
      [s.u - s.w / 2 - margin, s.v - s.h / 2 - margin],
      [s.u + s.w / 2 + margin, s.v - s.h / 2 - margin],
      [s.u + s.w / 2 + margin, s.v + s.h / 2 + margin],
      [s.u - s.w / 2 - margin, s.v + s.h / 2 + margin],
    ];
    return corners.every((c) => pointInPolygon(c, poly));
  };
  const overlap = (a: { u: number; v: number; w: number; h: number }, b: typeof a) => Math.abs(a.u - b.u) < (a.w + b.w) / 2 - 1e-6 && Math.abs(a.v - b.v) < (a.h + b.h) / 2 - 1e-6;

  it('água retangular: dentro do contorno, com folga de 30 cm, sem sobrepor', () => {
    const plane = { uLength: 7, vLength: 5 };
    const rect: [number, number][] = [[0, 0], [7, 0], [7, 5], [0, 5]];
    const r = solarLayout(plane, 6, SIZE);
    expect(r.slots).toHaveLength(6);
    expect(r.missing).toBe(0);
    for (const s of r.slots) expect(inside(rect, s, 0.3 - 1e-6)).toBe(true);
    for (let i = 0; i < r.slots.length; i++) for (let j = i + 1; j < r.slots.length; j++) expect(overlap(r.slots[i]!, r.slots[j]!)).toBe(false);
  });

  it('fileira centralizada na água', () => {
    const r = solarLayout({ uLength: 7, vLength: 5 }, 3, SIZE);
    const us = r.slots.map((s) => s.u);
    expect((Math.min(...us) + Math.max(...us)) / 2).toBeCloseTo(3.5, 1);
  });

  it('água do A-frame (grande, 9 x 12 m) comporta muitos módulos', () => {
    const plane = { uLength: 9, vLength: 12 };
    const r = solarLayout(plane, 20, SIZE);
    expect(r.slots).toHaveLength(20);
    const rect: [number, number][] = [[0, 0], [9, 0], [9, 12], [0, 12]];
    for (const s of r.slots) expect(inside(rect, s, 0.3 - 1e-6)).toBe(true);
    expect(r.capacity).toBeGreaterThanOrEqual(20);
  });

  it('contorno com recorte: respeita o polígono', () => {
    const outline: [number, number][] = [[0, 0], [8, 0], [8, 3], [4, 3], [4, 8], [0, 8]];
    const r = solarLayout({ uLength: 8, vLength: 8, outline }, 6, SIZE);
    expect(r.slots.length).toBeGreaterThan(0);
    for (const s of r.slots) expect(inside(outline, s, 0.3 - 1e-6)).toBe(true);
  });

  it('o que não cabe vira "missing"', () => {
    const r = solarLayout({ uLength: 3, vLength: 3 }, 4, SIZE);
    expect(r.slots.length + r.missing).toBe(4);
    expect(r.missing).toBeGreaterThan(0);
    expect(solarLayout({ uLength: 1, vLength: 1 }, 2, SIZE)).toMatchObject({ slots: [], missing: 2 });
  });

  it('transforma (u, v) na água real com 5 cm de afastamento', () => {
    const plane = { origin: [1, 2, 3] as [number, number, number], uAxis: [1, 0, 0] as [number, number, number], vAxis: [0, 0.8, 0.6] as [number, number, number] };
    const { position, normal } = slotTransform(plane, { u: 2, v: 5 });
    expect(normal[0]).toBeCloseTo(0);
    expect(normal[1]).toBeCloseTo(-0.6);
    expect(normal[2]).toBeCloseTo(0.8);
    expect(position[0]).toBeCloseTo(3);
    expect(position[1]).toBeCloseTo(2 + 4 - 0.03);
    expect(position[2]).toBeCloseTo(3 + 3 + 0.04);
  });

  it('em chalé real do motor, os módulos ficam na água indicada', () => {
    const project = createProject('gable_mezzanine', { name: 'Teste' });
    const model = computeAll(project, getCatalog()).model;
    const plane = model.roofPlanes[0]!;
    const r = solarLayout(plane, 4, SIZE);
    expect(r.slots.length).toBeGreaterThan(0);
  });
});

describe('reservatório', () => {
  it('volume proporcional ao pedido', () => {
    const vol = (l: number) => {
      const t = rainTankSize(l);
      return Math.PI * t.radius ** 2 * t.height * 1000;
    };
    expect(vol(5000)).toBeGreaterThan(vol(2000));
    expect(vol(5000)).toBeCloseTo(5000, -2);
    expect(rainTankSize(100).radius).toBeGreaterThanOrEqual(0.3);
  });

  it('fica atrás da casa, a 1 m da parede dos fundos', () => {
    const [x, y] = rainTankPosition([[0, 0], [6, 0], [6, 8], [0, 8]], 0.8);
    expect(x).toBe(3);
    expect(y - 0.8).toBeCloseTo(9);
  });
});

describe('PDF de desempenho', () => {
  it('tabela térmica e resumos', () => {
    const pdf = buildPerformancePdf(handPerformance)!;
    expect(pdf.zone).toContain('3');
    expect(pdf.thermal).toHaveLength(2);
    expect(pdf.thermal[1]).toMatchObject({ element: 'Cobertura', status: 'Reprova' });
    expect(pdf.thermal[0]!.status).toBe('Atende');
    expect(pdf.solar?.length).toBeGreaterThan(3);
    expect(pdf.rain?.length).toBeGreaterThan(3);
    expect(pdf.notice).toContain('NBR 15575');
  });

  it('sem relatório não gera seção; sem solar/chuva omite os resumos', () => {
    expect(buildPerformancePdf(null)).toBeNull();
    const pdf = buildPerformancePdf({ ...handPerformance, solar: null, rain: null })!;
    expect(pdf.solar).toBeNull();
    expect(pdf.rain).toBeNull();
  });
});

describe('solarPlacement', () => {
  it('acha a água pelo id e ignora id desconhecido', () => {
    const project = createProject('gable_mezzanine', { name: 'Teste' });
    const model = computeAll(project, getCatalog()).model;
    const id = model.roofPlanes[0]!.id;
    expect(solarPlacement(model, { roofPlaneId: id, modules: 2 }, 2.58)?.layout.slots).toHaveLength(2);
    expect(solarPlacement(model, { roofPlaneId: 'nada', modules: 2 }, 2.58)).toBeNull();
    expect(solarPlacement(model, { roofPlaneId: null, modules: 2 }, 2.58)).toBeNull();
    expect(solarPlacement(model, null, 2.58)).toBeNull();
  });
});
