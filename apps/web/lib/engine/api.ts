/** Implementação de `EngineWorkerApi`, compartilhada pelo Web Worker e pelo fallback na thread principal. */
import { getCatalog } from '@chalecad/catalog';
import { loadProject, type Project } from '@chalecad/engine';
import type { EngineWorkerApi } from '../store/types';
import { computeProject } from './compute';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function createEngineApi(): EngineWorkerApi {
  return {
    async compute(project, opts) {
      const loaded = loadProject(project);
      if (!loaded.ok) return { ok: false, issues: loaded.issues };
      try {
        const t0 = performance.now();
        const results = computeProject(loaded.project, getCatalog(), opts);
        return { ok: true, results, ms: performance.now() - t0 };
      } catch (e) {
        return { ok: false, issues: [], error: message(e) };
      }
    },

    async validate(json) {
      const r = loadProject(json);
      return r.ok ? { ok: true, project: r.project } : { ok: false, issues: r.issues };
    },

    async computeMany(projects) {
      const catalog = getCatalog();
      return projects.map((p) => {
        const loaded = loadProject(p);
        if (!loaded.ok) return { ok: false as const, issues: loaded.issues };
        try {
          return { ok: true as const, results: computeProject(loaded.project, catalog) };
        } catch (e) {
          return { ok: false as const, issues: [{ path: '', message: message(e) }] };
        }
      });
    },
  };
}

export type { Project };
