import { lotPolygon } from '../approval/urban';
import type { Vec2 } from '../geometry';
import type { Lot } from '../schema/project';

/** Ponto em coordenadas do lote -> coordenadas do projeto (inversa de `toLot`: gira por -rotação depois de tirar o deslocamento). */
export function fromLot(p: Vec2, offset: Vec2, rotationDeg: number): Vec2 {
  const a = (-rotationDeg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const x = p[0] - offset[0];
  const y = p[1] - offset[1];
  return [x * c - y * s, x * s + y * c];
}

/** Contorno do lote nas coordenadas do projeto (as mesmas do terreno e da malha). */
export function lotInProject(lot: Lot): Vec2[] {
  return lotPolygon(lot).map((p) => fromLot(p, lot.buildingOffset, lot.rotationDeg));
}
