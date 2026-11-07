// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildConstructionGuide, buildEngineerPackage, computeAll } from '@chalecad/engine';
import { getCatalog } from '@chalecad/catalog';
import { createProject } from '../../lib/project/templates';
import { guideToMarkdown, packageToMarkdown } from './markdown';

const catalog = getCatalog();
const project = createProject('gable_mezzanine', { name: 'Chalé Teste' });
const results = computeAll(project, catalog);

describe('relatórios em Markdown', () => {
  it('roteiro de obra', () => {
    const guide = buildConstructionGuide(project, results, catalog);
    const md = guideToMarkdown(guide, results.quantities.lines);
    expect(md).toContain('# Roteiro de obra: Chalé Teste');
    expect(md).toContain('## Compre primeiro');
    expect(md).toContain('### 1. Locação e gabarito');
    expect(md).toContain(guide.disclaimer);
  });

  it('pacote do engenheiro', () => {
    const pkg = buildEngineerPackage(project, results, catalog);
    const md = packageToMarkdown(pkg);
    expect(md).toContain('# Pacote para o engenheiro');
    expect(md).toContain('| Verificação |');
    expect(md).toContain('## Perguntas em aberto');
    expect(md).toContain(pkg.artNotice);
  });
});
