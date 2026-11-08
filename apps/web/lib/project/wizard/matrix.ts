/** Verificação de um projeto gerado (usada pelo teste de matriz): devolve os problemas encontrados. */
import { computeAll, Project } from '@chalecad/engine';
import { getCatalog } from '@chalecad/catalog';
import type { WizardAnswers } from './answers';
import { effectiveMezzanine } from './style';
import { generateProject } from './generate';

export const BAD_CODES = ['furniture.collision', 'furniture.wall', 'furniture.outside', 'furniture.door'];

export function checkCombo(a: WizardAnswers): string[] {
  const problems: string[] = [];
  const catalog = getCatalog();
  let res;
  try {
    res = generateProject(a, catalog);
  } catch (e) {
    return [`exceção: ${(e as Error).message.slice(0, 200)}`];
  }
  const parsed = Project.safeParse(JSON.parse(JSON.stringify(res.project)));
  if (!parsed.success) return [`schema: ${parsed.error.issues.slice(0, 2).map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`];
  let r;
  try {
    r = computeAll(parsed.data, catalog);
  } catch (e) {
    return [`computeAll: ${(e as Error).message.slice(0, 200)}`];
  }
  for (const w of r.warnings) if (w.severity === 'error') problems.push(`erro ${w.code}: ${w.message}`);
  for (const room of r.model.rooms) if (!room.polygon) problems.push(`cômodo aberto: ${room.name}`);
  for (const w of r.warnings) if (BAD_CODES.includes(w.code) || w.code === 'norm.stair_headroom' || w.code === 'room.open' || w.code === 'mezzanine.headroom') problems.push(`${w.code}: ${w.message}`);
  const beds = r.model.rooms.filter((x) => x.use === 'bedroom').length;
  const baths = r.model.rooms.filter((x) => x.use === 'bathroom').length;
  const mezz = effectiveMezzanine(a);
  const wantBaths = a.bathrooms + (a.bathUp && mezz !== 'none' ? 1 : 0);
  if (beds < a.bedrooms && !res.notes.some((n) => /quarto/i.test(n))) problems.push(`quartos ${beds}/${a.bedrooms} sem nota`);
  if (baths < wantBaths && !res.notes.some((n) => /banheiro/i.test(n))) problems.push(`banheiros ${baths}/${wantBaths} sem nota`);
  return problems;
}
