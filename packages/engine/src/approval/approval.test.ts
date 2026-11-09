import { getCatalog } from '@chalecad/catalog';
import { describe, expect, test } from 'vitest';
import { computeAll } from '../compute';
import type { Project } from '../schema/project';
import { loadFixture } from '../../test/helpers/load';
import { mk } from '../../test/helpers/inline';

const catalog = getCatalog();
const house = { kind: 'gable_mezzanine', width: 6.5, depth: 8.5, wallHeight: 2.8, roofPitchDeg: 35, eave: 0.6 };

/** Fixture com cômodos, móveis hidráulicos e instalações ligadas. */
const withInstalls = (j: any, installations: Record<string, unknown> = {}) => { // eslint-disable-line @typescript-eslint/no-explicit-any
  j.rooms = [
    { id: 'r-sala', level: 'L0', use: 'living', name: 'Sala', seed: [2, 2] },
    { id: 'r-wc', level: 'L0', use: 'bathroom', name: 'Banheiro', seed: [5.4, 7.5] },
    { id: 'r-quarto', level: 'L1', use: 'bedroom', name: 'Quarto', seed: [3, 6.5] },
  ];
  j.furniture = [
    { id: 'f-wc', level: 'L0', item: 'furn_toilet', position: [5.0, 8.0] },
    { id: 'f-sink', level: 'L0', item: 'furn_bath_sink', position: [4.8, 6.8] },
    { id: 'f-shower', level: 'L0', item: 'furn_shower', position: [6.0, 7.8] },
    { id: 'f-kitchen', level: 'L0', item: 'furn_kitchen_sink', position: [1.0, 8.0] },
  ];
  j.installations = { enabled: true, ...installations };
};

const arch = { id: 'p-arq', name: 'Ana Arquiteta', title: 'Arquiteta e Urbanista', council: 'CAU', registry: 'A000000-0', disciplines: ['architecture'], docNumber: 'RRT123' };
const eng = { id: 'p-eng', name: 'Eli Engenheiro', title: 'Engenheiro Civil', council: 'CREA', registry: '1234', disciplines: ['structure', 'foundation', 'electrical', 'plumbing'], docNumber: '' };
const zoning = { zone: 'ZR-1', maxOccupancyPct: 50, maxFar: 1, minPermeablePct: 20, setbackFront: 4, setbackSide: 1.5, setbackBack: 3, maxHeight: 9, maxFloors: 2, minCeiling: 2.4, mezzanineCounts: true, source: 'teste' };
const fullLegal = {
  stage: 'legal',
  owner: { name: 'Maria', doc: '000.000.000-00' },
  address: { street: 'Rua A', number: '10', city: 'Gonçalves', cep: '37680-000', registry: '1234' },
  lot: { front: 12, depth: 30, buildingOffset: [3, 5] },
  zoning,
  professionals: [arch, eng],
};

const lotProject = (legal: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) =>
  mk(house, { legal: { ...fullLegal, ...legal }, ...extra });
const fixtureWithLegal = (legal: Record<string, unknown>, installations: Record<string, unknown>) =>
  loadFixture('gable-6.5x8.5-mezzanine.json', (j) => {
    withInstalls(j, installations);
    j.legal = { ...fullLegal, ...legal };
  });
const run = (p: Project, cat = catalog) => computeAll(p, cat).approval!;

describe('computeApproval: exemplo padrão', () => {
  const p = loadFixture('gable-6.5x8.5-mezzanine.json', (j) => withInstalls(j));
  const results = computeAll(p, catalog);
  const ap = results.approval!;

  test('calcula e cada disciplina tem ao menos um item', () => {
    expect(ap).toBeDefined();
    expect(ap.disclaimer).toContain('Não substitui projeto estrutural com ART');
    for (const d of ['architecture', 'structure', 'foundation', 'electrical', 'plumbing'] as const) {
      expect(ap.compliance.some((i) => i.discipline === d), d).toBe(true);
      expect(ap.summary.some((s) => s.discipline === d), d).toBe(true);
    }
  });

  test('ids estáveis e únicos; serializável', () => {
    const ids = ap.compliance.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(JSON.parse(JSON.stringify(ap))).toEqual(ap);
    expect(computeAll(p, catalog).approval).toEqual(ap);
  });

  test('sem lote: urban é null; memoriais e quadro de áreas existem', () => {
    expect(ap.urban).toBeNull();
    expect(ap.memorials.map((m) => m.id)).toEqual(['architecture', 'structure', 'foundation', 'electrical', 'plumbing', 'performance']);
    expect(ap.areas.totalBuilt).toBeGreaterThan(40);
    expect(ap.areas.levels.length).toBe(2);
  });

  test('sem instalações: elétrica e hidro viram "na"', () => {
    const off = run(loadFixture('gable-6.5x8.5-mezzanine.json'));
    expect(off.compliance.find((i) => i.id === 'elec.none')?.status).toBe('na');
    expect(off.compliance.find((i) => i.id === 'plumb.none')?.detail).toContain('desligadas');
    expect(off.sheets.some((s) => s.code.startsWith('ELE'))).toBe(false);
  });

  test('desempenho: menos de 25 ms (meta de 5 ms no motor completo)', () => {
    expect(results.timingsMs.approval).toBeLessThan(25);
  });
});

describe('regra de ouro', () => {
  test('norma não confirmada transforma ok em manual, mantendo o valor', () => {
    const p = loadFixture('gable-6.5x8.5-mezzanine.json', (j) => withInstalls(j));
    const base = run(p).compliance.find((i) => i.id === 'elec.dps')!;
    expect(base.status).toBe('ok'); // NBR 5410 confirmada
    const cat = structuredClone(catalog);
    cat.constants.approval.norms.find((n) => n.id === 'nbr5410')!.confirmed = false;
    const gold = run(p, cat).compliance.find((i) => i.id === 'elec.dps')!;
    expect(gold.status).toBe('manual');
    expect(gold.value).toBe(base.value);
    expect(gold.detail).toContain('pendente de conferência profissional');
  });
});

describe('índices urbanísticos', () => {
  /** Meia espessura da parede externa do exemplo (a face fica além do eixo). */
  const H = (() => {
    const w = computeAll(lotProject(), catalog).model;
    return Math.abs(Math.min(...w.footprint.map((p) => p[1])));
  })();

  test('lote 12 x 30, casa 6,5 x 8,5 em [3, 5], beiral 0,6', () => {
    const u = run(lotProject()).urban!;
    expect(u.lotArea).toBeCloseTo(360, 6);
    // recuos da face externa: eixo − meia espessura da parede
    expect(u.setbacks.front).toBeCloseTo(5 - H, 6);
    expect(u.setbacks.left).toBeCloseTo(3 - H, 6);
    expect(u.setbacks.right).toBeCloseTo(2.5 - H, 6);
    expect(u.setbacks.back).toBeCloseTo(16.5 - H, 6);
    // projeção com beirais: (6,5 + 2·0,6) × (8,5 + 2·0,3) (rake padrão 0,3)
    const manual = (6.5 + 1.2) * (8.5 + 0.6);
    expect(u.footprintArea).toBeCloseTo(manual, 3);
    expect(u.occupancyPct).toBeCloseTo((manual / 360) * 100, 3);
    expect(u.permeableArea).toBeCloseTo(360 - manual, 3);
    expect(u.checks.map((c) => c.id)).toHaveLength(9);
    expect(u.notes[0]).toContain('beirais incluídos na projeção'.replace('b', 'B'));
  });

  test('pavedArea reduz a permeabilidade; limite ausente vira missing', () => {
    const u = run(lotProject({ lot: { ...fullLegal.lot, pavedArea: 20 }, zoning: { ...zoning, maxOccupancyPct: undefined } })).urban!;
    expect(u.permeableArea).toBeCloseTo(360 - (6.5 + 1.2) * (8.5 + 0.6) - 20, 3);
    expect(u.checks.find((c) => c.id === 'occupancy')?.status).toBe('missing');
  });

  test('rotação de 90°', () => {
    const u = run(lotProject({ lot: { front: 12, depth: 30, buildingOffset: [10, 5], rotationDeg: 90 } })).urban!;
    // (x, y) → (10 − y, 5 + x): x em [1,5; 10], y em [5; 11,5]
    expect(u.setbacks.left).toBeCloseTo(1.5 - H, 6);
    expect(u.setbacks.right).toBeCloseTo(2 - H, 6);
    expect(u.setbacks.front).toBeCloseTo(5 - H, 6);
    expect(u.setbacks.back).toBeCloseTo(18.5 - H, 6);
  });

  test('lote poligonal: segmentos classificados por orientação', () => {
    const u = run(lotProject({ lot: { front: 12, depth: 30, buildingOffset: [3, 5], polygon: [[0, 0], [12, 0], [12, 30], [0, 30]] } })).urban!;
    expect(u.setbacks.front).toBeCloseTo(5 - H, 6);
    expect(u.setbacks.left).toBeCloseTo(3 - H, 6);
    expect(u.setbacks.right).toBeCloseTo(2.5 - H, 6);
    expect(u.setbacks.back).toBeCloseTo(16.5 - H, 6);
  });

  test('os itens urbanísticos entram na verificação (fail com TO baixa)', () => {
    const ap = run(lotProject({ zoning: { ...zoning, maxOccupancyPct: 10 } }));
    expect(ap.compliance.find((i) => i.id === 'urban.occupancy')?.status).toBe('fail');
    expect(ap.compliance.find((i) => i.id === 'urban.setback_front')?.status).toBe('ok');
  });
});

describe('dados faltantes', () => {
  const keys = (ap: ReturnType<typeof run>, req?: boolean) => ap.missingInputs.filter((m) => req === undefined || m.required === req).map((m) => m.key);

  test('muda com a etapa', () => {
    const legal = run(mk(house, { legal: { stage: 'legal' } }));
    expect(keys(legal, true)).toEqual(expect.arrayContaining(['legal.owner.name', 'legal.address', 'legal.lot', 'legal.professionals.architecture', 'legal.zoning.maxOccupancyPct']));
    expect(keys(legal, true)).not.toContain('legal.soil');
    expect(legal.ready).toBe(false);
    const exec = run(mk(house, { legal: { stage: 'executive' } }));
    expect(keys(exec, true)).toEqual(expect.arrayContaining(['legal.soil', 'legal.professionals.structure']));
    const pre = run(mk(house, { legal: { stage: 'preliminary' } }));
    expect(keys(pre, true)).toEqual([]);
  });

  test('tudo preenchido na etapa legal: nenhum obrigatório', () => {
    expect(keys(run(lotProject()), true)).toEqual([]);
  });
});

describe('parecer e ready', () => {
  test('o parecer copiado faz ready virar true', () => {
    const before = run(lotProject({ zoning: { ...zoning, maxOccupancyPct: 10 } }));
    expect(before.ready).toBe(false);
    const fails = before.compliance.filter((i) => i.status === 'fail');
    expect(fails.length).toBeGreaterThan(0);
    const reviews = Object.fromEntries(fails.map((i) => [i.id, { status: 'accepted', note: 'ok', at: '2026-11-01' }]));
    const after = run(lotProject({ zoning: { ...zoning, maxOccupancyPct: 10 }, reviews }));
    expect(after.compliance.find((i) => i.id === fails[0]!.id)?.review?.status).toBe('accepted');
    expect(after.ready).toBe(true);
    expect(after.summary.find((s) => s.discipline === 'architecture')?.reviewed).toBeGreaterThan(0);
  });
});

describe('ficha da ART/RRT', () => {
  const p = loadFixture('gable-6.5x8.5-mezzanine.json', (j) => {
    withInstalls(j, { plumbing: { sewerDisposal: 'septic' } });
    j.legal = {
      ...fullLegal,
      contractValues: { architecture: 5000 },
      professionals: [arch, { ...eng, docNumber: 'ART999' }],
    };
  });
  const results = computeAll(p, catalog);
  const art = results.approval!.art;

  test('linhas e quantidades', () => {
    const by = (d: string) => art.activities.filter((a) => a.discipline === d);
    expect(by('architecture')).toHaveLength(1);
    expect(by('architecture')[0]!.council).toBe('CAU');
    expect(by('architecture')[0]!.quantity).toBeCloseTo(results.approval!.areas.totalBuilt, 2);
    expect(by('architecture')[0]!.contractValue).toBe(5000);
    expect(by('architecture')[0]!.professionalId).toBe('p-arq');
    expect(by('foundation')[0]!.quantity).toBeCloseTo(results.quantities.areas.radier, 2);
    const kva = results.installations!.electrical!.circuits.reduce((a, c) => a + c.powerVA, 0) / 1000;
    expect(by('electrical')[0]!.quantity).toBeCloseTo(kva, 2);
    const septic = by('plumbing').find((a) => a.unit === 'm³')!;
    expect(septic.quantity).toBeCloseTo(results.installations!.plumbing!.septic!.tankLiters / 1000, 2);
    expect(by('structure')[0]!.notes).toMatch(/LSF, perfis Ue 90×40×0,95 \(NBR 15253\), radier e=12 cm, área \d+,\d m²/);
  });

  test('endereço em uma linha, proprietário como contratante, pendências', () => {
    expect(art.siteAddress).toContain('Rua A, 10');
    expect(art.contractor.name).toBe('Maria');
    expect(art.blanks.some((b) => b.includes('Valor do contrato'))).toBe(true);
    expect(art.blanks).not.toContain('Nome do proprietário');
  });

  test('sem instalações e sem fossa pública: linhas filtradas', () => {
    const off = run(lotProject()).art.activities;
    expect(off.some((a) => a.discipline === 'electrical' || a.discipline === 'plumbing')).toBe(false);
    const pub = computeAll(
      loadFixture('gable-6.5x8.5-mezzanine.json', (j) => withInstalls(j, { plumbing: { sewerDisposal: 'public' } })),
      catalog,
    ).approval!.art.activities;
    expect(pub.some((a) => a.unit === 'm³')).toBe(false);
  });

  test('wood frame troca o texto da estrutura', () => {
    const w = loadFixture('gable-6.5x8.5-mezzanine.json', (j) => {
      j.system = { structure: 'wood', profiles: { wallStud: 'W38x140', wallTrack: 'W38x140', joist: 'W38x235', rafter: 'W38x184', purlin: 'W25x50' } };
    });
    const a = computeAll(w, catalog).approval!.art.activities.find((x) => x.discipline === 'structure')!;
    expect(a.activity).toContain('wood frame');
  });
});

describe('pranchas', () => {
  const codes = (stage: string, extra: Record<string, unknown> = {}) =>
    run(lotProject({ stage }, extra)).sheets.map((s) => s.code);

  test('por etapa', () => {
    expect(codes('preliminary')).toEqual(['ARQ-01', 'ARQ-02']);
    expect(codes('draft')).toEqual(['ARQ-01', 'ARQ-02']);
    expect(codes('legal')).toEqual(['ARQ-01', 'ARQ-02', 'ARQ-03', 'ARQ-04', 'ARQ-05']);
    // sem instalações: sem ELE/HID
    expect(codes('executive')).toEqual(['ARQ-01', 'ARQ-02', 'ARQ-03', 'ARQ-04', 'ARQ-05', 'EST-01', 'EST-02', 'EST-03', 'EST-04']);
  });

  test('executivo com instalações e fossa', () => {
    const p = fixtureWithLegal({ stage: 'executive' }, { plumbing: { sewerDisposal: 'septic' } });
    const sheets = run(p).sheets;
    expect(sheets.map((s) => s.code)).toEqual(expect.arrayContaining(['ELE-01', 'ELE-02', 'HID-01', 'HID-02', 'HID-03']));
    expect(sheets.find((s) => s.code === 'HID-03')!.contents.some((c) => c.kind === 'septic')).toBe(true);
    const pub = run(fixtureWithLegal({ stage: 'executive' }, { plumbing: { sewerDisposal: 'public' } })).sheets;
    expect(pub.find((s) => s.code === 'HID-03')!.contents.some((c) => c.kind === 'septic')).toBe(false);
  });

  test('escalas: 1:50 na casa pequena, reduzida para casa grande; situação 1:500; implantação 1:100 em lote pequeno', () => {
    const small = run(lotProject()).sheets;
    expect(small.find((s) => s.code === 'ARQ-02')!.contents[0]!.scale).toBe(50);
    expect(small.find((s) => s.code === 'ARQ-01')!.contents.find((c) => c.kind === 'situation')!.scale).toBe(500);
    expect(small.find((s) => s.code === 'ARQ-01')!.contents.find((c) => c.kind === 'implantation')!.scale).toBe(100);
    const big = run(mk({ ...house, width: 16, depth: 14 }, { legal: { ...fullLegal, lot: { front: 30, depth: 60, buildingOffset: [5, 8] } } })).sheets;
    expect(big.find((s) => s.code === 'ARQ-02')!.contents[0]!.scale).toBe(75);
    expect(big.find((s) => s.code === 'ARQ-01')!.contents.find((c) => c.kind === 'implantation')!.scale).toBe(200);
    expect(big.find((s) => s.code === 'ARQ-05')!.contents[0]!.scale).toBe(100);
    const order = ['A4', 'A3', 'A2', 'A1', 'A0'];
    const fmt = (sh: typeof small, c: string) => order.indexOf(sh.find((s) => s.code === c)!.format);
    expect(fmt(big, 'ARQ-02')).toBeGreaterThanOrEqual(fmt(small, 'ARQ-02'));
  });

  test('formato fixo respeita legal.sheetFormat', () => {
    expect(run(lotProject({ sheetFormat: 'A1' })).sheets.every((s) => s.format === 'A1')).toBe(true);
  });
});

describe('memoriais e quadro de áreas', () => {
  const ap = run(lotProject());
  test('texto com valores do projeto e premissa obrigatória', () => {
    const st = ap.memorials.find((m) => m.id === 'structure')!;
    expect(JSON.stringify(st)).toContain('pré-dimensionamento automático: o responsável deve verificar ligações, estabilidade global e detalhes'.replace('p', 'P'));
    expect(st.sections.some((s) => s.title === 'Verificações' && (s.table?.rows.length ?? 0) > 0)).toBe(true);
    const found = ap.memorials.find((m) => m.id === 'foundation')!;
    expect(JSON.stringify(found)).toContain('SPT');
    const arq = ap.memorials.find((m) => m.id === 'architecture')!;
    expect(JSON.stringify(arq)).toContain('Gonçalves');
  });
  test('quadro de áreas: construída do térreo = contorno externo', () => {
    const face = (6.5 + 0.1236) * (8.5 + 0.1236); // face externa das paredes (espessura 12,36 cm)
    expect(ap.areas.levels[0]!.built).toBeCloseTo(face, 3);
    expect(ap.areas.totalBuilt).toBeCloseTo(face, 3);
  });
});
