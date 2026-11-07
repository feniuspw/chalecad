import type { Assembly, AssemblyLayer } from '../schema';

type Face = AssemblyLayer['face'];
type Stage = AssemblyLayer['stage'];

function l(materialId: string, thickness: number, face: Face, consumptionPerM2: number, stage: Stage): AssemblyLayer {
  return { materialId, thickness, face, consumptionPerM2, stage };
}

export const assemblies: Assembly[] = [
  {
    id: 'ext_cement_osb_wool_drywall',
    name: 'Parede externa: cimentícia + OSB + lã de PET + drywall',
    kind: 'wall_exterior',
    layers: [
      l('cement_board_10', 10, 'ext', 1, 'closure'),
      l('membrane', 0, 'ext', 1, 'closure'),
      l('osb_11', 11.1, 'ext', 1, 'closure'),
      l('wool_pet_50', 50, 'core', 1, 'closure'),
      l('drywall_st_12', 12.5, 'int', 1, 'closure'),
      l('basecoat', 0, 'ext', 1.5, 'finishing'),
      l('joint_tape', 0, 'int', 1.5, 'finishing'),
      l('joint_compound', 0, 'int', 0.5, 'finishing'),
      l('screw_board', 0, 'both', 15, 'closure'),
    ],
  },
  {
    id: 'ext_osb_siding_wool_drywall',
    name: 'Parede externa: siding + OSB + lã de PET + drywall',
    kind: 'wall_exterior',
    layers: [
      l('siding_smart', 10, 'ext', 1, 'closure'),
      l('membrane', 0, 'ext', 1, 'closure'),
      l('osb_11', 11.1, 'ext', 1, 'closure'),
      l('wool_pet_50', 50, 'core', 1, 'closure'),
      l('drywall_st_12', 12.5, 'int', 1, 'closure'),
      l('joint_tape', 0, 'int', 1.5, 'finishing'),
      l('joint_compound', 0, 'int', 0.5, 'finishing'),
      l('screw_board', 0, 'both', 15, 'closure'),
    ],
  },
  {
    id: 'int_drywall_wool_drywall',
    name: 'Parede interna: drywall + lã de PET + drywall',
    kind: 'wall_interior',
    layers: [
      l('drywall_st_12', 12.5, 'both', 1, 'closure'),
      l('wool_pet_50', 50, 'core', 1, 'closure'),
      l('joint_tape', 0, 'both', 1.5, 'finishing'),
      l('joint_compound', 0, 'both', 0.5, 'finishing'),
      l('screw_board', 0, 'both', 15, 'closure'),
    ],
  },
  {
    id: 'wet_cement_drywall_rh',
    name: 'Parede de área molhada: drywall RU + lã de PET + cimentícia',
    kind: 'wall_wet',
    layers: [
      l('drywall_ru_12', 12.5, 'int', 1, 'closure'),
      l('wool_pet_50', 50, 'core', 1, 'closure'),
      l('cement_board_10', 10, 'ext', 1, 'closure'),
      l('basecoat', 0, 'ext', 1.5, 'finishing'),
      l('joint_tape', 0, 'int', 1.5, 'finishing'),
      l('joint_compound', 0, 'int', 0.5, 'finishing'),
      l('screw_board', 0, 'both', 15, 'closure'),
    ],
  },
  {
    id: 'roof_sandwich_eps30',
    name: 'Cobertura: telha sanduíche EPS 30 mm',
    kind: 'roof',
    layers: [l('sandwich_eps30', 30, 'ext', 1, 'roof'), l('screw_roof', 0, 'ext', 4, 'roof')],
  },
  {
    id: 'floor_osb18',
    name: 'Piso de mezanino: OSB 18 mm',
    kind: 'floor',
    layers: [l('osb_18', 18, 'int', 1, 'structure'), l('screw_board', 0, 'int', 15, 'structure')],
  },
  {
    id: 'gable_glazed',
    name: 'Empena envidraçada',
    kind: 'gable_glazed',
    layers: [l('glass_gable', 8, 'ext', 1, 'closure')],
  },
];
