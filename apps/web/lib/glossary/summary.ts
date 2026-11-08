/** "Seu chalé em 4 frases": resumo leigo gerado só a partir do projeto e dos resultados. */
import type { Project, Results } from '@chalecad/engine';
import { STAGE_LABELS } from '@chalecad/catalog';
import { PARTIAL_WARNING_CODE } from '../engine/compute';

export interface PlainSummary {
  size: string;
  cost: string;
  structure: string;
  next: string;
}

const nf = (v: number, d = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const brl = (v: number) => `R$ ${nf(v)}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function plainSummary(project: Project, results: Results): PlainSummary {
  const area = results.quantities.areas.built;
  const rooms = project.rooms.length;
  const size =
    rooms > 0
      ? `Seu chalé tem ${nf(area, 1)} m² construídos e ${plural(rooms, 'cômodo marcado', 'cômodos marcados')}.`
      : `Seu chalé tem ${nf(area, 1)} m² construídos. Ainda não há cômodos marcados na planta.`;

  const b = results.budget;
  const top = [...b.byStage].sort((x, y) => y.total - x.total)[0];
  const cost = `Ele deve custar cerca de ${brl(b.total)} (até ${brl(b.totalMax)}), ou ${brl(b.perM2)} por m²${top && top.total > 0 ? `. O que mais pesa é ${STAGE_LABELS[top.stage].toLowerCase()}` : ''}.`;

  const sum = results.structure?.summary;
  const warnCount = results.warnings.filter((w) => w.severity !== 'info' && w.code !== PARTIAL_WARNING_CODE).length;
  let structure: string;
  if (!sum) structure = 'A estrutura ainda não foi verificada.';
  else if (sum.fail > 0) structure = `A estrutura tem ${plural(sum.fail, 'ponto para revisar', 'pontos para revisar')}: algumas peças estão fracas para o esforço.`;
  else if (sum.warn > 0) structure = `A estrutura passou, mas ${plural(sum.warn, 'ponto pede', 'pontos pedem')} atenção.`;
  else structure = 'A estrutura passou em todas as verificações, dentro da faixa usual.';

  let next: string;
  if (sum && sum.fail > 0) next = `Próximo passo: revise ${plural(sum.fail, 'ponto', 'pontos')} com o engenheiro.`;
  else if (rooms === 0) next = 'Próximo passo: marque os cômodos para estimar instalações.';
  else if (warnCount > 0) next = `Próximo passo: leia ${plural(warnCount, 'alerta', 'alertas')} na aba Alertas.`;
  else next = 'Próximo passo: leve o projeto a um engenheiro para o projeto estrutural com ART.';

  return { size, cost, structure, next };
}
