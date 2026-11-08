import { describe, expect, it } from 'vitest';
import { DEFAULT_ANSWERS, suggestedBedrooms } from './answers';
import { QUESTIONS, visibleQuestions } from './questions';
import { resolveStyle } from './style';

const ids = (a: Partial<typeof DEFAULT_ANSWERS>) => visibleQuestions({ ...DEFAULT_ANSWERS, ...a }).map((q) => q.id);

describe('perguntas', () => {
  it('toda pergunta tem título, motivo e padrão que permite clicar "Próximo"', () => {
    for (const q of QUESTIONS) {
      expect(q.title.length).toBeGreaterThan(5);
      expect(q.why.length).toBeGreaterThan(20);
      if (q.kind === 'choice') expect(q.options!.length).toBeGreaterThanOrEqual(2);
    }
    expect(visibleQuestions(DEFAULT_ANSWERS).length).toBeGreaterThan(8);
  });

  it('sem mezanino não pergunta banheiro em cima', () => {
    expect(ids({ style: 'gable', mezzanine: 'sleep' })).toContain('bathUp');
    expect(ids({ style: 'gable', mezzanine: 'none' })).not.toContain('bathUp');
  });

  it('só o A-frame pergunta as laterais', () => {
    expect(ids({ style: 'aframe' })).toContain('wings');
    for (const style of ['gable', 'gambrel', 'modern'] as const) expect(ids({ style })).not.toContain('wings');
  });

  it('estilos sem mezanino pulam a pergunta do mezanino (e a do banheiro de cima)', () => {
    const i = ids({ style: 'modern', mezzanine: 'sleep', bathUp: true });
    expect(i).not.toContain('mezzanine');
    expect(i).not.toContain('bathUp');
  });

  it('quartos sugeridos: 2 pessoas por quarto', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 10].map(suggestedBedrooms)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it('"Me ajude a escolher" recomenda pelo número de quartos e orçamento, com explicação', () => {
    const r = (bedrooms: number, budget: typeof DEFAULT_ANSWERS.budget) => resolveStyle({ style: 'auto', modernRoof: 'shed', bedrooms, budget });
    expect(r(1, 'unknown').kind).toBe('aframe');
    expect(r(2, 'unknown').kind).toBe('gable');
    expect(r(3, 'unknown').kind).toBe('shed');
    expect(r(2, 'upto150').kind).toBe('shed');
    expect(r(1, 'upto150').kind).toBe('gambrel');
    expect(r(2, 'unknown').why).toBeTruthy();
  });
});
