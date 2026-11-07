/** Cotas automáticas da planta: paredes externas e aberturas. Puro. */
import type { HostWall, ResolvedOpening } from '@chalecad/engine';
import { add, rightNormal, scale, unit, sub, lerp, type V2 } from './geom';

export interface DimLine {
  id: string;
  /** Pontos medidos (sobre o eixo da parede). */
  a: V2;
  b: V2;
  /** Direção (unitária) para onde a linha de cota é deslocada. */
  normal: V2;
  /** Distância do eixo até a linha de cota (m). */
  offset: number;
  /** Medida (m). */
  value: number;
  label: string;
  kind: 'overall' | 'chain';
}

export const formatMeters = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Extremos da linha de cota (deslocados) e posição do texto. */
export function dimGeometry(d: DimLine): { p0: V2; p1: V2; text: V2 } {
  const o = scale(d.normal, d.offset);
  const p0 = add(d.a, o);
  const p1 = add(d.b, o);
  return { p0, p1, text: lerp(p0, p1, 0.5) };
}

/**
 * Cotas das paredes externas do nível: uma cota total por parede e, quando há aberturas, uma corrente
 * (borda do vão a borda do vão) mais próxima da parede. Fica do lado externo (`exteriorSide`).
 */
export function wallDimensions(
  walls: HostWall[],
  openings: ResolvedOpening[],
  level: string,
  opts: { chainOffset?: number; overallOffset?: number } = {},
): DimLine[] {
  const chainOffset = opts.chainOffset ?? 0.55;
  const overallOffset = opts.overallOffset ?? 1.0;
  const out: DimLine[] = [];
  for (const w of walls) {
    if (w.level !== level || w.kind !== 'exterior' || !w.exteriorSide) continue;
    const dir = unit(sub(w.to, w.from));
    const right = rightNormal(w.from, w.to);
    const normal: V2 = w.exteriorSide === 'right' ? right : [-right[0], -right[1]];
    const at = (u: number): V2 => add(w.from, scale(dir, u));
    const own = openings
      .filter((o) => o.valid && o.hostKind === 'wall' && o.hostId === w.id)
      .sort((p, q) => p.u0 - q.u0);
    if (own.length > 0) {
      const stops = [0, ...own.flatMap((o) => [o.u0, o.u1]), w.length];
      for (let i = 0; i + 1 < stops.length; i++) {
        const u0 = stops[i]!;
        const u1 = stops[i + 1]!;
        if (u1 - u0 < 0.02) continue;
        out.push({ id: `${w.id}:c${i}`, a: at(u0), b: at(u1), normal, offset: chainOffset, value: u1 - u0, label: formatMeters(u1 - u0), kind: 'chain' });
      }
    }
    out.push({ id: `${w.id}:total`, a: w.from, b: w.to, normal, offset: overallOffset, value: w.length, label: formatMeters(w.length), kind: 'overall' });
  }
  return out;
}

/** Trechos [u0, u1] do eixo da parede que ficam cheios na altura de corte (vãos que cruzam a cota abertos). */
export function solidIntervals(
  length: number,
  openings: Pick<ResolvedOpening, 'u0' | 'u1' | 'v0' | 'v1' | 'valid'>[],
  cutHeight: number,
): [number, number][] {
  const cuts = openings
    .filter((o) => o.valid && o.v0 < cutHeight && o.v1 > cutHeight)
    .sort((a, b) => a.u0 - b.u0);
  const out: [number, number][] = [];
  let cursor = 0;
  for (const o of cuts) {
    if (o.u0 > cursor) out.push([cursor, o.u0]);
    cursor = Math.max(cursor, o.u1);
  }
  if (cursor < length) out.push([cursor, length]);
  return out;
}
