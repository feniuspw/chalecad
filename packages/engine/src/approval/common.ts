import type { Catalog } from '@chalecad/catalog';
import type { Discipline, Project, Vec2 } from '../schema/project';
import type { ComplianceStatus } from '../schema/results';

/** Formata número em pt-BR (vírgula decimal, ponto de milhar). */
export function nf(n: number, d = 2): string {
  if (!Number.isFinite(n)) return '—';
  const [i, f] = Math.abs(n).toFixed(d).split('.');
  const int = (i ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const s = f ? `${int},${f}` : int;
  return n < 0 && Number(Math.abs(n).toFixed(d)) !== 0 ? `-${s}` : s;
}
export const money = (n: number) => `R$ ${nf(n, 2)}`;

export interface NormInfo {
  label: string;
  confirmed: boolean;
}

/** Norma do catálogo (`approval.norms`) com edição. `codeOverride` troca o código (ex.: "ABNT NBR 16970-2"). */
export function normOf(catalog: Catalog, id: string, codeOverride?: string): NormInfo {
  const n = catalog.constants.approval.norms.find((x) => x.id === id);
  if (!n) return { label: id, confirmed: false };
  const code = codeOverride ?? n.code;
  return { label: n.edition && n.edition !== '—' ? `${code}:${n.edition}` : code, confirmed: n.confirmed };
}

export function normsJoin(...ns: NormInfo[]): NormInfo {
  return { label: ns.map((n) => n.label).join(' / '), confirmed: ns.every((n) => n.confirmed) };
}

/**
 * LOCAL: normas citadas pelos avisos do motor que ainda não estão em `catalog.constants.approval.norms`.
 * Edição a conferir (confirmed: false) até o catálogo trazê-las.
 */
export function localNorm(code: string, edition: string): NormInfo {
  return { label: `${code}:${edition}`, confirmed: false };
}

export const DISCIPLINE_ORDER: Discipline[] = ['architecture', 'structure', 'foundation', 'electrical', 'plumbing', 'execution'];

export const DISCIPLINE_LABEL: Record<Discipline, string> = {
  architecture: 'Arquitetura',
  structure: 'Estrutura',
  foundation: 'Fundação',
  electrical: 'Instalações elétricas',
  plumbing: 'Instalações hidrossanitárias',
  execution: 'Execução',
};

export const levelName = (project: Project, id: string) => project.levels.find((l) => l.id === id)?.name ?? id;

export const isFilled = (s: string | undefined) => (s ?? '').trim().length > 0;

export const STATUS_RANK: Record<ComplianceStatus, number> = { na: 0, ok: 1, manual: 2, missing: 3, warn: 4, fail: 5 };

/** Transforma um ponto da edificação (origem do projeto) em coordenadas do lote. */
export function toLot(p: Vec2, offset: Vec2, rotationDeg: number): Vec2 {
  const a = (rotationDeg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [offset[0] + p[0] * c - p[1] * s, offset[1] + p[0] * s + p[1] * c];
}
