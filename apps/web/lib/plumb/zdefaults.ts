/** Cotas padrão do traçado (puro): água no forro, esgoto sob o piso com declividade pelo DN, ventilação acima do telhado. */
import type { TechnicalConstants } from '@chalecad/catalog';
import { roofBelowAt, type BuildingModel, type PipeSystem, type PlumbingLayout, type Project } from '@chalecad/engine';
import { dedupe, groundElevation, levelElevation, type V2, type V3 } from './geometry';
import type { PipeSnap } from './snapTypes';

export type PlumbingK = TechnicalConstants['plumbing'];

export interface PlumbEnv {
  project: Project;
  model: BuildingModel;
  layout: PlumbingLayout;
  k: PlumbingK;
  levelId: string;
}

/** Folga do tubo de água sob o forro (m). */
export const CEILING_DROP = 0.1;
/** Pé-direito usado fora de qualquer cômodo (m). */
export const FALLBACK_CEILING = 2.6;
/** Folga extra do esgoto de um pavimento superior sob o piso dele (m), como o gerador do motor. */
export const UPPER_BRANCH_MARGIN = 0.15;

const inside = (p: V2, poly: readonly (readonly number[])[]): boolean => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a[1]! > p[1] !== b[1]! > p[1] && p[0] < ((b[0]! - a[0]!) * (p[1] - a[1]!)) / (b[1]! - a[1]!) + a[0]!) c = !c;
  }
  return c;
};

/** Cota do forro (m acima do piso do nível) sobre um ponto: menor pé-direito do cômodo; sem cômodo, a altura do nível. */
export function ceilingHeight(env: Pick<PlumbEnv, 'project' | 'model' | 'levelId'>, xy: V2): number {
  const room = env.model.rooms.find((r) => r.level === env.levelId && r.polygon && inside(xy, r.polygon));
  return Math.max(0.8, room ? room.ceiling.min : FALLBACK_CEILING);
}

/** Cota padrão da água: forro menos 10 cm (m do piso do nível). */
export const waterZ = (env: Pick<PlumbEnv, 'project' | 'model' | 'levelId'>, xy: V2): number => ceilingHeight(env, xy) - CEILING_DROP;

/** Cota inicial padrão do esgoto (m do piso do nível): sob o piso na profundidade do catálogo. */
export function sewerStartZ(env: Pick<PlumbEnv, 'project' | 'k' | 'levelId'>): number {
  const upper = levelElevation(env.project, env.levelId) > groundElevation(env.project) + 1e-6;
  return -env.k.sewer.startDepth - (upper ? UPPER_BRANCH_MARGIN : 0);
}

/** Declividade padrão do esgoto pelo DN (a mesma do motor quando `slope` falta). */
export function defaultSlope(k: PlumbingK, dn?: number): number {
  return (dn ?? 0) >= 100 ? k.sewer.slopeMin.from100 : k.sewer.slopeMin.upTo75;
}

export interface DrawVertex {
  xy: V2;
  snap?: PipeSnap | undefined;
}

/**
 * Caminho 3D (z relativa ao piso do nível) de um tubo desenhado em planta.
 * Água: no forro, descendo ou subindo na vertical até o ponto ou a caixa. Esgoto: do início (montante) para o fim
 * (jusante) com a declividade pelo DN, ou interpolando quando as duas pontas já têm cota. Ventilação: sobe do esgoto até
 * 30 cm acima do telhado e segue por cima.
 */
export function buildPipePath(system: PipeSystem, verts: DrawVertex[], env: PlumbEnv, opts: { dn?: number; slope?: number } = {}): V3[] {
  if (verts.length === 0) return [];
  const last = verts.length - 1;
  if (system === 'cold' || system === 'hot') {
    const out: V3[] = [];
    verts.forEach((v, i) => {
      const [x, y] = v.xy;
      const zd = waterZ(env, v.xy);
      const za = v.snap?.z;
      if (za === undefined || Math.abs(za - zd) < 1e-6) out.push([x, y, za ?? zd]);
      else if (i === 0) out.push([x, y, za], [x, y, zd]);
      else if (i === last) out.push([x, y, zd], [x, y, za]);
      else out.push([x, y, za]);
    });
    return dedupe(out);
  }
  if (system === 'sewer') {
    const cum: number[] = [0];
    for (let i = 1; i < verts.length; i++) cum.push(cum[i - 1]! + Math.hypot(verts[i]!.xy[0] - verts[i - 1]!.xy[0], verts[i]!.xy[1] - verts[i - 1]!.xy[1]));
    const total = cum[last]!;
    const s = opts.slope ?? defaultSlope(env.k, opts.dn);
    const z0 = verts[0]!.snap?.z;
    const zN = verts[last]!.snap?.z;
    const zAt = (i: number): number => {
      const l = cum[i]!;
      if (z0 !== undefined && zN !== undefined) return total > 1e-9 ? z0 + ((zN - z0) * l) / total : z0;
      if (z0 !== undefined) return z0 - s * l;
      if (zN !== undefined) return zN + s * (total - l);
      return sewerStartZ(env) - s * l;
    };
    return dedupe(verts.map((v, i): V3 => [v.xy[0], v.xy[1], zAt(i)]));
  }
  // ventilação
  const elev = levelElevation(env.project, env.levelId);
  let top = -Infinity;
  for (const v of verts) {
    const roof = roofBelowAt(env.model.roofPlanes, v.xy);
    top = Math.max(top, (roof ?? env.model.ridgeHeight) + env.k.sewer.ventTerminalAboveRoof - elev);
  }
  const first = verts[0]!;
  const zStart = first.snap?.z ?? sewerStartZ(env);
  top = Math.max(top, zStart + 0.5);
  const out: V3[] = [[first.xy[0], first.xy[1], zStart]];
  for (const v of verts) out.push([v.xy[0], v.xy[1], top]);
  return dedupe(out);
}

