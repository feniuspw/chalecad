import type { Project } from '@chalecad/engine';
import type { IdGen } from '../ids';
import { Builder } from './builder';

/**
 * A-frame com cômodos laterais (como o da CasaPinus): quarto no anexo da esquerda, cozinha e banheiro no da direita,
 * sala e jantar no vão central, escada para o mezanino (cama extra) e fachada de vidro.
 */
export function aframeWings(ids: IdGen): Project {
  const b = new Builder('a_frame', { name: 'A-frame com cômodos laterais', region: 'MG', width: 6, depth: 8, ridgeHeight: 6, kneeWallHeight: 0.6, annexSides: ['left', 'right'], mezzanine: true }, ids);
  const t = b.p.typology;
  if (t.kind !== 'a_frame') throw new Error('preset: tipologia inesperada');
  const left = t.annexes.find((a) => a.side === 'left')!;
  const right = t.annexes.find((a) => a.side === 'right')!;
  Object.assign(left, { length: 4, offset: 2, width: 3, height: 2.7, pitchDeg: 3 });
  Object.assign(right, { length: 5, offset: 1.5, width: 3, height: 2.7, pitchDeg: 3 });
  b.finishes({ facade: 'finish_facade_wood', interiorRoof: 'finish_ceiling_wood', roofColor: 'graphite' });
  b.mezzanine({ depth: 3.2, elevation: 2.6, stairX: 2.6 });
  b.deck({ length: 4, depth: 2.2 });
  b.p.openings = b.p.openings.filter((o) => !o.host.startsWith('annex-'));

  // Quarto (anexo esquerdo, y de 2 a 6), separado da sala pela parede em x = 0.
  const bedDiv = b.wall([0, 2], [0, 6]);
  b.door(bedDiv, 0.5, 0.8);
  b.window('annex-left-side', 1.4, 1.2, 1.1, 1.0);
  b.window('annex-left-front', 1.6, 1.0, 1.1, 1.0);

  // Banheiro (anexo direito, fundos) com porta para a sala; a cozinha fica aberta na frente.
  const bathMain = b.wall([6, 4.8], [6, 6.5], { wet: true });
  b.wall([6, 4.8], [9, 4.8], { wet: true });
  b.door(bathMain, 0.4, 0.7);
  b.window('annex-right-back', 0.5, 0.6, 0.5, 1.6);
  b.window('annex-right-side', 0.4, 0.6, 0.5, 1.6);
  b.window('annex-right-side', 1.0, 1.4, 1.0, 1.1); // cozinha: sobre a pia
  b.window('annex-right-front', 1.8, 1.4, 1.0, 1.1);

  b.open('ext-front', 'sliding_door', 3.6, 1.4, 2.1);
  b.window('ext-front', 0.95, 1.4, 1.0, 0.9);

  b.room('kitchen', [4.3, 2.2], 'Sala, jantar e cozinha', { floor: 'finish_floor_porcelain' });
  b.room('bedroom', [-1.5, 4], 'Quarto', { floor: 'finish_floor_vinyl' });
  b.room('bathroom', [7.5, 5.6], 'Banheiro');

  b.room('bedroom', [3, 6.4], 'Quarto do mezanino', { level: 'L1', floor: 'finish_floor_vinyl' });

  return b.build();
}
