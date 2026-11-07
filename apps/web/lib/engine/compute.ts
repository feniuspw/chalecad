/**
 * Cálculo do projeto. Chama `computeAll` do motor quando existir; enquanto o motor completo não é
 * integrado, devolve um `Results` parcial só com o modelo 3D (demais campos vazios, tipados).
 */
import * as engine from '@chalecad/engine';
import { ENGINE_VERSION, buildModel, type Project, type Results } from '@chalecad/engine';
import type { Catalog } from '@chalecad/catalog';

export interface ComputeOptions {
  today?: string;
}

type ComputeAll = (project: Project, catalog: Catalog, opts?: ComputeOptions) => Results;

/** Chave em variável: o bundler não tenta resolver `computeAll` estaticamente (ainda pode não existir). */
const COMPUTE_ALL_KEY = 'computeAll';

export const PARTIAL_WARNING_CODE = 'engine.partial';

function findComputeAll(): ComputeAll | null {
  const fn = (engine as unknown as Record<string, unknown>)[COMPUTE_ALL_KEY];
  return typeof fn === 'function' ? (fn as ComputeAll) : null;
}

export function computeProject(project: Project, catalog: Catalog, opts?: ComputeOptions): Results {
  const full = findComputeAll();
  if (full) return full(project, catalog, opts);
  return computePartial(project, catalog);
}

/** Resultado parcial: só `model`. Os demais campos têm o formato correto, porém zerados. */
export function computePartial(project: Project, catalog: Catalog): Results {
  const t0 = performance.now();
  const model = buildModel(project, catalog);
  const t1 = performance.now();
  const roofArea = model.roofPlanes.reduce((a, p) => a + p.area, 0);
  const slabArea = (kind: string) => model.slabs.filter((s) => s.kind === kind).reduce((a, s) => a + s.area, 0);
  return {
    engineVersion: ENGINE_VERSION,
    catalogVersion: catalog.version,
    model,
    pieces: [],
    quantities: {
      lines: [],
      cutPlans: [],
      areas: {
        footprint: model.footprintArea,
        built: model.builtArea,
        roof: roofArea,
        exteriorWallsNet: 0,
        interiorWallsNet: 0,
        openings: 0,
        radier: slabArea('radier'),
        mezzanine: slabArea('mezzanine'),
      },
      steelKg: 0,
      steelKgPerM2: 0,
    },
    weight: { totalKg: 0, superstructureKg: 0, byStage: {}, byElement: [], kgPerM2: 0 },
    structure: null,
    budget: {
      lines: [],
      byStage: [],
      material: 0,
      labor: 0,
      freight: 0,
      subtotal: 0,
      contingency: 0,
      total: 0,
      totalMax: 0,
      perM2: 0,
      schedule: [],
      missingPrices: [],
      stalePrices: [],
    },
    terrain: null,
    warnings: [
      {
        code: PARTIAL_WARNING_CODE,
        severity: 'info',
        message: 'Motor completo ainda não conectado: quantitativos, peso e orçamento aparecerão aqui.',
      },
    ],
    timingsMs: { model: t1 - t0, total: t1 - t0 },
  };
}
