import { describe, expect, it } from 'vitest';
import { constants } from '@chalecad/catalog';
import { materialKpi } from './kpi';

const q = (over: object) => ({ quantities: { steelKgPerM2: 30, woodM3: 0, woodM3PerM2: 0, ...over } }) as never;

describe('materialKpi', () => {
  it('wood usa woodM3PerM2 e a faixa da madeira', () => {
    const k = materialKpi(q({ woodM3: 2, woodM3PerM2: 0.03 }), 'wood');
    expect(k.label).toBe('Madeira');
    expect(k.value).toBe('0,030 m³/m²');
    expect(k.index).toBe(0.03);
    expect(k.range).toEqual(constants.wood.indexRange);
  });
  it('wood com woodM3 = 0 mostra traço', () => {
    const k = materialKpi(q({ woodM3: 0, woodM3PerM2: 0 }), 'wood');
    expect(k.value).toBe('—');
    expect(k.index).toBeNull();
  });
  it('lsf segue o aço', () => {
    const k = materialKpi(q({}), 'lsf');
    expect(k.label).toBe('Aço');
    expect(k.value).toBe('30,0 kg/m²');
  });
});
