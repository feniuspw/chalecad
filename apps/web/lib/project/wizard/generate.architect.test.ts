/** Planta "como um arquiteto faria": núcleo molhado único, escada na parede, casal no mezanino, lavanderia em nicho, terreno próprio. */
import { describe, expect, it } from 'vitest';
import { computeAll, roofBelowAt, type Project, type Vec2 } from '@chalecad/engine';
import { getCatalog } from '@chalecad/catalog';
import { DEFAULT_ANSWERS, degToPct, normalizeAnswers, pctToDeg, type WizardAnswers } from './answers';
import { generateProject } from './generate';
import { emptyRoomProblems, wallHeadroomProblems } from './matrix';
import { questionById } from './questions';
import { furnitureFootprint, specOf } from '../furniture';
import { stairRun } from '../edit';

const catalog = getCatalog();

/** O caso real que o usuário gerou e que ficou esquisito. */
const USER: WizardAnswers = { ...DEFAULT_ANSWERS, people: 1, bedrooms: 1, style: 'aframe', mezzanine: 'sleep', bathUp: true, laundry: 'inside', terrain: 'gentle', uf: 'MG' };
const GABLE: WizardAnswers = { ...USER, style: 'gable' };

type Pt = Vec2;
const inPoly = (pt: Pt, poly: Pt[]) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const bbox = (poly: Pt[]) => ({ x0: Math.min(...poly.map((p) => p[0])), x1: Math.max(...poly.map((p) => p[0])), y0: Math.min(...poly.map((p) => p[1])), y1: Math.max(...poly.map((p) => p[1])) });
/** Distância de um ponto à face de uma parede (segmento com espessura). */
function distToWallFace(pt: Pt, w: { from: Pt; to: Pt; thickness: number }): number {
  const dx = w.to[0] - w.from[0];
  const dy = w.to[1] - w.from[1];
  const len2 = dx * dx + dy * dy;
  const t = Math.min(1, Math.max(0, ((pt[0] - w.from[0]) * dx + (pt[1] - w.from[1]) * dy) / len2));
  return Math.max(0, Math.hypot(pt[0] - (w.from[0] + dx * t), pt[1] - (w.from[1] + dy * t)) - w.thickness / 2);
}

function build(a: WizardAnswers) {
  const { project, notes } = generateProject(a, catalog);
  const r = computeAll(project, catalog);
  const roomOf = (item: string) => {
    const f = project.furniture.find((x) => x.item === item);
    return f ? r.model.rooms.find((x) => x.polygon && x.level === f.level && inPoly(f.position as Pt, x.polygon as Pt[])) : undefined;
  };
  return { project, notes, r, roomOf };
}

function stairHugging(project: Project, r: ReturnType<typeof computeAll>) {
  const st = project.stairs[0]!;
  const run = stairRun(project.levels.find((l) => l.id === st.to)!.elevation);
  const rot = (st.rotationDeg * Math.PI) / 180;
  const fwd: Pt = [Math.sin(rot), Math.cos(rot)];
  const right: Pt = [Math.cos(rot), -Math.sin(rot)];
  const edge = (side: 0 | 1) => Array.from({ length: 9 }, (_, i): Pt => [st.position[0] + right[0] * st.width * side + fwd[0] * run * (i / 8), st.position[1] + right[1] * st.width * side + fwd[1] * run * (i / 8)]);
  const walls = r.model.walls.filter((w) => w.level === 'L0');
  const gap = (side: 0 | 1) => Math.max(...edge(side).map((pt) => Math.min(...walls.map((w) => distToWallFace(pt, w)))));
  const cx = st.position[0] + (right[0] * st.width) / 2 + (fwd[0] * run) / 2;
  return { gap: Math.min(gap(0), gap(1)), cx };
}

describe('assistente: caso do usuário (A-frame, 1 pessoa, mezanino de dormir, banheiro em cima, lavanderia dentro)', () => {
  const { project, notes, r, roomOf } = build(USER);

  it('sem depósito nem lavanderia como cômodo, e sem anexo só para a lavanderia', () => {
    expect(project.rooms.filter((x) => x.use === 'storage' || x.use === 'laundry')).toEqual([]);
    expect(project.typology.kind === 'a_frame' && project.typology.annexes).toEqual([]);
    expect(emptyRoomProblems(r, project)).toEqual([]);
  });

  it('a lavanderia é um nicho: máquina no mesmo cômodo da cozinha ou do banheiro, com nota', () => {
    const room = roomOf('furn_washer');
    expect(room, 'furn_washer').toBeDefined();
    expect(['kitchen', 'bathroom']).toContain(room!.use);
    expect(notes.join(' ')).toMatch(/lavanderia ficou como área de serviço/i);
  });

  it('a escada encosta numa parede em todo o comprimento e não fica no meio da sala', () => {
    const { gap, cx } = stairHugging(project, r);
    expect(gap).toBeLessThanOrEqual(0.15);
    const living = r.model.rooms.find((x) => x.name === 'Sala e cozinha')!;
    const bb = bbox(living.polygon as Pt[]);
    expect(Math.abs(cx - (bb.x0 + bb.x1) / 2)).toBeGreaterThan(0.25);
    expect(project.stairs[0]!.position[1]).toBeLessThanOrEqual(1.0);
  });

  it('a pia fica a até 0,3 m de uma parede hidráulica que também é parede do banheiro', () => {
    const sink = project.furniture.find((f) => f.item === 'furn_kitchen_sink')!;
    const fp = furnitureFootprint(specOf(catalog, sink.item)!, sink.position as Pt, sink.rotation);
    const bath = r.model.rooms.find((x) => x.use === 'bathroom' && x.level === 'L0')!.polygon as Pt[];
    const shared = r.model.walls.filter((w) => {
      if (w.level !== 'L0' || !project.walls.find((x) => x.id === w.id)?.wet) return false;
      // a parede também é parede do banheiro: alguma aresta do banheiro está sobre ela
      return bath.some((a, i) => {
        const c = bath[(i + 1) % bath.length]!;
        return [a, c, [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2] as Pt].every((q) => distToWallFace(q, w) <= 0.1);
      });
    });
    expect(shared.length).toBeGreaterThan(0);
    expect(Math.min(...shared.flatMap((w) => fp.map((q) => distToWallFace(q, w))))).toBeLessThanOrEqual(0.3);
  });

  it('o quarto do mezanino tem cama de casal, e o banheiro de cima fica sobre o de baixo', () => {
    const loftBed = project.furniture.find((f) => f.level === 'L1' && f.item === 'furn_bed_double');
    expect(loftBed).toBeDefined();
    expect(project.furniture.some((f) => f.item === 'furn_bed_single')).toBe(false);
    const up = bbox(r.model.rooms.find((x) => x.use === 'bathroom' && x.level === 'L1')!.polygon as Pt[]);
    const down = bbox(r.model.rooms.find((x) => x.use === 'bathroom' && x.level === 'L0')!.polygon as Pt[]);
    const ix = Math.max(0, Math.min(up.x1, down.x1) - Math.max(up.x0, down.x0));
    const iy = Math.max(0, Math.min(up.y1, down.y1) - Math.max(up.y0, down.y0));
    const smaller = Math.min((up.x1 - up.x0) * (up.y1 - up.y0), (down.x1 - down.x0) * (down.y1 - down.y0));
    expect((ix * iy) / smaller).toBeGreaterThanOrEqual(0.5);
  });

  it('divisórias: pé-direito sob o telhado de 1,0 m em toda a linha e de 2,1 m onde há porta', () => {
    expect(wallHeadroomProblems(r, project)).toEqual([]);
    // confere a conta sem usar o auxiliar: toda parede interna do mezanino
    const l1 = project.levels.find((l) => l.id === 'L1')!;
    for (const w of r.model.walls.filter((x) => x.level === 'L1')) {
      for (let i = 0; i <= 10; i++) {
        const pt: Pt = [w.from[0] + ((w.to[0] - w.from[0]) * Math.min(0.99, Math.max(0.01, i / 10))), w.from[1] + ((w.to[1] - w.from[1]) * Math.min(0.99, Math.max(0.01, i / 10)))];
        expect((roofBelowAt(r.model.roofPlanes, pt) ?? 99) - l1.elevation, w.id).toBeGreaterThanOrEqual(1.0);
      }
    }
  });

  it('cozinha: bancada em pé-direito pleno e sofá fora da água baixa de 0,9 m', () => {
    for (const f of project.furniture.filter((x) => x.level === 'L0')) {
      const spec = specOf(catalog, f.item)!;
      const fp = furnitureFootprint(spec, f.position as Pt, f.rotation);
      if (spec.model === 'sofa') for (const q of fp) expect(roofBelowAt(r.model.roofPlanes, q) ?? 99, 'sofá').toBeGreaterThanOrEqual(1.4);
      if (['counter_sink', 'stove', 'fridge'].includes(spec.model)) {
        const a = (f.rotation * Math.PI) / 180;
        const front: Pt = [f.position[0] + Math.sin(a) * (spec.size.d / 2 + 0.6), f.position[1] - Math.cos(a) * (spec.size.d / 2 + 0.6)];
        expect(roofBelowAt(r.model.roofPlanes, front) ?? 99, spec.model).toBeGreaterThanOrEqual(2.3);
      }
    }
  });

  it('sem alertas de atenção que não sejam de especificação', () => {
    const codes = r.warnings.filter((w) => w.severity !== 'info' && !['norm.safety_glass', 'norm.aframe_thrust', 'steel.index'].includes(w.code)).map((w) => w.code);
    expect(codes).toEqual([]);
  });
});

describe('assistente: duas águas com mezanino', () => {
  const { project, r, roomOf } = build(GABLE);
  it('escada encostada numa parede, cama de casal em cima e lavanderia em nicho', () => {
    expect(stairHugging(project, r).gap).toBeLessThanOrEqual(0.15);
    expect(project.rooms.filter((x) => x.use === 'storage' || x.use === 'laundry')).toEqual([]);
    expect(project.furniture.some((f) => f.level === 'L1' && f.item === 'furn_bed_double')).toBe(true);
    expect(['kitchen', 'bathroom']).toContain(roomOf('furn_washer')?.use);
    expect(wallHeadroomProblems(r, project)).toEqual([]);
    expect(emptyRoomProblems(r, project)).toEqual([]);
  });
  it('celeiro e A-frame com 2 quartos também', { timeout: 120_000 }, () => {
    for (const style of ['gambrel', 'aframe', 'gable'] as const) {
      const b = build({ ...USER, style, bedrooms: 2, people: 4 });
      expect(stairHugging(b.project, b.r).gap, style).toBeLessThanOrEqual(0.15);
      expect(b.project.furniture.some((f) => f.level === 'L1' && f.item === 'furn_bed_double'), style).toBe(true);
      expect(wallHeadroomProblems(b.r, b.project), style).toEqual([]);
    }
  });
});

describe('assistente: inclinação própria do terreno', () => {
  const gen = (slopePct: number) => generateProject({ ...DEFAULT_ANSWERS, terrain: 'custom', slopePct }, catalog);
  it('a pergunta oferece "Eu sei a inclinação" e a conversão % <-> graus bate', () => {
    expect(questionById('terrain').options?.map((o) => o.value)).toEqual(['flat', 'gentle', 'steep', 'custom']);
    expect(pctToDeg(12)).toBeCloseTo(6.84, 1);
    expect(degToPct(pctToDeg(35))).toBeCloseTo(35, 6);
    expect(normalizeAnswers({ ...DEFAULT_ANSWERS, slopePct: 99 }).slopePct).toBe(60);
    expect(normalizeAnswers({ ...DEFAULT_ANSWERS, slopePct: -3 }).slopePct).toBe(0);
  });
  it('usa o % digitado; acima de 20% entra arrimo e nota; abaixo de 1% é plano', { timeout: 120_000 }, () => {
    const mild = gen(5).project;
    expect(mild.site.type === 'sloped' && mild.site.slopePct).toBe(5);
    expect(mild.extras.some((e) => e.kind === 'retaining')).toBe(false);
    const mid = gen(18).project;
    expect(mid.site.type === 'sloped' && mid.site.slopePct).toBe(18);
    expect(mid.extras.some((e) => e.kind === 'retaining')).toBe(false);
    const steep = gen(35);
    expect(steep.project.site.type === 'sloped' && steep.project.site.slopePct).toBe(35);
    expect(steep.project.extras.some((e) => e.kind === 'retaining')).toBe(true);
    expect(steep.notes.join(' ')).toMatch(/35%.*arrimo/);
    expect(gen(0.5).project.site.type).toBe('flat');
  });
});
