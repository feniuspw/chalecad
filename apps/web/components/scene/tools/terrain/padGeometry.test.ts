// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  forecastEdges,
  hitVertex,
  levelFromDrag,
  polygonAreaAbs,
  rectToPolygon,
  snapPadPoint,
  translatePolygon,
  validatePadPolygon,
  type PadSnapTargets,
} from './padGeometry';

describe('retângulo e validação', () => {
  it('rectToPolygon: anti-horário a partir do canto inferior esquerdo, em qualquer ordem dos cantos', () => {
    expect(rectToPolygon([4, 5], [1, 2])).toEqual([[1, 2], [4, 2], [4, 5], [1, 5]]);
    expect(polygonAreaAbs(rectToPolygon([0, 0], [3, 2]))).toBe(6);
  });

  it('valida: aceita retângulo e L; recusa < 3 pontos, cruzado, área < 1 m² e pontos repetidos', () => {
    expect(validatePadPolygon(rectToPolygon([0, 0], [3, 2])).ok).toBe(true);
    expect(validatePadPolygon([[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]]).ok).toBe(true);
    expect(validatePadPolygon([[0, 0], [1, 1]]).ok).toBe(false);
    const bow = validatePadPolygon([[0, 0], [4, 4], [4, 0], [0, 4]]);
    expect(bow.ok).toBe(false);
    expect(!bow.ok && bow.reason).toMatch(/cruzar/);
    expect(validatePadPolygon(rectToPolygon([0, 0], [0.8, 0.8])).ok).toBe(false);
    expect(validatePadPolygon([[0, 0], [0, 0], [3, 0], [3, 3]]).ok).toBe(false);
  });
});

describe('snap', () => {
  const t: PadSnapTargets = { corners: [[0, 0], [6, 0], [6, 8], [0, 8]], segments: [{ a: [0, 0], b: [6, 0] }, { a: [6, 0], b: [6, 8] }] };
  it('quina antes de face; face antes de grade; Alt desliga', () => {
    expect(snapPadPoint([0.1, 0.05], t, 0.3)).toEqual({ point: [0, 0], kind: 'corner' });
    const face = snapPadPoint([3, 0.1], t, 0.3);
    expect(face.kind).toBe('perpendicular');
    expect(face.point[0]).toBeCloseTo(3, 9);
    expect(face.point[1]).toBeCloseTo(0, 9);
    const grid = snapPadPoint([3.02, 4.04], t, 0.3);
    expect(grid.kind).toBe('grid');
    expect(grid.point[0]).toBeCloseTo(3, 9);
    expect(grid.point[1]).toBeCloseTo(4.05, 9);
    expect(snapPadPoint([0.1, 0.05], t, 0.3, true)).toEqual({ point: [0.1, 0.05], kind: 'none' });
  });
});

describe('edição', () => {
  it('hitVertex acha o vértice mais próximo dentro do raio', () => {
    const p = rectToPolygon([0, 0], [4, 4]);
    expect(hitVertex(p, [3.9, 0.05], 0.3)).toBe(1);
    expect(hitVertex(p, [2, 2], 0.3)).toBe(-1);
  });
  it('translatePolygon desloca todos os vértices', () => {
    expect(translatePolygon([[0, 0], [1, 0], [1, 1]], 2, -1)).toEqual([[2, -1], [3, -1], [3, 0]]);
  });
  it('levelFromDrag: subir na tela sobe o nível, passo de 5 cm, limitado a ±10 m', () => {
    expect(levelFromDrag(0, -100, 0.01)).toBe(1);
    expect(levelFromDrag(0, 100, 0.01)).toBe(-1);
    expect(levelFromDrag(0, 3, 0.01)).toBe(-0.05);
    expect(levelFromDrag(9.9, -5000, 0.01)).toBe(10);
    expect(levelFromDrag(-9.9, 5000, 0.01)).toBe(-10);
  });
});

describe('previsão das bordas ao vivo', () => {
  const rules = { cutHeight: 1.5, fillHeight: 1 };
  const site = { slopePct: 30, downhillAzimuthDeg: 180 }; // desce para -y: o fundo (+y) sobe
  it('auto: muro nos fundos (corte alto) e talude na frente quando o desnível é pequeno', () => {
    // pad de 4 m centrado na casa, no nível do terreno natural: desnível = ±0,3·2 = 0,6 m (cabe em talude)
    const poly = rectToPolygon([-2, -2], [2, 2]);
    const f = forecastEdges(poly, 0, site, [0, 0], 'auto', rules);
    expect(f).toHaveLength(4);
    expect(f.every((e) => e.kind === 'slope')).toBe(true);
    // 8 m para trás: o terreno sobe 2,4 m acima do pad -> muro
    const back = forecastEdges(rectToPolygon([-2, 6], [2, 10]), 0, site, [0, 0], 'auto', rules);
    const top = back.find((e) => e.from[1] === 10 && e.to[1] === 10)!;
    expect(top.h).toBeCloseTo(3, 9);
    expect(top.kind).toBe('wall');
  });
  it('wall força muro; slope nunca', () => {
    const poly = rectToPolygon([-2, -2], [2, 2]);
    expect(forecastEdges(poly, 0, site, [0, 0], 'wall', rules).every((e) => e.kind === 'wall')).toBe(true);
    expect(forecastEdges(rectToPolygon([-2, 6], [2, 10]), 0, site, [0, 0], 'slope', rules).every((e) => e.kind === 'slope')).toBe(true);
  });
});
