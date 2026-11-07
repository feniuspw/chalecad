import { describe, expect, it } from 'vitest';
import { parseBlocks, tokenizeInline } from './rich-text';

describe('rich-text', () => {
  it('reconhece o marcador de ferramenta após o número', () => {
    expect(tokenizeInline('Total R$ 138.869 [getBudget] hoje')).toEqual([
      { kind: 'text', value: 'Total R$ 138.869 ' },
      { kind: 'tool', value: 'getBudget' },
      { kind: 'text', value: ' hoje' },
    ]);
  });
  it('ignora colchetes desconhecidos e trata negrito e código', () => {
    expect(tokenizeInline('[nada] **x** `y`').map((t) => t.kind)).toEqual(['text', 'bold', 'text', 'code']);
  });
  it('agrupa listas e parágrafos', () => {
    expect(parseBlocks('Oi\n\n- a\n- b\n1. c')).toEqual([
      { kind: 'p', text: 'Oi' },
      { kind: 'ul', items: ['a', 'b'] },
      { kind: 'ol', items: ['c'] },
    ]);
  });
});
