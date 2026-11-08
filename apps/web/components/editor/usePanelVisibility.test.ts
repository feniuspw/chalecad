import { describe, expect, it } from 'vitest';
import { togglePanels } from './usePanelVisibility';

describe('togglePanels', () => {
  it('alterna cada lado sem mexer no outro', () => {
    expect(togglePanels({ left: true, right: true }, 'left')).toEqual({ left: false, right: true });
    expect(togglePanels({ left: false, right: true }, 'right')).toEqual({ left: false, right: false });
  });
  it('"\\" esconde os dois se algum está aberto e mostra os dois se ambos estão fechados', () => {
    expect(togglePanels({ left: true, right: false }, 'both')).toEqual({ left: false, right: false });
    expect(togglePanels({ left: false, right: false }, 'both')).toEqual({ left: true, right: true });
  });
});
