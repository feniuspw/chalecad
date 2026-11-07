import { z } from 'zod';
import type { Project, Results } from '@chalecad/engine';
import type { Catalog } from '@chalecad/catalog';
import { formatBRL, formatKg } from '../format';
import { metricsOf } from './metrics';
import type { JsonPatchOp } from './patch';
import type { Proposal, ToolName } from './types';
import { simulatePatch, tryPatch } from './variant';

const r = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

const PATCH_ITEMS = {
  type: 'object',
  properties: {
    op: { type: 'string', enum: ['replace', 'add', 'remove'] },
    path: { type: 'string', description: 'JSON Pointer a partir da raiz do projeto, ex.: /levels/1/polygon/2/1 ou /system/bracing' },
    value: { description: 'Novo valor (obrigatório em replace e add).' },
  },
  required: ['op', 'path'],
} as const;

/** Definições enviadas à API (formato `tools` da Anthropic). */
export const TOOL_DEFS = [
  {
    name: 'getProject',
    description: 'Devolve o JSON completo do projeto atual (tipologia, sistema, níveis, paredes, aberturas, escadas, telhado, orçamento).',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'getQuantities',
    description: 'Quantitativos resumidos por etapa (item, quantidade de compra, unidade, peso), áreas e índice de aço em kg/m².',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'getStructuralReport',
    description: 'Verificações do pré-dimensionamento estrutural: rótulo, taxa de uso, status, detalhe e sugestão do motor.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'getBudget',
    description: 'Orçamento: totais, custo por etapa e as 10 linhas de material mais caras.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'simulateVariant',
    description:
      'Aplica um JSON Patch (replace/add/remove) numa cópia do projeto, roda o motor real e devolve as diferenças (custo total, R$/m², peso, aço kg/m², pior taxa estrutural, nº de alertas) contra o projeto atual. Não altera o projeto.',
    input_schema: {
      type: 'object' as const,
      properties: { label: { type: 'string', description: 'Nome curto da variante.' }, patch: { type: 'array', items: PATCH_ITEMS } },
      required: ['label', 'patch'],
    },
  },
  {
    name: 'proposePatch',
    description:
      'Propõe uma edição ao usuário. Não aplica: valida o patch, calcula a prévia e registra a proposta, que o usuário aprova ou descarta na interface.',
    input_schema: {
      type: 'object' as const,
      properties: {
        label: { type: 'string', description: 'Título curto da proposta (vira o nome do desfazer).' },
        rationale: { type: 'string', description: 'Justificativa em uma ou duas frases.' },
        patch: { type: 'array', items: PATCH_ITEMS },
      },
      required: ['label', 'rationale', 'patch'],
    },
  },
];

const Op = z.discriminatedUnion('op', [
  z.object({ op: z.literal('replace'), path: z.string(), value: z.unknown() }),
  z.object({ op: z.literal('add'), path: z.string(), value: z.unknown() }),
  z.object({ op: z.literal('remove'), path: z.string() }),
]);
const SimulateInput = z.object({ label: z.string().min(1).max(120), patch: z.array(Op).min(1).max(40) });
const ProposeInput = SimulateInput.extend({ rationale: z.string().min(1).max(600) });

export interface ToolContext {
  project: Project;
  results: Results;
  catalog: Catalog;
  /** Propostas registradas por `proposePatch` nesta requisição. */
  proposals: Proposal[];
}

export interface ToolOutput {
  result: unknown;
  summary: string;
  isError?: boolean;
}

const bad = (message: string, extra?: object): ToolOutput => ({ result: { ok: false, error: message, ...extra }, summary: message, isError: true });

function quantities(results: Results) {
  const q = results.quantities;
  const byStage: Record<string, unknown[]> = {};
  const truncated: string[] = [];
  const stages = [...new Set(q.lines.map((l) => l.stage))];
  for (const st of stages) {
    const lines = q.lines.filter((l) => l.stage === st).sort((a, b) => b.weightKg - a.weightKg);
    if (lines.length > 40) truncated.push(st);
    byStage[st] = lines.slice(0, 40).map((l) => ({ item: l.name, qty: r(l.purchaseQty), unit: l.unit, weightKg: r(l.weightKg, 1) }));
  }
  return {
    byStage,
    truncatedStages: truncated,
    areas: Object.fromEntries(Object.entries(q.areas).map(([k, v]) => [k, r(v)])),
    steelKg: r(q.steelKg, 1),
    steelKgPerM2: r(q.steelKgPerM2),
  };
}

function budget(results: Results) {
  const b = results.budget;
  return {
    total: r(b.total, 0),
    totalMax: r(b.totalMax, 0),
    perM2: r(b.perM2, 0),
    material: r(b.material, 0),
    labor: r(b.labor, 0),
    freight: r(b.freight, 0),
    contingency: r(b.contingency, 0),
    byStage: b.byStage.map((s) => ({ stage: s.stage, total: r(s.total, 0), material: r(s.material, 0), labor: r(s.labor, 0), freight: r(s.freight, 0), diy: s.diy })),
    topLines: [...b.lines]
      .sort((x, y) => y.material - x.material)
      .slice(0, 10)
      .map((l) => ({ item: l.name, stage: l.stage, qty: r(l.qty), unit: l.unit, material: r(l.material, 0) })),
    missingPrices: b.missingPrices.length,
  };
}

function structural(results: Results) {
  const s = results.structure;
  if (!s) return null;
  return {
    summary: s.summary,
    checks: [...s.checks]
      .sort((a, b) => b.ratio - a.ratio)
      .map((c) => ({ label: c.label, ratio: r(c.ratio), status: c.status, detail: c.detail, suggestion: c.suggestion?.text ?? null })),
  };
}

/** Executa uma ferramenta localmente (funções puras do motor). Nunca lança. */
export function runTool(name: string, input: unknown, ctx: ToolContext): ToolOutput {
  try {
    switch (name as ToolName) {
      case 'getProject':
        return { result: ctx.project, summary: `Projeto “${ctx.project.meta.name}”` };
      case 'getQuantities': {
        const q = quantities(ctx.results);
        return { result: q, summary: `${ctx.results.quantities.lines.length} linhas, aço ${r(q.steelKgPerM2)} kg/m²` };
      }
      case 'getStructuralReport': {
        const s = structural(ctx.results);
        if (!s) return { result: { available: false }, summary: 'Verificação estrutural indisponível' };
        return { result: s, summary: `${s.summary.ok} ok, ${s.summary.warn} atenção, ${s.summary.fail} falha` };
      }
      case 'getBudget': {
        const b = budget(ctx.results);
        return { result: b, summary: `Total ${formatBRL(b.total, 0)} (${formatBRL(b.perM2, 0)}/m²)` };
      }
      case 'simulateVariant': {
        const p = SimulateInput.safeParse(input);
        if (!p.success) return bad('Entrada inválida para simulateVariant: informe label e patch (lista de operações).');
        const patch = p.data.patch as JsonPatchOp[];
        const sim = simulatePatch(ctx.project, ctx.results, patch, ctx.catalog);
        if (!sim.ok) return bad(`Patch rejeitado: ${sim.errors.join('; ')}`, { errors: sim.errors });
        const d = sim.diffs.total.delta ?? 0;
        return {
          result: { ok: true, label: p.data.label, base: metricsOf(ctx.results), variant: metricsOf(sim.results), diffs: sim.diffs },
          summary: `${p.data.label}: ${d >= 0 ? '+' : '−'}${formatBRL(Math.abs(d), 0)}, ${formatKg(sim.diffs.weightKg.delta ?? 0)} de peso`,
        };
      }
      case 'proposePatch': {
        const p = ProposeInput.safeParse(input);
        if (!p.success) return bad('Entrada inválida para proposePatch: informe label, rationale e patch.');
        const patch = p.data.patch as JsonPatchOp[];
        const check = tryPatch(ctx.project, patch);
        if (!check.ok) return bad(`Patch rejeitado: ${check.errors.join('; ')}`, { errors: check.errors });
        const sim = simulatePatch(ctx.project, ctx.results, patch, ctx.catalog);
        if (!sim.ok) return bad(`Patch rejeitado: ${sim.errors.join('; ')}`, { errors: sim.errors });
        const id = `p${ctx.proposals.length + 1}-${Math.random().toString(36).slice(2, 7)}`;
        ctx.proposals.push({ id, label: p.data.label, rationale: p.data.rationale, patch, preview: sim.diffs });
        return {
          result: { ok: true, id, note: 'Proposta registrada; o usuário decide se aplica.', diffs: sim.diffs },
          summary: `Proposta “${p.data.label}” registrada`,
        };
      }
      default:
        return bad(`Ferramenta desconhecida: ${name}`);
    }
  } catch (e) {
    console.error('[ai] erro na ferramenta', name, e);
    return bad('Falha ao executar a ferramenta.');
  }
}
