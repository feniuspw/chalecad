import { constants } from '@chalecad/catalog';
import type { Results } from '@chalecad/engine';
import { formatNumber } from '@/lib/format';

export interface MaterialKpi {
  label: string;
  /** Texto do indicador ("—" quando não há valor, ex.: motor sem volume de madeira). */
  value: string;
  /** Valor numérico para a barrinha (null = sem barra). */
  index: number | null;
  range: readonly [number, number];
  unit: string;
  inside: boolean;
  title: string;
}

/** Indicador de material por m²: aço (kg/m²) no LSF, madeira (m³/m²) no wood frame. */
export function materialKpi(results: Pick<Results, 'quantities'>, structure: 'lsf' | 'wood'): MaterialKpi {
  const q = results.quantities;
  if (structure === 'wood') {
    const range = constants.wood.indexRange;
    const v = q.woodM3 > 0 ? q.woodM3PerM2 : null;
    const inside = v !== null && v >= range[0] && v <= range[1];
    const r = `${formatNumber(range[0], 3)} a ${formatNumber(range[1], 3)} m³/m²`;
    return {
      label: 'Madeira',
      value: v === null ? '—' : `${formatNumber(v, 3)} m³/m²`,
      index: v,
      range,
      unit: 'm³/m²',
      inside,
      title: v === null ? 'Volume de madeira indisponível' : `Faixa usual ${r}: ${inside ? 'dentro' : 'fora da faixa'}`,
    };
  }
  const range = constants.steelIndexRange;
  const v = q.steelKgPerM2;
  const inside = v >= range[0] && v <= range[1];
  return {
    label: 'Aço',
    value: `${formatNumber(v, 1)} kg/m²`,
    index: v,
    range,
    unit: 'kg/m²',
    inside,
    title: `Faixa usual ${formatNumber(range[0], 1)} a ${formatNumber(range[1], 1)} kg/m²: ${inside ? 'dentro' : 'fora da faixa'}`,
  };
}
