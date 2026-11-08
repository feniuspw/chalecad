/** Sistema construtivo (LSF x wood frame): troca de perfis e filtros por material. Funções puras. */
import { WOOD_PROFILES, type Project } from '@chalecad/engine';
import type { Catalog, Profile } from '@chalecad/catalog';

export type Structure = Project['system']['structure'];

/** Perfis padrão do LSF (iguais aos defaults do schema do motor). */
export const LSF_PROFILES = {
  wallStud: 'Ue90x40x0.95',
  wallTrack: 'U90x40x0.95',
  joist: 'Ue200x40x1.25',
  rafter: 'Ue140x40x0.95',
  purlin: 'Cr50x0.95',
} as const;

export const STRUCTURE_LABELS: Record<Structure, string> = { lsf: 'Steel frame', wood: 'Wood frame' };
export const STRUCTURE_HINTS: Record<Structure, string> = {
  lsf: 'perfis de aço galvanizado, leve e preciso',
  wood: 'pinus tratado em autoclave, NBR 7190, comum em chalés',
};

/** Material dos perfis de cada sistema. */
export const materialOf = (s: Structure): Profile['material'] => (s === 'wood' ? 'wood' : 'steel');

/** Perfis do catálogo que servem ao sistema (filtra por material, e opcionalmente por família). */
export function profilesForStructure(profiles: readonly Profile[], structure: Structure, family?: Profile['family']): Profile[] {
  const mat = materialOf(structure);
  return profiles.filter((p) => (p.material ?? 'steel') === mat && (!family || p.family === family));
}

/** Troca o sistema (muta o draft): perfis padrão do novo sistema; mantém espaçamento, assemblies e o resto. */
export function setStructure(draft: Project, structure: Structure, catalog?: Catalog): void {
  const sys = draft.system;
  sys.structure = structure;
  const defaults = structure === 'wood' ? WOOD_PROFILES : LSF_PROFILES;
  sys.profiles.wallStud = defaults.wallStud;
  sys.profiles.wallTrack = defaults.wallTrack;
  sys.profiles.joist = defaults.joist;
  sys.profiles.rafter = defaults.rafter;
  sys.profiles.purlin = defaults.purlin;
  const g = sys.profiles.gableStud;
  if (g) {
    const mat = materialOf(structure);
    const p = catalog?.profiles.find((x) => x.id === g);
    // Sem catálogo, usa o prefixo do id (madeira = "W…").
    const same = p ? (p.material ?? 'steel') === mat : g.startsWith('W') === (structure === 'wood');
    if (!same) delete sys.profiles.gableStud;
  }
}

/** Nome legível do perfil: madeira "38 × 89 mm", aço "Ue 90×40×0,95". */
export function profileLabel(p: Profile): string {
  const dec = (n: number) => String(n).replace('.', ',');
  if (p.material === 'wood') return `${p.flange} × ${p.web} mm`;
  return p.family === 'Cr' ? `Cartola ${p.web}×${p.flange}×${dec(p.thickness)}` : `${p.family} ${p.web}×${p.flange}×${dec(p.thickness)}`;
}

export function structureToast(structure: Structure): string {
  return structure === 'wood'
    ? 'Perfis trocados para madeira (38 × 89 nos montantes). Revise vigas e caibros.'
    : 'Perfis trocados para aço (Ue 90×40 nos montantes). Revise vigas e caibros.';
}
