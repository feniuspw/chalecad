/**
 * Ponto de entrada das pranchas (Fase 17). Esqueleto do contrato: F17-W1 implementa a folha, o carimbo, os
 * conteúdos de arquitetura e a exportação; F17-W2 registra os conteúdos de engenharia em `registry`.
 */
import { archRenderers, fallbackSheets } from './arch';
import { prepareSheet, type PreparedSheet } from './frame/sheet';
import { engRenderers } from './eng';
import type { RendererRegistry, SheetContext, SheetDoc } from './types';

export type * from './types';
export { fallbackSheets } from './arch';

/** Renderizadores por `SheetContentKind`: arquitetura (W1) e engenharia (W2), cada um na sua pasta. */
export const registry: RendererRegistry = { ...archRenderers, ...engRenderers };

/** Monta todas as folhas de `results.approval.sheets` (ou o fallback da etapa legal): folha x de y, carimbo, legenda. */
export function buildSheets(ctx: SheetContext): SheetDoc[] {
  const specs = ctx.results.approval?.sheets ?? fallbackSheets(ctx.project, ctx.results);
  const prepared = specs.map((spec) => prepareSheet(ctx, spec, registry)).filter((p): p is PreparedSheet => p !== null);
  return prepared.map((p, i) => p.render(i + 1, prepared.length));
}

/** PDF vetorial com todas as folhas, cada página no seu formato. */
export async function exportSheetsPdf(ctx: SheetContext): Promise<Blob> {
  const { sheetsToPdf } = await import('./pdf');
  return sheetsToPdf(buildSheets(ctx), { title: ctx.project.meta.name });
}
