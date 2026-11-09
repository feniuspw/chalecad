import { describe, expect, test } from 'vitest';
import { avgLux, gridPositions, luminairesNeeded, roomDims, roomIndex, suggestRoomLighting, utilization } from '../../../src/installations/electrical/lighting';
import { pointInPolygon } from '../../../src/geometry';
import { testCatalog } from '../../helpers/catalog';
import { buildModel } from '../../../src/model';
import { ceilingZAt } from '../../../src';
import type { RoomModel } from '../../../src/schema/results';
import { computeAll } from '../../../src/compute';
import { house } from './house';

const k = testCatalog.constants.electrical;
const room = (w: number, d: number, use = 'living', avg = 2.6) => ({ use, area: w * d, ceiling: { min: avg, avg, max: avg }, polygon: [[0, 0], [w, 0], [w, d], [0, d]] }) as never;

describe('luminotécnica', () => {
  test('índice do recinto K = c·l / (h·(c+l)) e Fu por interpolação', () => {
    expect(roomIndex(4, 5, 1.85)).toBeCloseTo(1.2012, 3);
    expect(utilization(1.0, k)).toBe(0.5);
    expect(utilization(1.125, k)).toBeCloseTo(0.53, 6);
    expect(utilization(0.1, k)).toBe(0.36); // abaixo da tabela vale a ponta
    expect(utilization(9, k)).toBe(0.8);
  });

  test('E = Φ·Fu·Fm/A', () => {
    expect(avgLux(7200, 0.55, 0.8, 20)).toBeCloseTo(158.4, 6);
  });

  test('número de luminárias para o alvo: sala 4 x 5 com 1.800 lm', () => {
    // K = 1,2; Fu ≈ 0,55; sala a 200 lx (NBR ISO/CIE 8995-1): 200 x 20 m² / (1.800 x 0,548 x 0,8) = 5,1 → 6
    expect(luminairesNeeded(room(4, 5), 1800, k)).toBe(6);
    // cozinha pede 500 lx na bancada e plano a 0,90 m
    expect(luminairesNeeded(room(3, 4, 'kitchen'), 1600, k)).toBeGreaterThanOrEqual(3);
  });

  test('grade: Nx ≈ √(n·c/l), primeira luminária a metade do espaçamento da parede', () => {
    const poly: [number, number][] = [[0, 0], [4, 0], [4, 5], [0, 5]];
    const g = gridPositions(poly, 4, [2, 2.5]);
    expect(g).toHaveLength(4);
    expect(g.map((p) => p[0])).toEqual([1, 3, 1, 3]);
    expect(g.map((p) => p[1])).toEqual([1.25, 1.25, 3.75, 3.75]);
    expect(gridPositions(poly, 1, [2, 2.5])).toEqual([[2, 2.5]]);
  });

  test('cômodo em L descarta posições fora do polígono e adensa a grade até sobrarem n dentro', () => {
    const L: [number, number][] = [[0, 0], [6, 0], [6, 2], [2, 2], [2, 6], [0, 6]];
    const g = gridPositions(L, 9, [1, 1]);
    for (const p of g) expect(pointInPolygon(p, L, 0)).toBe(true);
    expect(g.length).toBeGreaterThanOrEqual(9);
  });

  test('no projeto gerado, cada cômodo passa do mínimo e a densidade fica razoável (W/m²)', () => {
    const e = computeAll(house(), testCatalog).installations!.electrical!;
    for (const l of e.lighting) {
      expect(l.avgLux).toBeGreaterThanOrEqual(l.minLux);
      expect(l.watts / l.area).toBeLessThan(20); // cozinha a 500 lx (NBR ISO/CIE 8995-1) com K baixo chega a ~16 W/m²
      expect(l.lumens).toBeGreaterThan(0);
    }
  });
});

describe('suggestRoomLighting', () => {
  const p = house();
  const model = buildModel(p, testCatalog);
  const rm = (id: string) => model.rooms.find((r) => r.id === id)!;

  test('a mesma do gerador: posições, luminária e altura do forro local', () => {
    const e = computeAll(p, testCatalog).installations!.electrical!;
    for (const room of model.rooms) {
      const s = suggestRoomLighting(room, model, testCatalog, { luminaire: testCatalog.constants.electrical.defaultLuminaire })!;
      const gen = e.layout.points.filter((x) => x.kind === 'light' && x.id.startsWith(`auto-l-${room.id}-`));
      expect(gen.map((g) => g.position)).toEqual(s.positions);
      expect(gen.map((g) => g.luminaire)).toEqual(gen.map(() => s.luminaire));
      expect(gen.map((g) => g.height)).toEqual(s.heights);
      s.heights.forEach((h, i) => expect(h).toBeCloseTo(ceilingZAt(model, room.level, s.positions[i]!) - 0, 3));
    }
  });

  test('uma luz só cai no centroide real do polígono', () => {
    const small = { ...rm('q'), id: 'x', use: 'storage', area: 4, polygon: [[0, 0], [2, 0], [2, 2], [0, 2]], ceiling: { min: 2.6, avg: 2.6, max: 2.6 } } as never as RoomModel;
    const s = suggestRoomLighting(small, model, testCatalog)!;
    expect(s.count).toBe(1);
    expect(s.positions[0]).toEqual([1, 1]);
  });

  test('cômodo em L: posições dentro do polígono e lux abaixo do mínimo é sinalizado', () => {
    const L: [number, number][] = [[0, 0], [6, 0], [6, 2], [2, 2], [2, 6], [0, 6]];
    const room = { ...rm('s'), id: 'L', use: 'kitchen', area: 20, polygon: L, ceiling: { min: 2.6, avg: 2.6, max: 2.6 } } as never as RoomModel;
    const s = suggestRoomLighting(room, model, testCatalog)!;
    for (const pos of s.positions) expect(pointInPolygon(pos, L, 0)).toBe(true);
    expect(s.count).toBeGreaterThanOrEqual(s.needed);
    expect(s.belowMin).toBe(s.lux < s.minLux);
  });

  test('refletor externo e fita não entram sozinhos no teto interno; arandela vira a padrão', () => {
    const room = rm('s');
    expect(suggestRoomLighting(room, model, testCatalog, { luminaire: 'wall_8w' })!.luminaire).toBe(testCatalog.constants.electrical.defaultLuminaire);
    // escolhido de propósito vale
    expect(suggestRoomLighting(room, model, testCatalog, { luminaire: 'flood_30w' })!.luminaire).toBe('flood_30w');
    // cômodo grande troca para o plafon maior, nunca para refletor ou fita
    const big = { ...room, area: 60, polygon: [[0, 0], [10, 0], [10, 6], [0, 6]] } as never as RoomModel;
    expect(['plafon_18w', 'plafon_24w']).toContain(suggestRoomLighting(big, model, testCatalog)!.luminaire);
  });

  test('tabela de lux da NBR ISO/CIE 8995-1 e K pela área e perímetro reais', () => {
    const t = testCatalog.constants.electrical.lighting;
    expect(t.targetLux.kitchen).toBe(500);
    expect(t.minLux.kitchen).toBe(300);
    expect(t.targetLux.office).toBe(500);
    expect(t.targetLux.bathroom).toBe(300);
    expect(t.minLux.bathroom).toBe(200);
    expect(t.targetLux.bedroom).toBe(150);
    expect(t.targetLux.living).toBeGreaterThanOrEqual(150);
    expect(t.targetLux.living).toBeLessThanOrEqual(300);
    expect(t.targetLux.circulation).toBeGreaterThanOrEqual(100);
    expect(t.targetLux.circulation).toBeLessThanOrEqual(150);
    // retângulo: K de área/perímetro = K de c·l/(h·(c+l))
    const r = room(4, 5) as never as RoomModel;
    expect(roomDims(r, k).K).toBeCloseTo(roomIndex(4, 5, roomDims(r, k).h), 9);
    // L: K vem da área real (não do retângulo envolvente)
    const L: [number, number][] = [[0, 0], [6, 0], [6, 2], [2, 2], [2, 6], [0, 6]];
    const rl = { use: 'living', area: 20, ceiling: { min: 2.6, avg: 2.6, max: 2.6 }, polygon: L } as never as RoomModel;
    const d = roomDims(rl, k);
    expect(d.K).toBeCloseTo((2 * 20) / (d.h * 24), 9);
    expect(d.K).toBeLessThan(roomIndex(6, 6, d.h));
  });

  test('avisos de lux seguem a tabela nova: cozinha de 15 m² com 1 plafon fica abaixo de 300 lx', () => {
    const w = computeAll(house({}, { manual: true, points: [{ id: 'l1', kind: 'light', level: 'L0', position: [1.5, 5.5], height: 2.6, luminaire: 'plafon_18w', count: 1 }] }), testCatalog).warnings;
    expect(w.some((x) => x.code === 'elec.light.low' && (x.refs ?? []).includes('c'))).toBe(true);
  });
});
