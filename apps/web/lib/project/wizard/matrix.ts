/** Verificação de um projeto gerado (usada pelo teste de matriz): devolve os problemas encontrados. */
import { computeAll, Project, roofBelowAt, type Vec2 } from '@chalecad/engine';
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
  if (strict) {
    conformity(res, r, problems);
    problems.push(...wallHeadroomProblems(r, parsed.data));
  }
  if (a.furnish) problems.push(...emptyRoomProblems(r, parsed.data));
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

/**
 * Divisórias sob o telhado: em toda a linha de uma parede interna o pé-direito (telhado menos a cota do piso) precisa ser
 * de pelo menos 1,0 m e, se a parede tem porta, de pelo menos 2,1 m. Paredes externas e dos anexos ficam de fora.
 */
export function wallHeadroomProblems(r: ReturnType<typeof computeAll>, project: Project): string[] {
  const out: string[] = [];
  const elev = new Map(project.levels.map((l) => [l.id, l.elevation]));
  for (const w of r.model.walls) {
    if (/^(ext|annex)-/.test(w.id)) continue;
    const e = elev.get(w.level) ?? 0;
    const door = r.model.openings.some((o) => o.hostId === w.id && o.hostKind === 'wall' && (o.type === 'door' || o.type === 'sliding_door'));
    const len = Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]);
    const n = Math.max(1, Math.ceil(len / 0.1));
    let min = Infinity;
    for (let i = 0; i <= n; i++) {
      const t = Math.min(1 - 0.02 / len, Math.max(0.02 / len, i / n));
      const pt: Vec2 = [w.from[0] + (w.to[0] - w.from[0]) * t, w.from[1] + (w.to[1] - w.from[1]) * t];
      const top = roofBelowAt(r.model.roofPlanes, pt);
      if (top !== null) min = Math.min(min, top - e);
    }
    if (min < 1.0 - 1e-6) out.push(`parede ${w.id} com pé-direito de ${min.toFixed(2)} m sob o telhado (mínimo 1,0 m)`);
    else if (door && min < 2.1 - 1e-6) out.push(`parede ${w.id} com porta e pé-direito de ${min.toFixed(2)} m sob o telhado (mínimo 2,1 m)`);
  }
  return out;
}

/** Cômodo "Depósito" fechado ou qualquer cômodo (fora circulação) sem um único móvel: sobra de planta. */
export function emptyRoomProblems(r: ReturnType<typeof computeAll>, project: Project): string[] {
  const out: string[] = [];
  for (const room of r.model.rooms) {
    if (!room.polygon) continue;
    if (room.use === 'storage') out.push(`cômodo de depósito sem uso: ${room.name}`);
    if (room.use === 'circulation' || room.use === 'storage' || room.use === 'other') continue;
    const poly = room.polygon as Vec2[];
    const inside = (pt: Vec2) => {
      let c = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i]!;
        const [xj, yj] = poly[j]!;
        if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
    if (!project.furniture.some((f) => f.level === room.level && inside(f.position as Vec2))) out.push(`cômodo vazio: ${room.name}`);
  }
  return out;
}
