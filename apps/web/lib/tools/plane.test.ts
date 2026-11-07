import { describe, expect, it } from 'vitest';
import { rayHitHorizontal, rayHitVertical, sceneRayToMotor, sceneToMotor } from './plane';

describe('plane', () => {
  it('converte cena y-up para motor z-up', () => {
    expect(sceneToMotor([1, 2, 3])).toEqual([1, -3, 2]);
  });
  it('acha o ponto no plano de trabalho a partir de um raio da cena', () => {
    // câmera em (2, 10, -4) da cena olhando para baixo-inclinado
    const ray = sceneRayToMotor([2, 10, -4], [0, -1, 0.5]);
    const hit = rayHitHorizontal(ray, 2.8)!; // motor z = 2,8 => cena y = 2,8
    expect(hit[0]).toBeCloseTo(2);
    // t = 7,2 => cena z = -4 + 3,6 = -0,4 => motor y = 0,4
    expect(hit[1]).toBeCloseTo(0.4);
  });
  it('raio paralelo ou apontando para longe não acha plano', () => {
    expect(rayHitHorizontal({ origin: [0, 0, 5], dir: [1, 0, 0] }, 0)).toBeNull();
    expect(rayHitHorizontal({ origin: [0, 0, 5], dir: [0, 0, 1] }, 0)).toBeNull();
  });
  it('plano vertical de uma parede', () => {
    const hit = rayHitVertical({ origin: [3, -5, 1], dir: [0, 1, 0] }, [0, 0], [0, -1])!;
    expect(hit).toEqual([3, 0]);
  });
});
