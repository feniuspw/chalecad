import type { Catalog } from '@chalecad/catalog';
import { bbox2 } from '../geometry';
import type { Discipline, Project } from '../schema/project';
import type { Results, SheetContent, SheetSpec, UrbanIndices } from '../schema/results';
import { levelName } from './common';
import { lotPolygon } from './urban';

type Fmt = SheetSpec['format'];
const FORMAT_ORDER: Fmt[] = ['A4', 'A3', 'A2', 'A1', 'A0'];

/** LOCAL: lote até esta área é "pequeno": implantação em 1:100. */
const SMALL_LOT_M2 = 400;
/** LOCAL: folga do desenho para cotas, textos e tabelas (fator sobre a dimensão da edificação). */
const DRAW_PAD = 1.25;
/** LOCAL: aproveitamento da folha quando há várias vistas na mesma prancha. */
const PACKING = 0.6;

interface Size {
  w: number;
  h: number;
}

export function computeSheets(project: Project, results: Results, catalog: Catalog, urban: UrbanIndices | null): SheetSpec[] {
  const ap = catalog.constants.approval;
  const stage = project.legal.stage;
  const model = results.model;
  const bb = bbox2(model.footprint);
  const bx = bb.max[0] - bb.min[0];
  const by = bb.max[1] - bb.min[1];
  const maxDim = Math.max(bx, by);
  const lot = project.legal.lot;
  const lotPoly = lot ? lotPolygon(lot) : null;
  const lotBox = lotPoly ? bbox2(lotPoly) : null;
  const lotW = lotBox ? lotBox.max[0] - lotBox.min[0] : 0;
  const lotH = lotBox ? lotBox.max[1] - lotBox.min[1] : 0;
  const smallLot = urban ? urban.lotArea <= SMALL_LOT_M2 : false;

  const drawScale = maxDim > 18 ? 100 : maxDim > 12 ? 75 : 50;
  const ridge = Math.max(model.ridgeHeight, model.bbox.max[2]);
  const mm = (m: number, scale: number) => (m * 1000 * DRAW_PAD) / scale;

  const plan = (target: string): SheetContent => ({ kind: 'plan', target, title: `Planta baixa: ${levelName(project, target)}`, scale: drawScale });
  const sizeOf = (c: SheetContent): Size => {
    const s = c.scale ?? 100;
    switch (c.kind) {
      case 'situation': return { w: mm(Math.max(lotW, 20) + 120, s), h: mm(Math.max(lotH, 20) + 120, s) };
      case 'implantation': return { w: mm(Math.max(lotW, bx), s), h: mm(Math.max(lotH, by), s) };
      case 'section': return { w: mm(c.target === 'B' ? by : bx, s), h: mm(ridge + 1, s) };
      case 'elevation': return { w: mm(c.target === 'left' || c.target === 'right' ? by : bx, s), h: mm(ridge + 1, s) };
      case 'areas': case 'load_table': case 'structure_notes': return { w: 150, h: 120 };
      case 'single_line': return { w: 200, h: 160 };
      default: return { w: mm(bx, s), h: mm(by, s) };
    }
  };

  const pickFormat = (contents: SheetContent[]): Fmt => {
    const forced = project.legal.sheetFormat;
    if (forced !== 'auto') return forced;
    const sizes = contents.map(sizeOf);
    const total = sizes.reduce((a, s) => a + s.w * s.h, 0) / PACKING;
    for (const id of FORMAT_ORDER) {
      const f = ap.sheetFormats.find((x) => x.id === id);
      if (!f) continue;
      const uw = f.w - f.marginLeft - f.margin - ap.titleBlock.width;
      const uh = f.h - 2 * f.margin;
      const fits = sizes.every((s) => (s.w <= uw && s.h <= uh) || (s.h <= uw && s.w <= uh));
      if (fits && total <= uw * uh) return id;
    }
    return 'A0';
  };

  const sheets: SheetSpec[] = [];
  const add = (code: string, discipline: Discipline, title: string, contents: SheetContent[]) =>
    sheets.push({ code, discipline, title, format: pickFormat(contents), contents });

  const levelIds = project.levels.map((l) => l.id);
  const sections: SheetContent[] = ['A', 'B'].map((t) => ({ kind: 'section', target: t, title: `Corte ${t}${t}`, scale: drawScale }));
  const elevations: SheetContent[] = (['front', 'back', 'left', 'right'] as const).map((t) => ({
    kind: 'elevation', target: t, title: `Fachada ${{ front: 'frontal', back: 'posterior', left: 'esquerda', right: 'direita' }[t]}`, scale: drawScale,
  }));
  const roofSheet: SheetContent = { kind: 'roof', title: 'Planta de cobertura', scale: 100 };

  if (stage === 'preliminary' || stage === 'draft') {
    add('ARQ-01', 'architecture', 'Plantas e cortes', [...levelIds.map(plan), ...sections]);
    add('ARQ-02', 'architecture', 'Fachadas e cobertura', [...elevations, roofSheet]);
    return sheets;
  }

  const arq1: SheetContent[] = [];
  if (lot) {
    arq1.push({ kind: 'situation', title: 'Situação', scale: 500 });
    arq1.push({ kind: 'implantation', title: 'Implantação com recuos', scale: smallLot ? 100 : 200 });
  }
  arq1.push({ kind: 'areas', title: lot ? 'Quadro de áreas e índices urbanísticos' : 'Quadro de áreas' });
  add('ARQ-01', 'architecture', lot ? 'Situação, implantação e quadro de áreas' : 'Quadro de áreas', arq1);
  add('ARQ-02', 'architecture', 'Plantas baixas', levelIds.map(plan));
  add('ARQ-03', 'architecture', 'Cortes A e B', sections);
  add('ARQ-04', 'architecture', 'Fachadas', elevations);
  add('ARQ-05', 'architecture', 'Cobertura', [roofSheet]);
  if (stage === 'legal') return sheets;

  // Executivo
  const foundation: SheetContent[] = [{ kind: 'foundation', title: 'Planta de fundação (radier)', scale: drawScale }];
  add('EST-01', 'foundation', 'Fundação', foundation);
  add('EST-02', 'structure', 'Estrutura: painéis e vigas', [
    ...levelIds.map((t): SheetContent => ({ kind: 'framing_plan', target: t, title: `Planta de painéis e vigas: ${levelName(project, t)}`, scale: drawScale })),
  ]);
  add('EST-03', 'structure', 'Elevações dos painéis', [{ kind: 'wall_panels', title: 'Elevações dos painéis', scale: 50 }]);
  add('EST-04', 'structure', 'Cobertura estrutural e notas', [
    { kind: 'roof_framing', title: 'Estrutura da cobertura', scale: 100 },
    { kind: 'structure_notes', title: 'Notas gerais da estrutura' },
  ]);

  const inst = results.installations;
  if (inst?.electrical) {
    add('ELE-01', 'electrical', 'Planta elétrica', levelIds.map((t): SheetContent => ({ kind: 'electrical_plan', target: t, title: `Planta elétrica: ${levelName(project, t)}`, scale: drawScale })));
    add('ELE-02', 'electrical', 'Diagrama unifilar e quadro de cargas', [
      { kind: 'single_line', title: 'Diagrama unifilar' },
      { kind: 'load_table', title: 'Quadro de cargas' },
    ]);
  }
  if (inst?.plumbing) {
    add('HID-01', 'plumbing', 'Água fria e quente', levelIds.map((t): SheetContent => ({ kind: 'plumbing_plan', target: t, title: `Água fria e quente: ${levelName(project, t)}`, scale: drawScale })));
    add('HID-02', 'plumbing', 'Esgoto e ventilação', levelIds.map((t): SheetContent => ({ kind: 'sewer_plan', target: t, title: `Esgoto e ventilação: ${levelName(project, t)}`, scale: drawScale })));
    const hid3: SheetContent[] = [
      { kind: 'water_isometric', title: 'Isométrico da água fria', scale: 50 },
      { kind: 'tank_detail', title: "Detalhe da caixa d'água" },
    ];
    if (inst.plumbing.septic) hid3.push({ kind: 'septic', title: 'Detalhe da fossa e do sumidouro' });
    add('HID-03', 'plumbing', hid3.length > 2 ? "Isométrico, caixa d'água e fossa" : "Isométrico e caixa d'água", hid3);
  }
  return sheets;
}
