import type { Vec2 } from '../../geometry';
import { conductorArea } from './tables';
import type { ElecK } from './types';

const DROP_MIN = 0.01;

/** Comprimento (m) e curvas de 90° equivalentes de um eletroduto: voltas em planta + uma curva por descida/subida. */
export function pathStats(path: Vec2[], dropA: number, dropB: number): { horizontal: number; length: number; bends90: number } {
  let horizontal = 0;
  let turns = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    horizontal += Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (i < path.length - 1) {
      const c = path[i + 1]!;
      const u: Vec2 = [b[0] - a[0], b[1] - a[1]];
      const v: Vec2 = [c[0] - b[0], c[1] - b[1]];
      const lu = Math.hypot(u[0], u[1]);
      const lv = Math.hypot(v[0], v[1]);
      if (lu > 0.01 && lv > 0.01) {
        const cos = Math.min(1, Math.max(-1, (u[0] * v[0] + u[1] * v[1]) / (lu * lv)));
        const deg = (Math.acos(cos) * 180) / Math.PI;
        if (deg >= 5) turns += deg / 90;
      }
    }
  }
  const drops = (dropA > DROP_MIN ? 1 : 0) + (dropB > DROP_MIN ? 1 : 0);
  return { horizontal, length: horizontal + dropA + dropB, bends90: Math.ceil(turns + drops - 0.01) };
}

/** Comprimento máximo entre caixas (m) para essa quantidade de curvas (NBR 5410 6.2.11.1.6). */
export const maxRunLength = (k: ElecK, bends90: number): number => k.conduit.maxStraight - k.conduit.reducePerBend90 * bends90;

/** O trecho respeita 15 m − 3 m por curva e no máximo 3 curvas? */
export function runOk(k: ElecK, s: { length: number; bends90: number }): boolean {
  return s.bends90 <= k.conduit.maxBends90 && s.length <= maxRunLength(k, s.bends90) + 1e-9;
}

/** Limite de ocupação pela quantidade de condutores: 53% (1), 31% (2), 40% (3 ou mais). */
export function fillLimit(k: ElecK, conductors: number): number {
  return conductors <= 1 ? k.conduit.fillMax.one : conductors === 2 ? k.conduit.fillMax.two : k.conduit.fillMax.many;
}

/** Ocupação (fração) de um eletroduto de diâmetro interno `di` (mm) com os condutores dados (seções em mm²). */
export function fillFraction(k: ElecK, sections: number[], di: number): number {
  const used = sections.reduce((s, x) => s + conductorArea(k, x), 0);
  return used / ((Math.PI * di * di) / 4);
}

/** Menor DN comercial (≥ DN mínimo do catálogo) cuja ocupação respeita o limite; o maior se nenhum serve. */
export function conduitDn(k: ElecK, sections: number[]): { dn: number; di: number; fill: number; limit: number } {
  const sizes = [...k.conduit.sizes].filter((s) => s.dn >= k.conduit.minDn).sort((a, b) => a.dn - b.dn);
  const limit = fillLimit(k, sections.length);
  for (const s of sizes) {
    const f = fillFraction(k, sections, s.di);
    if (f <= limit + 1e-9) return { dn: s.dn, di: s.di, fill: f, limit };
  }
  const last = sizes[sizes.length - 1]!;
  return { dn: last.dn, di: last.di, fill: fillFraction(k, sections, last.di), limit };
}
