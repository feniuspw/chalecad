// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { getCatalog } from '@chalecad/catalog';
import { computeAll } from '@chalecad/engine';
import { createProject } from '../project/templates';
import { buildPdfData, buildPdfImages } from './index';

// PNG 1x1 branco
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

const project = createProject('gable_mezzanine', { name: 'Chalé da Serra' });
const results = computeAll(project, getCatalog());

describe('dados do PDF', () => {
  const data = buildPdfData(project, results, { now: new Date('2026-11-07T12:00:00Z') });

  it('resume o projeto com números do motor', () => {
    expect(data.title).toBe('Chalé da Serra');
    expect(data.fileName).toBe('chale-da-serra.pdf');
    expect(data.typologyLabel).toBe('Duas águas com mezanino');
    expect(data.dateLabel).toContain('2026');
    expect(data.kpis[1]!.value).toMatch(/R\$/);
    expect(data.areas[1]!.value).toBe(`${results.quantities.areas.built.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} m²`);
    expect(data.disclaimer).toContain('ART');
    expect(data.artNotice).toContain('ART');
  });

  it('lista de materiais cobre todas as linhas, por etapa', () => {
    const rows = data.materials.reduce((n, s) => n + s.rows.length, 0);
    expect(rows).toBe(results.quantities.lines.length);
    expect(data.materials.map((s) => s.title)).toContain('Estrutura em LSF');
  });

  it('orçamento e premissas', () => {
    expect(data.budget.rows).toHaveLength(results.budget.byStage.length);
    expect(data.budget.totals.find((t) => t.strong)?.value).toMatch(/R\$/);
    const all = data.premises.flatMap((g) => g.items.map((i) => i.label));
    expect(all).toEqual(expect.arrayContaining(['Montantes', 'Espaçamento dos montantes', 'Base de preços', 'Parede externa']));
    expect(data.premises.flatMap((g) => g.items).find((i) => i.label === 'Base de preços')?.value).toContain('Base de referência');
  });
});

describe('PDF', () => {
  it('gera plantas e fachadas e renderiza um PDF válido com páginas e aviso de ART', async () => {
    const seen: string[] = [];
    const images = await buildPdfImages(project, results, async (svg) => {
      seen.push(svg.slice(0, 4));
      return PNG;
    });
    expect(images.plans).toHaveLength(2);
    expect(images.elevations).toHaveLength(2);
    expect(seen.every((x) => x === '<svg')).toBe(true);

    const { renderToBuffer } = await import('@react-pdf/renderer');
    const { pdfElement } = await import('../../components/pdf/ChaleDocument');
    const buf = await renderToBuffer(pdfElement({ data: buildPdfData(project, results), ...images }));
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    const pages = buf.toString('latin1').match(/\/Type \/Page\b/g)?.length ?? 0;
    expect(pages).toBeGreaterThanOrEqual(8);
    expect(buf.byteLength).toBeGreaterThan(20_000);
  }, 60_000);
});

describe('tabela de cômodos', () => {
  const withRoom = {
    ...project,
    rooms: [
      { id: 'r-aaaaaaaa', level: project.levels[0]!.id, use: 'bedroom' as const, seed: [1, 1] as [number, number], floor: 'finish_floor_vinyl', walls: 'finish_wall_paint' },
      { id: 'r-bbbbbbbb', level: project.levels[0]!.id, use: 'bathroom' as const, seed: [2, 2] as [number, number] },
    ],
  };
  const res = {
    ...results,
    model: {
      ...results.model,
      rooms: [
        {
          id: 'r-aaaaaaaa', level: project.levels[0]!.id, use: 'bedroom' as const, name: 'Quarto', polygon: [[0, 0], [3, 0], [3, 3], [0, 3]] as [number, number][],
          edges: [], area: 9, perimeter: 12, ceiling: { min: 2.5, avg: 2.7, max: 2.9 }, glazing: 1, openingIds: [], wet: false,
        },
      ],
    },
  };

  it('uma linha por cômodo, com área, pé-direito médio, piso e paredes', () => {
    const data = buildPdfData(withRoom, res, { now: new Date('2026-11-07T12:00:00Z') });
    expect(data.rooms).toHaveLength(2);
    expect(data.rooms[0]).toMatchObject({ name: 'Quarto', use: 'Quarto', area: '9,00 m²', ceilingAvg: '2,70 m' });
    expect(data.rooms[0]!.floor).toContain('vinílico');
    expect(data.rooms[0]!.walls).toContain('Pintura');
    expect(data.rooms[1]).toMatchObject({ area: 'aberto', walls: 'Sem revestimento' });
    // cômodos saem na tabela própria do documento, não nas premissas
    expect(data.premises.some((g) => g.group === 'Cômodos')).toBe(false);
  });

  it('sem cômodos, nada muda', () => {
    const data = buildPdfData(project, results);
    expect(data.rooms).toEqual([]);
    expect(data.premises.some((g) => g.group === 'Cômodos')).toBe(false);
  });
});

describe('seção de instalações', () => {
  it('entra no PDF com o relatório (planta com símbolos) e fica de fora sem ele', async () => {
    const { handReport } = await import('../three/installations.fixture');
    const { renderToBuffer } = await import('@react-pdf/renderer');
    const { pdfElement } = await import('../../components/pdf/ChaleDocument');
    const withInst = { ...results, installations: { ...handReport, points: handReport.points.map((p) => ({ ...p, level: project.levels[0]!.id })) } };
    const svgs: string[] = [];
    const images = await buildPdfImages(project, withInst, async (svg) => {
      svgs.push(svg);
      return PNG;
    });
    expect(svgs.some((s) => s.includes('data-role="installations-legend"'))).toBe(true);
    const render = async (r: typeof results) => (await renderToBuffer(pdfElement({ data: buildPdfData(project, r), ...images }))).toString('latin1').match(/\/Type \/Page\b/g)?.length ?? 0;
    expect(await render(withInst)).toBe((await render(results)) + 1);
    expect(buildPdfData(project, withInst).installations?.circuits).toHaveLength(3);
    expect(buildPdfData(project, results).installations).toBeNull();
  }, 60_000);
});
