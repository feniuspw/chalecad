import type { Pipe, WaterPoint } from '../../schema/project';
import type { Ctx, FixtureSpec } from './context';
import type { P2, V3 } from './vec';

/** Ponto gerado com os dados que o traçado precisa (cômodo e aparelho do catálogo). */
export interface GenPoint {
  pt: WaterPoint;
  roomId: string;
  spec: FixtureSpec;
  /** Cota absoluta do ponto de água (m). */
  z: number;
}

/** Tubo do contrato (z relativa ao piso do nível) a partir de um caminho em cota absoluta. */
export function toPipe(ctx: Ctx, id: string, system: Pipe['system'], level: string, abs: V3[]): Pipe {
  const e = ctx.elev(level);
  const r = (n: number) => Math.round(n * 1e6) / 1e6;
  return { id, system, level, path: abs.map((v): [number, number, number] => [r(v[0]), r(v[1]), r(v[2] - e)]) };
}

/** Contador de ids determinísticos `auto-<prefixo>-n`. */
export function idMaker(): (prefix: string) => string {
  const n = new Map<string, number>();
  return (prefix) => {
    const c = (n.get(prefix) ?? 0) + 1;
    n.set(prefix, c);
    return `auto-${prefix}-${c}`;
  };
}

export const mean2 = (ps: P2[]): P2 => [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length];
