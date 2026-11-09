/** Texto da ficha da ART/RRT para colar no SITAC (CREA) ou SICCAU (CAU). Puro. */
import type { ArtActivity, ArtSheet, Professional } from '@chalecad/engine';
import { DISCIPLINE_LABEL, formatDateBr } from './labels';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const qty = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const orBlank = (s: string | undefined) => (s && s.trim() ? s : '(preencher)');

/** Atividades do profissional; as sem profissional entram em `professional === undefined`. */
export function activitiesOf(art: ArtSheet, professionalId?: string): ArtActivity[] {
  return art.activities.filter((a) => a.professionalId === professionalId);
}

export function activityText(a: ArtActivity): string {
  const lines = [`${a.activity}`, `Quantidade: ${qty(a.quantity)} ${a.unit}`];
  if (a.contractValue !== undefined) lines.push(`Valor do contrato: ${brl(a.contractValue)}`);
  if (a.notes) lines.push(`Observação: ${a.notes}`);
  return lines.join('\n');
}

export function professionalHeader(p: Professional): string {
  const reg = p.registry ? ` · ${p.council} ${p.registry}${p.uf ? `/${p.uf}` : ''}` : ` · ${p.council}`;
  return `${p.name}${p.title ? ` (${p.title})` : ''}${reg}`;
}

/** "Copiar tudo": ficha completa, uma seção por profissional (ou só a do profissional dado). */
export function artSheetText(art: ArtSheet, professionals: Professional[], only?: string): string {
  const out: string[] = [];
  const target = art.owner;
  out.push('FICHA PARA ART/RRT (dados para copiar no SITAC/CREA ou SICCAU/CAU)');
  out.push('');
  out.push('Proprietário');
  out.push(`  Nome: ${orBlank(target.name)}`);
  out.push(`  CPF/CNPJ: ${orBlank(target.doc)}`);
  out.push(`  Endereço: ${orBlank(target.address)}`);
  out.push('Contratante');
  out.push(`  Nome: ${orBlank(art.contractor.name)}`);
  out.push(`  CPF/CNPJ: ${orBlank(art.contractor.doc)}`);
  out.push(`  Endereço: ${orBlank(art.contractor.address)}`);
  out.push('Obra');
  out.push(`  Endereço: ${orBlank(art.siteAddress)}`);
  if (art.coordinates) out.push(`  Coordenadas: ${art.coordinates.lat.toFixed(6)}, ${art.coordinates.lon.toFixed(6)}`);
  out.push(`  Início: ${orBlank(formatDateBr(art.startDate))}`);
  out.push(`  Término previsto: ${orBlank(formatDateBr(art.endDate))}`);

  const groups: { prof?: Professional; id?: string }[] = [
    ...professionals.filter((p) => !only || p.id === only).map((p) => ({ prof: p, id: p.id })),
    ...(!only && art.activities.some((a) => !a.professionalId || !professionals.some((p) => p.id === a.professionalId)) ? [{}] : []),
  ];
  for (const g of groups) {
    const list = g.prof ? activitiesOf(art, g.id) : art.activities.filter((a) => !a.professionalId || !professionals.some((p) => p.id === a.professionalId));
    if (list.length === 0 && g.prof) continue;
    out.push('');
    out.push(g.prof ? `Profissional: ${professionalHeader(g.prof)}` : 'Atividades sem profissional atribuído');
    if (g.prof?.docNumber) out.push(`  Nº da ${g.prof.council === 'CAU' ? 'RRT' : 'ART'}: ${g.prof.docNumber}`);
    list.forEach((a, i) => {
      out.push(`  Atividade ${i + 1} (${DISCIPLINE_LABEL[a.discipline]}):`);
      out.push(...activityText(a).split('\n').map((l) => `    ${l}`));
    });
  }
  if (art.blanks.length > 0) {
    out.push('');
    out.push(`Campos ainda vazios: ${art.blanks.join('; ')}`);
  }
  out.push('');
  out.push('A ART é emitida pelo profissional no sistema do CREA da sua UF (ou o RRT no SICCAU); esta ficha só reúne os dados.');
  return out.join('\n');
}
