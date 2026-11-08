// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { getCatalog } from '@chalecad/catalog';
import { describeTexture, paintTexture, rng, textureRepeat, texturePixels } from './textures';

describe('descrição dos padrões', () => {
  it('todo material finish_* do catálogo tem textura', () => {
    const ids = getCatalog().materials.filter((m) => m.id.startsWith('finish_')).map((m) => m.id);
    expect(ids.length).toBeGreaterThanOrEqual(14);
    for (const id of ids) expect(describeTexture(id), id).toBeDefined();
    expect(describeTexture('osb_11')).toBeUndefined();
    expect(describeTexture(undefined)).toBeUndefined();
  });

  it('madeira: réguas de ~12 cm', () => {
    for (const id of ['finish_floor_wood', 'finish_wall_wood', 'finish_facade_wood']) {
      const s = describeTexture(id)!;
      expect(s.kind).toBe('planks');
      expect(s.module[1]).toBeCloseTo(0.12);
      expect(s.grain).toBe(true);
      // a imagem cobre um número inteiro de réguas
      expect(s.tile[1] / s.module[1]).toBeCloseTo(Math.round(s.tile[1] / s.module[1]));
    }
  });

  it('porcelanato 60x60 e cerâmica 45x45 com rejunte fino', () => {
    const p = describeTexture('finish_floor_porcelain')!;
    expect(p.kind).toBe('grid');
    expect(p.module).toEqual([0.6, 0.6]);
    expect(p.jointWidth).toBeLessThan(0.006);
    expect(describeTexture('finish_floor_ceramic')!.module).toEqual([0.45, 0.45]);
    expect(describeTexture('finish_wall_tile')!.module).toEqual([0.3, 0.6]);
  });

  it('vinílico e laminado: réguas largas em tom claro', () => {
    for (const id of ['finish_floor_vinyl', 'finish_floor_laminate']) {
      const s = describeTexture(id)!;
      expect(s.module[1]).toBeGreaterThan(0.15);
      expect(s.color.toLowerCase()).toMatch(/^#[c-f]/);
    }
  });

  it('tijolinho 6 x 23 cm, siding de 20 cm', () => {
    const b = describeTexture('finish_facade_brick')!;
    expect(b.kind).toBe('bricks');
    expect(b.module[0] - b.jointWidth).toBeCloseTo(0.23);
    expect(b.module[1] - b.jointWidth).toBeCloseTo(0.06);
    const s = describeTexture('finish_facade_siding')!;
    expect(s.kind).toBe('siding');
    expect(s.module[1]).toBeCloseTo(0.2);
  });

  it('pintura e textura: cor lisa', () => {
    expect(describeTexture('finish_wall_paint')!.kind).toBe('plain');
    expect(describeTexture('finish_facade_texture')!.kind).toBe('plain');
  });

  it('repetição = 1 / tamanho coberto (UV em metros)', () => {
    const s = describeTexture('finish_floor_porcelain')!;
    expect(textureRepeat(s)).toEqual([1 / 1.2, 1 / 1.2]);
    const [w, h] = texturePixels(s);
    expect(w).toBe(h);
    expect(w).toBeLessThanOrEqual(1024);
  });
});

describe('desenho', () => {
  it('é determinístico e pinta em todos os padrões sem erro', () => {
    const a = rng('x');
    const b = rng('x');
    expect([a(), a()]).toEqual([b(), b()]);
    for (const id of ['finish_floor_wood', 'finish_floor_porcelain', 'finish_facade_brick', 'finish_facade_siding', 'finish_wall_paint']) {
      const spec = describeTexture(id)!;
      const [w, h] = texturePixels(spec);
      let fills = 0;
      const ctx = {
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        globalAlpha: 1,
        fillRect: () => void fills++,
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
      };
      paintTexture(ctx, spec, w, h);
      expect(fills, id).toBeGreaterThan(5);
    }
  });
});
