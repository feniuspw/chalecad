import type { Results } from '@chalecad/engine';
import type { Diffs, MetricKey } from './types';

export type Metrics = Record<MetricKey, number | null>;

const r = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

export function metricsOf(results: Results): Metrics {
  return {
    total: r(results.budget.total, 0),
    perM2: r(results.budget.perM2, 0),
    weightKg: r(results.weight.totalKg, 0),
    steelKgPerM2: r(results.quantities.steelKgPerM2, 2),
    woodM3PerM2: results.quantities.woodM3 > 0 ? r(results.quantities.woodM3PerM2, 4) : null,
    worstRatio: results.structure ? r(results.structure.summary.maxRatio, 2) : null,
    warnings: results.warnings.filter((w) => w.severity !== 'info').length,
  };
}

export function diffMetrics(before: Metrics, after: Metrics): Diffs {
  const keys = Object.keys(before) as MetricKey[];
  const out = {} as Diffs;
  for (const k of keys) {
    const b = before[k];
    const a = after[k];
    out[k] = { before: b, after: a, delta: b === null || a === null ? null : r(a - b, 2) };
  }
  return out;
}
