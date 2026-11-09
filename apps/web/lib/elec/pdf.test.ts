import { getCatalog } from '@chalecad/catalog';
import { describe, expect, it } from 'vitest';
import { computeProject } from '../engine/compute';
import { planSvg } from '../plan2d';
import { buildInstallationsPdf } from '../pdf/data';
import { findPreset } from '../project/templates';
import { elecPlanFromResults } from './symbols';

const project = findPreset('gable-loft')!.build();
project.installations.enabled = true;
const results = computeProject(project, getCatalog());
const level = project.levels[0]!.id;

describe('PDF e planta com a elétrica', () => {
  it('quadro de cargas com um circuito por linha, quadro e iluminação', () => {
    const pdf = buildInstallationsPdf(results)!;
    const el = results.installations!.electrical!;
    expect(pdf.electrical!.loads).toHaveLength(el.circuits.length);
    expect(pdf.electrical!.loads[0]).toMatchObject({ n: '1', breaker: expect.stringMatching(/\d+ A [BC]/) });
    expect(pdf.electrical!.panel.map((r) => r.label)).toEqual(expect.arrayContaining(['Disjuntor geral', 'DPS', 'Demanda', 'Padrão de entrada']));
    expect(pdf.electrical!.lighting.length).toBe(el.lighting.length);
  });
  it('a planta traz símbolos NBR 5444, eletrodutos e legenda', () => {
    const electrical = elecPlanFromResults(results, level)!;
    const doc = planSvg(results.model, { project, levelId: level, electrical });
    expect(doc.svg).toContain('data-role="electrical"');
    expect(doc.svg).toContain('data-role="elec-legend"');
    expect((doc.svg.match(/data-role="elec-point"/g) ?? []).length).toBe(electrical.points.length);
    expect(doc.svg).toContain('stroke-dasharray'); // linhas de comando
    expect(doc.svg).not.toContain('NaN');
  });
});
