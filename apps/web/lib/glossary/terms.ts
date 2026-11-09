/** Glossário em linguagem leiga. Puro: sem React, usado para realçar termos técnicos na interface. */

export interface GlossaryTerm {
  id: string;
  /** Nome exibido no tooltip. */
  label: string;
  /** Formas que aparecem nos textos (sem acento ou maiúsculas, a não ser com `caseSensitive`). Plural com "s" é aceito. */
  aliases: string[];
  /** Siglas curtas só casam com a mesma caixa, para não pegar palavras comuns. */
  caseSensitive?: boolean;
  short: string;
  why?: string;
}

export const TERMS: GlossaryTerm[] = [
  { id: 'lsf', label: 'LSF (steel frame)', aliases: ['LSF', 'steel frame'], short: 'Estrutura feita de perfis de aço galvanizado leves, parafusados entre si. As paredes são um esqueleto fechado com placas.', why: 'É leve, rápida de montar e não cupiniza.' },
  { id: 'wood_frame', label: 'Wood frame', aliases: ['wood frame'], short: 'Mesma ideia do steel frame, mas o esqueleto das paredes é de madeira tratada.', why: 'Madeira pede tratamento e proteção contra umidade.' },
  { id: 'radier', label: 'Radier', aliases: ['radier'], short: 'Laje de concreto armado que apoia a casa inteira direto no chão. Serve de fundação e de piso.', why: 'É a fundação mais comum em chalés leves.' },
  { id: 'montante', label: 'Montante', aliases: ['montante'], short: 'Perfil vertical que forma o esqueleto da parede. Fica de pé, a cada 40 ou 60 cm.', why: 'Quanto mais perto um do outro, mais forte a parede.' },
  { id: 'guia', label: 'Guia', aliases: ['guia'], short: 'Perfil horizontal, no chão e no teto da parede, onde os montantes se encaixam.' },
  { id: 'verga', label: 'Verga', aliases: ['verga'], short: 'Viga curta sobre uma porta ou janela. Segura o peso que ficaria em cima do vão.', why: 'Sem ela a parede acima da abertura pode ceder.' },
  { id: 'caibro', label: 'Caibro', aliases: ['caibro'], short: 'Peça inclinada do telhado, que vai do beiral até a parte mais alta. Sustenta as terças e as telhas.' },
  { id: 'terca', label: 'Terça', aliases: ['terça', 'cartola'], short: 'Peça horizontal do telhado, apoiada nos caibros, onde as telhas são fixadas.' },
  { id: 'cumeeira', label: 'Cumeeira', aliases: ['cumeeira'], short: 'A linha mais alta do telhado, onde as duas águas se encontram.' },
  { id: 'mezanino', label: 'Mezanino', aliases: ['mezanino'], short: 'Um meio-andar dentro do pé-direito alto, normalmente um quarto ou espaço de estar suspenso.', why: 'Precisa de escada e guarda-corpo e de altura livre para ficar em pé.' },
  { id: 'empena', label: 'Empena', aliases: ['empena'], short: 'A parede da lateral da casa com a ponta de triângulo, que sobe até a cumeeira.' },
  { id: 'beiral', label: 'Beiral', aliases: ['beiral'], short: 'A parte do telhado que passa para fora da parede.', why: 'Protege a parede da chuva e do sol.' },
  { id: 'osb', label: 'OSB', aliases: ['OSB'], caseSensitive: true, short: 'Placa de lascas de madeira prensadas. Fecha a parede por fora e dá rigidez à estrutura.' },
  { id: 'placa_cimenticia', label: 'Placa cimentícia', aliases: ['placa cimentícia', 'cimentícia'], short: 'Placa de cimento reforçada com fibras, resistente à água. Usada nas paredes externas e áreas molhadas.' },
  { id: 'drywall', label: 'Drywall', aliases: ['drywall', 'gesso acartonado'], short: 'Placa de gesso com papel, usada nas paredes e forros internos secos.', why: 'Não vai em áreas molhadas.' },
  { id: 'la_pet', label: 'Lã de PET', aliases: ['lã de PET', 'lã de pet'], short: 'Isolante feito de garrafas PET recicladas. Fica dentro da parede para segurar o calor e o barulho.' },
  { id: 'telha_sanduiche', label: 'Telha sanduíche', aliases: ['telha sanduíche', 'telhas sanduíche'], short: 'Telha de duas chapas de aço com isolante no meio. Já faz o forro e segura o calor e o barulho da chuva.' },
  { id: 'contraventamento', label: 'Contraventamento', aliases: ['contraventamento'], short: 'Fitas ou peças em diagonal que impedem a estrutura de torcer com o vento.', why: 'Sem ele a casa pode balançar de lado.' },
  { id: 'flecha', label: 'Flecha', aliases: ['flecha'], short: 'O quanto uma viga entorta no meio quando recebe peso. Se passar do limite, o piso balança ou racha o acabamento.' },
  { id: 'taxa_uso', label: 'Taxa de uso', aliases: ['taxa de uso'], short: 'Quanto da capacidade de uma peça está sendo usada. 1,00 é o limite: abaixo está folgado, acima precisa reforçar.' },
  { id: 'kn', label: 'kN (quilonewton)', aliases: ['kN'], caseSensitive: true, short: 'Unidade de força. 1 kN equivale a mais ou menos 100 kg de peso.' },
  { id: 'pe_direito', label: 'Pé-direito', aliases: ['pé-direito', 'pé direito'], short: 'A altura livre do piso até o teto.', why: 'As normas pedem pelo menos 2,50 m nas salas e quartos.' },
  { id: 'guarda_corpo', label: 'Guarda-corpo', aliases: ['guarda-corpo'], short: 'Proteção na borda de escada, varanda ou mezanino, para ninguém cair.', why: 'É obrigatório acima de certa altura.' },
  { id: 'art', label: 'ART', aliases: ['ART'], caseSensitive: true, short: 'Anotação de Responsabilidade Técnica: o documento em que um engenheiro assume o projeto.', why: 'Prefeitura e banco costumam exigir.' },
  { id: 'nbr', label: 'NBR', aliases: ['NBR'], caseSensitive: true, short: 'Norma técnica brasileira, escrita pela ABNT. Define o mínimo de segurança e conforto.' },
  { id: 'zona_bioclimatica', label: 'Zona bioclimática', aliases: ['zona bioclimática'], short: 'Uma das 8 regiões do Brasil com clima parecido. Define quanto a casa precisa isolar do frio ou do calor.' },
  { id: 'transmitancia', label: 'Transmitância térmica (U)', aliases: ['transmitância térmica', 'transmitância'], short: 'Quanto calor passa pela parede ou pelo telhado. Quanto menor, melhor o isolamento.' },
  { id: 'capacidade_termica', label: 'Capacidade térmica (CT)', aliases: ['capacidade térmica', 'CT'], short: 'Quanto calor a parede consegue guardar. Paredes leves guardam pouco e esquentam e esfriam rápido.' },
  { id: 'absortancia', label: 'Absortância', aliases: ['absortância'], short: 'Quanto da luz do sol a superfície absorve. Cor escura absorve mais e esquenta mais; cor clara reflete.' },
  { id: 'kwp', label: 'kWp', aliases: ['kWp'], caseSensitive: true, short: 'Potência dos painéis solares no melhor momento do dia. Uma casa pequena costuma usar de 2 a 4 kWp.' },
  { id: 'tue', label: 'TUE', aliases: ['TUE'], caseSensitive: true, short: 'Tomada de uso específico: uma tomada exclusiva para um aparelho forte, como chuveiro, forno ou ar-condicionado.' },
  { id: 'circuito', label: 'Circuito', aliases: ['circuito'], short: 'Um caminho de fios que sai do quadro de luz e alimenta um grupo de tomadas ou luzes.', why: 'Cada circuito tem seu próprio disjuntor.' },
  { id: 'disjuntor', label: 'Disjuntor', aliases: ['disjuntor'], short: 'Chave no quadro de luz que desliga sozinha se a corrente passar do limite do fio.', why: 'Evita superaquecimento e incêndio.' },
  { id: 'dr', label: 'DR', aliases: ['DR'], caseSensitive: true, short: 'Dispositivo diferencial residual: desliga a energia se houver fuga de corrente, como num choque.' },
  { id: 'dps', label: 'DPS', aliases: ['DPS'], caseSensitive: true, short: 'Dispositivo de proteção contra surtos: um para-raios do quadro de luz, que desvia o pico de tensão de raios e da rede para a terra.', why: 'Protege eletrônicos e a geladeira. A norma o exige em muitos casos.' },
  { id: 'queda_tensao', label: 'Queda de tensão', aliases: ['queda de tensão'], short: 'Quanto a tensão diminui entre o quadro e a tomada ou luz, por causa da resistência do fio. Quanto mais longo e fino o fio, maior a queda.', why: 'Acima de 4% as lâmpadas piscam e os motores sofrem.' },
  { id: 'lux', label: 'Lux', aliases: ['lux'], short: 'Unidade de iluminância: quanta luz chega ao piso ou à mesa. Uma sala confortável fica perto de 150 lux; uma cozinha, 250.', why: 'É o que o projeto luminotécnico confere contra o alvo de cada cômodo.' },
  { id: 'caixa_sifonada', label: 'Caixa sifonada', aliases: ['caixa sifonada'], short: 'Caixa no piso do banheiro que recebe a água do ralo e segura o mau cheiro do esgoto.' },
  { id: 'coluna_agua', label: 'Coluna d’água', aliases: ['coluna d’água', "coluna d'água", 'coluna de água', 'm.c.a.'], short: 'Altura da caixa-d’água acima da torneira. Quanto mais alta, mais forte a pressão.', why: 'Chuveiro precisa de pelo menos 1 a 2 metros.' },
  { id: 'a_frame', label: 'A-frame', aliases: ['A-frame'], short: 'Chalé em formato de A: o telhado desce até perto do chão e faz também as paredes laterais.' },
  { id: 'gambrel', label: 'Gambrel (telhado de celeiro)', aliases: ['gambrel'], short: 'Telhado com duas inclinações em cada lado, mais íngreme embaixo. Ganha espaço no andar de cima.' },
  { id: 'deck', label: 'Deck', aliases: ['deck'], short: 'Piso externo de madeira, como uma varanda aberta.' },
  { id: 'plato', label: 'Platô', aliases: ['platô'], short: 'A área plana do terreno onde a casa vai ficar, depois de cortar ou aterrar.' },
  { id: 'talude', label: 'Talude', aliases: ['talude'], short: 'A rampa de terra que sobra na beirada do platô, entre a parte aplainada e o terreno natural.', why: 'Se for alto ou íngreme, pode precisar de muro de contenção.' },
  { id: 'pad', label: 'Área aplainada (pad)', aliases: ['área aplainada', 'pad', 'aplainar área'], short: 'Uma plataforma nivelada que você desenha no terreno inclinado (garagem, quintal, piscina), além do platô da casa. Cada uma tem sua cota, e o terreno em volta é cortado ou aterrado para encontrá-la.', why: 'Onde o talude não cabe, o programa sugere um muro de arrimo na borda.' },
  { id: 'muro_arrimo', label: 'Muro de arrimo', aliases: ['muro de arrimo', 'muro de contenção', 'arrimo'], short: 'Muro que segura a terra no desnível entre dois níveis do terreno: no corte, contém o barranco; no aterro, segura a plataforma.', why: 'Acima de 1,5 m (corte) ou 1 m (aterro) costuma valer mais que o talude. Muros altos exigem projeto geotécnico (NBR 11682).' },
  { id: 'corte_aterro', label: 'Corte e aterro', aliases: ['corte e aterro', 'aterro'], short: 'Tirar terra da parte alta (corte) e usar para completar a parte baixa (aterro) até o terreno ficar plano.' },
  { id: 'contingencia', label: 'Contingência', aliases: ['contingência'], short: 'Uma reserva em dinheiro para imprevistos da obra, somada ao total.', why: 'Obras quase sempre custam um pouco mais do que o previsto.' },
  { id: 'blondel', label: 'Fórmula de Blondel', aliases: ['fórmula de Blondel', 'Blondel'], short: 'Regra para escada confortável: o dobro da altura do degrau mais a largura dele deve dar de 63 a 64 cm.' },
  { id: 'espelho', label: 'Espelho', aliases: ['espelho'], short: 'A altura de cada degrau da escada. Se for alta demais, a escada fica cansativa e perigosa.' },
  { id: 'rufo', label: 'Rufo', aliases: ['rufo', 'rufos'], short: 'Chapa metálica dobrada que veda o encontro do telhado com a parede, para a chuva não entrar.' },
  { id: 'calha', label: 'Calha', aliases: ['calha'], short: 'Canal na beirada do telhado que recolhe a água da chuva e leva para o cano de descida.' },
  { id: 'platibanda', label: 'Platibanda', aliases: ['platibanda'], short: 'Muro baixo que esconde o telhado na fachada.' },
  { id: 'vao', label: 'Vão', aliases: ['vão'], short: 'A distância livre entre dois apoios, ou o buraco de uma porta ou janela.' },
  { id: 'ancoragem', label: 'Ancoragem', aliases: ['ancoragem'], short: 'Chumbadores que prendem a estrutura ao radier, para o vento não levantar ou arrastar a casa.' },
  { id: 'tensao_solo', label: 'Tensão admissível do solo', aliases: ['tensão admissível'], short: 'O peso que o solo aguenta por área sem afundar. Solo mole aguenta pouco e pede fundação maior.' },
  { id: 'trifasica', label: 'Entrada trifásica', aliases: ['trifásica', 'trifásico'], short: 'Ligação da concessionária com três fios de fase, para casas com muita demanda de energia.' },
  { id: 'cca', label: 'Madeira tratada (autoclave)', aliases: ['autoclave'], short: 'Madeira que recebe produto preservante sob pressão, para resistir a cupim e fungo.' },
  { id: 'rrt', label: 'RRT', aliases: ['RRT'], caseSensitive: true, short: 'Registro de Responsabilidade Técnica: o equivalente da ART para arquitetos e urbanistas, emitido no sistema do CAU.', why: 'Sem ela o projeto de arquitetura não tem responsável legal.' },
  { id: 'taxa_ocupacao', label: 'Taxa de ocupação (TO)', aliases: ['taxa de ocupação'], short: 'Quanto do lote a casa ocupa, vista de cima, em porcentagem. Casa de 100 m² em lote de 360 m² tem 28%.', why: 'A lei de zoneamento define o máximo.' },
  { id: 'coef_aproveitamento', label: 'Coeficiente de aproveitamento (CA)', aliases: ['coeficiente de aproveitamento'], short: 'Área construída somando todos os pavimentos, dividida pela área do lote. CA 1,0 em lote de 360 m² permite 360 m² construídos.', why: 'Limita o tamanho total da obra, não só o térreo.' },
  { id: 'taxa_permeabilidade', label: 'Taxa de permeabilidade (TP)', aliases: ['taxa de permeabilidade'], short: 'Parte do lote que fica sem piso impermeável, deixando a chuva infiltrar no solo.', why: 'A prefeitura exige um mínimo para evitar alagamentos.' },
  { id: 'recuo', label: 'Recuo', aliases: ['recuo'], short: 'Distância mínima entre a casa e a divisa do lote (frente, lados e fundos).', why: 'Definido pela lei de zoneamento; invadir o recuo impede a aprovação.' },
  { id: 'matricula', label: 'Matrícula', aliases: ['matrícula'], short: 'Número do registro do imóvel no cartório. Está na certidão do terreno.', why: 'A prefeitura e o conselho pedem para identificar o imóvel.' },
  { id: 'alvara', label: 'Alvará', aliases: ['alvará'], short: 'Licença da prefeitura para construir. Sai depois que o projeto legal é aprovado.', why: 'Obra sem alvará pode ser embargada e multada.' },
  { id: 'spt', label: 'SPT', aliases: ['SPT'], caseSensitive: true, short: 'Sondagem de simples reconhecimento do solo: furos que medem a resistência a cada metro.', why: 'Dá a tensão admissível real do solo para a fundação.' },
  { id: 'projeto_legal', label: 'Projeto legal', aliases: ['projeto legal'], short: 'Conjunto de pranchas e documentos que a prefeitura analisa para liberar o alvará.', why: 'Mostra implantação, plantas, cortes, fachadas e quadro de áreas.' },
  { id: 'projeto_executivo', label: 'Projeto executivo', aliases: ['projeto executivo'], short: 'Projeto com todos os detalhes para construir: estrutura, instalações e especificações.', why: 'É o que a obra segue; o legal só serve à aprovação.' },
  { id: 'carimbo', label: 'Carimbo', aliases: ['carimbo'], short: 'Quadro no canto da prancha com obra, proprietário, responsável técnico, escala, data e revisão.', why: 'Toda prancha de aprovação precisa dele.' },
];

const strip = (s: string): string =>
  Array.from(s)
    .map((c) => {
      const n = c.normalize('NFD').replace(/[̀-ͯ]/g, '');
      return n.length === 1 ? n : c;
    })
    .join('');

const norm = (s: string): string => strip(s).toLowerCase();
const isWord = (c: string | undefined): boolean => c !== undefined && /[\p{L}\p{N}]/u.test(c);

export const TERM_BY_ID: Record<string, GlossaryTerm> = Object.fromEntries(TERMS.map((t) => [t.id, t]));

interface Matcher {
  id: string;
  alias: string;
  cs: boolean;
}
const MATCHERS: Matcher[] = TERMS.flatMap((t) =>
  t.aliases.map((a) => ({ id: t.id, alias: t.caseSensitive ? strip(a) : norm(a), cs: !!t.caseSensitive })),
).sort((a, b) => b.alias.length - a.alias.length);

export interface TermMatch {
  id: string;
  start: number;
  end: number;
  text: string;
}

/**
 * Acha os termos do glossário num texto: só a primeira ocorrência de cada termo, sem sobreposição
 * e sem casar dentro de palavras ("radiere" não casa com "radier"). Ignora acento e maiúsculas
 * (exceto siglas). Plural simples com "s" também casa.
 */
export function findTerms(text: string): TermMatch[] {
  const plain = strip(text);
  const low = plain.toLowerCase();
  const found: TermMatch[] = [];
  const seen = new Set<string>();
  const taken: [number, number][] = [];
  for (const m of MATCHERS) {
    if (seen.has(m.id)) continue;
    const hay = m.cs ? plain : low;
    let from = 0;
    for (;;) {
      const i = hay.indexOf(m.alias, from);
      if (i < 0) break;
      from = i + 1;
      let end = i + m.alias.length;
      if (isWord(hay[i - 1])) continue;
      if (!m.cs && hay[end] === 's' && !isWord(hay[end + 1])) end += 1;
      if (isWord(hay[end])) continue;
      if (taken.some(([a, b]) => i < b && end > a)) continue;
      taken.push([i, end]);
      seen.add(m.id);
      found.push({ id: m.id, start: i, end, text: text.slice(i, end) });
      break;
    }
  }
  return found.sort((a, b) => a.start - b.start);
}
