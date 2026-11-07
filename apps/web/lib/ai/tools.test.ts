// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { computeAll } from '@chalecad/engine';
import { getCatalog } from '@chalecad/catalog';
import { createProject } from '../project/templates';
import { TOOL_DEFS, runTool, type ToolContext } from './tools';
import { tryPatch } from './variant';

const catalog = getCatalog();
const project = createProject('gable_mezzanine', { name: 'Fixture' });
const ctx = (): ToolContext => ({ project, results: computeAll(project, catalog), catalog, proposals: [] });

describe('ferramentas da IA', () => {
  it('define as seis ferramentas com input_schema', () => {
    expect(TOOL_DEFS.map((t) => t.name)).toEqual(['getProject', 'getQuantities', 'getStructuralReport', 'getBudget', 'simulateVariant', 'proposePatch']);
    for (const t of TOOL_DEFS) expect(t.input_schema.type).toBe('object');
  });

  it('getProject devolve o projeto', () => {
    const o = runTool('getProject', {}, ctx());
    expect((o.result as typeof project).meta.name).toBe('Fixture');
  });

  it('getQuantities resume por etapa com áreas e índice de aço', () => {
    const o = runTool('getQuantities', {}, ctx());
    const r = o.result as { byStage: Record<string, { item: string; qty: number; unit: string; weightKg: number }[]>; areas: object; steelKgPerM2: number };
    expect(Object.keys(r.byStage).length).toBeGreaterThan(2);
    expect(r.byStage.structure?.[0]).toHaveProperty('unit');
    expect(r.steelKgPerM2).toBeGreaterThan(0);
    expect(r.areas).toHaveProperty('built');
  });

  it('getStructuralReport lista verificações', () => {
    const o = runTool('getStructuralReport', {}, ctx());
    const r = o.result as { checks: { label: string; ratio: number; status: string }[] };
    expect(r.checks.length).toBeGreaterThan(0);
    expect(r.checks[0]).toHaveProperty('status');
  });

  it('getBudget traz totais, etapas e top 10', () => {
    const c = ctx();
    const o = runTool('getBudget', {}, c);
    const r = o.result as { total: number; byStage: unknown[]; topLines: { material: number }[] };
    expect(r.total).toBeCloseTo(c.results.budget.total, -1);
    expect(r.byStage.length).toBeGreaterThan(0);
    expect(r.topLines).toHaveLength(10);
    expect(r.topLines[0]!.material).toBeGreaterThanOrEqual(r.topLines[9]!.material);
    expect(o.summary).toMatch(/R\$/);
  });

  const patch = [{ op: 'replace', path: '/typology/width', value: project.typology.width + 1 }];

  it('simulateVariant recalcula com o motor real e devolve diferenças', () => {
    const o = runTool('simulateVariant', { label: 'Mais largo', patch }, ctx());
    expect(o.isError).toBeUndefined();
    const r = o.result as { diffs: Record<string, { delta: number | null }> };
    expect(r.diffs.total!.delta).toBeGreaterThan(0);
    expect(r.diffs.weightKg!.delta).toBeGreaterThan(0);
    expect(Object.keys(r.diffs)).toEqual(['total', 'perM2', 'weightKg', 'steelKgPerM2', 'worstRatio', 'warnings']);
  });

  it('simulateVariant rejeita patch inválido sem lançar', () => {
    const bad = runTool('simulateVariant', { label: 'x', patch: [{ op: 'replace', path: '/typology/width', value: -3 }] }, ctx());
    expect(bad.isError).toBe(true);
    const noop = runTool('simulateVariant', { label: 'x', patch: [{ op: 'add', path: '/campoInventado', value: 1 }] }, ctx());
    expect(noop.isError).toBe(true);
    expect(runTool('simulateVariant', { label: 'x' }, ctx()).isError).toBe(true);
  });

  it('proposePatch registra a proposta sem alterar o projeto', () => {
    const c = ctx();
    const before = JSON.stringify(c.project);
    const o = runTool('proposePatch', { label: 'Mais largo', rationale: 'teste', patch }, c);
    expect(o.isError).toBeUndefined();
    expect(c.proposals).toHaveLength(1);
    expect(c.proposals[0]!.preview.total.delta).toBeGreaterThan(0);
    expect(JSON.stringify(c.project)).toBe(before);
  });

  it('proposePatch com erro não registra', () => {
    const c = ctx();
    const o = runTool('proposePatch', { label: 'x', rationale: 'y', patch: [{ op: 'remove', path: '/nada' }] }, c);
    expect(o.isError).toBe(true);
    expect(c.proposals).toHaveLength(0);
  });

  it('ferramenta desconhecida vira erro', () => {
    expect(runTool('rm', {}, ctx()).isError).toBe(true);
  });

  it('tryPatch valida com o schema', () => {
    expect(tryPatch(project, patch as never).ok).toBe(true);
    expect(tryPatch(project, []).ok).toBe(false);
  });
});
