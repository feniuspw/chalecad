/** Comparação de variantes: geração da variante B e tabela de diferenças (A × B). */
import { produce } from 'immer';
import type { Project, Results, Stage, TypologyKind } from '@chalecad/engine';
import { switchTypology } from './edit';
import { makeSlopedSite } from './terrain';

export type VariantSpec =
  | { kind: 'typology'; typology: TypologyKind }
  | { kind: 'spacing'; spacing: 0.4 | 0.6 }
  | { kind: 'slope'; pct: number }
  | { kind: 'project'; project: Project };

/** Gera a variante B a partir de A. Não altera A. */
export function makeVariant(base: Project, spec: VariantSpec): Project {
  switch (spec.kind) {
    case 'project':
      return spec.project;
    case 'typology':
      return produce(base, (d) => void switchTypology(d, spec.typology));
    case 'spacing':
      return produce(base, (d) => void (d.system.studSpacing = spec.spacing));
    case 'slope':
      return produce(base, (d) => {
        if (spec.pct <= 0) {
          d.site = { type: 'flat' };
        } else if (d.site.type === 'sloped') {
          d.site.slopePct = spec.pct;
        } else {
          d.site = makeSlopedSite({ slopePct: spec.pct });
        }
      });
  }
}

export interface Metrics {
  total: number;
  totalMax: number;
  perM2: number;
  builtArea: number;
  weightKg: number;
  steelKgPerM2: number;
  /** Volume de madeira por m² construído (null quando não há madeira estrutural ou o motor não calcula). */
  woodM3PerM2: number | null;
  pieces: number;
  /** Pior taxa de uso estrutural (null sem verificações). */
  worstRatio: number | null;
  alerts: number;
}

export function metricsOf(r: Results): Metrics {
  return {
    total: r.budget.total,
    totalMax: r.budget.totalMax,
    perM2: r.budget.perM2,
    builtArea: r.model.builtArea,
    weightKg: r.weight.totalKg,
    steelKgPerM2: r.quantities.steelKgPerM2,
    woodM3PerM2: r.quantities.woodM3 > 0 ? r.quantities.woodM3PerM2 : null,
    pieces: r.pieces.length,
    worstRatio: r.structure && r.structure.checks.length ? r.structure.summary.maxRatio : null,
    alerts: r.warnings.filter((w) => w.severity !== 'info').length,
  };
}

export type RowKey = keyof Metrics;
export type Winner = 'a' | 'b' | 'tie' | 'none';

export interface DiffRow {
  key: RowKey;
  label: string;
  unit: 'brl' | 'brl_m2' | 'm2' | 'kg' | 'kg_m2' | 'm3_m2' | 'count' | 'ratio';
  a: number | null;
  b: number | null;
  /** b - a (null se algum lado não tem valor). */
  delta: number | null;
  /** Variação relativa em % de B sobre A. */
  deltaPct: number | null;
  /** Quem é melhor (menor é melhor em tudo exceto a área construída, que é neutra). */
  winner: Winner;
}

const ROWS: { key: RowKey; label: string; unit: DiffRow['unit']; neutral?: boolean; eps: number }[] = [
  { key: 'total', label: 'Custo total', unit: 'brl', eps: 1 },
  { key: 'totalMax', label: 'Custo (máximo da faixa)', unit: 'brl', eps: 1 },
  { key: 'perM2', label: 'Custo por m²', unit: 'brl_m2', eps: 1 },
  { key: 'builtArea', label: 'Área construída', unit: 'm2', neutral: true, eps: 0.005 },
  { key: 'weightKg', label: 'Peso total', unit: 'kg', eps: 1 },
  { key: 'steelKgPerM2', label: 'Aço (kg/m²)', unit: 'kg_m2', eps: 0.05 },
  { key: 'woodM3PerM2', label: 'Madeira (m³/m²)', unit: 'm3_m2', eps: 0.001 },
  { key: 'pieces', label: 'Nº de peças', unit: 'count', eps: 0.5 },
  { key: 'worstRatio', label: 'Pior taxa estrutural', unit: 'ratio', eps: 0.005 },
  { key: 'alerts', label: 'Alertas', unit: 'count', eps: 0.5 },
];

export function diffMetrics(a: Metrics, b: Metrics): DiffRow[] {
  return ROWS.map((r) => {
    const va = a[r.key];
    const vb = b[r.key];
    const delta = va === null || vb === null ? null : vb - va;
    const deltaPct = delta === null || !va ? null : (delta / Math.abs(va)) * 100;
    let winner: Winner = 'none';
    if (delta !== null) winner = Math.abs(delta) < r.eps ? 'tie' : r.neutral ? 'none' : delta < 0 ? 'b' : 'a';
    return { key: r.key, label: r.label, unit: r.unit, a: va, b: vb, delta, deltaPct, winner };
  });
}

export interface StageDiff {
  stage: Stage;
  a: number;
  b: number;
  delta: number;
}

/** Diferença do orçamento por etapa (união das etapas das duas variantes). */
export function stageDiffs(a: Results, b: Results): StageDiff[] {
  const ma = new Map(a.budget.byStage.map((s) => [s.stage, s.total]));
  const mb = new Map(b.budget.byStage.map((s) => [s.stage, s.total]));
  const stages = [...new Set([...ma.keys(), ...mb.keys()])];
  return stages.map((stage) => ({ stage, a: ma.get(stage) ?? 0, b: mb.get(stage) ?? 0, delta: (mb.get(stage) ?? 0) - (ma.get(stage) ?? 0) }));
}
