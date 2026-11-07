import { findPriceItem, getPriceBook, type Catalog, type Profile } from '@chalecad/catalog';
import type { Project } from '../schema/project';
import type { Piece, StructuralCheck } from '../schema/results';
import { nf, signed } from './format';

export interface SuggestSpec {
  pieces: Piece[];
  profile: Profile;
  spacing: 0.4 | 0.6;
  /** Taxa de uso recalculada para outro perfil/espaçamento. */
  ratioFn: (p: Profile, spacing: number) => number;
  currentRatio: number;
  /** Quando false só troca de perfil. */
  allowSpacing: boolean;
}

/** R$/kg da barra de 6 m (ou a maior disponível) do perfil, pela base de preços do projeto. */
export function pricePerKg(p: Profile, project: Project, catalog: Catalog): number {
  const book = getPriceBook(catalog, project.priceBookId);
  let idx = p.barLengths.indexOf(6);
  if (idx < 0) idx = p.barLengths.length - 1;
  const itemId = p.priceItemIds[idx] ?? p.priceItemIds[0];
  if (!itemId) return 0;
  const price = project.priceOverrides[itemId]?.price ?? findPriceItem(book, itemId)?.price ?? 0;
  const bar = p.barLengths[idx] ?? 6;
  return price / (bar * p.massPerM);
}

interface Option {
  profile: Profile;
  spacing: number;
  ratio: number;
  largerWeb: boolean;
  metric: number;
}

/**
 * Procura, na mesma família, o perfil (e/ou espaçamento 0,4) mais leve que traz a taxa abaixo de `usage.warn`.
 * Ordem: primeiro a mesma alma (espessura maior), depois alma maior; dentro do grupo, menor massa por m² de influência.
 * Se nenhum chega à faixa usual, devolve o que mais reduz a taxa, avisando que ainda excede.
 */
export function suggest(spec: SuggestSpec, project: Project, catalog: Catalog): StructuralCheck['suggestion'] | undefined {
  const warn = catalog.constants.usage.warn;
  const cur = spec.profile;
  const spacings = spec.allowSpacing && spec.spacing > 0.4 ? [spec.spacing, 0.4] : [spec.spacing];
  const options: Option[] = [];
  for (const p of catalog.profiles) {
    if (p.family !== cur.family) continue;
    for (const s of spacings) {
      if (p.id === cur.id && s === spec.spacing) continue;
      // Nunca propõe seção mais fraca que a atual; o espaçamento menor pode vir com o mesmo perfil.
      if (p.Wx < cur.Wx || p.area < cur.area || p.Ix < cur.Ix) continue;
      const ratio = spec.ratioFn(p, s);
      if (!Number.isFinite(ratio) || ratio >= spec.currentRatio - 1e-6) continue;
      options.push({ profile: p, spacing: s, ratio, largerWeb: p.web > cur.web, metric: p.massPerM / s });
    }
  }
  if (options.length === 0) return undefined;
  const ok = options
    .filter((o) => o.ratio < warn)
    .sort((a, b) => Number(a.largerWeb) - Number(b.largerWeb) || a.metric - b.metric || a.profile.id.localeCompare(b.profile.id));
  const best =
    ok[0] ?? [...options].sort((a, b) => a.ratio - b.ratio || a.metric - b.metric || a.profile.id.localeCompare(b.profile.id))[0]!;

  const lengthSum = spec.pieces.reduce((a, p) => a + p.length, 0);
  const factor = spec.spacing / best.spacing;
  const deltaKg = lengthSum * (best.profile.massPerM * factor - cur.massPerM);
  const deltaCost = deltaKg * pricePerKg(best.profile, project, catalog);

  const spacingChanged = best.spacing !== spec.spacing;
  const profileChanged = best.profile.id !== cur.id;
  const what = profileChanged
    ? `Trocar ${cur.id} por ${best.profile.id}${spacingChanged ? ' e reduzir o espaçamento para 0,4 m' : ''}`
    : 'Reduzir o espaçamento para 0,4 m';
  let text = `${what} deixa a taxa em ${nf(best.ratio)} (${signed(deltaKg)} kg, ${deltaCost >= 0 ? '+' : '-'}R$ ${nf(Math.abs(deltaCost), 0)})`;
  // O espaçamento é único no projeto (estrutura alinhada): muda também montantes e caibros.
  if (spacingChanged) text += '. O espaçamento vale para toda a estrutura, então o custo total sobe mais que isso';
  if (best.ratio >= warn) text += '. Ainda acima da faixa usual: revisar vão e apoios com o engenheiro';

  const out: NonNullable<StructuralCheck['suggestion']> = {
    text,
    deltaKg: Math.round(deltaKg * 100) / 100,
    deltaCost: Math.round(deltaCost * 100) / 100,
  };
  if (profileChanged) out.profileId = best.profile.id;
  if (spacingChanged) out.studSpacing = 0.4;
  return out;
}
