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
  'installations',
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
  installations: 'Instalações',
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
  'installations',
  'extras',
];

// ---------------------------------------------------------------------------
// Perfis de aço formados a frio
// ---------------------------------------------------------------------------

/** `Wood`: madeira serrada retangular (wood frame): `web` = altura, `flange` = `thickness` = largura (mm). */
export const ProfileFamily = z.enum(['Ue', 'U', 'Cr', 'Fita', 'Wood']);

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
  /** Resistência ao escoamento (MPa). ZAR 230 por padrão. Ignorado em madeira. */
  fy: pos.default(230),
  material: z.enum(['steel', 'wood']).default('steel'),
  /** Classe de resistência da madeira (NBR 7190, coníferas). Só em `material: 'wood'`. */
  woodClass: z.enum(['C20', 'C25', 'C30']).optional(),
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
    'furniture',
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
  /** O preço já inclui a instalação: fica fora da base da mão de obra percentual da etapa. */
  laborIncluded: z.boolean().default(false),
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

const LeadTime = z.object({ days: pos, note: z.string() });

export const TechnicalConstants = z.object({
  steelDensity: pos, // kg/m³
  concreteDensity: pos, // kg/m³
  steelE: pos, // MPa
  /** Faixa usual de aço LSF por m² construído (kg/m²). */
  steelIndexRange: z.tuple([pos, pos]),
  /**
   * Wood frame (NBR 7190, pinus tratado em autoclave). Resistências características e módulo médio por classe (MPa);
   * kmod = kmod1 (carga longa) × kmod2 (umidade) × kmod3 (2ª categoria); γ de compressão e de tração/cisalhamento.
   */
  wood: z.object({
    density: pos,
    classes: z.record(z.string(), z.object({ fc0k: pos, fvk: pos, E0m: pos })),
    kmod: pos,
    gammaC: pos,
    gammaT: pos,
    gammaV: pos,
    /** Faixa usual de madeira estrutural por m² construído (m³/m²). */
    indexRange: z.tuple([pos, pos]),
    /** Pregos por m de peça (kg/m) e por placa fixada (kg/m²). */
    nailKgPerM: nonneg,
    nailKgPerM2Board: nonneg,
  }),
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
    /** Piso: o motor escolhe o que deixa 2e + p no meio da faixa de Blondel, limitado a [goingMin, goingMax]. */
    going: pos,
    goingMin: pos,
    goingMax: pos,
    ladderGoing: pos,
    treadThickness: pos,
    blondelMin: pos,
    blondelMax: pos,
  }),
  /**
   * Requisitos de norma e de código de obras usados nos alertas (valores usuais; o código municipal pode exigir mais).
   * NBR 15575 (pé-direito), NBR 14718 (guarda-corpo), NBR 9077 / NBR 9050 (escada e corrimão), NBR 7199 (vidro).
   */
  norms: z.object({
    /** Pé-direito mínimo em sala e quartos (permanência prolongada). */
    ceilingLiving: pos,
    /** Pé-direito mínimo em banheiro, cozinha e circulação. */
    ceilingService: pos,
    /** Altura livre mínima sobre os degraus. */
    stairHeadroom: pos,
    guardrailHeight: pos,
    guardrailMaxGap: pos,
    handrailMin: pos,
    handrailMax: pos,
    /** Área de janela mínima como fração da área do piso: iluminação e ventilação. */
    lightRatio: pos,
    ventRatio: pos,
    /** Vidro abaixo desta altura do piso (ou fachada envidraçada) pede vidro de segurança. */
    safetyGlassSill: pos,
    /**
     * Regras por uso do cômodo: pé-direito mínimo, se exige janela para iluminação (1/lightRatio) ou só ventilação
     * (1/ventRatio, ou exaustão mecânica), se é área molhada e área mínima usual (código de obras).
     */
    rooms: z.record(
      z.string(),
      z.object({ ceiling: pos, light: z.boolean(), vent: z.boolean(), wet: z.boolean(), minArea: nonneg }),
    ),
    /** Fração do vão que abre para ventilação, por tipo de abertura (janela de correr abre metade). */
    openableFraction: z.record(z.string(), z.number().min(0).max(1)),
    /** Passagem livre mínima entre móveis e paredes (NBR 9050 usa 0,90 m; 0,80 m é o usual residencial). */
    circulationMin: pos,
  }),
  /**
   * Instalações estimadas. NBR 5410: tomadas (1 a cada 5 m de perímetro; 3,5 m em cozinha/serviço; 1 junto ao lavatório),
   * iluminação (100 VA nos primeiros 6 m² + 60 VA a cada 4 m² inteiros). NBR 5626: reserva de água por morador.
   */
  installations: z.object({
    voltage: pos,
    outletPerimeter: pos,
    wetOutletPerimeter: pos,
    outletVA: pos,
    /** Cozinha/serviço: 600 VA nas 3 primeiras tomadas, 100 VA nas demais. */
    wetOutletVA: pos,
    wetOutletHighCount: nonneg,
    lightBaseVA: pos,
    lightBaseArea: pos,
    lightStepVA: pos,
    lightStepArea: pos,
    /** Potência máxima por circuito de uso geral (VA). */
    circuitMaxVA: pos,
    /** Potência dos equipamentos de uso específico (W), por ID de móvel do catálogo ou `electric_shower`. */
    tuePower: z.record(z.string(), pos),
    /** Fator de demanda global (residencial). */
    demandFactor: pos,
    /** Traçado real / distância em linha reta (cabos e tubos). */
    routingFactor: pos,
    /** Descida/subida por ponto: do forro ou do piso até a caixa (m). */
    dropPerPoint: pos,
    /** Seção do cabo (mm²) por faixa de corrente: [corrente máx. A, seção, disjuntor A]. */
    wireTable: z.array(z.tuple([pos, pos, pos])).min(1),
    waterPerPerson: pos,
    reserveDays: pos,
    personsPerBedroom: pos,
    tankSizes: z.array(pos).min(1),
  }),
  /**
   * Projeto elétrico e luminotécnico (NBR 5410:2004, NBR ISO/CIE 8995-1). Fontes e incertezas em
   * `docs/research/eletrica.md`. Tabelas de norma na forma publicada em manuais de fabricantes.
   */
  electrical: z.object({
    normEdition: z.string(),
    loads: z.object({
      lighting: z.object({ baseVA: pos, baseArea: pos, stepVA: pos, stepArea: pos }),
      sockets: z.object({
        generalVA: pos,
        wetVA: pos,
        wetHighCount: nonneg,
        perimeterStep: z.object({ wet: pos, other: pos }),
        bathSocketMinDistFromShower: pos,
        counterSockets: nonneg,
      }),
      /** Equipamento com corrente acima disso pede circuito exclusivo (A). */
      tueSeparateAboveA: pos,
      /** Corrente máxima recomendada por circuito de uso geral (A). */
      circuitMaxA: z.object({ lighting: pos, sockets: pos, wet_sockets: pos }),
    }),
    /** Equipamentos (TUE e cargas conhecidas) por chave: potência, fator de potência, ligação e curva. */
    appliances: z.record(
      z.string(),
      z.object({ w: pos, pf: z.number().min(0.1).max(1), voltage: z.enum(['FN', 'FF']).optional(), curve: z.enum(['B', 'C']).optional(), label: z.string() }),
    ),
    /** Liga móvel do catálogo a um equipamento (ex.: furn_stove → cooktop). */
    applianceByFurniture: z.record(z.string(), z.string()),
    /** Capacidade (A), Cu/PVC 70 °C a 30 °C: [seção, B1 2c, B1 3c, B2 2c, B2 3c, A1 2c, A1 3c]. */
    ampacity: z.array(z.tuple([pos, pos, pos, pos, pos, pos, pos])).min(1),
    /** Fator de temperatura ambiente (PVC) por °C. */
    tempFactor: z.record(z.string(), pos),
    /** Fator de agrupamento: índice = circuitos no mesmo eletroduto − 1 (último vale para mais). */
    groupingFactor: z.array(pos).min(1),
    minSection: z.object({ lighting: pos, power: pos }),
    /** Resistência a 20 °C (Ω/km) por seção, e fator para 70 °C. */
    resistance20: z.record(z.string(), pos),
    resistanceTempFactor70: pos,
    voltageDrop: z.object({ terminalMaxPct: pos, totalMaxPct: pos, warnAtPct: pos }),
    breakers: z.object({ ratings: z.array(pos).min(1), defaultCurve: z.enum(['B', 'C']) }),
    dr: z.object({ sensitivityMa: pos, ratings: z.array(pos).min(1), excludeLightingAboveM: pos, requiredRoomUses: z.array(z.string()), maxCircuitsPerDr: pos }),
    dps: z.object({ ucByVoltage: z.record(z.string(), pos), inKa: pos }),
    /** Reservas no quadro: [até N circuitos, reservas] (fração quando < 1). */
    panelReserves: z.array(z.tuple([pos, pos])).min(1),
    panelSizes: z.array(pos).min(1),
    conduit: z.object({
      fillMax: z.object({ one: pos, two: pos, many: pos }),
      maxStraight: pos,
      reducePerBend90: nonneg,
      maxBends90: nonneg,
      /** Eletroduto corrugado: DN e diâmetro interno (mm). */
      sizes: z.array(z.object({ dn: pos, di: pos })).min(1),
      minDn: pos,
      wastePct: nonneg,
    }),
    /** Diâmetro externo do cabo flexível 750 V (mm) por seção. */
    cableOuterDiameter: z.record(z.string(), pos),
    cable: z.object({ slackPerBoxM: nonneg, wastePct: nonneg }),
    heights: z.object({ low: pos, mid: pos, high: pos, switch: pos, wallLight: pos, panel: pos }),
    /** Distância do interruptor ao batente da porta (m). */
    switchOffsetFromJamb: pos,
    /** Demanda (tabela de concessionária): [até kW, fator] para iluminação e tomadas; aquecimento por quantidade. */
    demand: z.object({ lightingSockets: z.array(z.tuple([pos, pos])).min(1), heating: z.array(pos).min(1) }),
    /** Categoria provável do padrão de entrada (genérica; confirmar com a concessionária). */
    entranceCategories: z.array(z.object({ code: z.string(), phases: z.number().int().min(1).max(3), maxKw: pos, breakerA: pos, cableMm2: pos })).min(1),
    /** Tensão fase-neutro sugerida por UF. */
    voltageByUF: z.record(z.string(), z.union([z.literal(127), z.literal(220)])),
    lighting: z.object({
      /** Iluminância alvo e mínima (lux) por uso de cômodo. */
      targetLux: z.record(z.string(), pos),
      minLux: z.record(z.string(), pos),
      workPlane: z.record(z.string(), nonneg),
      maintenanceFactor: pos,
      /** Índice do recinto K → fator de utilização. */
      utilization: z.array(z.tuple([pos, pos])).min(2),
      spacingToHeight: pos,
      ledPowerFactor: pos,
    }),
    /** Luminárias típicas (LED). */
    luminaires: z
      .array(
        z.object({
          id: z.string(),
          label: z.string(),
          type: z.enum(['plafon', 'downlight', 'spot', 'pendant', 'wall', 'strip', 'flood']),
          watts: pos,
          lumens: pos,
          cct: pos,
          beamAngle: pos.optional(),
          priceItem: z.string().optional(),
        }),
      )
      .min(1),
    defaultLuminaire: z.string(),
  }),
  /**
   * Hidráulica (NBR 5626 água fria/quente, NBR 8160 esgoto). Fontes e incertezas em `docs/research/hidraulica.md`.
   * Método dos pesos (NBR 5626:1998), ainda prática corrente.
   */
  plumbing: z.object({
    kPaPerMca: pos,
    water: z.object({
      simultaneityC: pos,
      minDynamicKpa: z.object({ default: pos, toilet_tank: pos, network: pos }),
      maxStaticKpa: pos,
      maxVelocity: pos,
      velocityTarget: pos,
      /** Aparelhos: vazão (L/s), peso, peso de água quente, DN mínimo, UHC, DN de esgoto, alturas de água e esgoto. */
      fixtures: z.record(
        z.string(),
        z.object({
          label: z.string(),
          q: pos,
          w: nonneg,
          qHot: nonneg.optional(),
          wHot: nonneg,
          dnMin: pos,
          uhc: nonneg,
          sewerDn: pos.optional(),
          waterH: pos,
          sewerH: nonneg.optional(),
          minKpa: pos.optional(),
          /** Registro de pressão no sub-ramal (chuveiro). */
          pressureValve: z.boolean().optional(),
        }),
      ),
      /** Liga móvel do catálogo a um aparelho (ex.: furn_shower → shower_electric). */
      fixtureByFurniture: z.record(z.string(), z.string()),
      /** Tubos: DN comercial e diâmetro interno (m). */
      pipes: z.record(z.string(), z.object({ label: z.string(), sizes: z.array(z.object({ dn: pos, di: pos })).min(1), hot: z.boolean() })),
      /** Fair-Whipple-Hsiao J = k·Q^a/D^b (m/m, m³/s, m). */
      fwh: z.object({ cold: z.object({ k: pos, qExp: pos, dExp: pos }), hot: z.object({ k: pos, qExp: pos, dExp: pos }) }),
      /** Comprimentos equivalentes (m) por DN (`dn` dá os índices). */
      leq: z.object({
        dn: z.array(pos).min(1),
        elbow90: z.array(pos),
        elbow45: z.array(pos),
        teeStraight: z.array(pos),
        teeBranch: z.array(pos),
        entrance: z.array(pos),
        gateValve: z.array(pos),
        pressureValve: z.array(pos),
      }),
      reservoir: z.object({ litersPerPerson: pos, reserveDays: pos, minLiters: pos, tankSizes: z.array(pos).min(1) }),
      /** Altura do fundo da caixa sobre o forro quando não há torre (m). */
      atticTankRise: nonneg,
    }),
    sewer: z.object({
      slopeMin: z.object({ upTo75: pos, from100: pos }),
      slopeMax: pos,
      branchMaxUhc: z.record(z.string(), pos),
      stackMaxUhc: z.record(z.string(), pos),
      ventMaxDistance: z.record(z.string(), pos),
      ventTerminalAboveRoof: pos,
      siphonBoxMaxUhc: pos,
      inspection: z.object({ maxDepth: pos, maxSpacing: pos, maxFromTrap: pos }),
      /** Esgoto sob o radier: profundidade da geratriz inferior na saída do aparelho (m abaixo do piso). */
      startDepth: nonneg,
    }),
    septic: z.object({
      contributionLpd: pos,
      sludgeLf: pos,
      /** Período de detenção (dias) por contribuição diária: [até L/dia, T]. */
      detention: z.array(z.tuple([pos, pos])).min(1),
      /** Taxa de lodo K (limpeza a cada 2 anos, 10–20 °C). */
      sludgeK: pos,
    }),
    colors: z.object({ cold: z.string(), hot: z.string(), sewer: z.string(), vent: z.string() }),
  }),
  /**
   * Desempenho: térmico (NBR 15575-4/5 procedimento simplificado, NBR 15220-2/3), energia solar fotovoltaica e
   * captação de água de chuva (NBR 15527). Valores por UF são da capital (o usuário pode trocar a zona).
   */
  performance: z.object({
    thermal: z.object({
      /** Propriedades das camadas: λ (W/m·K), ρ (kg/m³), c (kJ/kg·K); `thickness` (mm) quando a assembly não traz. */
      materials: z.record(z.string(), z.object({ lambda: pos, rho: pos, c: pos, thickness: pos.optional() })),
      /** Resistências superficiais (m²·K/W): parede (int/ext) e cobertura (int, fluxo descendente no verão). */
      rsiWall: pos,
      rseWall: pos,
      rsiRoof: pos,
      rseRoof: pos,
      /** Câmara de ar não ventilada entre placas (m²·K/W), quando a cavidade não é toda preenchida. */
      airGapR: nonneg,
      zoneByUF: z.record(z.string(), z.number().int().min(1).max(8)),
      /** Absortância solar por cor da telha e da fachada (padrão quando não há acabamento). */
      roofAlpha: z.record(z.string(), z.number().min(0).max(1)),
      facadeAlpha: z.record(z.string(), z.number().min(0).max(1)),
      defaultFacadeAlpha: z.number().min(0).max(1),
      /** Limites de U (W/m²·K) por zona: [α ≤ 0,6, α > 0,6]. */
      wallU: z.record(z.string(), z.tuple([pos, pos])),
      roofU: z.record(z.string(), z.tuple([pos, pos])),
      /** Capacidade térmica mínima de parede (kJ/m²·K) por zona; 0 = sem exigência. */
      wallCT: z.record(z.string(), nonneg),
    }),
    solar: z.object({
      /** Horas de sol pleno (kWh/m²·dia, média anual) por UF. */
      hspByUF: z.record(z.string(), pos),
      kWhPerPersonMonth: pos,
      /** Consumo extra do chuveiro elétrico por morador (kWh/mês). */
      showerKWhPerPersonMonth: nonneg,
      moduleWp: pos,
      moduleArea: pos,
      performanceRatio: pos,
      tariff: pos,
      /** Custo de disponibilidade (kWh/mês) que a concessionária cobra mesmo com geração. */
      minBillKWh: nonneg,
    }),
    rain: z.object({
      mmPerYearByUF: z.record(z.string(), pos),
      runoff: pos,
      /** Fração da demanda de água que pode ser não potável (vaso, rega, lavar piso). */
      nonPotableShare: pos,
      /** Dias de reserva do reservatório de chuva. */
      reserveDays: pos,
    }),
  }),
  /**
   * Fator regional da mão de obra por UF (base de preços = média SP). Aproximação pela razão do CUB R1-N
   * de cada estado sobre o de SP; materiais ficam com o preço nacional da base.
   */
  laborRegionalFactor: z.record(z.string(), pos),
  /** Piso de concreto sobre o radier: consumos por m². */
  floor: z.object({ hardenerKgPerM2: pos, sealerLPerM2: pos }),
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
  /** Parafusos por peça (un). Os parafusos de telha por m² ficam em `roof.screwsPerM2`. */
  fasteners: z.object({
    /** Por bloqueador. */
    blocking: nonneg,
    /** Por verga. */
    header: nonneg,
    /** Por viga de piso, caibro ou tirante. */
    joistRafterCollar: nonneg,
    /** Por cruzamento terça x caibro. */
    purlinPerRafter: nonneg,
  }),
  /** Premissas geométricas e de consumo dos extras (muro, cerca, deck). Metros, salvo indicação. */
  extras: z.object({
    blockThickness: pos,
    lsfWallThickness: pos,
    lsfStudSpacing: pos,
    retainingThickness: pos,
    /** Argamassa de assentamento: m³ por m² de alvenaria; densidade em kg/m³. */
    mortarM3PerM2: nonneg,
    mortarDensity: pos,
    /** Aço da sapata corrida / baldrame (kg por m). */
    footingSteelKgPerM: nonneg,
    gradeBeam: z.object({ width: pos, depth: pos }),
    /** Seção do mourão por tipo (m). */
    postSize: z.object({ concrete: pos, eucalyptus: pos, steel: pos }),
    /** Fios de arame farpado. */
    barbedStrands: pos,
    guardrailHeight: pos,
    guardrailThickness: pos,
    /** Cobertura do deck: inclinação desejada (graus), beiral (m), pé-direito desejado (m). */
    deckCoverPitchDeg: pos,
    deckCoverBeiral: nonneg,
    deckCoverClearance: pos,
    /** Pé-direito livre mínimo sob a borda baixa (m) e inclinação mínima da telha (graus). */
    deckCoverMinClearance: pos,
    deckCoverMinPitchDeg: pos,
    deckPostSpacing: pos,
    deckPostSize: pos,
  }),
  /** Muro de arrimo: parâmetros de quantidade por tipo. */
  retaining: z.object({
    /** Gabião: base média = gabionBase + gabionBasePerHeight · H (m). */
    gabionBase: pos,
    gabionBasePerHeight: nonneg,
    /** Concreto armado: fuste (m) e sapata (m). */
    concreteStem: pos,
    footing: z.object({ width: pos, depth: pos }),
    /** Aço do concreto armado (kg por m³ de concreto). */
    steelKgPerM3: nonneg,
    /** Geotêxtil: dobra extra sobre a altura do muro (m). */
    geotextileExtraHeight: nonneg,
  }),
  /** Premissas do terreno inclinado (alertas e logística). Passos de algoritmo ficam no motor. */
  terrainRules: z.object({
    /** Taludes de corte acima desta altura (m) recebem geotêxtil e dreno no pé. */
    drainCutHeight: pos,
    /** Inclinação (%) acima da qual se sugere palafita/estacas. */
    steepPct: pos,
    /** Altura de talude de corte (m) que exige contenção. */
    cutWarnHeight: pos,
    /** Aterro sob a edificação (m) acima do qual há alerta. */
    fillUnderBuilding: pos,
    /** Cada km de bota-fora acrescenta 1/kmPerExtraTrip de viagem por viagem. */
    kmPerExtraTrip: pos,
  }),
  /** Fatores do pré-dimensionamento (NBR 14762 / NBR 8681). */
  structureFactors: z.object({
    /** Coeficientes de resistência: flexão/cisalhamento (γa1) e compressão (γa2). */
    gammaA1: pos,
    gammaA2: pos,
    /** Fração da área bruta que trabalha na compressão (flambagem local). */
    effectiveAreaFactor: pos,
    /** Tensão de cisalhamento resistente como fração de fy (0,6). */
    shearYieldFactor: pos,
    /** ψ0 do vento e das sobrecargas de uso. */
    psiWind: pos,
    psiLive: pos,
  }),
  /** Limites dos alertas do motor. */
  warnings: z.object({
    /** Deslocamento máximo (m) de uma abertura para alinhar à modulação dos montantes. */
    modulationMax: pos,
    /** Altura livre mínima (m) sob o telhado no centro do mezanino e sob o mezanino. */
    mezzRoofMin: pos,
    mezzUnderMin: pos,
  }),
  /** Produtividade do roteiro de obra em homem-hora (Hh), para autoconstrutor sem experiência prévia em LSF. */
  productivity: z.object({
    /** Locação: base fixa + por metro de perímetro do radier. */
    layoutBaseHh: nonneg,
    layoutPerMeterHh: nonneg,
    /** Instalações embutidas no radier: base + por ponto. */
    embeddedBaseHh: nonneg,
    embeddedPerPointHh: nonneg,
    /** Radier por m². */
    radierPerM2Hh: nonneg,
    /** Painel de parede: por peça, por abertura e por painel de transporte. */
    wallPerPieceHh: nonneg,
    wallPerOpeningHh: nonneg,
    wallPerPanelHh: nonneg,
    /** Mezanino por m². */
    mezzaninePerM2Hh: nonneg,
    /** Cobertura: por peça de estrutura e por m² de telha. */
    roofPerPieceHh: nonneg,
    roofCladdingPerM2Hh: nonneg,
    /** Fechamentos e acabamentos por m² (parede líquida ou construído). */
    exteriorClosurePerM2Hh: nonneg,
    servicesPerM2BuiltHh: nonneg,
    interiorClosurePerM2Hh: nonneg,
    floorPerM2Hh: nonneg,
    finishingPerM2BuiltHh: nonneg,
  }),
  /** Prazos típicos de entrega (dias corridos) por tipo de material de compra antecipada. */
  leadTimes: z.object({
    steelProfile: LeadTime,
    concrete: LeadTime,
    hardware: LeadTime,
    foundationMaterial: LeadTime,
  }),
  /** Fase 17: documentação para aprovação (normas citadas, folhas ABNT, atividades de ART/RRT). Nada municipal aqui. */
  approval: z.object({
    /** Normas citadas em verificações e memoriais. `confirmed: false` = edição/conteúdo a conferir (nunca vira "ok" sozinho). */
    norms: z.array(z.object({
      id: z.string(),
      code: z.string(),
      edition: z.string(),
      title: z.string(),
      confirmed: z.boolean(),
      note: z.string().optional(),
    })),
    /** Formatos da série A (NBR 10068), mm: largura × altura em paisagem, margens. */
    sheetFormats: z.array(z.object({
      id: z.enum(['A0', 'A1', 'A2', 'A3', 'A4']),
      w: pos,
      h: pos,
      marginLeft: pos,
      margin: pos,
    })),
    /** Carimbo (selo), mm: largura e altura mínima; espaço livre para o carimbo de aprovação da prefeitura. */
    titleBlock: z.object({ width: pos, minHeight: pos, approvalBox: z.object({ w: pos, h: pos }) }),
    /** Escalas preferidas (denominadores, NBR 8196). */
    scales: z.array(pos),
    /** Modelos das linhas da ficha de ART/RRT por disciplina. */
    artActivities: z.array(z.object({
      discipline: z.enum(['architecture', 'structure', 'foundation', 'electrical', 'plumbing', 'execution']),
      council: z.enum(['CREA', 'CAU', 'any']),
      activity: z.string(),
      unit: z.enum(['m²', 'kVA', 'kW', 'm³', 'un', 'm']),
      /** De onde sai a quantidade. */
      quantity: z.enum(['built_area', 'radier_area', 'installed_kva', 'demand_kva', 'water_points', 'septic_volume']),
    })),
    /** Etapas (NBR 16636-2): rótulo e sigla. */
    stages: z.array(z.object({ id: z.enum(['preliminary', 'draft', 'legal', 'executive']), label: z.string(), code: z.string() })),
  }),
});
export type TechnicalConstants = z.infer<typeof TechnicalConstants>;

// ---------------------------------------------------------------------------
// Móveis (modelos procedurais, tamanho real e folga de uso)
// ---------------------------------------------------------------------------

export const FurnitureGroup = z.enum(['living', 'dining', 'bedroom', 'kitchen', 'bathroom', 'laundry', 'outdoor', 'decor']);
export type FurnitureGroup = z.infer<typeof FurnitureGroup>;

/** Forma do modelo 3D/planta desenhado em código pela web (sem arquivo externo). */
export const FurnitureModelKind = z.enum([
  'sofa',
  'armchair',
  'coffee_table',
  'rack',
  'shelf',
  'dining',
  'round_table',
  'bed',
  'bunk',
  'nightstand',
  'wardrobe',
  'desk',
  'counter',
  'counter_sink',
  'stove',
  'fridge',
  'island',
  'toilet',
  'basin',
  'shower',
  'bathtub',
  'washer',
  'tank',
  'lounger',
  'plant',
  'rug',
]);
export type FurnitureModelKind = z.infer<typeof FurnitureModelKind>;

export const FurnitureSpec = z.object({
  /** Mesmo ID do material (`furn_*`), que leva massa e preço. */
  id: z.string(),
  name: z.string(),
  group: FurnitureGroup,
  model: FurnitureModelKind,
  /** Largura (x), profundidade (y) e altura (m), em rotação 0. */
  size: z.object({ w: pos, d: pos, h: pos }),
  /** Faixa de uso livre (m): à frente (−y), atrás e de cada lado. */
  clearance: z.object({ front: nonneg, back: nonneg.default(0), sides: nonneg.default(0) }),
  /** Encosta o fundo na parede ao posicionar. */
  wall: z.boolean(),
  /** Pede ponto de água (pia, vaso, chuveiro, máquina). */
  water: z.boolean().default(false),
  /** Tapete e afins: não colide com outros móveis. */
  collides: z.boolean().default(true),
});
export type FurnitureSpec = z.infer<typeof FurnitureSpec>;

export const Catalog = z.object({
  version: z.string(),
  profiles: z.array(Profile),
  materials: z.array(Material),
  assemblies: z.array(Assembly),
  furniture: z.array(FurnitureSpec),
  priceBooks: z.array(PriceBook),
  constants: TechnicalConstants,
});
export type Catalog = z.infer<typeof Catalog>;
