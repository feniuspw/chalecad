import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { describePbr } from './pbr';
import { PHOTO_TEXTURES, applyGain, meanGain, photoFor, photoUrl } from './photoTextures';

const PUBLIC = join(__dirname, '..', '..', 'public');

describe('texturas fotográficas', () => {
  it('toda foto tem os três mapas em public/textures', () => {
    for (const spec of Object.values(PHOTO_TEXTURES)) {
      for (const m of ['diff', 'nor', 'rough'] as const) {
        const file = join(PUBLIC, photoUrl(spec, m));
        expect(existsSync(file), file).toBe(true);
        expect(statSync(file).size).toBeGreaterThan(10_000);
      }
    }
  });
  it('só substitui materiais que já têm padrão procedural (fallback garantido)', () => {
    for (const id of Object.keys(PHOTO_TEXTURES)) expect(describePbr(id), id).toBeDefined();
  });
  it('telha e grama continuam procedurais (são tingidas); Leve nunca usa foto', () => {
    expect(photoFor('roof_sandwich', 'high')).toBeUndefined();
    expect(photoFor('grass', 'high')).toBeUndefined();
    expect(photoFor('finish_floor_wood', 'light')).toBeUndefined();
    expect(photoFor('finish_floor_wood', 'high')?.asset).toBe('wood_floor');
  });
});

describe('meanGain', () => {
  it('leva a média da foto para a cor do acabamento e preserva o detalhe relativo', () => {
    const data = new Uint8ClampedArray([50, 100, 20, 255, 150, 100, 60, 255]);
    const g = meanGain(data, [120, 100, 80]);
    applyGain(data, g);
    expect([(data[0]! + data[4]!) / 2, (data[1]! + data[5]!) / 2, (data[2]! + data[6]!) / 2]).toEqual([120, 100, 80]);
    expect(data[4]! / data[0]!).toBeCloseTo(3, 1);
    expect(data[3]).toBe(255);
  });
  it('limita o ganho em fotos quase pretas', () => {
    expect(meanGain(new Uint8ClampedArray([1, 1, 1, 255]), [255, 255, 255])).toEqual([3, 3, 3]);
  });
});
