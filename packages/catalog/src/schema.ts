import { z } from 'zod';

/**
 * Schemas do catálogo. Os dados (perfis, materiais, assemblies, preços e constantes)
 * ficam em src/data e são validados contra estes schemas nos testes.
 * Unidades: dimensões de seção em mm, propriedades em cm (cm², cm³, cm⁴), massas em kg, comprimentos de compra em m.
 */

const pos = z.number().finite().positive();
const nonneg = z.number().finite().min(0);

export const StageId = z.enum([
  'terrain',
  'foundation',
  'structure',
  'closure',
  'roof',
  'floor',
  'finishing',
  'extras',
]);
export type StageId = z.infer<typeof StageId>;

export const STAGE_LABELS: Record<StageId, string> = {
  terrain: 'Terraplenagem',
  foundation: 'Fundação',
  structure: 'Estrutura',
  closure: 'Fechamento',
  roof: 'Cobertura',
  floor: 'Piso',
  finishing: 'Acabamento',
  extras: 'Extras',
};

export const STAGE_ORDER: StageId[] = [
  'terrain',
  'foundation',
  'structure',
  'closure',
  'roof',
  'floor',
  'finishing',
  'extras',
];

// ---------------------------------------------------------------------------
// Perfis de aço formados a frio
// ---------------------------------------------------------------------------

export const ProfileFamily = z.enum(['Ue', 'U', 'Cr', 'Fita']);

export const Profile = z.object({
  /** Ex.: Ue90x40x0.95, U90x40x0.95, Cr50x0.95 (cartola), Fita70x0.95. */
  id: z.string(),
  family: ProfileFamily,
  name: z.string(),
  /** Alma, mesa, enrijecedor e espessura em mm. */
  web: pos,
  flange: nonneg,
  lip: nonneg,
  thickness: pos,
  /** Massa linear (kg/m). */
  massPerM: pos,
  /** Área da seção (cm²). */
  area: pos,
  /** Inércia (cm⁴) e módulo resistente (cm³) no eixo forte x e fraco y. */
  Ix: nonneg,
  Wx: nonneg,
  Iy: nonneg,
  Wy: nonneg,
  /** Raios de giração (cm). */
  rx: nonneg,
  ry: nonneg,
  /** Resistência ao escoamento (MPa). ZAR 230 por padrão. */
  fy: pos.default(230),
  /** Comprimentos de barra à venda (m). */
  barLengths: z.array(pos).min(1).default([6]),
  /** ID do item na base de preços por barra (um por comprimento, mesma ordem de barLengths). */
  priceItemIds: z.array(z.string()).min(1),
});
export type Profile = z.infer<typeof Profile>;

// ---------------------------------------------------------------------------
// Materiais (placas, insumos, concreto, telhas…)
// ---------------------------------------------------------------------------

export const BaseUnit = z.enum(['m', 'm2', 'm3', 'un', 'kg']);
export type BaseUnit = z.infer<typeof BaseUnit>;

export const Material = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum([
    'board',
    'membrane',
    'insulation',
    'concrete',
    'aggregate',
    'steel_mesh',
    'roofing',
    'fastener',
    'finishing',
    'masonry',
    'fence',
    'wood',
    'earthwork',
    'service',
    'opening',
    'misc',
  ]),
  baseUnit: BaseUnit,
  purchase: z.object({
    /** Rótulo da unidade de compra: "placa 1,20 x 2,40 m", "saco 20 kg", "m³". */
    label: z.string(),
    /** Quanto da baseUnit vem em uma unidade de compra (ex.: placa 1,2x2,4 = 2,88 m²). */
    size: pos,
    /** Placas: dimensões para paginação (m). */
    sheet: z.object({ width: pos, height: pos }).optional(),
    /** Arredonda para unidade inteira de compra. */
    integer: z.boolean().default(true),
  }),
  /** Perda padrão (%). */
  wastePct: nonneg.default(5),
  /** Massa por baseUnit (kg/m, kg/m², kg/m³, kg/un). */
  massPerUnit: nonneg,
  /** Item de preço correspondente na base (por unidade de compra). */
  priceItemId: z.string(),
});
export type Material = z.infer<typeof Material>;

// ---------------------------------------------------------------------------
// Assemblies (composições em camadas)
// ---------------------------------------------------------------------------

export const AssemblyLayer = z.object({
  materialId: z.string(),
  /** Espessura (mm); 0 para insumos sem espessura (fita, massa, parafuso). */
  thickness: nonneg,
  /** Face onde a camada está. `both` conta 2x a área. */
  face: z.enum(['ext', 'core', 'int', 'both']),
  /** Consumo em baseUnit do material por m² de área líquida da face. */
  consumptionPerM2: pos,
  /** Etapa do orçamento. */
  stage: StageId,
});

export const Assembly = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['wall_exterior', 'wall_interior', 'wall_wet', 'roof', 'floor', 'gable_glazed']),
  layers: z.array(AssemblyLayer).min(1),
});
export type Assembly = z.infer<typeof Assembly>;
export type AssemblyLayer = z.infer<typeof AssemblyLayer>;

// ---------------------------------------------------------------------------
// Base de preços
// ---------------------------------------------------------------------------

export const PriceSource = z.enum(['store', 'sinapi', 'manual', 'reference']);

export const PriceItem = z.object({
  itemId: z.string(),
  name: z.string(),
  /** Unidade de compra, igual ao rótulo do material/perfil. */
  unit: z.string(),
  price: nonneg,
  /** Quando o preço é faixa. */
  priceMax: nonneg.optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: PriceSource,
  sourceNote: z.string().optional(),
  uf: z.string().default('BR'),
});
export type PriceItem = z.infer<typeof PriceItem>;

/** Mão de obra paramétrica por etapa. */
export const LaborRate = z.object({
  stage: StageId,
  basis: z.enum([
    'built_area',
    'footprint_area',
    'roof_area',
    'wall_area',
    'radier_area',
    'steel_kg',
    'material_pct',
  ]),
  /** R$ por unidade da base (ou % do material da etapa, quando material_pct). */
  rate: nonneg,
  rateMax: nonneg.optional(),
  note: z.string().optional(),
});
export type LaborRate = z.infer<typeof LaborRate>;

export const PriceBook = z.object({
  id: z.string(),
  name: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  uf: z.string().default('BR'),
  items: z.array(PriceItem),
  labor: z.array(LaborRate),
});
export type PriceBook = z.infer<typeof PriceBook>;

// ---------------------------------------------------------------------------
// Constantes técnicas (versionadas; o motor nunca fixa números no código)
// ---------------------------------------------------------------------------

export const TechnicalConstants = z.object({
  steelDensity: pos, // kg/m³
  concreteDensity: pos, // kg/m³
  steelE: pos, // MPa
  /** Faixa usual de aço LSF por m² construído (kg/m²). */
  steelIndexRange: z.tuple([pos, pos]),
  /** Perda de corte por corte (m), espessura do disco. */
  sawKerf: nonneg,
  /** Dias para considerar preço desatualizado. */
  priceStaleDays: pos,
  lsf: z.object({
    /** Distância máxima entre fileiras de bloqueadores na altura (m). */
    blockingSpacing: pos,
    /** Chumbadores no radier: espaçamento ao longo da guia inferior (m). */
    anchorSpacing: pos,
    /** Parafusos perfil-perfil por ligação de montante (topo + base). */
    screwsPerStud: pos,
    /** Hold-down nas laterais de aberturas com vão maior que isto (m), além das extremidades de painel. */
    holdDownOpeningMin: pos,
    /** Comprimento máximo de painel (m) antes de dividir. */
    maxPanelLength: pos,
    /** Ângulo/folga de apoio da verga em cada lado (m). */
    headerBearing: nonneg,
  }),
  roof: z.object({
    sandwichUsefulWidth: pos,
    /** Espaçamento de terças/cartolas para telha sanduíche, medido ao longo da água (m). */
    purlinSpacing: pos,
    rafterSpacing: pos,
    /** Parafusos de telha por m². */
    screwsPerM2: pos,
    ridgeCapLength: pos,
    flashingLength: pos,
    gutterLength: pos,
  }),
  radier: z.object({
    gravelThickness: pos,
    meshOverlapFactor: pos,
    formHeight: pos,
    lonaOverlapFactor: pos,
    /** Juntas de dilatação: espaçamento máximo (m) entre juntas no piso. */
    floorJointSpacing: pos,
    /** Largura da viga de borda (m). */
    edgeBeamWidth: pos,
  }),
  loads: z.object({
    /** Sobrecargas NBR 6120 (kPa). */
    liveMezzanine: pos,
    liveRoof: pos,
    /** Peso adicional de forro, instalações etc. (kPa). */
    superimposedRoof: nonneg,
    superimposedFloor: nonneg,
    gammaG: pos,
    gammaQ: pos,
    gammaW: pos,
    /** Coeficientes de pressão simplificados (NBR 6123). */
    cpeWall: pos,
    cpeRoofUplift: pos,
    cpi: z.number(),
    /** Fator S2 por categoria de terreno a ~5 m: [cat1..cat5]. */
    s2ByCategory: z.tuple([pos, pos, pos, pos, pos]),
    s1: pos,
    s3: pos,
  }),
  /** Limites de flecha como denominador: L/350 → 350. */
  deflection: z.object({ floor: pos, roof: pos, header: pos }),
  /** Faixas da taxa de uso: verde < warn ≤ amarelo ≤ fail < vermelho. */
  usage: z.object({ warn: pos, fail: pos }),
  /** Resistência ao arrancamento de um chumbador (kN) e de um hold-down (kN). */
  anchorage: z.object({ anchorKN: pos, holdDownKN: pos }),
  /** Contraventamento: comprimento mínimo de parede contraventada por direção, como fração do comprimento da fachada. */
  bracingMinRatio: pos,
  stairs: z.object({
    idealRiser: pos,
    maxRiser: pos,
    going: pos,
    ladderGoing: pos,
    treadThickness: pos,
    blondelMin: pos,
    blondelMax: pos,
  }),
  /** Altura máxima de parede interna em nível superior/A-frame quando não informada (m). */
  defaultCeilingMax: pos,
  terrain: z.object({
    swellFactor: pos,
    compactionFactor: pos,
    truckM3: pos,
    excavatorM3PerDay: pos,
  }),
  masonry: z.object({
    blocksPerM2: pos,
    groutM3PerM2: nonneg,
    rebarKgPerM2: nonneg,
    stripFootingWidth: pos,
    stripFootingDepth: pos,
  }),
});
export type TechnicalConstants = z.infer<typeof TechnicalConstants>;

export const Catalog = z.object({
  version: z.string(),
  profiles: z.array(Profile),
  materials: z.array(Material),
  assemblies: z.array(Assembly),
  priceBooks: z.array(PriceBook),
  constants: TechnicalConstants,
});
export type Catalog = z.infer<typeof Catalog>;
