import type { CircuitDef } from '../../schema/project';
import type { ElecCircuitResult } from '../../schema/results';
import { ampacity, breakerFor, sectionsOf, type Method } from './tables';
import type { ElecK } from './types';

export interface SizingInput {
  k: ElecK;
  kind: CircuitDef['kind'];
  /** Corrente de projeto (A). */
  ib: number;
  method: Method;
  fca: number;
  fct: number;
  /** Queda de tensão terminal (%) em função da seção; do alimentador (%) somada para o total. */
  dropAt: (sectionMm2: number) => number;
  feederDropPct: number;
  /** Curva padrão do circuito (aparelho ou catálogo) e sobrescritas do usuário. */
  curve: 'B' | 'C';
  override?: Pick<CircuitDef, 'sectionMm2' | 'breakerA' | 'curve'>;
  /** Carga de corrente maior que o disjuntor máximo: não há solução em uma seção só. */
}

export interface SizingResult {
  sectionMm2: number;
  breakerA: number;
  curve: 'B' | 'C';
  izCorrected: number;
  drop: number;
  reason: ElecCircuitResult['sizingReason'];
  /** Ib > In ou In > Iz' (NBR 5410 5.3.4.1). */
  overload: boolean;
}

/**
 * Ib → disjuntor (menor padronizado ≥ Ib) → seção: a menor, não menor que a mínima do tipo, cuja capacidade
 * corrigida (Iz·FCT·FCA) cubra o disjuntor → sobe a seção enquanto a queda terminal passar de 4% ou a total de 5%.
 * Sobrescritas do usuário valem e são verificadas (`overload`).
 */
export function sizeCircuit(i: SizingInput): SizingResult {
  const { k } = i;
  const sections = sectionsOf(k);
  const smin = i.kind === 'lighting' ? k.minSection.lighting : k.minSection.power;
  const breakerA = i.override?.breakerA ?? breakerFor(k, i.ib);
  const curve = i.override?.curve ?? i.curve;
  const iz = (s: number) => ampacity(k, s, i.method, 2) * i.fct * i.fca;
  let section: number;
  let reason: SizingResult['reason'];
  if (i.override?.sectionMm2 !== undefined) {
    section = i.override.sectionMm2;
    reason = 'user';
  } else {
    const candidates = sections.filter((s) => s >= smin - 1e-9);
    const first = candidates.find((s) => iz(s) >= breakerA - 1e-9) ?? candidates[candidates.length - 1]!;
    section = first;
    reason = first > smin + 1e-9 ? 'ampacity' : 'minimum';
    const over = (s: number) => i.dropAt(s) > k.voltageDrop.terminalMaxPct + 1e-9 || i.feederDropPct + i.dropAt(s) > k.voltageDrop.totalMaxPct + 1e-9;
    while (over(section)) {
      const next = candidates.find((s) => s > section + 1e-9);
      if (!next) break;
      section = next;
      reason = 'voltage_drop';
    }
  }
  const izc = iz(section);
  return {
    sectionMm2: section,
    breakerA,
    curve,
    izCorrected: izc,
    drop: i.dropAt(section),
    reason,
    overload: i.ib > breakerA + 1e-9 || breakerA > izc + 1e-9,
  };
}
