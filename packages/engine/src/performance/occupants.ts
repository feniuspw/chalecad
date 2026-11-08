import type { Catalog } from '@chalecad/catalog';
import type { Project } from '../schema/project';

/** Moradores: mesma regra das instalações (`installations.occupants` ou personsPerBedroom por quarto, mínimo 2). */
export function occupantsOf(project: Project, catalog: Catalog): number {
  const bedrooms = project.rooms.filter((r) => r.use === 'bedroom').length;
  return project.installations.occupants ?? Math.max(2, catalog.constants.installations.personsPerBedroom * bedrooms);
}
