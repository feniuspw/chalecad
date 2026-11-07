import { signedArea, polygonArea, type Vec2, type Vec3 } from '../geometry';
import type { RoofPlane } from '../schema/results';

const DEG = Math.PI / 180;

export interface PlaneSpec {
  id: string;
  /** Contorno da água em planta (projeção horizontal), qualquer orientação, polígono simples. */
  plan: Vec2[];
  /** Direção horizontal unitária em que a água sobe. */
  rising: Vec2;
  slopeRad: number;
  /** Ponto de planta e cota de referência do plano da água. */
  refPoint: Vec2;
  refZ: number;
}

/**
 * Água plana a partir do contorno em planta. O referencial local segue RoofPlane: `origin` no canto do beiral
 * do retângulo envolvente, u ao longo do beiral, v subindo a água; uAxis × vAxis aponta para fora.
 * Área real = área em planta / cos(inclinação). `vertices` é o contorno real (pode não ser retangular).
 */
export function makePlane(s: PlaneSpec): RoofPlane {
  const cos = Math.cos(s.slopeRad);
  const sin = Math.sin(s.slopeRad);
  const tan = Math.tan(s.slopeRad);
  const [rx, ry] = s.rising;
  // uDir = vDir × nDir, com vDir = (cos·r, sin) e nDir = (−sin·r, cos): (ry, −rx, 0).
  const ux = ry;
  const uy = -rx;
  const zOf = (p: Vec2): number => s.refZ + tan * ((p[0] - s.refPoint[0]) * rx + (p[1] - s.refPoint[1]) * ry);
  const us = s.plan.map((p) => p[0] * ux + p[1] * uy);
  const rs = s.plan.map((p) => p[0] * rx + p[1] * ry);
  const u0 = Math.min(...us);
  const u1 = Math.max(...us);
  const r0 = Math.min(...rs);
  const r1 = Math.max(...rs);
  const o2: Vec2 = [u0 * ux + r0 * rx, u0 * uy + r0 * ry];
  const lift = (p: Vec2): Vec3 => [p[0], p[1], zOf(p)];
  const ccw = signedArea(s.plan) >= 0 ? s.plan : [...s.plan].reverse();
  return {
    id: s.id,
    vertices: ccw.map(lift),
    slopeDeg: s.slopeRad / DEG,
    area: polygonArea(s.plan) / cos,
    origin: lift(o2),
    uAxis: [ux, uy, 0],
    vAxis: [cos * rx, cos * ry, sin],
    uLength: u1 - u0,
    vLength: (r1 - r0) / cos,
    isWall: false,
  };
}
