/** Tipos compartilhados entre o servidor (`/api/ai`) e o painel Analista. */
import type { JsonPatchOp } from './patch';

export type MetricKey = 'total' | 'perM2' | 'weightKg' | 'steelKgPerM2' | 'woodM3PerM2' | 'worstRatio' | 'warnings';

export interface MetricDiff {
  before: number | null;
  after: number | null;
  delta: number | null;
}
export type Diffs = Record<MetricKey, MetricDiff>;

export interface Proposal {
  id: string;
  label: string;
  rationale: string;
  patch: JsonPatchOp[];
  preview: Diffs;
}

export interface ToolCallInfo {
  name: string;
  input: unknown;
  summary: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AnalystResponse {
  text: string;
  proposals: Proposal[];
  toolCalls: ToolCallInfo[];
}

export const TOOL_NAMES = ['getProject', 'getQuantities', 'getStructuralReport', 'getBudget', 'simulateVariant', 'proposePatch'] as const;
export type ToolName = (typeof TOOL_NAMES)[number];
