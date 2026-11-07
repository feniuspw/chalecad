import { Catalog } from '@chalecad/catalog';

const profile = (id: string, family: 'Ue' | 'U' | 'Cr', web: number, flange: number, lip: number, t: number) => ({
  id,
  family,
  name: id,
  web,
  flange,
  lip,
  thickness: t,
  massPerM: 1.4,
  area: 1.8,
  Ix: 20,
  Wx: 4,
  Iy: 3,
  Wy: 1,
  rx: 3.3,
  ry: 1.3,
  fy: 230,
  barLengths: [3, 6],
  priceItemIds: [`bar-${id}-3m`, `bar-${id}-6m`],
});

const material = (id: string) => ({
  id,
  name: id,
  category: 'misc' as const,
  baseUnit: 'm2' as const,
  purchase: { label: 'un', size: 1, integer: true },
  wastePct: 5,
  massPerUnit: 1,
  priceItemId: `item-${id}`,
});

const layer = (materialId: string, thickness: number, face: 'ext' | 'core' | 'int' | 'both') => ({
  materialId,
  thickness,
  face,
  consumptionPerM2: 1,
  stage: 'closure' as const,
});

/** Catálogo mínimo, montado à mão, só para os testes de geometria do motor. */
export const testCatalog: Catalog = Catalog.parse({
  version: 'test',
  profiles: [
    profile('Ue90x40x0.95', 'Ue', 90, 40, 12, 0.95),
    profile('U90x40x0.95', 'U', 90, 40, 0, 0.95),
    profile('Ue140x40x0.95', 'Ue', 140, 40, 12, 0.95),
    profile('Ue200x40x1.25', 'Ue', 200, 40, 12, 1.25),
    profile('U200x40x1.25', 'U', 200, 40, 0, 1.25),
    profile('Cr50x0.95', 'Cr', 30, 20, 12, 0.95),
  ],
  materials: ['cement_board_10', 'osb_11', 'wool_pet_50', 'drywall_st_12', 'drywall_ru_12', 'glass_gable', 'sandwich_eps30', 'osb_18'].map(material),
  assemblies: [
    {
      id: 'ext_cement_osb_wool_drywall',
      name: 'Parede externa',
      kind: 'wall_exterior',
      layers: [
        layer('cement_board_10', 10, 'ext'),
        layer('osb_11', 11.1, 'ext'),
        layer('wool_pet_50', 50, 'core'),
        layer('drywall_st_12', 12.5, 'int'),
      ],
    },
    {
      id: 'int_drywall_wool_drywall',
      name: 'Parede interna',
      kind: 'wall_interior',
      layers: [layer('drywall_st_12', 12.5, 'both'), layer('wool_pet_50', 50, 'core')],
    },
    {
      id: 'wet_cement_drywall_rh',
      name: 'Parede molhada',
      kind: 'wall_wet',
      layers: [layer('drywall_ru_12', 12.5, 'int'), layer('cement_board_10', 10, 'ext'), layer('wool_pet_50', 50, 'core')],
    },
    { id: 'gable_glazed', name: 'Empena envidraçada', kind: 'gable_glazed', layers: [layer('glass_gable', 10, 'ext')] },
    { id: 'roof_sandwich_eps30', name: 'Telhado', kind: 'roof', layers: [layer('sandwich_eps30', 30, 'ext')] },
    { id: 'floor_osb18', name: 'Piso', kind: 'floor', layers: [layer('osb_18', 18, 'ext')] },
  ],
  priceBooks: [{ id: 'default-2026-11', name: 'Vazio', date: '2026-11-01', uf: 'BR', items: [], labor: [] }],
  constants: {
    steelDensity: 7850,
    concreteDensity: 2500,
    steelE: 200000,
    steelIndexRange: [21.9, 24.7],
    sawKerf: 0.003,
    priceStaleDays: 90,
    lsf: { blockingSpacing: 1.4, anchorSpacing: 0.8, screwsPerStud: 4, holdDownOpeningMin: 1.5, maxPanelLength: 6, headerBearing: 0.04 },
    roof: { sandwichUsefulWidth: 0.98, purlinSpacing: 1.2, rafterSpacing: 0.6, screwsPerM2: 4, ridgeCapLength: 1.0, flashingLength: 3.0, gutterLength: 3.0 },
    radier: { gravelThickness: 0.05, meshOverlapFactor: 1.15, formHeight: 0.3, lonaOverlapFactor: 1.1, floorJointSpacing: 4, edgeBeamWidth: 0.25 },
    loads: {
      liveMezzanine: 1.5, liveRoof: 0.25, superimposedRoof: 0.15, superimposedFloor: 0.5,
      gammaG: 1.4, gammaQ: 1.5, gammaW: 1.4, cpeWall: 0.8, cpeRoofUplift: 1.2, cpi: 0.2,
      s2ByCategory: [1.06, 1.0, 0.94, 0.86, 0.74], s1: 1, s3: 1,
    },
    deflection: { floor: 350, roof: 250, header: 350 },
    usage: { warn: 0.7, fail: 1.0 },
    anchorage: { anchorKN: 6, holdDownKN: 15 },
    bracingMinRatio: 0.3,
    stairs: { idealRiser: 0.18, maxRiser: 0.19, going: 0.27, ladderGoing: 0.2, treadThickness: 0.04, blondelMin: 0.62, blondelMax: 0.65 },
    defaultCeilingMax: 2.8,
    terrain: { swellFactor: 1.25, compactionFactor: 0.85, truckM3: 12, excavatorM3PerDay: 250 },
    masonry: { blocksPerM2: 12.5, groutM3PerM2: 0.01, rebarKgPerM2: 2.5, stripFootingWidth: 0.4, stripFootingDepth: 0.3 },
  },
});
