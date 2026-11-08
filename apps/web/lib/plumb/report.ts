/** Linhas de resultado da hidráulica para o selo na planta, a aba de resultados e o PDF (puro). */
import type { PlumbingReport, Project, WaterPipeResult, WaterPointResult } from '@chalecad/engine';
import { fmtM, SYSTEM_LABEL } from './geometry';
import type { PlumbingK } from './zdefaults';

export interface PressureRow {
  pointId: string;
  label: string;
  fixture: string;
  system: 'cold' | 'hot';
  levelName: string;
  /** Pressão dinâmica (m.c.a. e kPa) e mínimo exigido. */
  mca: number;
  kpa: number;
  minMca: number;
  minKpa: number;
  staticMca: number;
  lossMca: number;
  ok: boolean;
  /** Quanto a caixa precisa subir (m); 0 se atende. */
  rise: number;
  path: string[];
}

export const levelName = (project: Pick<Project, 'levels'>, id: string): string => {
  const l = project.levels.find((x) => x.id === id);
  if (!l) return id;
  return l.name ?? (l.elevation === 0 ? 'Térreo' : `Nível ${fmtM(l.elevation, 1)} m`);
};

export function pressureRows(report: PlumbingReport, project: Pick<Project, 'levels'>, k: PlumbingK): PressureRow[] {
  const byId = new Map(report.layout.points.map((p) => [p.id, p]));
  return report.water.points.map((r: WaterPointResult): PressureRow => {
    const pt = byId.get(r.pointId);
    const spec = k.water.fixtures[r.fixture];
    return {
      pointId: r.pointId,
      label: pt?.label ?? spec?.label ?? r.fixture,
      fixture: spec?.label ?? r.fixture,
      system: r.system,
      levelName: pt ? levelName(project, pt.level) : '',
      mca: r.dynamicHead,
      kpa: r.dynamicKpa,
      minMca: r.minKpa / k.kPaPerMca,
      minKpa: r.minKpa,
      staticMca: r.staticHead,
      lossMca: r.headLoss,
      ok: r.ok,
      rise: r.ok ? 0 : r.requiredTankRise,
      path: r.path,
    };
  });
}

/** Uma linha por ponto para o selo: a que falha (a pior) se houver, senão a de água fria. */
export function sealRows(rows: PressureRow[]): Map<string, PressureRow> {
  const out = new Map<string, PressureRow>();
  for (const r of rows) {
    const cur = out.get(r.pointId);
    if (!cur || (cur.ok && !r.ok) || (cur.ok === r.ok && r.system === 'cold')) out.set(r.pointId, r);
  }
  return out;
}

export const sealText = (r: Pick<PressureRow, 'mca' | 'kpa'>): string => `${fmtM(Math.max(0, r.mca))} m.c.a. · ${fmtM(Math.max(0, r.kpa), 1)} kPa`;
export const sealMissing = (r: Pick<PressureRow, 'ok' | 'rise'>): string | null => (r.ok ? null : `faltam ${fmtM(r.rise)} m`);

export interface WaterPipeRow extends WaterPipeResult {
  systemLabel: string;
}
export const waterPipeRows = (report: PlumbingReport): WaterPipeRow[] => report.water.pipes.map((p) => ({ ...p, systemLabel: SYSTEM_LABEL[p.system] }));

/** Ids de tubos da água (e do ponto) no caminho crítico do ponto escolhido. */
export function criticalPath(report: PlumbingReport, pointId: string | null): Set<string> {
  if (!pointId) return new Set();
  const ids = new Set<string>();
  for (const r of report.water.points) if (r.pointId === pointId) for (const id of r.path) ids.add(id);
  return ids;
}

/** Pior folga de pressão (m.c.a.) do traçado, ou null sem pontos. */
export const worstMargin = (rows: PressureRow[]): number | null => (rows.length === 0 ? null : Math.min(...rows.map((r) => r.mca - r.minMca)));
