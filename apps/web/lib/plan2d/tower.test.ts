import { describe, expect, it } from 'vitest';
import { computeAll } from '@chalecad/engine';
import type { BuildingModel } from '@chalecad/engine';
import { getCatalog } from '@chalecad/catalog';
import { generateProject } from '../project/wizard/generate';
import { DEFAULT_ANSWERS } from '../project/wizard/answers';
import { planSvg } from './plan';

const catalog = getCatalog();

describe('planta: torre da caixa d\'água', () => {
  const project = generateProject({ ...DEFAULT_ANSWERS, style: 'gable', bedrooms: 2, mezzanine: 'sleep', bathUp: true }).project;
  const model = computeAll(project, catalog).model;

  it('desenha o contorno tracejado com o rótulo no nível do mezanino (onde ela se apoia)', () => {
    const upper = planSvg(model, { levelId: 'L1', project }).svg;
    expect(upper).toContain('data-role="water-tower"');
    expect(upper).toMatch(/Caixa d.{1,6}água/);
    expect(upper).toContain('stroke-dasharray="6 3"');
    const ground = planSvg(model, { levelId: 'L0', project }).svg;
    expect(ground).not.toContain('data-role="water-tower"');
  });

  it('com um modelo montado à mão (sem mezanino sob a torre) aparece no térreo', () => {
    const hand: BuildingModel = {
      ...model,
      slabs: model.slabs.filter((s) => s.kind !== 'mezzanine'),
      extras: [{ id: 'x1', kind: 'water_tower', posts: [], segments: [[1, 1, 2, 1], [2, 1, 2, 2], [2, 2, 1, 2], [1, 2, 1, 1]].map(([a, b, c, d]) => ({ from: [a!, b!] as [number, number], to: [c!, d!] as [number, number], height: 3, thickness: 0.1, baseZ: 0, material: 'board' as const })) }],
    };
    expect(planSvg(hand, { levelId: 'L0' }).svg).toContain('data-role="water-tower"');
  });
});
