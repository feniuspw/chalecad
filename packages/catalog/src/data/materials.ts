import type { Material } from '../schema';

type Cat = Material['category'];
type Unit = Material['baseUnit'];

interface Opts {
  sheet?: { width: number; height: number };
  integer?: boolean;
}

function m(
  id: string,
  name: string,
  category: Cat,
  baseUnit: Unit,
  label: string,
  size: number,
  massPerUnit: number,
  wastePct: number,
  opts: Opts = {},
): Material {
  const purchase: Material['purchase'] = { label, size, integer: opts.integer ?? true };
  if (opts.sheet) purchase.sheet = opts.sheet;
  return { id, name, category, baseUnit, purchase, wastePct, massPerUnit, priceItemId: `mat-${id}` };
}

const frac = { integer: false };
const sheet120 = { sheet: { width: 1.2, height: 2.4 } };
const sheetOsb = { sheet: { width: 1.22, height: 2.44 } };

export const materials: Material[] = [
  m('cement_board_10', 'Placa cimentícia 10 mm', 'board', 'm2', 'placa 1,20 x 2,40 m', 2.88, 17, 10, sheet120),
  m('osb_11', 'OSB 11,1 mm', 'board', 'm2', 'placa 1,22 x 2,44 m', 2.9768, 7, 10, sheetOsb),
  m('osb_18', 'OSB 18 mm', 'board', 'm2', 'placa 1,22 x 2,44 m', 2.9768, 11, 10, sheetOsb),
  m('drywall_st_12', 'Drywall ST 12,5 mm', 'board', 'm2', 'placa 1,20 x 2,40 m', 2.88, 9, 10, sheet120),
  m('drywall_ru_12', 'Drywall RU 12,5 mm', 'board', 'm2', 'placa 1,20 x 2,40 m', 2.88, 9.5, 10, sheet120),
  m('siding_smart', 'Siding cimentício (lambril)', 'board', 'm2', 'm²', 1, 12, 10, frac),
  m('membrane', 'Membrana hidrófuga', 'membrane', 'm2', 'rolo 75 m²', 75, 0.15, 10),
  m('wool_pet_50', 'Lã de PET 50 mm', 'insulation', 'm2', 'rolo 15 m²', 15, 1, 5),
  m('joint_tape', 'Fita telada para junta', 'finishing', 'm', 'rolo 90 m', 90, 0.003, 10),
  m('joint_compound', 'Massa para drywall', 'finishing', 'kg', 'balde 15 kg', 15, 1, 10),
  m('basecoat', 'Basecoat para placa cimentícia', 'finishing', 'kg', 'saco 20 kg', 20, 1, 10),
  m('screw_board', 'Parafuso placa-perfil', 'fastener', 'un', 'caixa 100 un', 100, 0.004, 10),
  m('screw_frame', 'Parafuso perfil-perfil', 'fastener', 'un', 'caixa 100 un', 100, 0.005, 10),
  m('anchor_bolt', 'Chumbador parabolt', 'fastener', 'un', 'un', 1, 0.12, 5),
  m('hold_down', 'Hold-down', 'fastener', 'un', 'un', 1, 0.9, 2),
  m('sandwich_eps30', 'Telha sanduíche EPS 30 mm', 'roofing', 'm2', 'm²', 1, 10, 5, frac),
  m('ridge_cap', 'Cumeeira', 'roofing', 'm', 'peça 1 m', 1, 1.5, 5),
  m('flashing', 'Rufo', 'roofing', 'm', 'peça 3 m', 3, 0.8, 10),
  m('gutter', 'Calha', 'roofing', 'm', 'peça 3 m', 3, 1, 10),
  m('screw_roof', 'Parafuso de telha', 'fastener', 'un', 'caixa 100 un', 100, 0.02, 10),
  m('concrete_fck25', 'Concreto usinado fck 25 MPa', 'concrete', 'm3', 'm³', 1, 2500, 5, frac),
  m('mesh_q138', 'Tela soldada Q-138', 'steel_mesh', 'm2', 'painel 2,00 x 3,00 m', 6, 2.2, 5, {
    sheet: { width: 2, height: 3 },
  }),
  m('lona_200', 'Lona plástica 200 µm', 'misc', 'm2', 'rolo 4 x 25 m', 100, 0.2, 10),
  m('gravel_1', 'Brita 1', 'aggregate', 'm3', 'm³', 1, 1500, 5, frac),
  m('edge_form', 'Forma de borda (tábua)', 'wood', 'm', 'tábua 3 m', 3, 1.5, 10),
  m('floor_hardener', 'Endurecedor de superfície', 'finishing', 'kg', 'saco 25 kg', 25, 1, 5),
  m('sealer', 'Selador acrílico', 'finishing', 'un', 'galão 3,6 L', 3.6, 1.2, 10),
  m('joint_cut', 'Corte de junta de dilatação', 'service', 'm', 'm', 1, 0, 0, frac),
  m('pvc_sewer_100', 'Tubo PVC esgoto 100 mm', 'misc', 'm', 'barra 6 m', 6, 1.4, 5),
  m('pvc_water_25', 'Tubo PVC água 25 mm', 'misc', 'm', 'barra 6 m', 6, 0.17, 5),
  m('guardrail', 'Guarda-corpo metálico', 'misc', 'm', 'm', 1, 12, 0, frac),
  m('stair_tread', 'Degrau de escada metálica com piso de madeira', 'misc', 'un', 'un', 1, 6, 0),
  m('ladder', 'Estrutura de escada marinheiro', 'misc', 'm', 'm', 1, 5, 0, frac),
  m('door_ext', 'Porta externa', 'opening', 'un', 'un', 1, 35, 0),
  m('door_int', 'Porta interna', 'opening', 'un', 'un', 1, 18, 0),
  m('window_alu', 'Janela de alumínio', 'opening', 'm2', 'm²', 1, 25, 0, frac),
  m('sliding_door', 'Porta de correr de vidro', 'opening', 'm2', 'm²', 1, 35, 0, frac),
  m('skylight', 'Claraboia', 'opening', 'm2', 'm²', 1, 30, 0, frac),
  m('glass_gable', 'Vidro laminado para empena', 'opening', 'm2', 'm²', 1, 20, 3, frac),
  m('block_concrete', 'Bloco de concreto 14x19x39', 'masonry', 'un', 'un', 1, 11, 5),
  m('block_structural', 'Bloco estrutural de concreto', 'masonry', 'un', 'un', 1, 13, 5),
  m('grout', 'Graute', 'masonry', 'm3', 'm³', 1, 2200, 5, frac),
  m('rebar_ca50', 'Aço CA-50', 'masonry', 'kg', 'kg', 1, 1, 10, frac),
  m('mortar', 'Argamassa de assentamento', 'masonry', 'kg', 'saco 20 kg', 20, 1, 10),
  m('post_concrete', 'Mourão de concreto', 'fence', 'un', 'un', 1, 60, 3),
  m('post_eucalyptus', 'Mourão de eucalipto tratado', 'fence', 'un', 'un', 1, 25, 3),
  m('post_steel', 'Poste de aço', 'fence', 'un', 'un', 1, 9, 3),
  m('fence_welded', 'Tela soldada para cerca', 'fence', 'm', 'rolo 25 m', 25, 2.5, 5),
  m('fence_chain', 'Tela de alambrado', 'fence', 'm', 'rolo 25 m', 25, 1.6, 5),
  m('barbed_wire', 'Arame farpado', 'fence', 'm', 'rolo 500 m', 500, 0.06, 5),
  m('deck_wood', 'Madeira para deck', 'wood', 'm2', 'm²', 1, 25, 10, frac),
  m('deck_frame', 'Estrutura de deck', 'wood', 'm2', 'm²', 1, 15, 10, frac),
  m('excavator_day', 'Retroescavadeira com operador', 'service', 'un', 'diária', 1, 0, 0),
  m('truck_trip', 'Caminhão basculante', 'service', 'un', 'viagem', 1, 0, 0),
  m('gabion', 'Gabião', 'earthwork', 'm3', 'm³', 1, 1700, 3, frac),
  m('geotextile', 'Geotêxtil', 'earthwork', 'm2', 'm²', 1, 0.2, 10, frac),
  m('drain_pipe', 'Dreno', 'earthwork', 'm', 'm', 1, 0.5, 5, frac),
];
