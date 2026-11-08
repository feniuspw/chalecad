/** Alertas do motor explicados em linguagem leiga: "o que quer dizer" e "o que fazer". */

export interface AlertExplanation {
  meaning: string;
  action: string;
}

const E = (meaning: string, action: string): AlertExplanation => ({ meaning, action });

export const ALERT_EXPLANATIONS: Record<string, AlertExplanation> = {
  'norm.ceiling': E('O teto está mais baixo do que a norma pede para esse tipo de cômodo. Fica abafado e pode ser reprovado na prefeitura.', 'Aumente o pé-direito em Tipologia, ou use o botão "Corrigir tudo" nesta aba.'),
  'norm.stair_headroom': E('Em algum degrau, quem sobe pode bater a cabeça no telhado ou no mezanino.', 'Mova a escada para onde o teto é mais alto, ou saia de baixo do mezanino.'),
  'norm.stair_guard': E('A escada tem um lado aberto sem proteção, e dá para cair por ali.', 'Inclua corrimão e guarda-corpo no lado aberto da escada.'),
  'norm.guardrail': E('A borda do mezanino precisa de uma proteção contra queda, com altura mínima e vãos pequenos entre as barras.', 'Ative o guarda-corpo do mezanino, ou confira a altura e o espaço entre as barras.'),
  'norm.lighting': E('As janelas são pequenas para a área do cômodo. Ele fica escuro de dia.', 'Aumente ou inclua janelas nesse cômodo. Use o botão "Corrigir tudo" para uma sugestão.'),
  'norm.safety_glass': E('Há vidro perto do chão ou em porta de correr. Se alguém bater nele, ele pode quebrar em cacos cortantes.', 'Peça vidro temperado ou laminado nessas aberturas na hora de comprar.'),
  'norm.aframe_thrust': E('No chalé em A, o telhado empurra as paredes para os lados. Se nada segurar, a base abre.', 'Peça ao engenheiro para dimensionar o tirante ou a viga de amarração na base.'),
  'room.open': E('O cômodo não está cercado de paredes. Não dá para calcular a área dele.', 'Feche o contorno com paredes, ou arraste a marca do cômodo para dentro de um espaço fechado.'),
  'room.ceiling': E('O teto desse cômodo está mais baixo do que o mínimo usual.', 'Aumente o pé-direito ou a altura do telhado nesse ponto.'),
  'room.lighting': E('Entra pouca luz natural nesse cômodo.', 'Aumente a janela, ou inclua mais uma.'),
  'room.ventilation': E('A janela abre pouco e o ar não circula bem. Pode dar mofo.', 'Escolha uma janela que abra mais, ou inclua outra.'),
  'room.area': E('O cômodo é menor do que o código de obras costuma aceitar para esse uso.', 'Aumente o cômodo ou troque o uso dele. Confira a regra da sua prefeitura.'),
  'furniture.unknown': E('Um móvel do projeto não existe mais no catálogo e foi ignorado.', 'Apague esse móvel ou troque por um da lista.'),
  'furniture.outside': E('O móvel está fora do chalé.', 'Arraste-o para dentro, encostado nas paredes.'),
  'furniture.wall': E('O móvel está atravessando uma parede.', 'Afaste o móvel até encostar na parede.'),
  'furniture.collision': E('Dois móveis estão um em cima do outro.', 'Afaste um deles.'),
  'furniture.clearance': E('Falta espaço livre para usar o móvel, por exemplo para abrir a gaveta ou sentar.', 'Deixe a folga indicada na frente do móvel.'),
  'furniture.door': E('O móvel bloqueia uma porta ou a folha dela não consegue abrir.', 'Afaste o móvel do alcance da porta.'),
  'furniture.stair': E('O móvel está em cima da escada ou da chegada dela.', 'Mude o móvel de lugar.'),
  'furniture.headroom': E('O móvel é mais alto do que o teto permite nesse ponto, onde o telhado desce.', 'Mova o móvel para a parte mais alta do cômodo, ou escolha um mais baixo.'),
  'furniture.water': E('O móvel precisa de água e esgoto, e esse cômodo não tem.', 'Mude para banheiro, cozinha ou lavanderia, ou preveja o encanamento.'),
  'furniture.circulation': E('Com os móveis, sobra pouco espaço para andar no cômodo.', 'Tire um móvel ou escolha um cômodo maior.'),
  'install.pressure': E('A água chega com pouca força nos pontos mais altos, porque a caixa-d’água está baixa.', 'Suba a caixa-d’água ou use um pressurizador.'),
  'install.no_rooms': E('Para estimar a parte elétrica e a hidráulica, o app precisa saber quais são os cômodos.', 'Marque os cômodos na planta e escolha o uso de cada um.'),
  'install.tank_load': E('A caixa-d’água cheia pesa muito. A torre ou o telhado precisa aguentar esse peso.', 'Peça ao engenheiro para conferir o apoio da caixa.'),
  'install.wire_table': E('A corrente de um circuito passou do que o maior fio da tabela aguenta.', 'Divida em dois circuitos, e peça a revisão de um eletricista ou engenheiro.'),
  'install.shower_wire': E('O chuveiro elétrico puxa muita energia e pede fio mais grosso e disjuntor próprio.', 'Compre o fio e o disjuntor indicados no relatório de instalações.'),
  'install.demand': E('A casa pode usar mais energia do que uma entrada comum fornece.', 'Consulte a concessionária de energia. Pode ser preciso entrada trifásica.'),
  'thermal.wall_u': E('A parede deixa passar calor demais para o seu clima. A casa esquenta ou esfria rápido.', 'Use mais isolante na parede, ou pinte de cor clara.'),
  'thermal.wall_ct': E('Parede leve guarda pouco calor, então a temperatura interna varia muito durante o dia.', 'Peça uma simulação térmica a um profissional, ou reforce o isolamento.'),
  'thermal.roof_u': E('O telhado deixa passar calor demais para o seu clima.', 'Use telha com mais isolante, cor clara ou acrescente forro.'),
  'solar.area': E('Os painéis solares não cabem no telhado na quantidade que o consumo pede.', 'Use mais de uma água do telhado, coloque os painéis no chão ou reduza o consumo estimado.'),
  'wood.index': E('Esse chalé usa mais ou menos madeira do que o normal para a área. Pode estar caro ou fraco.', 'Revise as seções das peças e o espaçamento entre elas em Sistema construtivo.'),
  'wood.treatment': E('Madeira em contato com umidade apodrece e atrai cupim.', 'Compre madeira tratada em autoclave e coloque uma barreira de umidade entre o radier e a madeira.'),
  'steel.index': E('Esse chalé usa mais ou menos aço do que o normal para a área. Pode estar caro ou fraco.', 'Revise os perfis e o espaçamento entre montantes em Sistema construtivo.'),
  'system.profile_mismatch': E('Há perfis de aço num projeto de madeira, ou o contrário.', 'Em Sistema construtivo, troque os perfis marcados por perfis do mesmo material.'),
  'mezzanine.headroom': E('Falta altura livre em cima ou embaixo do mezanino. Alguém adulto pode bater a cabeça.', 'Aumente o pé-direito, diminua o mezanino ou mude a altura dele.'),
  'stair.riser': E('Os degraus são altos demais. A escada fica cansativa e perigosa.', 'Aumente o comprimento da escada, ou acrescente degraus.'),
  'stair.blondel': E('A escada foge da regra do conforto: o degrau está alto ou estreito demais para o passo de uma pessoa.', 'Ajuste o número de degraus ou o comprimento da escada.'),
  'terrain.steep': E('O terreno é muito inclinado para um radier simples.', 'Considere estacas ou pilotis e peça um projeto de fundação.'),
  'terrain.cut_height': E('O corte de terra deixa um barranco alto, que pode desmoronar.', 'Peça projeto de contenção ou de geotecnia antes de cortar.'),
  'terrain.fill_under': E('Parte da casa vai ficar em cima de terra de aterro, que pode afundar.', 'Compacte o aterro em camadas, com controle, ou desça a casa para o corte.'),
  'opening.invalid': E('Uma porta ou janela está em lugar onde não cabe ou numa parede que não existe mais.', 'Selecione a abertura e mova para uma parede que a comporte, ou apague.'),
  'opening.modulation': E('Se você deslocar essa abertura alguns centímetros, usa menos peças e economiza material.', 'É só uma dica. Mova a abertura se não atrapalhar o projeto.'),
  'price.missing': E('Alguns itens não têm preço na base e entraram no orçamento como R$ 0,00.', 'Informe o preço em Preços, ou o total fica menor do que a realidade.'),
  'price.stale': E('Alguns preços são antigos e podem ter mudado.', 'Peça um orçamento atualizado e atualize em Preços.'),
  'typology.partial': E('Esse formato de telhado ainda não tem a estrutura calculada, então o total está incompleto.', 'Use os números só como referência e peça o orçamento da cobertura ao fornecedor.'),
  'extras.ignored': E('Alguns extras do projeto ainda não entram nas contas.', 'Some o valor dos extras à parte.'),
  'roof.parapet': E('A platibanda é mais baixa do que o telhado, então ele vai aparecer por cima dela.', 'Aumente a altura da platibanda ou diminua a inclinação do telhado.'),
  'retaining.engineer': E('Muro de arrimo segura terra e pode cair se for mal feito.', 'Só construa com projeto de engenheiro.'),
};

const FALLBACK_BY_PREFIX: Record<string, AlertExplanation> = {
  norm: E('Algo no projeto não atende a uma norma técnica brasileira.', 'Leia a mensagem, ajuste o item indicado ou confirme com um engenheiro.'),
  room: E('Há um ponto a revisar nesse cômodo.', 'Leia a mensagem e ajuste o cômodo.'),
  furniture: E('Há um problema com a posição de um móvel.', 'Mude o móvel de lugar.'),
  install: E('Há um ponto a conferir nas instalações elétricas ou hidráulicas.', 'Confirme com um eletricista ou encanador.'),
  thermal: E('O conforto térmico da casa pode ficar abaixo do esperado.', 'Reforce o isolamento ou use cores claras.'),
};

export function explainAlert(code: string): AlertExplanation | null {
  return ALERT_EXPLANATIONS[code] ?? FALLBACK_BY_PREFIX[code.split('.')[0] ?? ''] ?? null;
}

/** Texto leigo por tipo de verificação estrutural reprovada ou em atenção. */
export const STRUCTURE_FAIL_TEXT: Record<string, string> = {
  stud: 'O montante não aguenta o peso desse trecho de parede: ela pode empenar. Use um perfil mais forte ou aproxime os montantes.',
  gable_stud: 'O montante da parede triangular da frente ou do fundo está fraco para o vento. Use um perfil mais forte ou aproxime os montantes.',
  joist: 'A viga está curta para esse vão: o piso de cima pode balançar ou ceder. Use uma viga mais alta ou aproxime as vigas.',
  rafter: 'O caibro está fraco para esse vão de telhado: ele pode envergar com o peso ou o vento. Use um perfil maior ou diminua o espaço entre eles.',
  header: 'A verga em cima dessa porta ou janela está fraca para o vão: a parede acima pode ceder. Use um perfil duplo ou mais forte.',
  bracing: 'Faltam travamentos em diagonal: a casa pode balançar de lado com vento forte. Inclua mais contraventamento.',
  anchorage: 'A fixação da casa no radier está fraca: o vento pode levantar ou arrastar a estrutura. Aumente os chumbadores.',
  soil: 'O solo pode não aguentar o peso da casa nessa área: ela pode afundar. Aumente a borda do radier ou confirme a resistência do solo.',
  purlin: 'A terça está fraca para o vão: o telhado pode envergar. Use um perfil maior ou aproxime as terças.',
};

export function structureFailText(kind: string): string | null {
  return STRUCTURE_FAIL_TEXT[kind] ?? null;
}
