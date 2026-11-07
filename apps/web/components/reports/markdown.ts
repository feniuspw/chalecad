import type { ConstructionGuide, EngineerPackage, QuantityLine } from '@chalecad/engine';
import { formatArea, formatKg, formatNumber } from '../../lib/format';
import { PHASE_LABEL, SEVERITY_LABEL, STATUS_LABEL } from './labels';

const hh = (n: number) => `${formatNumber(n, 1)} h`;

export function guideToMarkdown(guide: ConstructionGuide, lines: QuantityLine[]): string {
  const byId = new Map(lines.map((l) => [l.id, l]));
  const out: string[] = [`# Roteiro de obra: ${guide.projectName}`, '', `Esforço estimado: ${hh(guide.totalManHours)} (homem-hora).`, ''];
  out.push('## Compre primeiro (maior prazo de entrega)', '');
  if (guide.buyFirst.length === 0) out.push('Nenhum item de prazo longo.');
  for (const b of guide.buyFirst) out.push(`- ${b.name}: ${formatNumber(b.purchaseQty, 0)} ${b.unit}, prazo ${b.leadTimeDays} dias (${b.leadTimeNote})`);
  out.push('', '## Ferramentas', '', guide.tools.map((t) => `- ${t}`).join('\n'), '', '## Passos', '');
  for (const s of guide.steps) {
    out.push(`### ${s.order}. ${s.title}`, '', `*${PHASE_LABEL[s.phase]} · ${hh(s.manHours)}*`, '', s.description, '');
    if (s.pieceCount !== undefined) out.push(`Painel: ${s.pieceCount} peças${s.weightKg !== undefined ? `, ${formatKg(s.weightKg)}` : ''}${s.panels ? `, ${s.panels} painel(is)` : ''}.`, '');
    if (s.tools.length) out.push(`Ferramentas: ${s.tools.join(', ')}.`, '');
    const mats = s.materials.map((id) => byId.get(id)).filter((l): l is QuantityLine => !!l);
    if (mats.length) out.push('Materiais:', ...mats.map((l) => `- ${l.name}: ${formatNumber(l.purchaseQty, 0)} ${l.unit}`), '');
  }
  out.push('---', '', guide.disclaimer);
  return out.join('\n');
}

export function packageToMarkdown(p: EngineerPackage): string {
  const s = p.summary;
  const out: string[] = [
    `# Pacote para o engenheiro: ${s.projectName}`,
    '',
    '## Resumo',
    '',
    `- Tipologia: ${s.typology} (${s.region})`,
    ...Object.entries(s.dimensions).map(([k, v]) => `- ${k}: ${typeof v === 'number' ? formatNumber(v) : v}`),
    `- Áreas: construída ${formatArea(s.areas.built)}, implantação ${formatArea(s.areas.footprint)}, telhado ${formatArea(s.areas.roof)}, radier ${formatArea(s.areas.radier)}, mezanino ${formatArea(s.areas.mezzanine)}`,
    `- Perfis: ${Object.entries(s.profiles).map(([k, v]) => `${k} ${v}`).join('; ')}`,
    `- Espaçamento dos montantes: ${formatNumber(s.studSpacing * 100, 0)} cm; contraventamento: ${s.bracing}`,
    `- Radier: ${formatNumber(s.foundation.thickness * 100, 0)} cm, borda ${formatNumber(s.foundation.border * 100, 0)} cm, viga de borda ${formatNumber(s.foundation.edgeBeamDepth * 100, 0)} cm`,
    `- Aço: ${formatKg(s.steelKg)}; peso total: ${formatKg(s.totalWeightKg)}`,
    '',
    '## Premissas de carga',
    '',
  ];
  const a = p.loadAssumptions;
  out.push(`- Vento V0 ${a.windV0} m/s, categoria de terreno ${a.terrainCategory}`);
  out.push(`- Solo: ${a.soilBearingKPa} kPa${a.soilIsDefault ? ' (valor padrão, sem sondagem)' : ''}`);
  if (a.loads) {
    const l = a.loads;
    out.push(
      `- Cobertura: permanente ${l.deadRoofKPa} kPa, acidental ${l.liveRoofKPa} kPa`,
      `- Piso: permanente ${l.deadFloorKPa} kPa, acidental ${l.liveFloorKPa} kPa`,
      `- Vento: q ${l.windQKPa} kPa, parede ${l.windWallKPa} kPa, sucção no telhado ${l.windRoofUpliftKPa} kPa`,
    );
  }
  out.push('', '## Verificações (maior taxa de uso primeiro)', '', '| Verificação | Demanda | Capacidade | Taxa | Status |', '|---|---|---|---|---|');
  for (const c of p.checks) out.push(`| ${c.label} | ${formatNumber(c.demand)} ${c.unit} | ${formatNumber(c.capacity)} ${c.unit} | ${formatNumber(c.ratio)} | ${STATUS_LABEL[c.status]} |`);
  out.push('', '## Pontos de atenção', '');
  if (p.attentionPoints.length === 0) out.push('Nenhum.');
  for (const t of p.attentionPoints) out.push(`- [${SEVERITY_LABEL[t.severity]}] ${t.text}`);
  out.push('', '## Perguntas em aberto', '');
  if (p.openQuestions.length === 0) out.push('Nenhuma.');
  p.openQuestions.forEach((q, i) => out.push(`${i + 1}. ${q.text}`));
  out.push('', '---', '', p.artNotice, '', p.disclaimer);
  return out.join('\n');
}
