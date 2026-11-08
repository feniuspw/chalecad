import { describe, expect, it } from 'vitest';
import { computeAll, Project } from '@chalecad/engine';
import { getCatalog } from '@chalecad/catalog';
import { DEFAULT_ANSWERS, type WizardAnswers } from './answers';
import { generateProject } from './generate';
import { checkCombo } from './matrix';

const catalog = getCatalog();
const FULL = process.env.WIZARD_FULL === '1';

/** Combinações: estilos × quartos 1–4 × banheiros 1–2 × mezanino × banheiro em cima × laterais × cozinha. */
function* combos(): Generator<WizardAnswers> {
  let n = 0;
  for (const style of ['aframe', 'gable', 'gambrel', 'modern'] as const)
    for (const bedrooms of [1, 2, 3, 4])
      for (const bathrooms of [1, 2] as const)
        for (const mezzanine of ['none', 'sleep', 'living'] as const)
          for (const bathUp of [false, true])
            for (const wings of ['none', 'two'] as const)
              for (const kitchen of ['integrated', 'separate'] as const) {
                n++;
                // amostra determinística (1 a cada 4); WIZARD_FULL=1 roda as 768
                if (!FULL && n % 4 !== 1) continue;
                yield { ...DEFAULT_ANSWERS, style, bedrooms, bathrooms, mezzanine, bathUp, wings, kitchen, laundry: bedrooms % 2 ? 'inside' : 'none' };
              }
}

const label = (a: WizardAnswers) => `${a.style} ${a.bedrooms}q ${a.bathrooms}b mezz=${a.mezzanine} cima=${a.bathUp} lat=${a.wings} coz=${a.kitchen}`;

describe('gerador: matriz de combinações', () => {
  it('projeto válido, cômodos fechados, móveis sem colisão, escada com altura livre, sem alertas de atenção nem verificação reprovada', { timeout: 900_000 }, () => {
    const failures: string[] = [];
    let total = 0;
    for (const a of combos()) {
      total++;
      const p = checkCombo(a, true);
      if (p.length) failures.push(`${label(a)}: ${p.slice(0, 3).join(' / ')}`);
    }
    expect(total).toBeGreaterThan(150);
    expect(failures).toEqual([]);
  });

  it('opções de terreno, finalidade, estrutura, extras e lavanderia também geram projetos válidos', { timeout: 300_000 }, () => {
    const failures: string[] = [];
    for (const purpose of ['weekend', 'live', 'rent'] as const)
      for (const terrain of ['flat', 'gentle', 'steep'] as const)
        for (const structure of ['steel', 'wood', 'any'] as const)
          for (const style of ['aframe', 'gable', 'auto'] as const) {
            const a: WizardAnswers = { ...DEFAULT_ANSWERS, purpose, terrain, structure, style, bedrooms: 2, people: 4, deck: 'covered', laundry: purpose === 'live' ? 'outside' : 'inside', solar: true, rainwater: true, mountain: terrain !== 'flat', uf: 'SC', bathUp: true };
            const p = checkCombo(a);
            if (p.length) failures.push(`${purpose}/${terrain}/${structure}/${style}: ${p.slice(0, 2).join(' / ')}`);
          }
    expect(failures).toEqual([]);
  });
});

describe('gerador: decisões', () => {
  const gen = (over: Partial<WizardAnswers>) => generateProject({ ...DEFAULT_ANSWERS, ...over }, catalog);
  const warnCodes = (p: Project) =>
    computeAll(p, catalog)
      .warnings.filter((w) => w.severity !== 'info')
      .map((w) => w.code);

  it('janelas pela área: cada cômodo com luz passa na iluminação e na ventilação (todos os estilos)', { timeout: 120_000 }, () => {
    for (const style of ['aframe', 'gable', 'gambrel', 'modern'] as const) {
      const { project } = gen({ style, bedrooms: 2, mezzanine: 'sleep' });
      const r = computeAll(project, catalog);
      const nm = catalog.constants.norms;
      for (const room of r.model.rooms) {
        if (!room.polygon || !nm.rooms[room.use]?.light) continue;
        expect(room.glazing, `${style} ${room.name}`).toBeGreaterThanOrEqual(room.area * nm.lightRatio);
      }
      const codes = warnCodes(project);
      expect(codes).not.toContain('room.lighting');
      expect(codes).not.toContain('room.ventilation');
    }
  });

  it('quarto do mezanino: tem luz, e o pé-direito não vira alerta de atenção', { timeout: 120_000 }, () => {
    for (const style of ['aframe', 'gable', 'gambrel'] as const) {
      const { project } = gen({ style, bedrooms: 2, mezzanine: 'sleep', bathUp: true });
      const r = computeAll(project, catalog);
      const loft = r.model.rooms.find((x) => x.name === 'Quarto do mezanino')!;
      expect(loft.glazing, style).toBeGreaterThanOrEqual(loft.area * catalog.constants.norms.lightRatio);
      expect(r.warnings.filter((w) => w.code === 'room.ceiling' && w.severity !== 'info')).toEqual([]);
    }
  });

  it('apoio do mezanino: as vigas vencem o lado curto (nenhuma viga reprovada) e o moderno corre a água no vão curto', { timeout: 120_000 }, () => {
    for (const style of ['gable', 'gambrel'] as const)
      for (const bedrooms of [2, 4]) {
        const { project } = gen({ style, bedrooms, mezzanine: 'sleep' });
        const r = computeAll(project, catalog);
        const joist = r.structure?.checks.find((c) => c.kind === 'joist');
        expect(joist, `${style} ${bedrooms}q`).toBeDefined();
        expect(joist!.ratio, `${style} ${bedrooms}q ${joist!.label}`).toBeLessThanOrEqual(1);
      }
    const shed = gen({ style: 'modern', bedrooms: 3 }).project;
    const t = shed.typology;
    expect(t.kind === 'shed' && (t.highSide === 'left' || t.highSide === 'right') === t.width <= t.depth).toBe(true);
    expect(computeAll(shed, catalog).structure?.checks.filter((c) => c.status === 'fail')).toEqual([]);
  });

  it('selo e notas: projeto padrão sai sem pendências; o que sobra vira nota', { timeout: 120_000 }, () => {
    const r = gen({});
    expect(r.review).toEqual([]);
    expect(Array.isArray(r.fixes)).toBe(true);
    const a = gen({ style: 'aframe', bedrooms: 2, mezzanine: 'sleep' });
    expect(a.notes.join(' ')).toMatch(/engenheiro/);
  });

  it('é puro e determinístico', { timeout: 30_000 }, () => {
    const a = { ...DEFAULT_ANSWERS, style: 'gable' as const, bedrooms: 2 };
    expect(gen(a).project).toEqual(gen(a).project);
    expect(Project.safeParse(JSON.parse(JSON.stringify(gen(a).project))).success).toBe(true);
  });

  it('dimensões razoáveis por estilo', { timeout: 120_000 }, () => {
    const w = (style: WizardAnswers['style'], bedrooms: number) => gen({ style, bedrooms }).project.typology.width;
    for (const b of [1, 2, 3, 4]) {
      expect(w('aframe', b)).toBeGreaterThanOrEqual(6);
      expect(w('aframe', b)).toBeLessThanOrEqual(8);
      expect(w('gable', b)).toBeGreaterThanOrEqual(6);
      expect(w('gable', b)).toBeLessThanOrEqual(7);
      expect(w('gambrel', b)).toBeLessThanOrEqual(7);
    }
    for (const style of ['aframe', 'gable', 'gambrel', 'modern'] as const) for (const b of [1, 4]) expect(gen({ style, bedrooms: b }).project.typology.depth).toBeLessThanOrEqual(14);
  });

  it('banheiro de cima: cômodo no mezanino e torre com platformZ = piso + 2,1 + 1,2', { timeout: 30_000 }, () => {
    const { project } = gen({ style: 'gable', bedrooms: 2, mezzanine: 'sleep', bathUp: true });
    const l1 = project.levels.find((l) => l.elevation > 0)!;
    const bath = project.rooms.find((r) => r.use === 'bathroom' && r.level === l1.id);
    expect(bath).toBeDefined();
    const tower = project.extras.find((e) => e.kind === 'water_tower');
    expect(tower?.kind === 'water_tower' && tower.platformZ).toBeCloseTo(l1.elevation + 2.1 + 1.2, 5);
    // a torre fica sobre o banheiro de cima
    const r = computeAll(project, catalog).model.rooms.find((x) => x.id === bath!.id)!;
    const xs = r.polygon!.map((p) => p[0]);
    const ys = r.polygon!.map((p) => p[1]);
    if (tower?.kind === 'water_tower') {
      expect(tower.position[0]).toBeGreaterThan(Math.min(...xs));
      expect(tower.position[0]).toBeLessThan(Math.max(...xs));
      expect(tower.position[1]).toBeGreaterThan(Math.min(...ys));
      expect(tower.position[1]).toBeLessThan(Math.max(...ys));
    }
  });

  it('sem mezanino não há banheiro de cima nem torre', { timeout: 30_000 }, () => {
    const { project } = gen({ style: 'gable', mezzanine: 'none', bathUp: true });
    expect(project.extras.some((e) => e.kind === 'water_tower')).toBe(false);
    expect(project.levels).toHaveLength(1);
  });

  it('acabamentos pela finalidade', { timeout: 30_000 }, () => {
    const rent = gen({ purpose: 'rent' }).project;
    const weekend = gen({ purpose: 'weekend' }).project;
    expect(rent.rooms.filter((r) => r.use === 'bedroom' || r.use === 'kitchen').every((r) => r.floor === 'finish_floor_porcelain')).toBe(true);
    expect(weekend.rooms.some((r) => r.floor === 'finish_floor_vinyl')).toBe(true);
    expect(rent.finishes.facade).not.toBe(weekend.finishes.facade);
  });

  it('serra: zona 2 e vento maior; terreno inclinado vira site sloped; madeira troca os perfis', { timeout: 30_000 }, () => {
    const p = gen({ mountain: true, terrain: 'steep', structure: 'wood', uf: 'SC' }).project;
    expect(p.performance.zone).toBe(2);
    expect(p.design.windV0).toBeGreaterThan(35);
    expect(p.site.type).toBe('sloped');
    expect(p.meta.region).toBe('SC');
    expect(p.system.structure).toBe('wood');
    expect(p.extras.some((e) => e.kind === 'retaining')).toBe(true);
    expect(gen({ terrain: 'flat' }).project.site.type).toBe('flat');
  });

  it('extras: instalações, solar, chuva, deck e lavanderia externa', { timeout: 30_000 }, () => {
    const p = gen({ installations: true, solar: true, rainwater: true, deck: 'covered', laundry: 'outside', people: 6 }).project;
    expect(p.installations.enabled).toBe(true);
    expect(p.installations.occupants).toBe(6);
    expect(p.performance.solar && p.performance.rainwater).toBe(true);
    expect(p.extras.filter((e) => e.kind === 'deck')).toHaveLength(2);
    expect(gen({ furnish: false }).project.furniture).toHaveLength(0);
  });

  it('A-frame: quartos que não cabem vão para as laterais, com nota', { timeout: 30_000 }, () => {
    const { project, notes } = gen({ style: 'aframe', bedrooms: 3, wings: 'none', mezzanine: 'none' });
    expect(project.typology.kind === 'a_frame' && project.typology.annexes.length).toBeGreaterThan(0);
    expect(notes.join(' ')).toMatch(/lateral|lados|lado/i);
    expect(project.rooms.filter((r) => r.use === 'bedroom')).toHaveLength(3);
  });

  it('cômodos têm uso e nome; "Me ajude a escolher" explica a recomendação', { timeout: 30_000 }, () => {
    const { project, notes } = gen({ style: 'auto', bedrooms: 3 });
    expect(project.rooms.filter((r) => r.use === 'bedroom').map((r) => r.name)).toEqual(expect.arrayContaining(['Quarto 1', 'Quarto 2', 'Quarto 3']));
    expect(project.typology.kind).toBe('shed');
    expect(notes[0]).toMatch(/3 quartos/);
  });
});
