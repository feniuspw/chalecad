import type { Project } from '@chalecad/engine';
import type { IdGen } from '../ids';
import { Builder } from './builder';

/**
 * A-frame compacto 6 × 8: fachada de vidro, mezanino com a cama, cozinha e banheiro sob o mezanino, sala e jantar na
 * frente e forro de lambri. Mureta de 0,90 m na base das águas para encostar bancada e sofá.
 */
export function aframeCompact(ids: IdGen): Project {
  const b = new Builder('a_frame', { name: 'A-frame compacto 6 × 8', region: 'SP', width: 6, depth: 8, ridgeHeight: 6, kneeWallHeight: 0.9, mezzanine: true }, ids);
  b.finishes({ facade: 'finish_facade_wood', interiorRoof: 'finish_ceiling_wood', roofColor: 'black' });
  b.mezzanine({ depth: 3.2, elevation: 2.6, stairX: 2.6 });
  b.deck({ length: 4, depth: 2.2 });

  // Banheiro no canto do fundo, à direita (sob o mezanino); a porta abre para a cozinha.
  const bathSide = b.wall([3.4, 8], [3.4, 5.6], { wet: true });
  const bathFront = b.wall([3.4, 5.6], [5.1, 5.6], { wet: true });
  b.wall([5.1, 5.6], [5.1, 8], { wet: true });
  b.door(bathFront, 0.8, 0.7);
  b.window('ext-back', 1.05, 0.5, 0.5, 1.5);
  b.window('ext-back', 3.9, 1.2, 0.6, 1.25); // sobre a bancada
  b.open('ext-front', 'sliding_door', 3.65, 1.6, 2.1); // para o deck
  b.window('ext-front', 0.85, 1.4, 1.0, 0.9);
  b.open('roof-a', 'skylight', 1.4, 1.0, 1.2, 1.4);
  b.open('roof-b', 'skylight', 1.4, 1.0, 1.2, 1.4);

  b.room('kitchen', [1.6, 2], 'Cozinha, jantar e sala', { floor: 'finish_floor_laminate' });
  b.room('bathroom', [4.3, 6.8], 'Banheiro');

  // Cozinha ao longo do fundo, da esquerda para a direita: fogão, pia, geladeira (a mais alta fica sob o mezanino).
  const back = 'ext-back'; // de x = 6 (u = 0) para x = 0
  b.put('furn_stove', back, 6 - 0.34, [1, 6]);
  b.put('furn_kitchen_sink', back, 6 - 1.53, [1, 6]);
  b.put('furn_fridge', back, 6 - 2.85, [1, 6]);
  // Jantar entre a cozinha e a escada.
  b.at('furn_dining_4', [1.5, 4.0], 90);

  // Sala à direita da escada, de frente para a fachada de vidro.
  b.at('furn_sofa_3', [4.7, 4.3], 0);
  b.at('furn_coffee_table', [4.7, 2.9], 0);
  b.at('furn_rug', [4.7, 2.8], 0);
  b.at('furn_armchair', [3.9, 1.9], 0);
  b.at('furn_plant', [5.4, 0.7], 0);

  // Banheiro: box no canto do fundo, vaso e lavatório na parede da porta (a do lado esquerdo).
  b.put('furn_shower', back, 6 - 4.6, [4.4, 6.8]);
  b.put('furn_toilet', bathSide, 0.55, [4.4, 6.8]);
  b.put('furn_bath_sink', bathSide, 1.6, [4.4, 6.8]);

  // Mezanino: cama de casal no fundo, de cabeceira para o gable.
  b.put('furn_bed_queen', back, 3, [3, 6], 'L1');
  b.put('furn_nightstand', back, 3 - 1.35, [3, 6], 'L1');
  b.put('furn_nightstand', back, 3 + 1.35, [3, 6], 'L1');
  return b.build();
}
