'use client';
import { useMemo } from 'react';
import type { BuildingModel, Project } from '@chalecad/engine';
import { useEditor } from '@/lib/store/editor';
import type { ToolOptions } from '@/lib/store/types';
import { snapPoint, type SnapContext, type SnapResult, type SnapSegment } from '@/lib/tools/snap';
import { orthoPoint } from '@/lib/tools/snap';
import { PLAN_GRID_STEP, planSnap, type PlanSnapResult } from '@/lib/tools/planSnap';
import type { V2 } from '@/lib/tools/geom';

export interface ToolEnv {
  model: BuildingModel;
  project: Project;
  levelId: string;
  /** Cota do nível ativo (m). */
  elevation: number;
  options: ToolOptions;
  segments: SnapSegment[];
  corners: V2[];
  studSpacing: number;
}

export function useToolEnv(model: BuildingModel): ToolEnv {
  const project = useEditor((s) => s.project);
  const levelId = useEditor((s) => s.activeLevelId);
  const options = useEditor((s) => s.toolOptions);
  return useMemo(() => {
    const level = project.levels.find((l) => l.id === levelId);
    const segments = model.walls.filter((w) => w.level === levelId).map((w) => ({ id: w.id, from: w.from, to: w.to }));
    const corners: V2[] = [...(model.footprint as V2[])];
    for (const l of project.levels) if (l.polygon && l.id === levelId) for (const v of l.polygon) corners.push([v[0], v[1]]);
    return {
      model,
      project,
      levelId,
      elevation: level?.elevation ?? 0,
      options,
      segments,
      corners,
      studSpacing: project.system.studSpacing,
    };
  }, [model, project, levelId, options]);
}

export const SNAP_PX = 12;

export function makeSnap(env: ToolEnv, raw: V2, o: { alt: boolean; mpp: number; segments?: SnapSegment[]; corners?: V2[] }): SnapResult {
  const ctx: SnapContext = {
    segments: o.segments ?? env.segments,
    corners: o.corners ?? env.corners,
    studSpacing: env.studSpacing,
    options: { grid: env.options.snapGrid, modulation: env.options.snapModulation },
    disabled: o.alt,
    radius: Math.max(0.05, SNAP_PX * o.mpp),
  };
  return snapPoint(raw, ctx);
}

/** Snap + trava ortogonal (Shift) em relação à âncora. */
export function resolvePoint(env: ToolEnv, raw: V2, o: { alt: boolean; shift: boolean; mpp: number; anchor?: V2 | null }): SnapResult {
  const s = makeSnap(env, raw, o);
  if (o.shift && o.anchor) return { ...s, point: orthoPoint(o.anchor, s.point) };
  return s;
}

/** Eixos do nível: paredes do modelo (externas) e as internas do projeto (sempre frescas, antes do motor recalcular). */
export function planSegments(env: ToolEnv, exclude?: ReadonlySet<string>): SnapSegment[] {
  const mine = env.project.walls.filter((w) => w.level === env.levelId);
  const mineIds = new Set(mine.map((w) => w.id));
  const out: SnapSegment[] = env.segments.filter((s) => !mineIds.has(s.id));
  for (const w of mine) out.push({ id: w.id, from: [w.from[0]!, w.from[1]!], to: [w.to[0]!, w.to[1]!] });
  return exclude ? out.filter((s) => !exclude.has(s.id)) : out;
}

/**
 * Snap completo de planta (ponta, interseção, meio, perpendicular, alinhado, modulação, grade de 5 cm; Shift = 15°),
 * com linhas-guia. `exclude` tira paredes do snap (a que está sendo arrastada).
 */
export function resolvePlan(
  env: ToolEnv,
  raw: V2,
  o: { alt: boolean; shift: boolean; mpp: number; anchor?: V2 | null; exclude?: ReadonlySet<string> },
): PlanSnapResult {
  return planSnap(raw, {
    ctx: {
      segments: planSegments(env, o.exclude),
      corners: env.corners,
      studSpacing: env.studSpacing,
      options: { grid: env.options.snapGrid, modulation: env.options.snapModulation },
      disabled: o.alt,
      radius: Math.max(0.05, SNAP_PX * o.mpp),
      gridStep: PLAN_GRID_STEP,
    },
    anchor: o.anchor ?? null,
    angleLock: o.shift && !!o.anchor,
  });
}
