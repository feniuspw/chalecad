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
  // NBR 5410:2004 e NBR ISO/CIE 8995-1. Valores e fontes: docs/research/eletrica.md (tabelas de capacidade e queda
  // conforme Guia Prysmian/Procobre; demanda e categorias de entrada são genéricas, confirmar com a concessionária).
  electrical: {
    normEdition: 'NBR 5410:2004',
    loads: {
      lighting: { baseVA: 100, baseArea: 6, stepVA: 60, stepArea: 4 },
      sockets: { generalVA: 100, wetVA: 600, wetHighCount: 3, perimeterStep: { wet: 3.5, other: 5 }, bathSocketMinDistFromShower: 0.6, counterSockets: 2 },
      tueSeparateAboveA: 10,
      circuitMaxA: { lighting: 10, sockets: 10, wet_sockets: 16 },
    },
    appliances: {
      electric_shower: { w: 5500, pf: 1, voltage: 'FF', curve: 'B', label: 'Chuveiro elétrico' },
      electric_faucet: { w: 4500, pf: 1, voltage: 'FF', curve: 'B', label: 'Torneira elétrica' },
      oven: { w: 2500, pf: 1, label: 'Forno elétrico' },
      cooktop_induction: { w: 6000, pf: 0.98, voltage: 'FF', label: 'Cooktop de indução' },
      microwave: { w: 1400, pf: 0.95, label: 'Micro-ondas' },
      dishwasher: { w: 1800, pf: 0.95, label: 'Lava-louças' },
      washer: { w: 1200, pf: 0.9, label: 'Máquina de lavar' },
      dryer: { w: 3000, pf: 1, label: 'Secadora' },
      ac_9k: { w: 950, pf: 0.92, curve: 'C', label: 'Ar-condicionado 9.000 BTU' },
      ac_12k: { w: 1300, pf: 0.92, curve: 'C', label: 'Ar-condicionado 12.000 BTU' },
      ac_18k: { w: 1900, pf: 0.92, curve: 'C', label: 'Ar-condicionado 18.000 BTU' },
      fridge: { w: 300, pf: 0.8, label: 'Geladeira' },
      pump_half_hp: { w: 750, pf: 0.8, curve: 'C', label: 'Bomba / pressurizador ½ cv' },
    },
    applianceByFurniture: { furn_washer: 'washer', furn_fridge: 'fridge' },
    // [seção, B1 2c, B1 3c, B2 2c, B2 3c, A1 2c, A1 3c]
    ampacity: [
      [1.5, 17.5, 15.5, 16.5, 15, 14.5, 13.5],
      [2.5, 24, 21, 23, 20, 19.5, 18],
      [4, 32, 28, 30, 27, 26, 24],
      [6, 41, 36, 38, 34, 34, 31],
      [10, 57, 50, 52, 46, 46, 42],
      [16, 76, 68, 69, 62, 61, 56],
      [25, 101, 89, 90, 80, 80, 73],
      [35, 125, 110, 111, 99, 99, 89],
    ],
    tempFactor: { '10': 1.22, '15': 1.17, '20': 1.12, '25': 1.06, '30': 1, '35': 0.94, '40': 0.87, '45': 0.79, '50': 0.71 },
    groupingFactor: [1, 0.8, 0.7, 0.65, 0.6, 0.57, 0.54, 0.52, 0.5],
    minSection: { lighting: 1.5, power: 2.5 },
    resistance20: { '1.5': 13.3, '2.5': 7.98, '4': 4.95, '6': 3.3, '10': 1.91, '16': 1.21, '25': 0.78, '35': 0.554 },
    resistanceTempFactor70: 1.196,
    voltageDrop: { terminalMaxPct: 4, totalMaxPct: 5, warnAtPct: 3 },
    breakers: { ratings: [6, 10, 13, 16, 20, 25, 32, 40, 50, 63, 70, 80, 100], defaultCurve: 'C' },
    dr: { sensitivityMa: 30, ratings: [25, 40, 63, 80], excludeLightingAboveM: 2.5, requiredRoomUses: ['bathroom', 'kitchen', 'laundry'], maxCircuitsPerDr: 5 },
    dps: { ucByVoltage: { '127': 175, '220': 275 }, inKa: 10 },
    panelReserves: [
      [6, 2],
      [12, 3],
      [30, 4],
      [999, 0.15],
    ],
    panelSizes: [8, 12, 18, 24, 36, 48],
    conduit: {
      fillMax: { one: 0.53, two: 0.31, many: 0.4 },
      maxStraight: 15,
      reducePerBend90: 3,
      maxBends90: 3,
      sizes: [
        { dn: 16, di: 11.5 },
        { dn: 20, di: 15 },
        { dn: 25, di: 19.5 },
        { dn: 32, di: 25.5 },
        { dn: 40, di: 32.5 },
      ],
      minDn: 20,
      wastePct: 0.08,
    },
    cableOuterDiameter: { '1.5': 3, '2.5': 3.6, '4': 4.2, '6': 4.7, '10': 6.1, '16': 7.2, '25': 8.9, '35': 10.2 },
    cable: { slackPerBoxM: 0.3, wastePct: 0.1 },
    heights: { low: 0.3, mid: 1.1, high: 2.2, switch: 1.1, wallLight: 2, panel: 1.5 },
    switchOffsetFromJamb: 0.15,
    demand: {
      lightingSockets: [
        [1, 0.86],
        [2, 0.75],
        [3, 0.66],
        [4, 0.59],
        [5, 0.52],
        [6, 0.45],
        [7, 0.4],
        [8, 0.35],
        [9, 0.31],
        [10, 0.27],
        [999, 0.24],
      ],
      heating: [1, 1, 0.84, 0.76, 0.7, 0.65, 0.6, 0.57, 0.54, 0.52],
    },
    entranceCategories: [
      { code: 'M (monofásica)', phases: 1, maxKw: 10, breakerA: 50, cableMm2: 10 },
      { code: 'B (bifásica)', phases: 2, maxKw: 20, breakerA: 63, cableMm2: 16 },
      { code: 'T (trifásica)', phases: 3, maxKw: 75, breakerA: 100, cableMm2: 35 },
    ],
    voltageByUF: {
      AC: 127, AM: 127, AP: 127, ES: 127, MG: 127, MS: 127, MT: 127, PA: 127, PR: 127, RJ: 127, RO: 127, RR: 127, SP: 127, SE: 127,
      RS: 220, SC: 220, BA: 220, AL: 220, CE: 220, DF: 220, GO: 220, MA: 220, PB: 220, PE: 220, PI: 220, RN: 220, TO: 220,
    },
    lighting: {
      // NBR ISO/CIE 8995-1:2013: sala 150-300, cozinha geral 300 (bancada 500 com luz localizada), escritório 500, banheiro (espelho) 300, quarto 150, circulação/escada 100-150
      targetLux: { living: 200, kitchen: 300, bedroom: 150, bathroom: 300, laundry: 200, circulation: 150, storage: 100, office: 500, other: 150 },
      minLux: { living: 150, kitchen: 200, bedroom: 100, bathroom: 200, laundry: 150, circulation: 100, storage: 75, office: 300, other: 100 },
      workPlane: { living: 0.75, kitchen: 0.9, bedroom: 0.75, bathroom: 0.9, laundry: 0.9, circulation: 0, storage: 0, office: 0.75, other: 0.75 },
      maintenanceFactor: 0.8,
      utilization: [
        [0.6, 0.36],
        [0.8, 0.44],
        [1, 0.5],
        [1.25, 0.56],
        [1.5, 0.6],
        [2, 0.66],
        [2.5, 0.7],
        [3, 0.73],
        [4, 0.77],
        [5, 0.8],
      ],
      spacingToHeight: 1.4,
      ledPowerFactor: 0.92,
    },
    luminaires: [
      { id: 'plafon_18w', label: 'Plafon LED 18 W', type: 'plafon', watts: 18, lumens: 1600, cct: 3000, priceItem: 'lum_plafon_18w' },
      { id: 'plafon_24w', label: 'Plafon LED 24 W', type: 'plafon', watts: 24, lumens: 2200, cct: 3000, priceItem: 'lum_plafon_24w' },
      { id: 'downlight_12w', label: 'Embutido LED 12 W', type: 'downlight', watts: 12, lumens: 1000, cct: 3000, priceItem: 'lum_downlight_12w' },
      { id: 'spot_6w', label: 'Spot GU10 6 W', type: 'spot', watts: 6, lumens: 480, cct: 2700, beamAngle: 36, priceItem: 'lum_spot_6w' },
      { id: 'pendant_9w', label: 'Pendente 9 W', type: 'pendant', watts: 9, lumens: 560, cct: 2700, priceItem: 'lum_pendant_9w' },
      { id: 'wall_8w', label: 'Arandela 8 W', type: 'wall', watts: 8, lumens: 600, cct: 3000, priceItem: 'lum_wall_8w' },
      { id: 'strip_10w', label: 'Fita LED 10 W/m (1 m)', type: 'strip', watts: 10, lumens: 900, cct: 3000, priceItem: 'lum_strip_10w' },
      { id: 'flood_30w', label: 'Refletor externo 30 W', type: 'flood', watts: 30, lumens: 2700, cct: 4000, priceItem: 'lum_flood_30w' },
    ],
    defaultLuminaire: 'plafon_18w',
  },
  // NBR 5626 (método dos pesos), NBR 8160, NBR 7229. Valores e fontes: docs/research/hidraulica.md.
  plumbing: {
    kPaPerMca: 9.80665,
    water: {
      simultaneityC: 0.3,
      minDynamicKpa: { default: 10, toilet_tank: 5, network: 5 },
      maxStaticKpa: 400,
      maxVelocity: 3,
      velocityTarget: 2,
      fixtures: {
        toilet_tank: { label: 'Bacia com caixa acoplada', q: 0.15, w: 0.3, wHot: 0, dnMin: 20, uhc: 6, sewerDn: 100, waterH: 0.25, sewerH: 0 },
        lavatory: { label: 'Lavatório', q: 0.15, w: 0.3, qHot: 0.2, wHot: 0.5, dnMin: 20, uhc: 1, sewerDn: 40, waterH: 0.6, sewerH: 0.5 },
        shower_electric: { label: 'Chuveiro elétrico', q: 0.1, w: 0.1, wHot: 0, dnMin: 20, uhc: 2, sewerDn: 40, waterH: 2.1, sewerH: 0, minKpa: 10, pressureValve: true },
        shower_mixer: { label: 'Chuveiro misturador', q: 0.2, w: 0.4, qHot: 0.2, wHot: 0.5, dnMin: 20, uhc: 2, sewerDn: 40, waterH: 2.2, sewerH: 0, minKpa: 10, pressureValve: true },
        kitchen_sink: { label: 'Pia de cozinha', q: 0.25, w: 0.7, qHot: 0.25, wHot: 0.7, dnMin: 20, uhc: 3, sewerDn: 50, waterH: 0.6, sewerH: 0.55 },
        laundry_tub: { label: 'Tanque', q: 0.25, w: 0.7, wHot: 0, dnMin: 25, uhc: 3, sewerDn: 40, waterH: 1, sewerH: 0.55 },
        washing_machine: { label: 'Máquina de lavar', q: 0.3, w: 1, wHot: 0, dnMin: 25, uhc: 3, sewerDn: 50, waterH: 1, sewerH: 0.8 },
        bathtub: { label: 'Banheira', q: 0.3, w: 1, qHot: 0.3, wHot: 1, dnMin: 20, uhc: 2, sewerDn: 40, waterH: 0.7, sewerH: 0 },
        garden_tap: { label: 'Torneira de jardim', q: 0.2, w: 0.4, wHot: 0, dnMin: 20, uhc: 0, waterH: 0.6 },
      },
      fixtureByFurniture: {
        furn_toilet: 'toilet_tank',
        furn_bath_sink: 'lavatory',
        furn_shower: 'shower_electric',
        furn_kitchen_sink: 'kitchen_sink',
        furn_tank: 'laundry_tub',
        furn_washer: 'washing_machine',
        furn_bathtub: 'bathtub',
      },
      pipes: {
        pvc_soldavel: {
          label: 'PVC soldável',
          hot: false,
          sizes: [
            { dn: 20, di: 0.017 },
            { dn: 25, di: 0.0216 },
            { dn: 32, di: 0.0278 },
            { dn: 40, di: 0.0352 },
            { dn: 50, di: 0.044 },
          ],
        },
        ppr_pn20: {
          label: 'PPR PN20 (água quente)',
          hot: true,
          sizes: [
            { dn: 20, di: 0.0132 },
            { dn: 25, di: 0.0166 },
            { dn: 32, di: 0.0212 },
            { dn: 40, di: 0.0266 },
          ],
        },
      },
      fwh: { cold: { k: 0.000869, qExp: 1.75, dExp: 4.75 }, hot: { k: 0.000701, qExp: 1.75, dExp: 4.75 } },
      leq: {
        dn: [20, 25, 32, 40, 50],
        elbow90: [1.1, 1.2, 1.5, 2, 3.2],
        elbow45: [0.4, 0.5, 0.7, 1, 1],
        teeStraight: [0.7, 0.8, 0.9, 1.5, 2.2],
        teeBranch: [2.3, 2.4, 3.1, 4.6, 7.3],
        entrance: [0.3, 0.4, 0.5, 0.6, 1],
        gateValve: [0.1, 0.2, 0.3, 0.4, 0.7],
        pressureValve: [11.1, 11.4, 15, 22, 35.8],
      },
      reservoir: { litersPerPerson: 150, reserveDays: 2, minLiters: 500, tankSizes: [500, 750, 1000, 1500, 2000, 3000] },
      atticTankRise: 0.3,
    },
    sewer: {
      slopeMin: { upTo75: 0.02, from100: 0.01 },
      slopeMax: 0.05,
      branchMaxUhc: { '40': 3, '50': 6, '75': 20, '100': 160 },
      stackMaxUhc: { '40': 4, '50': 10, '75': 30, '100': 240 },
      ventMaxDistance: { '40': 1, '50': 1.2, '75': 1.8, '100': 2.4 },
      ventTerminalAboveRoof: 0.3,
      siphonBoxMaxUhc: 6,
      inspection: { maxDepth: 1, maxSpacing: 25, maxFromTrap: 10 },
      startDepth: 0.3,
    },
    septic: {
      contributionLpd: 130,
      sludgeLf: 1,
      detention: [
        [1500, 1],
        [3000, 0.92],
        [4500, 0.83],
        [6000, 0.75],
        [7500, 0.67],
        [9000, 0.58],
        [99999, 0.5],
      ],
      sludgeK: 105,
    },
    colors: { cold: '#1E88E5', hot: '#E53935', sewer: '#6D4C41', vent: '#43A047' },
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
    guardrailHeight: 1.1, // m (NBR 14718: guarda-corpo com 1,10 m)
    guardrailThickness: 0.05, // m
    deckCoverPitchDeg: 10, // graus
    deckCoverBeiral: 0.3, // m
    deckCoverClearance: 2.4, // m
    deckCoverMinClearance: 2.1, // m
    deckCoverMinPitchDeg: 3, // graus (~5%)
    deckPostSpacing: 3, // m
    deckPostSize: 0.1, // m
    deck: {
      stepBelowFloor: 0.03, // m: soleira 3 cm acima do deck
      board: { thickness: 0.025, width: 0.1, gap: 0.005 }, // m: tábua 25 × 100 mm, junta 5 mm
      joist: { spacing: 0.45, width: 0.05, depth: 0.15, maxSpan: 2.2 }, // m: barrote 5 × 15 cm (madeira classe D40)
      beam: { width: 0.075, depth: 0.2, maxSpan: 1.8 }, // m: viga 7,5 × 20 cm
      ledger: { width: 0.05, depth: 0.15 }, // m
      support: { size: { wood: 0.1, steel: 0.1, concrete: 0.2 }, woodMaxHeight: 2.5, steelMaxHeight: 3.5 }, // m
      braceHeight: 1.2, // m
      footing: { padWidth: 0.5, padDepth: 0.25, padEmbed: 0.6, boredDiameter: 0.25, boredDepth: 1.5, boredSlopePct: 25 },
      guardrailDrop: 1, // m: acima de 1 m de desnível (prática corrente; conferir código de obras)
      stair: { riserMax: 0.18, riserMin: 0.15, treadMin: 0.28, blondelMin: 0.63, blondelMax: 0.65, singleStepMax: 0.2 }, // m (NBR 9050)
      liveLoadKPa: 2, // kN/m² (NBR 6120: terraço/varanda residencial)
      deadLoadKPa: 0.5, // kN/m²
    },
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
    retainingCutHeight: 1.5, // m: corte acima disso pede muro (talude 1:1 alto e instável sem proteção)
    retainingFillHeight: 1, // m: aterro sem contenção acima disso exige compactação/talude longo
    retainingMinLength: 1, // m
    retainingBlockMaxHeight: 2, // m
    retainingConcreteMaxHeight: 4, // m
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
  // Fonte: docs/research/aprovacao.md (2026-11). `confirmed: false` = edição ou conteúdo a conferir.
  approval: {
    norms: [
      { id: 'lei6496', code: 'Lei 6.496', edition: '1977', title: 'Anotação de Responsabilidade Técnica (ART)', confirmed: true },
      { id: 'confea1137', code: 'Resolução Confea 1.137', edition: '2023', title: 'ART, acervo técnico e CAT', confirmed: true, note: 'Atualização dos modelos do Anexo I aprovada em 12/2025: conferir o formulário do Crea.' },
      { id: 'lei12378', code: 'Lei 12.378', edition: '2010', title: 'Arquitetura e urbanismo; RRT (arts. 45 a 50)', confirmed: true },
      { id: 'cau91', code: 'Resolução CAU/BR 91', edition: '2014', title: 'Registro de Responsabilidade Técnica (RRT)', confirmed: true, note: 'Alterada pelas Resoluções 166/2018 e 184/2019.' },
      { id: 'nbr6492', code: 'ABNT NBR 6492', edition: '2021', title: 'Documentação técnica para projetos arquitetônicos e urbanísticos', confirmed: true },
      { id: 'nbr16636', code: 'ABNT NBR 16636-2', edition: '2017', title: 'Elaboração e desenvolvimento de projetos arquitetônicos', confirmed: false },
      { id: 'nbr10068', code: 'ABNT NBR 10068', edition: '1987', title: 'Folha de desenho: leiaute e dimensões', confirmed: false },
      { id: 'nbr10582', code: 'ABNT NBR 10582', edition: '1988', title: 'Apresentação da folha para desenho técnico', confirmed: false },
      { id: 'nbr13142', code: 'ABNT NBR 13142', edition: '1999', title: 'Dobramento de cópia', confirmed: false },
      { id: 'nbr16970', code: 'ABNT NBR 16970-1/2/3', edition: '2022', title: 'Light steel framing (desempenho, projeto estrutural, interfaces)', confirmed: true },
      { id: 'nbr14762', code: 'ABNT NBR 14762', edition: '2010', title: 'Dimensionamento de estruturas de aço constituídas por perfis formados a frio', confirmed: false },
      { id: 'nbr15253', code: 'ABNT NBR 15253', edition: '2014', title: 'Perfis de aço formados a frio para painéis reticulados (LSF)', confirmed: false },
      { id: 'nbr7190', code: 'ABNT NBR 7190-1', edition: '2022', title: 'Projeto de estruturas de madeira: critérios de dimensionamento', confirmed: true },
      { id: 'nbr6120', code: 'ABNT NBR 6120', edition: '2019', title: 'Ações para o cálculo de estruturas de edificações', confirmed: false },
      { id: 'nbr6123', code: 'ABNT NBR 6123', edition: '1988', title: 'Forças devidas ao vento em edificações', confirmed: false },
      { id: 'nbr8681', code: 'ABNT NBR 8681', edition: '2003', title: 'Ações e segurança nas estruturas', confirmed: false },
      { id: 'nbr6122', code: 'ABNT NBR 6122', edition: '2022', title: 'Projeto e execução de fundações', confirmed: false },
      { id: 'nbr6118', code: 'ABNT NBR 6118', edition: '2023', title: 'Projeto de estruturas de concreto', confirmed: false },
      { id: 'nbr6484', code: 'ABNT NBR 6484', edition: '2020', title: 'Solo: sondagem de simples reconhecimento com SPT', confirmed: false },
      { id: 'nbr8036', code: 'ABNT NBR 8036', edition: '1983', title: 'Programação de sondagens de simples reconhecimento', confirmed: false },
      { id: 'nbr15575', code: 'ABNT NBR 15575', edition: '2021', title: 'Edificações habitacionais: desempenho', confirmed: false },
      { id: 'nbr5410', code: 'ABNT NBR 5410', edition: '2004 (versão corrigida 2008)', title: 'Instalações elétricas de baixa tensão', confirmed: true },
      { id: 'nbr14136', code: 'ABNT NBR 14136', edition: '2012', title: 'Plugues e tomadas para uso doméstico', confirmed: false },
      { id: 'nbr5626', code: 'ABNT NBR 5626', edition: '2020', title: 'Sistemas prediais de água fria e água quente', confirmed: false },
      { id: 'nbr8160', code: 'ABNT NBR 8160', edition: '1999', title: 'Sistemas prediais de esgoto sanitário', confirmed: false },
      { id: 'nbr10844', code: 'ABNT NBR 10844', edition: '1989', title: 'Instalações prediais de águas pluviais', confirmed: false },
      { id: 'nbr17076', code: 'ABNT NBR 17076', edition: '2024', title: 'Tratamento local de esgoto (substitui NBR 7229 e NBR 13969)', confirmed: false, note: 'Fórmulas e distâncias ainda não conferidas: o tanque é dimensionado pela NBR 7229 (legado) para comparação.' },
      { id: 'nbr14718', code: 'ABNT NBR 14718', edition: '2019', title: 'Esquadrias: guarda-corpos para edificação', confirmed: false },
      { id: 'nbr9077', code: 'ABNT NBR 9077', edition: '2001', title: 'Saídas de emergência em edifícios (escadas)', confirmed: false },
      { id: 'nbr7199', code: 'ABNT NBR 7199', edition: '2016', title: 'Vidros na construção civil: projeto, execução e aplicações', confirmed: false },
      { id: 'nbr9050', code: 'ABNT NBR 9050', edition: '2020', title: 'Acessibilidade', confirmed: false },
      { id: 'nbr11682', code: 'ABNT NBR 11682', edition: '2009', title: 'Estabilidade de encostas (contenções)', confirmed: false },
      { id: 'nbr15220', code: 'ABNT NBR 15220-3', edition: '2005', title: 'Zoneamento bioclimático', confirmed: false },
      { id: 'municipal', code: 'Legislação municipal', edition: '—', title: 'Plano diretor, zoneamento e código de obras do município', confirmed: false },
    ],
    sheetFormats: [
      { id: 'A0', w: 1189, h: 841, marginLeft: 25, margin: 10 },
      { id: 'A1', w: 841, h: 594, marginLeft: 25, margin: 10 },
      { id: 'A2', w: 594, h: 420, marginLeft: 25, margin: 7 },
      { id: 'A3', w: 420, h: 297, marginLeft: 25, margin: 7 },
      { id: 'A4', w: 297, h: 210, marginLeft: 25, margin: 7 },
    ],
    titleBlock: { width: 175, minHeight: 90, approvalBox: { w: 100, h: 70 } },
    scales: [1, 2, 5, 10, 20, 25, 50, 75, 100, 125, 200, 250, 500, 1000, 2000],
    artActivities: [
      { discipline: 'architecture', council: 'CAU', activity: 'Projeto arquitetônico de edificação residencial unifamiliar', unit: 'm²', quantity: 'built_area' },
      { discipline: 'architecture', council: 'CREA', activity: 'Projeto de edificação residencial unifamiliar (arquitetônico)', unit: 'm²', quantity: 'built_area' },
      { discipline: 'structure', council: 'any', activity: 'Projeto estrutural de edificação em perfis leves de aço formados a frio (light steel framing)', unit: 'm²', quantity: 'built_area' },
      { discipline: 'foundation', council: 'any', activity: 'Projeto de fundação rasa em radier de concreto armado', unit: 'm²', quantity: 'radier_area' },
      { discipline: 'electrical', council: 'any', activity: 'Projeto de instalações elétricas prediais de baixa tensão', unit: 'kVA', quantity: 'installed_kva' },
      { discipline: 'plumbing', council: 'any', activity: 'Projeto de instalações hidrossanitárias prediais (água fria, água quente, esgoto e ventilação)', unit: 'm²', quantity: 'built_area' },
      { discipline: 'plumbing', council: 'any', activity: 'Projeto de sistema local de tratamento de esgoto (tanque séptico e disposição final)', unit: 'm³', quantity: 'septic_volume' },
      { discipline: 'execution', council: 'any', activity: 'Execução de obra de edificação residencial unifamiliar', unit: 'm²', quantity: 'built_area' },
    ],
    stages: [
      { id: 'preliminary', label: 'Estudo preliminar', code: 'EP' },
      { id: 'draft', label: 'Anteprojeto', code: 'AP' },
      { id: 'legal', label: 'Projeto legal', code: 'PL' },
      { id: 'executive', label: 'Projeto executivo', code: 'PE' },
    ],
  },
};
