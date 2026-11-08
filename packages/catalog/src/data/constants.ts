import type { TechnicalConstants } from '../schema';

export const constants: TechnicalConstants = {
  steelDensity: 7850,
  concreteDensity: 2500,
  steelE: 200000,
  steelIndexRange: [21.9, 24.7],
  sawKerf: 0.003,
  priceStaleDays: 90,
  lsf: {
    blockingSpacing: 1.4,
    anchorSpacing: 0.8,
    screwsPerStud: 4,
    holdDownOpeningMin: 1.5,
    maxPanelLength: 6,
    headerBearing: 0.04,
  },
  roof: {
    sandwichUsefulWidth: 0.98,
    purlinSpacing: 1.2,
    rafterSpacing: 0.6,
    screwsPerM2: 4,
    ridgeCapLength: 1.0,
    flashingLength: 3.0,
    gutterLength: 3.0,
  },
  radier: {
    gravelThickness: 0.05,
    meshOverlapFactor: 1.15,
    formHeight: 0.3,
    lonaOverlapFactor: 1.1,
    floorJointSpacing: 4,
    edgeBeamWidth: 0.25,
  },
  loads: {
    liveMezzanine: 1.5,
    liveRoof: 0.25,
    superimposedRoof: 0.15,
    superimposedFloor: 0.5,
    gammaG: 1.4,
    gammaQ: 1.5,
    gammaW: 1.4,
    cpeWall: 0.8,
    cpeRoofUplift: 1.2,
    cpi: 0.2,
    s2ByCategory: [1.06, 1.0, 0.94, 0.86, 0.74],
    s1: 1,
    s3: 1,
  },
  deflection: { floor: 350, roof: 250, header: 350 },
  usage: { warn: 0.7, fail: 1.0 },
  anchorage: { anchorKN: 6, holdDownKN: 15 },
  bracingMinRatio: 0.3,
  stairs: {
    idealRiser: 0.18,
    maxRiser: 0.19,
    going: 0.28,
    goingMin: 0.25,
    goingMax: 0.32,
    ladderGoing: 0.2,
    treadThickness: 0.04,
    blondelMin: 0.63,
    blondelMax: 0.64,
  },
  norms: {
    ceilingLiving: 2.5,
    ceilingService: 2.3,
    stairHeadroom: 2.1,
    guardrailHeight: 1.1,
    guardrailMaxGap: 0.11,
    handrailMin: 0.8,
    handrailMax: 0.92,
    lightRatio: 1 / 6,
    ventRatio: 1 / 12,
    safetyGlassSill: 0.9,
    // NBR 15575: 2,50 m em ambientes de permanência prolongada; 2,30 m em banheiro, lavanderia, circulação e depósito.
    rooms: {
      living: { ceiling: 2.5, light: true, vent: true, wet: false, minArea: 8 },
      bedroom: { ceiling: 2.5, light: true, vent: true, wet: false, minArea: 6 },
      kitchen: { ceiling: 2.5, light: true, vent: true, wet: true, minArea: 4 },
      bathroom: { ceiling: 2.3, light: false, vent: true, wet: true, minArea: 1.5 },
      laundry: { ceiling: 2.3, light: false, vent: true, wet: true, minArea: 1.5 },
      circulation: { ceiling: 2.3, light: false, vent: false, wet: false, minArea: 0 },
      storage: { ceiling: 2.3, light: false, vent: false, wet: false, minArea: 0 },
      other: { ceiling: 2.3, light: false, vent: false, wet: false, minArea: 0 },
    },
    // Janela de correr e porta de correr abrem metade do vão; claraboia basculante ~50%; porta cega não ventila pela regra.
    openableFraction: { window: 0.5, sliding_door: 0.5, skylight: 0.5, door: 0 },
    circulationMin: 0.8,
  },
  // NBR 5410 (mínimos de pontos e potências) e NBR 5626 (reserva). Valores usuais para residência unifamiliar em 220 V.
  installations: {
    voltage: 220,
    outletPerimeter: 5,
    wetOutletPerimeter: 3.5,
    outletVA: 100,
    wetOutletVA: 600,
    wetOutletHighCount: 3,
    lightBaseVA: 100,
    lightBaseArea: 6,
    lightStepVA: 60,
    lightStepArea: 4,
    circuitMaxVA: 2200,
    tuePower: {
      electric_shower: 5500,
      furn_washer: 1000,
      furn_fridge: 300,
    },
    demandFactor: 0.7,
    routingFactor: 1.3,
    dropPerPoint: 2.2,
    // [corrente máx. (A), seção (mm²), disjuntor (A)] — cobre em eletroduto embutido, 2 condutores carregados.
    wireTable: [
      [10, 1.5, 10],
      [16, 2.5, 16],
      [25, 4, 25],
      [32, 6, 32],
      [40, 10, 40],
    ],
    waterPerPerson: 150,
    reserveDays: 2,
    personsPerBedroom: 2,
    tankSizes: [310, 500, 1000, 1500, 2000, 3000],
  },
  // NBR 7190 (coníferas): C20 fc0k 20 / fvk 4 / E0m 3500; C25 25 / 5 / 8500; C30 30 / 6 / 14500 MPa.
  // kmod = 0,7 (longa duração) × 1,0 (classe de umidade 1–2) × 0,8 (madeira de 2ª categoria) = 0,56.
  wood: {
    density: 550,
    classes: {
      C20: { fc0k: 20, fvk: 4, E0m: 3500 },
      C25: { fc0k: 25, fvk: 5, E0m: 8500 },
      C30: { fc0k: 30, fvk: 6, E0m: 14500 },
    },
    kmod: 0.56,
    gammaC: 1.4,
    gammaT: 1.8,
    gammaV: 1.8,
    indexRange: [0.035, 0.12],
    nailKgPerM: 0.02,
    nailKgPerM2Board: 0.08,
  },
  performance: {
    thermal: {
      // NBR 15220-2 (tabela B.3) e fichas de fabricantes; aço da telha desprezado, EPS como núcleo.
      materials: {
        cement_board_10: { lambda: 0.35, rho: 1300, c: 0.84 },
        osb_11: { lambda: 0.13, rho: 600, c: 1.7 },
        drywall_st_12: { lambda: 0.25, rho: 750, c: 0.84 },
        drywall_ru_12: { lambda: 0.25, rho: 800, c: 0.84 },
        siding_smart: { lambda: 0.35, rho: 1300, c: 0.84 },
        wool_pet_50: { lambda: 0.045, rho: 20, c: 1.3 },
        sandwich_eps30: { lambda: 0.035, rho: 15, c: 1.42, thickness: 30 },
        finish_ceiling_wood: { lambda: 0.15, rho: 500, c: 1.34, thickness: 10 },
        finish_ceiling_paint: { lambda: 0.25, rho: 750, c: 0.84, thickness: 12.5 },
        finish_wall_wood: { lambda: 0.15, rho: 500, c: 1.34, thickness: 10 },
        finish_facade_wood: { lambda: 0.15, rho: 500, c: 1.34, thickness: 15 },
        finish_facade_brick: { lambda: 0.9, rho: 1800, c: 0.92, thickness: 15 },
      },
      rsiWall: 0.13,
      rseWall: 0.04,
      rsiRoof: 0.17,
      rseRoof: 0.04,
      airGapR: 0.16,
      // NBR 15220-3: zona da capital.
      zoneByUF: {
        AC: 8, AL: 8, AP: 8, AM: 8, BA: 8, CE: 8, DF: 4, ES: 8, GO: 6, MA: 8, MT: 7, MS: 6, MG: 3, PA: 8,
        PB: 8, PR: 1, PE: 8, PI: 7, RJ: 8, RN: 8, RS: 3, RO: 8, RR: 8, SC: 3, SP: 3, SE: 8, TO: 7,
      },
      roofAlpha: { graphite: 0.8, black: 0.9, terracotta: 0.65, white: 0.25, green: 0.7 },
      facadeAlpha: { finish_facade_texture: 0.4, finish_facade_wood: 0.6, finish_facade_siding: 0.4, finish_facade_brick: 0.65 },
      defaultFacadeAlpha: 0.4,
      // NBR 15575-4 (paredes) e -5 (coberturas), procedimento simplificado. [α ≤ 0,6, α > 0,6]
      wallU: { '1': [2.5, 2.5], '2': [2.5, 2.5], '3': [3.7, 2.5], '4': [3.7, 2.5], '5': [3.7, 2.5], '6': [3.7, 2.5], '7': [3.7, 2.5], '8': [3.7, 2.5] },
      roofU: { '1': [2.3, 2.3], '2': [2.3, 2.3], '3': [2.3, 1.5], '4': [2.3, 1.5], '5': [2.3, 1.5], '6': [2.3, 1.5], '7': [2.3, 1.5], '8': [2.3, 1.5] },
      wallCT: { '1': 130, '2': 130, '3': 130, '4': 130, '5': 130, '6': 130, '7': 130, '8': 0 },
    },
    solar: {
      // Atlas Brasileiro de Energia Solar (2017), irradiação global horizontal média da capital.
      hspByUF: {
        AC: 4.6, AL: 5.4, AP: 4.9, AM: 4.6, BA: 5.5, CE: 5.6, DF: 5.4, ES: 5.0, GO: 5.5, MA: 5.3, MT: 5.2, MS: 5.3, MG: 5.4, PA: 4.9,
        PB: 5.6, PR: 4.7, PE: 5.6, PI: 5.7, RJ: 5.0, RN: 5.7, RS: 4.5, RO: 4.8, RR: 5.0, SC: 4.4, SP: 4.9, SE: 5.4, TO: 5.4,
      },
      kWhPerPersonMonth: 55,
      showerKWhPerPersonMonth: 30,
      moduleWp: 550,
      moduleArea: 2.58,
      performanceRatio: 0.78,
      tariff: 0.95,
      minBillKWh: 50,
    },
    rain: {
      // Normais climatológicas do INMET (capitais), arredondadas.
      mmPerYearByUF: {
        AC: 1950, AL: 2170, AP: 2500, AM: 2300, BA: 1900, CE: 1600, DF: 1500, ES: 1250, GO: 1600, MA: 2200, MT: 1350, MS: 1450, MG: 1500, PA: 2900,
        PB: 1900, PR: 1450, PE: 2300, PI: 1350, RJ: 1200, RN: 1500, RS: 1350, RO: 2200, RR: 1700, SC: 1700, SP: 1450, SE: 1500, TO: 1700,
      },
      runoff: 0.8,
      nonPotableShare: 0.4,
      reserveDays: 15,
    },
  },
  // CUB R1-N aproximado por UF (2025) ÷ SP. Só a mão de obra é ajustada.
  laborRegionalFactor: {
    AC: 1.0, AL: 0.79, AP: 0.95, AM: 0.95, BA: 0.81, CE: 0.83, DF: 0.93, ES: 0.88, GO: 0.9, MA: 0.83, MT: 0.98, MS: 0.93, MG: 0.98, PA: 0.9,
    PB: 0.79, PR: 1.05, PE: 0.83, PI: 0.81, RJ: 1.02, RN: 0.81, RS: 1.1, RO: 0.95, RR: 0.98, SC: 1.17, SP: 1.0, SE: 0.79, TO: 0.88,
  },
  floor: { hardenerKgPerM2: 4, sealerLPerM2: 0.2 },
  defaultCeilingMax: 2.8,
  terrain: { swellFactor: 1.25, compactionFactor: 0.85, truckM3: 12, excavatorM3PerDay: 250 },
  masonry: {
    blocksPerM2: 12.5,
    groutM3PerM2: 0.01,
    rebarKgPerM2: 2.5,
    stripFootingWidth: 0.4,
    stripFootingDepth: 0.3,
  },  fasteners: { blocking: 4, header: 8, joistRafterCollar: 4, purlinPerRafter: 2 },
  extras: {
    blockThickness: 0.14,
    lsfWallThickness: 0.1,
    lsfStudSpacing: 0.6,
    retainingThickness: 0.3,
    mortarM3PerM2: 0.02, // m³ por m² de alvenaria
    mortarDensity: 1900, // kg/m³
    footingSteelKgPerM: 3, // kg por m
    gradeBeam: { width: 0.15, depth: 0.3 }, // m
    postSize: { concrete: 0.12, eucalyptus: 0.12, steel: 0.06 }, // m
    barbedStrands: 5,
    guardrailHeight: 1, // m
    guardrailThickness: 0.05, // m
    deckCoverPitchDeg: 10, // graus
    deckCoverBeiral: 0.3, // m
    deckCoverClearance: 2.4, // m
    deckCoverMinClearance: 2.1, // m
    deckCoverMinPitchDeg: 3, // graus (~5%)
    deckPostSpacing: 3, // m
    deckPostSize: 0.1, // m
  },
  retaining: {
    gabionBase: 0.5, // m
    gabionBasePerHeight: 0.1, // m por m de altura
    concreteStem: 0.2, // m
    footing: { width: 0.6, depth: 0.3 }, // m
    steelKgPerM3: 80, // kg por m³ de concreto
    geotextileExtraHeight: 0.5, // m
  },
  terrainRules: {
    drainCutHeight: 1.5, // m
    steepPct: 30, // %
    cutWarnHeight: 3, // m
    fillUnderBuilding: 1, // m
    kmPerExtraTrip: 20, // km
  },
  structureFactors: {
    gammaA1: 1.1,
    gammaA2: 1.2,
    effectiveAreaFactor: 0.85,
    shearYieldFactor: 0.6,
    psiWind: 0.6,
    psiLive: 0.5,
  },
  warnings: { modulationMax: 0.1, mezzRoofMin: 2.0, mezzUnderMin: 2.3 }, // m
  productivity: {
    layoutBaseHh: 6,
    layoutPerMeterHh: 0.4, // por m de perímetro
    embeddedBaseHh: 4,
    embeddedPerPointHh: 3, // por ponto de esgoto/água
    radierPerM2Hh: 0.9,
    wallPerPieceHh: 0.1,
    wallPerOpeningHh: 1.5,
    wallPerPanelHh: 3,
    mezzaninePerM2Hh: 1.6,
    roofPerPieceHh: 0.12,
    roofCladdingPerM2Hh: 0.35,
    exteriorClosurePerM2Hh: 0.9,
    servicesPerM2BuiltHh: 0.8,
    interiorClosurePerM2Hh: 0.8,
    floorPerM2Hh: 0.5,
    finishingPerM2BuiltHh: 1.2,
  },
  leadTimes: {
    steelProfile: { days: 21, note: 'Perfis LSF costumam ser cortados e conformados sob encomenda: 15 a 30 dias.' },
    concrete: { days: 3, note: 'Concreto usinado: agendar a concretagem com 3 a 5 dias de antecedência.' },
    hardware: { days: 7, note: 'Parafusos, chumbadores e hold-downs: 5 a 10 dias, conferir estoque do fornecedor.' },
    foundationMaterial: { days: 3, note: 'Material de fundação em estoque no varejo: 1 a 5 dias.' },
  },
};
