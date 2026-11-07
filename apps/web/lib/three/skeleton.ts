/**
 * Esqueleto: dados puros para instanciar as peças da estrutura (uma malha instanciada por perfil e camada).
 * Cada peça vira uma matriz 4x4 (coluna-maior) que leva a seção unitária (comprimento 1 ao longo de X,
 * altura da alma ao longo de Y = `webNormal`, mesa ao longo de Z) para o lugar da peça, no referencial do motor.
 */
import type { Piece, PieceRole, Vec3 } from '@chalecad/engine';

export type RoleGroup = 'stud' | 'track' | 'header' | 'joist' | 'rafter' | 'purlin' | 'other';

export const ROLE_GROUP: Record<PieceRole, RoleGroup> = {
  stud: 'stud',
  stud_corner: 'stud',
  king: 'stud',
  jack: 'stud',
  cripple: 'stud',
  track_bottom: 'track',
  track_top: 'track',
  header: 'header',
  sill: 'header',
  joist: 'joist',
  rim: 'joist',
  rafter: 'rafter',
  collar_tie: 'rafter',
  ridge: 'rafter',
  purlin: 'purlin',
  blocking: 'other',
  strap: 'other',
  stair_stringer: 'other',
};

export const GROUP_LABELS: Record<RoleGroup, string> = {
  stud: 'Montantes',
  track: 'Guias',
  header: 'Vergas e peitoris',
  joist: 'Vigas do mezanino',
  rafter: 'Caibros e cumeeira',
  purlin: 'Terças',
  other: 'Travamentos e escada',
};

export const GROUP_COLORS: Record<RoleGroup, string> = {
  stud: '#3b82f6',
  track: '#14b8a6',
  header: '#a855f7',
  joist: '#22c55e',
  rafter: '#f43f5e',
  purlin: '#06b6d4',
  other: '#78716c',
};

export const GROUP_ORDER: RoleGroup[] = ['stud', 'track', 'header', 'joist', 'rafter', 'purlin', 'other'];

export const roleColor = (role: PieceRole) => GROUP_COLORS[ROLE_GROUP[role]];

/** Camada de explosão: estrutura de cobertura sobe junto com a cobertura. */
export type PieceLayer = 'structure' | 'roof';
export const pieceLayer = (role: PieceRole): PieceLayer =>
  ROLE_GROUP[role] === 'rafter' || ROLE_GROUP[role] === 'purlin' ? 'roof' : 'structure';

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/**
 * Escreve em `out[offset..offset+16]` a matriz da peça. X = eixo (escala = comprimento), Y = webNormal
 * ortogonalizado em relação ao eixo, Z = X x Y. Translação = ponto médio. Peças degeneradas ficam com escala 0.
 */
export function writePieceMatrix(piece: Pick<Piece, 'start' | 'end' | 'webNormal'>, out: ArrayLike<number> & { [i: number]: number }, offset = 0): void {
  const axis = sub(piece.end, piece.start);
  const length = len(axis);
  const x = length > 1e-9 ? unit(axis) : ([1, 0, 0] as Vec3);
  let y = piece.webNormal;
  const d = dot(y, x);
  y = [y[0] - x[0] * d, y[1] - x[1] * d, y[2] - x[2] * d];
  if (len(y) < 1e-6) {
    // webNormal paralela ao eixo (dado inválido): escolhe qualquer perpendicular estável
    y = Math.abs(x[2]) < 0.9 ? cross(x, [0, 0, 1]) : cross(x, [1, 0, 0]);
  }
  y = unit(y);
  const z = cross(x, y);
  const o = offset;
  out[o] = x[0] * length;
  out[o + 1] = x[1] * length;
  out[o + 2] = x[2] * length;
  out[o + 3] = 0;
  out[o + 4] = y[0];
  out[o + 5] = y[1];
  out[o + 6] = y[2];
  out[o + 7] = 0;
  out[o + 8] = z[0];
  out[o + 9] = z[1];
  out[o + 10] = z[2];
  out[o + 11] = 0;
  out[o + 12] = (piece.start[0] + piece.end[0]) / 2;
  out[o + 13] = (piece.start[1] + piece.end[1]) / 2;
  out[o + 14] = (piece.start[2] + piece.end[2]) / 2;
  out[o + 15] = 1;
}

export interface PieceBatch {
  key: string;
  profileId: string;
  layer: PieceLayer;
  /** IDs na mesma ordem das matrizes (instanceId -> pieceId). */
  ids: string[];
  roles: PieceRole[];
  hostIds: string[];
  /** 16 floats por instância. */
  matrices: Float32Array;
}

/** Agrupa as peças por (perfil, camada). Calculado uma vez por `results`. */
export function buildPieceBatches(pieces: Piece[]): PieceBatch[] {
  const groups = new Map<string, Piece[]>();
  for (const p of pieces) {
    const key = `${p.profileId}|${pieceLayer(p.role)}`;
    const g = groups.get(key);
    if (g) g.push(p);
    else groups.set(key, [p]);
  }
  const out: PieceBatch[] = [];
  for (const [key, list] of groups) {
    const matrices = new Float32Array(list.length * 16);
    list.forEach((p, i) => writePieceMatrix(p, matrices, i * 16));
    out.push({
      key,
      profileId: list[0]!.profileId,
      layer: pieceLayer(list[0]!.role),
      ids: list.map((p) => p.id),
      roles: list.map((p) => p.role),
      hostIds: list.map((p) => p.hostId),
      matrices,
    });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

export interface SectionDims {
  /** mm */
  web: number;
  flange: number;
  lip: number;
  thickness: number;
}

/**
 * Contorno da seção em C (ou retângulo para fitas, `flange` = 0) em (a, b) = (Z da mesa, Y da alma), metros,
 * centrado na alma. Sentido anti-horário.
 */
export function sectionOutline(d: SectionDims): [number, number][] {
  const h = d.web / 1000;
  const b = d.flange / 1000;
  const t = Math.min(d.thickness / 1000, h / 3);
  if (b <= t * 1.5) {
    // fita/chapa: retângulo (largura = alma, espessura t)
    return [[-t / 2, -h / 2], [t / 2, -h / 2], [t / 2, h / 2], [-t / 2, h / 2]];
  }
  const lip = Math.min(d.lip / 1000, h / 2 - t);
  const c = b / 2; // centraliza a seção em Z
  const pts: [number, number][] = [
    [0 - c, -h / 2],
    [b - c, -h / 2],
  ];
  if (lip > t) pts.push([b - c, -h / 2 + lip], [b - t - c, -h / 2 + lip]);
  pts.push([b - t - c, -h / 2 + t], [t - c, -h / 2 + t], [t - c, h / 2 - t], [b - t - c, h / 2 - t]);
  if (lip > t) pts.push([b - t - c, h / 2 - lip], [b - c, h / 2 - lip]);
  pts.push([b - c, h / 2], [0 - c, h / 2]);
  return pts;
}
