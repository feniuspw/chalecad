/**
 * Helpers de edição do projeto. Funções determinísticas, sem I/O, que mutam um rascunho Immer
 * (use dentro de `useEditor.getState().update(label, (d) => ...)`) e mantêm o projeto coerente:
 * mezanino acompanha largura/profundidade, aberturas continuam dentro das paredes, etc.
 */
import { current, isDraft } from 'immer';
import { getCatalog } from '@chalecad/catalog';
import { buildModel, type Level, type Opening, type Project, type Stair, type Typology, type TypologyKind, type Vec2 } from '@chalecad/engine';
import { clamp, hostLength, planBounds, round } from './geometry';
import { newId, type IdGen } from './ids';
import { annexInfo, fitAnnexes } from './annex';
import { reconcileRooms } from './rooms';

type T<K extends TypologyKind> = Extract<Typology, { kind: K }>;
type GableT = T<'gable_mezzanine'>;
type AFrameT = T<'a_frame'>;
type CombinedT = T<'combined'>;
/** Tipologias que aceitam mezanino no editor. */
export type EditableTypology = GableT | AFrameT;
/** Campos editáveis de qualquer tipologia (a ala de L/T aceita atualização parcial). */
export type TypologyPatch = Partial<Omit<GableT, 'kind'>> &
  Partial<Omit<AFrameT, 'kind'>> &
  Partial<Omit<T<'shed'>, 'kind'>> &
  Partial<Omit<T<'flat_roof'>, 'kind'>> &
  Partial<Omit<T<'gambrel'>, 'kind'>> &
  Partial<Omit<CombinedT, 'kind' | 'wing'>> & { wing?: Partial<CombinedT['wing']> };
/** Tipologias com mezanino (duas águas e A-frame). Mantém o nome histórico. */
export const isEditableTypology = (t: Typology): t is EditableTypology => t.kind === 'gable_mezzanine' || t.kind === 'a_frame';
export const supportsMezzanine = isEditableTypology;
/** O eixo da cumeeira só é escolhido nestas tipologias. */
export const hasRidgeAxis = (t: Typology) => t.kind === 'gable_mezzanine' || t.kind === 'gambrel';

export type MezzaninePosition = 'front' | 'back';

export interface ReconcileReport {
  removedOpenings: number;
  removedWalls: number;
  adjustedOpenings: number;
}

export const groundLevel = (p: Project): Level => p.levels.find((l) => l.elevation === 0) ?? p.levels[0]!;
export const upperLevel = (p: Project): Level | undefined => p.levels.find((l) => l.elevation > 0 && l.polygon);

/** Cota do mezanino: topo das paredes (duas águas) ou ~40% da cumeeira (A-frame). */
export function mezzanineElevation(t: EditableTypology): number {
  return t.kind === 'gable_mezzanine' ? t.wallHeight : round(clamp(t.ridgeHeight * 0.4, 2.1, 2.6), 1);
}

/** Meia-largura útil da edificação na cota z (A-frame: afunila até a cumeeira). */
function halfSpan(t: EditableTypology, z: number): number {
  if (t.kind === 'gable_mezzanine') return t.width / 2;
  const knee = t.kneeWallHeight;
  if (z <= knee) return t.width / 2;
  return Math.max(0.3, (t.width / 2) * (1 - (z - knee) / Math.max(0.1, t.ridgeHeight - knee)));
}

/** A-frame: faixa de cota do piso do mezanino (acima, ≥ 2 m livres no centro e ≥ 2 m de largura de piso). */
export function aFrameMezzRange(t: AFrameT): [number, number] {
  const k = t.kneeWallHeight;
  const byWidth = k + (t.ridgeHeight - k) * (1 - 1 / (t.width / 2));
  const max = Math.min(t.ridgeHeight - 2.0, byWidth);
  return [2.1, Math.max(2.1, round(max, 2))];
}

export function mezzaninePolygon(t: EditableTypology, depth: number, position: MezzaninePosition, elevation = mezzanineElevation(t)): Vec2[] {
  const hs = halfSpan(t, elevation);
  const x0 = round(t.width / 2 - hs, 3);
  const x1 = round(t.width / 2 + hs, 3);
  const y0 = position === 'back' ? round(t.depth - depth, 3) : 0;
  const y1 = position === 'back' ? t.depth : round(depth, 3);
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
}

export interface MezzanineInfo {
  level: Level;
  depth: number;
  position: MezzaninePosition;
}

export function getMezzanine(p: Project): MezzanineInfo | null {
  const level = upperLevel(p);
  if (!level?.polygon) return null;
  const ys = level.polygon.map((v) => v[1]);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { level, depth: round(maxY - minY, 3), position: minY < p.typology.depth - maxY ? 'front' : 'back' };
}

export const maxMezzanineDepth = (t: Typology) => Math.max(1.5, round(t.depth - 1, 1));
export const defaultMezzanineDepth = (t: Typology) => clamp(round(t.depth * 0.41, 1), 1.5, maxMezzanineDepth(t));

/** Reconstrói o polígono do mezanino a partir de profundidade e posição, mantendo-o dentro da edificação. */
export function setMezzanine(draft: Project, opts: { depth?: number; position?: MezzaninePosition; elevation?: number }): void {
  const t = draft.typology;
  const info = getMezzanine(draft);
  if (!isEditableTypology(t) || !info) return;
  const depth = clamp(opts.depth ?? info.depth, 1, maxMezzanineDepth(t));
  const position = opts.position ?? info.position;
  const lv = draft.levels.find((l) => l.id === info.level.id)!;
  // A-frame: a cota é escolhida pelo usuário dentro da faixa; duas águas: topo das paredes
  const elevation = t.kind === 'a_frame' ? round(clamp(opts.elevation ?? lv.elevation, ...aFrameMezzRange(t)), 3) : mezzanineElevation(t);
  lv.polygon = mezzaninePolygon(t, depth, position, elevation);
  lv.elevation = elevation;
}

function straightStairFor(t: EditableTypology, from: string, to: string, depth: number, position: MezzaninePosition, ids: IdGen, rise = mezzanineElevation(t)): Stair {
  const run = stairRun(rise);
  const width = 0.8;
  if (t.kind === 'a_frame') {
    // Sob a cumeeira, subindo em direção à borda do mezanino.
    if (position === 'back') {
      const y = Math.max(0.6, t.depth - depth - run);
      return { id: ids('s'), type: 'straight', from, to, position: [round(t.width / 2 - width / 2, 2), round(y, 2)], rotationDeg: 0, width, turnRight: true };
    }
    // girada 180°: o canto esquerdo do pé fica à direita em planta
    const y = Math.min(t.depth - 0.3, depth + run);
    return { id: ids('s'), type: 'straight', from, to, position: [round(t.width / 2 + width / 2, 2), round(y, 2)], rotationDeg: 180, width, turnRight: true };
  }
  return { id: ids('s'), type: 'straight', from, to, position: [0.2, 0.6], rotationDeg: 0, width, turnRight: true };
}

export function setMezzanineEnabled(draft: Project, on: boolean, ids: IdGen = newId): void {
  const t = draft.typology;
  if (!isEditableTypology(t)) return;
  const existing = upperLevel(draft);
  if (on && !existing) {
    const depth = defaultMezzanineDepth(t);
    const lvId = 'L1';
    draft.levels.push({
      id: lvId,
      name: 'Mezanino',
      elevation: mezzanineElevation(t),
      polygon: mezzaninePolygon(t, depth, 'back'),
      deck: 'osb18',
      guardrail: true,
    });
    const ground = groundLevel(draft);
    draft.stairs.push(straightStairFor(t, ground.id, lvId, depth, 'back', ids));
  } else if (!on && existing) {
    removeUpperLevels(draft);
  }
}

/** Comprimento em planta de uma escada reta que vence `rise`, com o mesmo piso que o motor calcula. */
export function stairRun(rise: number): number {
  const st = getCatalog().constants.stairs;
  const n = Math.max(1, Math.ceil(rise / st.idealRiser - 1e-9));
  const going = clamp((st.blondelMin + st.blondelMax) / 2 - (2 * rise) / n, st.goingMin, st.goingMax);
  return (n - 1) * going;
}

/** Altura livre mínima sobre a escada no A-frame. */
const STAIR_HEADROOM = 2.1;

/**
 * A-frame: escada que sai da faixa com pé-direito (herdada de outra tipologia, ou depois de estreitar o chalé)
 * volta para baixo da cumeeira, subindo em direção à borda do mezanino.
 */
function fitAFrameStairs(draft: Project, t: AFrameT): void {
  const m = getMezzanine(draft);
  if (!m) return;
  const half = halfSpan(t, STAIR_HEADROOM);
  const [x0, x1] = [t.width / 2 - half - 1e-6, t.width / 2 + half + 1e-6];
  const rise = m.level.elevation;
  const run = stairRun(rise);
  draft.stairs = draft.stairs.map((s) => {
    if (s.type !== 'straight' && s.type !== 'ladder') return s;
    const r = (s.rotationDeg * Math.PI) / 180;
    const fwd: Vec2 = [Math.sin(r), Math.cos(r)];
    const right: Vec2 = [Math.cos(r), -Math.sin(r)];
    const w = s.type === 'ladder' ? 0.5 : s.width;
    const len = s.type === 'ladder' ? 0 : run;
    const [px, py] = s.position;
    const corners: Vec2[] = [
      [px, py],
      [px + right[0] * w, py + right[1] * w],
      [px + fwd[0] * len, py + fwd[1] * len],
      [px + right[0] * w + fwd[0] * len, py + right[1] * w + fwd[1] * len],
    ];
    if (corners.every(([x]) => x >= x0 && x <= x1)) return s;
    const placed = straightStairFor(t, s.from, s.to, m.depth, m.position, () => s.id, rise);
    return { ...placed, type: s.type, width: s.width, turnRight: s.turnRight };
  });
}

/** Remove níveis superiores e tudo que depende deles (paredes, aberturas, escadas). */
export function removeUpperLevels(draft: Project): void {
  const gone = new Set(draft.levels.filter((l) => l.elevation > 0).map((l) => l.id));
  if (gone.size === 0) return;
  draft.levels = draft.levels.filter((l) => !gone.has(l.id));
  const removedWalls = new Set(draft.walls.filter((w) => gone.has(w.level)).map((w) => w.id));
  draft.walls = draft.walls.filter((w) => !removedWalls.has(w.id));
  draft.openings = draft.openings.filter((o) => !removedWalls.has(o.host));
  draft.stairs = draft.stairs.filter((s) => !gone.has(s.from) && !gone.has(s.to));
}

// ---------------------------------------------------------------------------
// Coerência geral
// ---------------------------------------------------------------------------

function clampPoint(p: Vec2, b: { x0: number; y0: number; x1: number; y1: number }): Vec2 {
  return [round(clamp(p[0], b.x0, b.x1), 3), round(clamp(p[1], b.y0, b.y1), 3)];
}

/** Altura máxima segura das paredes externas (para limitar aberturas). null = sem limite conhecido. */
function exteriorWallHeight(t: Typology): number | null {
  switch (t.kind) {
    case 'gable_mezzanine':
    case 'flat_roof':
    case 'gambrel':
    case 'combined':
      return t.wallHeight;
    case 'shed':
      return Math.min(t.lowHeight, t.highHeight);
    default:
      return null;
  }
}

/** Abertura dentro do hospedeiro: reduz largura/altura e desloca; remove se não couber (< 30 cm). */
export function fitOpening(project: Project, o: Opening): Opening | null {
  const len = hostLength(project, o.host);
  if (len === null) return null;
  if (o.type === 'skylight') return o;
  if (len < 0.3) return null;
  let { offset, width, height, sill } = o;
  width = clamp(width, 0.3, Math.min(6, len));
  offset = clamp(offset, 0, Math.max(0, len - width));
  const t = project.typology;
  const annex = t.kind === 'a_frame' && o.host.startsWith('annex-') ? t.annexes.find((a) => o.host.startsWith(`annex-${a.side}-`)) : undefined;
  const wallH = annex && t.kind === 'a_frame'
    ? annexInfo(t, annex).lowHeight
    : o.host.startsWith('ext-') || o.host.startsWith('wing-') ? exteriorWallHeight(t) : null;
  if (wallH !== null) {
    const maxTop = wallH - 0.1;
    sill = clamp(sill, 0, Math.max(0, maxTop - 0.3));
    height = clamp(height, 0.3, Math.max(0.3, maxTop - sill));
  }
  return { ...o, offset: round(offset, 3), width: round(width, 3), height: round(height, 3), sill: round(sill, 3) };
}

/** Ajusta todas as aberturas. Devolve quantas mudaram e quantas foram removidas. */
export function fitOpenings(draft: Project): { adjusted: number; removed: number } {
  let adjusted = 0;
  let removed = 0;
  const next: Opening[] = [];
  for (const o of draft.openings) {
    const f = fitOpening(draft, o);
    if (!f) {
      removed++;
      continue;
    }
    if (f.offset !== o.offset || f.width !== o.width || f.height !== o.height || f.sill !== o.sill) adjusted++;
    next.push(f);
  }
  draft.openings = next;
  return { adjusted, removed };
}

/** Faz a ala de L/T caber no volume principal (largura da ala ≤ profundidade, offset + largura ≤ largura). */
export function fitWing(t: CombinedT): void {
  const w = t.wing;
  w.width = round(clamp(w.width, 2, Math.max(2, Math.min(20, t.width, t.depth))), 3);
  w.depth = round(clamp(w.depth, 2, 20), 3);
  const maxOff = Math.max(0, t.width - w.width);
  w.offset = round(t.shape === 'T' ? maxOff / 2 : clamp(w.offset, 0, maxOff), 3);
}

/** IDs de hospedeiros gerados que existem para a tipologia (paredes externas e águas). */
export function generatedHosts(p: Project): { walls: Set<string>; roofs: Set<string> } {
  const t = p.typology;
  const std = ['ext-front', 'ext-back', 'ext-left', 'ext-right'];
  switch (t.kind) {
    case 'a_frame': {
      const walls = new Set(['ext-front', 'ext-back']);
      if (t.kneeWallHeight > 0) for (const id of ['ext-left', 'ext-right', 'ext-left-2', 'ext-right-2']) walls.add(id);
      const roofs = new Set(['roof-a', 'roof-b']);
      for (const a of t.annexes) {
        for (const s of ['front', 'side', 'back']) walls.add(`annex-${a.side}-${s}`);
        roofs.add(`annex-${a.side}-roof`);
      }
      return { walls, roofs };
    }
    case 'gambrel':
      return { walls: new Set(std), roofs: new Set(['roof-a', 'roof-b', 'roof-a2', 'roof-b2']) };
    case 'shed':
    case 'flat_roof':
      return { walls: new Set(std), roofs: new Set(['roof-a']) };
    case 'combined':
      return {
        walls: new Set(['ext-front', 'ext-left', 'ext-right', 'ext-back', 'ext-back-2', 'wing-back', 'wing-left', 'wing-right']),
        roofs: new Set(['roof-a', 'roof-b', 'wing-roof-a', 'wing-roof-b']),
      };
    default:
      return { walls: new Set(std), roofs: new Set(['roof-a', 'roof-b']) };
  }
}

/**
 * Chame depois de mudar dimensões ou tipologia: mezanino acompanha a edificação (ou some, nas tipologias sem
 * mezanino), paredes internas, pontos de utilidade e escadas ficam dentro do contorno e as aberturas voltam a caber.
 */
export function reconcileProject(draft: Project): ReconcileReport {
  const t = draft.typology;
  let removedWalls = 0;
  if (t.kind === 'combined') fitWing(t);
  if (t.kind === 'a_frame') fitAnnexes(t);
  if (isEditableTypology(t)) {
    if (getMezzanine(draft)) setMezzanine(draft, {});
  } else {
    const before = draft.walls.length;
    removeUpperLevels(draft);
    removedWalls += before - draft.walls.length;
  }
  const b = planBounds(t);
  const goneWalls = new Set<string>();
  for (const wall of draft.walls) {
    wall.from = clampPoint(wall.from, b);
    wall.to = clampPoint(wall.to, b);
    if (Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1]) < 0.1) goneWalls.add(wall.id);
  }
  if (goneWalls.size) {
    draft.walls = draft.walls.filter((x) => !goneWalls.has(x.id));
    draft.openings = draft.openings.filter((o) => !goneWalls.has(o.host));
    removedWalls += goneWalls.size;
  }
  for (const u of draft.utilities) u.position = clampPoint(u.position, b);
  for (const s of draft.stairs) s.position = clampPoint(s.position, b);
  reconcileRooms(draft);
  if (t.kind === 'a_frame') fitAFrameStairs(draft, t);
  // Hospedeiros que não existem na tipologia ativa.
  const hosts = generatedHosts(draft);
  const roofOpenings = t.kind === 'a_frame' || t.kind === 'gambrel';
  draft.openings = draft.openings.filter((o) => {
    if (o.host.startsWith('roof-') || o.host.startsWith('wing-roof-') || /^annex-.*-roof$/.test(o.host)) {
      return hosts.roofs.has(o.host) && (o.type === 'skylight' || (roofOpenings && o.host.startsWith('roof-')));
    }
    if (o.host.startsWith('ext-') || o.host.startsWith('wing-') || o.host.startsWith('annex-')) return hosts.walls.has(o.host);
    return true;
  });
  const f = fitOpenings(draft);
  return { removedOpenings: f.removed, removedWalls, adjustedOpenings: f.adjusted };
}

/** Altera dimensões/parâmetros da tipologia ativa e reconcilia o projeto. */
export function patchTypology(draft: Project, patch: TypologyPatch): ReconcileReport {
  const t = draft.typology;
  const { wing, ...rest } = patch;
  Object.assign(t, rest);
  if (wing && t.kind === 'combined') Object.assign(t.wing, wing);
  if (t.kind === 'shed') {
    if (patch.lowHeight !== undefined && t.highHeight < t.lowHeight) t.highHeight = Math.min(9, t.lowHeight);
    else if (patch.highHeight !== undefined && t.highHeight < t.lowHeight) t.lowHeight = Math.max(2.2, t.highHeight);
  }
  if (!hasRidgeAxis(t)) draft.roof.ridgeAxis = 'depth';
  return reconcileProject(draft);
}

/** Valores padrão de uma tipologia, mantendo largura/profundidade (e pé-direito/inclinação quando comparáveis). */
export function defaultTypology(kind: TypologyKind, prev: Pick<Typology, 'width' | 'depth'> & Partial<Record<string, unknown>>): Typology {
  const { width, depth } = prev;
  const wall = typeof prev.wallHeight === 'number' ? prev.wallHeight : 2.8;
  const pitch = typeof prev.roofPitchDeg === 'number' ? prev.roofPitchDeg : 35;
  switch (kind) {
    case 'gable_mezzanine':
      return { kind, width, depth, wallHeight: wall, roofPitchDeg: pitch, eave: 0.6, rake: 0.3 };
    case 'a_frame':
      return { kind, width, depth, ridgeHeight: 6, kneeWallHeight: 0, rake: 0.4, frontGable: 'glazed', backGable: 'closed', annexes: [] };
    case 'shed':
      return { kind, width, depth, lowHeight: Math.min(wall, 3), highHeight: round(Math.min(9, Math.min(wall, 3) + 1.2), 2), highSide: 'front', eave: 0.5 };
    case 'flat_roof':
      return { kind, width, depth, wallHeight: wall, parapetHeight: 0.6, slopePct: 5 };
    case 'gambrel':
      return { kind, width, depth, wallHeight: wall, lowerPitchDeg: 60, upperPitchDeg: 25, breakRatio: 0.4, eave: 0.4, rake: 0.3 };
    case 'combined': {
      const ww = round(clamp(width * 0.5, 2, Math.max(2, Math.min(20, width, depth))), 2);
      const wing = { width: ww, depth: round(clamp(depth * 0.6, 2, 20), 2), offset: 0 };
      return { kind, shape: 'L', width, depth, wallHeight: wall, roofPitchDeg: Math.min(60, Math.max(5, pitch)), eave: 0.5, rake: 0.3, wing };
    }
  }
}

/** Troca a tipologia mantendo largura, profundidade e aberturas que continuam válidas. Mezanino só em duas águas e A-frame. */
export function switchTypology(draft: Project, kind: TypologyKind, ids: IdGen = newId): ReconcileReport {
  const t = draft.typology;
  if (t.kind === kind) return { removedOpenings: 0, removedWalls: 0, adjustedOpenings: 0 };
  draft.typology = defaultTypology(kind, t as unknown as Pick<Typology, 'width' | 'depth'> & Partial<Record<string, unknown>>);
  if (!hasRidgeAxis(draft.typology)) draft.roof.ridgeAxis = 'depth';
  const rep = reconcileProject(draft);
  rep.removedOpenings += pruneInvalidOpenings(draft);
  if (kind === 'combined' && !draft.openings.some((o) => o.host.startsWith('wing-'))) addWingWindow(draft, ids);
  return rep;
}

/** Remove aberturas que o modelo considera fora do hospedeiro (ex.: janela que não cabe na empena triangular). */
export function pruneInvalidOpenings(draft: Project): number {
  let invalid: Set<string>;
  try {
    const plain = isDraft(draft) ? current(draft) : draft;
    invalid = new Set(buildModel(plain, getCatalog()).openings.filter((o) => !o.valid).map((o) => o.id));
  } catch {
    return 0;
  }
  if (invalid.size === 0) return 0;
  draft.openings = draft.openings.filter((o) => !invalid.has(o.id));
  return invalid.size;
}

/** Janela centralizada no fundo da ala de L/T. */
export function addWingWindow(draft: Project, ids: IdGen = newId): void {
  const t = draft.typology;
  if (t.kind !== 'combined') return;
  const width = round(Math.min(1.2, t.wing.width - 0.8), 2);
  if (width < 0.5) return;
  draft.openings.push({ id: ids('o'), host: 'wing-back', type: 'window', offset: round((t.wing.width - width) / 2, 2), width, height: 1.2, sill: 0.9 });
  fitOpenings(draft);
}

// ---------------------------------------------------------------------------
// Aberturas
// ---------------------------------------------------------------------------

/** Cria uma abertura no meio do hospedeiro, sem sobrepor outras quando possível. */
export function addOpeningAtCenter(draft: Project, host: string, type: 'door' | 'window', ids: IdGen = newId): string | null {
  const len = hostLength(draft, host);
  if (len === null || len < 0.5) return null;
  const width = Math.min(type === 'door' ? 0.9 : 1.2, len - 0.1);
  const height = type === 'door' ? 2.1 : 1.0;
  const sill = type === 'door' ? 0 : 1.0;
  const taken = draft.openings.filter((o) => o.host === host).map((o) => [o.offset, o.offset + o.width] as const);
  const free = (off: number) => taken.every(([a, b]) => off + width <= a - 0.05 || off >= b + 0.05);
  let offset = round((len - width) / 2, 2);
  if (!free(offset)) {
    // Procura o espaço livre mais próximo do centro, em passos de 10 cm.
    for (let k = 1; k <= Math.ceil(len / 0.1); k++) {
      const a = round(offset + k * 0.1, 2);
      const b = round(offset - k * 0.1, 2);
      if (a + width <= len && free(a)) {
        offset = a;
        break;
      }
      if (b >= 0 && free(b)) {
        offset = b;
        break;
      }
    }
  }
  const id = ids('o');
  const fit = fitOpening(draft, { id, host, type, offset, width, height, sill });
  if (!fit) return null;
  draft.openings.push(fit);
  return id;
}

export function removeOpening(draft: Project, id: string): boolean {
  const n = draft.openings.length;
  draft.openings = draft.openings.filter((o) => o.id !== id);
  return draft.openings.length < n;
}

export function removeWall(draft: Project, id: string): boolean {
  const n = draft.walls.length;
  draft.walls = draft.walls.filter((w) => w.id !== id);
  draft.openings = draft.openings.filter((o) => o.host !== id);
  return draft.walls.length < n;
}

export function removeStair(draft: Project, id: string): boolean {
  const n = draft.stairs.length;
  draft.stairs = draft.stairs.filter((s) => s.id !== id);
  return draft.stairs.length < n;
}

/** Comprimento da parede interna; ao mudar, mantém `from` e move `to` na mesma direção e reajusta aberturas. */
export function setWallLength(draft: Project, id: string, length: number): void {
  const w = draft.walls.find((x) => x.id === id);
  if (!w) return;
  const dx = w.to[0] - w.from[0];
  const dy = w.to[1] - w.from[1];
  const cur = Math.hypot(dx, dy);
  if (cur < 1e-6) return;
  const k = length / cur;
  w.to = [round(w.from[0] + dx * k, 3), round(w.from[1] + dy * k, 3)];
  fitOpenings(draft);
}

/** Altera uma abertura mantendo-a dentro do hospedeiro (largura/posição/altura são ajustadas). */
export function patchOpening(draft: Project, id: string, patch: Partial<Omit<Opening, 'id'>>): void {
  const i = draft.openings.findIndex((o) => o.id === id);
  if (i < 0) return;
  const merged = { ...draft.openings[i]!, ...patch };
  const fit = fitOpening(draft, merged);
  if (fit) draft.openings[i] = fit;
}

/** Troca o tipo da abertura aplicando medidas coerentes (porta sem peitoril e ≥ 2,10 m; janela com peitoril). */
export function setOpeningType(draft: Project, id: string, type: Opening['type']): void {
  const o = draft.openings.find((x) => x.id === id);
  if (!o) return;
  if (type === 'door' || type === 'sliding_door') {
    patchOpening(draft, id, { type, sill: 0, height: Math.max(o.height, 2.1), width: Math.max(o.width, type === 'sliding_door' ? 1.6 : 0.8) });
  } else if (type === 'window') {
    patchOpening(draft, id, { type, sill: o.sill > 0 ? o.sill : 1.0, height: Math.min(o.height, 1.4) });
  } else {
    patchOpening(draft, id, { type });
  }
}

/** Aberturas do mesmo hospedeiro que se sobrepõem à dada (para avisar o usuário). */
export function overlappingOpenings(p: Project, id: string): Opening[] {
  const o = p.openings.find((x) => x.id === id);
  if (!o) return [];
  return p.openings.filter((x) => x.id !== id && x.host === o.host && x.offset < o.offset + o.width - 1e-6 && o.offset < x.offset + x.width - 1e-6);
}
