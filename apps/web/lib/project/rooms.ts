/**
 * Cômodos e acabamentos: edição pura do projeto (mutam um rascunho Immer, dentro de `update(...)`).
 * O cômodo só guarda um ponto (`seed`); o motor acha o contorno pelas paredes em volta.
 */
import type { ComponentType } from 'react';
import { Archive, Bath, BedDouble, ChefHat, Footprints, Sofa, Square, WashingMachine } from 'lucide-react';
import { findPriceItem, getCatalog, getPriceBook, type Catalog } from '@chalecad/catalog';
import type { Finishes, Project, Room, RoomUse, Vec2 } from '@chalecad/engine';
import { pointInPolygon } from '../tools/geom';
import { clamp, planBounds, round } from './geometry';
import { newId, type IdGen } from './ids';

export interface RoomUseInfo {
  label: string;
  icon: ComponentType<{ className?: string }>;
}

export const ROOM_USES: Record<RoomUse, RoomUseInfo> = {
  living: { label: 'Sala', icon: Sofa },
  kitchen: { label: 'Cozinha', icon: ChefHat },
  bedroom: { label: 'Quarto', icon: BedDouble },
  bathroom: { label: 'Banheiro', icon: Bath },
  laundry: { label: 'Lavanderia', icon: WashingMachine },
  circulation: { label: 'Circulação', icon: Footprints },
  storage: { label: 'Depósito', icon: Archive },
  other: { label: 'Outro', icon: Square },
};

/** Ordem de exibição nos menus. */
export const ROOM_USE_ORDER: RoomUse[] = ['living', 'kitchen', 'bedroom', 'bathroom', 'laundry', 'circulation', 'storage', 'other'];

/** Acabamento sugerido ao criar o cômodo (o usuário troca depois). */
export function suggestedFinish(use: RoomUse): { floor?: string; walls?: string } {
  switch (use) {
    case 'bathroom':
      return { floor: 'finish_floor_ceramic', walls: 'finish_wall_tile' };
    case 'kitchen':
    case 'living':
      return { floor: 'finish_floor_porcelain', walls: 'finish_wall_paint' };
    case 'bedroom':
      return { floor: 'finish_floor_vinyl', walls: 'finish_wall_paint' };
    default:
      return {};
  }
}

/** Nome mostrado: o do usuário ou o do uso (com número quando há mais de um do mesmo uso no nível). */
export function roomDisplayName(project: Pick<Project, 'rooms'>, room: Room): string {
  if (room.name?.trim()) return room.name.trim();
  const base = ROOM_USES[room.use].label;
  const same = project.rooms.filter((r) => r.level === room.level && r.use === room.use);
  return same.length > 1 ? `${base} ${same.findIndex((r) => r.id === room.id) + 1}` : base;
}

/** Cria um cômodo com o acabamento sugerido. Devolve o ID. */
export function addRoom(draft: Project, level: string, seed: Vec2, use: RoomUse, ids: IdGen = newId): string {
  const id = ids('r');
  const room: Room = { id, level, use, seed: [round(seed[0], 3), round(seed[1], 3)], ...suggestedFinish(use) };
  draft.rooms.push(room);
  return id;
}

export function removeRoom(draft: Project, id: string): boolean {
  const n = draft.rooms.length;
  draft.rooms = draft.rooms.filter((r) => r.id !== id);
  return draft.rooms.length < n;
}

export interface RoomPatch {
  use?: RoomUse;
  name?: string | undefined;
  floor?: string | undefined;
  walls?: string | undefined;
}

/** Edita um cômodo. Chave presente com `undefined` (ou nome vazio) limpa o campo. */
export function patchRoom(draft: Project, id: string, patch: RoomPatch): boolean {
  const r = draft.rooms.find((x) => x.id === id);
  if (!r) return false;
  if (patch.use !== undefined) r.use = patch.use;
  if ('name' in patch) {
    const n = patch.name?.trim();
    if (n) r.name = n.slice(0, 40);
    else delete r.name;
  }
  if ('floor' in patch) {
    if (patch.floor) r.floor = patch.floor;
    else delete r.floor;
  }
  if ('walls' in patch) {
    if (patch.walls) r.walls = patch.walls;
    else delete r.walls;
  }
  return true;
}

/** Acabamento geral (fachada, forro das águas, cor da telha). `undefined` limpa. */
export function setFinish<K extends keyof Finishes>(draft: Project, key: K, value: Finishes[K] | undefined): void {
  if (value === undefined) delete draft.finishes[key];
  else draft.finishes[key] = value;
}

/**
 * Mantém os cômodos coerentes depois de mudar dimensões ou tipologia: o `seed` fica dentro de `planBounds`
 * e o cômodo some se o nível não existe mais. Devolve quantos foram removidos.
 */
export function reconcileRooms(draft: Project): number {
  const b = planBounds(draft.typology);
  const levels = new Set(draft.levels.map((l) => l.id));
  const before = draft.rooms.length;
  draft.rooms = draft.rooms.filter((r) => levels.has(r.level));
  for (const r of draft.rooms) r.seed = [round(clamp(r.seed[0], b.x0, b.x1), 3), round(clamp(r.seed[1], b.y0, b.y1), 3)];
  return before - draft.rooms.length;
}

// ---------------------------------------------------------------------------
// Catálogo de acabamentos
// ---------------------------------------------------------------------------

export type FinishPrefix = 'finish_floor_' | 'finish_wall_' | 'finish_facade_' | 'finish_ceiling_';

export interface FinishOption {
  id: string;
  name: string;
  /** R$/m² (com preço editado no projeto, se houver); null sem preço na base. */
  price: number | null;
}

/** Preço de um material do catálogo por unidade de compra (m²), respeitando os preços editados no projeto. */
export function finishPrice(project: Pick<Project, 'priceBookId' | 'priceOverrides'>, id: string, catalog: Catalog = getCatalog()): number | null {
  const itemId = catalog.materials.find((m) => m.id === id)?.priceItemId;
  if (!itemId) return null;
  const o = project.priceOverrides[itemId];
  if (o) return o.price;
  try {
    return findPriceItem(getPriceBook(catalog, project.priceBookId), itemId)?.price ?? null;
  } catch {
    return null;
  }
}

export function finishOptions(project: Pick<Project, 'priceBookId' | 'priceOverrides'>, prefix: FinishPrefix, catalog: Catalog = getCatalog()): FinishOption[] {
  return catalog.materials
    .filter((m) => m.id.startsWith(prefix))
    .map((m) => ({ id: m.id, name: m.name, price: finishPrice(project, m.id, catalog) }));
}

export function finishName(id: string | undefined, catalog: Catalog = getCatalog()): string {
  if (!id) return '—';
  return catalog.materials.find((m) => m.id === id)?.name ?? id;
}

export const ROOF_COLORS: { id: NonNullable<Finishes['roofColor']>; label: string; hex: string }[] = [
  { id: 'graphite', label: 'Grafite', hex: '#3b3f45' },
  { id: 'black', label: 'Preto', hex: '#1c1c1e' },
  { id: 'terracotta', label: 'Terracota', hex: '#b5543a' },
  { id: 'white', label: 'Branco', hex: '#e7e5e4' },
  { id: 'green', label: 'Verde', hex: '#4d6b57' },
];

/** Cômodo resolvido (com contorno) do nível que contém o ponto, se houver. */
export function roomAtPoint<R extends { level: string; polygon: Vec2[] | null }>(rooms: R[], level: string, p: Vec2): R | undefined {
  return rooms.find((r) => r.level === level && r.polygon && r.polygon.length >= 3 && pointInPolygon(p, r.polygon));
}
