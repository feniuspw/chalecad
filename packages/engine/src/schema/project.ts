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
const DEFAULT_ASSEMBLIES = {
  exterior: 'ext_cement_osb_wool_drywall',
  interior: 'int_drywall_wool_drywall',
  wet: 'wet_cement_drywall_rh',
};

export const System = z.object({
  structure: z.literal('lsf').default('lsf'),
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

export const Extra = z.discriminatedUnion('kind', [FenceExtra, WallExtra, DeckExtra, RetainingExtra]);
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
export const Installations = z.object({
  enabled: z.boolean().default(false),
  /** Aquecimento da água do banho: chuveiro elétrico (TUE), aquecedor a gás ou solar (água quente encanada). */
  waterHeater: z.enum(['electric_shower', 'gas', 'solar']).default('electric_shower'),
  /** Moradores, para a caixa d'água. Ausente = 2 por quarto, mínimo 2. */
  occupants: z.number().int().min(1).max(20).optional(),
  /** Posição do quadro de distribuição (térreo). Ausente = junto à porta de entrada. */
  panel: Vec2.optional(),
});
export type Installations = z.infer<typeof Installations>;

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
  installations: Installations.default({ enabled: false, waterHeater: 'electric_shower' }),
  design: Design,
  budget: Budget,
  priceBookId: Id.default('default-2026-11'),
  /** Preços editados pelo usuário, por itemId do catálogo. Salvos no projeto para reprodutibilidade. */
  priceOverrides: z.record(z.string(), PriceOverride).default({}),
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
