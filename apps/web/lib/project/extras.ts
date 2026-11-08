/**
 * Extras do projeto (varanda/deck, muro, cerca, muro de arrimo): criação com padrões coerentes, edição de
 * caminhos, duplicação e resumo. Funções puras que mutam um rascunho Immer.
 */
import { buildModel, Project as ProjectSchema, type Extra, type Project, type Vec2 } from '@chalecad/engine';
import { getCatalog } from '@chalecad/catalog';
import { clamp, planBounds, round } from './geometry';
import { newId, type IdGen } from './ids';

export type ExtraKind = Extra['kind'];
type Of<K extends ExtraKind> = Extract<Extra, { kind: K }>;

export const EXTRA_LABELS: Record<ExtraKind, string> = {
  deck: 'Varanda / deck',
  wall: 'Muro',
  fence: 'Cerca',
  retaining: 'Muro de arrimo',
  water_tower: "Torre da caixa d'água",
};

export const SIDE_LABELS = { front: 'Frente', back: 'Fundos', left: 'Esquerda', right: 'Direita' } as const;
export type Side = keyof typeof SIDE_LABELS;

export const FENCE_CLEARANCE = 3;

/** Comprimento total do caminho (fecha o último vértice no primeiro se `closed`). */
export function pathLength(path: Vec2[], closed: boolean): number {
  let n = 0;
  for (let i = 0; i + 1 < path.length; i++) n += Math.hypot(path[i + 1]![0] - path[i]![0], path[i + 1]![1] - path[i]![1]);
  if (closed && path.length > 2) n += Math.hypot(path[0]![0] - path[path.length - 1]![0], path[0]![1] - path[path.length - 1]![1]);
  return n;
}

/** Retângulo em volta da casa com folga `gap`, sentido anti-horário. */
export function perimeterPath(p: Project, gap = FENCE_CLEARANCE): Vec2[] {
  const b = planBounds(p.typology);
  return [
    [round(b.x0 - gap, 2), round(b.y0 - gap, 2)],
    [round(b.x1 + gap, 2), round(b.y0 - gap, 2)],
    [round(b.x1 + gap, 2), round(b.y1 + gap, 2)],
    [round(b.x0 - gap, 2), round(b.y1 + gap, 2)],
  ];
}

/** Lado da edificação mais próximo da subida do terreno (onde o corte pede arrimo). */
export function uphillSide(p: Project): Side {
  const s = p.site;
  const az = s.type === 'sloped' ? s.downhillAzimuthDeg : 180;
  const dx = Math.sin((az * Math.PI) / 180);
  const dy = Math.cos((az * Math.PI) / 180);
  // O terreno sobe no sentido oposto ao da descida.
  if (Math.abs(dy) >= Math.abs(dx)) return dy > 0 ? 'front' : 'back';
  return dx > 0 ? 'left' : 'right';
}

/** Caminho do arrimo: reta paralela à fachada do lado da subida, na borda do platô. */
export function retainingPath(p: Project, side: Side = uphillSide(p)): Vec2[] {
  const b = planBounds(p.typology);
  const m = p.site.type === 'sloped' ? p.site.platformMargin : { front: 3, back: 1.5, left: 1.5, right: 1.5 };
  switch (side) {
    case 'front':
      return [[round(b.x0 - m.left, 2), round(b.y0 - m.front, 2)], [round(b.x1 + m.right, 2), round(b.y0 - m.front, 2)]];
    case 'back':
      return [[round(b.x0 - m.left, 2), round(b.y1 + m.back, 2)], [round(b.x1 + m.right, 2), round(b.y1 + m.back, 2)]];
    case 'left':
      return [[round(b.x0 - m.left, 2), round(b.y0 - m.front, 2)], [round(b.x0 - m.left, 2), round(b.y1 + m.back, 2)]];
    case 'right':
      return [[round(b.x1 + m.right, 2), round(b.y0 - m.front, 2)], [round(b.x1 + m.right, 2), round(b.y1 + m.back, 2)]];
  }
}

/** Comprimento (m) da fachada principal de cada lado. */
export function sideLength(p: Project, side: Side): number {
  return side === 'front' || side === 'back' ? p.typology.width : p.typology.depth;
}

/** Altura do chuveiro mais alto + folga da caixa acima dele (m): a caixa precisa ficar ~1 m acima. */
export const TOWER_SHOWER_HEIGHT = 2.1;
export const TOWER_HEAD = 1.2;

/**
 * Onde pôr a torre da caixa d'água: sobre o banheiro do mezanino; senão sobre o do térreo; senão no centro da planta.
 * A cota do piso da caixa é o piso do banheiro + chuveiro (2,1 m) + 1,2 m de coluna d'água.
 */
export function towerSpot(p: Project): { position: Vec2; platformZ: number; roomId: string | null } {
  const baths = p.rooms.filter((r) => r.use === 'bathroom');
  const elevOf = (level: string) => p.levels.find((l) => l.id === level)?.elevation ?? 0;
  const pick = [...baths].sort((a, b) => elevOf(b.level) - elevOf(a.level))[0];
  if (pick) {
    let c: Vec2 = [pick.seed[0], pick.seed[1]];
    try {
      const room = buildModel(ProjectSchema.parse(JSON.parse(JSON.stringify(p))), getCatalog()).rooms.find((r) => r.id === pick.id);
      if (room?.polygon && room.polygon.length > 2) c = [room.polygon.reduce((s, v) => s + v[0], 0) / room.polygon.length, room.polygon.reduce((s, v) => s + v[1], 0) / room.polygon.length];
    } catch {
      // sem modelo: usa o ponto do cômodo
    }
    return { position: [round(c[0], 2), round(c[1], 2)], platformZ: round(clamp(elevOf(pick.level) + TOWER_SHOWER_HEIGHT + TOWER_HEAD, 2, 10), 2), roomId: pick.id };
  }
  const b = planBounds(p.typology);
  return { position: [round((b.x0 + b.x1) / 2, 2), round((b.y0 + b.y1) / 2, 2)], platformZ: 5, roomId: null };
}

/** Cria o extra com padrões coerentes com o projeto. Devolve o ID. */
export function addExtra(draft: Project, kind: ExtraKind, ids: IdGen = newId): string {
  const id = ids('x');
  switch (kind) {
    case 'deck': {
      const side: Side = 'front';
      const len = sideLength(draft, side);
      draft.extras.push({ id, kind, side, length: round(Math.min(len, 4), 2), offset: round(Math.max(0, (len - Math.min(len, 4)) / 2), 2), depth: 2, elevation: 0.3, covered: false, guardrail: true });
      break;
    }
    case 'wall':
      draft.extras.push({ id, kind, path: perimeterPath(draft), closed: true, height: 2, system: 'concrete_block', foundation: 'strip' });
      break;
    case 'fence':
      draft.extras.push({ id, kind, path: perimeterPath(draft), closed: true, height: 1.8, postType: 'concrete', postSpacing: 2.5, mesh: 'welded', baseWallHeight: 0.2 });
      break;
    case 'retaining':
      draft.extras.push({ id, kind, path: retainingPath(draft), height: 1.5, type: 'block', drainage: true });
      break;
    case 'water_tower': {
      const spot = towerSpot(draft);
      draft.extras.push({ id, kind, position: spot.position, width: 1.6, depth: 1.6, platformZ: spot.platformZ, roof: 'gable' });
      break;
    }
  }
  return id;
}

export const findExtra = (p: Project, id: string): Extra | undefined => p.extras.find((e) => e.id === id);

export function removeExtra(draft: Project, id: string): boolean {
  const n = draft.extras.length;
  draft.extras = draft.extras.filter((e) => e.id !== id);
  return draft.extras.length < n;
}

/** Duplica o extra com deslocamento (caminhos: 1 m; deck: ao lado, se couber). Devolve o novo ID. */
export function duplicateExtra(draft: Project, id: string, ids: IdGen = newId): string | null {
  const src = findExtra(draft, id);
  if (!src) return null;
  const copy = JSON.parse(JSON.stringify(src)) as Extra;
  copy.id = ids('x');
  if (copy.kind === 'deck') {
    const len = sideLength(draft, copy.side);
    copy.offset = round(clamp(copy.offset + (copy.length ?? len) + 0.2, 0, Math.max(0, len - 1)), 2);
  } else if (copy.kind === 'water_tower') {
    copy.position = [round(copy.position[0] + 1, 2), round(copy.position[1] + 1, 2)];
  } else {
    copy.path = copy.path.map(([x, y]) => [round(x + 1, 2), round(y + 1, 2)] as Vec2);
  }
  draft.extras.push(copy);
  return copy.id;
}

/** Altera campos do extra (a união discriminada é preservada por quem chama). */
export function patchExtra(draft: Project, id: string, patch: Record<string, unknown>): void {
  const e = draft.extras.find((x) => x.id === id) as Record<string, unknown> | undefined;
  if (!e) return;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete e[k];
    else e[k] = v;
  }
}

type PathExtra = Of<'fence'> | Of<'wall'> | Of<'retaining'>;
export const isPathExtra = (e: Extra): e is PathExtra => e.kind !== 'deck' && e.kind !== 'water_tower';

export function setVertex(draft: Project, id: string, index: number, v: Vec2): void {
  const e = draft.extras.find((x) => x.id === id);
  if (!e || !isPathExtra(e) || !e.path[index]) return;
  e.path[index] = [round(v[0], 3), round(v[1], 3)];
}

/** Insere um vértice depois de `index` (no ponto médio até o próximo; no fim, estende 1 m). */
export function addVertex(draft: Project, id: string, index: number): void {
  const e = draft.extras.find((x) => x.id === id);
  if (!e || !isPathExtra(e)) return;
  const a = e.path[index];
  if (!a) return;
  const closed = e.kind !== 'retaining' && e.closed;
  const next = e.path[index + 1] ?? (closed ? e.path[0] : undefined);
  const v: Vec2 = next ? [round((a[0] + next[0]) / 2, 3), round((a[1] + next[1]) / 2, 3)] : [round(a[0] + 1, 3), a[1]];
  e.path.splice(index + 1, 0, v);
}

/** Remove um vértice (mantém no mínimo 2). */
export function removeVertex(draft: Project, id: string, index: number): void {
  const e = draft.extras.find((x) => x.id === id);
  if (!e || !isPathExtra(e) || e.path.length <= 2) return;
  e.path.splice(index, 1);
}

export function resetPathToPerimeter(draft: Project, id: string): void {
  const e = draft.extras.find((x) => x.id === id);
  if (!e || !isPathExtra(e)) return;
  e.path = e.kind === 'retaining' ? retainingPath(draft) : perimeterPath(draft);
}

/** Resumo de uma linha ("Fechada · 42 m · 1,8 m de altura"). */
export function extraSummary(e: Extra): { title: string; detail: string } {
  const f = (n: number, d = 1) => String(round(n, d)).replace('.', ',');
  switch (e.kind) {
    case 'deck':
      return { title: EXTRA_LABELS.deck, detail: `${SIDE_LABELS[e.side]} · ${e.length ? `${f(e.length)} × ` : ''}${f(e.depth)} m${e.covered ? ' · coberto' : ''}` };
    case 'wall':
      return { title: EXTRA_LABELS.wall, detail: `${f(pathLength(e.path, e.closed), 0)} m · ${f(e.height)} m de altura` };
    case 'fence':
      return { title: EXTRA_LABELS.fence, detail: `${f(pathLength(e.path, e.closed), 0)} m · ${f(e.height)} m de altura` };
    case 'retaining':
      return { title: EXTRA_LABELS.retaining, detail: `${f(pathLength(e.path, false), 0)} m · ${f(e.height)} m de altura` };
    case 'water_tower':
      return { title: EXTRA_LABELS.water_tower, detail: `${f(e.width)} × ${f(e.depth)} m · caixa a ${f(e.platformZ)} m` };
  }
}

/** Nome numerado por tipo na ordem do projeto ("Cerca 2"). */
export function extraLabel(p: Project, id: string): string {
  const e = findExtra(p, id);
  if (!e) return id;
  const same = p.extras.filter((x) => x.kind === e.kind);
  return same.length > 1 ? `${EXTRA_LABELS[e.kind]} ${same.findIndex((x) => x.id === id) + 1}` : EXTRA_LABELS[e.kind];
}
