// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { getCatalog } from '@chalecad/catalog';
import { computeAll } from '@chalecad/engine';
import { createProject } from '../project/templates';
import { makeSlopedSite } from '../project/terrain';
import { buildWallPrisms, wallCoping, wallThickness } from './terrain';

function steepProject() {
  const p = createProject('gable_mezzanine', { name: 'Arrimo' });
  p.site = makeSlopedSite({ slopePct: 30, downhillAzimuthDeg: 180, platformMargin: { front: 2, back: 8, left: 2, right: 2 } });
  return { p, r: computeAll(p, getCatalog()) };
}

describe('TerrainWallsView: geometria dos muros', () => {
  const { r } = steepProject();
  const walls = r.terrain!.walls;

  it('o terreno de 30% gera muros (corte e aterro) com altura positiva', () => {
    expect(walls.length).toBeGreaterThan(0);
    expect(walls.some((w) => w.side === 'cut' && w.maxHeight > 1.5)).toBe(true);
  });

  it('prismas sem NaN, índices válidos e topo igual ao topZ do relatório', () => {
    for (const w of walls) {
      const t = wallThickness(w.type, w.maxHeight);
      const body = buildWallPrisms(w, t);
      expect(body.positions.length).toBeGreaterThan(0);
      expect(body.positions.every((v) => Number.isFinite(v))).toBe(true);
      const n = body.positions.length / 3;
      expect(body.indices.every((i) => i < n)).toBe(true);
      let top = -Infinity;
      for (let i = 2; i < body.positions.length; i += 3) top = Math.max(top, body.positions[i]!);
      expect(top).toBeCloseTo(Math.max(...w.topZ), 4);
      const cap = wallCoping(w, t);
      if (w.type === 'gabion') expect(cap).toBeNull();
      else {
        expect(cap!.positions.every((v) => Number.isFinite(v))).toBe(true);
        let ctop = -Infinity;
        for (let i = 2; i < cap!.positions.length; i += 3) ctop = Math.max(ctop, cap!.positions[i]!);
        expect(ctop).toBeCloseTo(Math.max(...w.topZ) + 0.06, 4);
      }
    }
  });

  it('o muro fica do lado de fora do contorno do pad', () => {
    const w = walls.find((x) => x.padId === 'house')!;
    const pad = r.terrain!.pads.find((x) => x.id === 'house')!;
    const xs = pad.polygon.map((p) => p[0]);
    const ys = pad.polygon.map((p) => p[1]);
    const body = buildWallPrisms(w, 0.2);
    for (let i = 0; i < body.positions.length; i += 3) {
      const x = body.positions[i]!;
      const y = body.positions[i + 1]!;
      expect(x).toBeGreaterThanOrEqual(Math.min(...xs) - 0.2 - 1e-6);
      expect(x).toBeLessThanOrEqual(Math.max(...xs) + 0.2 + 1e-6);
      expect(y).toBeGreaterThanOrEqual(Math.min(...ys) - 0.2 - 1e-6);
      expect(y).toBeLessThanOrEqual(Math.max(...ys) + 0.2 + 1e-6);
      // a face interna (o caminho) fica sobre o contorno do platô; o corpo vai para fora
      const onEdge = Math.abs(x - Math.min(...xs)) < 1e-6 || Math.abs(x - Math.max(...xs)) < 1e-6 || Math.abs(y - Math.min(...ys)) < 1e-6 || Math.abs(y - Math.max(...ys)) < 1e-6;
      const outside = x < Math.min(...xs) || x > Math.max(...xs) || y < Math.min(...ys) || y > Math.max(...ys);
      expect(onEdge || outside).toBe(true);
    }
  });

  it('espessuras: bloco/concreto 20 cm, gabião cresce com a altura', () => {
    expect(wallThickness('block', 2)).toBe(0.2);
    expect(wallThickness('concrete', 3)).toBe(0.2);
    expect(wallThickness('gabion', 2)).toBeCloseTo(0.7, 9);
  });
});
