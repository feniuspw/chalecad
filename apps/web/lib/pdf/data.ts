/**
 * Monta, a partir do projeto e dos resultados do motor, o conteúdo textual e numérico do PDF.
 * Função pura (sem React): o documento só desenha o que vem daqui.
 */
import { getAssembly, getCatalog, getPriceBook, getProfile, type Catalog } from '@chalecad/catalog';
import { DISCLAIMER, buildEngineerPackage, type BudgetLine, type EngineerPackage, type Project, type QuantityLine, type Results, type Stage } from '@chalecad/engine';
import { BRACING_LABELS, STAGE_LABELS, STAGE_ORDER, TYPOLOGY_LABELS } from './labels';
import { brl, brl0, dateBR, isoToBR, num, qty } from './format';

export interface Kpi {
  label: string;
  value: string;
  hint?: string;
}

export interface MaterialRow {
  name: string;
  qty: string;
  unit: string;
  waste: string;
  unitPrice: string;
  subtotal: string;
  note?: string;
}

export interface MaterialStage {
  stage: Stage;
  title: string;
  rows: MaterialRow[];
  subtotal: string;
  weight: string;
}

export interface BudgetRow {
  title: string;
  material: string;
  labor: string;
  freight: string;
  total: string;
  range: string;
  diy: boolean;
}

export interface Alert {
  severity: 'info' | 'warn' | 'fail';
  text: string;
}

export interface PdfData {
  title: string;
  fileName: string;
  dateLabel: string;
  typologyLabel: string;
  region: string;
  disclaimer: string;
  artNotice: string;
  kpis: Kpi[];
  areas: { label: string; value: string }[];
  dimensions: { label: string; value: string }[];
  materials: MaterialStage[];
  budget: {
    rows: BudgetRow[];
    totals: { label: string; value: string; strong?: boolean }[];
    schedule: { label: string; amount: string }[];
  };
  alerts: Alert[];
  questions: string[];
  premises: { group: string; items: { label: string; value: string }[] }[];
  versions: string;
}

const DIM_LABELS: Record<string, string> = {
  width: 'Largura',
  depth: 'Profundidade',
  wallHeight: 'Pé-direito (paredes)',
  roofPitchDeg: 'Inclinação do telhado',
  eave: 'Beiral lateral',
  rake: 'Beiral das empenas',
  ridgeHeight: 'Altura da cumeeira',
  kneeWallHeight: 'Mureta na base',
  lowHeight: 'Altura baixa',
  highHeight: 'Altura alta',
  parapetHeight: 'Platibanda',
  slopePct: 'Inclinação',
  lowerPitchDeg: 'Inclinação inferior',
  upperPitchDeg: 'Inclinação superior',
  breakRatio: 'Proporção da quebra',
  'wing.width': 'Largura da ala',
  'wing.depth': 'Profundidade da ala',
  'wing.offset': 'Deslocamento da ala',
};

function dimValue(key: string, v: number): string {
  if (key.endsWith('Deg')) return `${num(v, 0)}°`;
  if (key === 'slopePct') return `${num(v, 1)}%`;
  if (key === 'breakRatio') return num(v, 2);
  return `${num(v, 2)} m`;
}

const GLYPHS: Record<string, string> = { χ: 'chi', λ: 'lambda', φ: 'phi', ψ: 'psi', Ø: 'diam.', Δ: 'delta', ρ: 'rho', σ: 'sigma', ε: 'eps', μ: 'µ', '≤': '<=', '≥': '>=', '→': '->', '–': '-', '′': "'", '″': '"' };
/** Helvetica (WinAnsi) não tem gregas e símbolos matemáticos: troca por equivalentes legíveis. */
export function clean(text: string): string {
  return text.replace(/[^\u0020-\u00ff\n\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u2026\u20ac]/g, (c) => GLYPHS[c] ?? '');
}

export function slugForFile(name: string): string {
  const s = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'projeto';
}

function profileName(cat: Catalog, id: string): string {
  try {
    return getProfile(cat, id).name;
  } catch {
    return id;
  }
}
function assemblyName(cat: Catalog, id: string): string {
  try {
    return getAssembly(cat, id).name;
  } catch {
    return id;
  }
}

export function buildPdfData(project: Project, results: Results, opts: { catalog?: Catalog; now?: Date } = {}): PdfData {
  const catalog = opts.catalog ?? getCatalog();
  const now = opts.now ?? new Date();
  const pkg: EngineerPackage = buildEngineerPackage(project, results, catalog);
  const { quantities, budget, weight, model } = results;

  // --- Resumo -----------------------------------------------------------------
  const kpis: Kpi[] = [
    { label: 'Área construída', value: `${num(model.builtArea, 2)} m²`, hint: `Térreo ${num(model.footprintArea, 2)} m²` },
    { label: 'Custo total estimado', value: brl0(budget.total), hint: `Até ${brl0(budget.totalMax)} · ${brl0(budget.perM2)}/m²` },
    { label: 'Peso total', value: `${num(weight.totalKg, 0)} kg`, hint: `Estrutura de aço ${num(quantities.steelKg, 0)} kg` },
    { label: 'Aço por m²', value: `${num(quantities.steelKgPerM2, 1)} kg/m²`, hint: 'Índice de sanidade LSF' },
  ];

  const a = quantities.areas;
  const areas = [
    { label: 'Projeção da edificação (térreo)', value: `${num(a.footprint)} m²` },
    { label: 'Área construída (térreo + mezanino)', value: `${num(a.built)} m²` },
    { label: 'Mezanino', value: `${num(a.mezzanine)} m²` },
    { label: 'Radier (com bordas)', value: `${num(a.radier)} m²` },
    { label: 'Cobertura (inclinada)', value: `${num(a.roof)} m²` },
    { label: 'Paredes externas (líquida)', value: `${num(a.exteriorWallsNet)} m²` },
    { label: 'Paredes internas (líquida)', value: `${num(a.interiorWallsNet)} m²` },
    { label: 'Aberturas', value: `${num(a.openings)} m²` },
  ];

  const dimensions = Object.entries(pkg.summary.dimensions)
    .filter(([, v]) => typeof v === 'number')
    .map(([k, v]) => ({ label: DIM_LABELS[k] ?? k, value: dimValue(k, v as number) }));

  // --- Materiais por etapa -------------------------------------------------------
  const budgetByLine = new Map<string, BudgetLine>(budget.lines.map((l) => [l.lineId, l]));
  const byStage = new Map<Stage, QuantityLine[]>();
  for (const l of quantities.lines) byStage.set(l.stage, [...(byStage.get(l.stage) ?? []), l]);
  const materials: MaterialStage[] = STAGE_ORDER.filter((s) => byStage.has(s)).map((stage) => {
    const lines = byStage.get(stage)!;
    let sub = 0;
    let kg = 0;
    const rows = lines.map((l): MaterialRow => {
      const b = budgetByLine.get(l.id);
      sub += b?.material ?? 0;
      kg += l.weightKg;
      return {
        name: clean(l.name),
        qty: qty(l.purchaseQty),
        unit: l.unit,
        waste: l.wastePct > 0 ? `${num(l.wastePct, 0)}%` : '—',
        unitPrice: b && !b.missing ? brl(b.unitPrice) : 'sem preço',
        subtotal: b && !b.missing ? brl(b.material) : '—',
        ...(l.note ? { note: l.note } : {}),
      };
    });
    return { stage, title: STAGE_LABELS[stage], rows, subtotal: brl(sub), weight: `${num(kg, 0)} kg` };
  });

  // --- Orçamento ---------------------------------------------------------------
  const diy = new Set(project.budget.diyStages);
  const rows: BudgetRow[] = budget.byStage.map((s) => ({
    title: STAGE_LABELS[s.stage],
    material: brl(s.material),
    labor: diy.has(s.stage) ? 'você executa' : brl(s.labor),
    freight: brl(s.freight),
    total: brl(s.total),
    range: `${brl0(s.total)} a ${brl0(s.totalMax)}`,
    diy: diy.has(s.stage),
  }));
  const totals = [
    { label: 'Materiais', value: brl(budget.material) },
    { label: 'Mão de obra', value: brl(budget.labor) },
    { label: 'Frete', value: brl(budget.freight) },
    { label: 'Subtotal', value: brl(budget.subtotal) },
    { label: `Contingência (${num(project.budget.contingencyPct, 0)}%)`, value: brl(budget.contingency) },
    { label: 'Total estimado', value: brl(budget.total), strong: true },
    { label: 'Faixa de preços (mín. a máx.)', value: `${brl0(budget.total)} a ${brl0(budget.totalMax)}` },
    { label: 'Custo por m² construído', value: brl(budget.perM2) },
  ];
  const schedule = budget.schedule.map((w) => ({ label: `Semana ${w.week}`, amount: brl(w.amount) }));

  // --- Alertas e perguntas ----------------------------------------------------------
  const alerts: Alert[] = [];
  for (const p of pkg.attentionPoints) alerts.push({ severity: p.severity, text: clean(p.text) });
  if (budget.missingPrices.length) alerts.push({ severity: 'warn', text: `Itens sem preço na base (entram como zero): ${budget.missingPrices.join(', ')}.` });
  if (budget.stalePrices.length) alerts.push({ severity: 'info', text: `Preços desatualizados (mais de ${catalog.constants.priceStaleDays} dias): ${budget.stalePrices.length} item(ns). Revise antes de comprar.` });
  for (const w of results.warnings.filter((x) => x.severity === 'info' && !x.code.startsWith('opening.modulation')).slice(0, 12)) {
    alerts.push({ severity: 'info', text: clean(w.message) });
  }
  const questions = pkg.openQuestions.map((q) => clean(q.text));

  // --- Premissas -------------------------------------------------------------------
  const sys = project.system;
  let priceLabel = project.priceBookId;
  let priceDate = '';
  try {
    const book = getPriceBook(catalog, project.priceBookId);
    priceLabel = `${book.name} (${book.uf})`;
    priceDate = isoToBR(book.date);
  } catch {
    /* mantém o id */
  }
  const overrides = Object.keys(project.priceOverrides).length;
  const L = pkg.loadAssumptions.loads;
  const premises: PdfData['premises'] = [
    {
      group: 'Sistema construtivo',
      items: [
        { label: 'Estrutura', value: 'Light Steel Frame (LSF), perfis de aço galvanizado' },
        { label: 'Montantes', value: profileName(catalog, sys.profiles.wallStud) },
        { label: 'Guias', value: profileName(catalog, sys.profiles.wallTrack) },
        { label: 'Vigas de piso', value: profileName(catalog, sys.profiles.joist) },
        { label: 'Caibros', value: profileName(catalog, sys.profiles.rafter) },
        { label: 'Terças / cartolas', value: profileName(catalog, sys.profiles.purlin) },
        { label: 'Espaçamento dos montantes', value: `${num(sys.studSpacing * 100, 0)} cm` },
        { label: 'Contraventamento', value: BRACING_LABELS[sys.bracing] },
        { label: 'Fundação', value: `Radier de ${num(sys.foundation.thickness * 100, 0)} cm, borda de ${num(sys.foundation.border * 100, 0)} cm, viga de borda de ${num(sys.foundation.edgeBeamDepth * 100, 0)} cm` },
      ],
    },
    {
      group: 'Composições',
      items: [
        { label: 'Parede externa', value: assemblyName(catalog, sys.assemblies.exterior) },
        { label: 'Parede interna', value: assemblyName(catalog, sys.assemblies.interior) },
        { label: 'Área molhada', value: assemblyName(catalog, sys.assemblies.wet) },
        { label: 'Cobertura', value: project.roof.cladding },
      ],
    },
    {
      group: 'Cargas e solo',
      items: [
        { label: 'Vento básico V0 (NBR 6123)', value: `${num(project.design.windV0, 0)} m/s, categoria de terreno ${project.design.terrainCategory}` },
        {
          label: 'Tensão admissível do solo',
          value: `${num(project.design.soilBearingKPa, 0)} kPa${pkg.loadAssumptions.soilIsDefault ? ' (valor padrão, sem sondagem)' : ''}`,
        },
        ...(L
          ? [
              { label: 'Carga permanente / acidental (cobertura)', value: `${num(L.deadRoofKPa)} / ${num(L.liveRoofKPa)} kPa` },
              { label: 'Carga permanente / acidental (piso)', value: `${num(L.deadFloorKPa)} / ${num(L.liveFloorKPa)} kPa` },
              { label: 'Pressão dinâmica do vento', value: `${num(L.windQKPa)} kPa` },
            ]
          : []),
      ],
    },
    {
      group: 'Preços e orçamento',
      items: [
        { label: 'Base de preços', value: priceLabel },
        ...(priceDate ? [{ label: 'Data da base', value: priceDate }] : []),
        { label: 'Preços editados no projeto', value: overrides ? `${overrides} item(ns)` : 'nenhum' },
        { label: 'Contingência', value: `${num(project.budget.contingencyPct, 0)}%` },
        { label: 'Frete', value: `${num(project.budget.freight.distanceKm, 0)} km a ${brl(project.budget.freight.pricePerTonKm)} por t·km` },
        { label: 'Etapas executadas por você', value: project.budget.diyStages.length ? project.budget.diyStages.map((s) => STAGE_LABELS[s]).join(', ') : 'nenhuma (mão de obra contratada)' },
        { label: 'Norte', value: 'Indicativo: o topo da planta corresponde aos fundos do lote' },
      ],
    },
  ];

  return {
    title: project.meta.name,
    fileName: `${slugForFile(project.meta.name)}.pdf`,
    dateLabel: dateBR(now),
    typologyLabel: TYPOLOGY_LABELS[project.typology.kind],
    region: project.meta.region,
    disclaimer: DISCLAIMER,
    artNotice: pkg.artNotice,
    kpis,
    areas,
    dimensions,
    materials,
    budget: { rows, totals, schedule },
    alerts,
    questions,
    premises,
    versions: `Motor ${results.engineVersion} · Catálogo ${results.catalogVersion}`,
  };
}
