/** Traçado "ao vivo" e ambiente de desenho (puro): o manual vem do projeto (sem esperar o motor), o gerado do relatório. */
import { getCatalog } from '@chalecad/catalog';
import type { BuildingModel, PlumbingLayout, PlumbingReport, Project, Results } from '@chalecad/engine';
import type { PlumbEnv } from './zdefaults';

export function liveLayout(project: Project, report: PlumbingReport | null | undefined): PlumbingLayout | null {
  if (!report) return null;
  const pl = project.installations.plumbing;
  if (!pl.manual) return report.layout;
  const t = pl.tank;
  return {
    tank: t ? { ...report.layout.tank, level: t.level, position: [t.position[0], t.position[1]], bottomZ: t.bottomZ } : report.layout.tank,
    points: pl.points,
    pipes: pl.pipes,
  };
}

export const plumbingReportOf = (project: Project, results: Pick<Results, 'installations'> | null): PlumbingReport | null =>
  project.installations.enabled ? (results?.installations?.plumbing ?? null) : null;

export function makePlumbEnv(project: Project, model: BuildingModel, layout: PlumbingLayout, levelId: string): PlumbEnv {
  return { project, model, layout, k: getCatalog().constants.plumbing, levelId };
}
