import type { Ctx } from './context';
import { LOCAL } from './context';

export interface SepticSizing {
  occupants: number;
  /** Contribuição diária total N·C (L/dia). */
  dailyLiters: number;
  detentionDays: number;
  /** V = 1000 + N·(C·T + K·Lf) (L). */
  tankLiters: number;
  /** Filtro anaeróbio NBR 13969: 1,6·N·C·T, mínimo 1.000 L. */
  filterLiters: number;
}

/** Fossa séptica (NBR 7229): V = 1000 + N(C·T + K·Lf). */
export function sizeSeptic(ctx: Ctx, occupants: number): SepticSizing {
  const s = ctx.k.septic;
  const daily = occupants * s.contributionLpd;
  const row = s.detention.find((r) => daily <= r[0]) ?? s.detention[s.detention.length - 1]!;
  const t = row[1];
  const tank = 1000 + occupants * (s.contributionLpd * t + s.sludgeK * s.sludgeLf);
  const filter = Math.max(LOCAL.filter.minLiters, LOCAL.filter.factor * occupants * s.contributionLpd * t);
  return { occupants, dailyLiters: daily, detentionDays: t, tankLiters: Math.ceil(tank - 1e-9), filterLiters: Math.ceil(filter - 1e-9) };
}
