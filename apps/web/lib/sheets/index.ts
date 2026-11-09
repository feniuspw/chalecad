/**
 * Ponto de entrada das pranchas (Fase 17). Esqueleto do contrato: F17-W1 implementa a folha, o carimbo, os
 * conteúdos de arquitetura e a exportação; F17-W2 registra os conteúdos de engenharia em `registry`.
 */
import { archRenderers } from './arch';
import { engRenderers } from './eng';
import type { RendererRegistry, SheetContext, SheetDoc } from './types';

export type * from './types';

/** Renderizadores por `SheetContentKind`: arquitetura (W1) e engenharia (W2), cada um na sua pasta. */
export const registry: RendererRegistry = { ...archRenderers, ...engRenderers };

/** Monta todas as folhas de `results.approval.sheets` (folha x de y, carimbo, legenda). */
export function buildSheets(_ctx: SheetContext): SheetDoc[] {
  throw new Error('buildSheets: não implementado (F17-W1)');
}

/** PDF vetorial com todas as folhas, cada página no seu formato. */
export async function exportSheetsPdf(_ctx: SheetContext): Promise<Blob> {
  throw new Error('exportSheetsPdf: não implementado (F17-W1)');
}
