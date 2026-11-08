/**
 * Contratos de saída do motor. Tudo aqui é JSON serializável (sem classes, Map, funções).
 * Convenção de coordenadas: [x, y, z] com z para cima (ver project.ts).
 */
import type { OpeningType, Stage, TypologyKind, Vec2 } from './project';

export type Vec3 = [number, number, number];

// ---------------------------------------------------------------------------
// Modelo da edificação (geometria derivada da tipologia + projeto)
// ---------------------------------------------------------------------------

export type HostWallKind = 'exterior' | 'interior' | 'gable' | 'knee' | 'parapet';

export interface HostWall {
  /** IDs estáveis: ext-front, ext-back, ext-left, ext-right, wing-*, ou o ID da parede do usuário. */
  id: string;
  kind: HostWallKind;
  level: string;
  /** Eixo da parede em planta (linha de centro). */
  from: Vec2;
  to: Vec2;
  /** Cota da base da parede (topo do piso do nível). */
  baseZ: number;
  length: number;
  /**
   * Contorno no plano da parede, em coordenadas locais (u ao longo de from→to, v para cima a partir de baseZ),
   * anti-horário, sem repetir o primeiro ponto. Retângulo para paredes comuns, pentágono/trapézio/triângulo
   * para empenas e meia-água.
   */
  outline: Vec2[];
  /** Espessura total (m) = alma do montante + camadas da assembly. */
  thickness: number;
  assemblyId: string;
  /** Lado externo olhando de from→to (paredes externas). null para internas. */
  exteriorSide: 'left' | 'right' | null;
  loadBearing: boolean;
  /** Área molhada (assembly wet). */
  wet: boolean;
}

export interface RoofPlane {
  id: string;
  /** Polígono 3D da água (inclui beirais), anti-horário visto de fora. */
  vertices: Vec3[];
  slopeDeg: number;
  /** Área inclinada real (m²). */
  area: number;
  /**
   * Referencial local para aberturas e paginação de telhas:
   * origin no canto do beiral, u ao longo do beiral, v subindo a água. uAxis × vAxis aponta para fora.
   */
  origin: Vec3;
  uAxis: Vec3;
  vAxis: Vec3;
  /** Extensão em u (comprimento do beiral) e em v (comprimento da água, beiral→cumeeira). */
  uLength: number;
  vLength: number;
  /** Água do A-frame/gambrel inferior que também é parede (recebe fechamento interno). */
  isWall: boolean;
  /** Contorno real em (u, v) quando a água não é o retângulo u × v (ex.: recorte de anexo no A-frame). */
  outline?: Vec2[];
}

export interface SlabModel {
  id: string;
  kind: 'radier' | 'mezzanine' | 'deck' | 'platform';
  level: string | null;
  polygon: Vec2[];
  /** Cota do topo. */
  topZ: number;
  thickness: number;
  area: number;
}

export interface ResolvedOpening {
  id: string;
  hostId: string;
  hostKind: 'wall' | 'roof';
  type: OpeningType;
  /** Retângulo no referencial local do hospedeiro (parede: u,v; telhado: u,v do RoofPlane). */
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  /** false se o hospedeiro não existe ou o vão não cabe nele (vira alerta). */
  valid: boolean;
}

export interface ResolvedStair {
  id: string;
  type: 'straight' | 'l_shape' | 'ladder';
  /** Degraus como caixas: centro, tamanho [dx, dy, dz] no referencial local do degrau, e rotação em z (graus, anti-horário). */
  treads: { center: Vec3; size: Vec3; rotationZDeg: number }[];
  /** Número de espelhos. */
  steps: number;
  riser: number;
  going: number;
  /** Fórmula de Blondel 2e + p (ideal 0,63 a 0,64 m). */
  blondel: number;
  footprint: Vec2[];
}

/** Extras fora da edificação (muro, cerca, deck, arrimo), para o 3D e quantitativos. */
export interface ExtraModel {
  id: string;
  kind: 'fence' | 'wall' | 'deck' | 'retaining';
  /** Segmentos verticais em planta (muro, cerca, arrimo, mureta, guarda-corpo do deck). */
  segments: { from: Vec2; to: Vec2; height: number; thickness: number; baseZ: number; material: 'block' | 'mesh' | 'board' | 'gabion' | 'concrete' | 'rail' }[];
  /** Mourões/postes da cerca e pilares do deck coberto. */
  posts: { position: Vec2; height: number; size: number }[];
  /** Deck: piso. */
  polygon?: Vec2[];
  topZ?: number;
  /** Deck coberto: água de cobertura. */
  roof?: RoofPlane;
}

export interface BuildingModel {
  typology: TypologyKind;
  /** Contorno externo das paredes externas no térreo. */
  footprint: Vec2[];
  footprintArea: number;
  /** Área construída: térreo (eixo a eixo) + mezaninos. */
  builtArea: number;
  walls: HostWall[];
  roofPlanes: RoofPlane[];
  slabs: SlabModel[];
  openings: ResolvedOpening[];
  stairs: ResolvedStair[];
  /** Preenchido pelos extras (vazio até a Fase 2). */
  extras: ExtraModel[];
  ridgeHeight: number;
  bbox: { min: Vec3; max: Vec3 };
}

// ---------------------------------------------------------------------------
// Peças da estrutura LSF
// ---------------------------------------------------------------------------

export type PieceRole =
  | 'track_bottom'
  | 'track_top'
  | 'stud'
  | 'stud_corner'
  | 'king'
  | 'jack'
  | 'header'
  | 'sill'
  | 'cripple'
  | 'blocking'
  | 'strap'
  | 'joist'
  | 'rim'
  | 'rafter'
  | 'collar_tie'
  | 'ridge'
  | 'purlin'
  | 'stair_stringer';

export interface Piece {
  id: string;
  /** Parede, água, laje ou escada de origem. */
  hostId: string;
  role: PieceRole;
  profileId: string;
  /** Comprimento de corte (m). */
  length: number;
  start: Vec3;
  end: Vec3;
  /**
   * Direção da altura da alma (eixo forte da seção), unitária e perpendicular ao eixo da peça.
   * Montantes e guias: normal da parede (a alma atravessa a espessura). Vigas, caibros e vergas: para cima
   * (no plano vertical da peça). Terças/cartolas: normal da água do telhado.
   */
  webNormal: Vec3;
}

// ---------------------------------------------------------------------------
// Quantitativos
// ---------------------------------------------------------------------------

export interface QuantityLine {
  id: string;
  stage: Stage;
  /** ID no catálogo (perfil, material ou serviço). */
  itemId: string;
  name: string;
  /** Unidade de compra (rótulo do catálogo: "barra 6 m", "placa 1,20 x 2,40", "m³"…). */
  unit: string;
  /** Quantidade a comprar, já com perda e arredondada para unidade inteira quando aplicável. */
  purchaseQty: number;
  /** Quantidade líquida na unidade base (m, m², m³, un, kg). */
  netQty: number;
  netUnit: 'm' | 'm2' | 'm3' | 'un' | 'kg';
  wastePct: number;
  weightKg: number;
  /** ID do item na base de preços (por unidade de compra). */
  priceItemId: string;
  /** Rastreabilidade para o 3D. */
  pieceIds: string[];
  hostIds: string[];
  note?: string;
}

export interface CutBar {
  barLength: number;
  cuts: { pieceId: string; length: number }[];
  waste: number;
}

export interface CutPlan {
  profileId: string;
  bars: CutBar[];
  totalBars: number;
  wasteLength: number;
  wastePct: number;
}

export interface Areas {
  footprint: number;
  built: number;
  roof: number;
  exteriorWallsNet: number;
  interiorWallsNet: number;
  openings: number;
  radier: number;
  mezzanine: number;
}

export interface QuantityReport {
  lines: QuantityLine[];
  cutPlans: CutPlan[];
  areas: Areas;
  steelKg: number;
  /** Índice de sanidade: aço / área construída. Faixa usual em catalog.constants.steelIndexRange. */
  steelKgPerM2: number;
}

// ---------------------------------------------------------------------------
// Peso
// ---------------------------------------------------------------------------

export interface WeightReport {
  totalKg: number;
  /** Sem fundação (o que as paredes descarregam no radier). */
  superstructureKg: number;
  byStage: Partial<Record<Stage, number>>;
  byElement: { id: string; label: string; kg: number; hostIds: string[] }[];
  kgPerM2: number;
}

// ---------------------------------------------------------------------------
// Estrutura (pré-dimensionamento, Fase 2)
// ---------------------------------------------------------------------------

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface StructuralCheck {
  id: string;
  kind: 'stud' | 'gable_stud' | 'joist' | 'rafter' | 'header' | 'bracing' | 'anchorage' | 'soil' | 'purlin';
  label: string;
  /** Peças e hospedeiros afetados, para colorir no 3D. */
  pieceIds: string[];
  hostIds: string[];
  demand: number;
  capacity: number;
  unit: string;
  /** Taxa de uso = demand / capacity. */
  ratio: number;
  status: CheckStatus;
  /** Detalhe legível da verificação (fórmula e valores). */
  detail: string;
  suggestion?: {
    text: string;
    profileId?: string;
    studSpacing?: 0.4 | 0.6;
    /** A-frame: espaçamento só dos caibros. */
    rafterSpacing?: 0.4 | 0.6;
    deltaCost?: number;
    deltaKg?: number;
  };
}

export interface StructuralReport {
  checks: StructuralCheck[];
  loads: {
    deadRoofKPa: number;
    liveRoofKPa: number;
    deadFloorKPa: number;
    liveFloorKPa: number;
    windQKPa: number;
    windWallKPa: number;
    windRoofUpliftKPa: number;
  };
  summary: { ok: number; warn: number; fail: number; maxRatio: number };
  disclaimer: string;
}

// ---------------------------------------------------------------------------
// Orçamento
// ---------------------------------------------------------------------------

export interface BudgetLine {
  lineId: string;
  stage: Stage;
  itemId: string;
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  unitPriceMax: number;
  material: number;
  materialMax: number;
  priceDate: string | null;
  priceSource: string | null;
  /** Preço com mais de catalog.constants.priceStaleDays dias. */
  stale: boolean;
  /** Sem preço na base: entra como zero e gera alerta. */
  missing: boolean;
  /** Preço vindo de priceOverrides do projeto. */
  overridden: boolean;
}

export interface BudgetStage {
  stage: Stage;
  material: number;
  materialMax: number;
  labor: number;
  laborMax: number;
  freight: number;
  total: number;
  totalMax: number;
  weightKg: number;
  diy: boolean;
}

export interface BudgetReport {
  lines: BudgetLine[];
  byStage: BudgetStage[];
  material: number;
  labor: number;
  freight: number;
  subtotal: number;
  contingency: number;
  total: number;
  totalMax: number;
  perM2: number;
  /** Desembolso por semana, se houver durações. */
  schedule: { week: number; amount: number; stages: Stage[] }[];
  missingPrices: string[];
  stalePrices: string[];
}

// ---------------------------------------------------------------------------
// Terreno (Fase 4)
// ---------------------------------------------------------------------------

export interface TerrainReport {
  platformZ: number;
  cutVolume: number;
  fillVolume: number;
  /** Volume a exportar (corte empolado - aterro compactado convertido). */
  exportVolume: number;
  importVolume: number;
  slopeArea: number;
  machineDays: number;
  truckLoads: number;
  /** Malha do terreno modificado para render: grade regular, z para cima. `cut` = profundidade de corte (+) ou aterro (-) por vértice. */
  mesh: { positions: number[]; indices: number[]; cut: number[] };
}

// ---------------------------------------------------------------------------
// Agregado
// ---------------------------------------------------------------------------

export type Severity = 'info' | 'warn' | 'error';

export interface EngineWarning {
  code: string;
  severity: Severity;
  message: string;
  refs?: string[];
}

export interface Results {
  engineVersion: string;
  catalogVersion: string;
  model: BuildingModel;
  pieces: Piece[];
  quantities: QuantityReport;
  weight: WeightReport;
  structure: StructuralReport | null;
  budget: BudgetReport;
  terrain: TerrainReport | null;
  warnings: EngineWarning[];
  timingsMs: Record<string, number>;
}

export const DISCLAIMER =
  'Estimativa para planejamento. Não substitui projeto estrutural com ART de engenheiro habilitado.';
