import { describe, expect, it } from 'vitest';
import { computeAll, Project } from '@chalecad/engine';
import { getCatalog } from '@chalecad/catalog';
import { PRESETS, findPreset } from './index';
import { cropElevation, presetThumbnailSvg, stripAnnotations } from './thumbnail';

const catalog = getCatalog();

describe.each(PRESETS.map((p) => [p.id, p] as const))('modelo pronto %s', (_id, preset) => {
  const project = preset.build();
  const results = computeAll(project, catalog);

  it('valida no schema e sobrevive a um ciclo JSON', () => {
    expect(Project.safeParse(project).success).toBe(true);
    expect(Project.parse(JSON.parse(JSON.stringify(project)))).toEqual(project);
    expect(project.meta.name.length).toBeGreaterThan(0);
  });

  it('o motor roda sem alerta de erro', () => {
    const errors = results.warnings.filter((w) => w.severity === 'error');
    expect(errors.map((w) => `${w.code}: ${w.message}`)).toEqual([]);
  });

  it('todos os cômodos são fechados (contorno resolvido)', () => {
    expect(project.rooms.length).toBeGreaterThanOrEqual(2);
    for (const r of results.model.rooms) {
      expect(r.polygon, `cômodo "${r.name}"`).not.toBeNull();
      expect(r.area).toBeGreaterThan(1.5);
    }
    expect(results.model.rooms.some((r) => r.use === 'bathroom')).toBe(true);
    expect(results.model.rooms.some((r) => r.use === 'bedroom') || project.furniture.some((f) => f.item.includes('bed'))).toBe(true);
  });

  it('móveis existem no catálogo, sem colisão nem parede atravessada', () => {
    expect(project.furniture.length).toBeGreaterThanOrEqual(12);
    const ids = new Set(catalog.furniture.map((f) => f.id));
    for (const f of project.furniture) expect(ids.has(f.item), f.item).toBe(true);
    const bad = results.warnings.filter((w) => ['furniture.collision', 'furniture.wall', 'furniture.outside', 'furniture.unknown', 'furniture.stair', 'furniture.door', 'furniture.headroom'].includes(w.code));
    expect(bad.map((w) => `${w.code}: ${w.message}`)).toEqual([]);
  });

  it('acabamentos definidos', () => {
    expect(project.finishes.facade).toBeDefined();
    expect(project.rooms.every((r) => r.floor || r.use === 'bathroom')).toBe(true);
  });

  it('custo e área de exibição batem com o motor (custo: ±15%)', () => {
    const ratio = results.budget.total / preset.estimatedCost;
    expect(ratio, `total calculado R$ ${Math.round(results.budget.total)} x constante R$ ${preset.estimatedCost}`).toBeGreaterThan(0.85);
    expect(ratio).toBeLessThan(1.15);
    expect(Math.abs(results.model.builtArea - preset.area)).toBeLessThan(0.5);
  });

  it('gera um novo projeto a cada chamada e a miniatura é um SVG', () => {
    expect(preset.build()).toEqual(project);
    expect(preset.build()).not.toBe(project);
    expect(presetThumbnailSvg(project).startsWith('<svg')).toBe(true);
  });
});

describe('catálogo de modelos', () => {
  it('são 5, com ids únicos e uma descrição curta', () => {
    expect(PRESETS).toHaveLength(5);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(5);
    for (const p of PRESETS) expect(p.description.length).toBeLessThan(110);
    expect(findPreset('l-house')?.kind).toBe('combined');
    expect(findPreset('nada')).toBeUndefined();
  });

  it('cobre as tipologias pedidas', () => {
    expect(PRESETS.map((p) => p.kind).sort()).toEqual(['a_frame', 'a_frame', 'combined', 'gable_mezzanine', 'gambrel']);
    const wings = PRESETS.find((p) => p.id === 'aframe-wings')!.build();
    expect(wings.typology.kind === 'a_frame' && wings.typology.annexes.map((a) => a.side).sort()).toEqual(['left', 'right']);
  });
});

describe('miniatura', () => {
  it('cropElevation recorta no quadro 3:2, troca viewBox/width/height e mantém o desenho', () => {
    const out = cropElevation({ svg: '<svg xmlns="x" viewBox="0 0 500 400" width="500" height="400"><g/></svg>', width: 500, height: 400 });
    // desenho 318 x 212 já tem 3:2
    expect(out).toContain('viewBox="96 62 318 212"');
    expect(out).toContain('width="100%"');
    expect(out.endsWith('<g/></svg>')).toBe(true);
    const wide = cropElevation({ svg: '<svg viewBox="0 0 1000 300"><g/></svg>', width: 1000, height: 300 }, 1.5);
    const [, , w, h] = /viewBox="([^"]+)"/.exec(wide)![1]!.split(' ').map(Number);
    expect(w! / h!).toBeCloseTo(1.5, 1);
  });

  it('tira textos, cotas, escala e o fundo branco', () => {
    const svg = '<svg><rect x="0" y="0" width="9" height="9" fill="#ffffff"/><g data-role="dim-outer"><line/><text>1,00</text></g><g data-role="scale-bar"><rect/></g><text>FACHADA</text><polygon data-role="roof"/></svg>';
    expect(stripAnnotations(svg)).toBe('<svg><polygon data-role="roof"/></svg>');
  });

  it('a miniatura gerada de cada modelo não tem texto', () => {
    for (const p of PRESETS) {
      const svg = presetThumbnailSvg(p.build());
      expect(svg).not.toContain('<text');
      expect(svg).toContain('data-role="roof"');
    }
  });
});
