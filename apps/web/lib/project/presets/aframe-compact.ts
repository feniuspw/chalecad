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
  b.wall([3.4, 8], [3.4, 5.6], { wet: true });
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

  // Mezanino: o quarto fica na faixa com pé-direito (muretas de 1,10 m dos lados, junto ao telhado baixo).
  b.wall([1.7, 4.8], [1.7, 8], { level: 'L1', height: 1.1 });
  b.wall([4.3, 4.8], [4.3, 8], { level: 'L1', height: 1.1 });
  b.room('bedroom', [3, 6.4], 'Quarto do mezanino', { level: 'L1', floor: 'finish_floor_laminate' });

  return b.build();
}
