import type { Catalog, FurnitureSpec } from '@chalecad/catalog';
import { pointInPolygon, type Vec2 } from '../geometry';
import type { Project } from '../schema/project';
import type { BuildingModel, FurnitureModel } from '../schema/results';

const DEG = Math.PI / 180;

/** Retângulo `w × d` (x × y local) girado `rotationDeg` (anti-horário) em torno de `center`; 4 cantos anti-horários. */
export function orientedRect(center: Vec2, w: number, d: number, rotationDeg: number, offset: Vec2 = [0, 0]): Vec2[] {
  const c = Math.cos(rotationDeg * DEG);
  const s = Math.sin(rotationDeg * DEG);
  const [ox, oy] = offset;
  const corners: Vec2[] = [
    [ox - w / 2, oy - d / 2],
    [ox + w / 2, oy - d / 2],
    [ox + w / 2, oy + d / 2],
    [ox - w / 2, oy + d / 2],
  ];
  return corners.map(([x, y]): Vec2 => [center[0] + x * c - y * s, center[1] + x * s + y * c]);
}

/**
 * Faixa de uso do móvel: o retângulo ampliado pelas folgas (frente para −y local, atrás para +y, lados em ±x).
 * null se as quatro folgas forem 0.
 */
export function clearanceRect(center: Vec2, spec: FurnitureSpec, rotationDeg: number): Vec2[] | null {
  const { front, back, sides } = spec.clearance;
  if (front === 0 && back === 0 && sides === 0) return null;
  const w = spec.size.w + 2 * sides;
  const d = spec.size.d + front + back;
  // o centro do retângulo ampliado desloca (back − front) / 2 em y local
  return orientedRect(center, w, d, rotationDeg, [0, (back - front) / 2]);
}

/**
 * Resolve `project.furniture` em contornos na planta. Itens ausentes do catálogo são ignorados
 * (o alerta `furniture.unknown` sai em `warnings/furniture.ts`).
 */
export function resolveFurniture(project: Project, catalog: Catalog, model: BuildingModel): FurnitureModel[] {
  const out: FurnitureModel[] = [];
  for (const f of project.furniture) {
    const spec = catalog.furniture.find((x) => x.id === f.item);
    if (!spec) continue;
    const level = project.levels.find((l) => l.id === f.level);
    const pos: Vec2 = [f.position[0], f.position[1]];
    const room = model.rooms.find((r) => r.level === f.level && r.polygon && pointInPolygon(pos, r.polygon, 0));
    out.push({
      id: f.id,
      item: f.item,
      level: f.level,
      z: level?.elevation ?? 0,
      polygon: orientedRect(pos, spec.size.w, spec.size.d, f.rotation),
      clearance: clearanceRect(pos, spec, f.rotation),
      height: spec.size.h,
      roomId: room?.id ?? null,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Geometria convexa (retângulos): interseção e penetração
// ---------------------------------------------------------------------------

const signed = (p: Vec2[]): number => {
  let a = 0;
  p.forEach((q, i) => {
    const r = p[(i + 1) % p.length]!;
    a += q[0] * r[1] - r[0] * q[1];
  });
  return a / 2;
};

/** Área da interseção de dois polígonos convexos (Sutherland–Hodgman). */
export function convexOverlapArea(a: Vec2[], b: Vec2[]): number {
  const ccw = (p: Vec2[]) => (signed(p) >= 0 ? p : [...p].reverse());
  const clip = ccw(b);
  let poly = ccw(a);
  for (let i = 0; i < clip.length && poly.length > 0; i++) {
    const c0 = clip[i]!;
    const c1 = clip[(i + 1) % clip.length]!;
    const side = (p: Vec2) => (c1[0] - c0[0]) * (p[1] - c0[1]) - (c1[1] - c0[1]) * (p[0] - c0[0]);
    const next: Vec2[] = [];
    poly.forEach((p, k) => {
      const q = poly[(k + 1) % poly.length]!;
      const [sp, sq] = [side(p), side(q)];
      if (sp >= 0) next.push(p);
      if (sp >= 0 !== sq >= 0) {
        const t = sp / (sp - sq);
        next.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    });
    poly = next;
  }
  return poly.length < 3 ? 0 : Math.abs(signed(poly));
}

/**
 * Profundidade de penetração entre dois polígonos convexos (SAT): a menor sobreposição entre as projeções
 * nos eixos das arestas. ≤ 0 se estão separados ou apenas se tocam.
 */
export function penetration(a: Vec2[], b: Vec2[]): number {
  let min = Infinity;
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      const n: Vec2 = [-(q[1] - p[1]) / l, (q[0] - p[0]) / l];
      const range = (s: Vec2[]) => {
        const d = s.map((v) => v[0] * n[0] + v[1] * n[1]);
        return [Math.min(...d), Math.max(...d)] as const;
      };
      const [a0, a1] = range(a);
      const [b0, b1] = range(b);
      min = Math.min(min, Math.min(a1, b1) - Math.max(a0, b0));
    }
  }
  return min;
}

/** Retângulo da parede em planta (eixo `from → to` com a espessura). */
export function wallRect(w: { from: Vec2; to: Vec2; thickness: number }): Vec2[] {
  const dx = w.to[0] - w.from[0];
  const dy = w.to[1] - w.from[1];
  const l = Math.hypot(dx, dy) || 1;
  const h = w.thickness / 2;
  const n: Vec2 = [(-dy / l) * h, (dx / l) * h];
  return [
    [w.from[0] - n[0], w.from[1] - n[1]],
    [w.to[0] - n[0], w.to[1] - n[1]],
    [w.to[0] + n[0], w.to[1] + n[1]],
    [w.from[0] + n[0], w.from[1] + n[1]],
  ];
}
