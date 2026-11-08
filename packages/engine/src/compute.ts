import type { Catalog } from '@chalecad/catalog';
import { getPriceBook } from '@chalecad/catalog';
import { computeBudget } from './budget';
import { computeInstallations } from './installations';
import { loadProject } from './load';
import { buildModel } from './model';
import { computeQuantities } from './quantities';
import { computeStructure } from './structure';
import { computeTerrain } from './terrain';
import type { Project } from './schema/project';
import { ENGINE_VERSION } from './version';
import { generatePieces } from './framing';
import type { BuildingModel, Piece, Results } from './schema/results';
import { computeWarnings } from './warnings';
import { computeWeight } from './weight';

export interface ComputeOptions {
  /** YYYY-MM-DD. Padrão: data da base de preços (determinístico). */
  today?: string;
}

export interface ComputeDeps {
  generatePieces: (model: BuildingModel, project: Project, catalog: Catalog) => Piece[];
}

/**
 * Pipeline completo com o gerador de peças injetado. `computeAll` = `computeAllWith` com o
 * `generatePieces` de `./framing` (ligado pelo orquestrador na integração).
 */
export function computeAllWith(
  project: Project,
  catalog: Catalog,
  opts: ComputeOptions | undefined,
  deps: ComputeDeps,
): Results {
  const today = opts?.today ?? getPriceBook(catalog, project.priceBookId).date;
  const timingsMs: Record<string, number> = {};
  const t0 = performance.now();
  let t = t0;
  const lap = (name: string) => {
    const n = performance.now();
    timingsMs[name] = n - t;
    t = n;
  };

  const model = buildModel(project, catalog);
  lap('model');
  const pieces = deps.generatePieces(model, project, catalog);
  lap('framing');
  const terrainResult = computeTerrain(project, model, catalog);
  if (terrainResult) lap('terrain'); // só em terreno inclinado (flat mantém as mesmas chaves)
  // Instalações antes dos quantitativos: os itens da etapa `installations` entram na compra.
  const installs = computeInstallations(project, model, catalog);
  if (installs) lap('installations');
  const quantities = computeQuantities(model, pieces, project, catalog, terrainResult?.items, installs?.items);
  lap('quantities');
  const weight = computeWeight(model, pieces, quantities, project, catalog);
  lap('weight');
  const structure = computeStructure({ project, model, pieces, weight, catalog, quantities });
  lap('structure');
  const budget = computeBudget(quantities, weight, model, project, catalog, today);
  lap('budget');
  const warnings = computeWarnings({
    project,
    model,
    pieces,
    quantities,
    budget,
    catalog,
    terrainWarnings: terrainResult?.warnings,
    installationWarnings: installs?.warnings,
    structure,
  });
  lap('warnings');
  timingsMs.total = performance.now() - t0;

  return {
    engineVersion: ENGINE_VERSION,
    catalogVersion: catalog.version,
    model,
    pieces,
    quantities,
    weight,
    structure,
    budget,
    terrain: terrainResult?.report ?? null,
    installations: installs?.report ?? null,
    warnings,
    timingsMs,
  };
}

export type ComputeFromJsonResult =
  | { ok: true; results: Results; project: Project }
  | { ok: false; issues: { path: string; message: string }[] };

export function computeFromJsonWith(
  json: unknown,
  catalog: Catalog,
  opts: ComputeOptions | undefined,
  deps: ComputeDeps,
): ComputeFromJsonResult {
  const r = loadProject(json);
  if (!r.ok) return { ok: false, issues: r.issues };
  return { ok: true, results: computeAllWith(r.project, catalog, opts, deps), project: r.project };
}

const defaultDeps: ComputeDeps = { generatePieces };

/** Calcula tudo a partir de um projeto validado. Função principal chamada pelo Web Worker. */
export function computeAll(project: Project, catalog: Catalog, opts?: ComputeOptions): Results {
  return computeAllWith(project, catalog, opts, defaultDeps);
}

/** Valida o JSON e calcula. Nunca lança por erro de validação. */
export function computeFromJson(json: unknown, catalog: Catalog, opts?: ComputeOptions): ComputeFromJsonResult {
  return computeFromJsonWith(json, catalog, opts, defaultDeps);
}
