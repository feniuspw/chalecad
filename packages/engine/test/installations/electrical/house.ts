import { mk } from '../../helpers/inline';

type V = [number, number];
const wall = (id: string, from: V, to: V) => ({ id, level: 'L0', from, to });
const room = (id: string, seed: V, use: string) => ({ id, level: 'L0', use, seed });
const door = (host: string, offset: number) => ({ id: `d-${host}`, host, type: 'door', offset, width: 0.8, height: 2.1 });
const item = (id: string, kind: string, position: V, rotation = 0) => ({ id, level: 'L0', item: kind, position, rotation });

export const gable = { kind: 'gable_mezzanine', width: 6, depth: 8, wallHeight: 2.8, roofPitchDeg: 20 };

/** Casa de 6 x 8 m: quarto, banheiro, cozinha e sala, com móveis, térreo só. */
export function houseJson(extra: Record<string, unknown> = {}, elec: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    walls: [
      wall('w1', [3, 0], [3, 3]),
      wall('w2', [0, 3], [3, 3]),
      wall('w3', [3, 3], [6, 3]),
      wall('w4', [3, 3], [3, 8]),
    ],
    rooms: [room('q', [1.5, 1.5], 'bedroom'), room('b', [4.5, 1.5], 'bathroom'), room('c', [1.5, 5.5], 'kitchen'), room('s', [4.5, 5.5], 'living')],
    openings: [door('w2', 1), door('w3', 1), door('w4', 2)],
    furniture: [
      item('ch', 'furn_shower', [5.4, 0.5]),
      item('lv', 'furn_bath_sink', [3.6, 0.3], 180),
      item('vs', 'furn_toilet', [4.4, 2.6]),
      item('pia', 'furn_kitchen_sink', [0.4, 5.0], 90),
      item('bc', 'furn_kitchen_counter', [0.4, 6.2], 90),
      item('gl', 'furn_fridge', [2.5, 7.5]),
    ],
    installations: { enabled: true, waterHeater: 'electric_shower', electrical: { manual: false, ...elec } },
    ...extra,
  };
}

export const house = (extra: Record<string, unknown> = {}, elec: Record<string, unknown> = {}) => mk(gable, houseJson(extra, elec));
