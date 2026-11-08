/**
 * Perguntas do assistente. Cada uma tem título simples, uma linha de "por que perguntamos", opções com ícone e um
 * valor padrão sensato. `applies` pula as que não fazem sentido para as respostas anteriores.
 */
import { MAX_BEDROOMS, MAX_PEOPLE, type WizardAnswers } from './answers';
import { effectiveMezzanine, resolveStyle } from './style';

export type QuestionId =
  | 'purpose'
  | 'people'
  | 'bedrooms'
  | 'style'
  | 'mezzanine'
  | 'bathrooms'
  | 'bathUp'
  | 'wings'
  | 'kitchen'
  | 'laundry'
  | 'deck'
  | 'terrain'
  | 'structure'
  | 'extras'
  | 'budget';

export interface QuestionOption {
  value: string;
  label: string;
  /** Uma linha para leigo. */
  hint?: string;
  /** Chave do ícone/figura (resolvida na interface). */
  icon?: string;
}

export interface Question {
  id: QuestionId;
  title: string;
  /** "Por que perguntamos". */
  why: string;
  kind: 'choice' | 'counter' | 'terrain' | 'extras';
  options?: QuestionOption[];
  min?: number;
  max?: number;
  applies: (a: WizardAnswers) => boolean;
}

const always = () => true;

export const QUESTIONS: readonly Question[] = [
  {
    id: 'purpose',
    title: 'Para que é o chalé?',
    why: 'Muda os acabamentos que sugerimos, a durabilidade e se vale incluir lavanderia.',
    kind: 'choice',
    options: [
      { value: 'weekend', label: 'Fim de semana e férias', hint: 'Uso de vez em quando: acabamento mais aconchegante.', icon: 'sun' },
      { value: 'live', label: 'Morar', hint: 'Uso todo dia: conforto e lavanderia em casa.', icon: 'home' },
      { value: 'rent', label: 'Alugar (pousada, Airbnb)', hint: 'Muita gente passando: acabamento resistente e fácil de limpar.', icon: 'key' },
    ],
    applies: always,
  },
  {
    id: 'people',
    title: 'Quantas pessoas vão dormir nele?',
    why: 'Com isso sugerimos o número de quartos e o tamanho da casa.',
    kind: 'counter',
    min: 1,
    max: MAX_PEOPLE,
    applies: always,
  },
  {
    id: 'bedrooms',
    title: 'Quantos quartos?',
    why: 'Cada quarto aumenta a casa e o custo. Sugerimos 1 quarto para cada 2 pessoas. Uma sala com sofá-cama conta como cama extra.',
    kind: 'counter',
    min: 1,
    max: MAX_BEDROOMS,
    applies: always,
  },
  {
    id: 'style',
    title: 'Que estilo você imagina?',
    why: 'O formato do telhado define a cara do chalé, o espaço lá dentro e o custo.',
    kind: 'choice',
    options: [
      { value: 'aframe', label: 'A-frame', hint: 'Telhado até o chão, em formato de A. Muito charme, frente de vidro.', icon: 'aframe' },
      { value: 'gable', label: 'Chalé tradicional', hint: 'Duas águas, o clássico, com mezanino.', icon: 'gable' },
      { value: 'gambrel', label: 'Celeiro', hint: 'Telhado quebrado, com mais espaço lá em cima.', icon: 'gambrel' },
      { value: 'modern', label: 'Moderno', hint: 'Uma água só ou telhado plano. Caixa simples, fácil de construir.', icon: 'shed' },
      { value: 'auto', label: 'Me ajude a escolher', hint: 'Recomendamos pelo número de quartos e pelo orçamento.', icon: 'help' },
    ],
    applies: always,
  },
  {
    id: 'mezzanine',
    title: 'Quer mezanino (um andar parcial no alto)?',
    why: 'O mezanino aproveita a altura do telhado para ganhar um quarto ou um cantinho sem aumentar a casa. No A-frame baixo, o espaço em pé lá em cima é pouco.',
    kind: 'choice',
    options: [
      { value: 'none', label: 'Não', hint: 'Tudo no térreo.', icon: 'no' },
      { value: 'sleep', label: 'Sim, para dormir', hint: 'Um quarto aberto no alto, com escada.', icon: 'bed' },
      { value: 'living', label: 'Sim, para sala ou escritório', hint: 'Um canto de estar ou de trabalho no alto.', icon: 'sofa' },
    ],
    applies: (a) => ['aframe', 'gable', 'gambrel'].includes(resolveStyle(a).kind),
  },
  {
    id: 'bathrooms',
    title: 'Quantos banheiros?',
    why: 'Banheiro é o cômodo mais caro por metro quadrado, por causa de cano, louça e revestimento.',
    kind: 'choice',
    options: [
      { value: '1', label: '1 banheiro', hint: 'Basta para a maioria dos chalés.', icon: 'bath' },
      { value: '2', label: '2 banheiros', hint: 'Mais conforto para 3 ou mais pessoas.', icon: 'bath2' },
    ],
    applies: always,
  },
  {
    id: 'bathUp',
    title: 'Quer um banheiro lá em cima?',
    why: 'Banheiro no mezanino precisa da caixa d\'água mais alta que o chuveiro. Muitos chalés fazem uma torrezinha que atravessa o telhado só para isso.',
    kind: 'choice',
    options: [
      { value: 'no', label: 'Não', hint: 'Quem dorme em cima desce a escada.', icon: 'no' },
      { value: 'yes', label: 'Sim, com a torre da caixa d\'água', hint: 'Mais conforto, um pouco mais de custo.', icon: 'tower' },
    ],
    applies: (a) => effectiveMezzanine(a) !== 'none',
  },
  {
    id: 'wings',
    title: 'Quartos ou banheiro nas laterais?',
    why: 'No A-frame, cômodos encostados nas laterais ganham espaço sem aumentar o A.',
    kind: 'choice',
    options: [
      { value: 'none', label: 'Não', hint: 'Só o A.', icon: 'aframe' },
      { value: 'one', label: 'Um lado', hint: 'Um cômodo extra de um lado.', icon: 'wing1' },
      { value: 'two', label: 'Dois lados', hint: 'Cômodos nos dois lados.', icon: 'wing2' },
    ],
    applies: (a) => resolveStyle(a).kind === 'aframe',
  },
  {
    id: 'kitchen',
    title: 'Como quer a cozinha?',
    why: 'Cozinha integrada deixa a casa mais ampla e clara. Separada esconde a bagunça e o cheiro.',
    kind: 'choice',
    options: [
      { value: 'integrated', label: 'Integrada com a sala', hint: 'Mais espaço e luz, tudo junto.', icon: 'open' },
      { value: 'separate', label: 'Separada', hint: 'Um cômodo só da cozinha, com porta.', icon: 'closed' },
    ],
    applies: always,
  },
  {
    id: 'laundry',
    title: 'E a lavanderia?',
    why: 'Quem mora ou aluga costuma querer máquina de lavar. Para fim de semana, muita gente dispensa.',
    kind: 'choice',
    options: [
      { value: 'inside', label: 'Dentro de casa', hint: 'Um cômodo pequeno com tanque e máquina.', icon: 'washer' },
      { value: 'outside', label: 'Área externa coberta', hint: 'Nos fundos, sob um telhadinho.', icon: 'porch' },
      { value: 'none', label: 'Não precisa', hint: 'Sem lavanderia.', icon: 'no' },
    ],
    applies: always,
  },
  {
    id: 'deck',
    title: 'Quer varanda ou deck?',
    why: 'Varanda é a "sala de fora" do chalé: sombra, vista e um lugar para tirar o sapato.',
    kind: 'choice',
    options: [
      { value: 'none', label: 'Não', hint: 'Sem varanda.', icon: 'no' },
      { value: 'front', label: 'Na frente', hint: 'Um deck de madeira na entrada.', icon: 'deck' },
      { value: 'covered', label: 'Na frente e coberta', hint: 'Deck com telhado: dá para ficar ali na chuva.', icon: 'deckRoof' },
    ],
    applies: always,
  },
  {
    id: 'terrain',
    title: 'Como é o terreno?',
    why: 'Terreno inclinado exige corte e aterro, e isso pesa no custo. A serra também muda o frio e o vento que a casa precisa aguentar.',
    kind: 'terrain',
    options: [
      { value: 'flat', label: 'Plano', hint: 'Quase sem desnível.', icon: 'flat' },
      { value: 'gentle', label: 'Leve declive', hint: 'Dá para perceber a descida, mas anda-se bem.', icon: 'gentle' },
      { value: 'steep', label: 'Bem inclinado', hint: 'Ladeira: precisa de corte, aterro e talvez arrimo.', icon: 'steep' },
    ],
    applies: always,
  },
  {
    id: 'structure',
    title: 'Madeira ou aço na estrutura?',
    why: 'É o "esqueleto" das paredes e do telhado. Os dois funcionam bem; a diferença é o jeito e o preço.',
    kind: 'choice',
    options: [
      { value: 'steel', label: 'Aço (steel frame)', hint: 'Aço galvanizado: preciso, leve e não apodrece nem tem cupim.', icon: 'steel' },
      { value: 'wood', label: 'Madeira (wood frame)', hint: 'Madeira tratada: aconchegante e fácil de trabalhar, pede manutenção.', icon: 'wood' },
      { value: 'any', label: 'Tanto faz', hint: 'Usamos o aço, que é o mais comum.', icon: 'help' },
    ],
    applies: always,
  },
  {
    id: 'extras',
    title: 'Quer incluir mais alguma coisa?',
    why: 'Tudo isso entra no custo e dá para tirar depois. Já deixamos marcado o que costuma valer a pena.',
    kind: 'extras',
    applies: always,
  },
  {
    id: 'budget',
    title: 'Quanto pretende gastar?',
    why: 'Só usamos para comparar com o custo estimado no final e sugerir cortes. Não muda o projeto.',
    kind: 'choice',
    options: [
      { value: 'upto150', label: 'Até R$ 150 mil', icon: 'coin' },
      { value: 'b150_250', label: 'R$ 150 a 250 mil', icon: 'coin' },
      { value: 'b250_400', label: 'R$ 250 a 400 mil', icon: 'coin' },
      { value: 'over400', label: 'Acima de R$ 400 mil', icon: 'coin' },
      { value: 'unknown', label: 'Não sei ainda', icon: 'help' },
    ],
    applies: always,
  },
];

/** Perguntas que se aplicam às respostas atuais, na ordem. */
export const visibleQuestions = (a: WizardAnswers): Question[] => QUESTIONS.filter((q) => q.applies(a));

export const questionById = (id: QuestionId): Question => QUESTIONS.find((q) => q.id === id)!;
