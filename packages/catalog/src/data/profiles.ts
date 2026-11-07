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

export const profiles: Profile[] = list;
