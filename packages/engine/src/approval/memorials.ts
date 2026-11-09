import type { Catalog } from '@chalecad/catalog';
import type { Project } from '../schema/project';
import type { AreaTable, Memorial, MemorialSection, Results, UrbanIndices } from '../schema/results';
import { DISCLAIMER } from '../schema/results';
import { isFilled, nf, normOf } from './common';

const USE_LABEL: Record<string, string> = {
  living: 'sala', kitchen: 'cozinha', bedroom: 'quarto', bathroom: 'banheiro', laundry: 'lavanderia', circulation: 'circulação', storage: 'depósito', other: 'outro',
};
const OPENING_LABEL: Record<string, string> = { door: 'porta', window: 'janela', sliding_door: 'porta de correr', skylight: 'claraboia' };
const TYPOLOGY_LABEL: Record<string, string> = {
  gable_mezzanine: 'duas águas com mezanino', a_frame: 'A-frame', shed: 'meia-água', flat_roof: 'cobertura plana com platibanda', gambrel: 'celeiro (gambrel)', combined: 'módulos combinados em L/T',
};
const STATUS_LABEL = { ok: 'conforme', warn: 'atenção', fail: 'não conforme' } as const;

const matName = (catalog: Catalog, id: string | undefined) => (id ? catalog.materials.find((m) => m.id === id)?.name : undefined);
const norm = (catalog: Catalog, id: string, code?: string) => normOf(catalog, id, code).label;

export function computeMemorials(project: Project, results: Results, catalog: Catalog, urban: UrbanIndices | null, areas: AreaTable): Memorial[] {
  const out: Memorial[] = [architecture(project, results, catalog, urban, areas), structure(project, results, catalog), foundation(project, results, catalog)];
  const el = electrical(project, results, catalog);
  if (el) out.push(el);
  const pl = plumbing(project, results, catalog);
  if (pl) out.push(pl);
  out.push(performance(project, results, catalog));
  return out;
}

function architecture(project: Project, results: Results, catalog: Catalog, urban: UrbanIndices | null, areas: AreaTable): Memorial {
  const l = project.legal;
  const t = project.typology;
  const model = results.model;
  const sections: MemorialSection[] = [];

  const addr = [l.address.street, l.address.number, l.address.district, l.address.city].filter(isFilled).join(', ');
  sections.push({
    title: 'Identificação',
    paragraphs: [
      `Projeto: ${project.meta.name}.`,
      `Proprietário: ${isFilled(l.owner.name) ? l.owner.name : 'a informar'}.`,
      `Endereço da obra: ${addr || 'a informar'}${isFilled(l.address.registry) ? `. Matrícula ${l.address.registry}` : ''}.`,
      `Uso: residência unifamiliar, tipologia ${TYPOLOGY_LABEL[t.kind] ?? t.kind}.`,
    ],
  });

  const terrain: string[] = [];
  if (urban && l.lot) {
    terrain.push(`Lote de ${nf(urban.lotArea, 1)} m² (testada ${nf(l.lot.front, 2)} m, profundidade ${nf(l.lot.depth, 2)} m).`);
    terrain.push(`Projeção da edificação: ${nf(urban.footprintArea, 1)} m², taxa de ocupação de ${nf(urban.occupancyPct, 1)}%.`);
    terrain.push(`Área construída computável: ${nf(urban.builtArea, 1)} m², coeficiente de aproveitamento ${nf(urban.far)}.`);
    terrain.push(`Taxa de permeabilidade de ${nf(urban.permeablePct, 1)}% (${nf(urban.permeableArea, 1)} m² permeáveis).`);
    terrain.push(`Recuos: frente ${nf(urban.setbacks.front)} m, fundos ${nf(urban.setbacks.back)} m, laterais ${nf(urban.setbacks.left)} m e ${nf(urban.setbacks.right)} m.`);
    terrain.push(`Altura máxima da edificação: ${nf(urban.height)} m, ${urban.floors} pavimento(s).`);
  } else terrain.push('Lote não informado: os índices urbanísticos não foram calculados.');
  if (isFilled(l.zoning.zone)) terrain.push(`Zona: ${l.zoning.zone}${isFilled(l.zoning.source) ? ` (${l.zoning.source})` : ''}.`);
  terrain.push(...(urban?.notes ?? []));
  sections.push({ title: 'Terreno e parâmetros urbanísticos', paragraphs: terrain });

  sections.push({
    title: 'Programa',
    paragraphs: [`Área construída total de ${nf(areas.totalBuilt, 1)} m² e área útil de ${nf(areas.totalUseful, 1)} m².`],
    table: {
      head: ['Pavimento', 'Cômodo', 'Uso', 'Área (m²)', 'Perímetro (m)'],
      rows: areas.rooms.filter((r) => r.use).map((r) => [r.levelName, r.name, USE_LABEL[r.use!] ?? r.use!, nf(r.area), r.perimeter === undefined ? '' : nf(r.perimeter)]),
    },
  });

  const sys = project.system;
  const wood = sys.structure === 'wood';
  const asm = (id: string) => catalog.assemblies.find((a) => a.id === id)?.name ?? id;
  const opens = new Map<string, number>();
  for (const o of project.openings) opens.set(o.type, (opens.get(o.type) ?? 0) + 1);
  const finishes: string[] = [];
  const f = project.finishes;
  if (f.facade) finishes.push(`Fachada: ${matName(catalog, f.facade) ?? f.facade}.`);
  if (f.interiorRoof) finishes.push(`Face interna das águas: ${matName(catalog, f.interiorRoof) ?? f.interiorRoof}.`);
  for (const r of project.rooms) {
    const parts = [r.floor ? `piso ${matName(catalog, r.floor) ?? r.floor}` : '', r.walls ? `paredes ${matName(catalog, r.walls) ?? r.walls}` : ''].filter(Boolean);
    if (parts.length) finishes.push(`${r.name ?? USE_LABEL[r.use]}: ${parts.join('; ')}.`);
  }
  const pitch = 'roofPitchDeg' in t ? `, inclinação de ${nf(t.roofPitchDeg, 0)}°` : model.roofPlanes[0] ? `, inclinação de ${nf(model.roofPlanes[0].slopeDeg, 0)}°` : '';
  sections.push({
    title: 'Sistema construtivo',
    paragraphs: [
      `Fundação: radier de concreto armado com espessura de ${nf(sys.foundation.thickness * 100, 0)} cm e viga de borda de ${nf(sys.foundation.edgeBeamDepth * 100, 0)} cm.`,
      wood
        ? `Estrutura: wood frame em madeira serrada tratada, montantes a cada ${nf(sys.studSpacing * 100, 0)} cm.`
        : `Estrutura: light steel frame, perfis de aço formados a frio, montantes a cada ${nf(sys.studSpacing * 100, 0)} cm.`,
      `Fechamento externo: ${asm(sys.assemblies.exterior)}. Divisórias internas: ${asm(sys.assemblies.interior)}. Áreas molhadas: ${asm(sys.assemblies.wet)}.`,
      'Isolamento térmico e acústico: lã mineral nas paredes, conforme a composição de cada fechamento.',
      `Cobertura: ${matName(catalog, project.roof.cladding) ?? project.roof.cladding}${pitch}${project.roof.gutters ? ', com calhas' : ''}.`,
      `Esquadrias: ${opens.size ? [...opens].map(([k, n]) => `${n} ${OPENING_LABEL[k] ?? k}${n > 1 && !k.includes('door') ? 's' : ''}`).join(', ') : 'nenhuma informada'}.`,
      ...(finishes.length ? finishes : ['Acabamentos: não especificados no projeto.']),
    ],
  });

  const inst = results.installations;
  sections.push({
    title: 'Instalações',
    paragraphs: inst
      ? [
          `Instalações elétricas: ${inst.electrical ? `${inst.electrical.circuits.length} circuito(s), carga instalada de ${nf(inst.electrical.installedKw, 1)} kW e demanda de ${nf(inst.electrical.demandKw, 1)} kW` : 'estimadas'}.`,
          `Instalações hidrossanitárias: reservatório de ${nf(inst.tankLiters, 0)} L${inst.plumbing?.septic ? ` e fossa séptica de ${nf(inst.plumbing.septic.tankLiters, 0)} L` : ''}.`,
        ]
      : ['Instalações elétricas e hidrossanitárias não incluídas neste projeto.'],
  });

  const perf = results.performance;
  const perfP: string[] = [];
  if (perf) {
    for (const th of perf.thermal) perfP.push(`${th.label}: transmitância térmica U = ${nf(th.U)} W/m²·K (limite ${nf(th.limitU)}), ${th.okU ? 'atende' : 'não atende'}.`);
    perfP.push(`Zona bioclimática ${perf.zone} (NBR 15220-3).`);
  } else perfP.push('Desempenho térmico não calculado.');
  sections.push({ title: 'Desempenho', paragraphs: perfP });

  return {
    id: 'architecture', discipline: 'architecture', kind: 'descriptive', title: 'Memorial descritivo de arquitetura',
    norms: [norm(catalog, 'nbr6492'), norm(catalog, 'nbr16636'), norm(catalog, 'nbr15575'), norm(catalog, 'municipal')],
    sections,
  };
}

function structure(project: Project, results: Results, catalog: Catalog): Memorial {
  const st = results.structure;
  const c = catalog.constants;
  const wood = project.system.structure === 'wood';
  const sections: MemorialSection[] = [];
  sections.push({
    title: 'Sistema estrutural',
    paragraphs: [
      wood
        ? 'Estrutura em wood frame: painéis de madeira serrada tratada, contraventados por placas de OSB, apoiados em radier.'
        : 'Estrutura em light steel frame: painéis de perfis de aço formados a frio, contraventados por placas de OSB ou fitas, apoiados em radier.',
      `Peso total estimado da edificação: ${nf(results.weight.totalKg, 0)} kg (${nf(results.weight.superstructureKg, 0)} kg de superestrutura).`,
    ],
  });
  sections.push({
    title: 'Normas',
    paragraphs: [wood ? `${norm(catalog, 'nbr7190')}.` : `${norm(catalog, 'nbr16970', 'ABNT NBR 16970-2')}; ${norm(catalog, 'nbr14762')}; ${norm(catalog, 'nbr15253')}.`, `Ações: ${norm(catalog, 'nbr6120')}; ${norm(catalog, 'nbr6123')}; ${norm(catalog, 'nbr8681')}.`],
  });

  const prof = project.system.profiles;
  const used = [...new Set([prof.wallStud, prof.wallTrack, prof.gableStud, prof.joist, prof.rafter, prof.purlin].filter((x): x is string => !!x))];
  const rows = used.map((id) => {
    const p = catalog.profiles.find((x) => x.id === id);
    return p ? [id, p.name, `${nf(p.web, 0)}×${nf(p.flange, 0)} mm`, `${nf(p.thickness, 2)} mm`, wood ? (p.woodClass ?? '') : `${nf(p.fy, 0)} MPa`] : [id, '', '', '', ''];
  });
  sections.push({
    title: 'Materiais',
    paragraphs: [
      wood ? 'Madeira de pinus autoclavado, classe de resistência conforme a tabela.' : `Aço estrutural ZAR 230 (fy = ${nf(used.map((id) => catalog.profiles.find((x) => x.id === id)?.fy ?? 230)[0] ?? 230, 0)} MPa), módulo de elasticidade ${nf(c.steelE, 0)} MPa, revestimento zincado.`,
      'Fechamento estrutural: placas de OSB e placas cimentícias, conforme as composições das paredes.',
    ],
    table: { head: ['Perfil', 'Nome', 'Seção', 'Espessura', wood ? 'Classe' : 'fy'], rows },
  });

  if (st) {
    const L = st.loads;
    sections.push({
      title: 'Ações',
      paragraphs: [`Coeficientes de ponderação: γg = ${nf(c.loads.gammaG, 1)}, γq = ${nf(c.loads.gammaQ, 1)}, γw = ${nf(c.loads.gammaW, 1)}. Vento: V0 = ${nf(project.design.windV0, 0)} m/s, categoria de terreno ${project.design.terrainCategory}.`],
      table: {
        head: ['Ação', 'Valor (kPa)'],
        rows: [
          ['Permanente da cobertura', nf(L.deadRoofKPa)], ['Sobrecarga da cobertura', nf(L.liveRoofKPa)],
          ['Permanente do piso do mezanino', nf(L.deadFloorKPa)], ['Sobrecarga do piso do mezanino', nf(L.liveFloorKPa)],
          ['Pressão dinâmica do vento', nf(L.windQKPa)], ['Vento nas paredes', nf(L.windWallKPa)], ['Sucção do vento na cobertura', nf(L.windRoofUpliftKPa)],
        ],
      },
    });
    sections.push({
      title: 'Combinações',
      paragraphs: ['ELU: 1,4·G + 1,5·Q (+ vento como ação variável principal ou secundária). ELS: G + Q para flechas.', `Limites de flecha: piso L/${c.deflection.floor}, cobertura L/${c.deflection.roof}, vergas L/${c.deflection.header}.`],
    });
    const kinds = [...new Set(st.checks.filter((k) => k.kind !== 'soil').map((k) => k.kind))];
    sections.push({
      title: 'Verificações',
      paragraphs: [`${st.summary.ok} verificação(ões) conforme(s), ${st.summary.warn} em atenção e ${st.summary.fail} não conforme(s). Taxa máxima de uso: ${nf(st.summary.maxRatio)}.`],
      table: {
        head: ['Tipo', 'Pior elemento', 'Demanda', 'Capacidade', 'Taxa', 'Situação'],
        rows: kinds.map((k) => {
          const w = st.checks.filter((x) => x.kind === k).reduce((a, b) => (b.ratio > a.ratio ? b : a));
          return [k, w.label, `${nf(w.demand)} ${w.unit}`, `${nf(w.capacity)} ${w.unit}`, nf(w.ratio), STATUS_LABEL[w.status]];
        }),
      },
    });
  }
  sections.push({
    title: 'Reações e peso na fundação',
    paragraphs: [
      `A superestrutura descarrega ${nf(results.weight.superstructureKg, 0)} kg (${nf((results.weight.superstructureKg * 9.80665) / 1000, 1)} kN) sobre o radier, distribuídos pelas paredes portantes.`,
      `Peso total com fundação: ${nf(results.weight.totalKg, 0)} kg (${nf(results.weight.kgPerM2, 0)} kg/m²).`,
    ],
  });
  sections.push({
    title: 'Premissas e limitações',
    paragraphs: [
      'Pré-dimensionamento automático: o responsável deve verificar ligações, estabilidade global e detalhes.',
      'As verificações consideram montantes, vigas, caibros, vergas, contraventamento e ancoragens com cargas do catálogo e vão simples.',
      'Ligações, parafusos, hold-downs, pórticos de A-frame e efeitos de segunda ordem não são verificados.',
      DISCLAIMER,
    ],
  });
  return {
    id: 'structure', discipline: 'structure', kind: 'calculation', title: 'Memorial de cálculo estrutural',
    norms: wood
      ? [norm(catalog, 'nbr7190'), norm(catalog, 'nbr6120'), norm(catalog, 'nbr6123'), norm(catalog, 'nbr8681')]
      : [norm(catalog, 'nbr16970', 'ABNT NBR 16970-2'), norm(catalog, 'nbr14762'), norm(catalog, 'nbr15253'), norm(catalog, 'nbr6120'), norm(catalog, 'nbr6123'), norm(catalog, 'nbr8681')],
    sections,
  };
}

function foundation(project: Project, results: Results, catalog: Catalog): Memorial {
  const f = project.system.foundation;
  const soil = results.structure?.checks.find((k) => k.kind === 'soil');
  const s = project.legal.soil;
  const sections: MemorialSection[] = [
    {
      title: 'Radier',
      paragraphs: [
        `Radier de concreto armado com espessura de ${nf(f.thickness * 100, 0)} cm, borda de ${nf(f.border * 100, 0)} cm além das paredes e viga de borda de ${nf(f.edgeBeamDepth * 100, 0)} cm de profundidade.`,
        `Área do radier: ${nf(results.quantities.areas.radier, 1)} m².`,
      ],
    },
    {
      title: 'Solo',
      paragraphs: [
        `Tensão admissível adotada: ${nf(project.design.soilBearingKPa, 0)} kPa (${s.source === 'assumed' ? 'admitida, sem sondagem' : s.source === 'spt' ? `sondagem SPT, ${s.boreholes} furo(s)` : 'outra fonte'}${isFilled(s.reference) ? `; ${s.reference}` : ''}).`,
        ...(s.waterTableDepth !== undefined ? [`Nível d'água a ${nf(s.waterTableDepth, 1)} m de profundidade.`] : []),
      ],
    },
    {
      title: 'Pressão de contato',
      paragraphs: soil ? [`Pressão média de contato de ${nf(soil.demand)} kPa contra ${nf(soil.capacity, 0)} kPa admissíveis (taxa ${nf(soil.ratio)}). ${soil.detail}.`] : ['Verificação do solo não calculada.'],
    },
    {
      title: 'Recomendação de sondagem',
      paragraphs: [
        s.source === 'spt' && s.boreholes > 0
          ? 'Conferir o laudo da sondagem e a tensão admissível adotada.'
          : `Executar sondagem de simples reconhecimento com SPT (${norm(catalog, 'nbr6484')}; ${norm(catalog, 'nbr8036')}) antes da execução e confirmar a tensão admissível.`,
      ],
    },
  ];
  return {
    id: 'foundation', discipline: 'foundation', kind: 'calculation', title: 'Memorial de cálculo da fundação',
    norms: [norm(catalog, 'nbr6122'), norm(catalog, 'nbr6118'), norm(catalog, 'nbr6484'), norm(catalog, 'nbr8036')], sections,
  };
}

function electrical(project: Project, results: Results, catalog: Catalog): Memorial | null {
  const e = results.installations?.electrical;
  if (!e) return null;
  const k = catalog.constants.electrical;
  const sections: MemorialSection[] = [
    {
      title: 'Carga e demanda',
      paragraphs: [
        `Carga instalada de ${nf(e.installedKw, 1)} kW e demanda de ${nf(e.demandKw, 1)} kW, tensão de ${nf(e.voltage, 0)} V.`,
        `Padrão de entrada: ${e.entrance.category}, ${e.entrance.phases} fase(s), disjuntor geral de ${nf(e.entrance.breakerA, 0)} A, cabo de ${nf(e.entrance.cableMm2, 0)} mm². Confirmar com a concessionária${isFilled(project.legal.powerUtility) ? ` (${project.legal.powerUtility})` : ''}.`,
      ],
    },
    {
      title: 'Critérios',
      paragraphs: [
        `Seção mínima de ${nf(k.minSection.lighting, 1)} mm² na iluminação e ${nf(k.minSection.power, 1)} mm² nas tomadas.`,
        `Queda de tensão máxima de ${nf(k.voltageDrop.totalMaxPct, 0)}% no total e ${nf(k.voltageDrop.terminalMaxPct, 0)}% nos circuitos terminais.`,
        `Capacidade de corrente com fatores de agrupamento (FCA) e de temperatura (FCT, ambiente de ${nf(project.installations.electrical.ambientTemp, 0)} °C). Ib ≤ In ≤ Iz.`,
      ],
    },
    {
      title: 'Circuitos',
      paragraphs: [`${e.circuits.length} circuito(s) no quadro de ${e.panel.ways} vias (${e.panel.reserves} de reserva).`],
      table: {
        head: ['Circuito', 'Potência (VA)', 'Ib (A)', 'Seção (mm²)', 'Disjuntor', 'FCA', 'FCT', 'Queda (%)'],
        rows: e.circuits.map((c) => [c.name, nf(c.powerVA, 0), nf(c.ib), nf(c.sectionMm2, 1), `${c.curve}${nf(c.breakerA, 0)} A`, nf(c.fca), nf(c.fct), nf(c.totalDropPct)]),
      },
    },
    {
      title: 'Proteção',
      paragraphs: [
        `DR de ${nf(k.dr.sensitivityMa, 0)} mA: ${e.panel.drs.length} dispositivo(s), nas áreas molhadas e demais circuitos exigidos.`,
        `DPS com Uc ${nf(e.panel.dps.ucV, 0)} V e In ${nf(e.panel.dps.inKa, 0)} kA.`,
      ],
    },
    { title: 'Aterramento', paragraphs: [`Esquema ${project.legal.earthing}. Eletrodo de aterramento e condutor de proteção (PE) em todos os circuitos; confirmar o esquema com a concessionária.`] },
  ];
  return { id: 'electrical', discipline: 'electrical', kind: 'calculation', title: 'Memorial de cálculo das instalações elétricas', norms: [norm(catalog, 'nbr5410'), norm(catalog, 'nbr14136')], sections };
}

function plumbing(project: Project, results: Results, catalog: Catalog): Memorial | null {
  const p = results.installations?.plumbing;
  if (!p) return null;
  const sections: MemorialSection[] = [
    {
      title: 'Consumo e reservatório',
      paragraphs: [`${p.tank.occupants} morador(es), consumo diário de ${nf(p.tank.dailyLiters, 0)} L e reservatório de ${nf(p.tank.liters, 0)} L (${nf(catalog.constants.plumbing.water.reservoir.reserveDays, 0)} dias de reserva).`],
    },
    {
      title: 'Água fria e quente',
      paragraphs: ['Dimensionamento pelo método dos pesos relativos, com vazão provável e perda de carga pela fórmula de Fair-Whipple-Hsiao.', `Pressão dinâmica mínima de ${nf(catalog.constants.plumbing.water.minDynamicKpa.default, 0)} kPa nos pontos.`],
      table: {
        head: ['Ponto', 'Aparelho', 'Sistema', 'Pressão (kPa)', 'Mínimo (kPa)', 'Situação'],
        rows: p.water.points.map((w) => [w.pointId, w.fixture, w.system === 'hot' ? 'quente' : 'fria', nf(w.dynamicKpa, 1), nf(w.minKpa, 0), w.ok ? 'atende' : 'não atende']),
      },
    },
    {
      title: 'Esgoto',
      paragraphs: [`${nf(p.sewer.totalUhc, 0)} UHC no total. Ramais com declividade mínima de ${nf(catalog.constants.plumbing.sewer.slopeMin.upTo75 * 100, 0)}% (até DN 75) e ${nf(catalog.constants.plumbing.sewer.slopeMin.from100 * 100, 0)}% (DN 100).`],
    },
    { title: 'Ventilação', paragraphs: [p.sewer.vented ? 'Sistema de ventilação previsto, com terminal acima da cobertura.' : 'Sistema de ventilação não previsto: revisar.'] },
    {
      title: 'Fossa séptica',
      paragraphs: p.septic
        ? [`Tanque séptico de ${nf(p.septic.tankLiters, 0)} L para contribuição de ${nf(p.septic.contributionLpd, 0)} L/dia por pessoa.`, 'Dimensionado pela NBR 7229 (legado); conferir pela NBR 17076:2024, que a substituiu.']
        : ['Esgoto ligado à rede pública.'],
    },
  ];
  return { id: 'plumbing', discipline: 'plumbing', kind: 'calculation', title: 'Memorial de cálculo das instalações hidrossanitárias', norms: [norm(catalog, 'nbr5626'), norm(catalog, 'nbr8160'), norm(catalog, 'nbr17076'), norm(catalog, 'nbr10844')], sections };
}

function performance(project: Project, results: Results, catalog: Catalog): Memorial {
  const perf = results.performance;
  const sections: MemorialSection[] = [];
  if (perf) {
    sections.push({
      title: 'Desempenho térmico',
      paragraphs: [`Zona bioclimática ${perf.zone} (${perf.zoneSource === 'project' ? 'informada no projeto' : 'da capital do estado'}).`],
      table: {
        head: ['Elemento', 'U (W/m²·K)', 'Limite U', 'CT (kJ/m²·K)', 'Absortância', 'Situação'],
        rows: perf.thermal.map((t) => [t.label, nf(t.U), nf(t.limitU), nf(t.CT, 0), nf(t.alpha), t.okU && t.okCT ? 'atende' : 'não atende']),
      },
    });
  }
  sections.push({
    title: 'Declaração parcial',
    paragraphs: [
      'Declaração parcial de desempenho: apenas os dados calculados pelo programa foram apresentados.',
      'O responsável completa: desempenho estrutural, segurança ao fogo, estanqueidade, desempenho acústico, lumínico, durabilidade e manutenibilidade, conforme a NBR 15575.',
    ],
  });
  return { id: 'performance', discipline: 'architecture', kind: 'calculation', title: 'Declaração de desempenho (NBR 15575)', norms: [norm(catalog, 'nbr15575'), norm(catalog, 'nbr15220')], sections };
}
