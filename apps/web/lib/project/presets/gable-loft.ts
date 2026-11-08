import type { Project } from '@chalecad/engine';
import type { IdGen } from '../ids';
import { Builder } from './builder';

/**
 * Chalé duas águas 6,5 × 8,5 com mezanino: sala e cozinha na frente, quarto e banheiro nos fundos (sob o mezanino),
 * mezanino de estar, deck na frente e siding de madeira.
 */
export function gableLoft(ids: IdGen): Project {
  const b = new Builder('gable_mezzanine', { name: 'Chalé duas águas 6,5 × 8,5', region: 'MG', width: 6.5, depth: 8.5, mezzanine: true }, ids);
  // Escada sob a cumeeira: junto à parede o telhado baixo não deixa os 2,10 m livres sobre os degraus.
  // Borda do mezanino sobre as paredes do quarto e do banheiro (y = 5,6): as vigas vencem os 2,9 m do fundo, não os 6,5 m.
  b.mezzanine({ depth: 2.9, stairX: 2.85 });
  b.p.walls = []; // refaz o banheiro do modelo inicial
  b.p.openings = [];
  b.finishes({ facade: 'finish_facade_wood', roofColor: 'terracotta' });
  b.deck({ length: 4.5, depth: 2.2, covered: true });

  // Fachada: porta ao centro, uma janela de cada lado.
  b.open('ext-front', 'door', 1.5, 0.9, 2.1);
  b.window('ext-front', 0.3, 0.9, 1.2, 0.9);
  b.window('ext-front', 4.4, 1.6, 1.2, 0.9);

  // Quarto (fundos, à esquerda) e banheiro (fundos, à direita), sob o mezanino.
  const shared = b.wall([4.2, 8.5], [4.2, 5.6], { wet: true });
  const bedFront = b.wall([0, 5.6], [4.2, 5.6]);
  const bathFront = b.wall([4.2, 5.6], [6.5, 5.6], { wet: true });
  b.door(bedFront, 3.1, 0.8);
  b.door(bathFront, 0.4, 0.7);
  b.window('ext-left', 0.9, 1.2, 1.1, 1.0); // quarto
  b.window('ext-right', 6.9, 0.6, 0.5, 1.6); // banheiro
  b.window('ext-right', 1.65, 1.4, 1.0, 1.1); // cozinha, sobre a pia
  b.window('ext-left', 4.8, 1.2, 1.0, 1.0); // sala

  b.room('kitchen', [3, 3], 'Sala e cozinha', { floor: 'finish_floor_porcelain' });
  b.room('bedroom', [2, 7], 'Quarto', { floor: 'finish_floor_vinyl' });
  b.room('bathroom', [5.4, 6.6], 'Banheiro');

  // Cozinha na parede direita (de frente para os fundos): geladeira, pia, fogão.
  b.put('furn_fridge', 'ext-right', [6.5, 1.0], [3, 3]);
  b.put('furn_kitchen_sink', 'ext-right', [6.5, 2.35], [3, 3]);
  b.put('furn_stove', 'ext-right', [6.5, 3.55], [3, 3]);
  b.put('furn_kitchen_counter', 'ext-right', [6.5, 4.5], [3, 3]);
  b.at('furn_round_table', [4.55, 3.6], 0);

  // Sala à esquerda da escada: sofá na parede, mesa de centro e poltrona.
  b.put('furn_sofa_3', 'ext-left', [0, 2.6], [2, 2.6]);
  b.at('furn_coffee_table', [1.95, 2.6], 90);
  b.at('furn_rug', [1.95, 2.6], 90);
  b.at('furn_armchair', [1.7, 4.5], 180);
  b.at('furn_plant', [0.5, 0.6], 0);

  // Quarto.
  b.put('furn_bed_queen', 'ext-back', [2.1, 8.5], [2.1, 7]);
  b.put('furn_nightstand', 'ext-back', [0.9, 8.5], [2.1, 7]);
  b.put('furn_nightstand', 'ext-back', [3.3, 8.5], [2.1, 7]);
  b.put('furn_wardrobe', bedFront, [1.3, 5.6], [2.1, 7]);

  // Banheiro.
  b.put('furn_shower', 'ext-right', [6.5, 7.9], [5.4, 7]);
  b.put('furn_toilet', 'ext-back', [4.95, 8.5], [5.4, 7]);
  b.put('furn_bath_sink', shared, [4.2, 6.7], [5.4, 7]);

  // Mezanino de estar: sofá e mesa de trabalho contra a empena dos fundos (só móveis baixos: o telhado desce nas laterais).
  b.put('furn_sofa_2', 'ext-back', [2.05, 8.5], [3, 6.5], 'L1');
  b.put('furn_desk', 'ext-back', [4.3, 8.5], [3, 6.5], 'L1');
  b.at('furn_rug', [3.25, 6.3], 0, 'L1');
  return b.build();
}
