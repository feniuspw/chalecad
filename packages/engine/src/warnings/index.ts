import type { Catalog } from '@chalecad/catalog';
import { framers } from '../framing';
import { pointInPolygon, type Vec2 } from '../geometry';
import type { Project } from '../schema/project';
import { furnitureWarnings } from './furniture';
import { normWarnings } from './norms';
import type {
  BudgetReport,
  BuildingModel,
  EngineWarning,
  Piece,
  QuantityReport,
  RoofPlane,
  Severity,
  StructuralReport,
} from '../schema/results';

export interface WarningContext {
  project: Project;
  model: BuildingModel;
  pieces: Piece[];
  quantities: QuantityReport;
  budget: BudgetReport;
  catalog: Catalog;
  /** Alertas do terreno inclinado (de `computeTerrain`). */
  terrainWarnings?: EngineWarning[];
  /** Pré-dimensionamento (cargas usadas no empuxo do A-frame). */
  structure?: StructuralReport;
}

const EPS = 1e-9;
const SEV_RANK: Record<Severity, number> = { error: 0, warn: 1, info: 2 };
const ROOF_ROLES = new Set(['rafter', 'purlin', 'ridge', 'collar_tie']);

const fmt = (n: number, d = 2) => n.toFixed(d).replace('.', ',');

/** Cota do telhado sobre um ponto da planta, ou null se nenhuma água o cobre. */
function roofZAt(planes: RoofPlane[], p: Vec2): number | null {
  let best: number | null = null;
  for (const r of planes) {
    const [u, v, o] = [r.uAxis, r.vAxis, r.origin];
    const n: [number, number, number] = [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ];
    if (Math.abs(n[2]) < EPS) continue;
    if (!pointInPolygon(p, r.vertices.map((x): Vec2 => [x[0], x[1]]))) continue;
    const z = o[2] - (n[0] * (p[0] - o[0]) + n[1] * (p[1] - o[1])) / n[2];
    if (best === null || z > best) best = z;
  }
  return best;
}

function centroid(poly: Vec2[]): Vec2 {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

/** Montantes da grade (u = k * espaçamento) que coincidem com as bordas do vão deslocado de `d`. */
function alignedEdges(u0: number, u1: number, d: number, s: number, len: number): number {
  const tol = 0.0051;
  const onGrid = (u: number) => {
    if (u <= tol || u >= len - tol) return false;
    const r = u / s;
    return Math.abs(r - Math.round(r)) * s <= tol;
  };
  return (onGrid(u0 + d) ? 1 : 0) + (onGrid(u1 + d) ? 1 : 0);
}

export function computeWarnings(ctx: WarningContext): EngineWarning[] {
  const { project, model, pieces, quantities, budget, catalog } = ctx;
  const c = catalog.constants;
  const out: EngineWarning[] = [];

  // Aberturas
  for (const o of model.openings) {
    if (!o.valid) {
      out.push({
        code: 'opening.invalid',
        severity: 'error',
        message: `A abertura "${o.id}" é inválida: o hospedeiro "${o.hostId}" não existe, não é compatível com o tipo ou o vão não cabe nele.`,
        refs: [o.id, o.hostId],
      });
    }
  }
  const s = project.system.studSpacing;
  for (const o of model.openings) {
    if (!o.valid || o.hostKind !== 'wall') continue;
    const wall = model.walls.find((w) => w.id === o.hostId);
    if (!wall) continue;
    const current = alignedEdges(o.u0, o.u1, 0, s, wall.length);
    let best: { dCm: number; gain: number } | null = null;
    const candidates = new Set<number>();
    for (const u of [o.u0, o.u1]) {
      const nearest = Math.round(u / s) * s;
      for (const g of [nearest - s, nearest, nearest + s]) {
        const d = Math.round((g - u) * 100);
        if (d !== 0 && Math.abs(d) <= c.warnings.modulationMax * 100 + EPS) candidates.add(d);
      }
    }
    for (const dCm of [...candidates].sort((a, b) => Math.abs(a) - Math.abs(b) || b - a)) {
      const d = dCm / 100;
      if (o.u0 + d < 0 || o.u1 + d > wall.length) continue;
      const gain = alignedEdges(o.u0, o.u1, d, s, wall.length) - current;
      if (gain > 0 && (!best || gain > best.gain)) best = { dCm, gain };
    }
    if (best) {
      const dir = best.dCm > 0 ? 'direita' : 'esquerda';
      const word = best.gain === 1 ? 'montante' : 'montantes';
      out.push({
        code: 'opening.modulation',
        severity: 'info',
        message: `Abertura "${o.id}": mover ${Math.abs(best.dCm)} cm para a ${dir} economiza ${best.gain} ${word}.`,
        refs: [o.id, o.hostId],
      });
    }
  }

  // Aço
  const [steelMin, steelMax] = c.steelIndexRange;
  const idx = quantities.steelKgPerM2;
  if (idx < steelMin || idx > steelMax) {
    out.push({
      code: 'steel.index',
      severity: 'warn',
      message: `Índice de aço de ${fmt(idx, 1)} kg/m² fora da faixa usual (${fmt(steelMin, 1)} a ${fmt(steelMax, 1)} kg/m²). Revise perfis e espaçamentos.`,
    });
  }

  // Preços
  if (budget.missingPrices.length > 0) {
    out.push({
      code: 'price.missing',
      severity: 'warn',
      message: `${budget.missingPrices.length} item(ns) sem preço na base (entram como R$ 0,00): ${budget.missingPrices.join(', ')}.`,
      refs: [...budget.missingPrices],
    });
  }
  if (budget.stalePrices.length > 0) {
    out.push({
      code: 'price.stale',
      severity: 'info',
      message: `${budget.stalePrices.length} preço(s) com mais de ${c.priceStaleDays} dias: atualize a cotação.`,
      refs: [...budget.stalePrices],
    });
  }

  // Escadas
  for (const st of model.stairs) {
    if (st.riser > c.stairs.maxRiser + EPS) {
      out.push({
        code: 'stair.riser',
        severity: 'warn',
        message: `Escada "${st.id}": espelho de ${fmt(st.riser * 100, 1)} cm acima do máximo de ${fmt(c.stairs.maxRiser * 100, 1)} cm.`,
        refs: [st.id],
      });
    }
    if (st.blondel < c.stairs.blondelMin - EPS || st.blondel > c.stairs.blondelMax + EPS) {
      out.push({
        code: 'stair.blondel',
        severity: 'info',
        message: `Escada "${st.id}": fórmula de Blondel (2e + p) = ${fmt(st.blondel * 100, 1)} cm, fora do conforto entre ${fmt(c.stairs.blondelMin * 100, 0)} e ${fmt(c.stairs.blondelMax * 100, 0)} cm.`,
        refs: [st.id],
      });
    }
  }

  // Mezanino
  for (const slab of model.slabs) {
    if (slab.kind !== 'mezzanine') continue;
    const roofZ = roofZAt(model.roofPlanes, centroid(slab.polygon));
    if (roofZ !== null && roofZ - slab.topZ < c.warnings.mezzRoofMin - EPS) {
      out.push({
        code: 'mezzanine.headroom',
        severity: 'warn',
        message: `Mezanino "${slab.id}": altura livre sob o telhado no centro de ${fmt(roofZ - slab.topZ)} m, abaixo do mínimo de ${fmt(c.warnings.mezzRoofMin)} m.`,
        refs: [slab.id],
      });
    }
    const under = slab.topZ - slab.thickness;
    if (under < c.warnings.mezzUnderMin - EPS) {
      out.push({
        code: 'mezzanine.headroom',
        severity: 'warn',
        message: `Mezanino "${slab.id}": altura livre sob o mezanino de ${fmt(under)} m, abaixo do mínimo de ${fmt(c.warnings.mezzUnderMin)} m (NBR 15575; ${fmt(c.norms.ceilingLiving)} m em sala e quartos).`,
        refs: [slab.id],
      });
    }
  }

  // Cobertura, extras e terreno
  const hasRoofPieces = pieces.some((p) => ROOF_ROLES.has(p.role));
  if (!framers[model.typology] || (!hasRoofPieces && model.roofPlanes.length > 0)) {
    out.push({
      code: 'typology.partial',
      severity: 'info',
      message: `A tipologia "${model.typology}" ainda não tem gerador de estrutura de cobertura: as peças da cobertura estão ausentes do cálculo.`,
      refs: model.roofPlanes.map((r) => r.id),
    });
  }
  const ignoredExtras = project.extras.filter((e) => e.kind !== 'retaining' && !model.extras.some((m) => m.id === e.id));
  if (ignoredExtras.length > 0) {
    out.push({
      code: 'extras.ignored',
      severity: 'info',
      message: `${ignoredExtras.length} extra(s) do projeto ainda não são calculados pelo motor.`,
      refs: ignoredExtras.map((e) => e.id),
    });
  }
  const t = project.typology;
  if (t.kind === 'flat_roof' && t.parapetHeight < t.depth * (t.slopePct / 100)) {
    out.push({
      code: 'roof.parapet',
      severity: 'warn',
      message: `A platibanda (${t.parapetHeight.toFixed(2)} m) é mais baixa que a queda do telhado (${(t.depth * t.slopePct / 100).toFixed(2)} m): o telhado aparece acima dela no lado alto.`,
      refs: model.roofPlanes.map((r) => r.id),
    });
  }
  const retaining = project.extras.filter((e) => e.kind === 'retaining');
  if (retaining.length > 0) {
    out.push({
      code: 'retaining.engineer',
      severity: 'warn',
      message: 'Muro de arrimo exige projeto de engenharia (estabilidade, drenagem e fundação); as quantidades são estimativas.',
      refs: retaining.map((e) => e.id),
    });
  }
  out.push(...normWarnings({ project, model, catalog, structure: ctx.structure }));
  out.push(...furnitureWarnings({ project, model, catalog }));
  out.push(...(ctx.terrainWarnings ?? []));

  return out
    .map((w, i) => ({ w, i }))
    .sort((a, b) => SEV_RANK[a.w.severity] - SEV_RANK[b.w.severity] || a.i - b.i)
    .map((x) => x.w);
}
