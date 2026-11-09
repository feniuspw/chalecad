import { describe, expect, it } from 'vitest';
import { computeAll, deckGeometry, Project as ProjectSchema, type ExtraModel, type Project } from '@chalecad/engine';
import { getCatalog } from '@chalecad/catalog';
import { pointInPolygon } from '@chalecad/engine';
import { planSvg } from '../plan2d/plan';
import { sectionSvg } from '../plan2d/section';
import { PRESETS } from './presets';
import { DEFAULT_ANSWERS } from './wizard/answers';
import { generateProject } from './wizard/generate';
import {
  addExtra,
  deckAlignPatch,
  deckBoardLayout,
  deckFasciaLayout,
  deckMemberBoxes,
  deckPillarLayout,
  deckRailLayout,
  deckSpan,
  deckStairLayout,
  houseModel,
  patchExtra,
  sideFaceCount,
  sideLength,
  type DeckBox,
} from './extras';

const catalog = getCatalog();
const finite = (v: unknown): boolean => (typeof v === 'number' ? Number.isFinite(v) : Array.isArray(v) ? v.every(finite) : true);
const boxOk = (b: DeckBox) => finite(b.center) && finite(b.size) && Number.isFinite(b.yaw) && Number.isFinite(b.pitch) && b.size.every((s) => s > 0);

function deckLayouts(em: ExtraModel) {
  const d = em.deck!;
  const X = catalog.constants.extras.deck;
  return [
    ...deckBoardLayout(em, X.board),
    ...deckFasciaLayout(em, X.board.thickness + X.joist.depth),
    ...deckMemberBoxes(d.joists),
    ...deckMemberBoxes(d.beams),
    ...(d.ledger ? deckMemberBoxes([d.ledger]) : []),
    ...deckRailLayout(em.segments).boxes,
    ...d.stairs.flatMap((s) => {
      const l = deckStairLayout(s);
      return [...l.treads, ...l.stringers, ...l.rails];
    }),
    ...deckPillarLayout(em).pillars.map((p) => p.box),
    ...deckPillarLayout(em).pads,
    ...deckPillarLayout(em).braces,
  ];
}

describe('presets: o deck fica alinhado, dentro do contorno e sem NaN', () => {
  for (const preset of PRESETS) {
    it(preset.id, () => {
      const project = preset.build();
      const r = computeAll(project, catalog);
      const decks = r.model.extras.filter((x) => x.kind === 'deck');
      expect(decks.length).toBeGreaterThan(0);
      for (const em of decks) {
        expect(em.polygon!.length).toBeGreaterThanOrEqual(4);
        expect(finite(em.polygon)).toBe(true);
        expect(em.deck).toBeDefined();
        for (const b of deckLayouts(em)) expect(boxOk(b), JSON.stringify(b)).toBe(true);
        // não entra no contorno
        const xs = em.polygon!.map((p) => p[0]);
        const ys = em.polygon!.map((p) => p[1]);
        for (let x = Math.min(...xs) + 0.02; x < Math.max(...xs); x += 0.1)
          for (let y = Math.min(...ys) + 0.02; y < Math.max(...ys); y += 0.1) expect(pointInPolygon([x, y], r.model.footprint, 1e-6)).toBe(false);
        // sem verificação reprovada (terreno plano, cota padrão)
        expect(em.deck!.checks.filter((c) => c.status === 'fail'), preset.id).toEqual([]);
        expect(em.roof ? em.roof.vertices.every((v) => finite(v)) : true).toBe(true);
      }
      // planta e corte desenham o deck
      expect(planSvg(r.model, { project }).svg).toContain('data-role="deck-outline"');
      expect(planSvg(r.model, { project }).svg).not.toMatch(/NaN/);
      expect(sectionSvg(r.model, 'B').svg).not.toMatch(/NaN/);
    });
  }
});

describe('helpers do deck', () => {
  const base = (): Project => structuredClone(PRESETS[0]!.build());

  it('addExtra: deck centralizado na fachada e com os campos novos', () => {
    const p = base();
    p.extras = [];
    const id = addExtra(p, 'deck');
    const e = p.extras.find((x) => x.id === id)!;
    expect(e).toMatchObject({ kind: 'deck', align: 'center', offset: 0, guardrail: 'auto', stairs: 'auto', support: 'auto', footing: 'auto', boards: 'parallel', facadeIndex: 0 });
    expect(() => ProjectSchema.parse(JSON.parse(JSON.stringify(p)))).not.toThrow();
  });

  it('sideLength vem da face real do contorno (inclui a meia espessura da parede)', () => {
    const p = base();
    const m = houseModel(p)!;
    const xs = m.footprint.map((v) => v[0]);
    expect(sideLength(p, 'front')).toBeCloseTo(Math.max(...xs) - Math.min(...xs), 9);
    expect(sideLength(p, 'front')).toBeGreaterThan(p.typology.width);
    expect(sideFaceCount(p, 'front')).toBeGreaterThanOrEqual(1);
  });

  it('deckAlignPatch: início, centro e fim zeram o deslocamento; "porta" centraliza sob a porta da fachada', () => {
    const p = base();
    p.extras = [];
    const id = addExtra(p, 'deck');
    patchExtra(p, id, { length: 2, align: 'start', offset: 0 });
    const e = p.extras[0]! as Extract<Project['extras'][number], { kind: 'deck' }>;
    expect(deckAlignPatch(p, e, 'start')).toEqual({ align: 'start', offset: 0 });
    expect(deckAlignPatch(p, e, 'center')).toEqual({ align: 'center', offset: 0 });
    expect(deckAlignPatch(p, e, 'end')).toEqual({ align: 'end', offset: 0 });
    const door = deckAlignPatch(p, e, 'door');
    expect(door).not.toBeNull();
    expect(door!.align).toBe('center');
    // aplicado, o centro do deck cai sobre a porta
    const applied = { ...e, ...door! };
    const span = deckSpan(p, applied);
    const model = houseModel(p)!;
    const doorX = model.openings
      .filter((o) => o.type === 'door' || o.type === 'sliding_door')
      .map((o) => {
        const w = model.walls.find((x) => x.id === o.hostId)!;
        return w.from[0] + ((o.u0 + o.u1) / 2) * Math.sign(w.to[0] - w.from[0]);
      });
    const g = deckGeometry(p, applied, { footprint: model.footprint });
    const cx = (g.polygon[0]![0] + g.polygon[2]![0]) / 2;
    expect(doorX.some((x) => Math.abs(x - cx) < 0.06) || span.a1 - span.a0 < 2).toBe(true);
  });

  it('wizard: decks gerados também têm estrutura e sem NaN', () => {
    for (const deck of ['front', 'covered'] as const) {
      const project = generateProject({ ...DEFAULT_ANSWERS, style: 'gable', deck, laundry: 'outside' }).project;
      const r = computeAll(project, catalog);
      for (const em of r.model.extras.filter((x) => x.kind === 'deck')) {
        expect(em.deck).toBeDefined();
        for (const b of deckLayouts(em)) expect(boxOk(b)).toBe(true);
      }
    }
  });
});
