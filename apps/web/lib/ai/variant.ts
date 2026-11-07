import { computeAll, type Project, type Results } from '@chalecad/engine';
import type { Catalog } from '@chalecad/catalog';
import { diffMetrics, metricsOf } from './metrics';
import type { JsonPatchOp } from './patch';
import { tryPatch } from './try-patch';
import type { Diffs } from './types';

export { tryPatch, type PatchOutcome } from './try-patch';

export type SimulateOutcome = { ok: true; project: Project; results: Results; diffs: Diffs } | { ok: false; errors: string[] };

/** Valida o patch e roda o motor real na variante, comparando com o projeto atual. */
export function simulatePatch(project: Project, base: Results, ops: readonly JsonPatchOp[], catalog: Catalog): SimulateOutcome {
  const t = tryPatch(project, ops);
  if (!t.ok) return t;
  try {
    const results = computeAll(t.project, catalog);
    return { ok: true, project: t.project, results, diffs: diffMetrics(metricsOf(base), metricsOf(results)) };
  } catch {
    return { ok: false, errors: ['O motor não conseguiu calcular a variante (combinação inválida de parâmetros).'] };
  }
}
