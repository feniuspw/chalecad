import type { Project } from '@chalecad/engine';

export const HOST_LABELS: Record<string, string> = {
  'ext-front': 'Parede frontal',
  'ext-back': 'Parede dos fundos',
  'ext-left': 'Parede esquerda',
  'ext-right': 'Parede direita',
  'roof-a': 'Água do telhado A',
  'roof-b': 'Água do telhado B',
  radier: 'Radier',
};

export const OPENING_LABELS = {
  door: 'Porta',
  window: 'Janela',
  sliding_door: 'Porta de correr',
  skylight: 'Claraboia',
} as const;

export const STAIR_LABELS = { straight: 'Escada reta', l_shape: 'Escada em L', ladder: 'Escada marinheiro' } as const;

/** Nome legível de um hospedeiro (parede externa, água do telhado ou parede interna). */
export function hostLabel(project: Project, id: string): string {
  const fixed = HOST_LABELS[id];
  if (fixed) return fixed;
  const i = project.walls.findIndex((w) => w.id === id);
  if (i >= 0) return `Parede interna ${i + 1}`;
  if (id.startsWith('slab-')) {
    const lv = project.levels.find((l) => `slab-${l.id}` === id);
    return lv?.name ?? 'Laje';
  }
  if (id.startsWith('wing-')) return `Ala (${id.slice(5)})`;
  return id;
}

/** Nome de uma abertura, numerado por tipo na ordem do projeto ("Janela 2"). */
export function openingLabel(project: Project, id: string): string {
  const o = project.openings.find((x) => x.id === id);
  if (!o) return id;
  const n = project.openings.filter((x) => x.type === o.type).findIndex((x) => x.id === id) + 1;
  return `${OPENING_LABELS[o.type]} ${n}`;
}
