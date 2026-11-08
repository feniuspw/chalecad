import type { LaborRate, PriceBook, PriceItem } from '../schema';
import { furniture } from './furniture';
import { materials } from './materials';
import { profiles } from './profiles';

const DATE = '2026-11-01';
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Preços de barra de 6 m a 0,95 mm [min, max?] por alma (spec: Ue90 112–135, U90 103–111, Ue140 144, Ue200 180). */
const UE_6M: Record<number, [number, number?]> = { 90: [112, 135], 140: [144], 200: [180], 250: [215] };
const U_6M: Record<number, [number, number?]> = { 90: [103, 111], 140: [132], 200: [165], 250: [198] };
const T_FACTOR: Record<number, number> = { 0.8: 0.86, 0.95: 1, 1.25: 1.3 };
const BAR_3M_FACTOR = 0.55;
const STEEL_BRL_PER_KG = 13.5;
const WOOD_BRL_PER_M: Record<string, [number, number]> = {
  W38x89: [14, 19],
  W38x140: [22, 30],
  W38x184: [30, 40],
  W38x235: [40, 55],
  W25x50: [4, 6],
};

/** Materiais: [preço, preço máx?] por unidade de compra. */
const MATERIAL_PRICES: Record<string, [number, number?]> = {
  nail_wood: [28, 38],
  pvc_sewer_40: [38, 55],
  ppr_hot_25: [42, 60],
  wire_1_5: [180, 240],
  wire_2_5: [280, 360],
  wire_4: [450, 560],
  wire_6: [650, 820],
  wire_10: [1100, 1400],
  conduit_25: [70, 100],
  box_4x2: [6, 10],
  outlet_2pt: [18, 30],
  outlet_20a: [22, 35],
  switch_simple: [15, 25],
  light_fixture: [45, 90],
  breaker: [18, 30],
  breaker_dr: [160, 240],
  panel_box: [140, 220],
  water_valve: [60, 110],
  pipe_fittings: [35, 60],
  siphon_box: [40, 70],
  water_tank_310: [280, 380],
  water_tank_500: [380, 480],
  water_tank_1000: [550, 720],
  water_tank_1500: [850, 1100],
  water_tank_2000: [1100, 1400],
  water_tank_3000: [1600, 2100],
  gas_heater: [1400, 2200],
  solar_heater: [3500, 5500],
  finish_floor_porcelain: [95, 140],
  finish_floor_ceramic: [55, 75],
  finish_floor_vinyl: [85, 120],
  finish_floor_laminate: [65, 90],
  finish_floor_wood: [230, 320],
  finish_wall_paint: [18, 25],
  finish_wall_wood: [75, 110],
  finish_wall_tile: [60, 90],
  finish_facade_texture: [28, 40],
  finish_facade_wood: [120, 170],
  finish_facade_siding: [70, 95],
  finish_facade_brick: [95, 130],
  finish_ceiling_wood: [70, 100],
  finish_ceiling_paint: [18, 25],
  cement_board_10: [138.24],
  osb_11: [95],
  osb_18: [168],
  drywall_st_12: [89],
  drywall_ru_12: [112],
  siding_smart: [95],
  membrane: [280],
  wool_pet_50: [390],
  joint_tape: [14],
  joint_compound: [52],
  basecoat: [38],
  screw_board: [28],
  screw_frame: [32],
  anchor_bolt: [9.5],
  hold_down: [68],
  sandwich_eps30: [80, 160],
  ridge_cap: [58],
  flashing: [96],
  gutter: [84],
  screw_roof: [120],
  concrete_fck25: [520],
  mesh_q138: [118],
  lona_200: [190],
  gravel_1: [140],
  edge_form: [30],
  floor_hardener: [95],
  sealer: [210],
  joint_cut: [12],
  pvc_sewer_100: [120],
  pvc_water_25: [26],
  guardrail: [480],
  stair_tread: [140],
  ladder: [220],
  door_ext: [1450],
  door_int: [520],
  window_alu: [1100],
  sliding_door: [1600],
  skylight: [1900],
  glass_gable: [650],
  block_concrete: [4.5],
  block_structural: [6.2],
  grout: [480],
  rebar_ca50: [9.5],
  mortar: [22],
  post_concrete: [85],
  post_eucalyptus: [45],
  post_steel: [95],
  fence_welded: [780],
  fence_chain: [650],
  barbed_wire: [320],
  deck_wood: [280],
  deck_frame: [150],
  excavator_day: [1600, 2600],
  truck_trip: [350],
  gabion: [480],
  geotextile: [6],
  drain_pipe: [18],
};

function item(
  itemId: string,
  name: string,
  unit: string,
  [price, priceMax]: [number, number?],
  sourceNote?: string,
): PriceItem {
  const it: PriceItem = {
    itemId,
    name,
    unit,
    price: r2(price),
    date: DATE,
    source: 'reference',
    uf: 'BR',
  };
  if (priceMax !== undefined) it.priceMax = r2(priceMax);
  if (sourceNote) it.sourceNote = sourceNote;
  return it;
}

function scale([p, pm]: [number, number?], f: number): [number, number?] {
  return pm === undefined ? [p * f] : [p * f, pm * f];
}

const items: PriceItem[] = [];

for (const p of profiles) {
  if (p.family === 'Ue' || p.family === 'U') {
    const table = p.family === 'Ue' ? UE_6M : U_6M;
    const base = table[p.web];
    const tf = T_FACTOR[p.thickness];
    if (!base || tf === undefined) throw new Error(`Sem preço de referência para ${p.id}`);
    const six = scale(base, tf);
    const note = 'Spec: preços de referência nov/2026 (demais espessuras e comprimentos escalados)';
    p.barLengths.forEach((len, i) => {
      const id = p.priceItemIds[i];
      if (!id) return;
      items.push(item(id, `${p.name} barra ${len} m`, `barra ${len} m`, len === 6 ? six : scale(six, BAR_3M_FACTOR), note));
    });
  } else if (p.family === 'Wood') {
    // Pinus autoclavado: R$/m por seção (varejo nov/2026), peça de 6 m ~10% mais cara por metro.
    const perM = WOOD_BRL_PER_M[p.id];
    if (!perM) throw new Error(`Sem preço de referência para ${p.id}`);
    p.barLengths.forEach((len, i) => {
      const id = p.priceItemIds[i];
      if (!id) return;
      const f = len >= 6 ? 1.1 : 1;
      items.push(item(id, `${p.name} peça ${len} m`, `peça ${len} m`, scale(perM.map((x) => x * len) as [number, number?], f)));
    });
  } else if (p.family === 'Cr') {
    p.barLengths.forEach((len, i) => {
      const id = p.priceItemIds[i];
      if (!id) return;
      items.push(item(id, `${p.name} barra ${len} m`, `barra ${len} m`, [p.massPerM * len * STEEL_BRL_PER_KG]));
    });
  } else {
    const id = p.priceItemIds[0];
    if (id) items.push(item(id, `${p.name} rolo 50 m`, 'rolo 50 m', [p.massPerM * 50 * STEEL_BRL_PER_KG]));
  }
}

for (const mat of materials) {
  const pr = MATERIAL_PRICES[mat.id] ?? furniture.find((x) => x.id === mat.id)?.price;
  if (!pr) throw new Error(`Sem preço de referência para ${mat.id}`);
  const note =
    mat.id === 'drywall_st_12'
      ? 'Spec: R$ 89 por placa 1,20x2,40'
      : mat.id === 'cement_board_10'
        ? 'Spec: R$ 48/m² x 2,88 m² por placa'
        : mat.id === 'sandwich_eps30'
          ? 'Spec: R$ 80–160/m²'
          : mat.id === 'excavator_day'
            ? 'Spec: R$ 1.600–2.600/diária'
            : undefined;
  items.push(item(mat.priceItemId, mat.name, mat.purchase.label, pr, note));
}

const labor: LaborRate[] = [
  { stage: 'terrain', basis: 'material_pct', rate: 0, note: 'Terraplenagem: custo no serviço de máquina' },
  { stage: 'foundation', basis: 'radier_area', rate: 80, rateMax: 95, note: 'R$/m² de radier (mín. 70)' },
  { stage: 'structure', basis: 'steel_kg', rate: 11, rateMax: 13, note: 'R$/kg de aço (mín. 9)' },
  { stage: 'closure', basis: 'wall_area', rate: 55, rateMax: 65, note: 'R$/m² de parede (mín. 45)' },
  { stage: 'roof', basis: 'roof_area', rate: 42, rateMax: 50, note: 'R$/m² de telhado (mín. 35)' },
  { stage: 'floor', basis: 'radier_area', rate: 32, rateMax: 40, note: 'R$/m² de radier (mín. 25)' },
  { stage: 'finishing', basis: 'built_area', rate: 75, rateMax: 90, note: 'R$/m² construído (mín. 60)' },
  { stage: 'installations', basis: 'material_pct', rate: 90, rateMax: 120, note: '% do material (eletricista e encanador)' },
  { stage: 'extras', basis: 'material_pct', rate: 40, note: '% do material' },
];

export const priceBookDefault202611: PriceBook = {
  id: 'default-2026-11',
  name: 'Base de referência nov/2026',
  date: DATE,
  uf: 'BR',
  items,
  labor,
};
