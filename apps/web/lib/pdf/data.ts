/**
 * Monta, a partir do projeto e dos resultados do motor, o conteúdo textual e numérico do PDF.
 * Função pura (sem React): o documento só desenha o que vem daqui.
 */
import { getAssembly, getCatalog, getPriceBook, getProfile, type Catalog } from '@chalecad/catalog';
import { DISCLAIMER, buildEngineerPackage, type BudgetLine, type EngineerPackage, type Project, type QuantityLine, type Results, type Stage } from '@chalecad/engine';
import { finishName, ROOM_USES } from '../project/rooms';
import { circuitRows, INSTALLATIONS_NOTICE, pipeTotals, wireTotals } from '../three/installations';
import { BRACING_LABELS, STAGE_ORDER, SYSTEM_LABELS, SYSTEM_PREMISES, TYPOLOGY_LABELS, stageLabel } from './labels';
import { buildPerformancePdf, type PerformancePdf } from './performance';
import { buildWorkPdf, type WorkPdf } from './work';
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

export interface RoomRow {
  name: string;
  use: string;
  area: string;
  ceilingAvg: string;
  floor: string;
  walls: string;
}

export interface InstallationsPdf {
  circuits: { n: string; kind: string; label: string; points: string; power: string; wire: string; breaker: string }[];
  totals: { label: string; value: string }[];
  cost: { label: string; value: string }[];
  notice: string;
}

export interface PdfData {
  title: string;
  fileName: string;
  dateLabel: string;
  typologyLabel: string;
  /** Sistema construtivo (capa): "Light Steel Frame" ou "Wood frame". */
  systemLabel: string;
  region: string;
  disclaimer: string;
  artNotice: string;
  kpis: Kpi[];
  areas: { label: string; value: string }[];
  dimensions: { label: string; value: string }[];
  /** Cômodos marcados (tabela "Cômodos"); vazio quando não há. */
  rooms: RoomRow[];
  /** Seção "Instalações (estimativa)"; null quando não há relatório. */
  installations: InstallationsPdf | null;
  /** Seção "Desempenho"; null sem relatório do motor. */
  performance: PerformancePdf | null;
  /** Página "Cronograma e compras"; null sem data de início nem compras marcadas. */
  work: WorkPdf | null;
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

const ANNEX_LABELS: Record<string, string> = {
  width: 'largura',
  length: 'comprimento',
  offset: 'distância da frente',
  height: 'altura junto ao A-frame',
  pitchDeg: 'inclinação',
  eave: 'beiral',
};

function dimLabel(key: string): string {
  const m = /^annexes\.(left|right)\.(\w+)$/.exec(key);
  if (m) return `Cômodo à ${m[1] === 'left' ? 'esquerda' : 'direita'}: ${ANNEX_LABELS[m[2]!] ?? m[2]}`;
  return DIM_LABELS[key] ?? key;
}

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

/** Linhas da tabela de cômodos: nome, uso, área, pé-direito médio, piso e paredes. */
export function buildRoomRows(project: Project, results: Results, catalog: Catalog): RoomRow[] {
  const resolved = new Map((results.model.rooms ?? []).map((r) => [r.id, r]));
  return project.rooms.map((room): RoomRow => {
    const rm = resolved.get(room.id);
    const closed = !!rm?.polygon;
    return {
      name: clean(rm?.name || room.name || ROOM_USES[room.use].label),
      use: ROOM_USES[room.use].label,
      area: closed ? `${num(rm!.area, 2)} m²` : 'aberto',
      ceilingAvg: closed ? `${num(rm!.ceiling.avg, 2)} m` : '—',
      floor: clean(room.floor ? finishName(room.floor, catalog) : 'Acabamento do nível'),
      walls: clean(room.walls ? finishName(room.walls, catalog) : 'Sem revestimento'),
    };
  });
}

/** Quadro de circuitos e totais das instalações (null sem relatório). */
export function buildInstallationsPdf(results: Results): InstallationsPdf | null {
  const rep = results.installations;
  if (!rep) return null;
  const stage = results.budget.byStage.find((s) => s.stage === 'installations');
  return {
    circuits: circuitRows(rep).map((r) => ({
      n: String(r.n),
      kind: clean(r.kind),
      label: clean(r.label),
      points: String(r.points),
      power: `${num(r.powerVA, 0)} VA`,
      wire: `${num(r.wire, 1)} mm²`,
      breaker: `${r.breaker} A`,
    })),
    totals: [
      { label: 'Demanda estimada', value: `${num(rep.demandKw, 1)} kW (${rep.voltage} V)` },
      ...wireTotals(rep).map((w) => ({ label: `Cabo ${num(w.wire, 1)} mm²`, value: `${num(w.length, 1)} m` })),
      { label: 'Eletroduto', value: `${num(rep.conduit, 1)} m` },
      ...pipeTotals(rep).map((p) => ({ label: p.label, value: `${num(p.length, 1)} m` })),
      { label: "Caixa d'água", value: `${num(rep.tankLiters, 0)} L (${rep.occupants} moradores)` },
    ],
    cost: stage
      ? [
          { label: 'Material', value: brl(stage.material) },
          { label: 'Mão de obra', value: brl(stage.labor) },
          { label: 'Total da etapa', value: brl(stage.material + stage.labor) },
        ]
      : [],
    notice: INSTALLATIONS_NOTICE,
  };
}

export function buildPdfData(project: Project, results: Results, opts: { catalog?: Catalog; now?: Date } = {}): PdfData {
  const catalog = opts.catalog ?? getCatalog();
  const now = opts.now ?? new Date();
  const pkg: EngineerPackage = buildEngineerPackage(project, results, catalog);
  const { quantities, budget, weight, model } = results;
  const structure = project.system.structure;
  const wood = structure === 'wood';

  // --- Resumo -----------------------------------------------------------------
  const kpis: Kpi[] = [
    { label: 'Área construída', value: `${num(model.builtArea, 2)} m²`, hint: `Térreo ${num(model.footprintArea, 2)} m²` },
    { label: 'Custo total estimado', value: brl0(budget.total), hint: `Até ${brl0(budget.totalMax)} · ${brl0(budget.perM2)}/m²` },
    { label: 'Peso total', value: `${num(weight.totalKg, 0)} kg`, hint: wood ? `Estrutura de madeira ${num(quantities.woodM3, 2)} m³` : `Estrutura de aço ${num(quantities.steelKg, 0)} kg` },
    wood
      ? { label: 'Madeira por m²', value: quantities.woodM3 > 0 ? `${num(quantities.woodM3PerM2, 3)} m³/m²` : '—', hint: 'Índice de sanidade wood frame' }
      : { label: 'Aço por m²', value: `${num(quantities.steelKgPerM2, 1)} kg/m²`, hint: 'Índice de sanidade LSF' },
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
    .map(([k, v]) => ({ label: dimLabel(k), value: dimValue(k, v as number) }));

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
    return { stage, title: stageLabel(stage, structure), rows, subtotal: brl(sub), weight: `${num(kg, 0)} kg` };
  });

  // --- Orçamento ---------------------------------------------------------------
  const diy = new Set(project.budget.diyStages);
  const rows: BudgetRow[] = budget.byStage.map((s) => ({
    title: stageLabel(s.stage, structure),
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

  const rooms = buildRoomRows(project, results, catalog);

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
        { label: 'Sistema', value: SYSTEM_PREMISES[structure] },
        { label: 'Montantes', value: profileName(catalog, sys.profiles.wallStud) },
        ...(sys.profiles.gableStud ? [{ label: 'Montantes das empenas', value: profileName(catalog, sys.profiles.gableStud) }] : []),
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
        { label: 'Etapas executadas por você', value: project.budget.diyStages.length ? project.budget.diyStages.map((s) => stageLabel(s, structure)).join(', ') : 'nenhuma (mão de obra contratada)' },
        { label: 'Norte', value: 'Indicativo: o topo da planta corresponde aos fundos do lote' },
      ],
    },
  ];


  return {
    title: project.meta.name,
    fileName: `${slugForFile(project.meta.name)}.pdf`,
    dateLabel: dateBR(now),
    typologyLabel: TYPOLOGY_LABELS[project.typology.kind],
    systemLabel: SYSTEM_LABELS[structure],
    region: project.meta.region,
    disclaimer: DISCLAIMER,
    artNotice: pkg.artNotice,
    kpis,
    areas,
    dimensions,
    rooms,
    installations: buildInstallationsPdf(results),
    performance: buildPerformancePdf(results.performance),
    work: buildWorkPdf(project, results, { catalog }),
    materials,
    budget: { rows, totals, schedule },
    alerts,
    questions,
    premises,
    versions: `Motor ${results.engineVersion} · Catálogo ${results.catalogVersion}`,
  };
}
