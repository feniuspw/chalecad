import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { computeAll, loadProject, type Project, type TypologyKind } from '@chalecad/engine';
import { getCatalog } from '@chalecad/catalog';
import { patchTypology, switchTypology } from './edit';
import { addExtra, addVertex, duplicateExtra, extraSummary, perimeterPath, removeExtra, removeVertex, resetPathToPerimeter, retainingPath, setVertex, uphillSide } from './extras';
import { diffMetrics, makeVariant, metricsOf, stageDiffs } from './compare';
import { createProject, TEMPLATE_LABELS, type TemplateKind } from './templates';
import { hostLength } from './geometry';

const KINDS = Object.keys(TEMPLATE_LABELS) as TemplateKind[];
const valid = (p: Project) => {
  const r = loadProject(p);
  expect(r.ok ? [] : r.issues).toEqual([]);
};
const compute = (p: Project) => computeAll(p, getCatalog());

describe('templates de todas as tipologias', () => {
  it.each(KINDS)('%s valida no schema e roda computeAll', (kind) => {
    const p = createProject(kind);
    valid(p);
    const r = compute(p);
    expect(r.model.builtArea).toBeGreaterThan(0);
    expect(r.budget.total).toBeGreaterThan(0);
    expect(r.model.openings.filter((o) => !o.valid)).toEqual([]);
    expect(p.openings.some((o) => o.type === 'door' && o.host === 'ext-front')).toBe(true);
    if (kind !== 'a_frame') expect(p.openings.some((o) => o.type === 'window' && (o.host === 'ext-left' || o.host === 'ext-right' || o.host === 'ext-front'))).toBe(true);
  });

  it('só duas águas e A-frame têm mezanino', () => {
    for (const k of KINDS) {
      const p = createProject(k, { mezzanine: true });
      expect(p.levels.length > 1).toBe(k === 'gable_mezzanine' || k === 'a_frame');
    }
  });

  it('L e T têm abertura na ala', () => {
    for (const shape of ['L', 'T'] as const) {
      const p = createProject('combined', { shape, width: 9, depth: 6, wingWidth: 4, wingOffset: 2 });
      valid(p);
      expect(p.openings.some((o) => o.host.startsWith('wing-'))).toBe(true);
      expect(compute(p).model.openings.every((o) => o.valid)).toBe(true);
      if (p.typology.kind === 'combined' && shape === 'T') expect(p.typology.wing.offset).toBe(2.5);
    }
  });

  it('ala mais larga que a profundidade é reduzida para caber', () => {
    const p = createProject('combined', { width: 10, depth: 3, wingWidth: 8 });
    if (p.typology.kind !== 'combined') throw new Error();
    expect(p.typology.wing.width).toBeLessThanOrEqual(3);
    compute(p);
  });

  it('terreno inclinado entra no projeto e gera relatório de terreno', () => {
    const p = createProject('shed', {
      site: { type: 'sloped', slopePct: 15, downhillAzimuthDeg: 180, platformMargin: { front: 3, back: 1.5, left: 1.5, right: 1.5 }, platformElevation: 'auto', cutSlopeHV: 1, fillSlopeHV: 1.5, disposalDistanceKm: 10 },
    });
    expect(compute(p).terrain?.cutVolume).toBeGreaterThan(0);
  });
});

describe('troca de tipologia', () => {
  const pairs: [TypologyKind, TypologyKind][] = [];
  for (const a of KINDS) for (const b of KINDS) if (a !== b) pairs.push([a, b]);

  it.each(pairs)('%s → %s mantém largura/profundidade, valida e calcula', (a, b) => {
    const base = createProject(a);
    const p = produce(base, (d) => void switchTypology(d, b));
    expect(p.typology.kind).toBe(b);
    expect(p.typology.width).toBe(base.typology.width);
    expect(p.typology.depth).toBe(base.typology.depth);
    valid(p);
    const r = compute(p);
    expect(r.model.openings.filter((o) => !o.valid)).toEqual([]);
    if (b !== 'gable_mezzanine' && b !== 'a_frame') expect(p.levels).toHaveLength(1);
  });

  it('preserva a porta da frente', () => {
    const p = produce(createProject('gable_mezzanine'), (d) => void switchTypology(d, 'combined'));
    expect(p.openings.some((o) => o.type === 'door' && o.host === 'ext-front')).toBe(true);
  });

  it('remove mezanino, escada e aberturas dependentes ao ir para tipologia sem mezanino', () => {
    const p = produce(createProject('gable_mezzanine'), (d) => void switchTypology(d, 'shed'));
    expect(p.stairs).toHaveLength(0);
    expect(p.levels).toHaveLength(1);
  });

  it('volta para duas águas com eixo da cumeeira coerente', () => {
    const p = produce(createProject('gambrel'), (d) => {
      d.roof.ridgeAxis = 'width';
      switchTypology(d, 'shed');
    });
    expect(p.roof.ridgeAxis).toBe('depth');
  });
});

describe('edição por tipologia', () => {
  it('meia-água: lado baixo nunca passa do alto', () => {
    const p = produce(createProject('shed'), (d) => void patchTypology(d, { lowHeight: 5 }));
    if (p.typology.kind !== 'shed') throw new Error();
    expect(p.typology.highHeight).toBeGreaterThanOrEqual(p.typology.lowHeight);
    valid(p);
    compute(p);
  });

  it('meia-água: mudar o lado alto continua calculável', () => {
    for (const highSide of ['front', 'back', 'left', 'right'] as const) {
      const p = produce(createProject('shed'), (d) => void patchTypology(d, { highSide }));
      valid(p);
      expect(compute(p).model.openings.every((o) => o.valid)).toBe(true);
    }
  });

  it('L/T: ala sempre cabe ao mudar largura, profundidade e forma', () => {
    let p = createProject('combined', { width: 10, depth: 8, wingWidth: 6, wingOffset: 4 });
    p = produce(p, (d) => void patchTypology(d, { width: 7 }));
    if (p.typology.kind !== 'combined') throw new Error();
    expect(p.typology.wing.offset + p.typology.wing.width).toBeLessThanOrEqual(7 + 1e-9);
    p = produce(p, (d) => void patchTypology(d, { depth: 4 }));
    if (p.typology.kind !== 'combined') throw new Error();
    expect(p.typology.wing.width).toBeLessThanOrEqual(4);
    p = produce(p, (d) => void patchTypology(d, { shape: 'T' }));
    valid(p);
    compute(p);
  });

  it('L/T: encolher o corpo mantém aberturas dentro dos hospedeiros', () => {
    const p = produce(createProject('combined'), (d) => void patchTypology(d, { width: 5, wing: { width: 2.5 } }));
    for (const o of p.openings) {
      const len = hostLength(p, o.host);
      expect(len).not.toBeNull();
      expect(o.offset + o.width).toBeLessThanOrEqual(len! + 1e-6);
    }
    expect(compute(p).model.openings.every((o) => o.valid)).toBe(true);
  });

  it('gambrel e telhado plano: parâmetros próprios', () => {
    const g = produce(createProject('gambrel'), (d) => void patchTypology(d, { breakRatio: 0.6, lowerPitchDeg: 70 }));
    valid(g);
    compute(g);
    const f = produce(createProject('flat_roof'), (d) => void patchTypology(d, { parapetHeight: 0, slopePct: 10 }));
    valid(f);
    compute(f);
  });

  it('janelas nunca ultrapassam o pé-direito ao baixar a altura', () => {
    const p = produce(createProject('flat_roof'), (d) => void patchTypology(d, { wallHeight: 2.3 }));
    expect(compute(p).model.openings.every((o) => o.valid)).toBe(true);
  });
});

describe('extras', () => {
  const base = () => createProject('gable_mezzanine');

  it('cerca e muro padrão: retângulo com folga de 3 m em volta da casa', () => {
    const p = base();
    const path = perimeterPath(p);
    expect(path).toEqual([[-3, -3], [9.5, -3], [9.5, 11.5], [-3, 11.5]]);
    const q = produce(p, (d) => void addExtra(d, 'fence'));
    expect(q.extras[0]).toMatchObject({ kind: 'fence', closed: true, path });
  });

  it('L/T: o perímetro inclui a ala', () => {
    const p = createProject('combined');
    if (p.typology.kind !== 'combined') throw new Error();
    const path = perimeterPath(p);
    expect(path[2]![1]).toBe(p.typology.depth + p.typology.wing.depth + 3);
  });

  it.each(['deck', 'wall', 'fence', 'retaining'] as const)('adiciona %s válido e calculável', (kind) => {
    const p = produce(createProject('shed', { site: { type: 'sloped', slopePct: 12, downhillAzimuthDeg: 180, platformMargin: { front: 3, back: 1.5, left: 1.5, right: 1.5 }, platformElevation: 'auto', cutSlopeHV: 1, fillSlopeHV: 1.5, disposalDistanceKm: 10 } }), (d) => void addExtra(d, kind));
    valid(p);
    const r = compute(p);
    expect(r.model.extras).toHaveLength(1);
    expect(extraSummary(p.extras[0]!).detail.length).toBeGreaterThan(0);
  });

  it('arrimo fica do lado da subida', () => {
    const p = createProject('gable_mezzanine', { site: { type: 'sloped', slopePct: 10, downhillAzimuthDeg: 180, platformMargin: { front: 3, back: 1.5, left: 1.5, right: 1.5 }, platformElevation: 'auto', cutSlopeHV: 1, fillSlopeHV: 1.5, disposalDistanceKm: 10 } });
    expect(uphillSide(p)).toBe('back');
    expect(retainingPath(p)[0]![1]).toBeCloseTo(p.typology.depth + 1.5);
    expect(uphillSide(produce(p, (d) => void (d.site = { ...(d.site as never as { type: 'sloped' }), type: 'sloped', slopePct: 10, downhillAzimuthDeg: 90, platformMargin: { front: 3, back: 1.5, left: 1.5, right: 1.5 }, platformElevation: 'auto', cutSlopeHV: 1, fillSlopeHV: 1.5, disposalDistanceKm: 10 })))).toBe('left');
  });

  it('vértices: editar, inserir, remover (mínimo 2) e restaurar o perímetro', () => {
    let p = produce(base(), (d) => void addExtra(d, 'wall'));
    const id = p.extras[0]!.id;
    p = produce(p, (d) => void setVertex(d, id, 0, [-1, -2]));
    expect((p.extras[0] as { path: number[][] }).path[0]).toEqual([-1, -2]);
    p = produce(p, (d) => void addVertex(d, id, 3)); // entre o último e o primeiro (fechado)
    expect((p.extras[0] as { path: number[][] }).path).toHaveLength(5);
    for (let i = 0; i < 6; i++) p = produce(p, (d) => void removeVertex(d, id, 0));
    expect((p.extras[0] as { path: number[][] }).path).toHaveLength(2);
    p = produce(p, (d) => void resetPathToPerimeter(d, id));
    expect((p.extras[0] as { path: number[][] }).path).toHaveLength(4);
  });

  it('duplica com IDs novos e exclui', () => {
    let p = produce(base(), (d) => {
      addExtra(d, 'fence');
      addExtra(d, 'deck');
    });
    const [f, dk] = p.extras;
    p = produce(p, (d) => {
      duplicateExtra(d, f!.id);
      duplicateExtra(d, dk!.id);
    });
    expect(new Set(p.extras.map((e) => e.id)).size).toBe(4);
    valid(p);
    p = produce(p, (d) => void removeExtra(d, f!.id));
    expect(p.extras).toHaveLength(3);
  });
});

describe('comparação de variantes', () => {
  it('gera variantes sem alterar A', () => {
    const a = createProject('gable_mezzanine');
    const snap = JSON.stringify(a);
    const t = makeVariant(a, { kind: 'typology', typology: 'gambrel' });
    const s = makeVariant(a, { kind: 'spacing', spacing: 0.4 });
    const sl = makeVariant(a, { kind: 'slope', pct: 15 });
    expect(JSON.stringify(a)).toBe(snap);
    expect(t.typology.kind).toBe('gambrel');
    expect(s.system.studSpacing).toBe(0.4);
    expect(sl.site.type === 'sloped' && sl.site.slopePct).toBe(15);
    for (const v of [t, s, sl]) valid(v);
    expect(makeVariant(sl, { kind: 'slope', pct: 0 }).site.type).toBe('flat');
  });

  it('diferenças: mais montantes = mais aço e mais peças; verde para o menor', () => {
    const a = createProject('gable_mezzanine');
    const b = makeVariant(a, { kind: 'spacing', spacing: 0.4 });
    const ra = compute(a);
    const rb = compute(b);
    const rows = Object.fromEntries(diffMetrics(metricsOf(ra), metricsOf(rb)).map((r) => [r.key, r]));
    expect(rows.pieces!.delta).toBeGreaterThan(0);
    expect(rows.pieces!.winner).toBe('a');
    expect(rows.builtArea!.winner).toBe('tie');
    expect(rows.total!.delta).toBeCloseTo(rb.budget.total - ra.budget.total);
    const same = diffMetrics(metricsOf(ra), metricsOf(ra));
    expect(same.every((r) => r.winner === 'tie' || r.winner === 'none')).toBe(true);
    const stages = stageDiffs(ra, rb);
    expect(stages.reduce((s, x) => s + x.delta, 0)).toBeCloseTo(rb.budget.byStage.reduce((s, x) => s + x.total, 0) - ra.budget.byStage.reduce((s, x) => s + x.total, 0));
  });
});
