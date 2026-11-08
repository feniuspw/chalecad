/** Verificação de um projeto gerado (usada pelo teste de matriz): devolve os problemas encontrados. */
import { computeAll, Project } from '@chalecad/engine';
import { getCatalog } from '@chalecad/catalog';
import type { WizardAnswers } from './answers';
import { effectiveMezzanine } from './style';
import { generateProject } from './generate';

/** Avisos de especificação (informação para o engenheiro): não contam como pendência do desenho. */
export const SPEC_ONLY_CODES = ['norm.safety_glass', 'norm.aframe_thrust', 'steel.index'];

export const BAD_CODES = ['furniture.collision', 'furniture.wall', 'furniture.outside', 'furniture.door'];

/**
 * `strict`: além de projeto válido, exige conformidade (sem alerta de atenção evitável, sem verificação reprovada, sem pendência no selo).
 * As opções de terreno, madeira e muro de arrimo trazem avisos de engenharia próprios e não entram na verificação estrita.
 */
export function checkCombo(a: WizardAnswers, strict = false): string[] {
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
  // conformidade: nenhum alerta de atenção evitável, nem verificação estrutural reprovada, no projeto final
  if (strict) conformity(res, r, problems);
  const beds = r.model.rooms.filter((x) => x.use === 'bedroom').length;
  const baths = r.model.rooms.filter((x) => x.use === 'bathroom').length;
  const mezz = effectiveMezzanine(a);
  const wantBaths = a.bathrooms + (a.bathUp && mezz !== 'none' ? 1 : 0);
  if (beds < a.bedrooms && !res.notes.some((n) => /quarto/i.test(n))) problems.push(`quartos ${beds}/${a.bedrooms} sem nota`);
  if (baths < wantBaths && !res.notes.some((n) => /banheiro/i.test(n))) problems.push(`banheiros ${baths}/${wantBaths} sem nota`);
  return problems;
}

function conformity(res: ReturnType<typeof generateProject>, r: ReturnType<typeof computeAll>, problems: string[]) {
  for (const w of r.warnings) {
    if (w.severity === 'info' || SPEC_ONLY_CODES.includes(w.code) || problems.some((x) => x.startsWith(`${w.code}:`))) continue;
    problems.push(`atenção ${w.code}: ${w.message.slice(0, 120)}`);
  }
  for (const w of r.warnings) {
    // teto inclinado do mezanino pode ficar como informação (com nota); em qualquer outro cômodo não
    if (w.code === 'room.ceiling' && !(w.refs ?? []).every((id) => r.model.rooms.find((x) => x.id === id)?.level !== 'L0')) problems.push(`informação room.ceiling fora do mezanino: ${w.message.slice(0, 100)}`);
  }
  for (const c of r.structure?.checks ?? []) if (c.ratio > 1) problems.push(`reprovada ${c.kind}: ${c.label} taxa ${c.ratio.toFixed(2)}`);
  if (res.review.length > 0) problems.push(`selo: ${res.review.length} ponto(s) para revisar: ${res.review[0]}`);
}
