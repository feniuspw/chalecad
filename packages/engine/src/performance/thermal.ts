import { getAssembly, getMaterial, getProfile, type Catalog } from '@chalecad/catalog';
import type { Project } from '../schema/project';
import type { EngineWarning, ThermalElement } from '../schema/results';

const fmt = (n: number, d = 1) => n.toFixed(d).replace('.', ',');
const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

interface Layer {
  /** Espessura (m). */
  e: number;
  lambda: number;
  rho: number;
  c: number;
}

/** R = Σ e/λ (m²·K/W) e CT = Σ e·ρ·c (kJ/m²·K). */
function sumLayers(layers: Layer[]): { R: number; CT: number } {
  let R = 0;
  let CT = 0;
  for (const l of layers) {
    R += l.e / l.lambda;
    CT += l.e * l.rho * l.c;
  }
  return { R, CT };
}

/** Camada térmica de um material do catálogo, ou null se ele não tem propriedades (membrana, parafusos, massa). */
function thermalLayer(catalog: Catalog, materialId: string, thicknessMm?: number): Layer | null {
  const p = catalog.constants.performance.thermal.materials[materialId];
  if (!p) return null;
  const mm = thicknessMm && thicknessMm > 0 ? thicknessMm : (p.thickness ?? 0);
  if (mm <= 0) return null;
  return { e: mm / 1000, lambda: p.lambda, rho: p.rho, c: p.c };
}

export interface ThermalResult {
  zone: number;
  zoneSource: 'project' | 'uf';
  elements: ThermalElement[];
  warnings: EngineWarning[];
}

export function computeThermal(project: Project, catalog: Catalog): ThermalResult {
  const k = catalog.constants.performance.thermal;
  const perf = project.performance;
  const zone = perf.zone ?? k.zoneByUF[project.meta.region] ?? 3;
  const zoneSource = perf.zone !== undefined ? 'project' : 'uf';
  const idx = (alpha: number) => (alpha <= 0.6 ? 0 : 1);
  const limitOf = (table: Record<string, [number, number]>, alpha: number) => {
    const row = table[String(zone)] ?? [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
    return row[idx(alpha)];
  };
  const limitCT = k.wallCT[String(zone)] ?? 0;
  const fin = project.finishes;
  const elements: ThermalElement[] = [];
  const warnings: EngineWarning[] = [];

  // --- Parede externa -----------------------------------------------------------------
  const asm = getAssembly(catalog, project.system.assemblies.exterior);
  const layers: Layer[] = [];
  let insulation = 0;
  for (const l of asm.layers) {
    const t = thermalLayer(catalog, l.materialId, l.thickness);
    if (!t) continue;
    const times = l.face === 'both' ? 2 : 1;
    for (let i = 0; i < times; i++) layers.push(t);
    if (l.face === 'core') insulation += t.e;
  }
  if (fin.facade) {
    const f = thermalLayer(catalog, fin.facade);
    if (f) layers.push(f);
  }
  const web = getProfile(catalog, project.system.profiles.wallStud).web / 1000;
  const sw = sumLayers(layers);
  const gap = web > insulation + 1e-9 ? k.airGapR : 0;
  const wallR = sw.R + gap + k.rsiWall + k.rseWall;
  const wallAlpha = (fin.facade ? k.facadeAlpha[fin.facade] : undefined) ?? k.defaultFacadeAlpha;
  const wall: ThermalElement = {
    id: asm.id,
    kind: 'wall',
    label: `${asm.name} (seção corrente, sem ponte térmica)`,
    U: round(1 / wallR, 3),
    CT: round(sw.CT, 1),
    alpha: wallAlpha,
    limitU: limitOf(k.wallU, wallAlpha),
    limitCT: limitCT > 0 ? limitCT : null,
    okU: false,
    okCT: false,
  };
  wall.okU = wall.U <= wall.limitU + 1e-9;
  wall.okCT = wall.limitCT === null || wall.CT >= wall.limitCT;
  elements.push(wall);
  if (!wall.okU) {
    warnings.push({
      code: 'thermal.wall_u',
      severity: 'warn',
      message: `U = ${fmt(wall.U)} W/m²K acima de ${fmt(wall.limitU)} (zona ${zone}, α ${fmt(wall.alpha)}): aumente o isolante ou use cor clara`,
      refs: [asm.id],
    });
  }
  if (!wall.okCT) {
    warnings.push({
      code: 'thermal.wall_ct',
      severity: 'info',
      message: `CT baixa (≈ ${fmt(wall.CT, 0)} kJ/m²K): sistemas leves pedem avaliação por simulação (NBR 15575-1, procedimento de simulação)`,
      refs: [asm.id],
    });
  }

  // --- Cobertura ------------------------------------------------------------------------
  const cladding = thermalLayer(catalog, project.roof.cladding);
  if (cladding) {
    const rl: Layer[] = [cladding];
    let roofGap = 0;
    if (fin.interiorRoof) {
      const ceil = thermalLayer(catalog, fin.interiorRoof);
      if (ceil) {
        rl.push(ceil);
        roofGap = k.airGapR;
      }
    }
    const sr = sumLayers(rl);
    const roofR = sr.R + roofGap + k.rsiRoof + k.rseRoof;
    const alpha = k.roofAlpha[fin.roofColor ?? 'graphite'] ?? 0.8;
    const roof: ThermalElement = {
      id: 'roof',
      kind: 'roof',
      label: `Cobertura: ${getMaterial(catalog, project.roof.cladding).name}${fin.interiorRoof ? ' com forro' : ''}`,
      U: round(1 / roofR, 3),
      CT: round(sr.CT, 1),
      alpha,
      limitU: limitOf(k.roofU, alpha),
      limitCT: null,
      okU: false,
      okCT: true,
    };
    roof.okU = roof.U <= roof.limitU + 1e-9;
    elements.push(roof);
    if (!roof.okU) {
      warnings.push({
        code: 'thermal.roof_u',
        severity: 'warn',
        message: `U = ${fmt(roof.U)} W/m²K da cobertura acima de ${fmt(roof.limitU)} (zona ${zone}, α ${fmt(roof.alpha)}): aumente o isolante, use cor clara ou acrescente forro`,
        refs: ['roof'],
      });
    }
  }
  return { zone, zoneSource, elements, warnings };
}
