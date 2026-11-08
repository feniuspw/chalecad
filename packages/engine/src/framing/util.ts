import type { Catalog, Profile } from '@chalecad/catalog';
import { length3, type Vec3 } from '../geometry';
import type { Piece, PieceRole } from '../schema/results';
import type { Project } from '../schema/project';

/** Tolerância geométrica: peças menores que isto (m) não são geradas. */
export const MIN_LEN = 0.02;
/** Tolerância de coincidência de posições ao longo de uma parede (m). */
export const POS_TOL = 0.02;

export function profileOf(cat: Catalog, id: string): Profile {
  const p = cat.profiles.find((x) => x.id === id);
  if (!p) throw new Error(`Perfil não encontrado no catálogo: ${id}`);
  return p;
}

/** Variante U (guia/sanefa/cumeeira) de um perfil Ue; se não existir, devolve o próprio perfil. */
export function uVariant(cat: Catalog, ueId: string): string {
  const id = ueId.replace(/^Ue/, 'U');
  return cat.profiles.some((p) => p.id === id) ? id : ueId;
}

/** Acumulador de peças com IDs determinísticos `${hostId}:${role}:${n}`. */
export class PieceSink {
  readonly pieces: Piece[] = [];
  private counters = new Map<string, number>();

  add(hostId: string, role: PieceRole, profileId: string, start: Vec3, end: Vec3, webNormal: Vec3): void {
    const length = length3([end[0] - start[0], end[1] - start[1], end[2] - start[2]]);
    if (!(length >= MIN_LEN)) return;
    const key = `${hostId}:${role}`;
    const n = this.counters.get(key) ?? 0;
    this.counters.set(key, n + 1);
    this.pieces.push({ id: `${key}:${n}`, hostId, role, profileId, length, start, end, webNormal });
  }
}

/** Subtrai intervalos [a,b] de [lo,hi]; devolve os trechos restantes com comprimento > 0. */
export function subtractIntervals(lo: number, hi: number, cuts: [number, number][]): [number, number][] {
  let out: [number, number][] = [[lo, hi]];
  for (const [c0, c1] of cuts) {
    const next: [number, number][] = [];
    for (const [a, b] of out) {
      if (c1 <= a || c0 >= b) next.push([a, b]);
      else {
        if (c0 > a) next.push([a, c0]);
        if (c1 < b) next.push([c1, b]);
      }
    }
    out = next;
  }
  return out.filter(([a, b]) => b - a > 1e-9);
}

/** Espaçamento dos caibros: A-frame pode ter o seu (águas no radier); nas demais, alinhado aos montantes. */
export function rafterSpacingOf(project: Project, catalog: Catalog): number {
  const sys = project.system;
  const own = project.typology.kind === 'a_frame' ? (sys.rafterSpacing ?? sys.studSpacing) : sys.studSpacing;
  return Math.min(catalog.constants.roof.rafterSpacing, own);
}
