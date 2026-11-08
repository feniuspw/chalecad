// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { getCatalog } from '@chalecad/catalog';
import { computeAll } from '@chalecad/engine';
import { createProject } from '../project/templates';
import { PrepAborted, PREP_STEPS, preparePresentation, presentationMaterials, presentationSignature, releasePrepared, stableStringify, isPrepared, type PrepInput } from './presentationPrep';

function input(name = 'Casa'): PrepInput {
  const project = createProject('gable_mezzanine', { name });
  const r = computeAll(project, getCatalog());
  return { project, model: r.model, terrain: r.terrain, quality: 'high', scenario: 'field', vegetation: true };
}

const instant = () => Promise.resolve();

afterEach(() => releasePrepared());

describe('assinatura', () => {
  it('JSON estável independe da ordem das chaves', () => {
    expect(stableStringify({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: undefined } })).toBe(stableStringify({ a: { c: undefined, d: [1, { x: 1, y: 2 }] }, b: 1 }));
  });
  it('muda com o projeto, a qualidade, o cenário e a vegetação, mas não com as anotações', () => {
    const i = input();
    const sig = presentationSignature(i.project, 'high', 'field', true);
    expect(presentationSignature(structuredClone(i.project), 'high', 'field', true)).toBe(sig);
    expect(presentationSignature(i.project, 'light', 'field', true)).not.toBe(sig);
    expect(presentationSignature(i.project, 'high', 'beach', true)).not.toBe(sig);
    expect(presentationSignature(i.project, 'high', 'field', false)).not.toBe(sig);
    expect(presentationSignature({ ...i.project, meta: { ...i.project.meta, notes: 'qualquer coisa' } }, 'high', 'field', true)).toBe(sig);
    expect(presentationSignature({ ...i.project, meta: { ...i.project.meta, name: 'Outro' } }, 'high', 'field', true)).not.toBe(sig);
  });
});

describe('materiais da apresentação', () => {
  it('inclui telha, radier e o chão do cenário', () => {
    const i = input();
    const field = presentationMaterials(i.project, 'field');
    expect(field).toEqual(expect.arrayContaining(['roof_sandwich', 'concrete', 'grass', 'gravel']));
    expect(presentationMaterials(i.project, 'beach')).toContain('sand');
    expect(presentationMaterials(i.project, 'none')).not.toContain('gravel');
  });
});

describe('preparo assíncrono', () => {
  it('o progresso é crescente, chega a 1 e cede ao navegador entre as etapas', async () => {
    const seen: number[] = [];
    let yields = 0;
    const i = input();
    const r = await preparePresentation(new AbortController().signal, (p) => seen.push(p), i, {
      yieldFn: () => {
        yields++;
        return Promise.resolve();
      },
    });
    expect(seen.length).toBeGreaterThan(PREP_STEPS.length);
    for (let k = 1; k < seen.length; k++) expect(seen[k]!).toBeGreaterThanOrEqual(seen[k - 1]!);
    expect(seen[seen.length - 1]).toBeCloseTo(1, 9);
    expect(yields).toBeGreaterThan(PREP_STEPS.length);
    expect(isPrepared(r.signature)).toBe(true);
  });

  it('mesma assinatura: reentrada imediata, sem refazer as etapas', async () => {
    const i = input();
    await preparePresentation(new AbortController().signal, () => undefined, i, { yieldFn: instant });
    let yields = 0;
    const seen: number[] = [];
    await preparePresentation(new AbortController().signal, (p) => seen.push(p), i, { yieldFn: () => (yields++, Promise.resolve()) });
    expect(yields).toBe(0);
    expect(seen).toEqual([1]);
  });

  it('assinatura nova prepara de novo e invalida a anterior', async () => {
    const a = input('A');
    const b = input('B');
    const ra = await preparePresentation(new AbortController().signal, () => undefined, a, { yieldFn: instant });
    const rb = await preparePresentation(new AbortController().signal, () => undefined, b, { yieldFn: instant });
    expect(rb.signature).not.toBe(ra.signature);
    expect(isPrepared(ra.signature)).toBe(false);
    expect(isPrepared(rb.signature)).toBe(true);
  });

  it('cancelar interrompe com PrepAborted e não deixa nada preparado', async () => {
    const ac = new AbortController();
    const i = input();
    let n = 0;
    const p = preparePresentation(ac.signal, () => undefined, i, {
      yieldFn: () => {
        if (++n === 3) ac.abort();
        return Promise.resolve();
      },
    });
    await expect(p).rejects.toBeInstanceOf(PrepAborted);
    expect(isPrepared(presentationSignature(i.project, 'high', 'field', true))).toBe(false);
  });

  it('já abortado antes de começar também rejeita', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(preparePresentation(ac.signal, () => undefined, input(), { yieldFn: instant })).rejects.toBeInstanceOf(PrepAborted);
  });
});
