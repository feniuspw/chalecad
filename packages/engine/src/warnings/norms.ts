import type { Catalog } from '@chalecad/catalog';
import { pointInPolygon, polygonArea, type Vec2 } from '../geometry';
import { annexGeometry } from '../model/annex';
import type { Project } from '../schema/project';
import type { BuildingModel, EngineWarning, ResolvedOpening, RoofPlane, StructuralReport } from '../schema/results';

const EPS = 1e-9;
const fmt = (n: number, d = 2) => n.toFixed(d).replace('.', ',');

/** Cota do telhado (menor, se houver mais de uma água) sobre um ponto, ou null. */
function roofBelowAt(planes: RoofPlane[], p: Vec2): number | null {
  let best: number | null = null;
  for (const r of planes) {
    const [u, v, o] = [r.uAxis, r.vAxis, r.origin];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]] as const;
    if (Math.abs(n[2]) < EPS) continue;
    if (!pointInPolygon(p, r.vertices.map((x): Vec2 => [x[0], x[1]]))) continue;
    const z = o[2] - (n[0] * (p[0] - o[0]) + n[1] * (p[1] - o[1])) / n[2];
    if (best === null || z < best) best = z;
  }
  return best;
}

const openingArea = (o: ResolvedOpening) => (o.u1 - o.u0) * (o.v1 - o.v0);
const LIGHTING = new Set<ResolvedOpening['type']>(['window', 'sliding_door', 'skylight']);

export interface NormContext {
  project: Project;
  model: BuildingModel;
  catalog: Catalog;
  structure?: StructuralReport;
}

/**
 * Alertas de norma e de código de obras que o pré-dimensionamento estrutural não cobre: pé-direito, altura livre
 * da escada, guarda-corpo, iluminação/ventilação, vidro de segurança e empuxo do A-frame. Valores do catálogo
 * (`constants.norms`); o código de obras do município pode exigir mais.
 */
export function normWarnings(ctx: NormContext): EngineWarning[] {
  const { project, model, catalog } = ctx;
  const c = catalog.constants;
  const nm = c.norms;
  const out: EngineWarning[] = [];
  const t = project.typology;

  // --- Pé-direito sob o mezanino (sala/cozinha costumam ficar ali) ----------------
  for (const slab of model.slabs) {
    if (slab.kind !== 'mezzanine') continue;
    const under = slab.topZ - slab.thickness;
    if (under >= c.warnings.mezzUnderMin - EPS && under < nm.ceilingLiving - EPS) {
      out.push({
        code: 'norm.ceiling',
        severity: 'info',
        message:
          `Pé-direito sob o mezanino de ${fmt(under)} m: serve para cozinha, banheiro e circulação (${fmt(nm.ceilingService)} m), ` +
          `mas sala e quartos pedem ${fmt(nm.ceilingLiving)} m (NBR 15575). Para sala embaixo, suba o mezanino.`,
        refs: [slab.id],
      });
    }
  }

  // --- Cômodos laterais do A-frame: lado baixo do teto inclinado -------------------
  if (t.kind === 'a_frame' && t.annexes.length > 0) {
    let geo: ReturnType<typeof annexGeometry> = [];
    try {
      geo = annexGeometry(t);
    } catch {
      geo = [];
    }
    for (const g of geo) {
      if (g.lowHeight >= nm.ceilingLiving - EPS) continue;
      const lado = g.side === 'left' ? 'esquerda' : 'direita';
      out.push({
        code: 'norm.ceiling',
        severity: g.lowHeight < nm.ceilingService - EPS ? 'warn' : 'info',
        message:
          `Cômodo à ${lado}: o lado baixo do teto fica com ${fmt(g.lowHeight)} m. Quarto pede ${fmt(nm.ceilingLiving)} m e banheiro ${fmt(nm.ceilingService)} m ` +
          `(NBR 15575; em teto inclinado alguns códigos aceitam a média). Aumente a altura junto ao A-frame ou reduza a inclinação.`,
        refs: [`annex-${g.side}-roof`],
      });
    }
  }

  // --- Escadas: altura livre, corrimão e guarda-corpo do lado aberto ---------------
  const th = c.stairs.treadThickness;
  const mezz = model.slabs.filter((s) => s.kind === 'mezzanine');
  for (const st of model.stairs) {
    let minClear = Infinity;
    for (const tr of st.treads) {
      const p: Vec2 = [tr.center[0], tr.center[1]];
      const top = tr.center[2] + th / 2;
      let over = roofBelowAt(model.roofPlanes, p) ?? Infinity;
      for (const s of mezz) {
        const bottom = s.topZ - s.thickness;
        if (bottom > top + 0.05 && pointInPolygon(p, s.polygon)) over = Math.min(over, bottom);
      }
      minClear = Math.min(minClear, over - top);
    }
    if (minClear < nm.stairHeadroom - EPS) {
      out.push({
        code: 'norm.stair_headroom',
        severity: 'warn',
        message: `Escada "${st.id}": altura livre de ${fmt(minClear)} m sobre algum degrau (mínimo ${fmt(nm.stairHeadroom)} m). Mova a escada para baixo da parte alta do telhado ou fora da projeção do mezanino.`,
        refs: [st.id],
      });
    }
  }
  if (model.stairs.length > 0) {
    out.push({
      code: 'norm.stair_guard',
      severity: 'info',
      message:
        `Escada: prever corrimão entre ${fmt(nm.handrailMin)} e ${fmt(nm.handrailMax)} m e, no lado aberto, guarda-corpo de ${fmt(nm.guardrailHeight)} m ` +
        `(NBR 9077 / NBR 14718). O modelo não desenha esses elementos.`,
      refs: model.stairs.map((s) => s.id),
    });
  }

  // --- Guarda-corpo do mezanino ---------------------------------------------------
  for (const l of project.levels) {
    if (!l.polygon || l.elevation <= 0) continue;
    out.push(
      l.guardrail
        ? {
            code: 'norm.guardrail',
            severity: 'info',
            message: `Guarda-corpo do mezanino: ${fmt(nm.guardrailHeight)} m de altura, vãos de no máximo ${fmt(nm.guardrailMaxGap * 100, 0)} cm e sem elementos horizontais escaláveis (NBR 14718).`,
            refs: [`slab-${l.id}`],
          }
        : {
            code: 'norm.guardrail',
            severity: 'warn',
            message: `Mezanino "${l.name ?? l.id}" sem guarda-corpo: borda livre a ${fmt(l.elevation)} m do piso exige guarda-corpo de ${fmt(nm.guardrailHeight)} m (NBR 14718).`,
            refs: [`slab-${l.id}`],
          },
    );
  }

  // --- Iluminação e ventilação por volume ----------------------------------------
  interface Zone {
    name: string;
    area: number;
    hosts: (id: string) => boolean;
  }
  const zones: Zone[] = [];
  if (t.kind === 'a_frame' && t.annexes.length > 0) {
    zones.push({ name: 'Corpo do A-frame', area: t.width * t.depth, hosts: (id) => !id.startsWith('annex-') });
    for (const a of t.annexes) {
      const lado = a.side === 'left' ? 'esquerda' : 'direita';
      zones.push({ name: `Cômodo à ${lado}`, area: a.width * a.length, hosts: (id) => id.startsWith(`annex-${a.side}-`) });
    }
  } else {
    zones.push({ name: 'Térreo', area: polygonArea(model.footprint), hosts: () => true });
  }
  const glazedWalls = model.walls.filter((w) => w.assemblyId === 'gable_glazed');
  for (const z of zones) {
    if (!(z.area > 0)) continue;
    let glass = model.openings
      .filter((o) => o.valid && LIGHTING.has(o.type) && z.hosts(o.hostId))
      .reduce((s, o) => s + openingArea(o), 0);
    for (const w of glazedWalls) {
      if (!z.hosts(w.id)) continue;
      const holes = model.openings.filter((o) => o.valid && o.hostId === w.id).reduce((s, o) => s + openingArea(o), 0);
      glass += Math.max(0, polygonArea(w.outline) - holes);
    }
    const need = z.area * nm.lightRatio;
    if (glass < need - EPS) {
      out.push({
        code: 'norm.lighting',
        severity: 'warn',
        message:
          `${z.name}: ${fmt(glass)} m² de janelas para ${fmt(z.area, 1)} m² de piso. Iluminação pede cerca de 1/${fmt(1 / nm.lightRatio, 0)} da área ` +
          `(${fmt(need)} m²) e ventilação 1/${fmt(1 / nm.ventRatio, 0)} (${fmt(z.area * nm.ventRatio)} m²), conforme o código de obras. ` +
          `Cada cômodo fechado (quarto, banheiro) precisa da própria janela; banheiro pode usar exaustão mecânica.`,
      });
    }
  }

  // --- Vidro de segurança --------------------------------------------------------
  if (glazedWalls.length > 0) {
    out.push({
      code: 'norm.safety_glass',
      severity: 'warn',
      message:
        'Fachada envidraçada: usar vidro de segurança (laminado, ou temperado laminado nas partes altas) e caixilharia dimensionada para o vento do local (NBR 7199, NBR 10821). Os montantes de aço do modelo não substituem a caixilharia.',
      refs: glazedWalls.map((w) => w.id),
    });
  }
  const low = model.openings.filter(
    (o) => o.valid && o.hostKind === 'wall' && (o.type === 'sliding_door' || (o.type === 'window' && o.v0 < nm.safetyGlassSill - EPS)),
  );
  if (low.length > 0) {
    out.push({
      code: 'norm.safety_glass',
      severity: 'info',
      message: `${low.length} abertura(s) com vidro abaixo de ${fmt(nm.safetyGlassSill)} m do piso (portas de correr ou janelas baixas): vidro de segurança temperado ou laminado (NBR 7199).`,
      refs: low.map((o) => o.id),
    });
  }

  // --- Empuxo do A-frame -----------------------------------------------------------
  if (t.kind === 'a_frame' && ctx.structure) {
    const L = ctx.structure.loads;
    const span = t.width;
    const rise = t.ridgeHeight - t.kneeWallHeight;
    const slope = Math.atan2(rise, span / 2);
    // carga por m² de planta (permanente da água inclinada + sobrecarga) e arco triarticulado: H = w·S² / (8·f)
    const w = c.loads.gammaG * (L.deadRoofKPa / Math.cos(slope)) + c.loads.gammaQ * L.liveRoofKPa;
    const H = (w * span * span) / (8 * rise);
    out.push({
      code: 'norm.aframe_thrust',
      severity: 'warn',
      message:
        `A-frame: empuxo horizontal de cerca de ${fmt(H)} kN por metro na base de cada água (ELU, arco triarticulado). ` +
        `Prever a amarração da base (tirante ou viga de borda do radier com chumbadores para cisalhamento) e a ligação na cumeeira; validar com o engenheiro.`,
      refs: ['roof-a', 'roof-b'],
    });
  }

  return out;
}
