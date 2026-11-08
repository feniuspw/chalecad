import type { Profile } from '../schema';
import { sectionProperties } from './section';

const WEBS = [90, 140, 200, 250] as const;
const THICKNESSES = [0.8, 0.95, 1.25] as const;
const FLANGE = 40;
const LIP = 12;

function fmt(n: number): string {
  return String(n);
}

function make(
  family: Profile['family'],
  id: string,
  name: string,
  web: number,
  flange: number,
  lip: number,
  thickness: number,
  barLengths: number[],
  priceItemIds: string[],
): Profile {
  const s = sectionProperties(family, web, flange, lip, thickness);
  return {
    id,
    family,
    name,
    web,
    flange,
    lip,
    thickness,
    massPerM: s.massPerM,
    area: s.area,
    Ix: s.Ix,
    Wx: s.Wx,
    Iy: s.Iy,
    Wy: s.Wy,
    rx: s.rx,
    ry: s.ry,
    fy: 230,
    material: 'steel',
    barLengths,
    priceItemIds,
  };
}

function bars(id: string): { barLengths: number[]; priceItemIds: string[] } {
  return { barLengths: [3, 6], priceItemIds: [`bar-${id}-3m`, `bar-${id}-6m`] };
}

const list: Profile[] = [];

for (const web of WEBS) {
  for (const t of THICKNESSES) {
    const id = `Ue${web}x${FLANGE}x${fmt(t)}`;
    const b = bars(id);
    list.push(
      make('Ue', id, `Montante Ue ${web}x${FLANGE}x${LIP}x${fmt(t)} mm`, web, FLANGE, LIP, t, b.barLengths, b.priceItemIds),
    );
  }
}
for (const web of WEBS) {
  for (const t of THICKNESSES) {
    const id = `U${web}x${FLANGE}x${fmt(t)}`;
    const b = bars(id);
    list.push(make('U', id, `Guia U ${web}x${FLANGE}x${fmt(t)} mm`, web, FLANGE, 0, t, b.barLengths, b.priceItemIds));
  }
}
{
  const id = 'Cr50x0.95';
  const b = bars(id);
  list.push(make('Cr', id, 'Cartola 20x30x12x0,95 mm', 30, 20, 12, 0.95, b.barLengths, b.priceItemIds));
}
for (const w of [70, 100]) {
  const id = `Fita${w}x0.95`;
  list.push(make('Fita', id, `Fita de aço ${w}x0,95 mm`, w, 0, 0, 0.95, [50], [`roll-${id}`]));
}

// Wood frame: pinus tratado em autoclave, seções usuais (38 mm de espessura), classe C25. Massa = 550 kg/m³.
const WOOD_DENSITY = 550;
for (const [b, h, name] of [
  [38, 89, 'Montante/guia de madeira 38 x 89 mm'],
  [38, 140, 'Montante/caibro de madeira 38 x 140 mm'],
  [38, 184, 'Viga/caibro de madeira 38 x 184 mm'],
  [38, 235, 'Viga de madeira 38 x 235 mm'],
  [25, 50, 'Sarrafo de madeira 25 x 50 mm (ripa/terça)'],
] as const) {
  const id = `W${b}x${h}`;
  const s = sectionProperties('Wood', h, b, 0, b);
  list.push({
    id,
    family: 'Wood',
    name,
    web: h,
    flange: b,
    lip: 0,
    thickness: b,
    massPerM: (s.area / 1e4) * WOOD_DENSITY,
    area: s.area,
    Ix: s.Ix,
    Wx: s.Wx,
    Iy: s.Iy,
    Wy: s.Wy,
    rx: s.rx,
    ry: s.ry,
    fy: 230,
    material: 'wood',
    woodClass: 'C25',
    barLengths: [3, 4.2, 6],
    priceItemIds: [`wood-${id}-3m`, `wood-${id}-4.2m`, `wood-${id}-6m`],
  });
}

export const profiles: Profile[] = list;
