// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { getCatalog } from '@chalecad/catalog';
import { computeAll } from '@chalecad/engine';
import { setStructure } from '@/lib/project/system';
import { createProject } from '@/lib/project/templates';
import { produce } from 'immer';
import { useEditor } from '@/lib/store/editor';
import * as storage from '@/lib/storage';
import { openForViewing } from './openForViewing';
import { viewerSummary } from './summary';

const base = createProject('gable_mezzanine', { name: 'Chalé da Serra' });
const project = produce(base, (d) => {
  d.rooms.push({ id: 'r1', name: 'Sala', use: 'living', point: [3, 3] } as never);
});
const results = computeAll(project, getCatalog());

describe('viewerSummary', () => {
  const s = viewerSummary(project, results);

  it('traz nome, tipologia, sistema e área do motor', () => {
    expect(s.name).toBe('Chalé da Serra');
    expect(s.typologyLabel).toBe('Duas águas com mezanino');
    expect(s.systemLabel).toBe('Light Steel Frame');
    expect(s.builtArea).toBe(results.model.builtArea);
    expect(s.builtAreaLabel).toMatch(/m²$/);
  });

  it('lista os cômodos do modelo com área', () => {
    expect(s.rooms.length).toBe(results.model.rooms.length);
    for (const r of s.rooms) expect(r.areaLabel).toMatch(/m²|aberto/);
  });

  it('faixa de custo vem do orçamento', () => {
    expect(s.costMin).toBe(results.budget.total);
    expect(s.costMax).toBe(results.budget.totalMax);
    expect(s.costMax).toBeGreaterThanOrEqual(s.costMin);
    expect(s.costRangeLabel).toMatch(/R\$/);
  });

  it('etapas somam 100% e vêm só com valor', () => {
    expect(s.stages.length).toBeGreaterThan(0);
    expect(s.stages.reduce((a, x) => a + x.share, 0)).toBeCloseTo(1, 6);
    expect(s.stages.every((x) => x.total > 0)).toBe(true);
  });

  it('wood frame muda o sistema e o nome da etapa de estrutura', () => {
    const wood = produce(base, (d) => setStructure(d, 'wood'));
    const w = viewerSummary(wood, computeAll(wood, getCatalog()));
    expect(w.systemLabel).toBe('Wood frame');
    expect(w.stages.find((x) => x.stage === 'structure')?.label).toMatch(/wood frame/i);
  });
});

describe('openForViewing', () => {
  it('abre em apresentação, sem sujar o store e sem gravar', () => {
    const save = vi.spyOn(storage, 'getStorage');
    openForViewing(base, 'abc');
    const st = useEditor.getState();
    expect(st.projectId).toBe('abc');
    expect(st.dirty).toBe(false);
    expect(st.viewMode).toBe('presentation');
    expect(save).not.toHaveBeenCalled();
  });
});
