import type { Catalog } from '@chalecad/catalog';
import type { Project } from '../schema/project';
import { DISCLAIMER, type Results } from '../schema/results';
import type {
  AttentionPoint,
  CheckRow,
  EngineerPackage,
  OpenQuestion,
} from './types';

const fmt = (n: number, d = 2) => n.toFixed(d).replace('.', ',');

/** Soleira de tensão padrão do schema (sem sondagem). */
const DEFAULT_SOIL_KPA = 100;
/** Vão de viga de mezanino a partir do qual a pergunta vira ponto de atenção explícito. */
const LONG_JOIST_SPAN = 4;

export const ART_NOTICE =
  'Este pacote reúne premissas e pré-dimensionamentos para conversa com o engenheiro. A execução da estrutura, da fundação e das ' +
  'instalações exige projeto estrutural e ART (Anotação de Responsabilidade Técnica) de profissional habilitado no CREA. ' +
  DISCLAIMER;

export function buildEngineerPackage(project: Project, results: Results, _catalog: Catalog): EngineerPackage {
  void _catalog;
  const { model, quantities, weight, structure, warnings, pieces } = results;
  const t = project.typology;
  const sys = project.system;
  const d = project.design;

  const { kind, ...dims } = t;
  const dimensions: Record<string, number | string> = {};
  for (const [k, v] of Object.entries(dims)) {
    if (typeof v === 'number' || typeof v === 'string') dimensions[k] = v;
    else if (k === 'annexes' && Array.isArray(v)) {
      for (const a of v as { side: string }[]) {
        for (const [k2, v2] of Object.entries(a)) if (typeof v2 === 'number') dimensions[`annexes.${a.side}.${k2}`] = v2;
      }
    } else if (v && typeof v === 'object') {
      for (const [k2, v2] of Object.entries(v)) if (typeof v2 === 'number') dimensions[`${k}.${k2}`] = v2;
    }
  }
  dimensions.ridgeHeight = model.ridgeHeight;

  const checks: CheckRow[] = (structure?.checks ?? [])
    .map((c) => ({
      id: c.id,
      kind: c.kind,
      label: c.label,
      demand: c.demand,
      capacity: c.capacity,
      unit: c.unit,
      ratio: c.ratio,
      status: c.status,
    }))
    .sort((a, b) => b.ratio - a.ratio || a.id.localeCompare(b.id));

  // --- Pontos de atenção ------------------------------------------------------
  const attention: AttentionPoint[] = [];
  for (const c of structure?.checks ?? []) {
    if (c.status === 'ok') continue;
    attention.push({
      severity: c.status,
      source: 'check',
      text: `${c.label}: taxa de uso ${fmt(c.ratio)} (${c.status === 'fail' ? 'não passa' : 'perto do limite'}). ${c.detail}${c.suggestion ? ` Sugestão: ${c.suggestion.text}` : ''}`,
      refs: [...c.hostIds],
    });
  }
  for (const w of warnings) {
    if (w.severity === 'info') continue;
    attention.push({
      severity: w.severity === 'error' ? 'fail' : 'warn',
      source: 'warning',
      text: `[${w.code}] ${w.message}`,
      refs: w.refs ? [...w.refs] : [],
    });
  }
  const rank = { fail: 0, warn: 1, info: 2 } as const;
  attention.sort((a, b) => rank[a.severity] - rank[b.severity]);

  // --- Perguntas abertas, geradas por regras ---------------------------------------
  const questions: OpenQuestion[] = [];
  const ask = (rule: string, text: string) => questions.push({ id: `q${questions.length + 1}:${rule}`, rule, text });

  const soilDefault = d.soilBearingKPa === DEFAULT_SOIL_KPA;
  ask(
    'soil',
    soilDefault
      ? `Sondagem do solo: usado padrão de ${DEFAULT_SOIL_KPA} kPa de tensão admissível, sem sondagem. Qual a tensão real e o nível do lençol freático?`
      : `Sondagem do solo: foi informada a tensão admissível de ${fmt(d.soilBearingKPa, 0)} kPa. Há laudo de sondagem que a sustente?`,
  );
  ask(
    'wind',
    `Vento: V0 informado ${fmt(d.windV0, 0)} m/s, categoria de terreno ${d.terrainCategory}. Confirmar com as isopletas da NBR 6123 e com a topografia e o entorno do lote.`,
  );
  const f = sys.foundation;
  ask(
    'radier',
    `Radier de ${fmt(f.thickness * 100, 0)} cm com viga de borda de ${fmt(f.edgeBeamDepth * 100, 0)} cm: dimensionar armadura e verificar recalque para a carga total estimada de ${fmt(weight.totalKg, 0)} kg.`,
  );

  for (const slab of model.slabs.filter((s) => s.kind === 'mezzanine')) {
    const spans = pieces.filter((p) => p.hostId === slab.id && p.role === 'joist').map((p) => p.length);
    if (spans.length === 0) continue;
    const span = Math.max(...spans);
    ask(
      'mezzanine-span',
      `Validar vão de ${fmt(span, 1)} m das vigas do mezanino (${slab.id}, perfil ${sys.profiles.joist}, espaçamento ${fmt(sys.studSpacing, 1)} m)` +
        `${span > LONG_JOIST_SPAN ? ': é um vão longo para LSF, avaliar vigas duplas ou apoio intermediário' : ''}.`,
    );
  }

  for (const c of structure?.checks ?? []) {
    if (c.status === 'ok') continue;
    ask(
      `check-${c.status}`,
      `Validar ${c.label}: taxa de uso ${fmt(c.ratio)} (${c.status === 'fail' ? 'reprova' : 'alerta'}). O engenheiro confirma o perfil ou aceita a sugestão do pré-dimensionamento?`,
    );
  }
  if (!structure) {
    ask('no-structure', 'As verificações de pré-dimensionamento não estavam disponíveis ao gerar este pacote: o engenheiro deve verificar montantes, vigas, caibros, verga e ancoragem do zero.');
  }

  if (t.kind === 'gambrel') {
    ask('gambrel-break', `Telhado gambrel: verificar a ligação dos caibros na quebra (${fmt(t.lowerPitchDeg, 0)}° e ${fmt(t.upperPitchDeg, 0)}°), o empuxo lateral sobre as paredes e a necessidade de travessas ou do mezanino como tirante.`);
  }
  if (t.kind === 'combined') {
    ask('combined-valley', `Módulo ${t.shape}: detalhar a estrutura dos rincões (caibros de ligação, viga de rincão) e a junta estrutural entre o volume principal e a ala.`);
  }
  if (t.kind === 'a_frame') {
    ask('aframe', 'A-frame: verificar o empuxo das águas na base e a ligação com o radier.');
    if (t.annexes.length > 0) {
      ask('aframe-annex', 'Cômodos laterais: detalhar o recorte da água do A-frame (caibros interrompidos e verga), o apoio dos caibros do anexo e o rufo/calha no encontro dos telhados.');
    }
    if (t.frontGable === 'glazed' || t.backGable === 'glazed') {
      ask('aframe-glazing', 'Fachada envidraçada: definir caixilharia (perfis, ancoragem na estrutura) e vidro de segurança para o vento do local.');
    }
  }
  const spliced = quantities.lines.filter((l) => l.note?.includes('emenda'));
  if (spliced.length > 0) {
    ask('splices', `Há peças maiores que a barra comercial (${spliced.map((l) => l.name).join(', ')}): definir o detalhe de emenda.`);
  }
  for (const w of warnings.filter((x) => x.severity !== 'info')) {
    ask('warning', `Esclarecer o alerta ${w.code}: ${w.message}`);
  }
  if (project.site.type === 'sloped') {
    ask('slope', `Terreno inclinado (${fmt(project.site.slopePct, 0)}%): definir contenções, drenagem e estabilidade do platô.`);
  }

  return {
    summary: {
      projectName: project.meta.name,
      region: project.meta.region,
      typology: kind,
      dimensions,
      areas: {
        footprint: quantities.areas.footprint,
        built: quantities.areas.built,
        roof: quantities.areas.roof,
        radier: quantities.areas.radier,
        mezzanine: quantities.areas.mezzanine,
      },
      profiles: { ...sys.profiles },
      studSpacing: sys.studSpacing,
      bracing: sys.bracing,
      assemblies: { ...sys.assemblies },
      foundation: { thickness: f.thickness, border: f.border, edgeBeamDepth: f.edgeBeamDepth },
      steelKg: quantities.steelKg,
      totalWeightKg: weight.totalKg,
    },
    loadAssumptions: {
      loads: structure ? { ...structure.loads } : null,
      windV0: d.windV0,
      terrainCategory: d.terrainCategory,
      soilBearingKPa: d.soilBearingKPa,
      soilIsDefault: soilDefault,
    },
    checks,
    attentionPoints: attention,
    openQuestions: questions,
    artNotice: ART_NOTICE,
    disclaimer: DISCLAIMER,
  };
}
