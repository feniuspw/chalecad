/** Geometria e rótulos do traçado hidráulico (puro). Coordenadas do motor: [x, y, z] com z para cima, em metros. */
import type { Pipe, PipeSystem, Project } from '@chalecad/engine';

export type V2 = [number, number];
export type V3 = [number, number, number];

/** Tolerância de coincidência das pontas dos tubos (igual à do motor, 2 cm). */
export const TOL = 0.02;

export const SYSTEMS: PipeSystem[] = ['cold', 'hot', 'sewer', 'vent'];
export const SYSTEM_LABEL: Record<PipeSystem, string> = { cold: 'Água fria', hot: 'Água quente', sewer: 'Esgoto', vent: 'Ventilação' };
export const SYSTEM_SHORT: Record<PipeSystem, string> = { cold: 'AF', hot: 'AQ', sewer: 'ES', vent: 'VE' };
/** Cores de reserva (as oficiais vêm do catálogo: `plumbing.colors`). */
export const FALLBACK_COLORS: Record<PipeSystem, string> = { cold: '#1E88E5', hot: '#E53935', sewer: '#6D4C41', vent: '#43A047' };

export const dist2 = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!);
export const dist3 = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

export function pathLength(path: readonly V3[]): number {
  let s = 0;
  for (let i = 1; i < path.length; i++) s += dist3(path[i - 1]!, path[i]!);
  return s;
}

/** Comprimento em planta. */
export function planLength(path: readonly V3[]): number {
  let s = 0;
  for (let i = 1; i < path.length; i++) s += dist2(path[i - 1]!, path[i]!);
  return s;
}

/** Tubo só vertical (prumada: sobe ou desce sem andar em planta). */
export const isVertical = (path: readonly V3[]): boolean => path.length >= 2 && path.every((p) => dist2(p, path[0]!) < 1e-3) && Math.abs(path[0]![2] - path[path.length - 1]![2]) > 1e-3;

/** Remove vértices repetidos em sequência. */
export function dedupe(path: V3[], eps = 1e-6): V3[] {
  const out: V3[] = [];
  for (const p of path) {
    const last = out[out.length - 1];
    if (!last || dist3(last, p) > eps) out.push(p);
  }
  return out;
}

export const levelElevation = (project: Pick<Project, 'levels'>, id: string): number => project.levels.find((l) => l.id === id)?.elevation ?? 0;

export const groundElevation = (project: Pick<Project, 'levels'>): number => Math.min(...project.levels.map((l) => l.elevation));

/** Sistemas ao quais cada um pode se ligar (ponta ou trecho): a água quente sai da fria (aquecedor), a ventilação do esgoto. */
export const CONNECTS_TO: Record<PipeSystem, PipeSystem[]> = { cold: ['cold'], hot: ['hot', 'cold'], sewer: ['sewer'], vent: ['vent', 'sewer'] };

export const pipeLabel = (p: Pick<Pipe, 'id' | 'system'>): string => `${SYSTEM_SHORT[p.system]} ${p.id.replace(/^auto-/, '')}`;

/** m.c.a. e kPa em texto pt-BR. */
export const fmtM = (n: number, d = 2): string => n.toFixed(d).replace('.', ',');
