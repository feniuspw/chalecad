import { describe, expect, it } from 'vitest';
import { getCatalog } from '@chalecad/catalog';
import { computeAll } from '@chalecad/engine';
import { DEFAULT_ANSWERS } from '../project/wizard/answers';
import { generateProject } from '../project/wizard/generate';
import { buildPlumbingImages, buildPlumbingPdf } from './plumbing';

const project = generateProject({ ...DEFAULT_ANSWERS, style: 'gable', bedrooms: 2, mezzanine: 'sleep', bathUp: true }).project;
project.installations.enabled = true;
const results = computeAll(project, getCatalog());

describe('PDF da hidráulica', () => {
  it('monta a tabela de pressão e o DISCLAIMER', () => {
    const d = buildPlumbingPdf(project, results)!;
    expect(d.pressure.length).toBe(results.installations!.plumbing!.water.points.length);
    expect(d.pressure[0]).toMatchObject({ status: expect.stringMatching(/Atende|Não atende/), mca: expect.stringMatching(/^\d+,\d{2}$/) });
    expect(d.disclaimer).toMatch(/não substitui projeto estrutural com ART/i);
    expect(d.tank.map((t) => t.label)).toContain("Caixa d'água");
    expect(d.fileName).toMatch(/-hidraulica\.pdf$/);
  });

  it('uma planta por nível com tubos, DN, caixa d\'água e selos', async () => {
    const svgs: string[] = [];
    const imgs = await buildPlumbingImages(project, results, async (svg) => {
      svgs.push(svg);
      return 'data:image/png;base64,AAAA';
    });
    expect(imgs.length).toBeGreaterThanOrEqual(2);
    const all = svgs.join('\n');
    expect(all).toContain('data-role="plumbing"');
    expect(all).toMatch(/Ø\d+/);
    expect(all).toMatch(/CX 1000 L/);
    expect(all).toMatch(/m\.c\.a\. · \d+,\d kPa/);
    expect(all).toMatch(/CI · saída/);
  });

  it('sem hidráulica calculada devolve null', () => {
    expect(buildPlumbingPdf(project, { ...results, installations: null })).toBeNull();
  });
});
