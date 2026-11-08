/** Seleção: do clique no 3D para o store, do aviso de validação para o objeto, e exclusão. */
import type { BuildingModel, Project } from '@chalecad/engine';
import type { Selection } from '../store/types';
import { removeOpening, removeStair, removeWall } from './edit';
import { extraLabel, removeExtra } from './extras';
import { removeRoom, roomDisplayName } from './rooms';
import { hostLabel, openingLabel, STAIR_LABELS } from './labels';

/** Converte o ID do hospedeiro clicado na cena em uma seleção tipada. */
export function selectionFromHost(id: string, model: BuildingModel, project: Project): Selection {
  if (model.stairs.some((s) => s.id === id)) return { kind: 'stair', id };
  if (model.roofPlanes.some((p) => p.id === id)) return { kind: 'roof', id };
  if (model.slabs.some((s) => s.id === id)) return { kind: 'slab', id };
  if (project.walls.some((w) => w.id === id)) return { kind: 'wall', id };
  return { kind: 'host', id };
}

export type SectionId = 'typology' | 'mezzanine' | 'system' | 'roof' | 'foundation' | 'site' | 'terrain' | 'extras' | 'finishes';

/** Para onde levar o usuário ao clicar num problema de validação (caminho Zod, ex.: `openings.2.width`). */
export function issueTarget(path: string, project: Project): { selection?: Selection; section?: SectionId } {
  const [root, idx] = path.split('.');
  const i = idx !== undefined && /^\d+$/.test(idx) ? Number(idx) : -1;
  switch (root) {
    case 'openings': {
      const o = project.openings[i];
      return o ? { selection: { kind: 'opening', id: o.id } } : {};
    }
    case 'walls': {
      const w = project.walls[i];
      return w ? { selection: { kind: 'wall', id: w.id } } : {};
    }
    case 'stairs': {
      const s = project.stairs[i];
      return s ? { selection: { kind: 'stair', id: s.id } } : {};
    }
    case 'typology':
      return { section: 'typology' };
    case 'levels':
      return { section: 'mezzanine' };
    case 'system':
      return { section: path.startsWith('system.foundation') ? 'foundation' : 'system' };
    case 'roof':
      return { section: 'roof' };
    case 'extras': {
      const e = project.extras[i];
      return e ? { selection: { kind: 'extra', id: e.id } } : { section: 'extras' };
    }
    case 'site':
      return { section: 'terrain' };
    case 'design':
    case 'meta':
      return { section: 'site' };
    default:
      return {};
  }
}

export interface Deletion {
  ok: boolean;
  /** Mensagem para o usuário (pt-BR). */
  message: string;
}

/** Exclui o objeto selecionado, com histórico. Só aberturas, paredes internas, escadas e extras são excluíveis. */
export function deleteSelection(
  sel: Selection | null,
  project: Project,
  update: (label: string, recipe: (d: Project) => void) => void,
): Deletion {
  if (!sel) return { ok: false, message: 'Nada selecionado.' };
  switch (sel.kind) {
    case 'opening': {
      const name = openingLabel(project, sel.id);
      update(`Excluir ${name.toLowerCase()}`, (d) => void removeOpening(d, sel.id));
      return { ok: true, message: `${name} excluída.` };
    }
    case 'wall': {
      const name = hostLabel(project, sel.id);
      update(`Excluir ${name.toLowerCase()}`, (d) => void removeWall(d, sel.id));
      return { ok: true, message: `${name} excluída.` };
    }
    case 'stair': {
      const st = project.stairs.find((s) => s.id === sel.id);
      const name = st ? STAIR_LABELS[st.type] : 'Escada';
      update(`Excluir ${name.toLowerCase()}`, (d) => void removeStair(d, sel.id));
      return { ok: true, message: `${name} excluída.` };
    }
    case 'extra': {
      const name = extraLabel(project, sel.id);
      update(`Excluir ${name.toLowerCase()}`, (d) => void removeExtra(d, sel.id));
      return { ok: true, message: `${name} excluído.` };
    }
    case 'room': {
      const room = project.rooms.find((r) => r.id === sel.id);
      const name = room ? roomDisplayName(project, room) : 'Cômodo';
      update(`Remover ${name.toLowerCase()}`, (d) => void removeRoom(d, sel.id));
      return { ok: true, message: `${name} removido.` };
    }
    default:
      return { ok: false, message: 'Este elemento faz parte da tipologia: ajuste-o nas propriedades.' };
  }
}
