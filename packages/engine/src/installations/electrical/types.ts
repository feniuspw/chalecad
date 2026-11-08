import type { Catalog } from '@chalecad/catalog';
import type { Vec2 } from '../../geometry';
import type { ElecPoint } from '../../schema/project';
import type { Project } from '../../schema/project';
import type { BuildingModel, RoomModel } from '../../schema/results';

/** Constantes do bloco `electrical` do catálogo. */
export type ElecK = Catalog['constants']['electrical'];

/** Contexto de um cálculo: tudo que os módulos precisam, sem repetir buscas. */
export interface Ctx {
  project: Project;
  model: BuildingModel;
  catalog: Catalog;
  k: ElecK;
  /** Tensão fase-neutro (V). */
  voltage: number;
  /** Cômodos com polígono. */
  rooms: RoomModel[];
  /** Cota do piso de cada nível. */
  elev: Map<string, number>;
  /** Assemblies de parede com isolamento na cavidade (método A1 nos eletrodutos de parede). */
  insulatedAssemblies: Set<string>;
}

/** Ponto com os dados derivados que o cálculo usa. */
export interface PointInfo {
  p: ElecPoint;
  roomId: string | null;
  /** Potência de projeto (VA); 0 em interruptor e infraestrutura seca. */
  loadVA: number;
  /** Corrente de projeto (A). */
  ib: number;
  /** Cota absoluta da caixa (m). */
  zBox: number;
  /** Cota absoluta do forro no ponto (m). */
  zCeiling: number;
}

export const EPS = 1e-9;
export const dist2 = (a: Vec2, b: Vec2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const manhattan = (a: Vec2, b: Vec2): number => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
/** Arredonda para evitar ruído de ponto flutuante nos resultados. */
export const r2 = (n: number): number => Math.round(n * 100) / 100;
export const fmt = (n: number, d = 1): string => n.toFixed(d).replace('.', ',');

/** Pontos que carregam condutores de circuito (tudo menos infraestrutura seca). */
export const isCircuitPoint = (p: ElecPoint): boolean => p.kind !== 'data';
