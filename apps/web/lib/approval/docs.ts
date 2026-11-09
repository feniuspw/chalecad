/** Documentos da aprovação como dados (`DocSpec`); o PDF só os desenha. Puro. */
import { APPROVAL_NOTICE, type ApprovalReport, type Discipline, type Memorial, type Professional, type Project, type Results } from '@chalecad/engine';
import { activityText, professionalHeader } from './artText';
import { DISCIPLINE_LABEL, REVIEW_LABEL, STAGE_LABEL, STATUS_LABEL, formatDateBr } from './labels';

export type DocBlock =
  | { t: 'h'; text: string }
  | { t: 'p'; text: string }
  | { t: 'kv'; rows: [string, string][] }
  | { t: 'table'; head: string[]; rows: string[][]; widths?: number[] };

export interface DocSpec {
  /** Nome do arquivo sem pasta, ex.: `memorial-estrutura.pdf`. */
  fileName: string;
  title: string;
  subtitle?: string;
  header: { work: string; owner: string; address: string; responsible: string };
  blocks: DocBlock[];
  notice: string;
}

const n2 = (n: number, d = 2) => n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const dash = (s: string | undefined | null) => (s && String(s).trim() ? String(s) : '—');

export const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'projeto';

export function siteAddressLine(project: Project): string {
  const a = project.legal.address;
  const parts = [a.street && `${a.street}${a.number ? `, ${a.number}` : ''}`, a.complement, a.district, a.city && `${a.city}/${project.meta.region}`, a.cep && `CEP ${a.cep}`].filter(Boolean);
  return parts.join(' — ');
}

/** Responsável pela disciplina: primeiro profissional que a cobre. */
export function responsibleFor(project: Project, discipline?: Discipline): Professional | undefined {
  const list = project.legal.professionals;
  return (discipline ? list.find((p) => p.disciplines.includes(discipline)) : undefined) ?? list[0];
}

export function headerFor(project: Project, discipline?: Discipline): DocSpec['header'] {
  const r = responsibleFor(project, discipline);
  return {
    work: project.meta.name,
    owner: project.legal.owner.name || '(proprietário não informado)',
    address: siteAddressLine(project) || '(endereço não informado)',
    responsible: r ? `${professionalHeader(r)}${r.docNumber ? ` · ${r.council === 'CAU' ? 'RRT' : 'ART'} ${r.docNumber}` : ''}` : '(responsável técnico não informado)',
  };
}

export function memorialDoc(project: Project, m: Memorial): DocSpec {
  const blocks: DocBlock[] = [];
  if (m.norms.length > 0) blocks.push({ t: 'h', text: 'Normas citadas' }, { t: 'p', text: m.norms.join('; ') });
  for (const s of m.sections) {
    blocks.push({ t: 'h', text: s.title });
    for (const p of s.paragraphs) blocks.push({ t: 'p', text: p });
    if (s.table) blocks.push({ t: 'table', head: s.table.head, rows: s.table.rows });
  }
  return {
    fileName: `memorial-${m.id}.pdf`,
    title: m.title,
    subtitle: `${m.kind === 'calculation' ? 'Memorial de cálculo' : 'Memorial descritivo'} — ${DISCIPLINE_LABEL[m.discipline]}`,
    header: headerFor(project, m.discipline),
    blocks,
    notice: APPROVAL_NOTICE,
  };
}

/** Termo de entrada de dados: o que foi informado e de onde veio. */
export function inputTerm(project: Project, results: Results): [string, string][] {
  const l = project.legal;
  const rows: [string, string][] = [
    ['Etapa do projeto', `${STAGE_LABEL[l.stage]} (informado)`],
    ['Proprietário', `${dash(l.owner.name)} · ${dash(l.owner.doc)} (informado)`],
    ['Endereço da obra', `${dash(siteAddressLine(project))} (informado)`],
    ['Matrícula / cartório', `${dash(l.address.registry)} / ${dash(l.address.registryOffice)} (informado)`],
    ['Lote', l.lot ? `${n2(l.lot.front, 1)} × ${n2(l.lot.depth, 1)} m, edificação em (${n2(l.lot.buildingOffset[0], 1)}; ${n2(l.lot.buildingOffset[1], 1)}) m, giro ${n2(l.lot.rotationDeg, 0)}° (informado)` : 'não informado'],
    ['Zoneamento', `${dash(l.zoning.zone)} — fonte: ${dash(l.zoning.source)}`],
    ['Tensão admissível do solo', `${n2(project.design.soilBearingKPa, 0)} kPa — ${l.soil.source === 'assumed' ? 'valor assumido (sem laudo)' : l.soil.source === 'spt' ? 'sondagem SPT' : 'outra fonte'}${l.soil.reference ? `, ref.: ${l.soil.reference}` : ''}`],
    ['Concessionárias', `energia: ${dash(l.powerUtility)}; água/esgoto: ${dash(l.waterUtility)} (informado)`],
    ['Abastecimento de água', l.waterSource === 'well' ? 'poço (informado)' : 'rede pública (informado)'],
    ['Aterramento', `${l.earthing} (informado)`],
    ['Percolação', l.percolationMinPerCm !== undefined ? `${n2(l.percolationMinPerCm, 1)} min/cm (informado)` : 'não informada'],
    ['Cálculo', `motor ${results.engineVersion}, catálogo ${results.catalogVersion}`],
  ];
  return rows;
}

export function complianceDoc(project: Project, results: Results, ap: ApprovalReport): DocSpec {
  const blocks: DocBlock[] = [];
  blocks.push({ t: 'h', text: 'Resumo por disciplina' });
  blocks.push({
    t: 'table',
    head: ['Disciplina', 'Ok', 'Atenção', 'Não passa', 'Conferir', 'Falta dado', 'N/A', 'Revisados'],
    rows: ap.summary.map((s) => [DISCIPLINE_LABEL[s.discipline], s.ok, s.warn, s.fail, s.manual, s.missing, s.na, s.reviewed].map(String)),
  });
  for (const d of Object.keys(DISCIPLINE_LABEL) as Discipline[]) {
    const items = ap.compliance.filter((c) => c.discipline === d);
    if (items.length === 0) continue;
    blocks.push({ t: 'h', text: DISCIPLINE_LABEL[d] });
    blocks.push({
      t: 'table',
      head: ['Norma / item', 'Critério', 'Valor', 'Limite', 'Situação', 'Parecer'],
      widths: [2.2, 3, 1.2, 1.2, 1.1, 2.6],
      rows: items.map((c) => {
        const rv = project.legal.reviews[c.id];
        const by = rv?.by ? project.legal.professionals.find((p) => p.id === rv.by)?.name : undefined;
        return [
          `${c.norm}${c.clause ? ` §${c.clause}` : ''}\n${c.title}`,
          c.criterion + (c.detail ? `\n${c.detail}` : ''),
          dash(c.value),
          dash(c.limit),
          STATUS_LABEL[c.status],
          rv ? `${REVIEW_LABEL[rv.status]} (${formatDateBr(rv.at)}${by ? `, ${by}` : ''})${rv.note ? `\n${rv.note}` : ''}` : '—',
        ];
      }),
    });
  }
  blocks.push({ t: 'h', text: 'Termo de entrada de dados' });
  blocks.push({ t: 'p', text: 'Dados informados pelo usuário e a fonte de cada um. A verificação só vale para estes dados.' });
  blocks.push({ t: 'kv', rows: inputTerm(project, results) });
  return {
    fileName: 'relatorio-verificacao-normativa.pdf',
    title: 'Relatório da verificação normativa',
    subtitle: `${STAGE_LABEL[ap.stage]} — ${ap.ready ? 'pronto para exportar' : 'com pendências'}`,
    header: headerFor(project),
    blocks,
    notice: ap.disclaimer || APPROVAL_NOTICE,
  };
}

export function artDoc(project: Project, ap: ApprovalReport): DocSpec {
  const a = ap.art;
  const blocks: DocBlock[] = [
    { t: 'h', text: 'Partes' },
    { t: 'kv', rows: [
      ['Proprietário', `${dash(a.owner.name)} · ${dash(a.owner.doc)}\n${dash(a.owner.address)}`],
      ['Contratante', `${dash(a.contractor.name)} · ${dash(a.contractor.doc)}\n${dash(a.contractor.address)}`],
      ['Endereço da obra', dash(a.siteAddress)],
      ...(a.coordinates ? [['Coordenadas', `${a.coordinates.lat.toFixed(6)}, ${a.coordinates.lon.toFixed(6)}`] as [string, string]] : []),
      ['Início / término', `${dash(formatDateBr(a.startDate))} / ${dash(formatDateBr(a.endDate))}`],
    ] },
  ];
  const groups = [...project.legal.professionals.map((p) => ({ p })), { p: undefined as Professional | undefined }];
  for (const g of groups) {
    const list = a.activities.filter((x) => (g.p ? x.professionalId === g.p.id : !x.professionalId || !project.legal.professionals.some((p) => p.id === x.professionalId)));
    if (list.length === 0) continue;
    blocks.push({ t: 'h', text: g.p ? `${professionalHeader(g.p)}${g.p.docNumber ? ` — ${g.p.council === 'CAU' ? 'RRT' : 'ART'} ${g.p.docNumber}` : ''}` : 'Atividades sem profissional atribuído' });
    blocks.push({ t: 'table', head: ['Atividade', 'Quantidade', 'Valor do contrato', 'Observação sugerida'], widths: [3, 1.2, 1.5, 3.5], rows: list.map((x) => [x.activity, `${n2(x.quantity)} ${x.unit}`, x.contractValue !== undefined ? n2(x.contractValue) : '—', x.notes || activityText(x)]) });
  }
  if (a.blanks.length > 0) blocks.push({ t: 'h', text: 'Campos ainda vazios' }, { t: 'p', text: a.blanks.join('; ') });
  blocks.push({ t: 'p', text: 'A ART é emitida pelo profissional no sistema do CREA da sua UF (ou o RRT no SICCAU); esta ficha só reúne os dados.' });
  return { fileName: 'ficha-art-rrt.pdf', title: 'Ficha para ART/RRT', subtitle: 'Dados para copiar no SITAC (CREA) ou SICCAU (CAU)', header: headerFor(project), blocks, notice: ap.disclaimer || APPROVAL_NOTICE };
}

export function utilityDoc(project: Project, results: Results): DocSpec {
  const el = results.installations?.electrical;
  const rows: [string, string][] = [
    ['Concessionária', dash(project.legal.powerUtility)],
    ['Endereço da obra', dash(siteAddressLine(project))],
    ['Titular', `${dash(project.legal.owner.name)} · ${dash(project.legal.owner.doc)}`],
    ['Tensão', el ? `${el.voltage} V` : results.installations ? `${results.installations.voltage} V` : '—'],
    ['Carga instalada', el ? `${n2(el.installedKw)} kW` : '—'],
    ['Demanda', el ? `${n2(el.demandKw)} kW` : results.installations ? `${n2(results.installations.demandKw)} kW (estimada)` : '—'],
    ['Fases / categoria', el ? `${el.entrance.phases} fase(s) · ${el.entrance.category}` : '—'],
    ['Disjuntor geral', el ? `${el.entrance.breakerA} A` : '—'],
    ['Cabo do ramal de entrada', el ? `${el.entrance.cableMm2} mm²` : '—'],
    ['Esquema de aterramento', project.legal.earthing],
  ];
  return {
    fileName: 'ficha-concessionaria-energia.pdf',
    title: 'Ficha para a concessionária de energia',
    subtitle: 'Dados de carga e padrão de entrada',
    header: headerFor(project, 'electrical'),
    blocks: [{ t: 'kv', rows }, ...(el ? [] : [{ t: 'p', text: 'Ative as instalações elétricas do projeto para preencher a carga, a demanda e o padrão de entrada.' } as DocBlock])],
    notice: APPROVAL_NOTICE,
  };
}

/** Ficha da fossa; null quando não há fossa/sumidouro calculado. */
export function septicDoc(project: Project, results: Results): DocSpec | null {
  const pl = results.installations?.plumbing;
  const septic = pl?.septic;
  if (!pl || !septic) return null;
  const l = project.legal;
  const rows: [string, string][] = [
    ['Contribuintes (ocupantes)', String(pl.tank.occupants)],
    ['Contribuição diária', `${n2(septic.contributionLpd, 0)} L/dia`],
    ['Volume do tanque séptico', `${n2(septic.tankLiters, 0)} L`],
    ['Teste de percolação', l.percolationMinPerCm !== undefined ? `${n2(l.percolationMinPerCm, 1)} min/cm` : 'não informado'],
    ['Abastecimento', l.waterSource === 'well' ? 'poço' : 'rede pública'],
  ];
  if (l.lot && l.septicPosition) {
    rows.push(['Posição da fossa (no lote)', `${n2(l.septicPosition[0], 1)} ; ${n2(l.septicPosition[1], 1)} m`]);
    if (l.wellPosition) rows.push(['Distância fossa–poço', `${n2(Math.hypot(l.septicPosition[0] - l.wellPosition[0], l.septicPosition[1] - l.wellPosition[1]), 1)} m (NBR 7229 pede ao menos 15 m)`]);
  } else rows.push(['Posição da fossa', 'não locada']);
  return {
    fileName: 'ficha-fossa-vigilancia-sanitaria.pdf',
    title: 'Ficha para a vigilância sanitária / prefeitura (fossa)',
    subtitle: 'Tanque séptico e disposição final do esgoto',
    header: headerFor(project, 'plumbing'),
    blocks: [{ t: 'kv', rows }],
    notice: APPROVAL_NOTICE,
  };
}

export function permitDoc(project: Project, ap: ApprovalReport): DocSpec {
  const l = project.legal;
  const u = ap.urban;
  const rows: [string, string][] = [
    ['Proprietário', `${dash(l.owner.name)} · ${dash(l.owner.doc)}`],
    ['Endereço da obra', dash(siteAddressLine(project))],
    ['Matrícula / cartório', `${dash(l.address.registry)} / ${dash(l.address.registryOffice)}`],
    ['Inscrição cadastral', dash(l.address.cadastral)],
    ['Lote / quadra / loteamento', `${dash(l.address.lot)} / ${dash(l.address.block)} / ${dash(l.address.subdivision)}`],
    ['Zona', dash(l.zoning.zone)],
    ['Área do lote', u ? `${n2(u.lotArea)} m²` : 'não informada'],
    ['Área construída', `${n2(ap.areas.totalBuilt)} m²`],
    ['Área útil', `${n2(ap.areas.totalUseful)} m²`],
    ['Taxa de ocupação', u ? `${n2(u.occupancyPct, 1)} %${l.zoning.maxOccupancyPct !== undefined ? ` (máx. ${n2(l.zoning.maxOccupancyPct, 1)} %)` : ''}` : '—'],
    ['Coeficiente de aproveitamento', u ? `${n2(u.far)}${l.zoning.maxFar !== undefined ? ` (máx. ${n2(l.zoning.maxFar)})` : ''}` : '—'],
    ['Taxa de permeabilidade', u ? `${n2(u.permeablePct, 1)} %${l.zoning.minPermeablePct !== undefined ? ` (mín. ${n2(l.zoning.minPermeablePct, 1)} %)` : ''}` : '—'],
    ['Pavimentos / altura', u ? `${u.floors} / ${n2(u.height)} m` : '—'],
  ];
  const profs = l.professionals.map((p) => [p.name, `${p.council} ${dash(p.registry)}${p.uf ? `/${p.uf}` : ''}`, p.disciplines.map((d) => DISCIPLINE_LABEL[d]).join(', '), p.docNumber ? `${p.council === 'CAU' ? 'RRT' : 'ART'} ${p.docNumber}` : '(a emitir)']);
  return {
    fileName: 'ficha-requerimento-alvara.pdf',
    title: 'Ficha do requerimento de alvará',
    subtitle: 'Dados para o protocolo na prefeitura',
    header: headerFor(project, 'architecture'),
    blocks: [
      { t: 'kv', rows },
      { t: 'h', text: 'Responsáveis técnicos' },
      profs.length > 0 ? { t: 'table', head: ['Nome', 'Registro', 'Disciplinas', 'ART/RRT'], rows: profs } : { t: 'p', text: 'Nenhum responsável técnico cadastrado.' },
    ],
    notice: ap.disclaimer || APPROVAL_NOTICE,
  };
}
