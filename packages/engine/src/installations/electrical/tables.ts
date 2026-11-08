import type { ElecK } from './types';

export type Method = 'B1' | 'B2' | 'A1';

/** Seções comerciais (mm²), em ordem crescente. */
export const sectionsOf = (k: ElecK): number[] => k.ampacity.map((r) => r[0]).sort((a, b) => a - b);

/** Capacidade de condução (A) a 30 °C, Cu/PVC; `loaded` = condutores carregados (2 ou 3). */
export function ampacity(k: ElecK, sectionMm2: number, method: Method, loaded: 2 | 3 = 2): number {
  const row = k.ampacity.find((r) => r[0] === sectionMm2);
  if (!row) return 0;
  const base = method === 'B1' ? 1 : method === 'B2' ? 3 : 5;
  return row[base + (loaded === 3 ? 1 : 0)]!;
}

/** FCA pela quantidade de circuitos no mesmo eletroduto (o último valor da tabela vale para mais). */
export function groupingFactor(k: ElecK, circuits: number): number {
  const t = k.groupingFactor;
  return t[Math.min(Math.max(circuits, 1), t.length) - 1]!;
}

/** FCT pela temperatura ambiente, por interpolação linear entre as linhas da tabela. */
export function tempFactor(k: ElecK, tempC: number): number {
  const rows = Object.entries(k.tempFactor)
    .map(([t, f]) => [Number(t), f] as const)
    .sort((a, b) => a[0] - b[0]);
  const first = rows[0]!;
  const last = rows[rows.length - 1]!;
  if (tempC <= first[0]) return first[1];
  if (tempC >= last[0]) return last[1];
  for (let i = 1; i < rows.length; i++) {
    const [t1, f1] = rows[i]!;
    const [t0, f0] = rows[i - 1]!;
    if (tempC <= t1) return f0 + ((f1 - f0) * (tempC - t0)) / (t1 - t0);
  }
  return last[1];
}

/** Resistência do condutor a 70 °C (Ω/km). */
export function resistance70(k: ElecK, sectionMm2: number): number {
  return (k.resistance20[String(sectionMm2)] ?? 0) * k.resistanceTempFactor70;
}

/** Área externa de um condutor (mm²), pelo diâmetro externo do catálogo. */
export function conductorArea(k: ElecK, sectionMm2: number): number {
  const d = k.cableOuterDiameter[String(sectionMm2)] ?? 0;
  return (Math.PI * d * d) / 4;
}

/** Queda de tensão (%) de um trecho: k·R70·L·I / V (k = 2 em circuito de dois fios). */
export function voltageDropPct(k: ElecK, sectionMm2: number, lengthM: number, currentA: number, voltageV: number, factor = 2): number {
  return ((factor * resistance70(k, sectionMm2) * (lengthM / 1000) * currentA) / voltageV) * 100;
}

/** Menor disjuntor padronizado com corrente nominal ≥ Ib; o maior da lista se Ib passar de todos. */
export function breakerFor(k: ElecK, ib: number): number {
  const r = [...k.breakers.ratings].sort((a, b) => a - b);
  return r.find((x) => x >= ib - 1e-9) ?? r[r.length - 1]!;
}

/**
 * Condutor de proteção (NBR 5410, Tab. 58): S ≤ 16 → S; 16 < S ≤ 35 → 16; S > 35 → S/2.
 * (Regra de norma que o catálogo ainda não traz; fica aqui até entrar em `constants.electrical`.)
 */
export const peSection = (s: number): number => (s <= 16 ? s : s <= 35 ? 16 : s / 2);

/** Fração de reserva e quantidade pela tabela do catálogo (valores < 1 são fração dos circuitos). */
export function reservesFor(k: ElecK, circuits: number): number {
  const row = [...k.panelReserves].sort((a, b) => a[0] - b[0]).find((r) => circuits <= r[0]) ?? k.panelReserves[k.panelReserves.length - 1]!;
  return row[1] < 1 ? Math.ceil(circuits * row[1]) : row[1];
}
