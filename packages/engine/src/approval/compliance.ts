import type { Catalog } from '@chalecad/catalog';
import { pointInPolygon } from '../geometry';
import { roomVentilation } from '../model/rooms';
import type { Discipline, Project } from '../schema/project';
import type { ComplianceItem, ComplianceStatus, EngineWarning, Results, StructuralCheck, UrbanIndices } from '../schema/results';
import { DISCLAIMER } from '../schema/results';
import { nf, normOf, normsJoin, STATUS_RANK, type NormInfo, isFilled } from './common';
import { professionalFor } from './missing';
import { buildingInLot, lotBoundarySegments, lotPolygon, minDistance } from './urban';

const PENDING = 'pendente de conferência profissional (edição/critério a conferir).';
const EPS = 1e-9;

interface Draft {
  id: string;
  discipline: Discipline;
  norm: NormInfo;
  clause?: string;
  title: string;
  criterion: string;
  status: ComplianceStatus;
  value?: string;
  limit?: string;
  detail?: string;
  refs?: string[];
  source: ComplianceItem['source'];
  needs?: string[];
  /** Limite informado pelo usuário (zoneamento): o cálculo é exato e a regra de ouro não se aplica. */
  exact?: boolean;
}

/** Resultado de um grupo de avisos do motor: pior severidade, referências e mensagens. */
function fromWarnings(ws: EngineWarning[], infoAs: ComplianceStatus = 'manual') {
  const status: ComplianceStatus = ws.some((w) => w.severity === 'error')
    ? 'fail'
    : ws.some((w) => w.severity === 'warn')
      ? 'warn'
      : ws.length > 0
        ? infoAs
        : 'ok';
  const refs = [...new Set(ws.flatMap((w) => w.refs ?? []))];
  const detail = ws.map((w) => w.message).join(' ');
  return { status, refs, detail: detail || undefined };
}

const worstStatus = (a: ComplianceStatus, b: ComplianceStatus) => (STATUS_RANK[b] > STATUS_RANK[a] ? b : a);

export function computeCompliance(project: Project, results: Results, catalog: Catalog, urban: UrbanIndices | null): ComplianceItem[] {
  const { model, warnings } = results;
  const c = catalog.constants;
  const nm = c.norms;
  const zoning = project.legal.zoning;
  const reviews = project.legal.reviews;
  const items: ComplianceItem[] = [];

  const push = (d: Draft) => {
    let { status, detail } = d;
    // Regra de ouro: norma com edição/conteúdo a conferir nunca vira "ok" sozinha.
    if (status === 'ok' && !d.norm.confirmed && !d.exact) {
      status = 'manual';
      detail = detail ? `${PENDING} ${detail}` : PENDING;
    }
    const item: ComplianceItem = {
      id: d.id,
      discipline: d.discipline,
      norm: d.norm.label,
      title: d.title,
      criterion: d.criterion,
      status,
      refs: d.refs ?? [],
      source: d.source,
    };
    if (d.clause) item.clause = d.clause;
    if (d.value !== undefined) item.value = d.value;
    if (d.limit !== undefined) item.limit = d.limit;
    if (detail) item.detail = detail;
    if (d.needs) item.needs = d.needs;
    const rv = reviews[d.id];
    if (rv) item.review = rv;
    items.push(item);
  };
  const warnBy = (pred: (code: string) => boolean) => warnings.filter((w) => pred(w.code));

  const nMunicipal = normOf(catalog, 'municipal');
  const n15575 = normOf(catalog, 'nbr15575');

  // ---------------------------------------------------------------- Arquitetura e código de obras
  for (const r of model.rooms) {
    if (!r.polygon) continue;
    const rule = nm.rooms[r.use]!;
    const permanence = rule.light;
    const internal = rule.ceiling;
    const avg = r.ceiling.avg;
    let status: ComplianceStatus;
    let limit: number;
    let detail: string | undefined;
    const needs: string[] = [];
    let exact = false;
    if (permanence && zoning.minCeiling !== undefined) {
      limit = zoning.minCeiling;
      status = avg + EPS >= limit ? 'ok' : 'fail';
      exact = true;
    } else if (permanence) {
      limit = internal;
      status = avg + EPS >= internal ? 'missing' : 'warn';
      needs.push('legal.zoning.minCeiling');
      detail = `Pé-direito mínimo do código de obras não informado. Critério interno (NBR 15575): ${nf(internal)} m${avg + EPS >= internal ? ', atendido' : ', não atendido'}.`;
    } else {
      limit = internal;
      status = avg + EPS >= internal ? 'ok' : 'warn';
      detail = 'Ambiente de permanência transitória: critério interno (NBR 15575).';
    }
    if (r.ceiling.max - r.ceiling.min > 0.05) detail = `${detail ?? ''} Teto inclinado: mínimo ${nf(r.ceiling.min)} m, máximo ${nf(r.ceiling.max)} m; alguns códigos aceitam a média.`.trim();
    push({
      id: `arch.ceiling.${r.id}`, discipline: 'architecture', norm: permanence ? nMunicipal : n15575, title: `Pé-direito: ${r.name}`,
      criterion: 'Pé-direito médio igual ou maior que o mínimo do código de obras', status, value: `${nf(avg)} m`, limit: `${nf(limit)} m`,
      detail, refs: [r.id], source: 'rule', needs: needs.length ? needs : undefined, exact,
    });
  }

  for (const r of model.rooms) {
    if (!r.polygon) continue;
    const rule = nm.rooms[r.use]!;
    if (rule.light) {
      const w = warnBy((k) => k === 'room.lighting').filter((x) => x.refs?.includes(r.id));
      const wr = fromWarnings(w, 'warn');
      const frac = r.glazing > 0 ? r.area / r.glazing : Infinity;
      push({
        id: `arch.lighting.${r.id}`, discipline: 'architecture', norm: nMunicipal, title: `Iluminação natural: ${r.name}`,
        criterion: `Área de vidro de pelo menos 1/${nf(1 / nm.lightRatio, 0)} da área do piso`, status: wr.status,
        value: `${nf(r.glazing)} m² de vidro (1/${Number.isFinite(frac) ? nf(frac, 1) : '∞'} do piso)`, limit: `${nf(r.area * nm.lightRatio)} m² (1/${nf(1 / nm.lightRatio, 0)})`,
        detail: `Fração usada: 1/${nf(1 / nm.lightRatio, 0)} (iluminação) e 1/${nf(1 / nm.ventRatio, 0)} (ventilação), valores usuais do catálogo; conferir a fração do código de obras do município.${wr.detail ? ' ' + wr.detail : ''}`,
        refs: [r.id], source: 'warning',
      });
    }
    if (rule.vent) {
      const w = warnBy((k) => k === 'room.ventilation').filter((x) => x.refs?.includes(r.id));
      const wr = fromWarnings(w, 'warn');
      const open = roomVentilation(r, model, catalog);
      push({
        id: `arch.ventilation.${r.id}`, discipline: 'architecture', norm: nMunicipal, title: `Ventilação natural: ${r.name}`,
        criterion: `Área que abre de pelo menos 1/${nf(1 / nm.ventRatio, 0)} da área do piso`, status: wr.status,
        value: `${nf(open)} m² que abrem`, limit: `${nf(r.area * nm.ventRatio)} m² (1/${nf(1 / nm.ventRatio, 0)})`,
        detail: `Fração usada: 1/${nf(1 / nm.ventRatio, 0)}; conferir a fração do código de obras do município.${wr.detail ? ' ' + wr.detail : ''}`,
        refs: [r.id], source: 'warning',
      });
    }
    if (rule.minArea > 0) {
      const w = warnBy((k) => k === 'room.area').filter((x) => x.refs?.includes(r.id));
      push({
        id: `arch.area.${r.id}`, discipline: 'architecture', norm: nMunicipal, title: `Área mínima: ${r.name}`,
        criterion: 'Área do cômodo igual ou maior que a mínima usual do código de obras', status: w.length ? 'warn' : 'ok',
        value: `${nf(r.area, 1)} m²`, limit: `${nf(rule.minArea, 1)} m²`, detail: w.length ? w.map((x) => x.message).join(' ') : undefined,
        refs: [r.id], source: 'warning',
      });
    }
  }

  // Guarda-corpo dos níveis elevados
  const nGuard = normOf(catalog, 'nbr14718');
  for (const l of project.levels) {
    if (!l.polygon || l.elevation <= 0) continue;
    push({
      id: `arch.guardrail.${l.id}`, discipline: 'architecture', norm: nGuard, title: `Guarda-corpo: ${l.name ?? l.id}`,
      criterion: `Guarda-corpo de ${nf(nm.guardrailHeight)} m, vãos de no máximo ${nf(nm.guardrailMaxGap * 100, 0)} cm`,
      status: l.guardrail ? 'ok' : 'warn', value: l.guardrail ? 'previsto' : 'ausente', limit: `${nf(nm.guardrailHeight)} m`,
      detail: l.guardrail ? 'O modelo indica o guarda-corpo; conferir o detalhe e os vãos.' : `Borda livre a ${nf(l.elevation)} m do piso sem guarda-corpo.`,
      refs: [`slab-${l.id}`], source: 'rule',
    });
  }

  // Escadas
  const nStair = normOf(catalog, 'nbr9077');
  for (const st of model.stairs) {
    const wsStair = warnings.filter((w) => w.code.startsWith('stair.') && w.refs?.includes(st.id));
    const wr = fromWarnings(wsStair, 'warn');
    push({
      id: `arch.stair.geometry.${st.id}`, discipline: 'architecture', norm: nStair, title: `Escada ${st.id}: espelho e piso`,
      criterion: `Espelho até ${nf(c.stairs.maxRiser * 100, 1)} cm e fórmula de Blondel entre ${nf(c.stairs.blondelMin * 100, 0)} e ${nf(c.stairs.blondelMax * 100, 0)} cm`,
      status: wr.status, value: `espelho ${nf(st.riser * 100, 1)} cm, Blondel ${nf(st.blondel * 100, 1)} cm`, limit: `${nf(c.stairs.maxRiser * 100, 1)} cm`,
      detail: wr.detail, refs: [st.id], source: 'warning',
    });
    const hw = warnings.filter((w) => w.code === 'norm.stair_headroom' && w.refs?.includes(st.id));
    const hr = fromWarnings(hw, 'warn');
    push({
      id: `arch.stair.headroom.${st.id}`, discipline: 'architecture', norm: nStair, title: `Escada ${st.id}: altura livre`,
      criterion: `Altura livre mínima de ${nf(nm.stairHeadroom)} m sobre os degraus`, status: hr.status,
      limit: `${nf(nm.stairHeadroom)} m`, detail: hr.detail, refs: [st.id], source: 'warning',
    });
  }
  if (model.stairs.length > 0) {
    push({
      id: 'arch.stair.guard', discipline: 'architecture', norm: nStair, title: 'Escada: corrimão e guarda-corpo do lado aberto',
      criterion: `Corrimão entre ${nf(nm.handrailMin)} e ${nf(nm.handrailMax)} m; guarda-corpo de ${nf(nm.guardrailHeight)} m no lado aberto`,
      status: 'manual', detail: 'O modelo não desenha corrimão nem guarda-corpo da escada; conferir no detalhamento.', refs: model.stairs.map((s) => s.id), source: 'rule',
    });
  }

  // Deck: um item por verificação do deck (guarda-corpo, vãos, pilares, escada, fundação)
  for (const em of model.extras) {
    if (em.kind !== 'deck' || !em.deck) continue;
    for (const k of em.deck.checks) {
      push({
        id: `arch.deck.${em.id}.${k.id}`, discipline: 'architecture', norm: normOf(catalog, k.norm ?? 'nbr7190'), title: `Deck ${em.id}: ${k.label}`,
        criterion: k.label, status: k.status, value: k.value, limit: k.limit, refs: [em.id], source: 'rule',
      });
    }
  }

  // Vidro de segurança
  {
    const sg = warnBy((k) => k === 'norm.safety_glass');
    const wr = fromWarnings(sg, 'manual');
    push({
      id: 'arch.safety_glass', discipline: 'architecture', norm: normOf(catalog, 'nbr7199'), title: 'Vidro de segurança',
      criterion: `Vidro temperado ou laminado em fachada envidraçada e vãos com vidro abaixo de ${nf(nm.safetyGlassSill)} m do piso`,
      status: sg.length ? wr.status : 'na', detail: sg.length ? wr.detail : 'Sem fachada envidraçada nem vidro baixo no modelo.', refs: wr.refs, source: 'warning',
    });
  }

  // Acessibilidade
  push({
    id: 'arch.accessibility', discipline: 'architecture', norm: normOf(catalog, 'nbr9050'), title: 'Acessibilidade (NBR 9050)',
    criterion: 'Atendimento à NBR 9050 quando exigido pelo município', status: 'na',
    detail: 'Residência unifamiliar privada: a NBR 9050 não é exigida nas áreas internas. Conferir se o município exige adaptação do acesso.', refs: [], source: 'rule',
  });

  // ---------------------------------------------------------------- Urbanístico
  if (urban) {
    for (const k of urban.checks) {
      const unit = k.unit === '%' ? '%' : k.unit === 'm' ? ' m' : k.unit === 'pav.' ? ' pav.' : '';
      const d = k.unit === 'pav.' ? 0 : 2;
      const above = k.id === 'permeable' || k.id.startsWith('setback_');
      push({
        id: `urban.${k.id}`, discipline: 'architecture', norm: nMunicipal, title: k.label,
        criterion: above ? 'Valor igual ou maior que o mínimo do zoneamento' : 'Valor igual ou menor que o máximo do zoneamento',
        status: k.status, value: `${nf(k.value, d)}${unit}`, limit: k.limit === undefined ? undefined : `${above ? '≥' : '≤'} ${nf(k.limit, d)}${unit}`,
        detail: k.status === 'missing' ? 'Parâmetro do zoneamento não informado.' : undefined, refs: [],
        source: 'rule', needs: k.status === 'missing' ? [zoningKey(k.id)] : undefined, exact: true,
      });
    }
  }

  // ---------------------------------------------------------------- Estrutura
  const wood = project.system.structure === 'wood';
  const nStruct = wood
    ? normOf(catalog, 'nbr7190')
    : normsJoin(normOf(catalog, 'nbr16970', 'ABNT NBR 16970-2'), normOf(catalog, 'nbr14762'));
  const structure = results.structure;
  const KINDS: StructuralCheck['kind'][] = ['stud', 'joist', 'header', 'bracing', 'anchorage', 'rafter', 'purlin', 'gable_stud'];
  const KIND_TITLE: Record<string, string> = {
    stud: 'Montantes das paredes', joist: 'Vigas do mezanino', header: 'Vergas', bracing: 'Contraventamento', anchorage: 'Ancoragem e hold-downs',
    rafter: 'Caibros do telhado', purlin: 'Terças e cartolas', gable_stud: 'Montantes das empenas',
  };
  if (!structure) {
    push({ id: 'struct.none', discipline: 'structure', norm: nStruct, title: 'Verificação estrutural', criterion: 'Pré-dimensionamento da estrutura', status: 'na', detail: 'Pré-dimensionamento não calculado.', refs: [], source: 'check' });
  } else {
    for (const kind of KINDS) {
      const list = structure.checks.filter((k) => k.kind === kind);
      if (list.length === 0) continue;
      const worst = list.reduce((a, b) => (b.ratio > a.ratio ? b : a));
      const status = list.reduce<ComplianceStatus>((s, k) => worstStatus(s, k.status), 'ok');
      push({
        id: `struct.${kind}`, discipline: 'structure', norm: nStruct, title: KIND_TITLE[kind] ?? kind,
        criterion: `Taxa de uso (demanda ÷ capacidade) até ${nf(c.usage.fail)}; alerta a partir de ${nf(c.usage.warn)}`,
        status, value: `taxa ${nf(worst.ratio)} (${nf(worst.demand)} / ${nf(worst.capacity)} ${worst.unit})`, limit: `≤ ${nf(c.usage.fail)}`,
        detail: `Pior caso: ${worst.label}. ${worst.detail}`, refs: [...worst.hostIds, ...worst.pieceIds].slice(0, 30), source: 'check',
      });
    }
    const L = structure.loads;
    push({
      id: 'struct.loads', discipline: 'structure', norm: normOf(catalog, 'nbr6120'), title: 'Ações permanentes e variáveis',
      criterion: 'Cargas permanentes e sobrecargas conforme a NBR 6120', status: 'manual',
      value: `cobertura ${nf(L.deadRoofKPa)} + ${nf(L.liveRoofKPa)} kPa; piso ${nf(L.deadFloorKPa)} + ${nf(L.liveFloorKPa)} kPa`,
      detail: 'Cargas do catálogo para o pré-dimensionamento; o responsável confirma permanentes, sobrecargas e cargas de equipamentos.', refs: [], source: 'rule',
    });
    push({
      id: 'struct.wind', discipline: 'structure', norm: normOf(catalog, 'nbr6123'), title: 'Vento',
      criterion: 'Velocidade básica V0 pela isopleta do município e categoria de rugosidade do terreno', status: 'manual',
      value: `V0 ${nf(project.design.windV0, 0)} m/s, categoria ${project.design.terrainCategory}; q = ${nf(L.windQKPa)} kPa`,
      detail: 'Confirmar V0 pela isopleta do município e a categoria do terreno.', refs: [], source: 'rule',
    });
    push({
      id: 'struct.combinations', discipline: 'structure', norm: normOf(catalog, 'nbr8681'), title: 'Combinações de ações',
      criterion: 'Combinações últimas e de serviço', status: 'manual',
      value: `γg ${nf(c.loads.gammaG, 1)}, γq ${nf(c.loads.gammaQ, 1)}, γw ${nf(c.loads.gammaW, 1)}`,
      detail: 'Coeficientes do catálogo; o responsável confere as combinações adotadas.', refs: [], source: 'rule',
    });
  }
  push({
    id: 'struct.coating', discipline: 'structure', norm: wood ? normOf(catalog, 'nbr7190') : normOf(catalog, 'nbr15253'),
    title: wood ? 'Tratamento da madeira' : 'Revestimento do aço', criterion: wood ? 'Madeira tratada contra fungos e insetos (autoclave)' : 'Revestimento zincado (Z275 ou equivalente) dos perfis',
    status: 'manual', detail: wood ? 'Especificar o tratamento e a classe de uso da madeira.' : 'Especificar a massa do revestimento de zinco conforme a agressividade do ambiente.', refs: [], source: 'rule',
  });
  push({
    id: 'struct.interfaces', discipline: 'structure', norm: wood ? normOf(catalog, 'nbr7190') : normOf(catalog, 'nbr16970', 'ABNT NBR 16970-3'),
    title: 'Interfaces e ligações', criterion: 'Ligações, fundação, vedações e instalações compatíveis com a estrutura', status: 'manual',
    detail: 'Ligações e detalhes de interface não são verificados automaticamente.', refs: [], source: 'rule',
  });

  // ---------------------------------------------------------------- Fundação
  const nFound = normOf(catalog, 'nbr6122');
  const soil = structure?.checks.find((k) => k.kind === 'soil');
  if (soil) {
    push({
      id: 'found.soil', discipline: 'foundation', norm: nFound, title: 'Tensão no solo sob o radier',
      criterion: 'Pressão média de contato menor ou igual à tensão admissível', status: soil.status,
      value: `${nf(soil.demand)} kPa (taxa ${nf(soil.ratio)})`, limit: `${nf(soil.capacity, 0)} kPa`, detail: soil.detail, refs: soil.hostIds, source: 'check',
    });
  }
  {
    const s = project.legal.soil;
    let status: ComplianceStatus;
    let detail: string;
    let needs: string[] | undefined;
    if (s.source === 'assumed') {
      status = 'warn';
      detail = 'Tensão admitida sem sondagem: exigir SPT (NBR 6484/8036).';
    } else if (s.source === 'spt' && s.boreholes === 0) {
      status = 'missing';
      detail = 'Origem informada como SPT, mas sem furos registrados.';
      needs = ['legal.soil'];
    } else {
      status = s.source === 'spt' ? 'ok' : 'manual';
      detail = s.source === 'spt' ? `Sondagem SPT com ${s.boreholes} furo(s)${s.reference ? ` (${s.reference})` : ''}.` : `Origem da tensão: ${s.reference || 'outra fonte'}; conferir.`;
    }
    push({
      id: 'found.soil_source', discipline: 'foundation', norm: normsJoin(normOf(catalog, 'nbr6484'), normOf(catalog, 'nbr8036')), title: 'Origem da tensão admissível do solo',
      criterion: 'Tensão admissível definida por sondagem SPT', status, value: `${nf(project.design.soilBearingKPa, 0)} kPa (${s.source === 'assumed' ? 'admitida' : s.source === 'spt' ? 'SPT' : 'outra fonte'})`,
      detail, refs: [], source: 'input', needs,
    });
  }
  push({
    id: 'found.radier', discipline: 'foundation', norm: normOf(catalog, 'nbr6118'), title: 'Radier de concreto armado',
    criterion: 'Armadura, espessura, viga de borda e juntas conforme a NBR 6118', status: 'manual',
    value: `e = ${nf(project.system.foundation.thickness * 100, 0)} cm, viga de borda ${nf(project.system.foundation.edgeBeamDepth * 100, 0)} cm`,
    detail: 'O programa quantifica o radier; o responsável dimensiona a armadura e o detalhamento.', refs: [], source: 'rule',
  });

  // Terreno: muros de arrimo gerados (F18-T) exigem projeto geotécnico/estrutural.
  if (results.terrain && results.terrain.walls.length > 0) {
    const ws = results.terrain.walls;
    const hMax = Math.max(...ws.map((w) => w.maxHeight));
    const types = [...new Set(ws.map((w) => ({ gabion: 'gabião', concrete: 'concreto armado', block: 'bloco estrutural' })[w.type]))];
    push({
      id: 'terrain.retaining', discipline: 'foundation', norm: normOf(catalog, 'nbr11682'), title: 'Muros de arrimo do terreno',
      criterion: 'Contenções projetadas e verificadas quanto à estabilidade (empuxo, tombamento, deslizamento, drenagem)', status: 'manual',
      value: `${ws.length} muro(s), altura máx. ${nf(hMax)} m, ${types.join(' / ')}`,
      detail: 'O programa sugere o traçado e quantifica; o dimensionamento e a drenagem exigem projeto geotécnico e estrutural (NBR 11682).',
      refs: ws.map((w) => w.id), source: 'rule',
    });
  }

  // ---------------------------------------------------------------- Elétrica
  const elec = results.installations?.electrical;
  const n5410 = normOf(catalog, 'nbr5410');
  if (!elec) {
    push({
      id: 'elec.none', discipline: 'electrical', norm: n5410, title: 'Instalações elétricas', criterion: 'Projeto elétrico conforme a NBR 5410', status: 'na',
      detail: results.installations ? 'Instalações ligadas, mas sem cômodos para dimensionar o projeto elétrico.' : 'Instalações desligadas.', refs: [], source: 'rule',
    });
  } else {
    const used = new Set<string>();
    const take = (...codes: string[]) => {
      codes.forEach((k) => used.add(k));
      return warnBy((k) => codes.includes(k));
    };
    const mp = fromWarnings(take('elec.room.sockets_min', 'elec.room.no_light', 'elec.bath.no_socket', 'elec.kitchen.counter_sockets', 'elec.room.light_no_switch', 'elec.bath.socket_zone'), 'manual');
    push({
      id: 'elec.min_points', discipline: 'electrical', norm: n5410, clause: '9.5.2', title: 'Pontos de luz e tomadas mínimos',
      criterion: 'Pontos de iluminação e tomadas por cômodo conforme a NBR 5410', status: mp.status,
      value: `${results.installations!.points.filter((p) => p.kind === 'light').length} luz, ${results.installations!.points.filter((p) => p.kind === 'outlet' || p.kind === 'outlet_high' || p.kind === 'tue').length} tomadas`,
      detail: mp.detail, refs: mp.refs, source: 'warning',
    });
    const bad = elec.circuits.filter((k) => k.ib > k.breakerA + EPS || k.breakerA > k.izCorrected + EPS);
    take('elec.circuit.overload', 'elec.circuit.min_section', 'elec.circuit.load_high', 'elec.circuit.mixed', 'elec.circuit.tue_shared', 'elec.circuit.wet_shared');
    const cw = fromWarnings(warnBy((k) => k.startsWith('elec.circuit.')), 'manual');
    push({
      id: 'elec.ampacity', discipline: 'electrical', norm: n5410, clause: '6.3.4.3', title: 'Ib ≤ In ≤ Iz',
      criterion: 'Corrente de projeto menor ou igual à do disjuntor, que é menor ou igual à capacidade corrigida do condutor',
      status: bad.length > 0 ? 'fail' : cw.status, value: `${elec.circuits.length - bad.length} de ${elec.circuits.length} circuitos conferem`,
      detail: bad.length ? `Circuitos fora: ${bad.map((k) => `${k.name} (Ib ${nf(k.ib)} A, In ${nf(k.breakerA)} A, Iz ${nf(k.izCorrected)} A)`).join('; ')}.` : cw.detail,
      refs: bad.length ? bad.map((k) => k.id) : cw.refs, source: 'check',
    });
    const vd = c.electrical.voltageDrop;
    const maxTotal = Math.max(0, ...elec.circuits.map((k) => k.totalDropPct));
    const worstC = elec.circuits.reduce<(typeof elec.circuits)[number] | undefined>((a, k) => (!a || k.totalDropPct > a.totalDropPct ? k : a), undefined);
    take('elec.vdrop.terminal', 'elec.vdrop.total');
    const vw = fromWarnings(warnBy((k) => k.startsWith('elec.vdrop.')), 'manual');
    push({
      id: 'elec.vdrop', discipline: 'electrical', norm: n5410, clause: '6.2.7', title: 'Queda de tensão',
      criterion: `Queda total até ${nf(vd.totalMaxPct, 0)}% e nos circuitos terminais até ${nf(vd.terminalMaxPct, 0)}%`,
      status: maxTotal > vd.totalMaxPct + EPS ? 'fail' : vw.status === 'ok' && maxTotal > vd.warnAtPct ? 'warn' : vw.status,
      value: `${nf(maxTotal)}%${worstC ? ` (${worstC.name})` : ''}`, limit: `≤ ${nf(vd.totalMaxPct, 0)}%`, detail: vw.detail, refs: worstC ? [worstC.id] : [], source: 'check',
    });
    const dw = fromWarnings(take('elec.dr.missing'), 'manual');
    const drCount = elec.panel.drs.length;
    push({
      id: 'elec.dr', discipline: 'electrical', norm: n5410, clause: '5.1.3.2', title: 'DR nas áreas molhadas',
      criterion: `DR de ${nf(c.electrical.dr.sensitivityMa, 0)} mA em banheiros, cozinha e áreas de serviço`,
      status: dw.status, value: `${drCount} DR no quadro`, limit: `${nf(c.electrical.dr.sensitivityMa, 0)} mA`, detail: dw.detail, refs: dw.refs, source: 'warning',
    });
    push({
      id: 'elec.dps', discipline: 'electrical', norm: n5410, clause: '6.3.5.2', title: 'DPS',
      criterion: 'Proteção contra surtos no quadro de distribuição', status: elec.panel.dps ? 'ok' : 'warn',
      value: elec.panel.dps ? `Uc ${nf(elec.panel.dps.ucV, 0)} V, In ${nf(elec.panel.dps.inKa, 0)} kA` : 'ausente', refs: [], source: 'check',
    });
    const maxFill = elec.conduits.reduce<(typeof elec.conduits)[number] | undefined>((a, k) => (!a || k.fillPct / k.fillLimitPct > a.fillPct / a.fillLimitPct ? k : a), undefined);
    const cdw = fromWarnings(take('elec.conduit.fill', 'elec.conduit.bends', 'elec.conduit.length', 'elec.conduit.splice', 'elec.conduit.unreached'), 'manual');
    const overfill = elec.conduits.some((k) => k.fillPct > k.fillLimitPct + EPS);
    push({
      id: 'elec.conduits', discipline: 'electrical', norm: n5410, clause: '6.2.11', title: 'Ocupação dos eletrodutos',
      criterion: 'Taxa de ocupação máxima: 53% (1 condutor), 31% (2) e 40% (3 ou mais)',
      status: overfill ? 'fail' : cdw.status, value: maxFill ? `${nf(maxFill.fillPct, 0)}% (limite ${nf(maxFill.fillLimitPct, 0)}%)` : 'sem eletrodutos',
      detail: cdw.detail, refs: maxFill ? [maxFill.id] : [], source: 'check',
    });
    push({
      id: 'elec.entrance', discipline: 'electrical', norm: n5410, title: 'Padrão de entrada',
      criterion: 'Padrão de entrada conforme a norma técnica da concessionária', status: 'manual',
      value: `${elec.entrance.category}, ${elec.entrance.phases} fase(s), disjuntor ${nf(elec.entrance.breakerA, 0)} A`,
      detail: `Confirmar com a concessionária${isFilled(project.legal.powerUtility) ? ` (${project.legal.powerUtility})` : ' (não informada em legal.powerUtility)'}.`, refs: [], source: 'rule',
    });
    push({
      id: 'elec.earthing', discipline: 'electrical', norm: n5410, clause: '6.4', title: 'Esquema de aterramento',
      criterion: 'Esquema de aterramento compatível com a rede da concessionária', status: 'manual', value: project.legal.earthing,
      detail: 'Esquema informado em legal.earthing; confirmar com a concessionária e especificar o eletrodo de aterramento.', refs: [], source: 'input',
    });
    take('install.demand', 'install.wire_table', 'install.shower_wire', 'install.no_rooms');
    genericWarnings(warnBy((k) => (k.startsWith('elec.') || k === 'install.demand' || k === 'install.wire_table' || k === 'install.shower_wire' || k === 'install.no_rooms') && !used.has(k)), 'electrical', n5410);
  }

  // ---------------------------------------------------------------- Hidrossanitário
  const plumb = results.installations?.plumbing;
  const n5626 = normOf(catalog, 'nbr5626');
  const n8160 = normOf(catalog, 'nbr8160');
  if (!plumb) {
    push({
      id: 'plumb.none', discipline: 'plumbing', norm: n5626, title: 'Instalações hidrossanitárias', criterion: 'Projeto hidrossanitário conforme as NBR 5626 e 8160', status: 'na',
      detail: results.installations ? 'Instalações ligadas, mas sem cômodos para dimensionar o projeto hidrossanitário.' : 'Instalações desligadas.', refs: [], source: 'rule',
    });
  } else {
    const used = new Set<string>();
    const take = (...codes: string[]) => {
      codes.forEach((k) => used.add(k));
      return warnBy((k) => codes.includes(k));
    };
    const wp = plumb.water.points;
    const worstP = wp.reduce<(typeof wp)[number] | undefined>((a, p) => (!a || p.dynamicKpa - p.minKpa < a.dynamicKpa - a.minKpa ? p : a), undefined);
    const pw = fromWarnings(take('water.pressure_low', 'water.pressurizer', 'water.static_high'), 'manual');
    push({
      id: 'plumb.pressure', discipline: 'plumbing', norm: n5626, clause: '5.3', title: 'Pressão mínima nos pontos',
      criterion: `Pressão dinâmica mínima de ${nf(c.plumbing.water.minDynamicKpa.default, 0)} kPa (${nf(c.plumbing.water.minDynamicKpa.toilet_tank, 0)} kPa na bacia) e estática até ${nf(c.plumbing.water.maxStaticKpa, 0)} kPa`,
      status: wp.some((p) => !p.ok) ? 'fail' : pw.status,
      value: worstP ? `${nf(worstP.dynamicKpa, 1)} kPa em ${worstP.fixture}` : undefined, limit: worstP ? `≥ ${nf(worstP.minKpa, 0)} kPa` : undefined,
      detail: pw.detail, refs: worstP ? [worstP.pointId] : [], source: 'check',
    });
    const maxV = plumb.water.pipes.reduce((a, p) => Math.max(a, p.velocity), 0);
    const vwr = fromWarnings(take('water.velocity_high'), 'manual');
    push({
      id: 'plumb.velocity', discipline: 'plumbing', norm: n5626, clause: '5.3.4', title: 'Velocidade da água',
      criterion: `Velocidade máxima de ${nf(c.plumbing.water.maxVelocity, 1)} m/s`, status: maxV > c.plumbing.water.maxVelocity + EPS ? 'fail' : vwr.status,
      value: `${nf(maxV)} m/s`, limit: `≤ ${nf(c.plumbing.water.maxVelocity, 1)} m/s`, detail: vwr.detail, refs: vwr.refs, source: 'check',
    });
    const dnw = fromWarnings(take('water.dn_min'), 'manual');
    push({
      id: 'plumb.dn_min', discipline: 'plumbing', norm: n5626, title: 'Diâmetro mínimo dos sub-ramais',
      criterion: 'DN dos tubos igual ou maior que o mínimo de cada aparelho', status: dnw.status, detail: dnw.detail, refs: dnw.refs, source: 'warning',
    });
    const tw = fromWarnings(take('water.tank_small', 'install.tank_load'), 'manual');
    const needL = plumb.tank.dailyLiters * c.plumbing.water.reservoir.reserveDays;
    push({
      id: 'plumb.reservoir', discipline: 'plumbing', norm: n5626, clause: '5.2', title: 'Reservatório',
      criterion: `Reserva de ${nf(c.plumbing.water.reservoir.reserveDays, 0)} dias de consumo`, status: plumb.tank.liters + EPS < needL ? 'warn' : tw.status,
      value: `${nf(plumb.tank.liters, 0)} L`, limit: `≥ ${nf(needL, 0)} L`, detail: tw.detail, refs: tw.refs, source: 'check',
    });
    const sw = fromWarnings(take('sewer.slope'), 'manual');
    push({
      id: 'plumb.slope', discipline: 'plumbing', norm: n8160, title: 'Declividade dos ramais de esgoto',
      criterion: `Declividade mínima de ${nf(c.plumbing.sewer.slopeMin.upTo75 * 100, 0)}% (até DN 75) e ${nf(c.plumbing.sewer.slopeMin.from100 * 100, 0)}% (DN 100 ou mais)`,
      status: sw.status, detail: sw.detail, refs: sw.refs, source: 'warning',
    });
    const uw = fromWarnings(take('sewer.uhc_exceeded', 'sewer.dn_reduction', 'sewer.toilet_dn'), 'manual');
    push({
      id: 'plumb.uhc', discipline: 'plumbing', norm: n8160, title: 'Unidades Hunter de Contribuição (UHC)',
      criterion: 'UHC por trecho dentro do limite do DN adotado', status: uw.status, value: `${nf(plumb.sewer.totalUhc, 0)} UHC no total`, detail: uw.detail, refs: uw.refs, source: 'warning',
    });
    const vnw = fromWarnings(take('sewer.no_vent', 'sewer.vent_distance', 'sewer.vent_terminal'), 'manual');
    push({
      id: 'plumb.vent', discipline: 'plumbing', norm: n8160, title: 'Ventilação do esgoto',
      criterion: 'Desconexão ao ventilar e terminal de ventilação acima da cobertura', status: vnw.status, value: plumb.sewer.vented ? 'ventilado' : 'sem ventilação',
      detail: vnw.detail, refs: vnw.refs, source: 'warning',
    });
    const bw = fromWarnings(take('sewer.inspection_depth', 'sewer.grease_trap', 'sewer.toilet_in_siphon_box'), 'manual');
    push({
      id: 'plumb.boxes', discipline: 'plumbing', norm: n8160, title: 'Caixas de inspeção, gordura e sifonada',
      criterion: 'Caixas nos pontos exigidos, com profundidade e distâncias máximas', status: bw.status, detail: bw.detail, refs: bw.refs, source: 'warning',
    });
    if (plumb.septic) {
      push({
        id: 'plumb.septic', discipline: 'plumbing', norm: normOf(catalog, 'nbr17076'), title: 'Fossa séptica',
        criterion: 'Tanque séptico e disposição final dimensionados pela norma vigente', status: 'manual', value: `${nf(plumb.septic.tankLiters, 0)} L`,
        detail: 'Dimensionada pela NBR 7229 (legado); conferir pela NBR 17076:2024.', refs: [], source: 'rule',
      });
    } else {
      push({ id: 'plumb.septic', discipline: 'plumbing', norm: normOf(catalog, 'nbr17076'), title: 'Fossa séptica', criterion: 'Tratamento local do esgoto', status: 'na', detail: 'Esgoto ligado à rede pública.', refs: [], source: 'rule' });
    }
    const lot = project.legal.lot;
    if (lot && plumb.septic) {
      const poly = lotPolygon(lot);
      const segs = lotBoundarySegments(poly);
      const nSep = normOf(catalog, 'nbr17076');
      const d = project.legal.septicPosition;
      const w = project.legal.wellPosition;
      const distBoundary = (p: [number, number]) => minDistance([p], segs);
      const bLot = buildingInLot(results.model.footprint, lot);
      if (d) {
        const inside = pointInPolygon(d, poly);
        push({ id: 'plumb.septic_boundary', discipline: 'plumbing', norm: nSep, title: 'Distância da fossa à divisa', criterion: 'Afastamento mínimo da fossa até as divisas', status: 'manual', value: `${nf(distBoundary(d))} m`, detail: inside ? 'Conferir o afastamento mínimo da norma e do município.' : 'A fossa está fora do lote; confira a posição.', refs: [], source: 'input' });
        push({ id: 'plumb.septic_building', discipline: 'plumbing', norm: nSep, title: 'Distância da fossa à edificação', criterion: 'Afastamento mínimo da fossa até a edificação', status: 'manual', value: `${nf(minDistance([d], lotBoundarySegments(bLot)))} m`, detail: 'Conferir o afastamento mínimo da norma.', refs: [], source: 'input' });
      }
      if (d && w) {
        push({ id: 'plumb.septic_well', discipline: 'plumbing', norm: nSep, title: 'Distância da fossa ao poço', criterion: 'Afastamento mínimo entre a fossa e o poço de captação', status: 'manual', value: `${nf(Math.hypot(d[0] - w[0], d[1] - w[1]))} m`, detail: 'Conferir o afastamento mínimo da norma e do órgão ambiental.', refs: [], source: 'input' });
      }
      if (w) {
        push({ id: 'plumb.well_boundary', discipline: 'plumbing', norm: nSep, title: 'Distância do poço à divisa', criterion: 'Afastamento mínimo do poço até as divisas', status: 'manual', value: `${nf(distBoundary(w))} m`, detail: 'Conferir o afastamento mínimo exigido.', refs: [], source: 'input' });
      }
    }
    push({
      id: 'plumb.pluvial', discipline: 'plumbing', norm: normOf(catalog, 'nbr10844'), title: 'Águas pluviais',
      criterion: 'Calhas e condutores dimensionados pela intensidade de chuva local', status: 'manual',
      detail: project.roof.gutters ? 'O modelo prevê calhas; dimensionar calhas e condutores pela NBR 10844.' : 'Sem calhas no modelo; definir a drenagem das águas pluviais.', refs: [], source: 'rule',
    });
    genericWarnings(warnBy((k) => (k.startsWith('water.') || k.startsWith('sewer.')) && !used.has(k)), 'plumbing', n5626);
  }

  // ---------------------------------------------------------------- Documentação
  const lg = project.legal;
  const docDisciplines: Discipline[] = ['architecture', 'structure', 'foundation'];
  if (results.installations?.electrical) docDisciplines.push('electrical');
  if (results.installations?.plumbing) docDisciplines.push('plumbing');
  for (const d of docDisciplines) {
    const prof = professionalFor(project, d);
    const council = prof?.council ?? (d === 'architecture' ? 'CAU' : 'CREA');
    const nDoc = council === 'CAU' ? normOf(catalog, 'cau91') : normOf(catalog, 'confea1137');
    const doc = council === 'CAU' ? 'RRT' : 'ART';
    const filled = !!prof && isFilled(prof.docNumber);
    push({
      id: `doc.art.${d}`, discipline: d, norm: nDoc, title: `${doc} do projeto de ${DISCIPLINE_NAME[d]}`,
      criterion: `${doc} registrada para a atividade técnica antes da aprovação`, status: filled ? 'ok' : 'missing',
      value: filled ? prof!.docNumber : undefined,
      detail: !prof ? 'Responsável técnico não informado.' : filled ? `Responsável: ${prof.name}.` : `${prof.name} informado, mas sem o número da ${doc}.`,
      refs: [], source: 'input', needs: filled ? undefined : [`legal.professionals.${d}`], exact: true,
    });
  }
  const need = (id: string, title: string, ok: boolean, key: string, value?: string) =>
    push({
      id, discipline: 'architecture', norm: normOf(catalog, 'lei12378'), title, criterion: 'Dado obrigatório nos documentos de aprovação', status: ok ? 'ok' : 'missing',
      value: ok ? value : undefined, refs: [], source: 'input', needs: ok ? undefined : [key], exact: true,
    });
  need('doc.owner', 'Proprietário informado', isFilled(lg.owner.name), 'legal.owner.name', lg.owner.name);
  need('doc.address', 'Endereço da obra informado', isFilled(lg.address.street) && isFilled(lg.address.city), 'legal.address', `${lg.address.street}, ${lg.address.city}`);
  need('doc.registry', 'Matrícula do imóvel informada', isFilled(lg.address.registry), 'legal.address.registry', lg.address.registry);
  push({
    id: 'doc.disclaimer', discipline: 'architecture', norm: normOf(catalog, 'lei6496'), title: 'Aviso de responsabilidade técnica',
    criterion: 'Todo resultado e relatório traz o aviso de que não substitui projeto com ART/RRT', status: DISCLAIMER.length > 0 ? 'ok' : 'fail',
    refs: [], source: 'rule', exact: true,
  });

  return items;

  function genericWarnings(ws: EngineWarning[], discipline: Discipline, norm: NormInfo) {
    const codes = [...new Set(ws.map((w) => w.code))];
    for (const code of codes) {
      const g = ws.filter((w) => w.code === code);
      const r = fromWarnings(g, 'manual');
      push({
        id: `${discipline === 'electrical' ? 'elec' : 'plumb'}.warn.${code.replace(/\./g, '-')}`,
        discipline, norm, title: g[0]!.message.split(/[.:]/)[0]!.slice(0, 80), criterion: `Aviso do motor (${code})`, status: r.status, detail: r.detail, refs: r.refs, source: 'warning',
      });
    }
  }
}

const DISCIPLINE_NAME: Record<Discipline, string> = {
  architecture: 'arquitetura', structure: 'estrutura', foundation: 'fundação', electrical: 'instalações elétricas', plumbing: 'instalações hidrossanitárias', execution: 'execução',
};

function zoningKey(id: string): string {
  switch (id) {
    case 'occupancy': return 'legal.zoning.maxOccupancyPct';
    case 'far': return 'legal.zoning.maxFar';
    case 'permeable': return 'legal.zoning.minPermeablePct';
    case 'setback_front': return 'legal.zoning.setbackFront';
    case 'setback_back': return 'legal.zoning.setbackBack';
    case 'height': return 'legal.zoning.maxHeight';
    case 'floors': return 'legal.zoning.maxFloors';
    default: return 'legal.zoning.setbackSide';
  }
}
