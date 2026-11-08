import { describe, expect, it } from 'vitest';
import { TOOL_KEYS } from '../../hooks/useShortcuts';
import { duplicateKeys, groupShortcuts, keyCaps, SHORTCUT_GROUPS, SHORTCUTS, TOOL_KEY_MAP, toolShortcut } from './shortcuts';
import { markTourSeen, placePopover, resolveStep, shouldAutoStart, TOUR_FLAG, TOUR_STEPS, visibleSteps, findTarget } from './steps';

describe('SHORTCUTS', () => {
  it('não repete tecla no mesmo contexto', () => {
    expect(duplicateKeys()).toEqual([]);
  });

  it('o detector acusa repetição', () => {
    const dup = [...SHORTCUTS, { id: 'x', group: 'Edição' as const, context: 'editor' as const, keys: ['v'], label: 'x' }];
    expect(duplicateKeys(dup)).toHaveLength(1);
  });

  it('o mesmo atalho pode existir em contextos diferentes (R mede no editor e gira o móvel)', () => {
    const r = SHORTCUTS.filter((s) => s.keys.includes('R'));
    expect(r.map((s) => s.context).sort()).toEqual(['editor', 'furniture']);
  });

  it('tem os cinco grupos, todos com itens', () => {
    expect(SHORTCUT_GROUPS).toEqual(['Ferramentas', 'Edição', 'Vista', 'Móveis', 'Apresentação']);
    for (const g of SHORTCUT_GROUPS) expect(groupShortcuts(g).length, g).toBeGreaterThan(0);
  });

  it('as letras das ferramentas batem com as teclas registradas em useShortcuts (e A/F ficam no EditorShell)', () => {
    for (const [key, tool] of Object.entries(TOOL_KEYS)) expect(TOOL_KEY_MAP[key], key).toBe(tool);
    const extra = Object.keys(TOOL_KEY_MAP).filter((k) => !(k in TOOL_KEYS)).sort();
    expect(extra).toEqual(['a', 'f']);
    expect(toolShortcut('wall')).toBe('W');
    expect(toolShortcut('room')).toBe('A');
  });

  it('formata Mod e Shift conforme a plataforma', () => {
    expect(keyCaps('Shift+Mod+Z', true)).toEqual(['⇧', '⌘', 'Z']);
    expect(keyCaps('Shift+Mod+Z', false)).toEqual(['Shift', 'Ctrl', 'Z']);
    expect(keyCaps('Delete', true)).toEqual(['Delete']);
  });
});

describe('passos do tour', () => {
  it('são 6, com id único e título', () => {
    expect(TOUR_STEPS).toHaveLength(6);
    expect(new Set(TOUR_STEPS.map((s) => s.id)).size).toBe(6);
    expect(TOUR_STEPS.every((s) => s.title && s.body && s.targets.length > 0)).toBe(true);
  });

  it('pula os passos cujo elemento não existe', () => {
    const present = new Set(['properties', 'modes', 'export']);
    const box = { width: 100, height: 40 };
    const out = visibleSteps(TOUR_STEPS, (s) => (present.has(s.id) ? box : null));
    expect(out.map((s) => s.id)).toEqual(['properties', 'modes', 'export']);
  });

  it('pula elemento sem tamanho (oculto)', () => {
    const out = visibleSteps(TOUR_STEPS, (s) => (s.id === 'toolbar' ? { width: 0, height: 0 } : { width: 10, height: 10 }));
    expect(out.find((s) => s.id === 'toolbar')).toBeUndefined();
    expect(out).toHaveLength(5);
  });

  it('sem nenhum elemento, nenhum passo', () => {
    expect(visibleSteps(TOUR_STEPS, () => null)).toEqual([]);
  });

  it('resolveStep usa o primeiro alvo que existe e casa texto sem acento', () => {
    const els = [{ textContent: 'Salvar' }, { textContent: 'Ajustar às normas (3)' }];
    const root = { querySelectorAll: (sel: string) => (sel === 'button' ? els : []) } as unknown as ParentNode;
    expect(findTarget(root, { selector: 'button', text: 'ajustar as normas' })).toBe(els[1]);
    expect(findTarget(root, { selector: 'button', text: 'nada' })).toBeNull();
    const norms = TOUR_STEPS.find((s) => s.id === 'norms')!;
    expect(resolveStep(root, norms)).toBe(els[1]);
    const tab = { textContent: 'Alertas 2' };
    const onlyTab = { querySelectorAll: (sel: string) => (sel === '[role="tab"]' ? [tab] : []) } as unknown as ParentNode;
    expect(resolveStep(onlyTab, norms)).toBe(tab);
  });
});

describe('primeira abertura', () => {
  const fake = (init: Record<string, string> = {}) => {
    const data = { ...init };
    return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
  };

  it('abre sozinho só na primeira vez', () => {
    const s = fake();
    expect(shouldAutoStart(s, false)).toBe(true);
    markTourSeen(s);
    expect(s.data[TOUR_FLAG]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(shouldAutoStart(s, false)).toBe(false);
  });

  it('sem armazenamento, com armazenamento que falha ou em navegador automatizado, não abre', () => {
    expect(shouldAutoStart(null, false)).toBe(false);
    expect(shouldAutoStart(fake(), true)).toBe(false);
    const broken = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); } };
    expect(shouldAutoStart(broken, false)).toBe(false);
    expect(() => markTourSeen(broken)).not.toThrow();
  });
});

describe('placePopover', () => {
  const view = { width: 1440, height: 900 };
  const pop = { width: 320, height: 160 };

  it('põe o balão no lado pedido quando cabe', () => {
    const p = placePopover({ x: 48, y: 48, width: 304, height: 800 }, pop, view, 'right');
    expect(p.side).toBe('right');
    expect(p.left).toBe(48 + 304 + 14);
  });

  it('inverte quando não cabe e nunca sai da janela', () => {
    const p = placePopover({ x: 1100, y: 48, width: 340, height: 800 }, pop, view, 'right');
    expect(p.side).toBe('left');
    expect(p.left + pop.width).toBeLessThanOrEqual(view.width);
    const q = placePopover({ x: 0, y: 860, width: 100, height: 30 }, pop, view, 'bottom');
    expect(q.top + pop.height).toBeLessThanOrEqual(view.height);
    expect(q.top).toBeGreaterThanOrEqual(0);
  });
});
