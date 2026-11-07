import { describe, expect, test } from 'vitest';
import { produce } from 'immer';
import { getCatalog } from '@chalecad/catalog';
import { computeAll } from '@chalecad/engine';
import { planNormFixes } from './normfix';
import { setMezzanine } from './edit';
import { createProject } from './templates';

let n = 0;
const ids = (p: string) => `${p}-${++n}`;

// Parecido com o chalé do usuário: A-frame 6 × 9 × 7,5, cômodo à direita, mezanino a 2,6 m
const chalet = produce(createProject('a_frame', { width: 6, depth: 9, ridgeHeight: 7.5, mezzanine: true, mezzanineDepth: 3.5, annexSides: ['right'] }, ids), (d) => {
  if (d.typology.kind === 'a_frame') d.typology.annexes[0] = { ...d.typology.annexes[0]!, width: 2.5, length: 8, offset: 0.5, height: 2.6, pitchDeg: 12 };
  setMezzanine(d, { elevation: 2.6 });
});

describe('Ajustar às normas', () => {
  const plan = planNormFixes(chalet, getCatalog(), ids);
  const after = computeAll(plan.project, getCatalog());

  test('estrutura: nenhuma verificação reprovada que tinha sugestão aplicável', () => {
    expect(plan.before.fail).toBeGreaterThan(0);
    const left = after.structure!.checks.filter((c) => c.status === 'fail' && c.kind !== 'header');
    expect(left).toEqual([]);
    expect(plan.changes.some((c) => c.label === 'Caibros')).toBe(true);
  });

  test('mezanino sobe para 2,50 m livres embaixo', () => {
    const slab = after.model.slabs.find((s) => s.kind === 'mezzanine')!;
    expect(slab.topZ - slab.thickness).toBeGreaterThanOrEqual(2.5 - 1e-6);
    expect(after.warnings.some((w) => w.code === 'norm.ceiling')).toBe(false);
  });

  test('cômodo lateral: lado baixo com 2,50 m e janelas suficientes', () => {
    expect(after.warnings.some((w) => w.code === 'norm.lighting')).toBe(false);
    expect(after.model.openings.every((o) => o.valid)).toBe(true);
    expect(plan.changes.some((c) => c.label === 'Cômodo à direita')).toBe(true);
  });

  test('pendências: o que depende de decisão continua listado', () => {
    expect(plan.pending.some((p) => /vidro de segurança/.test(p))).toBe(true);
    expect(plan.pending.some((p) => /empuxo/.test(p))).toBe(true);
    expect(plan.after.warn).toBeLessThan(plan.before.warn);
  });

  test('projeto já ajustado não muda de novo', () => {
    const again = planNormFixes(plan.project, getCatalog(), ids);
    expect(again.changes).toEqual([]);
  });
});
