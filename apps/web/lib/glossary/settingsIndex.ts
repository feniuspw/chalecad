/** Índice estático de seções das Propriedades e palavras-chave dos ajustes, para a busca. */

export type PanelSectionId =
  | 'typology'
  | 'mezzanine'
  | 'system'
  | 'roof'
  | 'foundation'
  | 'terrain'
  | 'finishes'
  | 'installations'
  | 'performance'
  | 'extras'
  | 'site';

export const SETTINGS_INDEX: { id: PanelSectionId; title: string; keywords: string[] }[] = [
  { id: 'typology', title: 'Tipologia', keywords: ['formato', 'tipo de casa', 'a-frame', 'gable', 'duas águas', 'uma água', 'gambrel', 'largura', 'comprimento', 'profundidade', 'pé-direito', 'altura das paredes', 'inclinação', 'cumeeira', 'beiral das empenas', 'empena', 'paredes', 'dimensões', 'tamanho'] },
  { id: 'mezzanine', title: 'Mezanino', keywords: ['andar', 'meio-andar', 'piso suspenso', 'escada', 'guarda-corpo', 'viga do mezanino', 'altura livre', 'nível'] },
  { id: 'system', title: 'Sistema construtivo', keywords: ['steel frame', 'lsf', 'wood frame', 'madeira', 'aço', 'espaçamento', 'montantes', 'caibros', 'perfil', 'terça', 'contraventamento', 'parede externa', 'parede interna', 'área molhada', 'osb', 'drywall', 'placa cimentícia', 'lã de pet', 'isolamento', 'empena'] },
  { id: 'roof', title: 'Cobertura', keywords: ['telhado', 'telha', 'cor da telha', 'telha sanduíche', 'beiral', 'cumeeira', 'calha', 'calhas', 'rufo', 'inclinação', 'caimento', 'eixo', 'platibanda', 'forro'] },
  { id: 'foundation', title: 'Fundação (radier)', keywords: ['radier', 'espessura', 'concreto', 'borda', 'viga de borda', 'laje', 'piso', 'base'] },
  { id: 'terrain', title: 'Terreno', keywords: ['inclinação do terreno', 'declive', 'aclive', 'corte', 'aterro', 'talude', 'platô', 'muro de arrimo', 'contenção', 'topografia', 'curvas de nível'] },
  { id: 'finishes', title: 'Acabamentos', keywords: ['piso', 'revestimento', 'pintura', 'cor', 'azulejo', 'cerâmica', 'forro', 'cômodos', 'tinta'] },
  { id: 'installations', title: 'Instalações', keywords: ['elétrica', 'hidráulica', 'tomadas', 'luz', 'chuveiro', 'aquecedor', 'caixa-d’água', 'esgoto', 'disjuntor', 'circuito', 'água quente', 'encanamento'] },
  { id: 'performance', title: 'Desempenho', keywords: ['conforto térmico', 'zona bioclimática', 'energia solar', 'painéis', 'fotovoltaico', 'água de chuva', 'cisterna', 'isolamento térmico', 'clima'] },
  { id: 'extras', title: 'Extras', keywords: ['deck', 'varanda', 'muro', 'cerca', 'piscina', 'garagem', 'pergolado', 'caminho', 'paisagismo', 'portão'] },
  { id: 'site', title: 'Local', keywords: ['estado', 'uf', 'cidade', 'vento', 'velocidade do vento', 'categoria do terreno', 'solo', 'tensão do solo', 'região', 'preços', 'localização'] },
];

export const normalizeSearch = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** Seções cujo título ou palavras-chave contêm todas as palavras digitadas (sem acento nem maiúsculas). */
export function searchSections(query: string): PanelSectionId[] {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return SETTINGS_INDEX.map((s) => s.id);
  return SETTINGS_INDEX.filter((s) => {
    const hay = normalizeSearch([s.title, ...s.keywords].join(' | '));
    return words.every((w) => hay.includes(w));
  }).map((s) => s.id);
}
