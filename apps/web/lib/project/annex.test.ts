import { describe, expect, test } from 'vitest';
import { produce } from 'immer';
import { getCatalog } from '@chalecad/catalog';
import { computeAll, type Project } from '@chalecad/engine';
import { addAnnex, annexInfo, annexLimits, fitAnnex, patchAnnex, removeAnnex } from './annex';
import { patchTypology, switchTypology } from './edit';
import { hostLength, planBounds } from './geometry';
import { createProject } from './templates';

let n = 0;
const ids = (p: string) => `${p}-${++n}`;
const aFrameT = (p: Project) => {
  if (p.typology.kind !== 'a_frame') throw new Error('esperava A-frame');
  return p.typology;
};

describe('anexos laterais do A-frame', () => {
  const base = createProject('a_frame', { width: 6.5, depth: 9, ridgeHeight: 7, annexSides: ['left', 'right'] }, ids);

  test('template cria os dois anexos, janelas neles e o motor calcula', () => {
    const t = aFrameT(base);
    expect(t.annexes.map((a) => a.side)).toEqual(['left', 'right']);
    expect(base.openings.filter((o) => o.host.startsWith('annex-'))).toHaveLength(2);
    const r = computeAll(base, getCatalog());
    expect(r.model.openings.every((o) => o.valid)).toBe(true);
    expect(r.model.builtArea).toBeGreaterThan(6.5 * 9 + 29);
    expect(r.budget.total).toBeGreaterThan(0);
  });

  test('limites batem com o motor: altura máxima e lado baixo mínimo', () => {
    const t = aFrameT(base);
    const a = t.annexes[0]!;
    const lim = annexLimits(t, a);
    const tall = fitAnnex(t, { ...a, height: 10 })!;
    expect(tall.height).toBeCloseTo(lim.heightMax, 2);
    expect(() => computeAll(produce(base, (d) => void (aFrameT(d).annexes[0] = tall)), getCatalog())).not.toThrow();
    const wide = fitAnnex(t, { ...a, width: 5, pitchDeg: 25, height: 2.4 })!;
    expect(annexInfo(t, wide).lowHeight).toBeGreaterThanOrEqual(2);
  });

  test('A-frame baixo demais não aceita anexo', () => {
    const low = createProject('a_frame', { width: 2.4, depth: 6, ridgeHeight: 3 }, ids);
    let ok = true;
    produce(low, (d) => void (ok = addAnnex(d, 'left')));
    expect(ok).toBe(false);
  });

  test('mudar a cumeeira reajusta os anexos e o projeto continua calculando', () => {
    const p = produce(base, (d) => void patchTypology(d, { ridgeHeight: 4.5 }));
    expect(() => computeAll(p, getCatalog())).not.toThrow();
    const q = produce(base, (d) => void patchTypology(d, { depth: 4 }));
    for (const a of aFrameT(q).annexes) expect(a.offset + a.length).toBeLessThanOrEqual(4 + 1e-9);
    expect(() => computeAll(q, getCatalog())).not.toThrow();
  });

  test('editar, remover e limites de planta', () => {
    const p = produce(base, (d) => patchAnnex(d, 'left', { length: 20, offset: 7 }));
    const a = aFrameT(p).annexes[0]!;
    expect(a.length).toBe(9);
    expect(a.offset).toBe(0);
    expect(planBounds(p.typology).x0).toBe(-a.width);
    expect(hostLength(p, 'annex-left-side')).toBeCloseTo(9, 9);
    const r = produce(base, (d) => removeAnnex(d, 'right'));
    expect(aFrameT(r).annexes).toHaveLength(1);
    expect(r.openings.some((o) => o.host.startsWith('annex-right-'))).toBe(false);
  });

  test('mureta interrompida: comprimento dos trechos', () => {
    const p = createProject('a_frame', { width: 7, depth: 9, ridgeHeight: 7, kneeWallHeight: 1.5, annexSides: ['left'] }, ids);
    const a = aFrameT(p).annexes[0]!;
    expect(hostLength(p, 'ext-left')).toBeCloseTo(9 - a.offset - a.length, 9);
    expect(hostLength(p, 'ext-left-2')).toBeCloseTo(a.offset, 9);
    expect(hostLength(p, 'ext-right')).toBe(9);
  });

  test('escada herdada de duas águas volta para baixo da cumeeira, subindo até o mezanino', () => {
    const gable = createProject('gable_mezzanine', { width: 6, depth: 9, mezzanine: true }, ids);
    const p = produce(gable, (d) => {
      switchTypology(d, 'a_frame', ids);
      patchTypology(d, { ridgeHeight: 7.5 });
    });
    const s = p.stairs[0]!;
    expect(s.position[0]).toBeGreaterThan(2);
    expect(s.position[0]).toBeLessThan(4);
    expect(computeAll(p, getCatalog()).model.stairs).toHaveLength(1);
  });
});
