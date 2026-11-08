/** Sugestões do pré-dimensionamento convertidas em edições do projeto. */
import { getCatalog } from '@chalecad/catalog';
import type { Project, StructuralCheck } from '@chalecad/engine';
import { formatNumber } from '@/lib/format';

export type Applier = (d: Project) => void;

/** Converte a sugestão do motor em uma edição do projeto, conforme o tipo da verificação. */
export function suggestionRecipe(check: StructuralCheck): { label: string; recipe: Applier } | null {
  const s = check.suggestion;
  if (!s) return null;
  const profile = s.profileId;
  const spacing = s.studSpacing;
  const hasProfile = profile !== undefined && getCatalog().profiles.some((p) => p.id === profile);
  const field =
    check.kind === 'stud' ? 'wallStud' : check.kind === 'gable_stud' ? 'gableStud' : check.kind === 'joist' ? 'joist' : check.kind === 'rafter' ? 'rafter' : check.kind === 'purlin' ? 'purlin' : null;
  const applyProfile = hasProfile && field !== null;
  const rafterSpacing = s.rafterSpacing;
  if (!applyProfile && spacing === undefined && rafterSpacing === undefined) return null;
  const parts: string[] = [];
  if (applyProfile) parts.push(field === 'gableStud' ? `${profile!} só nas empenas` : profile!);
  if (spacing !== undefined) parts.push(`montantes a cada ${formatNumber(spacing * 100, 0)} cm`);
  if (rafterSpacing !== undefined) parts.push(`caibros a cada ${formatNumber(rafterSpacing * 100, 0)} cm`);
  return {
    label: parts.join(' + '),
    recipe: (d) => {
      if (applyProfile && field) {
        d.system.profiles[field] = profile!;
        if (field === 'wallStud') {
          const track = profile!.replace(/^Ue/, 'U');
          if (getCatalog().profiles.some((p) => p.id === track)) d.system.profiles.wallTrack = track;
        }
      }
      if (spacing !== undefined) d.system.studSpacing = spacing;
      if (rafterSpacing !== undefined) d.system.rafterSpacing = rafterSpacing;
    },
  };
}

