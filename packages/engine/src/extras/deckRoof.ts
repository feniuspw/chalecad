import { add3, cross3, dot3, pointInPolygon, scale3, sub3, type Vec2, type Vec3 } from '../geometry';
import type { Project } from '../schema/project';
import type { RoofPlane } from '../schema/results';
import type { DeckE, DeckGeometry, ExtrasConstants } from './geometry';

const DEG = Math.PI / 180;

/** LOCAL: folga entre a água do deck e a face de baixo do telhado principal (terças e telha), m. */
export const DECK_ROOF_MARGIN = 0.1;
/** LOCAL: passo da malha de amostras da cobertura do deck (m). */
const SAMPLE_STEP = 0.1;

/** Cota da água do telhado principal sobre (x, y); `null` se nenhuma água cobre o ponto. Vale a mais baixa. */
export function mainRoofZ(planes: RoofPlane[], x: number, y: number): number | null {
  let best: number | null = null;
  for (const r of planes) {
    const n = cross3(r.uAxis, r.vAxis);
    if (Math.abs(n[2]) < 1e-9) continue;
    if (!pointInPolygon([x, y], r.vertices.map((v): Vec2 => [v[0], v[1]]), 1e-6)) continue;
    const z = r.origin[2] - (n[0] * (x - r.origin[0]) + n[1] * (y - r.origin[1])) / n[2];
    if (best === null || z < best) best = z;
  }
  return best;
}

/**
 * Onde a cobertura do deck pode encostar na fachada sem atravessar o telhado principal:
 * `zMax` = cota máxima no encontro e `q0` = distância da fachada onde a água do deck começa
 * (nas fachadas de beiral, a água começa logo após o beiral principal, um pouco abaixo dele).
 * É o ponto de partida; `deckRoof` ainda confere o telhado real por amostragem.
 */
function deckRoofStart(project: Project, side: DeckE['side']): { zMax: number; q0: number } {
  const t = project.typology;
  const margin = 0.1;
  switch (t.kind) {
    case 'gable_mezzanine':
    case 'gambrel':
    case 'combined': {
      const pitch = (t.kind === 'gambrel' ? t.lowerPitchDeg : t.roofPitchDeg) * DEG;
      const ridgeAlongY = t.kind === 'combined' ? false : project.roof.ridgeAxis === 'depth';
      const gableSide = ridgeAlongY ? side === 'front' || side === 'back' : side === 'left' || side === 'right';
      if (gableSide) return { zMax: t.wallHeight - margin, q0: 0 };
      return { zMax: t.wallHeight - t.eave * Math.tan(pitch) - 0.05, q0: t.eave };
    }
    case 'shed':
      return { zMax: t.lowHeight - margin, q0: 0 };
    case 'flat_roof':
      return { zMax: t.wallHeight - margin, q0: 0 };
    case 'a_frame':
      return { zMax: Math.max(2.4, Math.min(t.ridgeHeight * 0.45, 3)), q0: 0 };
  }
}

export interface DeckRoofResult {
  roof: RoofPlane;
  /** Distância da fachada em que a água começa (lado alto). */
  q0: number;
  /** Cota do lado alto. */
  zHigh: number;
  /** tan da inclinação. */
  tan: number;
  /** true se não coube com a folga mínima sob a borda baixa (a água continua sem atravessar o telhado). */
  clipped: boolean;
}

/**
 * Água de cobertura do deck: meia-água caindo para fora, sem invadir o telhado principal. Procura, por amostragem
 * sobre a malha real das águas, a combinação (início, inclinação) que mantém o pé-direito livre; se não houver,
 * usa a inclinação mínima e a cota que ainda passa por baixo do telhado (`clipped`).
 */
export function deckRoof(id: string, g: DeckGeometry, project: Project, x: ExtrasConstants, topZ: number, mainPlanes: RoofPlane[], side: DeckE['side']): DeckRoofResult {
  const proj = g.q1 + x.deckCoverBeiral;
  const start = deckRoofStart(project, side);
  const qStart = Math.min(start.q0, proj - 0.2);

  // Malha de cotas do telhado principal sobre a área possível da água do deck.
  const aS: number[] = [];
  for (let a = g.a0; a < g.a1 - 1e-9; a += 0.25) aS.push(a);
  aS.push(g.a1);
  const grid: { q: number; z: number }[] = [];
  for (let q = qStart; q < proj - 1e-9; q += SAMPLE_STEP) {
    for (const a of aS) {
      const [px, py] = g.at(a, q);
      const z = mainRoofZ(mainPlanes, px, py);
      if (z !== null) grid.push({ q, z });
    }
  }
  for (const a of aS) {
    const [px, py] = g.at(a, proj);
    const z = mainRoofZ(mainPlanes, px, py);
    if (z !== null) grid.push({ q: proj, z });
  }

  const zCap = (q0: number, tan: number): number => {
    let cap = start.zMax;
    for (const s of grid) if (s.q >= q0 - 1e-9) cap = Math.min(cap, s.z - DECK_ROOF_MARGIN + (s.q - q0) * tan);
    return cap;
  };

  const pitches: number[] = [];
  for (let i = 0; i <= 4; i++) pitches.push(x.deckCoverPitchDeg - ((x.deckCoverPitchDeg - x.deckCoverMinPitchDeg) * i) / 4);
  let pick: { q0: number; pitch: number; zHigh: number } | null = null;
  search: for (let q0 = qStart; q0 <= proj - 0.6 + 1e-9; q0 += SAMPLE_STEP) {
    const run = proj - q0;
    for (const pitch of pitches) {
      const tan = Math.tan(pitch * DEG);
      const desired = topZ + x.deckCoverClearance + run * tan;
      const zHigh = Math.min(desired, zCap(q0, tan));
      if (zHigh - run * tan >= topZ + x.deckCoverMinClearance - 1e-9) {
        pick = { q0, pitch, zHigh };
        break search;
      }
    }
  }
  let clipped = false;
  if (!pick) {
    clipped = true;
    const pitch = x.deckCoverMinPitchDeg;
    pick = { q0: qStart, pitch, zHigh: zCap(qStart, Math.tan(pitch * DEG)) };
  }

  const { q0, pitch, zHigh } = pick;
  const slope = pitch * DEG;
  const cos = Math.cos(slope);
  const sin = Math.sin(slope);
  const tan = Math.tan(slope);
  const pt = (a: number, q: number): Vec3 => {
    const p = g.at(a, q);
    return [p[0], p[1], zHigh - (q - q0) * tan];
  };
  const vDir: Vec3 = [-g.n[0] * cos, -g.n[1] * cos, sin];
  const nDir: Vec3 = [g.n[0] * sin, g.n[1] * sin, cos];
  const uDir = cross3(vDir, nDir);
  const p0 = pt(g.a0, proj);
  const p1 = pt(g.a1, proj);
  const origin = dot3(uDir, sub3(p1, p0)) > 0 ? p0 : p1;
  const uLength = g.length;
  const vLength = (proj - q0) / cos;
  const du = scale3(uDir, uLength);
  const dv = scale3(vDir, vLength);
  const roof: RoofPlane = {
    id,
    vertices: [origin, add3(origin, du), add3(add3(origin, du), dv), add3(origin, dv)],
    slopeDeg: pitch,
    area: uLength * vLength,
    origin,
    uAxis: uDir,
    vAxis: vDir,
    uLength,
    vLength,
    isWall: false,
  };
  return { roof, q0, zHigh, tan, clipped };
}
