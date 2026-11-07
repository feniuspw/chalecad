import { describe, expect, it } from 'vitest';
import { getCatalog } from '@chalecad/catalog';
import { computeAll, type BuildingModel, type Project } from '@chalecad/engine';
import { createProject } from '../project/templates';
import { deriveLevels, elevationSvg, planSvg } from './index';

/** Verifica que o XML é bem formado (tags balanceadas, atributos entre aspas). */
function assertWellFormed(svg: string) {
  expect(svg.startsWith('<svg ')).toBe(true);
  expect(svg.endsWith('</svg>')).toBe(true);
  const stack: string[] = [];
  const re = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g;
  let last = 0;
  for (const m of svg.matchAll(re)) {
    expect(svg.slice(last, m.index)).not.toMatch(/[<>]/); // nada de lixo entre as tags
    last = m.index + m[0].length;
    const [, close, name, , self] = m;
    if (self) continue;
    if (close) expect(stack.pop()).toBe(name);
    else stack.push(name!);
  }
  expect(stack).toEqual([]);
  expect(svg).not.toMatch(/NaN|undefined|Infinity/);
}

const build = (p: Project) => computeAll(p, getCatalog()).model;
const count = (s: string, needle: string) => s.split(needle).length - 1;

describe('planta 2D', () => {
  const project = createProject('gable_mezzanine');
  const model = build(project);

  it('deduz os níveis do modelo, do mais baixo ao mais alto', () => {
    expect(deriveLevels(model).map((l) => l.id)).toEqual(['L0', 'L1']);
    expect(deriveLevels(model, project).map((l) => l.name)).toEqual(['Térreo', 'Mezanino']);
  });

  it('térreo: SVG válido com paredes, hachura, aberturas, escada, mezanino tracejado, cotas, norte e escala', () => {
    const { svg, width, height } = planSvg(model, { project });
    assertWellFormed(svg);
    expect(width).toBeGreaterThan(300);
    expect(height).toBeGreaterThan(300);
    expect(svg).toContain('PLANTA — TÉRREO');
    expect(svg).toContain('<pattern id="p-hatch"');
    expect(svg).toContain('fill="url(#p-hatch)"');
    expect(count(svg, 'data-role="opening-window"')).toBe(model.openings.filter((o) => o.type === 'window').length);
    expect(count(svg, 'data-role="opening-door"')).toBe(model.openings.filter((o) => o.type === 'door').length);
    expect(svg).toContain('<path d="M'); // arco de giro da porta
    expect(svg).toContain('data-role="stair"');
    expect(svg).toContain('SOBE');
    expect(svg).toContain('MEZANINO ACIMA');
    expect(svg).toContain('stroke-dasharray="7 4"');
    expect(svg).toContain('data-role="dim-outer"');
    expect(svg).toContain('data-role="dim-inner"');
    expect(svg).toContain('data-role="north"');
    expect(svg).toContain('data-role="scale-bar"');
    // cota total externa: face a face (6,50 + espessura)
    const w = model.walls.find((x) => x.id === 'ext-front')!;
    expect(svg).toContain(`>${(6.5 + w.thickness).toFixed(2).replace('.', ',')}<`);
  });

  it('janelas têm linha tripla', () => {
    const one = { ...model, openings: model.openings.filter((o) => o.type === 'window').slice(0, 1) };
    const { svg } = planSvg(one);
    const g = svg.match(/data-role="opening-window"[^>]*>(.*?)<\/g>/)![1]!;
    // 2 batentes + 3 linhas
    expect(count(g, '<line')).toBe(5);
  });

  it('mezanino: piso preenchido, nome, área e escada tracejada; sem abertura do térreo', () => {
    const { svg } = planSvg(model, { levelId: 'L1', project });
    assertWellFormed(svg);
    expect(svg).toContain('PLANTA — MEZANINO');
    expect(svg).toContain('data-role="mezzanine-floor"');
    expect(svg).toContain('DESCE');
    expect(svg).not.toContain('data-role="opening-window"');
    expect(svg).not.toContain('MEZANINO ACIMA');
  });

  it('A-frame (empenas) e outros ids de prefixo', () => {
    const m = build(createProject('a_frame'));
    const { svg } = planSvg(m, { idPrefix: 'x1' });
    assertWellFormed(svg);
    expect(svg).toContain('id="x1-hatch"');
    expect(svg).toContain('data-role="opening-door"');
  });

  it('modelo vazio não quebra', () => {
    const empty: BuildingModel = { ...model, walls: [], openings: [], stairs: [], slabs: [] };
    assertWellFormed(planSvg(empty).svg);
  });
});

describe('fachadas', () => {
  const model = build(createProject('gable_mezzanine'));

  it('frontal: contorno, telhado, aberturas, níveis e cotas', () => {
    const { svg } = elevationSvg(model, 'front');
    assertWellFormed(svg);
    expect(svg).toContain('FACHADA FRONTAL');
    expect(svg).toContain('data-role="roof"');
    expect(svg).toContain('data-id="ext-front"');
    expect(count(svg, 'data-role="opening-window"')).toBe(2);
    expect(count(svg, 'data-role="opening-door"')).toBe(1);
    expect(svg).toContain('±0,00');
    expect(svg).toContain('+2,80');
    expect(svg).toContain('data-role="dim-outer"');
    expect(svg).toContain('data-role="ground"');
  });

  it('lateral direita mostra as janelas da parede da direita', () => {
    const { svg } = elevationSvg(model, 'right');
    assertWellFormed(svg);
    expect(svg).toContain('FACHADA LATERAL DIREITA');
    expect(svg).toContain('data-id="ext-right"');
    expect(count(svg, 'data-role="opening-window"')).toBe(2);
  });

  it('posterior e esquerda são válidas, A-frame também', () => {
    for (const side of ['back', 'left'] as const) assertWellFormed(elevationSvg(model, side).svg);
    const a = build(createProject('a_frame'));
    for (const side of ['front', 'back', 'left', 'right'] as const) assertWellFormed(elevationSvg(a, side).svg);
  });
});
