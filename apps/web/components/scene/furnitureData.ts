'use client';
import { useMemo } from 'react';
import { getCatalog } from '@chalecad/catalog';
import type { FurnitureModel } from '@chalecad/engine';
import { clientFurnitureModels, mergeFurnitureModels } from '@/lib/project/furniture';
import { useEditor } from '@/lib/store/editor';
import { levelFloorZ } from '@/lib/three/walk';

const NONE: FurnitureModel[] = [];

/**
 * Móveis resolvidos: o que o motor entrega (`results.model.furniture`) vence; o resto vem do cálculo no cliente
 * (contorno, faixa de uso e cômodo), para a cena funcionar antes e durante o recálculo.
 */
export function useFurnitureModels(): FurnitureModel[] {
  const furniture = useEditor((s) => s.project.furniture);
  const levels = useEditor((s) => s.project.levels);
  const model = useEditor((s) => s.results?.model);
  return useMemo(() => {
    if (furniture.length === 0) return NONE;
    const floorZ = (level: string) => levelFloorZ(model?.walls ?? [], level, levels.find((l) => l.id === level)?.elevation ?? 0);
    const client = clientFurnitureModels({ furniture }, getCatalog(), model?.rooms ?? [], floorZ);
    return mergeFurnitureModels(model?.furniture, client);
  }, [furniture, levels, model]);
}

export type AlertLevel = 'info' | 'warn' | 'error';
const RANK: Record<AlertLevel, number> = { info: 0, warn: 1, error: 2 };

/** Pior severidade dos alertas `furniture.*` de cada móvel. */
export function useFurnitureAlertLevels(): Map<string, AlertLevel> {
  const warnings = useEditor((s) => s.results?.warnings);
  return useMemo(() => {
    const m = new Map<string, AlertLevel>();
    for (const w of warnings ?? []) {
      if (!w.code.startsWith('furniture.')) continue;
      for (const ref of w.refs ?? []) {
        const cur = m.get(ref);
        if (!cur || RANK[w.severity] > RANK[cur]) m.set(ref, w.severity);
      }
    }
    return m;
  }, [warnings]);
}
