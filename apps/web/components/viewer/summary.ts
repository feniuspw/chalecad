/** Resumo do projeto para a página "Ver projeto". Funções puras (sem React nem store). */
import type { Project, Results, Stage } from '@chalecad/engine';
import { formatArea, formatBRL, formatBRLRange } from '@/lib/format';
import { STAGE_ORDER, SYSTEM_LABELS, TYPOLOGY_LABELS, stageLabel } from '@/lib/pdf/labels';

export interface ViewerRoom {
  id: string;
  name: string;
  /** Área em m²; null quando o cômodo ainda não está num ambiente fechado. */
  area: number | null;
  areaLabel: string;
}

export interface ViewerStage {
  stage: Stage;
  label: string;
  total: number;
  totalLabel: string;
  /** Participação no custo bruto (0 a 1). */
  share: number;
}

export interface ViewerSummary {
  name: string;
  typologyLabel: string;
  systemLabel: string;
  builtArea: number;
  builtAreaLabel: string;
  rooms: ViewerRoom[];
  costMin: number;
  costMax: number;
  /** "R$ 100.000 a R$ 120.000"; "—" quando não há custo calculado. */
  costRangeLabel: string;
  totalLabel: string;
  perM2Label: string;
  stages: ViewerStage[];
}

export function viewerSummary(project: Project, results: Results): ViewerSummary {
  const { model, budget } = results;
  const structure = project.system.structure;
  const hasCost = budget.total > 0;

  const rooms = (model.rooms ?? []).map((r): ViewerRoom => {
    const closed = r.polygon !== null && r.area > 0;
    return { id: r.id, name: r.name, area: closed ? r.area : null, areaLabel: closed ? formatArea(r.area, 1) : 'aberto' };
  });

  const byStage = new Map(budget.byStage.map((s) => [s.stage, s]));
  const order: Stage[] = [...STAGE_ORDER, 'installations'].filter((s, i, a) => a.indexOf(s) === i) as Stage[];
  const present = order.filter((st) => (byStage.get(st)?.total ?? 0) > 0);
  const sum = present.reduce((acc, st) => acc + (byStage.get(st)?.total ?? 0), 0);
  const stages = present.map((st): ViewerStage => {
    const total = byStage.get(st)?.total ?? 0;
    return { stage: st, label: stageLabel(st, structure), total, totalLabel: formatBRL(total, 0), share: sum > 0 ? total / sum : 0 };
  });

  return {
    name: project.meta.name,
    typologyLabel: TYPOLOGY_LABELS[project.typology.kind],
    systemLabel: SYSTEM_LABELS[structure],
    builtArea: model.builtArea,
    builtAreaLabel: formatArea(model.builtArea, 1),
    rooms,
    costMin: budget.total,
    costMax: budget.totalMax,
    costRangeLabel: hasCost ? formatBRLRange(budget.total, budget.totalMax) : '—',
    totalLabel: hasCost ? formatBRL(budget.total, 0) : '—',
    perM2Label: hasCost ? `${formatBRL(budget.perM2, 0)}/m²` : '—',
    stages,
  };
}
