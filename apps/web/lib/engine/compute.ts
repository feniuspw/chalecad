/**
 * Cálculo do projeto: `computeAll` do motor. `computePartial` (só o modelo 3D) fica como reserva
 * para quando o pipeline completo falhar, para o usuário não perder a vista 3D.
 */
import { ENGINE_VERSION, buildModel, computeAll, type Project, type Results } from '@chalecad/engine';
import type { Catalog } from '@chalecad/catalog';

export interface ComputeOptions {
  today?: string;
}

export const PARTIAL_WARNING_CODE = 'engine.partial';

export function computeProject(project: Project, catalog: Catalog, opts?: ComputeOptions): Results {
  return computeAll(project, catalog, opts);
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
      woodM3: 0,
      woodM3PerM2: 0,
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
    installations: null,
    performance: null,
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
