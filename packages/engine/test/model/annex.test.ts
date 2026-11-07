import { describe, expect, test } from 'vitest';
import { loadProject } from '../../src/load';
import { annexGeometry } from '../../src/model/annex';
import { computeAll } from '../../src/compute';
import { testCatalog } from '../helpers/catalog';
import { mk, run } from '../helpers/inline';

const DEG = Math.PI / 180;
const annex = (a: object = {}) => ({ side: 'left', width: 3, length: 5, offset: 2.5, height: 2.8, pitchDeg: 10, eave: 0.5, ...a });
const aframe = (annexes: object[], extra: object = {}) =>
  mk({ kind: 'a_frame', width: 6.5, depth: 9, ridgeHeight: 7, kneeWallHeight: 0, rake: 0.4, annexes, ...extra });

// tan do A-frame = 7 / 3,25; água do anexo a 10°: encontro a (2,8 - 0) / (tanP - tan10°) para dentro da base
const tanP = 7 / 3.25;
const ta = Math.tan(10 * DEG);
const reach = 2.8 / (tanP - ta);
const meetZ = 2.8 + reach * ta;

describe('A-frame 6,5 × 9 com anexo à esquerda 3 × 5', () => {
  const project = aframe([annex()]);
  const { model, pieces, quantities } = run(project);
  const g = annexGeometry(project.typology as never)[0]!;

  test('encontro das águas e lado baixo', () => {
    expect(g.reach).toBeCloseTo(reach, 9);
    expect(g.meetZ).toBeCloseTo(meetZ, 9);
    expect(g.lowHeight).toBeCloseTo(2.8 - 3 * ta, 9);
    // o encontro está sobre a água do A-frame
    expect(g.meetZ).toBeCloseTo(reach * tanP, 9);
  });

  test('área construída e radier incluem o anexo', () => {
    expect(model.builtArea).toBeCloseTo(6.5 * 9 + 15, 9);
    expect(model.footprint).toHaveLength(8);
    expect(quantities.areas.radier).toBeGreaterThan(73.5);
  });

  test('paredes do anexo (sem mureta, sem ext-left)', () => {
    const ids = model.walls.map((w) => w.id);
    expect(ids).toEqual(expect.arrayContaining(['annex-left-front', 'annex-left-side', 'annex-left-back']));
    expect(ids).not.toContain('ext-left');
    const front = model.walls.find((w) => w.id === 'annex-left-front')!;
    expect(front.from).toEqual([-3, 2.5]);
    expect(front.length).toBeCloseTo(3 + reach, 9);
    expect(model.walls.find((w) => w.id === 'annex-left-side')!.length).toBeCloseTo(5, 9);
  });

  test('água do A-frame recortada e água do anexo', () => {
    const a = model.roofPlanes.find((p) => p.id === 'roof-a')!;
    const b = model.roofPlanes.find((p) => p.id === 'roof-b')!;
    const cos = Math.cos(a.slopeDeg * DEG);
    expect(a.outline).toHaveLength(8);
    expect(a.area).toBeCloseTo(b.area - 5 * (reach / cos), 9);
    const r = model.roofPlanes.find((p) => p.id === 'annex-left-roof')!;
    expect(r.slopeDeg).toBeCloseTo(10, 9);
    const top = Math.max(...r.vertices.map((v) => v[2]));
    expect(top).toBeCloseTo(meetZ, 9);
  });

  test('caibros do A-frame começam no topo do recorte; caibros e verga no anexo', () => {
    const inside = pieces.filter((p) => p.hostId === 'roof-a' && p.role === 'rafter' && p.start[1] > 2.6 && p.start[1] < 7.4);
    expect(inside.length).toBeGreaterThan(5);
    for (const p of inside) expect(Math.min(p.start[2], p.end[2])).toBeCloseTo(meetZ, 6);
    expect(pieces.some((p) => p.hostId === 'roof-a' && p.role === 'header')).toBe(true);
    const annexRafters = pieces.filter((p) => p.hostId === 'annex-left-roof' && p.role === 'rafter');
    expect(annexRafters.length).toBeGreaterThanOrEqual(9);
    expect(pieces.every((p) => p.length > 0)).toBe(true);
  });

  test('parede de ponta: montantes do triângulo apoiados na água, não no chão', () => {
    const studs = pieces.filter((p) => p.hostId === 'annex-left-front' && p.role === 'stud');
    const onSlope = studs.filter((p) => p.start[0] > 0.05);
    expect(onSlope.length).toBeGreaterThan(0);
    for (const p of onSlope) expect(p.start[2]).toBeCloseTo(p.start[0] * tanP, 6);
  });

  test('cálculo completo roda e porta no anexo é válida', () => {
    const p = aframe([annex()], {});
    const r = computeAll({ ...p, openings: [{ id: 'o1', host: 'annex-left-side', type: 'door', offset: 1, width: 0.8, height: 2.1, sill: 0 }] } as never, testCatalog);
    expect(r.model.openings[0]!.valid).toBe(true);
    expect(r.budget.total).toBeGreaterThan(0);
  });
});

describe('variações', () => {
  test('mureta de 1,2 m é interrompida no anexo (ext-left + ext-left-2)', () => {
    const { model } = run(aframe([annex()], { kneeWallHeight: 1.2 }));
    const k1 = model.walls.find((w) => w.id === 'ext-left')!;
    const k2 = model.walls.find((w) => w.id === 'ext-left-2')!;
    expect(k1.from).toEqual([0, 9]);
    expect(k1.length).toBeCloseTo(1.5, 9);
    expect(k2.to).toEqual([0, 0]);
    expect(k2.length).toBeCloseTo(2.5, 9);
    expect(model.walls.find((w) => w.id === 'annex-left-front')!.outline).toHaveLength(5);
  });

  test('anexos nos dois lados, encostado na frente', () => {
    const { model } = run(aframe([annex({ offset: 0 }), annex({ side: 'right', offset: 4, length: 5 })]));
    expect(model.footprint).toHaveLength(8); // encostados na frente e no fundo: cantos colineares somem
    expect(model.walls.filter((w) => w.id.startsWith('annex-'))).toHaveLength(6);
    expect(model.roofPlanes.find((p) => p.id === 'roof-b')!.outline).toHaveLength(8);
  });

  test('erros de geometria', () => {
    expect(() => run(aframe([annex({ pitchDeg: 25, width: 5, height: 2.4 })]))).toThrow(/lado baixo/);
    expect(() => run(aframe([annex()], { kneeWallHeight: 1.5, ridgeHeight: 3.2 }))).toThrow();
  });

  test('schema: anexo passando do fundo e dois no mesmo lado', () => {
    const base = { schemaVersion: 1, meta: { name: 't' }, levels: [{ id: 'L0', elevation: 0, floor: 'polished_concrete' }] };
    const t = { kind: 'a_frame', width: 6.5, depth: 9, ridgeHeight: 7 };
    expect(loadProject({ ...base, typology: { ...t, annexes: [annex({ offset: 6 })] } }).ok).toBe(false);
    expect(loadProject({ ...base, typology: { ...t, annexes: [annex(), annex({ offset: 0, length: 2 })] } }).ok).toBe(false);
    expect(loadProject({ ...base, typology: t }).ok).toBe(true);
  });
});
