/**
 * Símbolos de planta da elétrica (NBR 5444, ainda a convenção de fato) e o modelo de desenho da camada.
 * Puro: devolve traços em metros no referencial da planta; a cena (three), o SVG do PDF e os testes usam o mesmo modelo.
 *   tomada baixa = triângulo vazado, média = meio cheio, alta = cheio; TUE = triângulo cheio maior;
 *   interruptor = círculo com a letra do comando (paralelo: meio disco cheio); luz no teto = círculo com X;
 *   arandela = meio círculo na parede; quadro = retângulo meio hachurado.
 */
import type { ConduitResult, ElecCircuitResult, ElecPoint, ElectricalLayout, Vec2 } from '@chalecad/engine';
import { controlInfo } from './control';
import { CONDUIT_COLOR, CONTROL_COLOR, circuitColor, NO_CIRCUIT_COLOR, symbolKind, type SymbolKind } from './kinds';
import { faceNormal, type WallLike } from './wallSnap';

export interface Stroke {
  pts: Vec2[];
  closed: boolean;
}

export interface SymbolShape {
  /** Contornos (linhas). */
  outline: Stroke[];
  /** Polígonos convexos preenchidos. */
  fills: Vec2[][];
  /** Centro do símbolo (para letra dentro dele e para o encaixe do eletroduto). */
  center: Vec2;
  /** Onde fica o rótulo principal (nº do circuito). */
  labelAt: Vec2;
}

const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n = 14): Vec2[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Vec2;
  });

/** Símbolo no referencial local (x ao longo da parede, y para dentro do cômodo), origem na face. */
function localShape(kind: SymbolKind): { outline: Stroke[]; fills: Vec2[][]; center: Vec2; label: Vec2 } {
  switch (kind) {
    case 'socket_low':
      return { outline: [{ pts: [[-0.1, 0], [0.1, 0], [0, 0.17]], closed: true }], fills: [], center: [0, 0.06], label: [0, 0.34] };
    case 'socket_mid':
      return { outline: [{ pts: [[-0.1, 0], [0.1, 0], [0, 0.17]], closed: true }], fills: [[[-0.1, 0], [0, 0], [0, 0.17]]], center: [0, 0.06], label: [0, 0.34] };
    case 'socket_high':
      return { outline: [{ pts: [[-0.1, 0], [0.1, 0], [0, 0.17]], closed: true }], fills: [[[-0.1, 0], [0.1, 0], [0, 0.17]]], center: [0, 0.06], label: [0, 0.34] };
    case 'tue':
      return { outline: [{ pts: [[-0.13, 0], [0.13, 0], [0, 0.23]], closed: true }], fills: [[[-0.13, 0], [0.13, 0], [0, 0.23]]], center: [0, 0.08], label: [0, 0.4] };
    case 'switch_one':
      return { outline: [{ pts: arc(0, 0.09, 0.08, 0, Math.PI * 2, 18).slice(0, -1), closed: true }], fills: [], center: [0, 0.09], label: [0, 0.3] };
    case 'switch_two':
      return {
        outline: [{ pts: arc(0, 0.09, 0.08, 0, Math.PI * 2, 18).slice(0, -1), closed: true }],
        fills: [arc(0, 0.09, 0.08, Math.PI / 2, (3 * Math.PI) / 2, 8)],
        center: [0, 0.09],
        label: [0, 0.3],
      };
    case 'light_wall':
      return { outline: [{ pts: [...arc(0, 0, 0.11, 0, Math.PI, 12), [0.11, 0]], closed: true }], fills: [], center: [0, 0.05], label: [0, 0.3] };
    case 'data':
      return { outline: [{ pts: [[-0.08, 0], [0.08, 0], [0, 0.13]], closed: true }], fills: [], center: [0, 0.05], label: [0, 0.3] };
    case 'panel':
      return {
        outline: [{ pts: [[-0.22, 0], [0.22, 0], [0.22, 0.13], [-0.22, 0.13]], closed: true }],
        fills: [[[-0.22, 0], [0, 0], [0, 0.13], [-0.22, 0.13]]],
        center: [0, 0.065],
        label: [0, 0.34],
      };
    case 'light_ceiling': {
      const r = 0.13;
      const d = r * 0.72;
      return {
        outline: [
          { pts: arc(0, 0, r, 0, Math.PI * 2, 20).slice(0, -1), closed: true },
          { pts: [[-d, -d], [d, d]], closed: false },
          { pts: [[-d, d], [d, -d]], closed: false },
        ],
        fills: [],
        center: [0, 0],
        label: [0, 0.3],
      };
    }
  }
}

/** Símbolo posicionado: `normal` aponta da parede para dentro do cômodo (null = teto, sem orientação). */
export function symbolShape(kind: SymbolKind, at: Vec2, normal: Vec2 | null): SymbolShape {
  const loc = localShape(kind);
  const n: Vec2 = normal ?? [0, 1];
  const t: Vec2 = [n[1], -n[0]];
  const w = (p: Vec2): Vec2 => [at[0] + t[0] * p[0] + n[0] * p[1], at[1] + t[1] * p[0] + n[1] * p[1]];
  return { outline: loc.outline.map((s) => ({ ...s, pts: s.pts.map(w) })), fills: loc.fills.map((f) => f.map(w)), center: w(loc.center), labelAt: w(loc.label) };
}

export interface PlanLabel {
  text: string;
  at: Vec2;
  color: string;
  /** Altura do texto em metros. */
  size: number;
}

export interface PlanPointItem {
  id: string;
  point: ElecPoint | null;
  kind: SymbolKind;
  color: string;
  /** 1 = primeiro circuito; 0 = sem circuito. */
  circuit: number;
  shape: SymbolShape;
  labels: PlanLabel[];
}

export interface PlanConduitItem {
  id: string;
  run: 'ceiling' | 'floor' | 'wall';
  path: Vec2[];
  label: PlanLabel | null;
  dn: number | null;
}

export interface ElecPlanModel {
  level: string;
  points: PlanPointItem[];
  conduits: PlanConduitItem[];
  links: { switchId: string; lightId: string; from: Vec2; to: Vec2; letter: string; color: string }[];
  /** Legenda: símbolos presentes. */
  legend: SymbolKind[];
}

export const SYMBOL_LEGEND: Record<SymbolKind, string> = {
  socket_low: 'Tomada baixa (0,30 m)',
  socket_mid: 'Tomada média (1,10 m)',
  socket_high: 'Tomada alta (2,20 m)',
  tue: 'Tomada de uso específico',
  switch_one: 'Interruptor simples',
  switch_two: 'Interruptor paralelo',
  light_ceiling: 'Ponto de luz no teto',
  light_wall: 'Arandela',
  data: 'Dados / TV',
  panel: 'Quadro de distribuição',
};

export const LEGEND_ORDER: SymbolKind[] = ['socket_low', 'socket_mid', 'socket_high', 'tue', 'switch_one', 'switch_two', 'light_ceiling', 'light_wall', 'data', 'panel'];

const TEXT_H = 0.17;
const mid = (path: Vec2[]): { at: Vec2; dir: Vec2 } => {
  let best = 0;
  let bi = 1;
  for (let i = 1; i < path.length; i++) {
    const l = Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]);
    if (l > best) {
      best = l;
      bi = i;
    }
  }
  const a = path[bi - 1]!;
  const b = path[bi]!;
  return { at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], dir: best > 0 ? [(b[0] - a[0]) / best, (b[1] - a[1]) / best] : [1, 0] };
};

/**
 * Modelo de desenho do nível a partir do traçado efetivo do motor (`report.electrical.layout`, que vale para o
 * traçado gerado e para o manual). `walls` orienta os símbolos de parede.
 */
export function buildElecPlan(input: {
  layout: ElectricalLayout;
  circuits: ElecCircuitResult[];
  conduits: ConduitResult[];
  walls: WallLike[];
  level: string;
  /** Posição provisória de um ponto em arraste. */
  override?: { id: string; position: Vec2 } | null;
}): ElecPlanModel {
  const { layout, level } = input;
  const wallById = new Map(input.walls.map((w) => [w.id, w]));
  const circuitIndex = new Map(layout.circuits.map((c, i) => [c.id, i]));
  void input.circuits;
  const points = layout.points.map((p) => (input.override && input.override.id === p.id ? { ...p, position: input.override.position } : p)).filter((p) => p.level === level);
  const info = controlInfo(layout.points);
  const items: PlanPointItem[] = [];
  const legend = new Set<SymbolKind>();

  for (const p of points) {
    const kind = symbolKind(p);
    const ci = p.circuitId !== undefined ? (circuitIndex.get(p.circuitId) ?? -1) : -1;
    const color = ci >= 0 ? circuitColor(ci) : NO_CIRCUIT_COLOR;
    const normal = p.hostId ? faceNormal(p.position, wallById.get(p.hostId)) : null;
    const shape = symbolShape(kind, p.position, normal);
    const labels: PlanLabel[] = [];
    const num = ci >= 0 ? `${ci + 1}` : '';
    if (kind === 'switch_one' || kind === 'switch_two') {
      const letters = info.switchLetters.get(p.id) ?? [];
      if (letters.length) labels.push({ text: letters.join(''), at: shape.center, color, size: TEXT_H * 0.8 });
    } else if (kind === 'light_ceiling' || kind === 'light_wall') {
      const letter = info.lightLetter.get(p.id);
      const t = [num, letter].filter(Boolean).join('·');
      if (t) labels.push({ text: t, at: shape.labelAt, color, size: TEXT_H });
    } else if (num) {
      labels.push({ text: num, at: shape.labelAt, color, size: TEXT_H });
    }
    items.push({ id: p.id, point: p, kind, color, circuit: ci + 1, shape, labels });
    legend.add(kind);
  }

  // Quadro
  const panel = layout.panel;
  if (panel.level === level) {
    const n = panel.hostId ? faceNormal(panel.position, wallById.get(panel.hostId)) : null;
    const shape = symbolShape('panel', panel.position, n);
    items.push({ id: 'panel', point: null, kind: 'panel', color: '#1c1917', circuit: 0, shape, labels: [{ text: 'QDC', at: shape.labelAt, color: '#1c1917', size: TEXT_H }] });
    legend.add('panel');
  }

  // Eletrodutos
  const byId = new Map(input.conduits.map((c) => [c.id, c]));
  const conduits: PlanConduitItem[] = layout.conduits
    .filter((c) => c.level === level)
    .map((c) => {
      const r = byId.get(c.id);
      const dn = r?.dn ?? c.dn ?? null;
      const m = mid(c.path);
      const circuits = r?.circuitIds.length ?? 0;
      const horizontal = Math.abs(m.dir[0]) >= Math.abs(m.dir[1]);
      const label: PlanLabel | null = dn
        ? { text: `Ø${dn}${circuits ? `·${circuits}` : ''}`, at: [m.at[0] + (horizontal ? 0 : 0.2), m.at[1] + (horizontal ? 0.14 : 0)], color: CONDUIT_COLOR, size: TEXT_H * 0.85 }
        : null;
      return { id: c.id, run: c.run, path: c.path as Vec2[], label, dn };
    });

  // Linhas de comando (interruptor -> luz)
  const pos = new Map(points.map((p) => [p.id, p.position]));
  const links = info.links
    .filter((l) => pos.has(l.switchId) && pos.has(l.lightId))
    .map((l) => ({ switchId: l.switchId, lightId: l.lightId, from: pos.get(l.switchId)!, to: pos.get(l.lightId)!, letter: l.letter, color: CONTROL_COLOR }));

  return { level, points: items, conduits, links, legend: LEGEND_ORDER.filter((k) => legend.has(k)) };
}

/** Ponto de encaixe (centro do símbolo) de um item, para o snap do eletroduto. */
export const itemAnchor = (it: PlanPointItem): Vec2 => it.shape.center;

/** Modelo de desenho de um nível a partir dos resultados (null sem projeto elétrico calculado). */
export function elecPlanFromResults(results: { model: { walls: { id: string; level: string; from: Vec2; to: Vec2; thickness: number }[] }; installations?: { electrical?: { layout: ElectricalLayout; circuits: ElecCircuitResult[]; conduits: ConduitResult[] } } | null }, level: string): ElecPlanModel | null {
  const e = results.installations?.electrical;
  if (!e) return null;
  const walls = results.model.walls.filter((w) => w.level === level).map((w) => ({ id: w.id, from: w.from as Vec2, to: w.to as Vec2, thickness: w.thickness }));
  return buildElecPlan({ layout: e.layout, circuits: e.circuits, conduits: e.conduits, walls, level });
}
