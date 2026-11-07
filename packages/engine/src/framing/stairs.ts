import type { Catalog } from '@chalecad/catalog';
import type { Vec2, Vec3 } from '../geometry';
import type { Project } from '../schema/project';
import type { BuildingModel } from '../schema/results';
import { PieceSink } from './util';

export function generateStairs(model: BuildingModel, project: Project, _catalog: Catalog, sink: PieceSink): void {
  const sys = project.system;
  for (const rs of model.stairs) {
    const st = project.stairs.find((x) => x.id === rs.id);
    if (!st) continue;
    const a = project.levels.find((l) => l.id === st.from);
    const b = project.levels.find((l) => l.id === st.to);
    if (!a || !b) continue;
    const baseZ = Math.min(a.elevation, b.elevation);
    const r = (st.rotationDeg * Math.PI) / 180;
    const fwd: Vec2 = [Math.sin(r), Math.cos(r)];
    const right: Vec2 = [Math.cos(r), -Math.sin(r)];
    const ladder = rs.type === 'ladder';
    const w = ladder ? 0.5 : st.width;
    const toPlan = (sv: number, f: number): Vec2 => [
      st.position[0] + right[0] * sv + fwd[0] * f,
      st.position[1] + right[1] * sv + fwd[1] * f,
    ];
    const n = rs.steps;
    const role = ladder ? 'stud' : 'stair_stringer';
    const profile = ladder ? sys.profiles.wallStud : sys.profiles.joist;

    /** Dois banzos de um lance: de (s0, f0, z0) a (s1, f1, z1), com lados em ±lateral. */
    const flight = (
      sFrom: number,
      fFrom: number,
      dirS: number,
      dirF: number,
      run: number,
      z0: number,
      rise: number,
      lateral: [number, number],
    ): void => {
      const hyp = Math.hypot(run, rise);
      if (hyp <= 0) return;
      // direção horizontal em planta do lance
      const h: Vec2 = [right[0] * dirS + fwd[0] * dirF, right[1] * dirS + fwd[1] * dirF];
      const wn: Vec3 = [(-h[0] * rise) / hyp, (-h[1] * rise) / hyp, run / hyp];
      // lateral: deslocamento perpendicular ao lance (no plano horizontal)
      const perpS = dirF; // perpendicular a (dirS, dirF) é (dirF, -dirS)
      const perpF = -dirS;
      for (const off of lateral) {
        const p0 = toPlan(sFrom + perpS * off, fFrom + perpF * off);
        const p1 = toPlan(sFrom + perpS * off + dirS * run, fFrom + perpF * off + dirF * run);
        sink.add(rs.id, role, profile, [p0[0], p0[1], baseZ + z0], [p1[0], p1[1], baseZ + z0 + rise], wn);
      }
    };

    if (rs.type === 'l_shape' && n >= 3) {
      const m = Math.floor(n / 2);
      const run1 = (m - 1) * rs.going;
      flight(0, 0, 0, 1, run1, 0, m * rs.riser, [0, w]);
      const run2 = (n - 1 - m) * rs.going;
      const turn = st.turnRight ? 1 : -1;
      const sStart = st.turnRight ? w : 0;
      // lateral (perpendicular ao lance 2) em f = run1 e f = run1 + w
      flight(sStart, run1, turn, 0, run2, m * rs.riser, (n - m) * rs.riser, turn === 1 ? [0, -w] : [0, w]);
    } else {
      const run = (n - 1) * rs.going;
      flight(0, 0, 0, 1, run, 0, n * rs.riser, [0, w]);
    }
  }
}
