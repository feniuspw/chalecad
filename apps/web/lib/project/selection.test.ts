import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { getCatalog } from '@chalecad/catalog';
import { buildModel } from '@chalecad/engine';
import { createProject } from './templates';
import { deleteSelection, issueTarget, selectionFromHost } from './selection';
import { hostLabel, openingLabel } from './labels';

const project = createProject('gable_mezzanine');
const model = buildModel(project, getCatalog());

describe('selectionFromHost', () => {
  it('classifica hospedeiros do modelo', () => {
    expect(selectionFromHost('ext-front', model, project)).toEqual({ kind: 'host', id: 'ext-front' });
    expect(selectionFromHost('roof-a', model, project).kind).toBe('roof');
    expect(selectionFromHost('radier', model, project).kind).toBe('slab');
    expect(selectionFromHost(project.walls[0]!.id, model, project).kind).toBe('wall');
    expect(selectionFromHost(project.stairs[0]!.id, model, project).kind).toBe('stair');
  });
});

describe('issueTarget', () => {
  it('aponta para o objeto ou seção do problema', () => {
    const o = project.openings[2]!;
    expect(issueTarget('openings.2.width', project)).toEqual({ selection: { kind: 'opening', id: o.id } });
    expect(issueTarget('typology.width', project)).toEqual({ section: 'typology' });
    expect(issueTarget('system.foundation.thickness', project)).toEqual({ section: 'foundation' });
    expect(issueTarget('design.windV0', project)).toEqual({ section: 'site' });
    expect(issueTarget('openings.99', project)).toEqual({});
  });
});

describe('deleteSelection', () => {
  it('exclui abertura via update e recusa elementos da tipologia', () => {
    let state = project;
    const update = (_l: string, r: (d: typeof project) => void) => void (state = produce(state, r));
    const id = project.openings[0]!.id;
    expect(deleteSelection({ kind: 'opening', id }, state, update).ok).toBe(true);
    expect(state.openings.some((o) => o.id === id)).toBe(false);
    expect(deleteSelection({ kind: 'host', id: 'ext-front' }, state, update).ok).toBe(false);
    expect(deleteSelection(null, state, update).ok).toBe(false);
  });
});

describe('labels', () => {
  it('nomeia hospedeiros e aberturas', () => {
    expect(hostLabel(project, 'ext-left')).toBe('Parede esquerda');
    expect(hostLabel(project, project.walls[1]!.id)).toBe('Parede interna 2');
    expect(openingLabel(project, project.openings[0]!.id)).toBe('Porta 1');
    expect(openingLabel(project, project.openings[2]!.id)).toBe('Janela 2');
  });
});

describe('excluir móvel', () => {
  it('remove o móvel selecionado pelo nome do catálogo', () => {
    const p = produce(project, (d) => {
      d.furniture.push({ id: 'f-12345678', level: d.levels[0]!.id, item: 'furn_sofa_3', position: [2, 2], rotation: 0 });
    });
    let out = p;
    const r = deleteSelection({ kind: 'furniture', id: 'f-12345678' }, p, (_label, recipe) => {
      out = produce(out, recipe);
    });
    expect(r).toEqual({ ok: true, message: 'Sofá 3 lugares removido.' });
    expect(out.furniture).toHaveLength(0);
  });
});
