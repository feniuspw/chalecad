import { describe, expect, it } from 'vitest';
import { getCatalog } from '@chalecad/catalog';
import { DEFAULT_ANSWERS, type WizardAnswers } from './answers';
import { budgetStatus, costOfProject, cutSuggestions } from './suggestions';
import { generateProject } from './generate';

const catalog = getCatalog();
const base: WizardAnswers = { ...DEFAULT_ANSWERS, style: 'gable', bedrooms: 3, bathrooms: 2, mezzanine: 'sleep', bathUp: true, laundry: 'inside', deck: 'covered', solar: true, budget: 'upto150' };
const cost = (a: WizardAnswers) => costOfProject(generateProject(a, catalog).project, catalog).min;

describe('sugestões de corte', () => {
  const sug = cutSuggestions(base, undefined, catalog, 20);

  it('cada sugestão baixa o custo de verdade (número do motor)', () => {
    expect(sug.length).toBeGreaterThanOrEqual(4);
    const total = cost(base);
    for (const s of sug) {
      expect(s.saving).toBeGreaterThan(900);
      expect(cost(s.answers)).toBeCloseTo(total - s.saving, 0);
      expect(cost(s.answers)).toBeLessThan(total);
    }
  });

  it('o texto traz o valor e vêm ordenadas pela economia', () => {
    const bathUp = sug.find((s) => s.id === 'bathUp')!;
    expect(bathUp.text).toMatch(/banheiro de cima.*R\$ [\d.]+/);
    expect(bathUp.saving).toBeGreaterThan(5000);
    for (let i = 1; i < sug.length; i++) expect(sug[i - 1]!.saving).toBeGreaterThanOrEqual(sug[i]!.saving);
  });

  it('não sugere cortar o que a pessoa não escolheu', () => {
    const none = cutSuggestions({ ...DEFAULT_ANSWERS, style: 'modern', bedrooms: 1, deck: 'none', laundry: 'none', installations: false }, undefined, catalog, 20);
    expect(none.map((s) => s.id)).not.toContain('bathUp');
    expect(none.map((s) => s.id)).not.toContain('deckRoof');
  });

  it('compara o custo com a faixa informada', () => {
    const c = costOfProject(generateProject(base, catalog).project, catalog);
    expect(c.max).toBeGreaterThan(c.min);
    expect(budgetStatus(base, c).status).toBe('over');
    expect(budgetStatus({ ...base, budget: 'over400' }, c).status).toBe('within');
    expect(budgetStatus({ ...base, budget: 'unknown' }, c).status).toBe('unknown');
  });
});
