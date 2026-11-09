import { describe, expect, it } from 'vitest';
import { getCatalog } from '@chalecad/catalog';
import { computeAll, type ApprovalReport, type Project, type SheetSpec } from '@chalecad/engine';
import { sectionSvg } from '../plan2d/section';
import { createProject } from '../project/templates';
import { fallbackSheets, setbacksOf } from './arch';
import { formatsFrom, packBoxes, sheetGeometry } from './frame/format';
import { prepareSheet } from './frame/sheet';
import { fit, wrap } from './frame/text';
import { buildSheets, exportSheetsPdf, registry, type SheetContext } from './index';
import { parsePath, parseSvg } from './pdf/svg';

const catalog = getCatalog();
const TODAY = new Date(2026, 10, 9);

function legalProject(kind: 'gable_mezzanine' | 'a_frame' = 'gable_mezzanine', lot = true): Project {
  const p = createProject(kind);
  p.legal.owner = { name: 'Maria da Silva', doc: '123.456.789-00', address: '', email: '', phone: '' };
  p.legal.address = { ...p.legal.address, street: 'Rua das Acácias', number: '120', city: 'Gonçalves', lot: '07', block: 'C', registry: '12345', cadastral: '01.02.003' };
  p.legal.professionals = [
    { id: 'p1', name: 'Ana Arquiteta', title: 'Arquiteta e Urbanista', council: 'CAU', registry: 'A123456-7', uf: 'MG', company: '', companyRegistry: '', disciplines: ['architecture'], docNumber: 'RRT 123' },
    { id: 'p2', name: 'Carlos Eng', title: 'Engenheiro Civil', council: 'CREA', registry: '99', uf: 'MG', company: '', companyRegistry: '', disciplines: ['execution'], docNumber: 'ART 987' },
  ];
  p.legal.drawnBy = 'AA';
  p.legal.checkedBy = 'CE';
  p.legal.revisions = [{ code: 'R00', date: '2026-11-01', description: 'Emissão' }, { code: 'R01', date: '2026-11-08', description: 'Recuos' }];
  if (lot) p.legal.lot = { front: 12, depth: 30, buildingOffset: [3, 5], rotationDeg: 0, pavedArea: 0, streetName: 'Rua das Acácias' };
  return p;
}

const ctxOf = (project: Project): SheetContext => ({ project, results: computeAll(project, catalog), catalog, date: TODAY });
/** Relatório de aprovação mínimo (o motor F17-E1 preenche o real). */
const withApproval = (ctx: SheetContext, sheets: SheetSpec[]): SheetContext => ({
  ...ctx,
  results: { ...ctx.results, approval: { sheets, urban: null, areas: { rooms: [], levels: [], totalBuilt: 80, totalUseful: 0, coveredOpen: 0 } } as unknown as ApprovalReport },
});

describe('formatos e diagramação', () => {
  it('sobe de formato a partir do inicial, do menor para o maior', () => {
    expect(formatsFrom(catalog, 'A3').map((f) => f.id)).toEqual(['A3', 'A2', 'A1', 'A0']);
    expect(formatsFrom(catalog, 'A0').map((f) => f.id)).toEqual(['A0']);
  });

  it('área útil = formato − margens − carimbo, margem esquerda de 25 mm', () => {
    const f = formatsFrom(catalog, 'A2')[0]!;
    const g = sheetGeometry(catalog, f);
    expect(g.frame).toEqual({ x0: 25, y0: 7, x1: 587, y1: 413 });
    expect(g.column.x1 - g.column.x0).toBe(catalog.constants.approval.titleBlock.width);
    expect(g.draw.x1).toBeLessThan(g.column.x0);
  });

  it('arruma caixas em linhas e devolve null quando não cabem', () => {
    const pos = packBoxes([{ w: 100, h: 50 }, { w: 100, h: 50 }, { w: 100, h: 50 }], 220, 120, 10)!;
    expect(pos).toHaveLength(3);
    expect(new Set(pos.map((p) => p.y)).size).toBe(2); // duas linhas
    expect(packBoxes([{ w: 300, h: 10 }], 220, 120, 10)).toBeNull();
    expect(packBoxes([{ w: 100, h: 100 }, { w: 100, h: 100 }], 100, 150, 10)).toBeNull();
  });

  it('o formato sugerido sobe quando o conteúdo não cabe, e legal.sheetFormat fixa o ponto de partida', () => {
    const project = legalProject();
    const ctx = ctxOf(project);
    const big = (w: number, h: number) => () => ({ body: '<rect x="0" y="0" width="1" height="1"/>', width: w, height: h, scale: 50, title: 'GRANDE' });
    const spec: SheetSpec = { code: 'ARQ-09', discipline: 'architecture', title: 'T', format: 'A3', contents: [{ kind: 'plan', title: 'GRANDE', scale: 50 }] };
    const small = prepareSheet(ctx, spec, { plan: big(100, 100) })!;
    expect(small.format.id).toBe('A3');
    const mid = prepareSheet(ctx, spec, { plan: big(300, 300) })!;
    expect(mid.format.id).toBe('A2');
    const fixed = structuredClone(project);
    fixed.legal.sheetFormat = 'A1';
    expect(prepareSheet({ ...ctx, project: fixed }, spec, { plan: big(100, 100) })!.format.id).toBe('A1');
  });

  it('reduz a escala para a próxima do catálogo quando nem o A0 comporta, e registra a nota', () => {
    const ctx = ctxOf(legalProject());
    const huge = (_c: unknown, _s: unknown, scale: number) => ({ body: '<rect x="0" y="0" width="1" height="1"/>', width: (scale === 50 ? 1500 : 800), height: 500, scale, title: 'ENORME' });
    const spec: SheetSpec = { code: 'ARQ-09', discipline: 'architecture', title: 'T', format: 'A1', contents: [{ kind: 'plan', title: 'ENORME', scale: 50 }] };
    const sheet = prepareSheet(ctx, spec, { plan: huge })!;
    expect(sheet.format.id).toBe('A0');
    expect(sheet.layoutNotes[0]).toContain('1:50 para 1:75');
    const doc = sheet.render(1, 1);
    expect(doc.svg).toContain('ESC. 1:75');
    expect(doc.svg).toContain('reduzida de 1:50 para 1:75');
  });

  it('trunca e quebra texto sem estourar a largura', () => {
    expect(fit('abcdefghij', 5, 2.5)).toMatch(/…$/);
    expect(fit('curto', 50, 2.5)).toBe('curto');
    expect(wrap('uma frase razoavelmente longa para quebrar em linhas', 30, 2.5).length).toBeGreaterThan(1);
  });
});

describe('carimbo', () => {
  const FIELDS = [
    'OBRA', 'CONTEÚDO DA PRANCHA', 'ETAPA', 'PROPRIETÁRIO', 'CPF/CNPJ', 'ENDEREÇO DA OBRA', 'AUTOR DO PROJETO', 'CONSELHO / REGISTRO',
    'RESPONSÁVEL PELA EXECUÇÃO', 'Nº ART/RRT (PROJETO)', 'Nº ART/RRT (EXECUÇÃO)', 'ESCALA', 'DATA', 'FOLHA', 'CÓDIGO', 'REVISÃO',
    'DESENHO', 'CONFERÊNCIA', 'ÁREA DO TERRENO', 'ÁREA CONSTRUÍDA', 'ASSINATURA DO PROPRIETÁRIO', 'ASSINATURA DO RESPONSÁVEL TÉCNICO',
  ];

  it('tem todos os campos preenchidos com os dados do projeto legal', () => {
    const sheets = buildSheets(ctxOf(legalProject()));
    const svg = sheets[0]!.svg;
    for (const f of FIELDS) expect(svg).toContain(`data-field="${f}"`);
    for (const v of ['Chalé 6,5 × 8,5', 'Maria da Silva', '123.456.789-00', 'Rua das Acácias, 120', 'Lote 07', 'Quadra C', 'Matrícula 12345', 'Ana Arquiteta', 'CAU A123456-7/MG', 'Carlos Eng', 'RRT 123', 'ART 987', '09/11/2026', 'ARQ-01', 'Projeto legal (PL)', '360,00 m²', 'ChaléCAD', 'Reservado à aprovação', 'R01', 'Recuos']) {
      expect(svg).toContain(v);
    }
    expect(svg).toContain('data-role="revisions"');
    expect(svg).toContain('>1/5<');
  });

  it('campos vazios saem em branco, nunca como "undefined"', () => {
    const empty = createProject('gable_mezzanine');
    const sheets = buildSheets(ctxOf(empty));
    expect(sheets.length).toBeGreaterThan(0);
    for (const s of sheets) {
      expect(s.svg).not.toMatch(/undefined|NaN|Infinity|null/);
      for (const f of FIELDS) expect(s.svg).toContain(`data-field="${f}"`);
    }
  });

  it('inclui o aviso do relatório na coluna de notas', () => {
    expect(buildSheets(ctxOf(legalProject()))[0]!.svg).toContain('Estimativa para planejamento');
  });
});

describe('corte', () => {
  const model = computeAll(createProject('gable_mezzanine'), catalog).model;

  it('duas águas com mezanino: pés-direitos, piso a piso e cumeeira', () => {
    const doc = sectionSvg(model, 'A', undefined, { paper: true, unitsPerMeter: 20 });
    const ceiling = doc.dims.filter((d) => d.kind === 'ceiling').map((d) => d.label);
    expect(ceiling).toContain('2,58'); // térreo: 2,80 menos a laje de 21,8 cm
    expect(ceiling).toContain('2,28'); // mezanino até a cumeeira
    expect(doc.dims.find((d) => d.kind === 'floor')!.label).toBe('2,80');
    expect(doc.dims.find((d) => d.kind === 'ridge')!.value).toBeCloseTo(model.ridgeHeight, 2);
    expect(doc.dims.find((d) => d.kind === 'ridge')!.label).toBe('5,08');
    expect(doc.dims.some((d) => d.kind === 'eave')).toBe(true);
    for (const t of ['2,58', '2,80', '5,08', '±0,00', '+2,80']) expect(doc.svg).toContain(`>${t}<`);
    expect(doc.svg).toContain('data-role="wall-cut"');
    expect(doc.svg).toContain('data-role="roof-cut"');
    expect(doc.svg).toContain('data-role="slab-cut"');
    expect(doc.svg).not.toMatch(/NaN|undefined/);
  });

  it('corte B passa pela escada e mostra os degraus cortados', () => {
    const doc = sectionSvg(model, 'B');
    expect(doc.at).toBeCloseTo(0.6, 2);
    expect(doc.svg).toContain('data-role="stair-cut"');
    expect(doc.axis).toBe('B');
  });

  it('terreno inclinado desenha o natural e o platô', () => {
    const p = createProject('gable_mezzanine');
    p.site = { type: 'sloped', slopePct: 20, downhillAzimuthDeg: 180, platformMargin: { front: 3, back: 1.5, left: 1.5, right: 1.5 }, platformElevation: 'auto', cutSlopeHV: 1, fillSlopeHV: 1.5, disposalDistanceKm: 10 };
    const r = computeAll(p, catalog);
    const doc = sectionSvg(r.model, 'B', undefined, { site: p.site, platformZ: r.terrain?.platformZ });
    expect(doc.svg).toContain('data-role="natural-terrain"');
    expect(doc.svg).toContain('data-role="platform"');
  });
});

describe('implantação', () => {
  it('recuos da face externa, iguais aos do motor: lote 12 × 30 com a casa em [3, 5]', () => {
    const ctx = ctxOf(legalProject());
    const sb = setbacksOf(ctx)!;
    // meia espessura da parede externa: a face fica além do eixo
    const H = -Math.min(...ctx.results.model.footprint.map((p) => p[1]));
    expect(H).toBeGreaterThan(0.03);
    expect(sb.front).toBeCloseTo(5 - H, 6);
    expect(sb.left).toBeCloseTo(3 - H, 6);
    expect(sb.right).toBeCloseTo(12 - 3 - 6.5 - H, 6);
    expect(sb.back).toBeCloseTo(30 - 5 - 8.5 - H, 6);
    const urban = ctx.results.approval?.urban;
    if (urban) {
      expect(sb.front).toBeCloseTo(urban.setbacks.front, 6);
      expect(sb.left).toBeCloseTo(urban.setbacks.left, 6);
    }
    const svg = registry.implantation!(ctx, { kind: 'implantation', title: 'IMPLANTAÇÃO', scale: 200 }, 200)!.body;
    const f = (v: number) => v.toFixed(2).replace('.', ',');
    for (const v of [sb.front, sb.left, sb.right, sb.back]) expect(svg).toContain(`>${f(v)}<`);
    expect(svg).toContain('data-role="setbacks"');
    expect(svg).toContain('data-role="eave"');
    expect(svg).toContain('data-role="permeable-label"');
  });

  it('fossa e poço locados mostram a distância entre eles', () => {
    const p = legalProject();
    p.legal.septicPosition = [9, 22];
    p.legal.wellPosition = [3, 26];
    const out = registry.implantation!(ctxOf(p), { kind: 'implantation', title: 'I', scale: 200 }, 200)!;
    expect(out.body).toContain('data-distance="7.21"');
    expect(out.body).toContain('>7,21 m<');
  });

  it('sem lote, situação e implantação devolvem null', () => {
    const ctx = ctxOf(legalProject('gable_mezzanine', false));
    expect(registry.situation!(ctx, { kind: 'situation', title: 'S', scale: 500 }, 500)).toBeNull();
    expect(registry.implantation!(ctx, { kind: 'implantation', title: 'I', scale: 200 }, 200)).toBeNull();
  });
});

describe('buildSheets', () => {
  it('com o fallback da etapa legal gera 5 folhas numeradas x/y', () => {
    const base = ctxOf(legalProject());
    const ctx = { ...base, results: { ...base.results, approval: undefined } };
    const sheets = buildSheets(ctx);
    expect(sheets.map((s) => s.spec.code)).toEqual(['ARQ-01', 'ARQ-02', 'ARQ-03', 'ARQ-04', 'ARQ-05']);
    sheets.forEach((s, i) => {
      expect(s.index).toBe(i + 1);
      expect(s.total).toBe(5);
      expect(s.svg).toContain(`>${i + 1}/5<`);
      expect(s.svg).toMatch(/^<svg /);
      expect(s.widthMm).toBeGreaterThan(s.heightMm);
      expect(s.svg).not.toMatch(/NaN|undefined/);
    });
    expect(sheets[1]!.svg).toContain('PLANTA BAIXA — MEZANINO');
    expect(sheets[1]!.svg).toContain('data-cut="A"');
  });

  it('conteúdo sem renderizador vai para skipped e a folha continua; folha toda vazia sai', () => {
    const p = legalProject();
    const ctx = ctxOf(p);
    const specs: SheetSpec[] = [
      { code: 'ARQ-01', discipline: 'architecture', title: 'Mista', format: 'A3', contents: [{ kind: 'roof', title: 'COBERTURA', scale: 100 }, { kind: 'tank_detail', title: 'DETALHE', scale: 20 }] },
      { code: 'EST-01', discipline: 'structure', title: 'Vazia', format: 'A3', contents: [{ kind: 'foundation', title: 'FUNDAÇÃO', scale: 50 }] },
    ];
    const saved = { foundation: registry.foundation, tank_detail: registry.tank_detail };
    delete registry.foundation;
    delete registry.tank_detail;
    let sheets;
    try {
      sheets = buildSheets(withApproval(ctx, specs));
    } finally {
      Object.assign(registry, saved);
    }
    expect(sheets).toHaveLength(1);
    expect(sheets[0]!.skipped).toEqual(['tank_detail']);
    expect(sheets[0]!.total).toBe(1);
  });

  it('usa results.approval.sheets quando existe', () => {
    const ctx = ctxOf(legalProject());
    const one: SheetSpec = { code: 'ARQ-01', discipline: 'architecture', title: 'Só cobertura', format: 'A3', contents: [{ kind: 'roof', title: 'COBERTURA', scale: 100 }] };
    const sheets = buildSheets(withApproval(ctx, [one]));
    expect(sheets).toHaveLength(1);
  });

  it('desenha também o A-frame sem erros', () => {
    const sheets = buildSheets(ctxOf(legalProject('a_frame')));
    expect(sheets).toHaveLength(5);
    expect(fallbackSheets(legalProject('a_frame'), ctxOf(legalProject('a_frame')).results)).toHaveLength(5);
  });
});

describe('SVG para PDF', () => {
  it('lê elementos, atributos e entidades', () => {
    const n = parseSvg('<svg viewBox="0 0 10 10"><g transform="translate(1 2)"><text x="1" y="2">A &amp; B &#176;</text></g></svg>');
    expect(n.children[0]!.attrs.transform).toBe('translate(1 2)');
    expect(n.children[0]!.children[0]!.text).toBe('A & B °');
  });

  it('converte arcos em curvas', () => {
    const ops = parsePath('M0 0 A5 5 0 0 1 10 0');
    expect(ops[0]!.op).toBe('M');
    const last = ops[ops.length - 1]!;
    expect(last.op).toBe('C');
    expect(last.pts[4]).toBeCloseTo(10, 4);
    expect(last.pts[5]).toBeCloseTo(0, 4);
  });
});

describe('exportSheetsPdf', () => {
  it('devolve um PDF vetorial com uma página por folha, no tamanho real', async () => {
    const ctx = ctxOf(legalProject());
    const sheets = buildSheets(ctx);
    const blob = await exportSheetsPdf(ctx);
    expect(blob.type).toBe('application/pdf');
    const text = Buffer.from(await blob.arrayBuffer()).toString('latin1');
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text.match(/\/Type\s*\/Page(?![s\w])/g)).toHaveLength(sheets.length);
    // tamanhos de página em pontos (mm × 72 / 25,4), na ordem das folhas.
    const boxes = [...text.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(boxes).toHaveLength(sheets.length);
    sheets.forEach((s, i) => {
      expect(boxes[i]![0]).toBeCloseTo((s.widthMm * 72) / 25.4, 0);
      expect(boxes[i]![1]).toBeCloseTo((s.heightMm * 72) / 25.4, 0);
    });
    expect(text).toContain('/Helvetica');
  });
});
