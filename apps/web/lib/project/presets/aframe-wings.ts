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
  Object.assign(left, { length: 4, offset: 2, width: 3, height: 3, pitchDeg: 8 });
  Object.assign(right, { length: 5, offset: 1.5, width: 3, height: 3, pitchDeg: 8 });
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

  // Quarto: cama de casal na parede lateral, guarda-roupa no fundo.
  b.put('furn_bed_double', 'annex-left-side', [-3, 4], [-1.5, 4]);
  b.put('furn_nightstand', 'annex-left-side', [-3, 2.85], [-1.5, 4]);
  b.put('furn_nightstand', 'annex-left-side', [-3, 5.15], [-1.5, 4]);
  b.put('furn_wardrobe', 'annex-left-back', [-1.4, 6], [-1.5, 4]);

  // Cozinha na lateral direita: pia e fogão na parede lateral, geladeira na da frente.
  b.put('furn_kitchen_sink', 'annex-right-side', [9, 3.25], [7.5, 3.3]);
  b.put('furn_stove', 'annex-right-side', [9, 4.45], [7.5, 3.3]);
  b.put('furn_fridge', 'annex-right-front', [8.55, 1.5], [7.5, 3.3]);

  // Sala e jantar.
  b.at('furn_dining_4', [1.6, 4.4], 90);
  b.at('furn_sofa_3', [4.55, 4.35], 0);
  b.at('furn_coffee_table', [4.55, 2.95], 0);
  b.at('furn_rug', [4.55, 2.85], 0);
  b.at('furn_armchair', [3.95, 1.9], 0);
  b.at('furn_plant', [5.3, 0.7], 0);

  // Banheiro: box no canto do fundo, vaso e lavatório na parede do fundo.
  b.put('furn_shower', 'annex-right-side', [9, 5.95], [7.5, 5.6]);
  b.put('furn_toilet', 'annex-right-back', [7.4, 6.5], [7.5, 5.6]);
  b.put('furn_bath_sink', 'annex-right-back', [6.55, 6.5], [7.5, 5.6]);

  // Mezanino.
  b.put('furn_bed_queen', 'ext-back', 3, [3, 6], 'L1');
  return b.build();
}
