import { getProfile, type Catalog } from '@chalecad/catalog';
import type { Project, Stage } from '../schema/project';
import type { BuildingModel, Piece, QuantityReport, WeightReport } from '../schema/results';
import { collectItems } from '../quantities/items';

const WALL_LABELS: Record<string, string> = {
  'ext-front': 'Parede frontal',
  'ext-back': 'Parede dos fundos',
  'ext-left': 'Parede esquerda',
  'ext-right': 'Parede direita',
};

/**
 * Peso próprio líquido (não o comprado): aço das peças + camadas das paredes e águas + telha +
 * mezanino + concreto + escadas. `quantities.steelKg` é usado como conferência do aço.
 */
export function computeWeight(
  model: BuildingModel,
  pieces: Piece[],
  quantities: QuantityReport,
  project: Project,
  catalog: Catalog,
): WeightReport {
  const byStage: Partial<Record<Stage, number>> = {};
  const elements = new Map<string, number>();
  const mezzLevels = new Map(model.slabs.filter((s) => s.level && s.kind === 'mezzanine').map((s) => [s.level!, s.id]));
  const key = (hostId: string) => mezzLevels.get(hostId) ?? hostId;
  const add = (stage: Stage, hostId: string, kg: number) => {
    if (!(kg > 0)) return;
    byStage[stage] = (byStage[stage] ?? 0) + kg;
    const k = key(hostId);
    elements.set(k, (elements.get(k) ?? 0) + kg);
  };

  for (const p of pieces) add('structure', p.hostId, p.length * getProfile(catalog, p.profileId).massPerM);
  void quantities;
  for (const it of collectItems(model, project, catalog)) {
    if (it.inWeight) add(it.stage, it.hostId, it.kg);
  }

  const label = (id: string): string => {
    if (WALL_LABELS[id]) return WALL_LABELS[id];
    if (id === 'radier') return 'Radier';
    const roof = /^(?:wing-)?roof-([a-z0-9]+)$/.exec(id);
    if (roof) return `Água ${roof[1]!.toUpperCase()}`;
    if (model.slabs.some((s) => s.id === id && s.kind === 'mezzanine')) return 'Mezanino';
    if (model.stairs.some((s) => s.id === id)) return `Escada ${id}`;
    if (model.walls.some((w) => w.id === id)) return `Parede ${id}`;
    return id;
  };

  const totalKg = Object.values(byStage).reduce((a, b) => a + b, 0);
  const superstructureKg = totalKg - (byStage.foundation ?? 0);
  return {
    totalKg,
    superstructureKg,
    byStage,
    byElement: [...elements].map(([id, kg]) => ({ id, label: label(id), kg, hostIds: [id] })),
    kgPerM2: model.builtArea > 0 ? superstructureKg / model.builtArea : 0,
  };
}
