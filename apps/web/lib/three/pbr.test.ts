// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { describePbr, materialRoughness, normalFromHeight, pbrPixels, pbrRepeat, renderPattern, TIER_PX } from './pbr';
import { describeTexture } from './textures';

describe('mapa de normais', () => {
  it('plano liso aponta para (0,5; 0,5; 1)', () => {
    const w = 16, h = 16;
    const n = normalFromHeight(new Float32Array(w * h).fill(0.01), w, h, 256);
    for (const i of [0, 37, 255]) {
      expect(n[i * 4]! / 255).toBeCloseTo(0.5, 2);
      expect(n[i * 4 + 1]! / 255).toBeCloseTo(0.5, 2);
      expect(n[i * 4 + 2]! / 255).toBeCloseTo(1, 2);
    }
  });

  it('degrau na altura inclina a normal para o lado oposto ao aclive (x) e repete nas bordas', () => {
    const w = 16, h = 8;
    const hm = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) hm[y * w + x] = x < 8 ? 0 : 0.004; // sobe em x = 8
    const n = normalFromHeight(hm, w, h, 256);
    const at = (x: number) => n[(3 * w + x) * 4]! / 255;
    expect(at(8)).toBeLessThan(0.5); // aclive para +x: normal inclina para -x
    expect(at(3)).toBeCloseTo(0.5, 2); // longe do degrau
    expect(at(0)).toBeGreaterThan(0.5); // a borda esquerda vê o degrau da emenda (queda de 0,004 para 0)
  });
});

describe('rugosidade por material', () => {
  it('porcelanato liso < madeira média < tijolo áspero', () => {
    const porcelain = materialRoughness('finish_floor_porcelain');
    const wood = materialRoughness('finish_floor_wood');
    const brick = materialRoughness('finish_facade_brick');
    expect(porcelain).toBeLessThan(wood);
    expect(wood).toBeLessThan(brick);
    expect(porcelain).toBeLessThan(0.35);
    expect(brick).toBeGreaterThan(0.85);
  });

  it('telha sanduíche é metálica e mais lisa que o concreto', () => {
    expect(materialRoughness('roof_sandwich')).toBeLessThan(materialRoughness('concrete'));
  });

  it('o mapa de rugosidade fica em torno do valor do material', () => {
    for (const id of ['finish_floor_porcelain', 'finish_floor_wood', 'finish_facade_brick']) {
      const spec = describePbr(id)!;
      const [w, h] = pbrPixels(spec, 'light');
      const b = renderPattern(spec, w, h);
      let sum = 0;
      for (let i = 0; i < w * h; i++) sum += b.roughness[i * 4]! / 255;
      expect(sum / (w * h), id).toBeGreaterThan(materialRoughness(id) - 0.12);
      expect(sum / (w * h), id).toBeLessThan(materialRoughness(id) + 0.12);
    }
  });
});

describe('padrões em metros', () => {
  it('repetição = 1 / metros cobertos pela imagem', () => {
    const porcelain = describePbr('finish_floor_porcelain')!;
    expect(pbrRepeat(porcelain)).toEqual([1 / 1.2, 1 / 1.2]);
    const roof = describePbr('roof_sandwich')!;
    expect(pbrRepeat(roof)).toEqual([1, 1]);
  });

  it('o maior lado tem 1024 px em Alta e 256 em Leve, e a proporção do tile é mantida', () => {
    for (const id of ['finish_floor_wood', 'finish_facade_siding', 'finish_floor_porcelain', 'deck_wood', 'grass']) {
      const spec = describePbr(id)!;
      const [hw, hh] = pbrPixels(spec, 'high');
      const [lw, lh] = pbrPixels(spec, 'light');
      expect(Math.max(hw, hh), id).toBe(TIER_PX.high);
      expect(Math.max(lw, lh), id).toBe(TIER_PX.light);
      expect(hw / hh).toBeCloseTo(spec.tile[0] / spec.tile[1], 1);
    }
  });

  it('todo acabamento tem PBR e os extras também', () => {
    expect(describePbr('finish_wall_paint')).toBeDefined();
    for (const id of ['roof_sandwich', 'deck_wood', 'concrete', 'grass', 'gravel', 'sand']) expect(describePbr(id), id).toBeDefined();
    expect(describePbr('osb_11')).toBeUndefined();
    expect(describeTexture('roof_sandwich')).toBeUndefined();
  });
});

describe('renderPattern', () => {
  it('é determinístico e sem costura (a borda direita encontra a esquerda)', () => {
    for (const id of ['finish_floor_wood', 'finish_facade_brick', 'roof_sandwich', 'grass']) {
      const spec = describePbr(id)!;
      const [w, h] = pbrPixels(spec, 'light');
      const a = renderPattern(spec, w, h);
      const b = renderPattern(spec, w, h);
      expect(Array.from(a.albedo.slice(0, 200)), id).toEqual(Array.from(b.albedo.slice(0, 200)));
      // diferença entre colunas vizinhas na emenda não passa muito da média entre colunas vizinhas internas
      const col = (x: number, y: number) => a.albedo[(y * w + x) * 4 + 1]!;
      let seam = 0, inner = 0;
      for (let y = 0; y < h; y++) {
        seam += Math.abs(col(0, y) - col(w - 1, y));
        inner += Math.abs(col(Math.floor(w / 2), y) - col(Math.floor(w / 2) + 1, y));
      }
      expect(seam / h, id).toBeLessThan(inner / h + 22);
    }
  });

  it('juntas afundam: a altura na junta do porcelanato é menor que no centro da peça', () => {
    const spec = describePbr('finish_floor_porcelain')!;
    const [w, h] = pbrPixels(spec, 'high');
    const b = renderPattern(spec, w, h);
    const pxm = w / spec.tile[0];
    const joint = b.heightMap[Math.round(0.6 * pxm) - 1]!; // em x = 0,6 m (junta), y = 0
    const mid = b.heightMap[Math.round(0.3 * pxm) + Math.round(0.3 * pxm) * w]!;
    expect(joint).toBeLessThan(mid);
  });
});
