import type { FurnitureSpec } from '../schema';

/** Móvel do catálogo com massa (kg) e faixa de preço de referência (R$, varejo 2026-11). */
export interface FurnitureEntry extends FurnitureSpec {
  mass: number;
  price: [number, number?];
}

type In = Omit<FurnitureSpec, 'clearance' | 'water' | 'collides'> & {
  clearance: { front: number; back?: number; sides?: number };
  water?: boolean;
  collides?: boolean;
  mass: number;
  price: [number, number?];
};

const f = (x: In): FurnitureEntry => ({
  ...x,
  clearance: { front: x.clearance.front, back: x.clearance.back ?? 0, sides: x.clearance.sides ?? 0 },
  water: x.water ?? false,
  collides: x.collides ?? true,
});

/** Folgas usuais de layout residencial (Neufert / manuais de ergonomia): 0,60 m de uso, 0,75–0,90 m onde se abre porta ou gaveta. */
export const furniture: FurnitureEntry[] = [
  // Sala
  f({ id: 'furn_sofa_3', name: 'Sofá 3 lugares', group: 'living', model: 'sofa', size: { w: 2.1, d: 0.9, h: 0.85 }, clearance: { front: 0.6 }, wall: true, mass: 45, price: [2200, 3500] }),
  f({ id: 'furn_sofa_2', name: 'Sofá 2 lugares', group: 'living', model: 'sofa', size: { w: 1.6, d: 0.9, h: 0.85 }, clearance: { front: 0.6 }, wall: true, mass: 35, price: [1700, 2600] }),
  f({ id: 'furn_armchair', name: 'Poltrona', group: 'living', model: 'armchair', size: { w: 0.8, d: 0.8, h: 0.85 }, clearance: { front: 0.5 }, wall: false, mass: 18, price: [900, 1500] }),
  f({ id: 'furn_coffee_table', name: 'Mesa de centro', group: 'living', model: 'coffee_table', size: { w: 1.0, d: 0.6, h: 0.4 }, clearance: { front: 0 }, wall: false, mass: 15, price: [400, 800] }),
  f({ id: 'furn_tv_rack', name: 'Rack de TV', group: 'living', model: 'rack', size: { w: 1.8, d: 0.45, h: 0.55 }, clearance: { front: 0.6 }, wall: true, mass: 30, price: [700, 1200] }),
  f({ id: 'furn_bookshelf', name: 'Estante', group: 'living', model: 'shelf', size: { w: 1.0, d: 0.35, h: 1.8 }, clearance: { front: 0.6 }, wall: true, mass: 35, price: [600, 1100] }),
  // Jantar
  f({ id: 'furn_dining_4', name: 'Mesa de jantar 4 lugares', group: 'dining', model: 'dining', size: { w: 1.2, d: 0.8, h: 0.75 }, clearance: { front: 0.75, back: 0.75, sides: 0.6 }, wall: false, mass: 40, price: [1200, 2200] }),
  f({ id: 'furn_dining_6', name: 'Mesa de jantar 6 lugares', group: 'dining', model: 'dining', size: { w: 1.8, d: 0.9, h: 0.75 }, clearance: { front: 0.75, back: 0.75, sides: 0.6 }, wall: false, mass: 60, price: [1800, 3200] }),
  f({ id: 'furn_round_table', name: 'Mesa redonda 4 lugares', group: 'dining', model: 'round_table', size: { w: 0.9, d: 0.9, h: 0.75 }, clearance: { front: 0.7, back: 0.7, sides: 0.7 }, wall: false, mass: 30, price: [900, 1600] }),
  // Quarto
  f({ id: 'furn_bed_double', name: 'Cama de casal (com colchão)', group: 'bedroom', model: 'bed', size: { w: 1.45, d: 2.0, h: 0.55 }, clearance: { front: 0.6, sides: 0.5 }, wall: true, mass: 60, price: [1500, 3000] }),
  f({ id: 'furn_bed_queen', name: 'Cama queen (com colchão)', group: 'bedroom', model: 'bed', size: { w: 1.65, d: 2.1, h: 0.55 }, clearance: { front: 0.6, sides: 0.5 }, wall: true, mass: 70, price: [2200, 4200] }),
  f({ id: 'furn_bed_single', name: 'Cama de solteiro (com colchão)', group: 'bedroom', model: 'bed', size: { w: 0.95, d: 2.0, h: 0.5 }, clearance: { front: 0.6 }, wall: true, mass: 35, price: [800, 1500] }),
  f({ id: 'furn_bunk_bed', name: 'Beliche (com colchões)', group: 'bedroom', model: 'bunk', size: { w: 0.98, d: 2.0, h: 1.6 }, clearance: { front: 0.6 }, wall: true, mass: 70, price: [1300, 2400] }),
  f({ id: 'furn_nightstand', name: 'Criado-mudo', group: 'bedroom', model: 'nightstand', size: { w: 0.45, d: 0.4, h: 0.55 }, clearance: { front: 0.4 }, wall: true, mass: 10, price: [250, 500] }),
  f({ id: 'furn_wardrobe', name: 'Guarda-roupa 3 portas', group: 'bedroom', model: 'wardrobe', size: { w: 1.8, d: 0.6, h: 2.2 }, clearance: { front: 0.7 }, wall: true, mass: 90, price: [1200, 2500] }),
  f({ id: 'furn_wardrobe_small', name: 'Guarda-roupa 2 portas', group: 'bedroom', model: 'wardrobe', size: { w: 1.0, d: 0.55, h: 1.9 }, clearance: { front: 0.6 }, wall: true, mass: 50, price: [700, 1300] }),
  f({ id: 'furn_desk', name: 'Escrivaninha com cadeira', group: 'bedroom', model: 'desk', size: { w: 1.2, d: 0.6, h: 0.75 }, clearance: { front: 0.8 }, wall: true, mass: 25, price: [600, 1200] }),
  // Cozinha
  f({ id: 'furn_kitchen_sink', name: 'Bancada com pia e armário', group: 'kitchen', model: 'counter_sink', size: { w: 1.8, d: 0.6, h: 0.9 }, clearance: { front: 0.9 }, wall: true, water: true, mass: 70, price: [1500, 2800] }),
  f({ id: 'furn_kitchen_counter', name: 'Balcão de cozinha', group: 'kitchen', model: 'counter', size: { w: 1.2, d: 0.6, h: 0.9 }, clearance: { front: 0.9 }, wall: true, mass: 45, price: [800, 1500] }),
  f({ id: 'furn_stove', name: 'Fogão 4 bocas', group: 'kitchen', model: 'stove', size: { w: 0.55, d: 0.6, h: 0.85 }, clearance: { front: 0.9 }, wall: true, mass: 30, price: [900, 1800] }),
  f({ id: 'furn_fridge', name: 'Geladeira', group: 'kitchen', model: 'fridge', size: { w: 0.7, d: 0.72, h: 1.85 }, clearance: { front: 0.9 }, wall: true, mass: 75, price: [2800, 4500] }),
  f({ id: 'furn_island', name: 'Ilha de cozinha', group: 'kitchen', model: 'island', size: { w: 1.4, d: 0.8, h: 0.9 }, clearance: { front: 0.9, back: 0.9 }, wall: false, mass: 60, price: [1800, 3500] }),
  // Banheiro
  f({ id: 'furn_toilet', name: 'Vaso sanitário com caixa acoplada', group: 'bathroom', model: 'toilet', size: { w: 0.38, d: 0.65, h: 0.78 }, clearance: { front: 0.6, sides: 0.2 }, wall: true, water: true, mass: 25, price: [450, 900] }),
  f({ id: 'furn_bath_sink', name: 'Lavatório com gabinete', group: 'bathroom', model: 'basin', size: { w: 0.6, d: 0.45, h: 0.85 }, clearance: { front: 0.6 }, wall: true, water: true, mass: 20, price: [400, 900] }),
  f({ id: 'furn_shower', name: 'Box de chuveiro 90 x 90', group: 'bathroom', model: 'shower', size: { w: 0.9, d: 0.9, h: 2.0 }, clearance: { front: 0.6 }, wall: true, water: true, mass: 40, price: [900, 1800] }),
  f({ id: 'furn_bathtub', name: 'Banheira', group: 'bathroom', model: 'bathtub', size: { w: 1.7, d: 0.75, h: 0.55 }, clearance: { front: 0.6 }, wall: true, water: true, mass: 45, price: [2000, 4500] }),
  // Lavanderia
  f({ id: 'furn_washer', name: 'Máquina de lavar', group: 'laundry', model: 'washer', size: { w: 0.6, d: 0.65, h: 0.95 }, clearance: { front: 0.7 }, wall: true, water: true, mass: 35, price: [1800, 3000] }),
  f({ id: 'furn_tank', name: 'Tanque', group: 'laundry', model: 'tank', size: { w: 0.6, d: 0.55, h: 0.85 }, clearance: { front: 0.6 }, wall: true, water: true, mass: 20, price: [300, 700] }),
  // Área externa
  f({ id: 'furn_lounger', name: 'Espreguiçadeira', group: 'outdoor', model: 'lounger', size: { w: 0.65, d: 1.9, h: 0.4 }, clearance: { front: 0.5, sides: 0.3 }, wall: false, mass: 15, price: [500, 1200] }),
  f({ id: 'furn_outdoor_table', name: 'Mesa externa com 4 cadeiras', group: 'outdoor', model: 'round_table', size: { w: 1.0, d: 1.0, h: 0.75 }, clearance: { front: 0.7, back: 0.7, sides: 0.7 }, wall: false, mass: 30, price: [800, 1800] }),
  // Decoração
  f({ id: 'furn_plant', name: 'Vaso com planta', group: 'decor', model: 'plant', size: { w: 0.45, d: 0.45, h: 1.2 }, clearance: { front: 0 }, wall: false, mass: 15, price: [150, 400] }),
  f({ id: 'furn_rug', name: 'Tapete 2,00 x 1,40', group: 'decor', model: 'rug', size: { w: 2.0, d: 1.4, h: 0.01 }, clearance: { front: 0 }, wall: false, collides: false, mass: 6, price: [300, 900] }),
];
