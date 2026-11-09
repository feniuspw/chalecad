'use client';
import { useEffect, useMemo } from 'react';
import { getCatalog } from '@chalecad/catalog';
import type { BuildingModel } from '@chalecad/engine';
import { useEditor } from '@/lib/store/editor';
import { useElecUi } from '@/lib/elec/ui';
import type { PlaceEnv } from '@/lib/elec/placement';
import { buildElecPlan, type ElecPlanModel } from '@/lib/elec/symbols';

const catalog = getCatalog();

/** Planta elétrica do nível (traçado efetivo do motor + posição provisória do ponto em arraste); null sem relatório. */
export function useElecPlan(model: BuildingModel, level: string): ElecPlanModel | null {
  const report = useEditor((s) => s.results?.installations?.electrical ?? null);
  const drag = useElecUi((s) => s.drag);
  const settled = useEditor((s) => s.revision === s.computedRevision);
  useEffect(() => {
    if (drag?.dropped && settled) useElecUi.getState().setDrag(null);
  }, [drag, settled]);
  const walls = useMemo(() => model.walls.filter((w) => w.level === level).map((w) => ({ id: w.id, from: w.from as [number, number], to: w.to as [number, number], thickness: w.thickness })), [model.walls, level]);
  return useMemo(() => (report ? buildElecPlan({ layout: report.layout, circuits: report.circuits, conduits: report.conduits, walls, level, override: drag }) : null), [report, walls, level, drag]);
}

/** Parede, vãos e cômodos do nível para o encaixe das ferramentas. */
export function usePlaceEnv(model: BuildingModel, level: string): PlaceEnv {
  return useMemo(
    () => ({
      levelId: level,
      walls: model.walls.filter((w) => w.level === level).map((w) => ({ id: w.id, from: w.from as [number, number], to: w.to as [number, number], thickness: w.thickness })),
      openings: model.openings.filter((o) => o.valid && o.hostKind === 'wall').map((o) => ({ hostId: o.hostId, u0: o.u0, u1: o.u1, v0: o.v0, v1: o.v1 })),
      rooms: model.rooms.filter((r) => r.level === level && r.polygon && r.polygon.length >= 3).map((r) => ({ id: r.id, polygon: r.polygon as [number, number][], ceilingAvg: r.ceiling.avg, use: r.use, area: r.area })),
      k: catalog.constants.electrical,
    }),
    [model, level],
  );
}
