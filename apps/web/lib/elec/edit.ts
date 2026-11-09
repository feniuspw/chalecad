/**
 * Edição do projeto elétrico (puro, sobre o rascunho Immer de `project.installations.electrical`).
 * Na primeira edição o traçado gerado pelo motor é copiado para o projeto com `manual: true`.
 */
import type { CircuitDef, Conduit, ElecPoint, Electrical, ElectricalLayout } from '@chalecad/engine';

const MAX_POINTS = 2000;
const MAX_CONDUITS = 2000;
const MAX_CIRCUITS = 200;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/**
 * Garante `manual: true`. Se ainda era automático, copia o traçado efetivo (`layout`, do relatório do motor).
 * Devolve true quando acabou de virar manual (para avisar o usuário uma vez).
 */
export function ensureManual(e: Electrical, layout: ElectricalLayout | null | undefined): boolean {
  if (e.manual) return false;
  e.manual = true;
  if (layout) {
    e.points = clone(layout.points).slice(0, MAX_POINTS);
    e.conduits = clone(layout.conduits).slice(0, MAX_CONDUITS);
    e.circuits = clone(layout.circuits).slice(0, MAX_CIRCUITS);
  }
  return true;
}

/** Volta ao traçado automático: apaga o desenho salvo. */
export function resetToAuto(e: Electrical): void {
  e.manual = false;
  e.points = [];
  e.conduits = [];
  e.circuits = [];
}

export function appendPoint(e: Electrical, p: ElecPoint): boolean {
  if (e.points.length >= MAX_POINTS) return false;
  e.points.push(p);
  return true;
}

export function patchPoint(e: Electrical, id: string, patch: Partial<Omit<ElecPoint, 'id'>>, remove: (keyof ElecPoint)[] = []): boolean {
  const p = e.points.find((x) => x.id === id);
  if (!p) return false;
  Object.assign(p, patch);
  for (const k of remove) delete p[k];
  return true;
}

/** Remove pontos e tira os ids de todos os comandos. */
export function removePoints(e: Electrical, ids: ReadonlySet<string>): number {
  const before = e.points.length;
  e.points = e.points.filter((p) => !ids.has(p.id));
  for (const p of e.points) {
    if (p.controls) {
      p.controls = p.controls.filter((c) => !ids.has(c));
      if (p.controls.length === 0 && p.kind === 'switch') p.controls = [];
    }
  }
  return before - e.points.length;
}

export function removeConduits(e: Electrical, ids: ReadonlySet<string>): number {
  const before = e.conduits.length;
  e.conduits = e.conduits.filter((c) => !ids.has(c.id));
  return before - e.conduits.length;
}

/** Liga ou desliga o comando do interruptor sobre a luz. Devolve o novo estado (true = comanda). */
export function toggleControl(e: Electrical, switchId: string, lightId: string): boolean | null {
  const sw = e.points.find((p) => p.id === switchId && p.kind === 'switch');
  const light = e.points.find((p) => p.id === lightId && p.kind === 'light');
  if (!sw || !light) return null;
  const list = sw.controls ?? [];
  if (list.includes(lightId)) {
    sw.controls = list.filter((x) => x !== lightId);
    return false;
  }
  if (list.length >= 20) return null;
  sw.controls = [...list, lightId];
  return true;
}

export function addConduit(e: Electrical, c: Conduit): boolean {
  if (e.conduits.length >= MAX_CONDUITS) return false;
  e.conduits.push(c);
  return true;
}

export function addCircuit(e: Electrical, c: CircuitDef): boolean {
  if (e.circuits.length >= MAX_CIRCUITS) return false;
  e.circuits.push(c);
  return true;
}

/**
 * Circuito de uma lista (ids no layout efetivo): se for `auto-*` (só existe no resultado), vira circuito do
 * projeto na primeira vez que o usuário o edita.
 */
export function adoptCircuit(e: Electrical, def: CircuitDef): CircuitDef {
  const found = e.circuits.find((c) => c.id === def.id);
  if (found) return found;
  e.circuits.push({ ...def });
  return e.circuits[e.circuits.length - 1]!;
}

export function patchCircuit(e: Electrical, id: string, patch: Partial<Omit<CircuitDef, 'id'>>, remove: (keyof CircuitDef)[] = []): boolean {
  const c = e.circuits.find((x) => x.id === id);
  if (!c) return false;
  Object.assign(c, patch);
  for (const k of remove) delete c[k];
  return true;
}

/** Pontos sem comando (nenhum interruptor os liga) dentro de um cômodo: o novo interruptor assume. */
export function uncontrolledLightsIn(points: ElecPoint[], inside: (p: ElecPoint) => boolean): string[] {
  const controlled = new Set(points.filter((p) => p.kind === 'switch').flatMap((p) => p.controls ?? []));
  return points.filter((p) => p.kind === 'light' && !controlled.has(p.id) && inside(p)).map((p) => p.id);
}

/**
 * Fixa no projeto o circuito de `layout` (inclusive os `auto-*` que só existem no resultado) e os pontos que o
 * motor lhe atribuiu, para que sobrescritas (seção, disjuntor, DR) valham nos próximos cálculos.
 */
export function pinCircuit(e: Electrical, layout: ElectricalLayout, circuitId: string): CircuitDef | null {
  const def = layout.circuits.find((c) => c.id === circuitId) ?? e.circuits.find((c) => c.id === circuitId);
  if (!def) return null;
  const mine = adoptCircuit(e, def);
  const members = new Set(layout.points.filter((p) => p.circuitId === circuitId).map((p) => p.id));
  for (const p of e.points) if (members.has(p.id)) p.circuitId = circuitId;
  return mine;
}

/**
 * Troca as luzes de teto de um cômodo por uma grade nova (grade automática). Os interruptores que comandavam as
 * antigas passam a comandar as novas; arandelas (luz com `hostId`) ficam.
 */
export function replaceRoomLights(e: Electrical, level: string, inside: (p: ElecPoint) => boolean, fresh: ElecPoint[]): { removed: number } {
  const old = e.points.filter((p) => p.kind === 'light' && !p.hostId && p.level === level && inside(p));
  const oldIds = new Set(old.map((p) => p.id));
  const owners = e.points.filter((p) => p.kind === 'switch' && (p.controls ?? []).some((c) => oldIds.has(c)));
  e.points = e.points.filter((p) => !oldIds.has(p.id));
  for (const p of fresh) appendPoint(e, p);
  for (const s of owners) s.controls = [...(s.controls ?? []).filter((c) => !oldIds.has(c)), ...fresh.map((p) => p.id)].slice(0, 20);
  return { removed: old.length };
}
