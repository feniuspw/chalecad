/**
 * Helpers de edição do projeto. Funções determinísticas, sem I/O, que mutam um rascunho Immer
 * (use dentro de `useEditor.getState().update(label, (d) => ...)`) e mantêm o projeto coerente:
 * mezanino acompanha largura/profundidade, aberturas continuam dentro das paredes, etc.
 */
import type { Level, Opening, Project, Stair, Typology, Vec2 } from '@chalecad/engine';
import { clamp, hostLength, round } from './geometry';
import { newId, type IdGen } from './ids';

export type EditableTypology = Extract<Typology, { kind: 'gable_mezzanine' | 'a_frame' }>;
type GableT = Extract<Typology, { kind: 'gable_mezzanine' }>;
type AFrameT = Extract<Typology, { kind: 'a_frame' }>;
/** Campos editáveis de qualquer uma das tipologias suportadas. */
export type TypologyPatch = Partial<Omit<GableT, 'kind'>> & Partial<Omit<AFrameT, 'kind'>>;
export const isEditableTypology = (t: Typology): t is EditableTypology => t.kind === 'gable_mezzanine' || t.kind === 'a_frame';

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

export function mezzaninePolygon(t: EditableTypology, depth: number, position: MezzaninePosition): Vec2[] {
  const hs = halfSpan(t, mezzanineElevation(t));
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
export function setMezzanine(draft: Project, opts: { depth?: number; position?: MezzaninePosition }): void {
  const t = draft.typology;
  const info = getMezzanine(draft);
  if (!isEditableTypology(t) || !info) return;
  const depth = clamp(opts.depth ?? info.depth, 1, maxMezzanineDepth(t));
  const position = opts.position ?? info.position;
  const lv = draft.levels.find((l) => l.id === info.level.id)!;
  lv.polygon = mezzaninePolygon(t, depth, position);
  lv.elevation = mezzanineElevation(t);
}

function straightStairFor(t: EditableTypology, from: string, to: string, depth: number, position: MezzaninePosition, ids: IdGen): Stair {
  const rise = mezzanineElevation(t);
  const run = Math.ceil(rise / 0.18) * 0.27;
  const width = 0.8;
  if (t.kind === 'a_frame') {
    // Sob a cumeeira, sobe em direção ao mezanino do fundo.
    const y = position === 'back' ? Math.max(0.6, t.depth - depth - run) : 0.6;
    return { id: ids('s'), type: 'straight', from, to, position: [round(t.width / 2 - width / 2, 2), round(y, 2)], rotationDeg: 0, width, turnRight: true };
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
    const gone = new Set(draft.levels.filter((l) => l.elevation > 0).map((l) => l.id));
    draft.levels = draft.levels.filter((l) => !gone.has(l.id));
    const removedWalls = new Set(draft.walls.filter((w) => gone.has(w.level)).map((w) => w.id));
    draft.walls = draft.walls.filter((w) => !removedWalls.has(w.id));
    draft.openings = draft.openings.filter((o) => !removedWalls.has(o.host));
    draft.stairs = draft.stairs.filter((s) => !gone.has(s.from) && !gone.has(s.to));
  }
}

// ---------------------------------------------------------------------------
// Coerência geral
// ---------------------------------------------------------------------------

function clampPoint(p: Vec2, w: number, d: number): Vec2 {
  return [round(clamp(p[0], 0, w), 3), round(clamp(p[1], 0, d), 3)];
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
  if (t.kind === 'gable_mezzanine' && o.host.startsWith('ext-')) {
    const maxTop = t.wallHeight - 0.1;
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

/**
 * Chame depois de mudar dimensões ou tipologia: mezanino acompanha a edificação, paredes internas,
 * pontos de utilidade e escadas ficam dentro do contorno e as aberturas voltam a caber nas paredes.
 */
export function reconcileProject(draft: Project): ReconcileReport {
  const t = draft.typology;
  let removedWalls = 0;
  if (isEditableTypology(t)) {
    if (getMezzanine(draft)) setMezzanine(draft, {});
    const w = t.width;
    const d = t.depth;
    const goneWalls = new Set<string>();
    for (const wall of draft.walls) {
      wall.from = clampPoint(wall.from, w, d);
      wall.to = clampPoint(wall.to, w, d);
      if (Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1]) < 0.1) goneWalls.add(wall.id);
    }
    if (goneWalls.size) {
      draft.walls = draft.walls.filter((x) => !goneWalls.has(x.id));
      draft.openings = draft.openings.filter((o) => !goneWalls.has(o.host));
      removedWalls = goneWalls.size;
    }
    for (const u of draft.utilities) u.position = clampPoint(u.position, w, d);
    for (const s of draft.stairs) s.position = clampPoint(s.position, w, d);
    // Hospedeiros que não existem na tipologia ativa.
    const sideHosts = new Set(['ext-left', 'ext-right']);
    draft.openings = draft.openings.filter((o) =>
      t.kind === 'a_frame' ? !sideHosts.has(o.host) : !o.host.startsWith('roof-') || o.type === 'skylight',
    );
  }
  const f = fitOpenings(draft);
  return { removedOpenings: f.removed, removedWalls, adjustedOpenings: f.adjusted };
}

/** Altera dimensões/parâmetros da tipologia ativa e reconcilia o projeto. */
export function patchTypology(draft: Project, patch: TypologyPatch): ReconcileReport {
  Object.assign(draft.typology, patch);
  if (draft.typology.kind === 'a_frame') draft.roof.ridgeAxis = 'depth';
  return reconcileProject(draft);
}

/** Troca a tipologia mantendo largura, profundidade e mezanino. */
export function switchTypology(draft: Project, kind: 'gable_mezzanine' | 'a_frame'): ReconcileReport {
  const t = draft.typology;
  if (t.kind === kind) return { removedOpenings: 0, removedWalls: 0, adjustedOpenings: 0 };
  const base = { width: t.width, depth: t.depth };
  if (kind === 'a_frame') {
    draft.typology = { kind, ...base, ridgeHeight: 6, kneeWallHeight: 0, rake: 0.4, frontGable: 'glazed', backGable: 'closed' };
    draft.roof.ridgeAxis = 'depth';
  } else {
    draft.typology = { kind, ...base, wallHeight: 2.8, roofPitchDeg: 35, eave: 0.6, rake: 0.3 };
  }
  return reconcileProject(draft);
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
