/** Tipos dos relatórios determinísticos (JSON serializável). A IA só enriquece o texto depois. */

export interface GuideStep {
  /** ID estável: `layout`, `embedded-utilities`, `radier`, `wall:<id>`, `mezzanine`, `roof`, … */
  id: string;
  /** Posição na sequência (1, 2, 3…). */
  order: number;
  phase:
    | 'layout'
    | 'foundation'
    | 'walls'
    | 'mezzanine'
    | 'roof'
    | 'exterior_closure'
    | 'services'
    | 'interior_closure'
    | 'floor'
    | 'finishing'
    | 'extras';
  title: string;
  /** Descrição em pt-BR. */
  description: string;
  tools: string[];
  /** IDs das linhas de quantidade (`QuantityLine.id`) a ter em mãos. */
  materials: string[];
  /** Parede, água ou laje de origem (passos de painel/cobertura). */
  hostIds: string[];
  /** Passos de parede: peças e peso do painel (aço), kg. */
  pieceCount?: number;
  weightKg?: number;
  /** Número de painéis de transporte/montagem da parede. */
  panels?: number;
  /** Duração estimada em homem-hora (índices em `catalog.constants.productivity`). */
  manHours: number;
}

export interface BuyFirstItem {
  lineId: string;
  itemId: string;
  name: string;
  purchaseQty: number;
  unit: string;
  /** Prazo típico de entrega, dias corridos. */
  leadTimeDays: number;
  leadTimeNote: string;
  stage: 'foundation' | 'structure';
}

export interface ConstructionGuide {
  projectName: string;
  steps: GuideStep[];
  /** Fundação e estrutura, os de maior prazo primeiro. */
  buyFirst: BuyFirstItem[];
  /** Ferramentas consolidadas (sem repetição, ordem alfabética). */
  tools: string[];
  totalManHours: number;
  disclaimer: string;
}

export type AttentionSeverity = 'info' | 'warn' | 'fail';

export interface EngineerSummary {
  projectName: string;
  region: string;
  typology: string;
  dimensions: Record<string, number | string>;
  areas: {
    footprint: number;
    built: number;
    roof: number;
    radier: number;
    mezzanine: number;
  };
  profiles: Record<string, string>;
  studSpacing: number;
  bracing: string;
  assemblies: Record<string, string>;
  foundation: { thickness: number; border: number; edgeBeamDepth: number };
  steelKg: number;
  totalWeightKg: number;
  /** Só com `installations.enabled` e cômodos marcados. */
  installations?: {
    demandKw: number;
    circuits: number;
    tankLiters: number;
    /** Peso da caixa d'água cheia (kg). */
    tankFullKg: number;
    tankRoom: string;
  };
}

export interface LoadAssumptions {
  /** `results.structure.loads`; null se a verificação estrutural não rodou. */
  loads: {
    deadRoofKPa: number;
    liveRoofKPa: number;
    deadFloorKPa: number;
    liveFloorKPa: number;
    windQKPa: number;
    windWallKPa: number;
    windRoofUpliftKPa: number;
  } | null;
  windV0: number;
  terrainCategory: number;
  soilBearingKPa: number;
  soilIsDefault: boolean;
}

export interface CheckRow {
  id: string;
  kind: string;
  label: string;
  demand: number;
  capacity: number;
  unit: string;
  ratio: number;
  status: 'ok' | 'warn' | 'fail';
}

export interface AttentionPoint {
  severity: AttentionSeverity;
  source: 'check' | 'warning';
  text: string;
  refs: string[];
}

export interface OpenQuestion {
  id: string;
  text: string;
  /** Regra que gerou a pergunta (rastreabilidade). */
  rule: string;
}

export interface EngineerPackage {
  summary: EngineerSummary;
  loadAssumptions: LoadAssumptions;
  /** Ordenada por taxa de uso decrescente. */
  checks: CheckRow[];
  attentionPoints: AttentionPoint[];
  openQuestions: OpenQuestion[];
  /** Aviso de ART. */
  artNotice: string;
  disclaimer: string;
}
