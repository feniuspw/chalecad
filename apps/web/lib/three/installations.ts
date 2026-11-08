/**
 * Instalações estimadas: dados puros para a camada 3D, a aba de resultados e o painel.
 * Sem React nem three; coordenadas do motor (z para cima).
 */
import type { Circuit, InstallationPoint, InstallationPointKind, InstallationsReport, Vec2, Vec3 } from '@chalecad/engine';

export type InstallationSystem = 'electric' | 'cold' | 'hot' | 'sewer';

export const SYSTEM_COLORS: Record<InstallationSystem, string> = {
  electric: '#f59e0b',
  cold: '#2563eb',
  hot: '#dc2626',
  sewer: '#78716c',
};

export const TUE_COLOR = '#b91c1c';

export const POINT_LABELS: Record<InstallationPointKind, string> = {
  light: 'Ponto de luz',
  switch: 'Interruptor',
  outlet: 'Tomada',
  outlet_high: 'Tomada alta',
  tue: 'Tomada de uso específico',
  water_cold: 'Água fria',
  water_hot: 'Água quente',
  sewer: 'Esgoto',
  drain: 'Ralo',
  panel: 'Quadro de distribuição',
  tank: "Caixa d'água",
};

export const CIRCUIT_KIND_LABELS: Record<Circuit['kind'], string> = {
  lighting: 'Iluminação',
  outlets: 'Tomadas',
  kitchen: 'Cozinha e áreas molhadas',
  tue: 'Uso específico',
};

export function kindSystem(kind: InstallationPointKind): InstallationSystem {
  switch (kind) {
    case 'water_cold':
    case 'tank':
      return 'cold';
    case 'water_hot':
      return 'hot';
    case 'sewer':
    case 'drain':
      return 'sewer';
    default:
      return 'electric';
  }
}

export function kindColor(kind: InstallationPointKind): string {
  return kind === 'tue' ? TUE_COLOR : SYSTEM_COLORS[kindSystem(kind)];
}

/** Grupos do resumo no painel. */
export const SUMMARY_GROUPS: { id: string; label: string; kinds: InstallationPointKind[] }[] = [
  { id: 'outlets', label: 'Tomadas', kinds: ['outlet', 'outlet_high'] },
  { id: 'tue', label: 'Uso específico', kinds: ['tue'] },
  { id: 'switches', label: 'Interruptores', kinds: ['switch'] },
  { id: 'lights', label: 'Pontos de luz', kinds: ['light'] },
  { id: 'water', label: 'Pontos de água', kinds: ['water_cold', 'water_hot'] },
  { id: 'sewer', label: 'Esgoto e ralos', kinds: ['sewer', 'drain'] },
];

export function summarizePoints(points: InstallationPoint[]): { id: string; label: string; count: number }[] {
  return SUMMARY_GROUPS.map((g) => ({ id: g.id, label: g.label, count: points.filter((p) => g.kinds.includes(p.kind)).length })).filter((g) => g.count > 0);
}

/** Potência de um ponto: a do circuito dividido pelos pontos, só para o tooltip (a conta oficial é do circuito). */
export function pointCircuit(point: InstallationPoint, circuits: Circuit[]): Circuit | null {
  return point.circuitId ? (circuits.find((c) => c.id === point.circuitId) ?? null) : null;
}

export interface PlacedPoint {
  position: Vec3;
  /** Direção da normal da placa em planta (rad). */
  yaw: number;
}

interface WallLine {
  id: string;
  from: Vec2;
  to: Vec2;
  length: number;
}

/** Posição 3D do ponto (z absoluto) e normal da face da parede onde ele fica. */
export function placePoint(point: InstallationPoint, walls: WallLine[], levelElevation: number): PlacedPoint {
  const z = levelElevation + point.height;
  const w = point.hostId ? walls.find((x) => x.id === point.hostId) : undefined;
  if (!w || w.length < 1e-6) return { position: [point.position[0], point.position[1], z], yaw: 0 };
  const dx = (w.to[0] - w.from[0]) / w.length;
  const dy = (w.to[1] - w.from[1]) / w.length;
  const n: Vec2 = [-dy, dx];
  const side = (point.position[0] - w.from[0]) * n[0] + (point.position[1] - w.from[1]) * n[1] >= 0 ? 1 : -1;
  return { position: [point.position[0], point.position[1], z], yaw: Math.atan2(side * n[1], side * n[0]) };
}

export interface Route {
  system: 'electric' | 'cold' | 'hot';
  /** Polilinha em coordenadas do motor. */
  pts: Vec3[];
}

const dist2 = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Trecho em L (Manhattan) de a até b na altura z. */
function manhattan(a: Vec2, b: Vec2, z: number): Vec3[] {
  return [[a[0], a[1], z], [b[0], a[1], z], [b[0], b[1], z]];
}

/**
 * Traçado esquemático: do quadro até os pontos de cada circuito (em L, no teto, com descidas) e da caixa d'água até os pontos de água.
 * `elevations` = cota do piso de cada nível.
 */
export function installationRoutes(report: InstallationsReport, elevations: Record<string, number>): Route[] {
  const elev = (lvl: string) => elevations[lvl] ?? 0;
  const ceilingOf = (lvl: string) => {
    const h = report.points.filter((p) => p.level === lvl && p.kind === 'light').map((p) => p.height);
    return elev(lvl) + (h.length ? Math.max(...h) : 2.5);
  };
  const routes: Route[] = [];

  const panelPos = report.panel.position;
  for (const c of report.circuits) {
    const pts = report.points.filter((p) => p.circuitId === c.id);
    const remaining = [...pts];
    let cur: Vec2 = panelPos;
    while (remaining.length > 0) {
      let bi = 0;
      for (let i = 1; i < remaining.length; i++) if (dist2(cur, remaining[i]!.position) < dist2(cur, remaining[bi]!.position)) bi = i;
      const p = remaining.splice(bi, 1)[0]!;
      const zc = ceilingOf(p.level);
      const line = manhattan(cur, p.position, zc);
      const pz = elev(p.level) + p.height;
      line.push([p.position[0], p.position[1], pz]);
      routes.push({ system: 'electric', pts: line });
      cur = p.position;
    }
  }

  const tank = report.points.find((p) => p.kind === 'tank');
  if (tank) {
    const tz = elev(tank.level) + tank.height;
    for (const p of report.points) {
      if (p.kind !== 'water_cold' && p.kind !== 'water_hot') continue;
      const zc = ceilingOf(p.level);
      const pz = elev(p.level) + p.height;
      routes.push({ system: p.kind === 'water_hot' ? 'hot' : 'cold', pts: [[tank.position[0], tank.position[1], tz], [tank.position[0], tank.position[1], zc], ...manhattan(tank.position, p.position, zc).slice(1), [p.position[0], p.position[1], pz]] });
    }
  }
  return routes;
}

// ---------------------------------------------------------------------------
// Tabelas (aba de resultados)
// ---------------------------------------------------------------------------

export interface CircuitRow {
  n: number;
  id: string;
  kind: string;
  label: string;
  points: number;
  powerVA: number;
  wire: number;
  breaker: number;
  cableLength: number;
}

export function circuitRows(report: InstallationsReport): CircuitRow[] {
  return report.circuits.map((c, i) => ({
    n: i + 1,
    id: c.id,
    kind: CIRCUIT_KIND_LABELS[c.kind],
    label: c.label,
    points: c.points,
    powerVA: c.power,
    wire: c.wire,
    breaker: c.breaker,
    cableLength: c.cableLength,
  }));
}

/** Cabo total por bitola (mm²), da menor para a maior. */
export function wireTotals(report: InstallationsReport): { wire: number; length: number }[] {
  const m = new Map<number, number>();
  for (const c of report.circuits) m.set(c.wire, (m.get(c.wire) ?? 0) + c.cableLength);
  return [...m.entries()].map(([wire, length]) => ({ wire, length })).sort((a, b) => a.wire - b.wire);
}

export function pipeTotals(report: InstallationsReport): { id: string; label: string; length: number }[] {
  const p = report.pipes;
  return [
    { id: 'cold', label: 'Água fria (AF)', length: p.cold },
    { id: 'hot', label: 'Água quente (AQ)', length: p.hot },
    { id: 'sewer40', label: 'Esgoto 40 mm', length: p.sewer40 },
    { id: 'sewer100', label: 'Esgoto 100 mm', length: p.sewer100 },
  ];
}

export const INSTALLATIONS_NOTICE = 'Estimativa pelos mínimos da NBR 5410/5626. O projeto elétrico e hidráulico deve ser feito por profissional habilitado.';
