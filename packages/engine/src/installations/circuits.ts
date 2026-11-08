import type { Catalog } from '@chalecad/catalog';
import type { Vec2 } from '../geometry';
import type { Project } from '../schema/project';
import type { Circuit, EngineWarning } from '../schema/results';
import { manhattan, polygonCentroid } from './geo';
import type { PlacedPoints, PointEx } from './points';

export interface CircuitsResult {
  circuits: Circuit[];
  conduit: number;
  demandKw: number;
  warnings: EngineWarning[];
}

const EPS = 1e-9;
const CONDUCTORS = 3;
const TUE_OWN_CIRCUIT_W = 1200;
const DEMAND_THREE_PHASE_KW = 12;
const WET = new Set(['kitchen', 'laundry']);
const fmt = (n: number, d = 1) => n.toFixed(d).replace('.', ',');

interface Group {
  kind: Circuit['kind'];
  label: string;
  /** Pontos com carga e os de comando/derivação sem carga. */
  points: PointEx[];
  power: number;
  min: number;
}

/** Enche circuitos em sequência; um ponto sem carga (interruptor) fica no circuito corrente. */
function bin(points: PointEx[], max: number): PointEx[][] {
  const out: PointEx[][] = [];
  let cur: PointEx[] = [];
  let sum = 0;
  for (const p of points) {
    if (cur.length > 0 && p.load > 0 && sum + p.load > max + EPS) {
      out.push(cur);
      cur = [];
      sum = 0;
    }
    cur.push(p);
    sum += p.load;
  }
  if (cur.length > 0) out.push(cur);
  return out;
}

export function buildCircuits(project: Project, placed: PlacedPoints, catalog: Catalog): CircuitsResult {
  const k = catalog.constants.installations;
  const elevOf = (id: string) => project.levels.find((l) => l.id === id)?.elevation ?? 0;
  const warnings: EngineWarning[] = [];
  const { panel } = placed;

  // Cômodos em sequência de vizinhança: por nível e, dentro dele, vizinho mais próximo a partir do quadro.
  const levels = [...new Set(placed.rooms.map((r) => r.level))].sort((a, b) => elevOf(a) - elevOf(b));
  const order: string[] = [];
  let from: Vec2 = panel.position;
  for (const lv of levels) {
    const left = placed.rooms.filter((r) => r.level === lv);
    while (left.length > 0) {
      let bi = 0;
      let bd = Infinity;
      left.forEach((r, i) => {
        const d = manhattan(from, polygonCentroid(r.polygon!));
        if (d < bd - EPS) {
          bd = d;
          bi = i;
        }
      });
      const [r] = left.splice(bi, 1);
      order.push(r!.id);
      from = polygonCentroid(r!.polygon!);
    }
  }
  const roomsOrdered = order.map((id) => placed.rooms.find((r) => r.id === id)!);
  const inRoom = (id: string) => placed.points.filter((p) => p.roomId === id);

  const lighting: PointEx[] = [];
  const general: PointEx[] = [];
  const groups: Group[] = [];
  const tue: Group[] = [];
  for (const room of roomsOrdered) {
    const pts = inRoom(room.id);
    const lights = pts.filter((p) => p.kind === 'light');
    lighting.push(...lights, ...pts.filter((p) => p.kind === 'switch'));
    const loads = pts.filter((p) => p.kind === 'outlet' || p.kind === 'outlet_high' || (p.kind === 'tue' && p.load <= TUE_OWN_CIRCUIT_W));
    const big = pts.filter((p) => p.kind === 'tue' && p.load > TUE_OWN_CIRCUIT_W);
    if (WET.has(room.use)) {
      bin(loads, k.circuitMaxVA).forEach((b, i, all) => {
        groups.push({
          kind: 'kitchen',
          label: all.length > 1 ? `${room.name} ${i + 1}` : room.name,
          points: b,
          power: b.reduce((s, p) => s + p.load, 0),
          min: 2.5,
        });
      });
    } else general.push(...loads);
    for (const p of big) {
      tue.push({ kind: 'tue', label: `${p.label.split(':')[0]} (${room.name})`, points: [p], power: p.load, min: 2.5 });
    }
  }
  const all: Group[] = [];
  bin(lighting, k.circuitMaxVA).forEach((b, i) =>
    all.push({ kind: 'lighting', label: `Iluminação ${i + 1}`, points: b, power: b.reduce((s, p) => s + p.load, 0), min: 1.5 }),
  );
  bin(general, k.circuitMaxVA).forEach((b, i) =>
    all.push({ kind: 'outlets', label: `Tomadas ${i + 1}`, points: b, power: b.reduce((s, p) => s + p.load, 0), min: 2.5 }),
  );
  all.push(...groups, ...tue);

  const circuits: Circuit[] = [];
  let conduit = 0;
  all.forEach((g, i) => {
    if (g.points.length === 0) return;
    const id = `C${i + 1}`;
    const current = g.power / k.voltage;
    const rows = [...k.wireTable].sort((a, b) => a[0] - b[0]);
    const row = rows.find((r) => r[0] >= current - EPS && r[1] >= g.min - EPS) ?? rows[rows.length - 1]!;
    if (current > rows[rows.length - 1]![0] + EPS) {
      warnings.push({
        code: 'install.wire_table',
        severity: 'warn',
        message: `Circuito "${g.label}" com ${fmt(current)} A passa da última bitola da tabela (${row[1]} mm²): dividir o circuito ou revisar com o projetista elétrico.`,
        refs: [id],
      });
    }
    let path = 0;
    for (const p of g.points) {
      path += manhattan(panel.position, p.position) * k.routingFactor + k.dropPerPoint + elevOf(p.level);
      p.circuitId = id;
    }
    conduit += path;
    circuits.push({
      id,
      kind: g.kind,
      label: g.label,
      points: g.points.length,
      power: g.power,
      wire: row[1],
      breaker: row[2],
      cableLength: path * CONDUCTORS,
    });
    if (g.kind === 'tue' && g.points[0]?.item === 'electric_shower' && row[1] >= 6) {
      warnings.push({
        code: 'install.shower_wire',
        severity: 'info',
        message: `O circuito do chuveiro (${g.power} W, ${fmt(current)} A) pede cabo de ${fmt(row[1], 0)} mm² e disjuntor de ${row[2]} A.`,
        refs: [id],
      });
    }
  });

  const demandKw = (circuits.reduce((s, c) => s + c.power, 0) * k.demandFactor) / 1000;
  if (demandKw > DEMAND_THREE_PHASE_KW) {
    warnings.push({
      code: 'install.demand',
      severity: 'info',
      message: `Demanda estimada de ${fmt(demandKw)} kW. Pode exigir entrada trifásica; confirme com a concessionária.`,
    });
  }
  return { circuits, conduit, demandKw, warnings };
}
