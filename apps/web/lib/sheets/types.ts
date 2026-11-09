/**
 * Contrato das pranchas (Fase 17). O motor diz QUAIS pranchas a etapa pede (`results.approval.sheets`, `SheetSpec`);
 * o app desenha cada `SheetContent` com um renderizador registrado por `kind` e monta a folha ABNT com carimbo.
 *
 * Unidades do desenho: milímetros de papel (1 mm = 1 unidade SVG). Um conteúdo na escala 1:N converte metros do
 * modelo em mm de papel por `1000 / N`.
 */
import type { Catalog } from '@chalecad/catalog';
import type { Project, Results, SheetContent, SheetContentKind, SheetSpec } from '@chalecad/engine';

export interface SheetContext {
  project: Project;
  results: Results;
  catalog: Catalog;
}

/** Desenho pronto para ser posicionado na folha: SVG interno (sem a tag <svg>), em mm de papel, origem no canto superior esquerdo. */
export interface RenderedContent {
  /** Conteúdo SVG (elementos), em mm. */
  body: string;
  /** `<defs>` necessários (hachuras, marcadores), com ids prefixados para não colidir entre conteúdos. */
  defs?: string;
  width: number;
  height: number;
  /** Escala efetivamente usada (denominador); ausente = sem escala (tabelas, diagramas). */
  scale?: number;
  /** Título que vai embaixo do desenho (ex.: "PLANTA BAIXA — TÉRREO"). */
  title: string;
  /** Linhas de legenda de símbolos usados (a folha junta numa legenda única). */
  legend?: { symbol: string; label: string }[];
  /** Notas gerais que vão na coluna de notas da folha. */
  notes?: string[];
}

/**
 * Renderizador de um tipo de conteúdo. `scale` é a escala pedida (o renderizador pode recusar e devolver null se
 * não houver o que desenhar, ex.: planta elétrica sem instalações).
 */
export type ContentRenderer = (ctx: SheetContext, content: SheetContent, scale: number) => RenderedContent | null;

export type RendererRegistry = Partial<Record<SheetContentKind, ContentRenderer>>;

/** Folha montada (SVG completo, em mm). */
export interface SheetDoc {
  spec: SheetSpec;
  /** Formato final (pode subir em relação ao sugerido para caber na escala). */
  format: 'A0' | 'A1' | 'A2' | 'A3' | 'A4';
  widthMm: number;
  heightMm: number;
  svg: string;
  /** Folha x de y. */
  index: number;
  total: number;
  /** Conteúdos que não puderam ser desenhados (sem renderizador ou vazios). */
  skipped: SheetContentKind[];
}
