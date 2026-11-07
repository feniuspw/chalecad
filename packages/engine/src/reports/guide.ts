import { getAssembly, getProfile, type Catalog } from '@chalecad/catalog';
import { polylineLength } from '../geometry';
import type { Project } from '../schema/project';
import { DISCLAIMER, type HostWall, type QuantityLine, type Results } from '../schema/results';
import { LEAD_TIMES, PRODUCTIVITY as P } from './indices';
import type { BuyFirstItem, ConstructionGuide, GuideStep } from './types';

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number, d = 1) => n.toFixed(d).replace('.', ',');
const ROOF_ROLES = new Set(['rafter', 'purlin', 'ridge', 'collar_tie']);

/** Ordem das paredes: externas começando pela frente, depois as demais externas, depois as internas. */
function orderWalls(walls: HostWall[]): HostWall[] {
  const ext = walls.filter((w) => w.exteriorSide !== null);
  const front = ext.filter((w) => w.id === 'ext-front');
  const others = ext.filter((w) => w.id !== 'ext-front');
  const interior = walls.filter((w) => w.exteriorSide === null);
  return [...front, ...others, ...interior];
}

export function buildConstructionGuide(project: Project, results: Results, catalog: Catalog): ConstructionGuide {
  const { model, pieces, quantities } = results;
  const lines = quantities.lines;
  const steps: GuideStep[] = [];
  const add = (s: Omit<GuideStep, 'order' | 'manHours'> & { manHours: number }): void => {
    steps.push({ ...s, order: steps.length + 1, manHours: round1(s.manHours) });
  };
  const ids = (ls: QuantityLine[]) => ls.map((l) => l.id);
  const byStage = (stage: QuantityLine['stage']) => lines.filter((l) => l.stage === stage);
  const touching = (hostIds: string[]) => lines.filter((l) => l.hostIds.some((h) => hostIds.includes(h)));

  const radier = model.slabs.find((s) => s.kind === 'radier');
  const perimeter = radier ? polylineLength(radier.polygon, true) : 0;
  const builtArea = model.builtArea;

  // --- 1. Locação ------------------------------------------------------------
  add({
    id: 'layout',
    phase: 'layout',
    title: 'Locação e gabarito',
    description:
      `Limpe e nivele o terreno, marque os eixos da edificação (${model.typology}) com gabarito de tábuas a 1,2 m do perímetro, ` +
      `confira esquadro pelas diagonais (diferença máxima de 5 mm) e transfira os pontos de esgoto e água do projeto. ` +
      `Perímetro do radier: ${fmt(perimeter)} m.`,
    tools: ['trena de 30 m', 'nível a laser ou mangueira de nível', 'esquadro grande', 'linha de nylon', 'estacas e tábuas', 'martelo'],
    materials: [],
    hostIds: [],
    manHours: P.layoutBaseHh + P.layoutPerMeterHh * perimeter,
  });

  // --- 2. Instalações embutidas ----------------------------------------------
  const embedded = lines.filter((l) => l.stage === 'foundation' && /^pvc_/.test(l.itemId));
  add({
    id: 'embedded-utilities',
    phase: 'foundation',
    title: 'Instalações embutidas no radier',
    description:
      `Abra as valas e assente as tubulações de esgoto e água que ficam sob o radier (${project.utilities.length} ponto(s) no projeto), ` +
      'com caimento mínimo de 2% no esgoto. Teste a estanqueidade antes de cobrir e proteja as pontas com bujões.',
    tools: ['pá e enxada', 'serra de arco', 'nível de bolha', 'trena', 'cola e lixa para PVC'],
    materials: ids(embedded),
    hostIds: radier ? [radier.id] : [],
    manHours: P.embeddedBaseHh + P.embeddedPerPointHh * project.utilities.length,
  });

  // --- 3. Radier ---------------------------------------------------------------
  const f = project.system.foundation;
  add({
    id: 'radier',
    phase: 'foundation',
    title: 'Radier',
    description:
      `Compacte o solo, espalhe a brita, estenda a lona, monte as fôrmas de borda e a malha com espaçadores. ` +
      `Concrete ${fmt(radier?.area ?? 0)} m² com espessura de ${fmt(f.thickness * 100, 0)} cm e viga de borda de ${fmt(f.edgeBeamDepth * 100, 0)} cm, ` +
      `adense, desempene e faça a cura úmida por 7 dias antes de montar as paredes.`,
    tools: ['placa vibratória ou soquete', 'régua vibratória', 'vibrador de imersão', 'desempenadeira', 'carrinho de mão', 'alicate de armador', 'nível a laser'],
    materials: ids(byStage('foundation').filter((l) => !/^pvc_/.test(l.itemId))),
    hostIds: radier ? [radier.id] : [],
    manHours: P.radierPerM2Hh * (radier?.area ?? 0),
  });

  // --- 4. Painéis de parede ------------------------------------------------------
  const maxPanel = catalog.constants.lsf.maxPanelLength;
  const openingsByWall = new Map<string, number>();
  for (const o of model.openings) if (o.valid && o.hostKind === 'wall') openingsByWall.set(o.hostId, (openingsByWall.get(o.hostId) ?? 0) + 1);
  for (const w of orderWalls(model.walls)) {
    const ps = pieces.filter((p) => p.hostId === w.id);
    const weight = ps.reduce((s, p) => s + p.length * getProfile(catalog, p.profileId).massPerM, 0);
    const panels = Math.max(1, Math.ceil(w.length / maxPanel - 1e-9));
    const ext = w.exteriorSide !== null;
    const nOpen = openingsByWall.get(w.id) ?? 0;
    add({
      id: `wall:${w.id}`,
      phase: 'walls',
      title: `Painel de parede ${w.id}`,
      description:
        `Monte no chão e levante a parede ${ext ? 'externa' : 'interna'} ${w.id} (${fmt(w.length, 2)} m, ${panels} painel(is) de até ${fmt(maxPanel)} m): ` +
        `${ps.length} peças, cerca de ${fmt(weight)} kg de aço. Confira esquadro e prumo, ` +
        `${nOpen > 0 ? `reforce ${nOpen} abertura(s) com verga em caixa, ` : ''}fixe a guia inferior ao radier com chumbadores` +
        `${ext ? ' e instale os hold-downs nos cantos' : ''}.`,
      tools: ['parafusadeira com bits', 'tesoura de chapa ou serra com disco de corte', 'nível de bolha e prumo', 'furadeira de impacto', 'esquadro metálico', 'trena'],
      materials: ids(lines.filter((l) => l.stage === 'structure' && l.hostIds.includes(w.id))),
      hostIds: [w.id],
      pieceCount: ps.length,
      weightKg: round2(weight),
      panels,
      manHours: P.wallPerPieceHh * ps.length + P.wallPerOpeningHh * nOpen + P.wallPerPanelHh * panels,
    });
  }

  // --- 5. Mezanino -----------------------------------------------------------------
  const mezz = model.slabs.filter((s) => s.kind === 'mezzanine');
  if (mezz.length > 0) {
    const area = mezz.reduce((s, m) => s + m.area, 0);
    const joists = pieces.filter((p) => mezz.some((m) => m.id === p.hostId));
    add({
      id: 'mezzanine',
      phase: 'mezzanine',
      title: 'Mezanino',
      description:
        `Instale as vigas de piso (${joists.filter((p) => p.role === 'joist').length} vigas), rim joists e bloqueadores, ` +
        `monte a escada de acesso quando prevista e feche o deck (${fmt(area)} m²). Parafuse o deck em todas as vigas e confira o nível antes de seguir para a cobertura.`,
      tools: ['parafusadeira', 'nível a laser', 'serra circular', 'trena', 'esquadro'],
      materials: ids(touching(mezz.map((m) => m.id))),
      hostIds: mezz.map((m) => m.id),
      pieceCount: joists.length,
      manHours: P.mezzaninePerM2Hh * area,
    });
  }

  // --- 6. Cobertura ------------------------------------------------------------------
  const roofIds = model.roofPlanes.map((r) => r.id);
  const roofPieces = pieces.filter((p) => roofIds.includes(p.hostId) && ROOF_ROLES.has(p.role));
  const roofLines = lines.filter((l) => l.stage === 'roof' || (l.stage === 'structure' && l.hostIds.some((h) => roofIds.includes(h))));
  const count = (role: string) => roofPieces.filter((p) => p.role === role).length;
  add({
    id: 'roof',
    phase: 'roof',
    title: 'Cobertura: caibros, terças e telhas',
    description:
      `Fixe os caibros (${count('rafter')}), a cumeeira e as travessas (${count('collar_tie')}), depois as terças (${count('purlin')}) no espaçamento do projeto. ` +
      `Em seguida instale as telhas sanduíche (${fmt(quantities.areas.roof)} m² de água), rufos, cumeeira e calhas. ` +
      'Trabalhe com cinto de segurança e linha de vida; não suba em telhado molhado.',
    tools: ['parafusadeira com bits', 'serra com disco de corte', 'cinto e talabarte', 'escada ou andaime', 'trena', 'selador de calafetação'],
    materials: ids(roofLines),
    hostIds: roofIds,
    pieceCount: roofPieces.length,
    manHours: P.roofPerPieceHh * roofPieces.length + P.roofCladdingPerM2Hh * quantities.areas.roof,
  });

  // --- 7. Fechamento externo -------------------------------------------------------------
  const extAsm = getAssembly(catalog, project.system.assemblies.exterior);
  const extMat = new Set(extAsm.layers.filter((l) => l.face === 'ext' || l.face === 'both').map((l) => l.materialId));
  add({
    id: 'exterior-closure',
    phase: 'exterior_closure',
    title: 'Fechamento externo',
    description:
      `Aplique as placas externas do assembly ${extAsm.name} (${fmt(quantities.areas.exteriorWallsNet)} m² líquidos de parede externa) ` +
      'com juntas desencontradas, fixe com parafusos a cada 20 cm no perímetro e 30 cm no campo, trate as juntas e proteja as aberturas.',
    tools: ['parafusadeira com guia de profundidade', 'serra circular com guia', 'estilete', 'nível', 'espátula e desempenadeira'],
    materials: ids(lines.filter((l) => extMat.has(l.itemId) && l.stage !== 'foundation')),
    hostIds: model.walls.filter((w) => w.exteriorSide !== null).map((w) => w.id),
    manHours: P.exteriorClosurePerM2Hh * quantities.areas.exteriorWallsNet,
  });

  // --- 8. Instalações -----------------------------------------------------------------------
  add({
    id: 'services',
    phase: 'services',
    title: 'Instalações elétricas e hidráulicas',
    description:
      'Passe eletrodutos e tubulações pelos furos das almas dos montantes (use passa-fios de borracha), fixe caixas e pontos de água, ' +
      'faça o teste de pressão da rede hidráulica e a continuidade da elétrica antes do fechamento interno. Contrate profissional habilitado para o quadro e para o aterramento.',
    tools: ['furadeira com serra copo', 'alicate', 'chave de fenda', 'multímetro', 'bomba de teste de pressão'],
    materials: [],
    hostIds: [],
    manHours: P.servicesPerM2BuiltHh * builtArea,
  });

  // --- 9. Fechamento interno ------------------------------------------------------------------
  const intAsm = getAssembly(catalog, project.system.assemblies.interior);
  const intMat = new Set(intAsm.layers.filter((l) => l.face !== 'ext').map((l) => l.materialId));
  add({
    id: 'interior-closure',
    phase: 'interior_closure',
    title: 'Isolamento e fechamento interno',
    description:
      `Preencha as paredes com lã mineral e instale as placas internas (${intAsm.name}) em ${fmt(quantities.areas.interiorWallsNet + quantities.areas.exteriorWallsNet)} m² de face. ` +
      'Use placas resistentes à umidade nas áreas molhadas, trate juntas com fita e massa e lixe antes da pintura.',
    tools: ['parafusadeira', 'serra de gesso', 'estilete', 'espátula e desempenadeira', 'lixadeira', 'régua de alumínio'],
    materials: ids(lines.filter((l) => intMat.has(l.itemId) && l.stage !== 'foundation')),
    hostIds: model.walls.map((w) => w.id),
    manHours: P.interiorClosurePerM2Hh * (quantities.areas.interiorWallsNet + quantities.areas.exteriorWallsNet),
  });

  // --- 10. Piso -----------------------------------------------------------------------------------
  const floorLines = byStage('floor');
  add({
    id: 'floor',
    phase: 'floor',
    title: 'Piso',
    description:
      'Faça o acabamento do concreto do radier (endurecedor, polimento ou queima), corte as juntas de retração em até 24 h e aplique o selador. ' +
      'Proteja o piso com papelão ou lona até o fim da obra.',
    tools: ['politriz ou helicóptero de concreto', 'serra de corte de junta', 'rolo e trincha', 'vassoura de pelo macio'],
    materials: ids(floorLines),
    hostIds: radier ? [radier.id] : [],
    manHours: P.floorPerM2Hh * (radier?.area ?? 0),
  });

  // --- 11. Acabamentos ---------------------------------------------------------------------------
  add({
    id: 'finishing',
    phase: 'finishing',
    title: 'Esquadrias, escada e acabamentos',
    description:
      'Instale portas, janelas e escadas, aplique pintura e vedações, instale louças, metais e luminárias e faça a limpeza final. ' +
      'Confira o funcionamento das esquadrias, a vedação com silicone e a ventilação das áreas molhadas.',
    tools: ['parafusadeira', 'nível', 'pistola de silicone', 'rolo e pincel', 'escada', 'espátula'],
    materials: ids(byStage('finishing')),
    hostIds: [],
    manHours: P.finishingPerM2BuiltHh * builtArea,
  });

  const extras = byStage('extras');
  if (extras.length > 0) {
    add({
      id: 'extras',
      phase: 'extras',
      title: 'Extras externos (muro, cerca, deck)',
      description: 'Execute os extras do projeto depois da edificação, para não danificá-los durante a obra principal.',
      tools: ['enxada', 'nível', 'trena', 'furadeira', 'parafusadeira'],
      materials: ids(extras),
      hostIds: project.extras.map((e) => e.id),
      manHours: 1.5 * extras.length + 4,
    });
  }

  // --- Compre primeiro ---------------------------------------------------------------------------
  const buyFirst: BuyFirstItem[] = [];
  for (const l of lines) {
    if (l.stage !== 'foundation' && l.stage !== 'structure') continue;
    const isProfile = l.stage === 'structure' && catalog.profiles.some((p) => p.id === l.itemId);
    const lead =
      isProfile ? LEAD_TIMES.steelProfile
      : l.stage === 'structure' ? LEAD_TIMES.hardware
      : l.itemId === 'concrete_fck25' ? LEAD_TIMES.concrete
      : LEAD_TIMES.foundationMaterial;
    buyFirst.push({
      lineId: l.id,
      itemId: l.itemId,
      name: l.name,
      purchaseQty: l.purchaseQty,
      unit: l.unit,
      leadTimeDays: lead.days,
      leadTimeNote: lead.note,
      stage: l.stage,
    });
  }
  buyFirst.sort((a, b) => b.leadTimeDays - a.leadTimeDays || a.lineId.localeCompare(b.lineId));

  const tools = [...new Set(steps.flatMap((s) => s.tools))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return {
    projectName: project.meta.name,
    steps,
    buyFirst,
    tools,
    totalManHours: round1(steps.reduce((s, x) => s + x.manHours, 0)),
    disclaimer: DISCLAIMER,
  };
}
