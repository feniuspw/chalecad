import type { BuildingModel, Piece, PieceRole } from '../../src/schema/results';
import type { Project } from '../../src/schema/project';
import type { Vec2, Vec3 } from '../../src/geometry';

/** Altura do contorno (u, v) na posição u: maior v do polígono sobre a vertical. */
function heightAt(outline: Vec2[], u: number): number {
  let h = 0;
  outline.forEach((a, i) => {
    const b = outline[(i + 1) % outline.length]!;
    const lo = Math.min(a[0], b[0]);
    const hi = Math.max(a[0], b[0]);
    if (u < lo - 1e-9 || u > hi + 1e-9) return;
    h = Math.max(h, hi === lo ? Math.max(a[1], b[1]) : a[1] + ((b[1] - a[1]) * (u - a[0])) / (b[0] - a[0]));
  });
  return h;
}

/**
 * Gerador sintético de peças, só para testar o fluxo de quantitativos e peso
 * (o gerador real está em src/framing). Não é estruturalmente correto.
 */
export function syntheticPieces(model: BuildingModel, project: Project): Piece[] {
  const pieces: Piece[] = [];
  const pr = project.system.profiles;
  let n = 0;
  const add = (hostId: string, role: PieceRole, profileId: string, start: Vec3, end: Vec3) => {
    const length = Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
    pieces.push({ id: `p${n++}`, hostId, role, profileId, length, start, end, webNormal: [0, 0, 1] });
  };
  const at = (w: BuildingModel['walls'][number], u: number, v: number): Vec3 => {
    const t = u / w.length;
    return [w.from[0] + (w.to[0] - w.from[0]) * t, w.from[1] + (w.to[1] - w.from[1]) * t, w.baseZ + v];
  };

  for (const w of model.walls) {
    add(w.id, 'track_bottom', pr.wallTrack, at(w, 0, 0), at(w, w.length, 0));
    add(w.id, 'track_top', pr.wallTrack, at(w, 0, heightAt(w.outline, 0)), at(w, w.length, heightAt(w.outline, w.length)));
    const spacing = project.system.studSpacing;
    for (let u = 0; u <= w.length + 1e-9; u += spacing) {
      const uu = Math.min(u, w.length);
      const h = heightAt(w.outline, uu);
      if (h > 0.1) add(w.id, 'stud', pr.wallStud, at(w, uu, 0), at(w, uu, h));
    }
    add(w.id, 'blocking', pr.wallStud, at(w, 0, 1.2), at(w, w.length, 1.2));
    for (const o of model.openings.filter((x) => x.hostId === w.id && x.valid)) {
      add(w.id, 'header', pr.joist, at(w, o.u0, o.v1), at(w, o.u1, o.v1));
      add(w.id, 'jack', pr.wallStud, at(w, o.u0, 0), at(w, o.u0, o.v1));
      add(w.id, 'jack', pr.wallStud, at(w, o.u1, 0), at(w, o.u1, o.v1));
    }
  }
  for (const r of model.roofPlanes) {
    const [o, uA, vA] = [r.origin, r.uAxis, r.vAxis];
    for (let u = 0; u <= r.uLength + 1e-9; u += 0.6) {
      const s: Vec3 = [o[0] + uA[0] * u, o[1] + uA[1] * u, o[2] + uA[2] * u];
      add(r.id, 'rafter', pr.rafter, s, [s[0] + vA[0] * r.vLength, s[1] + vA[1] * r.vLength, s[2] + vA[2] * r.vLength]);
    }
    add(r.id, 'purlin', pr.purlin, o, [o[0] + uA[0] * r.uLength, o[1] + uA[1] * r.uLength, o[2] + uA[2] * r.uLength]);
  }
  for (const s of model.slabs.filter((x) => x.kind === 'mezzanine')) {
    const xs = s.polygon.map((p) => p[0]);
    const ys = s.polygon.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    for (let y = y0; y <= y1 + 1e-9; y += 0.6) add(s.id, 'joist', pr.joist, [x0, y, s.topZ - 0.2], [x1, y, s.topZ - 0.2]);
  }
  return pieces;
}
