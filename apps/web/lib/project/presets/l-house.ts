import type { Project } from '@chalecad/engine';
import type { IdGen } from '../ids';
import { Builder } from './builder';

/**
 * Casa em L de 2 quartos: corpo principal com sala, cozinha e banheiro; ala dos quartos saindo dos fundos pela esquerda,
 * com corredor de acesso. Deck na frente.
 */
export function lHouse(ids: IdGen): Project {
  const b = new Builder('combined', { name: 'Casa em L de 2 quartos', region: 'SP', width: 8, depth: 5.5, wallHeight: 2.8, roofPitchDeg: 30, shape: 'L', wingWidth: 4.4, wingDepth: 6.2, wingOffset: 0 }, ids);
  b.p.openings = [];
  b.finishes({ facade: 'finish_facade_siding', roofColor: 'graphite' });
  b.deck({ length: 5, depth: 2.2, covered: false });

  // Fachada e laterais.
  b.open('ext-front', 'door', 3.55, 0.9, 2.1);
  b.window('ext-front', 0.8, 1.5, 1.2, 0.9);
  b.window('ext-front', 4.8, 1.6, 1.0, 1.1); // sobre a bancada e o fogão
  b.window('ext-left', 2.8, 1.2, 1.2, 1.0);
  b.window('ext-right', 1.6, 1.4, 1.0, 1.1); // sobre a pia
  b.window('ext-right', 4.4, 0.6, 0.5, 1.6); // banheiro (u é medido a partir da frente)
  b.window('wing-right', 1.0, 1.2, 1.2, 0.9); // quarto 1
  b.window('wing-right', 4.0, 1.2, 1.2, 0.9); // quarto 2
  b.window('wing-back', 2.0, 1.2, 1.2, 0.9);

  // Banheiro no fundo à direita do corpo (porta para a sala).
  const bathWest = b.wall([5, 3.4], [5, 5.5], { wet: true });
  b.wall([5, 3.4], [8, 3.4], { wet: true });
  b.door(bathWest, 1.1, 0.7);

  // Ala dos quartos: corredor de 1,1 m na esquerda, quartos de 3,0 e 3,2 m.
  const corridor = b.wall([1.1, 11.7], [1.1, 5.5]);
  b.wall([1.1, 5.5], [4.4, 5.5]);
  b.wall([1.1, 8.5], [4.4, 8.5]);
  b.door(corridor, 5.1, 0.8); // quarto 1: u é medido a partir do fundo
  b.door(corridor, 2.3, 0.8); // quarto 2

  b.room('kitchen', [2.5, 2.5], 'Sala e cozinha', { floor: 'finish_floor_porcelain' });
  b.room('bathroom', [6.5, 4.4], 'Banheiro');
  b.room('bedroom', [2.8, 7], 'Quarto casal', { floor: 'finish_floor_vinyl' });
  b.room('bedroom', [2.8, 10], 'Quarto', { floor: 'finish_floor_vinyl' });

  return b.build();
}
