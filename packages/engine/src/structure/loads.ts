import type { Catalog } from '@chalecad/catalog';
import type { Project } from '../schema/project';
import type { BuildingModel, StructuralReport, WeightReport } from '../schema/results';
import { G } from './capacity';

export type Loads = StructuralReport['loads'];

export interface LoadSet {
  report: Loads;
  /** Permanente da cobertura por m² inclinado (peso próprio + sobreposta), kPa. */
  roofDeadKPa: number;
  /** Peso próprio do mezanino por laje (kPa), sem a sobreposta. */
  slabSelfKPa: Map<string, number>;
  windV: { vk: number };
}

/** Pressão dinâmica do vento (NBR 6123): Vk = V0·S1·S2·S3, q = 0,613·Vk² (N/m²). Retorna Vk (m/s) e q (kPa). */
export function windPressure(project: Project, catalog: Catalog): { vk: number; qKPa: number } {
  const l = catalog.constants.loads;
  const s2 = l.s2ByCategory[project.design.terrainCategory - 1] ?? 1;
  const vk = project.design.windV0 * l.s1 * s2 * l.s3;
  return { vk, qKPa: (0.613 * vk * vk) / 1000 };
}

const isRoofId = (id: string) => /^(?:wing-)?roof-/.test(id);

export function computeLoads(project: Project, model: BuildingModel, weight: WeightReport, catalog: Catalog): LoadSet {
  const l = catalog.constants.loads;
  const { vk, qKPa } = windPressure(project, catalog);

  const roofArea = model.roofPlanes.reduce((a, p) => a + p.area, 0);
  const roofKg = weight.byElement.filter((e) => isRoofId(e.id)).reduce((a, e) => a + e.kg, 0);
  const roofSelf = roofArea > 0 ? (roofKg * G) / 1000 / roofArea : 0;
  const roofDeadKPa = roofSelf + l.superimposedRoof;

  const slabSelfKPa = new Map<string, number>();
  let floorArea = 0;
  let floorDeadSum = 0;
  for (const s of model.slabs) {
    if (s.kind !== 'mezzanine' || !(s.area > 0)) continue;
    const kg = weight.byElement.find((e) => e.id === s.id)?.kg ?? 0;
    const self = (kg * G) / 1000 / s.area;
    slabSelfKPa.set(s.id, self);
    floorArea += s.area;
    floorDeadSum += (self + l.superimposedFloor) * s.area;
  }
  const deadFloorKPa = floorArea > 0 ? floorDeadSum / floorArea : l.superimposedFloor;

  return {
    report: {
      deadRoofKPa: roofDeadKPa,
      liveRoofKPa: l.liveRoof,
      deadFloorKPa,
      liveFloorKPa: l.liveMezzanine,
      windQKPa: qKPa,
      windWallKPa: qKPa * (l.cpeWall + Math.abs(l.cpi)),
      windRoofUpliftKPa: qKPa * (l.cpeRoofUplift + Math.abs(l.cpi)),
    },
    roofDeadKPa,
    slabSelfKPa,
    windV: { vk },
  };
}
