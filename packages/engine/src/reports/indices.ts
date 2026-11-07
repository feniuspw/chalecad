/**
 * Índices de produtividade e prazos usados pelo roteiro de obra. São estimativas simples para autoconstrutor
 * (equipe sem experiência prévia em LSF), em homem-hora (Hh). Ficam aqui, e não no catálogo, porque não
 * entram em nenhum cálculo técnico nem de custo: só orientam o planejamento do roteiro.
 */
export const PRODUCTIVITY = {
  /** Locação: base fixa + por metro de perímetro do radier. */
  layoutBaseHh: 6,
  layoutPerMeterHh: 0.4,
  /** Instalações embutidas no radier: base + por ponto (esgoto/água). */
  embeddedBaseHh: 4,
  embeddedPerPointHh: 3,
  /** Radier: fôrma, lona, brita, malha, concretagem e acabamento, por m². */
  radierPerM2Hh: 0.9,
  /** Painel de parede: por peça (corte, furação, parafusagem) e por abertura (verga em caixa). */
  wallPerPieceHh: 0.1,
  wallPerOpeningHh: 1.5,
  /** Içamento, prumo e fixação por painel de transporte (equipe de 3 conta como 3 Hh por hora). */
  wallPerPanelHh: 3,
  /** Mezanino: por m² (vigas, bloqueadores e deck). */
  mezzaninePerM2Hh: 1.6,
  /** Cobertura: por peça de estrutura e por m² de telha. */
  roofPerPieceHh: 0.12,
  roofCladdingPerM2Hh: 0.35,
  /** Fechamentos e acabamentos por m² de parede líquida. */
  exteriorClosurePerM2Hh: 0.9,
  servicesPerM2BuiltHh: 0.8,
  interiorClosurePerM2Hh: 0.8,
  floorPerM2Hh: 0.5,
  finishingPerM2BuiltHh: 1.2,
} as const;

/** Prazos típicos de entrega (dias corridos) por tipo de material de compra antecipada. */
export const LEAD_TIMES = {
  /** Perfis de aço galvanizado conformados sob encomenda. */
  steelProfile: { days: 21, note: 'Perfis LSF costumam ser cortados e conformados sob encomenda: 15 a 30 dias.' },
  concrete: { days: 3, note: 'Concreto usinado: agendar a concretagem com 3 a 5 dias de antecedência.' },
  hardware: { days: 7, note: 'Parafusos, chumbadores e hold-downs: 5 a 10 dias, conferir estoque do fornecedor.' },
  foundationMaterial: { days: 3, note: 'Material de fundação em estoque no varejo: 1 a 5 dias.' },
} as const;
