'use client';
import { useCallback, useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { getCatalog } from '@chalecad/catalog';
import type { Furniture, FurnitureModel } from '@chalecad/engine';
import { patchFurniture, placeEnv, placeFurniture, setFurnitureRotation, specOf } from '@/lib/project/furniture';
import { useEditor } from '@/lib/store/editor';
import { FLOOR_PLATE } from '@/lib/three/finishes';
import type { V2 } from '@/lib/tools/geom';
import { rayHitHorizontal } from '@/lib/tools/plane';
import { useDrag, useRayFromEvent } from './pointer';

const catalog = getCatalog();

export interface WallLike {
  id: string;
  level: string;
  from: [number, number];
  to: [number, number];
  thickness: number;
}

/** Cota de apoio do móvel: o piso do nível mais a placa de acabamento. */
export const furnitureBaseZ = (m: Pick<FurnitureModel, 'z'>) => m.z + FLOOR_PLATE;

/**
 * Mover (com encaixe na parede e entre móveis; Alt = livre) e girar (passos de 15°; Alt = livre) o móvel selecionado
 * arrastando no piso. As edições vão para o histórico fundidas por `updateCoalesced`.
 */
export function useFurnitureDrag(models: FurnitureModel[], walls: WallLike[]) {
  const drag = useDrag();
  const ray = useRayFromEvent();
  const byId = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);

  const beginMove = useCallback(
    (f: Furniture, e: ThreeEvent<PointerEvent>) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      useEditor.getState().select({ kind: 'furniture', id: f.id });
      const spec = specOf(catalog, f.item);
      const m = byId.get(f.id);
      if (!spec || !m) return;
      const z = furnitureBaseZ(m);
      const start = rayHitHorizontal(ray(e.nativeEvent), z);
      if (!start) return;
      const grab: V2 = [start[0] - f.position[0], start[1] - f.position[1]];
      drag(e.nativeEvent, {
        z,
        onMove: (pe) => {
          const cur = useEditor.getState().project;
          const now = cur.furniture.find((x) => x.id === f.id);
          if (!now) return;
          const env = placeEnv(cur, catalog, walls, f.level, f.id);
          const pl = placeFurniture(spec, [pe.p[0] - grab[0], pe.p[1] - grab[1]], now.rotation, env, { free: pe.alt });
          useEditor.getState().updateCoalesced('Mover móvel', (d) => void patchFurniture(d, f.id, { position: pl.position, rotation: pl.rotation }));
        },
      });
    },
    [byId, drag, ray, walls],
  );

  const beginRotate = useCallback(
    (f: Furniture, e: { nativeEvent: PointerEvent }) => {
      const m = byId.get(f.id);
      if (!m) return;
      drag(e.nativeEvent, {
        z: furnitureBaseZ(m),
        onMove: (pe) => {
          const now = useEditor.getState().project.furniture.find((x) => x.id === f.id);
          if (!now) return;
          let deg = (Math.atan2(pe.p[1] - now.position[1], pe.p[0] - now.position[0]) * 180) / Math.PI;
          if (!pe.alt) deg = Math.round(deg / 15) * 15;
          useEditor.getState().updateCoalesced('Girar móvel', (d) => void setFurnitureRotation(d, f.id, deg));
        },
      });
    },
    [byId, drag],
  );

  return { beginMove, beginRotate };
}
