import type { Catalog } from '@chalecad/catalog';
import type { Project } from '../schema/project';
import { APPROVAL_NOTICE, type ApprovalReport, type DisciplineSummary, type Results } from '../schema/results';
import { computeArt } from './art';
import { DISCIPLINE_ORDER } from './common';
import { computeCompliance } from './compliance';
import { computeMemorials } from './memorials';
import { computeMissingInputs } from './missing';
import { computeSheets } from './sheets';
import { computeAreas, computeUrban } from './urban';

export { computeAreas, computeUrban, unionArea } from './urban';
export { computeCompliance } from './compliance';
export { computeMissingInputs } from './missing';
export { computeArt } from './art';
export { computeSheets } from './sheets';
export { computeMemorials } from './memorials';

/**
 * Relatório de aprovação (Fase 17): verificação normativa, índices urbanísticos, quadro de áreas, ficha da ART/RRT,
 * pranchas e memoriais. Função pura; recebe os `Results` já calculados (sem `approval`).
 */
export function computeApproval(project: Project, results: Results, catalog: Catalog): ApprovalReport {
  const areas = computeAreas(project, results.model);
  const urban = computeUrban(project, results.model, results, areas);
  const compliance = computeCompliance(project, results, catalog, urban);
  const missingInputs = computeMissingInputs(project, !!results.installations);
  const art = computeArt(project, results, catalog, areas);
  const sheets = computeSheets(project, results, catalog, urban);
  const memorials = computeMemorials(project, results, catalog, urban, areas);

  const summary: DisciplineSummary[] = [];
  for (const discipline of DISCIPLINE_ORDER) {
    const list = compliance.filter((i) => i.discipline === discipline);
    if (list.length === 0) continue;
    const count = (s: string) => list.filter((i) => i.status === s).length;
    summary.push({
      discipline,
      ok: count('ok'), warn: count('warn'), fail: count('fail'), manual: count('manual'), missing: count('missing'), na: count('na'),
      reviewed: list.filter((i) => i.review?.status === 'accepted' || i.review?.status === 'na').length,
    });
  }

  const resolved = (i: { review?: { status: string } }) => i.review?.status === 'accepted' || i.review?.status === 'na';
  const requiredKeys = new Set(missingInputs.filter((m) => m.required).map((m) => m.key));
  const ready =
    !compliance.some((i) => i.status === 'fail' && !resolved(i)) &&
    !compliance.some((i) => i.status === 'missing' && !resolved(i) && (i.needs ?? []).some((k) => requiredKeys.has(k))) &&
    requiredKeys.size === 0;

  return { stage: project.legal.stage, compliance, summary, missingInputs, urban, areas, art, sheets, memorials, ready, disclaimer: APPROVAL_NOTICE };
}
