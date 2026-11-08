// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { BuildingModel } from '@chalecad/engine';
import { crc32 } from './zip';
import { buildZip } from './zip';
import {
  EYE_HEIGHT,
  ORBIT_SECONDS,
  autoViewpoints,
  boxFits,
  easeInOut,
  largestGroundRoom,
  orbitPose,
  parseSavedViews,
  photoFileName,
  photosZipName,
  timelapseMinutes,
  videoFileName,
} from './viewpoints';
import { bboxToThree } from './convert';

const model = {
  bbox: { min: [0, 0, 0], max: [10, 6, 4.5] },
  walls: [{ id: 'ext-front', kind: 'exterior', from: [0, 0], to: [10, 0], baseZ: 0, thickness: 0.2, exteriorSide: 'right' }],
  openings: [
    { id: 'w1', hostId: 'ext-front', hostKind: 'wall', type: 'window', u0: 1, u1: 2, v0: 1, v1: 2, valid: true },
    { id: 'g1', hostId: 'ext-front', hostKind: 'wall', type: 'sliding_door', u0: 5, u1: 8, v0: 0, v1: 2.2, valid: true },
  ],
  rooms: [
    { id: 'small', level: 'L0', area: 6, polygon: [[0, 0], [2, 0], [2, 3], [0, 3]], openingIds: [] },
    { id: 'big', level: 'L0', area: 40, polygon: [[2, 0], [10, 0], [10, 5], [2, 5]], openingIds: ['g1'] },
    { id: 'up', level: 'L1', area: 90, polygon: [[0, 0], [10, 0], [10, 6], [0, 6]], openingIds: [] },
  ],
} as unknown as BuildingModel;

describe('vistas prontas', () => {
  const b = bboxToThree(model.bbox);
  for (const [fov, aspect] of [[35, 16 / 9], [35, 9 / 16], [50, 1]] as const) {
    it(`o bbox cabe na tela (fov ${fov}, aspecto ${aspect.toFixed(2)})`, () => {
      const vps = autoViewpoints(model, { fovDeg: fov, aspect, groundLevelId: 'L0' });
      expect(vps.map((v) => v.id)).toEqual(['front', 'corner', 'back', 'top', 'interior']);
      for (const v of vps.filter((x) => x.id !== 'interior')) {
        expect(boxFits(v, fov, aspect, b.min, b.max), v.id).toBe(true);
      }
    });
  }

  it('frente: olho a 1,6 m, na frente (+z da cena) da casa', () => {
    const f = autoViewpoints(model).find((v) => v.id === 'front')!;
    expect(f.position[1]).toBeCloseTo(EYE_HEIGHT);
    expect(f.position[2]).toBeGreaterThan(b.max[2]);
    expect(f.position[0]).toBeCloseTo(b.center[0]);
  });

  it('quina fica à frente-direita, fundos atrás-esquerda, topo a ~45°', () => {
    const vps = autoViewpoints(model);
    const get = (id: string) => vps.find((v) => v.id === id)!;
    expect(get('corner').position[0]).toBeGreaterThan(b.center[0]);
    expect(get('corner').position[2]).toBeGreaterThan(b.center[2]);
    expect(get('back').position[0]).toBeLessThan(b.center[0]);
    expect(get('back').position[2]).toBeLessThan(b.center[2]);
    const t = get('top');
    const el = Math.atan2(t.position[1] - t.target[1], Math.hypot(t.position[0] - t.target[0], t.position[2] - t.target[2]));
    expect((el * 180) / Math.PI).toBeCloseTo(45, 0);
  });

  it('interior: dentro do maior cômodo do térreo, a 1,6 m, olhando o vidro', () => {
    expect(largestGroundRoom(model, 'L0')?.id).toBe('big');
    const i = autoViewpoints(model, { groundLevelId: 'L0', groundElevation: 0 }).find((v) => v.id === 'interior')!;
    // cena: x = x, z = -y
    const x = i.position[0];
    const y = -i.position[2];
    expect(x).toBeGreaterThan(2);
    expect(x).toBeLessThan(10);
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(5);
    expect(i.position[1]).toBeCloseTo(1.6);
    // alvo: centro da porta de vidro, em x = 6,5 na parede y = 0
    expect(i.target[0]).toBeCloseTo(6.5);
    expect(i.target[2]).toBeCloseTo(0);
  });
});

describe('órbita', () => {
  const corner = { position: [12, 5, 9] as [number, number, number], target: [5, 2, -3] as [number, number, number] };
  it('easing: 0 em 0, 1 em 1, suave nas pontas, monotônico', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.01)).toBeLessThan(0.0001);
    expect(easeInOut(0.5)).toBeCloseTo(0.5);
  });
  it('começa e termina na mesma posição (a Quina), mantendo altura e raio', () => {
    const a = orbitPose(corner, 0);
    const z = orbitPose(corner, ORBIT_SECONDS);
    a.position.forEach((v, k) => expect(v).toBeCloseTo(corner.position[k]!));
    z.position.forEach((v, k) => expect(v).toBeCloseTo(corner.position[k]!));
    const mid = orbitPose(corner, ORBIT_SECONDS / 2);
    expect(mid.position[1]).toBe(5);
    expect(Math.hypot(mid.position[0] - 5, mid.position[2] + 3)).toBeCloseTo(Math.hypot(7, 12));
    // meia volta: lado oposto
    expect(mid.position[0]).toBeCloseTo(5 - 7);
    expect(mid.position[2]).toBeCloseTo(-3 - 12);
  });
  it('timelapse vai do nascer ao pôr', () => {
    expect(timelapseMinutes(360, 1080, 0)).toBe(360);
    expect(timelapseMinutes(360, 1080, 5)).toBe(720);
    expect(timelapseMinutes(360, 1080, 99)).toBe(1080);
  });
});

describe('nomes de arquivo e vistas salvas', () => {
  const d = new Date(2026, 10, 8, 14, 5);
  it('foto, zip e vídeo', () => {
    expect(photoFileName('Chalé da Serra', 'Quina', d)).toBe('chale-da-serra-quina-2026-11-08.png');
    expect(photoFileName('', 'De cima', d)).toBe('chale-de-cima-2026-11-08.png');
    expect(photosZipName('Chalé da Serra', d)).toBe('chale-da-serra-fotos-2026-11-08.zip');
    expect(videoFileName('Chalé da Serra')).toBe('chale-da-serra-360.webm');
    expect(videoFileName('Chalé', 'timelapse')).toBe('chale-timelapse.webm');
  });
  it('lê vistas salvas com tolerância a lixo', () => {
    expect(parseSavedViews(null)).toEqual([]);
    expect(parseSavedViews('{')).toEqual([]);
    expect(parseSavedViews('{"a":1}')).toEqual([]);
    const ok = { id: 'a', name: 'X', position: [1, 2, 3], target: [0, 0, 0] };
    expect(parseSavedViews(JSON.stringify([ok, { id: 'b' }, { ...ok, position: [1, 'x', 3] }]))).toEqual([ok]);
  });
});

describe('zip', () => {
  it('crc32 conhecido e estrutura do arquivo', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    const zip = buildZip([{ name: 'a.txt', data: new TextEncoder().encode('oi') }]);
    const dv = new DataView(zip.buffer);
    expect(dv.getUint32(0, true)).toBe(0x04034b50);
    expect(dv.getUint32(zip.length - 22, true)).toBe(0x06054b50);
    expect(dv.getUint16(zip.length - 22 + 10, true)).toBe(1);
  });
});
