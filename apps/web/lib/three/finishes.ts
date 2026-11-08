/**
 * Geometria dos acabamentos no referencial do motor (z para cima): revestimento das paredes de um cômodo,
 * cota do piso e contorno dos forros. Funções puras, sem three, para testar sem DOM.
 */
import type { HostWall, ResolvedOpening, RoomModel, SlabModel, Vec2 } from '@chalecad/engine';

/** Recuo do revestimento em relação à face da parede (m), para não brigar com ela no z-buffer. */
export const LINING_GAP = 0.002;
/** Espessura da placa de piso (m). */
export const FLOOR_PLATE = 0.01;

export interface MeshData {
  /** x, y, z do motor, 3 por vértice. */
  positions: number[];
  /** u, v em metros (u ao longo da parede, v = altura acima da base da parede). */
  uvs: number[];
  indices: number[];
}

/** Topo do contorno da parede em u (maior v do contorno em u), ou null fora do contorno. */
export function outlineTop(outline: Vec2[], u: number): number | null {
  let top: number | null = null;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    const [lo, hi] = a[0] <= b[0] ? [a, b] : [b, a];
    if (u < lo[0] - 1e-9 || u > hi[0] + 1e-9) continue;
    const t = hi[0] - lo[0] < 1e-12 ? 1 : (u - lo[0]) / (hi[0] - lo[0]);
    const v = lo[1] + (hi[1] - lo[1]) * t;
    if (top === null || v > top) top = v;
  }
  return top;
}

/** Cota do piso acabado do cômodo: base das paredes do contorno; senão a laje do nível; senão o radier. */
export function roomFloorZ(room: RoomModel, walls: HostWall[], slabs: SlabModel[]): number {
  for (const e of room.edges) {
    const w = e.hostId ? walls.find((x) => x.id === e.hostId) : undefined;
    if (w) return w.baseZ;
  }
  const own = slabs.find((s) => s.level === room.level && s.kind !== 'radier');
  if (own) return own.topZ;
  return slabs.find((s) => s.kind === 'radier')?.topZ ?? 0;
}

const signedArea = (p: Vec2[]) => p.reduce((s, a, i) => s + (a[0] * p[(i + 1) % p.length]![1] - p[(i + 1) % p.length]![0] * a[1]), 0) / 2;

/**
 * Painéis de revestimento nas paredes do cômodo: para cada trecho do contorno que tem parede, uma faixa vertical
 * recuada `LINING_GAP` da face interna, com vãos de portas e janelas recortados. A altura segue o topo do
 * contorno da parede (empenas) e é limitada pelo teto do cômodo.
 */
export function roomWallMesh(room: RoomModel, walls: HostWall[], openings: ResolvedOpening[]): MeshData {
  const out: MeshData = { positions: [], uvs: [], indices: [] };
  if (!room.polygon || room.polygon.length < 3) return out;
  const ccw = signedArea(room.polygon) >= 0;
  const cap = room.ceiling.max > 0 ? room.ceiling.max : Infinity;

  const quad = (wall: HostWall, d: Vec2, n: Vec2, off: number, a: number, b: number, loA: number, loB: number, hiA: number, hiB: number) => {
    const at = (u: number, v: number): [number, number, number] => [wall.from[0] + d[0] * u + n[0] * off, wall.from[1] + d[1] * u + n[1] * off, wall.baseZ + v];
    const p = [at(a, loA), at(b, loB), at(b, hiB), at(a, hiA)];
    const uv: Vec2[] = [[a, loA], [b, loB], [b, hiB], [a, hiA]];
    const base = out.positions.length / 3;
    for (const q of p) out.positions.push(q[0], q[1], q[2]);
    uv.forEach((q) => out.uvs.push(q[0], q[1]));
    // frente voltada para n: u cresce ao longo de d, "para cima" = z; d x z aponta à direita de d
    const front = n[0] * d[1] - n[1] * d[0] > 0;
    if (front) out.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else out.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  };

  for (const e of room.edges) {
    const wall = e.hostId ? walls.find((w) => w.id === e.hostId) : undefined;
    // fachada envidraçada não leva revestimento (o motor também não orça)
    if (!wall || wall.length < 1e-6 || wall.assemblyId === 'gable_glazed') continue;
    const d: Vec2 = [(wall.to[0] - wall.from[0]) / wall.length, (wall.to[1] - wall.from[1]) / wall.length];
    const ex = e.to[0] - e.from[0];
    const ey = e.to[1] - e.from[1];
    const el = Math.hypot(ex, ey);
    if (el < 1e-6) continue;
    // interior à esquerda do trecho (contorno anti-horário)
    const sgn = ccw ? 1 : -1;
    const n: Vec2 = [(-ey / el) * sgn, (ex / el) * sgn];
    const off = wall.thickness / 2 + LINING_GAP;
    const proj = (p: Vec2) => (p[0] - wall.from[0]) * d[0] + (p[1] - wall.from[1]) * d[1];
    const [ua, ub] = [proj(e.from), proj(e.to)].sort((x, y) => x - y) as [number, number];
    if (ub - ua < 1e-4) continue;

    const own = openings.filter((o) => o.valid && o.hostKind === 'wall' && o.hostId === wall.id && o.u1 > ua && o.u0 < ub);
    const cuts = new Set<number>([ua, ub]);
    for (const p of wall.outline) if (p[0] > ua + 1e-6 && p[0] < ub - 1e-6) cuts.add(p[0]);
    for (const o of own) for (const u of [o.u0, o.u1]) if (u > ua + 1e-6 && u < ub - 1e-6) cuts.add(u);
    const us = [...cuts].sort((x, y) => x - y);

    for (let i = 0; i + 1 < us.length; i++) {
      const a = us[i]!;
      const b = us[i + 1]!;
      const dl = (b - a) * 1e-4;
      const topA = Math.min(outlineTop(wall.outline, a + dl) ?? 0, cap);
      const topB = Math.min(outlineTop(wall.outline, b - dl) ?? 0, cap);
      if (topA <= 1e-3 && topB <= 1e-3) continue;
      const mid = (a + b) / 2;
      const holes = own.filter((o) => o.u0 <= mid && o.u1 >= mid).sort((x, y) => x.v0 - y.v0);
      let cur = 0;
      for (const h of holes) {
        if (h.v0 > cur + 1e-3) quad(wall, d, n, off, a, b, cur, cur, Math.min(h.v0, topA), Math.min(h.v0, topB));
        cur = Math.max(cur, h.v1);
      }
      if (topA - cur > 1e-3 || topB - cur > 1e-3) quad(wall, d, n, off, a, b, cur, cur, Math.max(cur, topA), Math.max(cur, topB));
    }
  }
  return out;
}
