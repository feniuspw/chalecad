import { describe, expect, it } from 'vitest';
import { buildReadme } from './readme';

const steps = [
  { path: '01-pranchas/', description: 'pranchas', ok: false, reason: 'buildSheets: não implementado' },
  { path: '02-memoriais/', description: 'memoriais', ok: true, files: ['memorial-estrutura.pdf'] },
];

describe('LEIA-ME', () => {
  it('minuta com pendências e etapa que falhou', () => {
    const t = buildReadme({ projectName: 'Chalé', date: '2026-11-09', ready: false, pending: ['Dado obrigatório: lote'], steps });
    expect(t).toContain('MINUTA — pendências abertas');
    expect(t).toContain('09/11/2026');
    expect(t).toContain('- Dado obrigatório: lote');
    expect(t).toContain('01-pranchas/: não gerado: buildSheets: não implementado');
    expect(t).toContain('memorial-estrutura.pdf');
    expect(t).toContain('projeto.chalecad.json');
    expect(t).toContain('ART');
  });
  it('pronto: sem minuta', () => {
    const t = buildReadme({ projectName: 'Chalé', date: '2026-11-09', ready: true, pending: [], steps: [steps[1]!] });
    expect(t).not.toContain('MINUTA');
    expect(t).toContain('Nenhuma pendência obrigatória.');
  });
});
