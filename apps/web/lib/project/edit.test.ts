import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { loadProject, type Project } from '@chalecad/engine';
import {
  addOpeningAtCenter,
  fitOpenings,
  getMezzanine,
  patchTypology,
  reconcileProject,
  removeOpening,
  removeWall,
  setMezzanine,
  setMezzanineEnabled,
  setWallLength,
  switchTypology,
} from './edit';
import { degToPct, pctToDeg } from './geometry';
import { createProject } from './templates';

const base = () => createProject('gable_mezzanine');
const valid = (p: Project) => {
  const r = loadProject(p);
  expect(r.ok ? [] : r.issues).toEqual([]);
};

describe('mezanino', () => {
  it('lê profundidade e posição', () => {
    const m = getMezzanine(base())!;
    expect(m.depth).toBeCloseTo(3.5);
    expect(m.position).toBe('back');
  });

  it('acompanha largura e profundidade', () => {
    const p = produce(base(), (d) => {
      patchTypology(d, { width: 5, depth: 6 });
    });
    const m = getMezzanine(p)!;
    expect(p.levels[1]!.polygon!.map((v) => v[0])).toEqual([0, 5, 5, 0]);
    expect(Math.max(...p.levels[1]!.polygon!.map((v) => v[1]))).toBe(6);
    expect(m.depth).toBeCloseTo(3.5);
    valid(p);
  });

  it('limita a profundidade quando a edificação encolhe', () => {
    const p = produce(base(), (d) => {
      patchTypology(d, { depth: 3.5 });
    });
    expect(getMezzanine(p)!.depth).toBeLessThanOrEqual(2.5);
  });

  it('muda posição frente/fundo e profundidade', () => {
    const p = produce(base(), (d) => setMezzanine(d, { position: 'front', depth: 3 }));
    const m = getMezzanine(p)!;
    expect(m.position).toBe('front');
    expect(m.depth).toBe(3);
    expect(Math.min(...p.levels[1]!.polygon!.map((v) => v[1]))).toBe(0);
  });

  it('elevação acompanha o pé-direito', () => {
    const p = produce(base(), (d) => {
      patchTypology(d, { wallHeight: 3.2 });
    });
    expect(p.levels[1]!.elevation).toBe(3.2);
  });

  it('desliga removendo escada e liga de volta com escada', () => {
    const off = produce(base(), (d) => setMezzanineEnabled(d, false));
    expect(off.levels).toHaveLength(1);
    expect(off.stairs).toHaveLength(0);
    valid(off);
    const on = produce(off, (d) => setMezzanineEnabled(d, true));
    expect(on.levels).toHaveLength(2);
    expect(on.stairs).toHaveLength(1);
    valid(on);
  });
});

describe('aberturas', () => {
  it('mantém aberturas dentro das paredes ao reduzir dimensões', () => {
    const p = produce(base(), (d) => {
      patchTypology(d, { width: 3, depth: 5 });
    });
    for (const o of p.openings) {
      const len =
        o.host === 'ext-front' || o.host === 'ext-back'
          ? 3
          : o.host === 'ext-left' || o.host === 'ext-right'
            ? 5
            : Math.hypot(...(() => { const w = p.walls.find((x) => x.id === o.host)!; return [w.to[0] - w.from[0], w.to[1] - w.from[1]] as [number, number]; })());
      expect(o.offset + o.width).toBeLessThanOrEqual(len + 1e-6);
      expect(o.offset).toBeGreaterThanOrEqual(0);
    }
    valid(p);
  });

  it('paredes internas ficam no contorno e as degeneradas somem com suas aberturas', () => {
    const p = produce(base(), (d) => {
      patchTypology(d, { width: 2.5, depth: 4 });
    });
    for (const w of p.walls) {
      for (const v of [w.from, w.to]) {
        expect(v[0]).toBeLessThanOrEqual(2.5);
        expect(v[1]).toBeLessThanOrEqual(4);
      }
    }
    valid(p);
  });

  it('reduz a altura se passa do pé-direito', () => {
    const p = produce(base(), (d) => {
      d.openings[0]!.height = 2.1;
      patchTypology(d, { wallHeight: 2.2 });
    });
    expect(p.openings[0]!.height).toBeLessThanOrEqual(2.1);
    valid(p);
  });

  it('adiciona janela no meio da parede e evita sobreposição', () => {
    let id1 = '';
    let id2 = '';
    const p = produce(base(), (d) => {
      id1 = addOpeningAtCenter(d, 'ext-left', 'window')!;
      id2 = addOpeningAtCenter(d, 'ext-left', 'window')!;
    });
    const a = p.openings.find((o) => o.id === id1)!;
    const b = p.openings.find((o) => o.id === id2)!;
    expect(a.offset + a.width / 2).toBeCloseTo(p.typology.depth / 2, 1);
    expect(b.offset + b.width <= a.offset + 1e-6 || b.offset >= a.offset + a.width - 1e-6).toBe(true);
    valid(p);
  });

  it('excluir parede interna remove suas aberturas', () => {
    const p = base();
    expect(p.walls).toHaveLength(2);
    const wid = p.walls[1]!.id;
    const q = produce(p, (d) => {
      expect(removeWall(d, wid)).toBe(true);
    });
    expect(q.openings.some((o) => o.host === wid)).toBe(false);
    valid(q);
    const r = produce(q, (d) => {
      expect(removeOpening(d, q.openings[0]!.id)).toBe(true);
    });
    expect(r.openings).toHaveLength(q.openings.length - 1);
  });

  it('mudar comprimento da parede reajusta aberturas', () => {
    const p0 = base();
    const wid = p0.walls[1]!.id;
    const p = produce(p0, (d) => setWallLength(d, wid, 0.9));
    const w = p.walls.find((x) => x.id === wid)!;
    expect(Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1])).toBeCloseTo(0.9);
    valid(p);
  });
});

describe('tipologia', () => {
  it('troca duas águas por A-frame descartando aberturas laterais', () => {
    const p = produce(base(), (d) => {
      switchTypology(d, 'a_frame');
    });
    expect(p.typology.kind).toBe('a_frame');
    expect(p.openings.some((o) => o.host === 'ext-left' || o.host === 'ext-right')).toBe(false);
    expect(p.levels).toHaveLength(2);
    valid(p);
    const back = produce(p, (d) => {
      switchTypology(d, 'gable_mezzanine');
    });
    expect(back.typology.kind).toBe('gable_mezzanine');
    valid(back);
  });

  it('reconcile é idempotente', () => {
    const p = base();
    const q = produce(p, (d) => {
      reconcileProject(d);
      fitOpenings(d);
    });
    expect(q).toEqual(p);
  });

  it('conversão de inclinação', () => {
    expect(degToPct(45)).toBeCloseTo(100);
    expect(pctToDeg(degToPct(35))).toBeCloseTo(35);
  });
});
