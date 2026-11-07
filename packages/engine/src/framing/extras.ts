import type { Catalog } from '@chalecad/catalog';
import { add3, cross3, scale3, type Vec3 } from '../geometry';
import { EXTRAS, pathSegments, segLen } from '../extras/geometry';
import type { Project } from '../schema/project';
import type { BuildingModel } from '../schema/results';
import { PieceSink, POS_TOL } from './util';

/** Peças LSF dos extras: muro `lsf_board` (montantes e guias) e terças da cobertura do deck. */
export function generateExtras(model: BuildingModel, project: Project, catalog: Catalog, sink: PieceSink): void {
  const sys = project.system;
  const c = catalog.constants;

  for (const e of project.extras) {
    if (e.kind === 'wall' && e.system === 'lsf_board') {
      for (const [a, b] of pathSegments(e.path, e.closed)) {
        const len = segLen(a, b);
        if (len <= 0) continue;
        const dx = (b[0] - a[0]) / len;
        const dy = (b[1] - a[1]) / len;
        const normal: Vec3 = [-dy, dx, 0];
        const P = (u: number, z: number): Vec3 => [a[0] + dx * u, a[1] + dy * u, z];
        sink.add(e.id, 'track_bottom', sys.profiles.wallTrack, P(0, 0), P(len, 0), normal);
        sink.add(e.id, 'track_top', sys.profiles.wallTrack, P(0, e.height), P(len, e.height), normal);
        const us: number[] = [];
        for (let k = 0; k * EXTRAS.lsfStudSpacing < len - POS_TOL; k++) us.push(k * EXTRAS.lsfStudSpacing);
        us.push(len);
        for (const u of us) sink.add(e.id, 'stud', sys.profiles.wallStud, P(u, 0), P(u, e.height), normal);
      }
    }
  }

  for (const em of model.extras) {
    const roof = em.roof;
    if (em.kind !== 'deck' || !roof) continue;
    const normal = cross3(roof.uAxis, roof.vAxis);
    const vs: number[] = [];
    for (let k = 0; k * c.roof.purlinSpacing < roof.vLength - 0.02; k++) vs.push(k * c.roof.purlinSpacing);
    vs.push(roof.vLength);
    for (const v of vs) {
      const a = add3(roof.origin, scale3(roof.vAxis, v));
      sink.add(em.id, 'purlin', sys.profiles.purlin, a, add3(a, scale3(roof.uAxis, roof.uLength)), normal);
    }
  }
}
