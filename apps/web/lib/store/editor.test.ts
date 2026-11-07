import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '../project/templates';
import { addOpeningAtCenter } from '../project/edit';
import { resolveSelection, selectCanRedo, selectCanUndo, selectUndoLabel, useEditor } from './editor';

const s = () => useEditor.getState();
const pitch = () => {
  const t = s().project.typology;
  return t.kind === 'gable_mezzanine' ? t.roofPitchDeg : null;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-07T12:00:00Z'));
  s().loadProject(createProject('gable_mezzanine'), { projectId: 'p1' });
});
afterEach(() => vi.useRealTimers());

describe('loadProject', () => {
  it('limpa histórico, seleção e marca como salvo quando tem id', () => {
    s().update('x', (d) => void (d.meta.name = 'A'));
    s().select({ kind: 'wall', id: 'a' });
    s().loadProject(createProject('a_frame'), { projectId: 'p2' });
    expect(s().past).toHaveLength(0);
    expect(s().future).toHaveLength(0);
    expect(s().selection).toBeNull();
    expect(s().projectId).toBe('p2');
    expect(s().dirty).toBe(false);
    expect(s().results).toBeNull();
  });

  it('projeto novo sem id fica sujo para o autosave criar o registro', () => {
    s().loadProject(createProject('a_frame'));
    expect(s().projectId).toBeNull();
    expect(s().dirty).toBe(true);
  });

  it('revision sempre cresce', () => {
    const r = s().revision;
    s().loadProject(createProject('a_frame'));
    expect(s().revision).toBeGreaterThan(r);
  });
});

describe('update / undo / redo', () => {
  it('aplica a receita, guarda histórico e incrementa revision', () => {
    const r = s().revision;
    s().update('Renomear', (d) => void (d.meta.name = 'Novo nome'));
    expect(s().project.meta.name).toBe('Novo nome');
    expect(s().revision).toBe(r + 1);
    expect(s().past).toHaveLength(1);
    expect(s().past[0]!.label).toBe('Renomear');
    expect(s().dirty).toBe(true);
    expect(selectUndoLabel(s())).toBe('Renomear');
  });

  it('receita sem mudança não cria entrada nem revisão', () => {
    const r = s().revision;
    s().update('nada', () => {});
    s().update('mesmo', (d) => {
      const n = d.meta.name;
      d.meta.name = n;
    });
    expect(s().revision).toBe(r);
    expect(s().past).toHaveLength(0);
  });

  it('desfaz e refaz', () => {
    const before = s().project;
    s().update('Largura', (d) => void (d.typology.width = 7));
    s().update('Profundidade', (d) => void (d.typology.depth = 9));
    s().undo();
    expect(s().project.typology.depth).toBe(before.typology.depth);
    expect(s().project.typology.width).toBe(7);
    expect(selectCanRedo(s())).toBe(true);
    s().undo();
    expect(s().project).toEqual(before);
    expect(selectCanUndo(s())).toBe(false);
    s().redo();
    s().redo();
    expect(s().project.typology.width).toBe(7);
    expect(s().project.typology.depth).toBe(9);
    expect(selectCanRedo(s())).toBe(false);
  });

  it('nova edição limpa o futuro', () => {
    s().update('a', (d) => void (d.meta.name = 'a'));
    s().undo();
    expect(s().future).toHaveLength(1);
    s().update('b', (d) => void (d.meta.name = 'b'));
    expect(s().future).toHaveLength(0);
  });

  it('undo/redo sem histórico não faz nada', () => {
    const r = s().revision;
    s().undo();
    s().redo();
    expect(s().revision).toBe(r);
  });

  it('undo e redo incrementam revision (para recalcular)', () => {
    s().update('a', (d) => void (d.meta.name = 'a'));
    const r = s().revision;
    s().undo();
    expect(s().revision).toBe(r + 1);
    s().redo();
    expect(s().revision).toBe(r + 2);
  });

  it('histórico ilimitado', () => {
    for (let i = 0; i < 300; i++) s().update('n', (d) => void (d.meta.name = `n${i}`));
    expect(s().past).toHaveLength(300);
  });

  it('seleção de objeto excluído é limpa (inclusive ao desfazer a criação)', () => {
    let id = '';
    s().update('Adicionar janela', (d) => void (id = addOpeningAtCenter(d, 'ext-left', 'window')!));
    s().select({ kind: 'opening', id });
    expect(resolveSelection(s())?.kind).toBe('opening');
    s().undo();
    expect(s().selection).toBeNull();
  });
});

describe('updateCoalesced', () => {
  it('funde entradas com o mesmo label em menos de 600 ms', () => {
    const w0 = s().project.typology.width;
    for (let i = 1; i <= 5; i++) {
      s().updateCoalesced('Largura', (d) => void (d.typology.width = 6 + i * 0.1));
      vi.advanceTimersByTime(100);
    }
    expect(s().past).toHaveLength(1);
    expect(s().project.typology.width).toBeCloseTo(6.5);
    s().undo();
    expect(s().project.typology.width).toBe(w0);
    s().redo();
    expect(s().project.typology.width).toBeCloseTo(6.5);
  });

  it('não funde com label diferente ou após 600 ms', () => {
    s().updateCoalesced('Largura', (d) => void (d.typology.width = 6));
    vi.advanceTimersByTime(100);
    s().updateCoalesced('Profundidade', (d) => void (d.typology.depth = 7));
    expect(s().past).toHaveLength(2);
    vi.advanceTimersByTime(700);
    s().updateCoalesced('Profundidade', (d) => void (d.typology.depth = 8));
    expect(s().past).toHaveLength(3);
  });

  it('update comum nunca funde', () => {
    s().update('Largura', (d) => void (d.typology.width = 6));
    s().update('Largura', (d) => void (d.typology.width = 7));
    expect(s().past).toHaveLength(2);
  });
});

describe('applyPatches', () => {
  it('aplica patches JSON com histórico', () => {
    s().applyPatches('IA: telhado', [{ op: 'replace', path: ['typology', 'roofPitchDeg'], value: 30 }]);
    expect(pitch()).toBe(30);
    expect(s().past[0]!.label).toBe('IA: telhado');
    s().undo();
    expect(pitch()).toBe(35);
  });

  it('patch inválido é ignorado sem quebrar', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = s().revision;
    s().applyPatches('ruim', [{ op: 'replace', path: ['nao', 'existe', 'x'], value: 1 }]);
    expect(s().revision).toBe(r);
    warn.mockRestore();
  });
});

describe('validação', () => {
  it('projeto inválido continua editável e guarda issues em pt-BR', () => {
    s().update('Largura absurda', (d) => void (d.typology.width = 500));
    expect(s().project.typology.width).toBe(500);
    expect(s().issues.length).toBeGreaterThan(0);
    expect(s().issues[0]!.path).toContain('typology');
    expect(s().issues[0]!.message).toMatch(/máximo/i);
    s().undo();
    expect(s().issues).toHaveLength(0);
  });

  it('referência quebrada gera issue', () => {
    s().update('quebrar', (d) => void (d.openings[0]!.host = 'parede-fantasma'));
    expect(s().issues.some((i) => /inexistente/.test(i.message))).toBe(true);
  });
});

describe('resultados e salvamento', () => {
  it('ignora resultado de revisão mais antiga', () => {
    s().update('a', (d) => void (d.meta.name = 'a'));
    const rev = s().revision;
    s().setResults(rev, null, 'erro B');
    s().setResults(rev - 1, null, 'erro A');
    expect(s().computeError).toBe('erro B');
    expect(s().computedRevision).toBe(rev);
  });

  it('markSaved zera dirty e grava id', () => {
    s().update('a', (d) => void (d.meta.name = 'a'));
    s().markSaved('abc', 123);
    expect(s().dirty).toBe(false);
    expect(s().projectId).toBe('abc');
    expect(s().lastSavedAt).toBe(123);
  });

  it('setToolOptions mescla', () => {
    s().setToolOptions({ openingType: 'door' });
    expect(s().toolOptions.openingType).toBe('door');
    expect(s().toolOptions.snapGrid).toBe(true);
  });
});
