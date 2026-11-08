import type { Project } from '@chalecad/engine';
import { stairRun } from '../edit';
import { round } from '../geometry';
import type { IdGen } from '../ids';
import { Builder } from './builder';

/**
 * Cabana gambrel 6 × 7 com loft: sala e cozinha com a empena de vidro alto na frente, banheiro sob o loft e
 * quarto no loft (cama junto à empena dos fundos, onde o telhado quebrado dá altura).
 */
export function gambrelCabin(ids: IdGen): Project {
  const b = new Builder('gambrel', { name: 'Cabana gambrel 6 × 7', region: 'SC', width: 6, depth: 7, wallHeight: 2.6, lowerPitchDeg: 60, upperPitchDeg: 25, breakRatio: 0.4 }, ids);
  b.p.openings = [];
  b.finishes({ facade: 'finish_facade_texture', roofColor: 'green' });
  b.deck({ length: 4, depth: 2, covered: false });

  // Loft nos fundos (y de 4,4 a 7), com escada reta sob a cumeeira (é o único trecho com 2,10 m livres sobre os degraus).
  const elevation = 2.6;
  const run = stairRun(elevation);
  const y0 = 4.4;
  b.p.levels.push({ id: 'L1', name: 'Loft', elevation, polygon: [[0, y0], [6, y0], [6, 7], [0, 7]], deck: 'osb18_wood', guardrail: true });
  b.p.stairs.push({ id: ids('s'), type: 'straight', from: 'L0', to: 'L1', position: [2.6, round(y0 - run, 2)], rotationDeg: 0, width: 0.8, turnRight: true });

  // Fachada: porta à direita da sala, janela ao lado e vidro alto sob a empena.
  b.open('ext-front', 'door', 3.8, 0.9, 2.1);
  b.window('ext-front', 0.8, 1.4, 1.2, 0.9);
  b.window('ext-front', 2.2, 1.6, 1.2, 3.4);
  b.window('ext-right', 1.9, 1.4, 1.0, 1.1); // sobre a pia
  b.window('ext-right', 5.6, 0.6, 0.5, 1.6); // banheiro
  b.window('ext-back', 3.9, 1.1, 0.7, 3.5); // loft

  // Banheiro sob o loft, no canto direito dos fundos.
  const bathSide = b.wall([3.6, 7], [3.6, 5.3], { wet: true });
  const bathFront = b.wall([3.6, 5.3], [6, 5.3], { wet: true });
  b.door(bathFront, 0.5, 0.7);

  b.room('kitchen', [3, 2.5], 'Sala e cozinha', { floor: 'finish_floor_porcelain' });
  b.room('bathroom', [4.8, 6.2], 'Banheiro');

  // Cozinha na parede direita.
  b.put('furn_fridge', 'ext-right', [6, 1.3], [3, 3]);
  b.put('furn_kitchen_sink', 'ext-right', [6, 2.6], [3, 3]);
  b.put('furn_stove', 'ext-right', [6, 3.8], [3, 3]);
  b.at('furn_round_table', [4.0, 3.5], 0);

  // Sala à esquerda da escada: sofá na parede, mesa de centro e poltrona.
  b.put('furn_sofa_2', 'ext-left', [0, 2.3], [2, 2.3]);
  b.at('furn_coffee_table', [1.75, 2.3], 90);
  b.at('furn_rug', [1.75, 2.3], 90);
  b.at('furn_plant', [0.5, 0.6], 0);

  // Banheiro.
  b.put('furn_shower', 'ext-back', [5.48, 7], [4.8, 6]);
  b.put('furn_toilet', 'ext-back', [4.4, 7], [4.8, 6]);
  b.put('furn_bath_sink', bathSide, [3.6, 5.9], [4.8, 6]);

  // Loft: cama junto à empena dos fundos.
  b.put('furn_bed_double', 'ext-back', [1.6, 7], [3, 5.5], 'L1');
  b.put('furn_nightstand', 'ext-back', [0.55, 7], [3, 5.5], 'L1');
  b.put('furn_nightstand', 'ext-back', [2.7, 7], [3, 5.5], 'L1');
  b.put('furn_wardrobe_small', 'ext-back', [3.7, 7], [3, 5.5], 'L1');
  return b.build();
}
