import { z } from 'zod';

/**
 * Schema v1 do projeto ChaléCAD. É a única fonte de verdade: geometria, peças,
 * quantitativos, estrutura e orçamento são derivados dele por funções puras.
 *
 * Convenções:
 * - Unidades: metros, graus, kg, BRL.
 * - Planta em [x, y]: x ao longo da largura (frente), y ao longo da profundidade. z para cima.
 * - A origem [0, 0] é o canto frontal-esquerdo da edificação principal (eixo das paredes).
 * - width/depth das tipologias são medidas de eixo a eixo das paredes externas.
 * - Paredes externas, empenas e águas do telhado NÃO são salvas: o gerador da tipologia
 *   as cria com IDs estáveis (ver HOST_IDS). Aberturas apontam para esses IDs via `host`.
 * - `walls` guarda só paredes desenhadas pelo usuário (internas, normalmente).
 */

export const SCHEMA_VERSION = 1 as const;

export const Id = z.string().min(1).max(64);
export const Vec2 = z.tuple([z.number().finite(), z.number().finite()]);
export type Vec2 = z.infer<typeof Vec2>;

const len = (min: number, max: number) => z.number().finite().min(min).max(max);

/** IDs estáveis dos hospedeiros gerados pelas tipologias. */
export const HOST_IDS = {
  front: 'ext-front', // parede em y = 0
  back: 'ext-back', // parede em y = depth
  left: 'ext-left', // parede em x = 0
  right: 'ext-right', // parede em x = width
  roofA: 'roof-a', // água voltada para -x (ridgeAxis depth) ou -y (ridgeAxis width)
  roofB: 'roof-b',
  /** Módulo combinado (L/T): paredes e águas da ala recebem prefixo `wing-`. */
  wingPrefix: 'wing-',
  /**
   * Anexos laterais do A-frame: `annex-<lado>-front|side|back` (paredes) e `annex-<lado>-roof` (água).
   * Com mureta, o trecho dela depois do anexo vira `ext-left-2` / `ext-right-2`.
   */
  annexPrefix: 'annex-',
} as const;

export const isGeneratedHost = (id: string) => /^(ext-|roof-|wing-|annex-)/.test(id);

// ---------------------------------------------------------------------------
// Meta e terreno
// ---------------------------------------------------------------------------

export const UF = z.enum([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);
export type UF = z.infer<typeof UF>;

export const Meta = z.object({
  name: z.string().min(1).max(120),
  region: UF.default('SP'),
  currency: z.literal('BRL').default('BRL'),
  notes: z.string().max(5000).optional(),
  /** Coordenadas do terreno (sol no modo apresentação). Ausente = capital do estado (`region`). */
  location: z.object({ lat: len(-34, 6), lon: len(-75, -28) }).optional(),
  /**
   * Para onde fica o norte em planta, em graus no sentido horário a partir de +y (fundos):
   * 0 = norte nos fundos, 90 = norte à direita (+x), 180 = norte na frente (−y, padrão: frente recebe o sol).
   */
  northDeg: z.number().finite().min(0).max(360).default(180),
});

export const FlatSite = z.object({ type: z.literal('flat') });

/** Fase 4. Terreno com inclinação uniforme, platô retangular em volta da edificação. */
export const SlopedSite = z.object({
  type: z.literal('sloped'),
  /** Inclinação do terreno natural em % (100% = 45°). */
  slopePct: len(0, 100),
  /** Azimute (graus) para onde o terreno DESCE: 0 = desce para +y (fundo), 90 = +x, 180 = -y (frente), 270 = -x. */
  downhillAzimuthDeg: len(0, 360).default(180),
  /** Folga do platô além da projeção da edificação, por lado. */
  platformMargin: z
    .object({ front: len(0, 30), back: len(0, 30), left: len(0, 30), right: len(0, 30) })
    .default({ front: 3, back: 1.5, left: 1.5, right: 1.5 }),
  /** Cota do platô em relação ao terreno natural no centro da edificação. `auto` compensa corte e aterro. */
  platformElevation: z.union([z.literal('auto'), z.number().finite().min(-10).max(10)]).default('auto'),
  /** Talude horizontal:vertical. */
  cutSlopeHV: len(0.2, 4).default(1),
  fillSlopeHV: len(0.5, 4).default(1.5),
  /** Distância até o bota-fora, para custo de transporte de terra excedente. */
  disposalDistanceKm: len(0, 200).default(10),
});

export const Site = z.discriminatedUnion('type', [FlatSite, SlopedSite]);
export type Site = z.infer<typeof Site>;

// ---------------------------------------------------------------------------
// Tipologias
// ---------------------------------------------------------------------------

const footprint = {
  width: len(2, 30),
  depth: len(2, 40),
};

/** Fase 1. Caixa com telhado de duas águas; mezanino vem de `levels`. */
export const GableTypology = z.object({
  kind: z.literal('gable_mezzanine'),
  ...footprint,
  wallHeight: len(2.2, 6),
  roofPitchDeg: len(5, 60),
  eave: len(0, 1.5).default(0.6),
  /** Beiral nas empenas (prolongamento da cumeeira). */
  rake: len(0, 1.5).default(0.3),
});

/**
 * Anexo lateral do A-frame: caixa com telhado de uma água caindo para fora. A água do anexo entra na água do
 * A-frame até encontrá-la (a água do A-frame é recortada ali e o vão fica aberto para o interior).
 */
export const AFrameAnnex = z.object({
  side: z.enum(['left', 'right']),
  /** Quanto o anexo sai para fora da linha da base do A-frame (eixo a eixo). */
  width: len(1.5, 5).default(3),
  /** Comprimento ao longo da profundidade. */
  length: len(2, 30).default(5),
  /** Distância da frente (y = 0) ao início do anexo. */
  offset: len(0, 30).default(2.5),
  /** Altura do lado alto, na linha da base do A-frame. */
  height: len(2.2, 4.5).default(2.8),
  pitchDeg: len(3, 25).default(10),
  eave: len(0, 1.2).default(0.5),
});
export type AFrameAnnex = z.output<typeof AFrameAnnex>;

/** Fase 1. A-frame: as águas do telhado descem até o radier (ou até uma mureta baixa). */
export const AFrameTypology = z.object({
  kind: z.literal('a_frame'),
  ...footprint,
  ridgeHeight: len(3, 12),
  /** Mureta vertical na base das águas (0 = águas até o chão). */
  kneeWallHeight: len(0, 1.5).default(0),
  rake: len(0, 1.5).default(0.4),
  frontGable: z.enum(['closed', 'glazed', 'open']).default('glazed'),
  backGable: z.enum(['closed', 'glazed', 'open']).default('closed'),
  /** Cômodos encostados nas laterais (no máximo um por lado). */
  annexes: z.array(AFrameAnnex).max(2).default([]),
});

/** Fase 2. Meia-água. */
export const ShedTypology = z.object({
  kind: z.literal('shed'),
  ...footprint,
  lowHeight: len(2.2, 6),
  highHeight: len(2.4, 9),
  highSide: z.enum(['front', 'back', 'left', 'right']).default('front'),
  eave: len(0, 1.5).default(0.5),
});

/** Fase 2. Caixa com telhado plano (telha de baixa inclinação escondida por platibanda). */
export const FlatRoofTypology = z.object({
  kind: z.literal('flat_roof'),
  ...footprint,
  wallHeight: len(2.2, 6),
  parapetHeight: len(0, 1.5).default(0.6),
  slopePct: len(2, 15).default(5),
});

/** Fase 3. Gambrel/celeiro: duas inclinações por água. */
export const GambrelTypology = z.object({
  kind: z.literal('gambrel'),
  ...footprint,
  wallHeight: len(2.2, 6),
  lowerPitchDeg: len(30, 80).default(60),
  upperPitchDeg: len(5, 45).default(25),
  /** Fração da meia-largura ocupada pela água inferior (projeção horizontal). */
  breakRatio: len(0.2, 0.8).default(0.4),
  eave: len(0, 1.5).default(0.4),
  rake: len(0, 1.5).default(0.3),
});

/** Fase 3. Dois volumes duas águas em L ou T. A ala sai da parede do fundo do volume principal. */
export const CombinedTypology = z.object({
  kind: z.literal('combined'),
  shape: z.enum(['L', 'T']),
  ...footprint,
  wallHeight: len(2.2, 6),
  roofPitchDeg: len(5, 60),
  eave: len(0, 1.5).default(0.5),
  rake: len(0, 1.5).default(0.3),
  wing: z.object({
    width: len(2, 20),
    depth: len(2, 20),
    /** Posição da ala ao longo de x (borda esquerda da ala). Para T, ignorado: a ala fica centralizada. */
    offset: len(0, 30).default(0),
  }),
});

export const Typology = z.discriminatedUnion('kind', [
  GableTypology,
  AFrameTypology,
  ShedTypology,
  FlatRoofTypology,
  GambrelTypology,
  CombinedTypology,
]);
export type Typology = z.infer<typeof Typology>;
export type TypologyKind = Typology['kind'];

// ---------------------------------------------------------------------------
// Sistema construtivo
// ---------------------------------------------------------------------------

const DEFAULT_PROFILES = {
  wallStud: 'Ue90x40x0.95',
  wallTrack: 'U90x40x0.95',
  joist: 'Ue200x40x1.25',
  rafter: 'Ue140x40x0.95',
  purlin: 'Cr50x0.95',
};
/** Perfis padrão do wood frame (pinus autoclavado C25). O editor troca para estes ao mudar o sistema. */
export const WOOD_PROFILES = {
  // 38 x 140 nas paredes (usual no wood frame brasileiro para paredes externas e pé-direito de chalé).
  wallStud: 'W38x140',
  wallTrack: 'W38x140',
  joist: 'W38x235',
  rafter: 'W38x184',
  purlin: 'W25x50',
};
const DEFAULT_ASSEMBLIES = {
  exterior: 'ext_cement_osb_wool_drywall',
  interior: 'int_drywall_wool_drywall',
  wet: 'wet_cement_drywall_rh',
};

export const System = z.object({
  /**
   * `lsf`: light steel frame (perfis Ue/U). `wood`: wood frame (madeira serrada tratada, perfis `W*` do catálogo).
   * O tipo dos perfis escolhidos deve bater com o sistema (o motor avisa se não bater).
   */
  structure: z.enum(['lsf', 'wood']).default('lsf'),
  studSpacing: z.union([z.literal(0.4), z.literal(0.6)]).default(0.6),
  /**
   * A-frame: espaçamento próprio dos caibros (as águas apoiam no radier, não precisam seguir os montantes).
   * Ausente = igual a `studSpacing`. Nas outras tipologias a estrutura é alinhada e este campo é ignorado.
   */
  rafterSpacing: z.union([z.literal(0.4), z.literal(0.6)]).optional(),
  profiles: z
    .object({
      wallStud: Id.default(DEFAULT_PROFILES.wallStud),
      wallTrack: Id.default(DEFAULT_PROFILES.wallTrack),
      /**
       * Montante só das empenas altas (paredes `gable`: frente e fundos do A-frame, empena da ala L/T).
       * Ausente = mesmo perfil das outras paredes. Permite reforçar só onde precisa.
       */
      gableStud: Id.optional(),
      joist: Id.default(DEFAULT_PROFILES.joist),
      rafter: Id.default(DEFAULT_PROFILES.rafter),
      /** Terça/cartola para fixar a telha. */
      purlin: Id.default(DEFAULT_PROFILES.purlin),
    })
    .default(DEFAULT_PROFILES),
  /** Contraventamento: OSB estrutural nas faces externas ou fitas em X. */
  bracing: z.enum(['osb', 'strap']).default('osb'),
  assemblies: z
    .object({
      exterior: Id.default(DEFAULT_ASSEMBLIES.exterior),
      interior: Id.default(DEFAULT_ASSEMBLIES.interior),
      wet: Id.default(DEFAULT_ASSEMBLIES.wet),
    })
    .default(DEFAULT_ASSEMBLIES),
  foundation: z
    .object({
      kind: z.literal('radier').default('radier'),
      thickness: len(0.08, 0.3).default(0.12),
      /** Quanto o radier passa da face externa das paredes. */
      border: len(0, 0.5).default(0.15),
      /** Viga de borda (engrossamento do perímetro), profundidade total. */
      edgeBeamDepth: len(0, 0.6).default(0.3),
    })
    .default({ kind: 'radier', thickness: 0.12, border: 0.15, edgeBeamDepth: 0.3 }),
});
export type System = z.infer<typeof System>;

// ---------------------------------------------------------------------------
// Níveis, paredes, aberturas, escadas
// ---------------------------------------------------------------------------

export const FloorFinish = z.enum(['burnished_concrete', 'polished_concrete', 'none']);

export const Level = z.object({
  id: Id,
  name: z.string().max(60).optional(),
  elevation: len(0, 20),
  /** L0: acabamento sobre o radier. */
  floor: FloorFinish.optional(),
  /** Níveis superiores: polígono do mezanino em planta (anti-horário). */
  polygon: z.array(Vec2).min(3).optional(),
  deck: z.enum(['osb18', 'osb18_wood', 'cement18']).optional(),
  guardrail: z.boolean().optional(),
});
export type Level = z.infer<typeof Level>;

export const Wall = z.object({
  id: Id,
  level: Id,
  from: Vec2,
  to: Vec2,
  /** Assembly do catálogo. Se omitido: system.assemblies.wet quando `wet`, senão system.assemblies.interior. */
  assembly: Id.optional(),
  wet: z.boolean().optional(),
  /** Altura; se omitida vai até o teto do nível (pé-direito, mezanino ou telhado). */
  height: len(0.5, 6).optional(),
});
export type Wall = z.infer<typeof Wall>;

export const OpeningType = z.enum(['door', 'window', 'sliding_door', 'skylight']);
export type OpeningType = z.infer<typeof OpeningType>;

export const Opening = z.object({
  id: Id,
  /** ID de parede do usuário ou hospedeiro gerado (ext-front, roof-a, …). */
  host: Id,
  type: OpeningType,
  /** Distância do início do hospedeiro até a borda do vão, ao longo do hospedeiro. Em telhado: ao longo do beiral (u). */
  offset: len(0, 40),
  width: len(0.3, 6),
  height: len(0.3, 4),
  /** Peitoril (janela) a partir da base da parede. Em telhado: distância do beiral subindo a água (v). */
  sill: len(0, 5).default(0),
});
export type Opening = z.infer<typeof Opening>;

export const Stair = z.object({
  id: Id,
  type: z.enum(['straight', 'l_shape', 'ladder']),
  from: Id,
  to: Id,
  /** Canto esquerdo do pé da escada (olhando na direção de subida), em planta. */
  position: Vec2,
  /** Direção de subida: 0 = +y, 90 = +x (sentido horário visto de cima). */
  rotationDeg: z.number().finite().default(0),
  width: len(0.5, 1.5).default(0.8),
  /** Escada em L: vira para a direita (true) ou esquerda. */
  turnRight: z.boolean().default(true),
});
export type Stair = z.infer<typeof Stair>;

export const Roof = z.object({
  cladding: Id.default('sandwich_eps30'),
  /** Eixo da cumeeira. `depth`: cumeeira paralela a y (empenas na frente e fundo). */
  ridgeAxis: z.enum(['depth', 'width']).default('depth'),
  gutters: z.boolean().default(true),
});
export type Roof = z.infer<typeof Roof>;

export const UtilityPoint = z.object({
  id: Id,
  kind: z.enum(['sewer', 'water', 'electric']),
  position: Vec2,
});
export type UtilityPoint = z.infer<typeof UtilityPoint>;

// ---------------------------------------------------------------------------
// Extras (Fase 2+)
// ---------------------------------------------------------------------------

export const FenceExtra = z.object({
  id: Id,
  kind: z.literal('fence'),
  path: z.array(Vec2).min(2),
  closed: z.boolean().default(true),
  height: len(0.8, 3).default(1.8),
  postType: z.enum(['concrete', 'eucalyptus', 'steel']).default('concrete'),
  postSpacing: len(1, 4).default(2.5),
  mesh: z.enum(['welded', 'chain_link', 'barbed']).default('welded'),
  baseWallHeight: len(0, 1).default(0.2),
});

export const WallExtra = z.object({
  id: Id,
  kind: z.literal('wall'),
  path: z.array(Vec2).min(2),
  closed: z.boolean().default(false),
  height: len(0.5, 4).default(2),
  system: z.enum(['concrete_block', 'structural_block', 'lsf_board']).default('concrete_block'),
  foundation: z.enum(['strip', 'grade_beam']).default('strip'),
});

export const DeckExtra = z.object({
  id: Id,
  kind: z.literal('deck'),
  side: z.enum(['front', 'back', 'left', 'right']).default('front'),
  /** Comprimento ao longo da fachada; omitido = fachada inteira. */
  length: len(1, 30).optional(),
  offset: len(0, 30).default(0),
  depth: len(0.8, 6).default(2),
  elevation: len(0, 3).default(0.3),
  covered: z.boolean().default(false),
  guardrail: z.boolean().default(true),
});

export const RetainingExtra = z.object({
  id: Id,
  kind: z.literal('retaining'),
  path: z.array(Vec2).min(2),
  height: len(0.3, 5),
  type: z.enum(['gabion', 'concrete', 'block']).default('block'),
  drainage: z.boolean().default(true),
});

/**
 * Torre da caixa d'água: volume pequeno que atravessa o telhado e eleva a caixa acima dos chuveiros do mezanino
 * (NBR 5626: pressão mínima no ponto de uso). Estrutura própria (4 montantes), fechamento e telhado próprios.
 */
export const WaterTowerExtra = z.object({
  id: Id,
  kind: z.literal('water_tower'),
  /** Centro da torre em planta (normalmente sobre o banheiro). */
  position: Vec2,
  width: len(1, 3).default(1.6),
  depth: len(1, 3).default(1.6),
  /** Cota do piso da caixa d'água (m, a partir do térreo). */
  platformZ: len(2, 10).default(5),
  /** Caixa d'água abrigada (L). Ausente = a caixa das instalações (ou 1.000 L). */
  tankLiters: z.number().int().min(100).max(5000).optional(),
  roof: z.enum(['gable', 'shed', 'flat']).default('gable'),
});

export const Extra = z.discriminatedUnion('kind', [FenceExtra, WallExtra, DeckExtra, RetainingExtra, WaterTowerExtra]);
export type Extra = z.infer<typeof Extra>;

// ---------------------------------------------------------------------------
// Premissas de cálculo e orçamento
// ---------------------------------------------------------------------------

export const Stage = z.enum([
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
export type Stage = z.infer<typeof Stage>;

const DEFAULT_DESIGN = { windV0: 35, terrainCategory: 3 as const, soilBearingKPa: 100 };
export const Design = z
  .object({
    /** Velocidade básica do vento (NBR 6123), m/s. */
    windV0: len(25, 55).default(35),
    terrainCategory: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).default(3),
    /** Tensão admissível do solo, kPa. Padrão conservador sem sondagem. */
    soilBearingKPa: len(30, 500).default(100),
  })
  .default(DEFAULT_DESIGN);

export const PriceOverride = z.object({
  /** Preço unitário (mín) por unidade de compra. */
  price: z.number().finite().min(0),
  priceMax: z.number().finite().min(0).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: z.string().max(120).default('cotação manual'),
});
export type PriceOverride = z.infer<typeof PriceOverride>;

const DEFAULT_BUDGET = {
  contingencyPct: 15,
  diyStages: [] as Stage[],
  freight: { distanceKm: 30, pricePerTonKm: 3.5 },
  durationsWeeks: {},
  includeFurniture: false,
};
export const Budget = z
  .object({
    contingencyPct: len(0, 50).default(15),
    /** Etapas que o usuário executa: mão de obra zerada. */
    diyStages: z.array(Stage).default([]),
    freight: z
      .object({ distanceKm: len(0, 1000).default(30), pricePerTonKm: len(0, 50).default(3.5) })
      .default({ distanceKm: 30, pricePerTonKm: 3.5 }),
    /** Duração em semanas por etapa, para o cronograma de desembolso. */
    durationsWeeks: z.partialRecord(Stage, len(0, 52)).default({}),
    /** Soma os móveis (preço do catálogo) ao orçamento, na etapa de acabamento. */
    includeFurniture: z.boolean().default(false),
  })
  .default(DEFAULT_BUDGET);

// ---------------------------------------------------------------------------
// Projeto
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Cômodos e acabamentos
// ---------------------------------------------------------------------------

/** Uso do cômodo: define pé-direito mínimo, exigência de janela e área molhada. */
export const RoomUse = z.enum(['living', 'kitchen', 'bedroom', 'bathroom', 'laundry', 'circulation', 'storage', 'other']);
export type RoomUse = z.infer<typeof RoomUse>;

/**
 * Cômodo. Não guarda contorno: o motor acha o polígono fechado pelas paredes em volta do ponto `seed`
 * (paredes externas e internas do nível; no mezanino, a borda da laje). Assim o cômodo acompanha as paredes.
 */
export const Room = z.object({
  id: Id,
  level: Id,
  use: RoomUse,
  name: z.string().max(40).optional(),
  seed: Vec2,
  /** Material de piso (catálogo, `finish_floor_*`). Ausente = acabamento do nível. */
  floor: Id.optional(),
  /** Revestimento das paredes (catálogo, `finish_wall_*`). Ausente = sem revestimento orçado. */
  walls: Id.optional(),
});
export type Room = z.infer<typeof Room>;

/** Acabamentos gerais. Ausente = sem item de acabamento orçado (só o fechamento da assembly). */
export const Finishes = z.object({
  /** Revestimento externo das paredes (catálogo, `finish_facade_*`). */
  facade: Id.optional(),
  /** Face interna das águas que são parede (A-frame): `finish_ceiling_*`. */
  interiorRoof: Id.optional(),
  /** Cor da telha (só visual). */
  roofColor: z.enum(['graphite', 'black', 'terracotta', 'white', 'green']).optional(),
});
export type Finishes = z.infer<typeof Finishes>;

/**
 * Móvel posicionado na planta. O tamanho, a folga de uso e o modelo 3D vêm do catálogo (`catalog.furniture`).
 * Em rotação 0 a largura fica em x, a profundidade em y e a frente (lado de uso) aponta para −y;
 * `rotation` gira em graus, sentido anti-horário, em torno de `position` (centro do móvel).
 */
export const Furniture = z.object({
  id: Id,
  level: Id,
  /** ID do móvel no catálogo (`furn_*`). */
  item: Id,
  position: Vec2,
  rotation: z.number().min(-360).max(360).default(0),
  /** Acabamento visual (só 3D). */
  tone: z.enum(['light', 'wood', 'dark', 'white', 'color']).optional(),
});
export type Furniture = z.infer<typeof Furniture>;

/**
 * Instalações elétricas e hidráulicas estimadas (NBR 5410 / NBR 5626, mínimos usuais).
 * O motor posiciona os pontos a partir dos cômodos e dos móveis; nada é desenhado pelo usuário.
 */
/**
 * Projeto elétrico desenhado (fonte de verdade quando `manual`). Sem `manual`, o motor gera o traçado a partir dos
 * cômodos e móveis (pontos pelos mínimos da NBR 5410, circuitos, eletrodutos pelo forro) e calcula do mesmo jeito.
 * Alturas a partir do piso acabado do nível; posições em planta (na face da parede quando `hostId`).
 */
export const ElecPointKind = z.enum(['socket', 'socket_high', 'socket_tue', 'switch', 'light', 'data']);
export type ElecPointKind = z.infer<typeof ElecPointKind>;
export const ElecPoint = z.object({
  id: Id,
  kind: ElecPointKind,
  level: Id,
  position: Vec2,
  /** Parede em que a caixa está embutida (tomada, interruptor, arandela); ausente = teto ou piso. */
  hostId: Id.optional(),
  height: z.number().min(0).max(12),
  /** Potência de projeto (VA). Ausente = regra da NBR 5410 (100/600 VA), aparelho ou soma das luminárias. */
  powerVA: z.number().positive().max(20000).optional(),
  /** Equipamento (chave em `catalog.constants.electrical.appliances`) para tomada de uso específico. */
  appliance: z.string().max(64).optional(),
  /** Circuito atribuído; ausente = o motor distribui. */
  circuitId: Id.optional(),
  /** Interruptor: tipo e pontos de luz que ele comanda (paralelo = dois interruptores com os mesmos pontos). */
  switchType: z.enum(['one_way', 'two_way', 'intermediate', 'dimmer']).optional(),
  controls: z.array(Id).max(20).optional(),
  /** Ponto de luz: luminária do catálogo e quantidade no ponto. */
  luminaire: z.string().max(64).optional(),
  count: z.number().int().min(1).max(20).optional(),
  label: z.string().max(60).optional(),
});
export type ElecPoint = z.infer<typeof ElecPoint>;
/** Eletroduto: polilinha em planta no forro, piso ou parede; DN ausente = dimensionado pela ocupação. */
export const Conduit = z.object({
  id: Id,
  level: Id,
  path: z.array(Vec2).min(2).max(200),
  run: z.enum(['ceiling', 'floor', 'wall']).default('ceiling'),
  dn: z.number().positive().max(100).optional(),
});
export type Conduit = z.infer<typeof Conduit>;
/** Circuito definido pelo usuário (sobrescritas); o motor dimensiona o que faltar. */
export const CircuitDef = z.object({
  id: Id,
  name: z.string().min(1).max(60),
  kind: z.enum(['lighting', 'sockets', 'wet_sockets', 'tue']),
  sectionMm2: z.number().positive().max(35).optional(),
  breakerA: z.number().positive().max(125).optional(),
  curve: z.enum(['B', 'C']).optional(),
  dr: z.boolean().optional(),
});
export type CircuitDef = z.infer<typeof CircuitDef>;
export const Electrical = z.object({
  /** O traçado salvo é a fonte de verdade (o usuário editou); falso = o motor gera a cada cálculo. */
  manual: z.boolean().default(false),
  /** Tensão fase-neutro; ausente = a da UF (`voltageByUF`). */
  voltage: z.union([z.literal(127), z.literal(220)]).optional(),
  /** Do padrão de entrada ao quadro (m), para a queda de tensão do alimentador. */
  feederLength: z.number().min(0).max(200).default(15),
  /** Temperatura ambiente do percurso (°C). */
  ambientTemp: z.number().min(10).max(50).default(30),
  points: z.array(ElecPoint).max(2000).default([]),
  conduits: z.array(Conduit).max(2000).default([]),
  circuits: z.array(CircuitDef).max(200).default([]),
});
export type Electrical = z.infer<typeof Electrical>;

/** Hidráulica desenhada (fonte de verdade quando `manual`); sem `manual`, o motor gera a árvore a partir da caixa. */
export const PipeSystem = z.enum(['cold', 'hot', 'sewer', 'vent']);
export type PipeSystem = z.infer<typeof PipeSystem>;
export const WaterPoint = z.object({
  id: Id,
  /** Aparelho (chave em `catalog.constants.plumbing.water.fixtures`). */
  fixture: z.string().min(1).max(64),
  level: Id,
  position: Vec2,
  furnitureId: Id.optional(),
  label: z.string().max(60).optional(),
});
export type WaterPoint = z.infer<typeof WaterPoint>;
/**
 * Tubo: polilinha 3D [x, y, z] com z = cota acima do piso do nível. Ligações por pontas coincidentes (2 cm) com
 * outro tubo, um ponto de água ou a caixa. DN ausente = dimensionado; `slope` (m/m) só no esgoto.
 */
export const Pipe = z.object({
  id: Id,
  system: PipeSystem,
  level: Id,
  path: z.array(z.tuple([z.number().finite(), z.number().finite(), z.number().finite()])).min(2).max(200),
  dn: z.number().positive().max(150).optional(),
  slope: z.number().min(0).max(0.2).optional(),
});
export type Pipe = z.infer<typeof Pipe>;
export const Plumbing = z.object({
  manual: z.boolean().default(false),
  /** Caixa d'água: posição e cota do fundo (absoluta). Ausente = sobre o banheiro (ou a torre). */
  tank: z.object({ level: Id, position: Vec2, bottomZ: z.number().min(0).max(30), liters: z.number().positive().max(20000).optional() }).optional(),
  points: z.array(WaterPoint).max(500).default([]),
  pipes: z.array(Pipe).max(2000).default([]),
  /** Destino do esgoto: rede pública ou fossa (dimensionada pela NBR 7229). */
  sewerDisposal: z.enum(['public', 'septic']).default('septic'),
});
export type Plumbing = z.infer<typeof Plumbing>;

const electricalDefault = (): Electrical => ({ manual: false, feederLength: 15, ambientTemp: 30, points: [], conduits: [], circuits: [] });
const plumbingDefault = (): Plumbing => ({ manual: false, points: [], pipes: [], sewerDisposal: 'septic' });

export const Installations = z.object({
  enabled: z.boolean().default(false),
  electrical: Electrical.default(electricalDefault),
  plumbing: Plumbing.default(plumbingDefault),
  /** Aquecimento da água do banho: chuveiro elétrico (TUE), aquecedor a gás ou solar (água quente encanada). */
  waterHeater: z.enum(['electric_shower', 'gas', 'solar']).default('electric_shower'),
  /** Moradores, para a caixa d'água. Ausente = 2 por quarto, mínimo 2. */
  occupants: z.number().int().min(1).max(20).optional(),
  /** Posição do quadro de distribuição (térreo). Ausente = junto à porta de entrada. */
  panel: Vec2.optional(),
});
export type Installations = z.infer<typeof Installations>;

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Acompanhamento da obra pelo autoconstrutor: o que já foi comprado (por item do orçamento) e quais etapas estão feitas.
 * Não altera nenhum cálculo; só a aba Obra lê.
 */
export const Progress = z.object({
  /** Início previsto da obra, para o cronograma em datas. */
  startDate: IsoDate.optional(),
  /** Itens comprados, por `itemId` do orçamento: data e valor pago (opcional, R$ total do item). */
  purchased: z
    .record(z.string(), z.object({ at: IsoDate, paid: z.number().min(0).optional(), note: z.string().max(200).optional() }))
    .default({}),
  /** Etapas concluídas. */
  stagesDone: z.array(Stage).default([]),
});
export type Progress = z.infer<typeof Progress>;

/** Desempenho: zona bioclimática (térmico), energia solar e água de chuva. */
export const Performance = z.object({
  /** Zona bioclimática NBR 15220-3. Ausente = zona da capital do estado (serra costuma ser 1–3: ajuste). */
  zone: z.number().int().min(1).max(8).optional(),
  /** Dimensiona e orça um sistema fotovoltaico on-grid. */
  solar: z.boolean().default(false),
  /** Dimensiona e orça captação de água de chuva para uso não potável. */
  rainwater: z.boolean().default(false),
});
export type Performance = z.infer<typeof Performance>;

// ---------------------------------------------------------------------------
// Fase 17: aprovação legal, ART/RRT e validação pelo profissional
// ---------------------------------------------------------------------------

const txt = (max: number) => z.string().max(max).default('');

/** Disciplinas de projeto (uma ART/RRT por atividade; pranchas e verificações agrupadas por disciplina). */
export const Discipline = z.enum(['architecture', 'structure', 'foundation', 'electrical', 'plumbing', 'execution']);
export type Discipline = z.infer<typeof Discipline>;

/** Pessoa física ou jurídica (proprietário, contratante). `doc` = CPF ou CNPJ, só dígitos ou formatado. */
export const LegalPerson = z.object({
  name: txt(160),
  doc: txt(20),
  address: txt(240),
  email: txt(120),
  phone: txt(40),
});
export type LegalPerson = z.infer<typeof LegalPerson>;
const personDefault = (): LegalPerson => ({ name: '', doc: '', address: '', email: '', phone: '' });

/** Responsável técnico por uma ou mais disciplinas. `docNumber` = nº da ART (CREA) ou RRT (CAU) depois de emitida. */
export const Professional = z.object({
  id: Id,
  name: z.string().min(1).max(160),
  /** Título profissional (ex.: Engenheiro Civil, Arquiteto e Urbanista, Engenheiro Eletricista). */
  title: txt(80),
  council: z.enum(['CREA', 'CAU']),
  /** Registro no conselho (CREA: nº RNP ou regional; CAU: A000000-0). */
  registry: txt(40),
  uf: UF.optional(),
  company: txt(160),
  companyRegistry: txt(40),
  disciplines: z.array(Discipline).min(1),
  docNumber: txt(40),
});
export type Professional = z.infer<typeof Professional>;

/** Endereço e identificação do imóvel. */
export const LegalAddress = z.object({
  street: txt(160),
  number: txt(20),
  complement: txt(80),
  district: txt(80),
  city: txt(80),
  cep: txt(12),
  /** Matrícula do imóvel e cartório de registro. */
  registry: txt(40),
  registryOffice: txt(120),
  /** Inscrição imobiliária / cadastral (IPTU), ou CCIR/NIRF em área rural. */
  cadastral: txt(40),
  lot: txt(20),
  block: txt(20),
  subdivision: txt(120),
});
export type LegalAddress = z.infer<typeof LegalAddress>;
const addressDefault = (): LegalAddress => ({
  street: '', number: '', complement: '', district: '', city: '', cep: '', registry: '', registryOffice: '', cadastral: '', lot: '', block: '', subdivision: '',
});

/**
 * Lote retangular (testada × profundidade) ou poligonal, em coordenadas do lote: origem no canto da testada à esquerda
 * de quem olha da rua, x ao longo da testada, y para dentro do lote. A edificação (origem do projeto) fica em
 * `buildingOffset`, girada `rotationDeg` (anti-horário) — com 0, a frente do chalé (y = 0) olha para a rua.
 */
export const Lot = z.object({
  front: len(3, 1000),
  depth: len(3, 2000),
  polygon: z.array(Vec2).min(3).max(64).optional(),
  buildingOffset: Vec2,
  rotationDeg: z.number().finite().min(-180).max(180).default(0),
  /** Áreas impermeáveis além da edificação (calçadas, garagem, piscina), m². */
  pavedArea: len(0, 100000).default(0),
  streetName: txt(160),
});
export type Lot = z.infer<typeof Lot>;

/** Parâmetros urbanísticos do lote (plano diretor / zoneamento do município): o programa só confere. Ausente = não informado. */
export const Zoning = z.object({
  zone: txt(80),
  /** Taxa de ocupação máxima (%) = projeção ÷ lote. */
  maxOccupancyPct: len(0, 100).optional(),
  /** Coeficiente de aproveitamento máximo = área computável ÷ lote. */
  maxFar: len(0, 20).optional(),
  /** Taxa de permeabilidade mínima (%). */
  minPermeablePct: len(0, 100).optional(),
  setbackFront: len(0, 50).optional(),
  setbackSide: len(0, 50).optional(),
  setbackBack: len(0, 50).optional(),
  /** Altura máxima da edificação (m, do terreno ao ponto mais alto). */
  maxHeight: len(0, 200).optional(),
  maxFloors: z.number().int().min(1).max(50).optional(),
  /** Pé-direito mínimo dos ambientes de permanência prolongada pelo código de obras (m). */
  minCeiling: len(2, 4).optional(),
  /** O mezanino entra na área computável (CA) e conta como pavimento? Depende do município. */
  mezzanineCounts: z.boolean().default(true),
  /** Fonte dos parâmetros (lei, artigo, data da consulta). */
  source: txt(200),
});
export type Zoning = z.infer<typeof Zoning>;

/** Parecer do profissional sobre um item da verificação normativa (`ComplianceItem.id`). */
export const ComplianceReview = z.object({
  status: z.enum(['accepted', 'rejected', 'na']),
  note: txt(1000),
  /** `Professional.id` de quem revisou. */
  by: Id.optional(),
  at: IsoDate,
});
export type ComplianceReview = z.infer<typeof ComplianceReview>;

/** Etapa do projeto (NBR 16636-2): define o que as pranchas e memoriais trazem. */
export const ProjectStage = z.enum(['preliminary', 'draft', 'legal', 'executive']);
export type ProjectStage = z.infer<typeof ProjectStage>;

export const Legal = z.object({
  stage: ProjectStage.default('legal'),
  owner: LegalPerson.default(personDefault),
  /** Contratante diferente do proprietário (ART/RRT). Ausente = o proprietário. */
  contractor: LegalPerson.optional(),
  address: LegalAddress.default(addressDefault),
  /** Área urbana (alvará na prefeitura) ou rural (INCRA/CCIR; prefeitura pode não exigir alvará). */
  area: z.enum(['urban', 'rural']).default('urban'),
  lot: Lot.optional(),
  zoning: Zoning.default(() => ({ zone: '', mezzanineCounts: true, source: '' })),
  /** Concessionária de energia (padrão de entrada) e de saneamento. */
  powerUtility: txt(80),
  waterUtility: txt(80),
  professionals: z.array(Professional).max(20).default([]),
  /** Valor do contrato de cada atividade técnica (R$), por disciplina; vai para a ficha da ART/RRT. */
  contractValues: z.partialRecord(Discipline, z.number().min(0)).default({}),
  startDate: IsoDate.optional(),
  endDate: IsoDate.optional(),
  /** Origem da tensão admissível do solo usada no radier (`design.soilBearingKPa`), furos SPT e nível d'água. */
  soil: z
    .object({
      source: z.enum(['assumed', 'spt', 'other']).default('assumed'),
      reference: txt(160),
      boreholes: z.number().int().min(0).max(50).default(0),
      /** Profundidade do nível d'água (m); ausente = não encontrado / não informado. */
      waterTableDepth: len(0, 50).optional(),
    })
    .default(() => ({ source: 'assumed' as const, reference: '', boreholes: 0 })),
  /** Esquema de aterramento (NBR 5410). */
  earthing: z.enum(['TN-S', 'TN-C-S', 'TT']).default('TN-S'),
  /** Abastecimento de água. */
  waterSource: z.enum(['public', 'well']).default('public'),
  /** Fossa/sumidouro e poço em coordenadas do lote (implantação e distâncias). Ausente = não locado. */
  septicPosition: Vec2.optional(),
  wellPosition: Vec2.optional(),
  /** Teste de percolação (min por cm de rebaixamento), para a disposição final do esgoto. */
  percolationMinPerCm: len(0, 1000).optional(),
  /** Formato das pranchas: automático (menor que cabe na escala) ou fixo. */
  sheetFormat: z.enum(['auto', 'A0', 'A1', 'A2', 'A3']).default('auto'),
  /** Iniciais de quem desenhou e de quem conferiu (carimbo). */
  drawnBy: txt(40),
  checkedBy: txt(40),
  /** Revisões das pranchas (carimbo). */
  revisions: z.array(z.object({ code: z.string().min(1).max(8), date: IsoDate, description: txt(200) })).max(50).default([]),
  /** Pareceres por item da verificação normativa. */
  reviews: z.record(z.string(), ComplianceReview).default({}),
});
export type Legal = z.infer<typeof Legal>;
export const legalDefault = (): Legal => Legal.parse({});

export const ProjectBase = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  meta: Meta,
  site: Site.default({ type: 'flat' }),
  typology: Typology,
  system: System.default({
    structure: 'lsf',
    studSpacing: 0.6,
    profiles: DEFAULT_PROFILES,
    bracing: 'osb',
    assemblies: DEFAULT_ASSEMBLIES,
    foundation: { kind: 'radier', thickness: 0.12, border: 0.15, edgeBeamDepth: 0.3 },
  }),
  levels: z.array(Level).min(1),
  walls: z.array(Wall).default([]),
  openings: z.array(Opening).default([]),
  stairs: z.array(Stair).default([]),
  roof: Roof.default({ cladding: 'sandwich_eps30', ridgeAxis: 'depth', gutters: true }),
  utilities: z.array(UtilityPoint).default([]),
  extras: z.array(Extra).default([]),
  rooms: z.array(Room).default([]),
  finishes: Finishes.default({}),
  furniture: z.array(Furniture).default([]),
  installations: Installations.default(() => ({ enabled: false, waterHeater: 'electric_shower' as const, electrical: electricalDefault(), plumbing: plumbingDefault() })),
  progress: Progress.default({ purchased: {}, stagesDone: [] }),
  performance: Performance.default({ solar: false, rainwater: false }),
  design: Design,
  budget: Budget,
  priceBookId: Id.default('default-2026-11'),
  /** Preços editados pelo usuário, por itemId do catálogo. Salvos no projeto para reprodutibilidade. */
  priceOverrides: z.record(z.string(), PriceOverride).default({}),
  legal: Legal.default(legalDefault),
});

/** Integridade referencial. Hospedeiros gerados (ext-*, roof-*, wing-*) são checados no motor, não aqui. */
export const Project = ProjectBase.superRefine((p, ctx) => {
  const dup = (ids: string[], path: string) => {
    const seen = new Set<string>();
    ids.forEach((id, i) => {
      if (seen.has(id)) ctx.addIssue({ code: 'custom', path: [path, i, 'id'], message: `ID duplicado: ${id}` });
      seen.add(id);
    });
  };
  dup(p.levels.map((l) => l.id), 'levels');
  dup(p.walls.map((w) => w.id), 'walls');
  dup(p.openings.map((o) => o.id), 'openings');
  dup(p.stairs.map((s) => s.id), 'stairs');
  dup(p.extras.map((e) => e.id), 'extras');
  dup(p.rooms.map((r) => r.id), 'rooms');
  dup(p.furniture.map((f) => f.id), 'furniture');

  const levelIds = new Set(p.levels.map((l) => l.id));
  const wallIds = new Set(p.walls.map((w) => w.id));
  if (!p.levels.some((l) => l.elevation === 0)) {
    ctx.addIssue({ code: 'custom', path: ['levels'], message: 'É preciso um nível térreo com elevação 0.' });
  }
  p.walls.forEach((w, i) => {
    if (!levelIds.has(w.level)) ctx.addIssue({ code: 'custom', path: ['walls', i, 'level'], message: `Nível inexistente: ${w.level}` });
    if (Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]) < 0.1) {
      ctx.addIssue({ code: 'custom', path: ['walls', i], message: 'Parede com menos de 10 cm.' });
    }
  });
  p.openings.forEach((o, i) => {
    if (!isGeneratedHost(o.host) && !wallIds.has(o.host)) {
      ctx.addIssue({ code: 'custom', path: ['openings', i, 'host'], message: `Parede inexistente: ${o.host}` });
    }
    const wall = p.walls.find((w) => w.id === o.host);
    if (wall) {
      const L = Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1]);
      if (o.offset + o.width > L + 1e-6) {
        ctx.addIssue({ code: 'custom', path: ['openings', i], message: `Abertura passa do fim da parede ${wall.id}.` });
      }
    }
  });
  if (p.typology.kind === 'a_frame') {
    const t = p.typology;
    const sides = new Set<string>();
    t.annexes.forEach((a, i) => {
      if (sides.has(a.side)) ctx.addIssue({ code: 'custom', path: ['typology', 'annexes', i, 'side'], message: 'Só um anexo por lado.' });
      sides.add(a.side);
      if (a.offset + a.length > t.depth + 1e-6) {
        ctx.addIssue({ code: 'custom', path: ['typology', 'annexes', i, 'length'], message: 'O anexo passa do fundo do chalé (início + comprimento > profundidade).' });
      }
    });
  }
  p.rooms.forEach((r, i) => {
    if (!levelIds.has(r.level)) ctx.addIssue({ code: 'custom', path: ['rooms', i, 'level'], message: `Nível inexistente: ${r.level}` });
  });
  p.furniture.forEach((f, i) => {
    if (!levelIds.has(f.level)) ctx.addIssue({ code: 'custom', path: ['furniture', i, 'level'], message: `Nível inexistente: ${f.level}` });
  });
  p.stairs.forEach((s, i) => {
    if (!levelIds.has(s.from)) ctx.addIssue({ code: 'custom', path: ['stairs', i, 'from'], message: `Nível inexistente: ${s.from}` });
    if (!levelIds.has(s.to)) ctx.addIssue({ code: 'custom', path: ['stairs', i, 'to'], message: `Nível inexistente: ${s.to}` });
  });
});

/** Projeto já validado e com defaults aplicados. */
export type Project = z.output<typeof Project>;
/** O que se pode escrever no JSON (defaults opcionais). */
export type ProjectInput = z.input<typeof Project>;
