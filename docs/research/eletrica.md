# Pesquisa: projeto elétrico e luminotécnico no ChaléCAD

> Pesquisa de referência para transformar o estimador simplificado (`packages/engine/src/installations`) numa ferramenta de projeto elétrico e de iluminação desenhada em planta, com nível de engenharia e aderente às normas brasileiras.
> Data: 2026-11-08. Autor: agente de pesquisa. **Não substitui projeto elétrico com ART.**

## Como ler este documento

- **[N]** = requisito normativo (NBR 5410:2004, salvo indicação). **[P]** = prática de mercado (manuais de fabricantes, apostilas, concessionárias). **[?]** = valor incerto ou com divergência entre fontes. Esses casos precisam de conferência antes de virarem regra "bloqueante".
- As tabelas da ABNT são protegidas por direito autoral. Os valores abaixo são os publicados em manuais e catálogos de fabricantes (Prysmian/Pirelli, Procobre, Sil, Nambei), apostilas universitárias e guias técnicos, que os reproduzem a partir da norma (que por sua vez segue a IEC 60364-5-52).
- **Status da norma (nov/2026):** a NBR 5410:2004 (com a errata de 2008) continua vigente. A revisão está em consulta pública, ainda não publicada. Entre as propostas estão DR em todos os circuitos residenciais, AFDD (detector de arco) recomendado em dormitórios e nova potência por ponto de iluminação. A nova NR-10 (Portaria 737, de 29/05/2026) passou a incorporar requisitos da NBR 5410. **Recomendação:** guardar no catálogo uma `normEdition: 'NBR5410:2004'` e deixar os limites versionados, para trocar quando a revisão sair.
  - Fontes: [O Setor Elétrico: revisão da NBR 5410](https://www.osetoreletrico.com.br/?p=165324) · [Canal Solar: revisão da 5410](https://canalsolar.com.br/revisao-da-nbr-5410-abrangera-instalacoes-em-vias-publicas/) · [O Setor Elétrico: potência por ponto de iluminação na revisão](https://www.osetoreletrico.com.br/?p=167292) · [Sienge: NBR 5410](https://sienge.com.br/blog/nbr-5410/)

## 0. O que já existe no ChaléCAD (e o que falta)

O estimador atual (`points.ts`, `circuits.ts`, `constants.installations`) já faz:

- pontos de luz (carga 100 VA + 60 VA/4 m²), interruptor junto à porta a 1,10 m, TUG por perímetro (5 m; 3,5 m em cozinha e lavanderia; 600 VA nas 3 primeiras de áreas molhadas), TUE para chuveiro, lavadora e geladeira;
- agrupamento de circuitos por "bin packing" com 2.200 VA por circuito, cozinha e lavanderia em circuitos exclusivos, TUE > 1.200 W em circuito próprio;
- seção e disjuntor por uma tabela única `wireTable` (corrente → seção → disjuntor), comprimento por distância Manhattan × 1,3 + 2,2 m por ponto, demanda = 0,7 × carga instalada.

Lacunas em relação a um projeto de engenharia (tratadas nas seções abaixo):

| Lacuna | Onde está a solução |
|---|---|
| Tensão fixa em 220 V; não há 127 V nem circuitos bifásicos (F-F) | §1.6, §8 |
| Seção só pela corrente, sem método de instalação, agrupamento (FCA) nem temperatura (FCT) | §2.1–2.3 |
| Não verifica queda de tensão (4% no circuito terminal, 5% desde o ponto de entrega) | §2.5 |
| Não modela DR, DPS, condutor de proteção (PE) nem esquema de aterramento | §2.7–2.9 |
| Eletrodutos só como comprimento; sem diâmetro, taxa de ocupação, caixas, curvas | §3 |
| Fator de demanda plano (0,7); sem tabela de concessionária nem categoria de entrada | §4 |
| Iluminação só como carga (VA); sem lux, lúmens, luminária nem comando | §5 |
| Pontos não editáveis pelo usuário (gerados, não desenhados) | §6, §8 |
| Banheiro sem verificação de volumes (tomada a ≥ 0,60 m do box) | §1.1, §8.3 |

---

## 1. NBR 5410: previsão de cargas e divisão de circuitos (item 9.5)

### 1.1 Pontos de iluminação [N 9.5.2.1]

- Cada cômodo ou dependência deve ter **pelo menos 1 ponto de luz fixo no teto, comandado por interruptor**.
- Em banheiros, admite-se o ponto de luz na parede (arandela), desde que fora dos volumes proibidos e a pelo menos 0,60 m do limite do box ou banheira.
- Em áreas externas a norma não fixa um mínimo. Para as áreas externas das unidades residenciais, a potência é definida pelo projetista.

**Carga mínima de iluminação** (só para dimensionar circuitos; não é a potência real das lâmpadas LED):

| Área do cômodo A (m²) | Carga mínima (VA) |
|---|---|
| A ≤ 6 | 100 |
| A > 6 | 100 + 60 × floor((A − 6) / 4) |

Exemplos: 12 m² → 100 + 60 × 1 = 160 VA; 14 m² → 100 + 60 × 2 = 220 VA. Só **múltiplos inteiros** de 4 m² contam (floor, não ceil).

> Observação de projeto: com LED, a potência real instalada fica muito abaixo do mínimo normativo (ex.: sala de 20 m² → norma 280 VA; LED real ≈ 60–90 W). O ChaléCAD deve usar **max(carga normativa, soma das luminárias reais)** como potência de projeto do circuito, e mostrar as duas.

### 1.2 Pontos de tomada de uso geral (TUG): quantidade [N 9.5.2.2.1]

| Cômodo | Quantidade mínima | Observações |
|---|---|---|
| Banheiro | 1 junto ao lavatório | Respeitar volumes (9.1): tomada **a ≥ 0,60 m do box/banheira**; nada nos volumes 0, 1 e 2, exceto SELV ou tomada para barbeador com transformador de separação |
| Cozinha, copa, copa-cozinha, área de serviço, lavanderia e similares | 1 a cada **3,5 m de perímetro** ou fração | **Acima de cada bancada com largura ≥ 0,30 m: pelo menos 2 tomadas**, no mesmo ponto ou em pontos distintos |
| Varanda | 1 | Se a varanda não comportar o ponto por razões construtivas (área < 2 m² ou profundidade < 0,80 m), ele pode ficar fora, próximo ao acesso |
| Sala e dormitório | 1 a cada **5 m de perímetro** ou fração | Espaçamento o mais uniforme possível |
| Demais cômodos (circulação, hall, depósito, garagem, sótão) | A ≤ 2,25 m²: 1 (pode ficar fora do cômodo, a até 0,80 m da porta) · 2,25 < A ≤ 6 m²: 1 · A > 6 m²: 1 a cada 5 m de perímetro ou fração | |

Fórmula: `n = max(min_cômodo, ceil(perímetro / passo))`, com passo de 3,5 m ou 5 m.

> O perímetro é medido no contorno interno do cômodo. A prática admite descontar vãos de portas, mas a norma fala em perímetro, então o ChaléCAD deve usar o perímetro inteiro (mais conservador).

### 1.3 Potência das TUG [N 9.5.2.2.2]

| Local | Potência mínima por ponto |
|---|---|
| Banheiro, cozinha, copa, copa-cozinha, área de serviço, lavanderia e similares | **600 VA por ponto até 3 pontos, e 100 VA nos excedentes**, contando cada ambiente separadamente. **Se o total de pontos nesse conjunto de ambientes passar de 6**, admite-se 600 VA nos 2 primeiros pontos de cada ambiente e 100 VA nos demais [?: há fontes que leem a regra de forma diferente; ver nota] |
| Demais cômodos | **100 VA por ponto** |

Nota [?]: a alínea sobre "mais de 6 pontos" aparece com redações diferentes em apostilas. A leitura mais comum: quando o conjunto (cozinha + área de serviço + banheiro…) tem mais de 6 tomadas, cada ambiente fica com 600 VA × 2 + 100 VA × restantes. Implementar como **opção** (`wetOver6Rule: true`), com a regra 600 × 3 como padrão conservador.

### 1.4 Tomadas de uso específico (TUE) [N 9.5.2.3]

- Potência = potência nominal do equipamento (VA). Quando ela não é conhecida, usar a potência nominal do equipamento mais potente que possa ser ligado ali, ou a tabela típica abaixo.
- A TUE fica a no máximo 1,5 m do local previsto para o equipamento.

Potências típicas para pré-cadastro [P] (Procobre, manuais de concessionárias):

| Equipamento | Potência típica (W) | Tensão usual | Observação |
|---|---|---|---|
| Chuveiro elétrico | 5.500 (127 V: 4.400–5.500; 220 V: 5.500–7.500) | 220 V preferível | 127 V × 5.500 W = 43 A: exige 10 mm² |
| Torneira elétrica | 3.500–5.500 | 220 V | |
| Aquecedor de passagem/boiler | 1.500–3.000 | 220 V | |
| Forno elétrico de embutir | 2.000–3.500 | 220 V | |
| Cooktop indução (4 bocas) | 5.000–7.500 | 220 V | |
| Micro-ondas | 1.200–1.500 | | TUE se > 10 A em 127 V |
| Lava-louças | 1.500–2.000 | | |
| Máquina de lavar roupa | 1.000–1.500 | | |
| Secadora | 2.500–3.500 | 220 V | |
| Ar-condicionado split 9.000 BTU/h | 900–1.000 | 220 V | Inverter ≈ 750 W |
| Ar-condicionado split 12.000 BTU/h | 1.200–1.400 | 220 V | |
| Ar-condicionado split 18.000 BTU/h | 1.800–2.000 | 220 V | |
| Geladeira/freezer | 150–500 | | Pode ficar em TUG; boa prática é TUE |
| Bomba d'água ½ cv | 750 (fator de potência ~0,8 → ~950 VA) | | Curva C (partida) |
| Portão eletrônico | 300–500 | | |
| Carregador veicular (wallbox) 7,4 kW | 7.400 | 220 V | DR tipo A ou B; circuito exclusivo |

### 1.5 Divisão da instalação em circuitos [N 9.5.3]

1. **Iluminação e tomadas em circuitos separados** (regra). Exceção [N]: admite-se circuito misto (iluminação + TUG que não sejam de cozinha ou área de serviço) se: (a) a corrente de projeto for ≤ 16 A; (b) nem toda a iluminação estiver num único circuito misto; (c) nem todas as tomadas estiverem num único circuito misto. O ChaléCAD deve **separar por padrão** e permitir misto só em modo avançado, com validação dessas três condições.
2. **Todo ponto com corrente nominal > 10 A deve ter circuito independente** (TUE). Em 127 V isso dá > 1.270 VA; em 220 V, > 2.200 VA. O código atual usa 1.200 W fixo (conservador em 220 V, correto em 127 V). Trocar por `I_n > 10 A`.
3. **Tomadas de cozinha, copa, copa-cozinha, área de serviço, lavanderia e similares: circuitos exclusivos desses locais** (não podem dividir circuito com sala, quarto etc.). Banheiro **não** está nessa lista, mas exige DR (§2.7).
4. **Carga máxima por circuito**: a norma não fixa um teto em VA; o limite real vem de Ib ≤ In ≤ Iz e da queda de tensão. A prática de manuais (Procobre/Prysmian/Eletropaulo) é **limitar circuitos de TUG e de iluminação a cerca de 10 A**: **1.270 VA em 127 V e 2.200 VA em 220 V** [P]. Circuitos de cozinha costumam ir a 16–20 A (2,5 mm²) [P].
5. Circuitos bifásicos (F-F, 220 V numa rede 127/220 V) para cargas grandes; distribuir os circuitos entre as fases para **equilibrar a carga** (desequilíbrio alvo ≤ 10–20% [P]).
6. **Reserva no quadro** [N 6.5.4.7]: até 6 circuitos → espaço para 2 reservas; 7 a 12 → 3; 13 a 30 → 4; acima de 30 → 15%.

### 1.6 Tensão por UF [P / ?]

A tensão fase-neutro (127 V ou 220 V) depende da distribuidora e às vezes do município (exceções existem dentro de um mesmo estado). Listas públicas são parciais. Padrão sugerido para pré-seleção (usuário sempre pode trocar):

| Fase-neutro 127 V (rede 127/220 V) | Fase-neutro 220 V (rede 220/380 V) |
|---|---|
| AC, AM, AP, ES, MG, MS, MT*, PA, PR, RJ*, RO, RR, SP*, RS* (grande parte), SC* (parte), BA* (capital 127 V; interior misto), SE* | AL, CE, DF, GO, MA, PB, PE, PI, RN, TO, e partes de SC/RS/BA |

\* Estados com exceções municipais relevantes. Faixa adequada de fornecimento (PRODIST, Módulo 8): 127 V → 117–133 V; 220 V → 202–231 V.

**Recomendação:** campo `supply: { phaseNeutral: 127 | 220, phases: 1 | 2 | 3, utility: string }` no projeto, com a UF só como sugestão inicial.

Fontes §1: [Engehall: tomadas por circuito](https://engehall.com.br/disjuntor-para-tomadas-quantas-por-circuito/) · [Engenharia 360: quantas tomadas por cômodo](https://engenharia360.com/quantas-tomadas-deve-ter-em-cada-comodo/) · [UFV GESEP: Aula 6, previsão de cargas](https://gesep.ufv.br/wp-content/uploads/2021/07/Aula-6-previsaodecargas.pdf) · [UFRJ: Inst. Elét. Res. parte 2](https://www.coe.ufrj.br/~kleber/INST_ELET_RES_PARTE_02.pdf) · [IFRN: instalações elétricas parte 1](https://docente.ifrn.edu.br/odailsoncavalcante/disciplinas/eletricidade-instrumental/instalacoes-eletricas-parte-1) · [Voltimum: NBR 5410 em edifícios](https://content.voltimum.com/br/3054/02_ie11_instalaes_eltricas_edifcios_nbr-5410_0.pdf) · [O Setor Elétrico: banheiros](https://www.osetoreletrico.com.br/?p=165060) · [Brilliant Maps: tensões no Brasil](https://brilliantmaps.com/brazil-electricity/) · [Energisa: cartilha nível de tensão](https://www.energisa.com.br/sites/energisa/files/media/documents/2025-10/energisa-cartilha-nivel-tensao.pdf)

---

## 2. Dimensionamento de condutores e proteção

### 2.1 Capacidade de condução de corrente (Iz) [N Tab. 36]

Cobre, isolação PVC 70 °C (cabo flexível 450/750 V tipo "cabinho"), ambiente 30 °C. Correntes em ampères.

- **B1**: condutores isolados (ou cabos unipolares) em eletroduto de seção circular embutido em alvenaria. **É o método do eletroduto corrugado embutido em parede de alvenaria, drywall ou LSF** e do eletroduto sobre forro.
- **B2**: cabo multipolar em eletroduto embutido em alvenaria.
- 2 condutores carregados = circuito F-N ou F-F; 3 = trifásico (F-F-F). O PE não conta como carregado.

| Seção (mm²) | B1, 2 carreg. | B1, 3 carreg. | B2, 2 carreg. | B2, 3 carreg. |
|---|---|---|---|---|
| 1,5 | 17,5 | 15,5 | 16,5 | 15 |
| 2,5 | 24 | 21 | 23 | 20 |
| 4 | 32 | 28 | 30 | 27 |
| 6 | 41 | 36 | 38 | 34 |
| 10 | 57 | 50 | 52 | 46 |
| 16 | 76 | 68 | 69 | 62 |
| 25 | 101 | 89 | 90 | 80 |
| 35 | 125 | 110 | 111 | 99 |

Valores idênticos aos da IEC 60364-5-52, Tab. B.52.4 (coluna PVC, métodos B1/B2), reproduzidos em guias da Prysmian e em apostilas (ex.: IFSC: 1,5 mm² B1 = 17,5 A; 4 mm² B1 = 32 A). Alguns blogs citam 4 mm² = 28 A, que é o valor para **3** carregados.

Para referência, método **A1** (condutores em eletroduto embutido em parede termicamente isolante, caso de parede LSF com lã de vidro/rocha **envolvendo** o eletroduto), 2 carregados: 1,5 → 14,5; 2,5 → 19,5; 4 → 26; 6 → 34; 10 → 46; 16 → 61; 25 → 80; 35 → 99 A. **Isto é importante para chalés LSF com isolamento termoacústico na parede**: se o eletroduto passa imerso na lã, o método correto é A1, não B1 [N 6.2.5.1, Tab. 33, método 1/A1]. Sugestão: método padrão B1; trocar para A1 automaticamente quando a parede tiver isolamento na cavidade (`assembly.cavityInsulation = true`).

### 2.2 Fator de correção de temperatura (FCT) [N Tab. 40]

PVC, temperatura ambiente do ar:

| °C | 10 | 15 | 20 | 25 | 30 | 35 | 40 | 45 | 50 | 55 | 60 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| FCT | 1,22 | 1,17 | 1,12 | 1,06 | 1,00 | 0,94 | 0,87 | 0,79 | 0,71 | 0,61 | 0,50 |

Padrão: 30 °C. Em forro sob telha sem ventilação (telha sanduíche ajuda, metálica simples não), usar 35–40 °C [P].

### 2.3 Fator de correção de agrupamento (FCA) [N Tab. 42]

Linha 1 (feixe de circuitos em eletroduto ou embutidos; vale para métodos A a F). "n" = número de **circuitos** (ou de cabos multipolares) no mesmo eletroduto/feixe:

| n | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9–11 | 12–15 | 16–19 | ≥ 20 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FCA | 1,00 | 0,80 | 0,70 | 0,65 | 0,60 | 0,57 | 0,54 | 0,52 | 0,50 | 0,45 | 0,41 | 0,38 |

Regras de uso:
- O FCA de um circuito é o do **trecho mais carregado** (o eletroduto com mais circuitos que ele percorre). Na prática, isso costuma ser o trecho que sai do QDC.
- [N 6.2.5.5] Circuitos cuja corrente de projeto é ≤ 30% da sua capacidade corrigida podem ser desconsiderados na contagem de n. Implementar como refinamento opcional.
- Iz corrigida: `Iz' = Iz_tab × FCT × FCA`.

### 2.4 Seções mínimas, neutro e PE [N 6.2.6, Tab. 47, Tab. 58]

| Circuito | Seção mínima (cobre) |
|---|---|
| Iluminação | 1,5 mm² |
| Força (tomadas, TUE) | 2,5 mm² |
| Sinalização e controle | 0,5 mm² |

- **Neutro**: em circuito monofásico (F-N) ou bifásico com neutro, **mesma seção da fase**. Em trifásico, pode ser reduzido só acima de 25 mm² e com taxa de harmônicas ≤ 15% (não ocorre em chalé).
- **PE (terra)** [Tab. 58]: S ≤ 16 → PE = S; 16 < S ≤ 35 → PE = 16; S > 35 → PE = S/2.
- **Todo circuito deve ter PE** [N 5.1.2.2.3.6/6.4]; toda tomada é 2P+T (NBR 14136).
- Cores [N 6.1.5.3; prática]: neutro **azul-claro**; PE **verde-amarelo** ou verde; fases em preto, vermelho, branco ou marrom (prática: preto/vermelho); retorno de interruptor em amarelo, cinza ou outra cor livre [P].

### 2.5 Queda de tensão [N 6.2.7]

Limites (em relação à tensão nominal):

| Situação | Limite total |
|---|---|
| **Fornecimento em baixa tensão pela rede pública (caso do chalé)** | **5% a partir do ponto de entrega** |
| Transformador próprio ou gerador próprio | 7% a partir dos terminais do transformador/gerador |
| **Circuitos terminais (qualquer caso)** | **≤ 4%** |

> Atenção: o enunciado comum "4% terminal + 7% total" vale para quem tem transformador próprio. Para residência ligada em BT, o total é **5%** (ramal de entrada + alimentador do QDC + circuito terminal). O ChaléCAD deve validar **ΔV_terminal ≤ 4%** e **ΔV_alimentador + ΔV_terminal ≤ 5%**.

**Fórmula (resistiva, suficiente para seções ≤ 35 mm² e fator de potência alto):**

- Monofásico/bifásico de 2 fios (F-N ou F-F): `ΔV% = (2 · ρ · L · Ib) / (S · V) · 100`
- Trifásico equilibrado: `ΔV% = (√3 · ρ · L · Ib) / (S · V_FF) · 100`
- ρ do cobre: 0,0172 Ω·mm²/m a 20 °C; **0,0207–0,0217 a 70 °C** (usar 0,0217 = 1/46 a favor da segurança, ou ρ20 × (1 + 0,00393 × 50)). Muitas apostilas usam 1/56 ≈ 0,0179 (otimista).
- L em metros (comprimento do circuito, só ida), S em mm², V = tensão do circuito (127 ou 220).

**Alternativa por queda unitária** (com reatância; Prysmian/Pirelli, eletroduto de material não magnético, cobre PVC), em **V/(A·km)**:

| Seção (mm²) | Monofásico, FP 0,8 | Monofásico, FP 0,95 | Trifásico, FP 0,8 | Trifásico, FP 0,95 |
|---|---|---|---|---|
| 1,5 | 23 | 27,4 | 20 | 23,7 |
| 2,5 | 14 | 16,8 | 12 | 14,5 |
| 4 | 9,0 | 10,5 | 7,8 | 9,1 |
| 6 | 5,87 | 7,0 | 5,1 | 6,1 |
| 10 | 3,54 | 4,2 | 3,1 | 3,6 |
| 16 | 2,27 | 2,7 | 2,0 | 2,3 |
| 25 | 1,50 | 1,72 | 1,3 | 1,5 |
| 35 | 1,12 | 1,25 | 0,98 | 1,1 |

[?] Valores de 1,5/2,5 mm² confirmados pela tabela Nambei (23,3 e 14,3 V/A·km monofásico, FP 0,8); 4 e 6 mm² batem com a tabela USP (10,6 e 7,07 V/A·km, FP ≈ 0,95). Os demais são da tabela clássica Pirelli e devem ser conferidos no Guia Prysmian. Uso: `ΔV(V) = ΔVunit × Ib × L(km)`; `ΔV% = ΔV / V × 100`.

**Recomendação de implementação:** calcular pela resistência do condutor (mais transparente e sem tabela de FP):

`ΔV% = k · R70(S) · L(km) · Ib / V · 100`, com k = 2 (mono/bifásico 2 fios) ou √3 (trifásico), e R70 = R20 × 1,196.

R20 de condutor flexível classe 5 (NBR NM 280), em Ω/km: 1,5 → 13,3; 2,5 → 7,98; 4 → 4,95; 6 → 3,30; 10 → 1,91; 16 → 1,21; 25 → 0,780; 35 → 0,554.

**Cargas distribuídas** (vários pontos ao longo do circuito): `ΔV = Σ (k · R · Li · Ii)`, com Li a distância do QDC ao ponto i e Ii a corrente daquele ponto (método dos momentos elétricos). Em circuito ramificado, somar trecho a trecho, com a corrente acumulada à jusante de cada trecho. Isso é exato para a topologia em árvore dos eletrodutos (§3).

Exemplo: chuveiro 5.500 W em 220 V, Ib = 25 A, L = 15 m, 6 mm²: ΔV% = 2 × 3,30 × 1,196 × 0,015 × 25 / 220 × 100 = **1,35%** (ok).

### 2.6 Proteção contra sobrecorrente: disjuntores [N 5.3.4]

- **Coordenação**: `Ib ≤ In ≤ Iz'` e `I2 ≤ 1,45 · Iz'`. Para disjuntores NBR NM 60898 / IEC 60898-1, I2 = 1,45 · In, então a segunda condição é atendida automaticamente quando In ≤ Iz'.
- Correntes nominais padronizadas (DIN, NBR NM 60898): **6, 10, 13, 16, 20, 25, 32, 40, 50, 63 A** (e 70, 80, 100, 125 A na linha caixa moldada ou DIN estendida).
- Curvas (disparo magnético instantâneo):

| Curva | Disparo instantâneo | Uso residencial |
|---|---|---|
| B | 3–5 × In | Cargas resistivas, circuitos longos (chuveiro, iluminação, tomadas) |
| C | 5–10 × In | Uso geral; cargas com partida (motores, ar-condicionado, bomba, LED com driver de alta corrente de partida). **Padrão de mercado no Brasil** |
| D | 10–20 × In | Transformadores, motores pesados; quase nunca em residência |

- Ib de cada circuito: `Ib = P(VA) / V` (mono/bifásico) ou `P / (√3 · V_FF)` (trifásico). Para cargas em W com fator de potência < 1: `P(VA) = P(W) / FP`.
- Proteção contra curto (verificar `I²t ≤ k²S²`, k = 115 para cobre/PVC): para disjuntores até 63 A e seções ≥ 1,5 mm² em residência, é atendida na prática [P]; deixar como verificação informativa.

**Tabela prática** de seção × disjuntor, B1, 2 carregados, 30 °C:

| Seção | Iz (FCA 1,0) | In máx. (FCA 1,0) | Iz com FCA 0,7 (3 circuitos) | In máx. (FCA 0,7) | In máx. (FCA 0,6, 5 circuitos) |
|---|---|---|---|---|---|
| 1,5 | 17,5 | 16 | 12,3 | 10 | 10 |
| 2,5 | 24 | 20 | 16,8 | 16 | 13 |
| 4 | 32 | 32 | 22,4 | 20 | 16 |
| 6 | 41 | 40 | 28,7 | 25 | 20 |
| 10 | 57 | 50 | 39,9 | 32 | 32 |
| 16 | 76 | 63 | 53,2 | 50 | 40 |
| 25 | 101 | 100 | 70,7 | 63 | 50 |
| 35 | 125 | 125 | 87,5 | 80 | 70 |

A `wireTable` atual (1,5 → 10 A; 2,5 → 16 A; 4 → 25 A; 6 → 32 A; 10 → 40 A) é coerente com FCA ≈ 0,7, mas deve ser **substituída pelo cálculo** (Iz × FCT × FCA, depois ΔV).

### 2.7 Dispositivo DR (diferencial residual) [N 5.1.3.2.2]

**DR de alta sensibilidade (IΔn ≤ 30 mA) obrigatório** em:
1. circuitos que sirvam pontos de utilização em locais com **banheira ou chuveiro**;
2. circuitos de **tomadas em áreas externas** à edificação;
3. circuitos de tomadas em áreas internas que possam alimentar equipamentos na área externa;
4. em **unidades residenciais**: circuitos que sirvam pontos em **cozinhas, copas-cozinhas, lavanderias, áreas de serviço, garagens** e, em geral, áreas internas molhadas em uso normal ou sujeitas a lavagens.

- **Exceção**: pontos de iluminação a **≥ 2,50 m** de altura podem ser excluídos.
- Pode ser um DR por circuito (DR + disjuntor ou DDR/RCBO) ou um DR geral protegendo um grupo. Para reduzir desligamentos indevidos, a boa prática é dividir em 2 ou mais DRs [P].
- O DR **não dispensa** o disjuntor (não protege contra sobrecorrente, salvo DDR/RCBO).
- Tipos: AC (senoidal), **A** (senoidal + pulsante CC; recomendado para eletrônicos, inversores, cooktop, lavadora), F, B (carregador veicular, fotovoltaico). Exigir tipo A como padrão é uma proposta da revisão [?].
- Tendência (revisão em curso): DR em **todos** os circuitos residenciais. **Recomendação ChaléCAD:** padrão "DR 30 mA em todos os circuitos de tomadas e áreas molhadas", com aviso se o usuário remover.
- In do DR ≥ In do disjuntor a montante dos circuitos protegidos (ou ≥ soma, conforme fabricante). Valores comerciais: 25, 40, 63, 80 A; 2 polos (F-N, F-F) ou 4 polos.

### 2.8 DPS (dispositivo de proteção contra surtos) [N 5.4.2, 6.3.5.2]

- Obrigatório [N] quando a instalação é alimentada por linha **total ou parcialmente aérea** em região de trovoadas (caso típico: chalé rural/serrano). Na prática, **sempre prever** no QDC.
- **Classe II** (ensaio 8/20 µs) no QDC, entre cada fase e PE e entre neutro e PE (esquema TN-S), ou fase-neutro + neutro-PE (esquema "3+1").
- Parâmetros [N/P]:
  - **Uc ≥ 1,1 · Uo** → para Uo = 127 V: Uc ≥ 140 V (comercial: **175 V**); para Uo = 220 V: Uc ≥ 242 V (comercial: **275 V**). Entre N e PE em TN-S: Uc ≥ Uo.
  - **In ≥ 5 kA** (8/20) por modo de proteção. Prática: In 10–20 kA, Imáx 20–40 kA.
  - **Up ≤ 1,5 kV** em rede 127/220 V e ≤ 2,5 kV em 220/380 V (categoria II dos equipamentos).
  - Condutores de ligação do DPS: ≥ 4 mm² (cobre) e o mais curtos possível (soma ≤ 0,5 m [P]). Prever disjuntor/fusível de backup conforme o fabricante.
- Se houver SPDA (para-raios) ou entrada subterrânea longa: avaliar DPS classe I na entrada (NBR 5419). Fora do escopo do chalé típico.

### 2.9 Esquema de aterramento

- Típico residencial no Brasil: **TN-C-S**. A concessionária entrega neutro aterrado no padrão de entrada (haste no padrão); a partir do padrão (ou do QDC), neutro e PE seguem **separados** (TN-S) até as cargas, e nunca voltam a ser unidos depois da separação.
- Eletrodo [P]: haste de aço cobreado ⌀ 5/8" × 2,40 m (3 hastes em linha espaçadas ≥ 2,4 m quando a concessionária pede); condutor de aterramento 6–16 mm² conforme a entrada. Resistência de aterramento: a NBR 5410 não fixa valor; concessionárias costumam pedir ≤ 25 Ω [P/?].
- **Equipotencialização principal (BEP)** junto ao QDC ou à entrada: ligar PE, eletrodo, tubulações metálicas e **a estrutura metálica do LSF** [N 6.4.2.1: elementos condutivos da edificação]. **Ponto importante para LSF:** os perfis de aço galvanizado devem ser equipotencializados ao BEP (ao menos um ponto por painel estrutural/estrutura contínua) [P/?].
- TT (eletrodo próprio sem ligação ao neutro) aparece em áreas rurais. Nesse caso o DR é a proteção principal contra choque e é obrigatório em todos os circuitos.

### 2.10 Algoritmo de dimensionamento do condutor (ordem)

```
para cada circuito:
  Ib = Pprojeto / (V · fator_fase)
  In = menor disjuntor padronizado ≥ Ib
  FCA = fator do trecho com mais circuitos; FCT = fator da temperatura do percurso
  S = menor seção ≥ Smin(tipo) tal que Iz_tab(método, n_carregados, S) · FCT · FCA ≥ In
  enquanto ΔV%(S) > limite_terminal (4%) ou ΔV_total > 5%: S = próxima seção
  (se S subiu por queda de tensão, In pode continuar igual)
  PE = f(S); neutro = S
  verificar DR obrigatório, curva (B/C) e equilíbrio de fases
```

Fontes §2: [Prysmian: Guia de dimensionamento BT Rev9](https://br.prysmian.com/sites/default/files/atoms/files/Guia_de_Dimensionamento-Baixa_Tensao_Rev9.pdf) · [Prysmian: cabos de energia, construção e dimensionamento](https://br.prysmian.com/sites/br.prysmian.com/files/media/documents/Cabos_Energia_Construcao_Dimensionamento.pdf) · [Nambei: tabela do eletricista](https://api.aecweb.com.br/cls/catalogos/nambei/nambei_tabela_do_eletricista.pdf) · [Innovcable: tabelas NBR 5410](https://innovcable.com.br/wp-content/uploads/2025/09/TABELAS-DE-DIMENSIONAMENTO-NBR-5410-INNOVCABLE.pdf) · [IFSC: dimensionamento de condutores 2024](https://wiki.sj.ifsc.edu.br/images/b/ba/Dimensionamento_Condutores2024.pdf) · [IFSC: resolução de exercícios](https://wiki.sj.ifsc.edu.br/images/f/fb/Resolucao_Exercicios_Dim_Condutores_2024.pdf) · [IFPR: condutores e eletrodutos](https://wiki.foz.ifpr.edu.br/wiki/images/8/80/Dimensionamento-Condutores%26Eletrodutos.pdf) · [O Setor Elétrico: Tab. 36](https://www.osetoreletrico.com.br/?p=164354) · [IFRN: instalações BT parte 6](https://docentes.ifrn.edu.br/odailsoncavalcante/disciplinas/instalacoes-eletricas-de-bt-i/instalacoes-eletricas-de-bt-i-parte-6) · [UDESC: projeto residencial](https://www.udesc.br/arquivos/udesc/id_cpmenu/9731/projeto_residencial_3_v5_23_16945136712302_9731.pdf) · [Engehall: disjuntor DR](https://engehall.com.br/disjuntor-dr/) · [Sienge: dispositivo DR](https://sienge.com.br/blog/dispositivo-dr/) · [Siemens: catálogo DR](https://assets.new.siemens.com/siemens/assets/api/uuid:1b21f502-c9f7-4136-bb73-e8d58d6f3c42/catalogodr-junho2019.pdf) · [UDESC: choque elétrico](https://udesc.br/arquivos/udesc/id_cpmenu/9731/choque_eletrico_8_24_17230551344501_9731.pdf) · IEC 60364-5-52:2009, Annex B (Tab. B.52.2–B.52.17).

---

## 3. Eletrodutos, caixas e alturas

### 3.1 Taxa máxima de ocupação [N 6.2.11.1.6]

| Nº de condutores no eletroduto | Área ocupada máx. (soma das seções externas / área interna útil) |
|---|---|
| 1 | 53% |
| 2 | 31% |
| ≥ 3 | 40% |

Verificação: `Σ (π · d_ext,i² / 4) ≤ taxa · (π · D_int² / 4)`. Os mesmos percentuais aparecem no NEC (Cap. 9, Tab. 1); a NBR 5410 os adota.

### 3.2 Comprimento entre caixas e curvas [N 6.2.11.1.6 b / 6.2.11.1.7]

- Trecho contínuo **retilíneo** sem caixa: **≤ 15 m** em área interna; **≤ 30 m** em área externa.
- Com curvas: **reduzir 3 m por curva de 90°**. Interno: 1 curva → 12 m; 2 → 9 m; 3 → 6 m.
- **Máximo de 3 curvas de 90° (270° acumulados)** entre duas caixas.
- Curvas de outros ângulos: somar ângulos e contar em equivalentes de 90° [P].
- Toda emenda e derivação de condutor deve ficar **dentro de caixa** (nunca dentro do eletroduto) [N 6.2.8].

### 3.3 Diâmetros de eletrodutos [P / ?]

Eletroduto **corrugado flexível de PVC** (NBR 15465; "conduíte", amarelo para parede, laranja para laje/piso) é o padrão em drywall/LSF. Designação por **diâmetro externo nominal (DN)**:

| DN (mm) | Equivalente "polegada" (mercado) | ⌀ interno aprox. (mm) | Área interna (mm²) | Área útil 40% (mm²) |
|---|---|---|---|---|
| 16 | 3/8" | 11,5 | 104 | 42 |
| 20 | 1/2" | 15,0 | 177 | 71 |
| 25 | 3/4" | 19,5 | 299 | 119 |
| 32 | 1" | 25,5 | 511 | 204 |
| 40 | 1 1/4" | 32,5 | 830 | 332 |

[?] O ⌀ interno do corrugado varia por fabricante (Tigre, Amanco/Wavin, Krona, Fortlev). Os valores acima são aproximados e devem ser trocados pelos do catálogo escolhido. Rígido roscável (DN 20/25/32) tem ⌀ interno maior: ≈ 16,4/21,3/27,5 mm [?].

Prática residencial: **DN 20 (½") mínimo para a maioria dos ramais; DN 25 (¾") para descidas do QDC e trechos com muitos circuitos; DN 32 (1") para alimentador do QDC**. Muitos projetistas evitam DN 16.

### 3.4 Diâmetro externo dos condutores [P]

Cabo flexível 450/750 V, cobre, PVC (ex.: Sil; outros fabricantes ± 0,2 mm):

| Seção (mm²) | ⌀ externo (mm) | Área externa (mm²) |
|---|---|---|
| 1,5 | 3,0 | 7,1 |
| 2,5 | 3,6 | 10,2 |
| 4 | 4,2 | 13,9 |
| 6 | 4,7 | 17,3 |
| 10 | 6,1 | 29,2 |
| 16 | 7,2 | 40,7 |
| 25 | 8,9 | 62,2 |
| 35 | 10,2 | 81,7 |

[?] Sil cita 2,9 / 3,4–3,6 / 4,0 / 4,5 / 5,9 mm para 1,5–10 mm²; uma referência genérica cita 3,0 / 3,6 / 4,2 / 4,7. Usar o maior (a favor da segurança). Valores para 16–35 mm² são aproximados (cabo 1 kV é maior).

**Tabela prática de número de condutores por eletroduto** (manual Pirelli/Procobre, todos com a mesma seção; DN do eletroduto em mm):

| Seção \ nº condutores | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|
| 1,5 | 16 | 16 | 16 | 16 | 16 | 16 | 20 | 20 | 20 |
| 2,5 | 16 | 16 | 16 | 20 | 20 | 20 | 20 | 25 | 25 |
| 4 | 16 | 16 | 20 | 20 | 20 | 25 | 25 | 25 | 25 |
| 6 | 16 | 20 | 20 | 25 | 25 | 25 | 25 | 32 | 32 |
| 10 | 20 | 20 | 25 | 25 | 32 | 32 | 32 | 40 | 40 |
| 16 | 20 | 25 | 25 | 32 | 32 | 40 | 40 | 40 | 40 |

[?] Tabela baseada em ⌀ interno de eletroduto rígido. Com corrugado, **calcular pela taxa de ocupação** (§3.1) com o ⌀ interno real. O ChaléCAD deve calcular, não tabelar.

### 3.5 Alturas de montagem (centro da caixa, a partir do piso acabado) [P; NBR 9050 para acessibilidade]

| Ponto | Altura usual | Observação |
|---|---|---|
| Tomada baixa | **0,30 m** | Padrão em salas e quartos |
| Tomada média | **1,10–1,30 m** | Bancadas (bancada 0,90 m + 0,20–0,30 m), escrivaninha, lavatório |
| Tomada alta | **2,00–2,20 m** | Ar-condicionado split (≈ 0,30 m abaixo do teto), TV na parede (1,20–1,60 m), coifa (1,90–2,10 m) |
| Interruptor | **1,10–1,30 m** (prática 1,10–1,20) | Acessível (NBR 9050): comandos **0,60–1,00 m**; tomadas 0,40–1,00 m |
| Interruptor + tomada no mesmo espelho | 1,10 m | Comum em hall e quarto |
| Arandela | 1,80–2,10 m | Banheiro: acima do espelho, ≈ 2,00 m |
| Chuveiro elétrico (caixa/ponto) | **2,10–2,30 m** | Saída do ponto acima do registro |
| Campainha / interfone | 1,20–1,50 m | |
| QDC (centro) | 1,50 m (topo ≤ 1,80–2,00 m) | NBR 9050: comandos 0,40–1,20 m para acessível [?] |
| Ponto de luz no teto | altura do forro | Caixa octogonal 4"×4" ou caixa de forro |
| Tomada de piso | 0 | Só com caixa de piso apropriada |

Distância lateral do interruptor à porta: **0,10–0,20 m do batente**, do lado da maçaneta (lado de abertura) [P]. O código atual usa 0,15 m e o lado mais livre. Falta considerar o sentido de abertura da folha.

### 3.6 Convenções de traçado em planta [P]

- Eletroduto **pelo teto/forro** (linha contínua): ramais de iluminação e, em casas térreas com forro, quase tudo (desce pela parede até a caixa).
- Eletroduto **pelo piso/contrapiso** (linha tracejada): tomadas baixas, quando o radier tem eletrodutos embutidos. **No radier, os eletrodutos de piso precisam ser lançados antes da concretagem**. Isso pesa na obra e o ChaléCAD pode avisar.
- Saídas verticais: "sobe" (seta para cima) e "desce" (seta para baixo) nos pontos de transição.
- Em planta, cada eletroduto é anotado com **⌀** e os **condutores** que passam (traços: fase, neutro, retorno, terra), numerados pelo circuito. Ex.: `⌀20 — 1,2 (F-N-T de C1 e C2)`.
- Topologia típica: **árvore** a partir do QDC; o circuito vai de caixa em caixa (ponto de luz → próximo ponto de luz → interruptor desce do ponto de luz). Tomadas baixas de um cômodo costumam ser interligadas pela parede/piso, em cadeia.

### 3.7 Instalação em drywall e LSF [P]

- Paredes com montantes C (Ue 90 ou 140 mm em LSF; 48/70/90 mm em drywall). **Os montantes têm furos de fábrica (puncionamento)** para passagem de instalações, em geral oblongos (≈ 38 × 64 mm ou ⌀ 35–50 mm), espaçados ao longo do perfil [?: dimensões variam por fabricante]. Furos extras em montantes estruturais **só com aprovação do calculista**, nunca em mesas e nunca próximos às extremidades.
- Eletroduto corrugado DN 20/25 passa pelos furos, com **anel de proteção (grommet/bucha de PVC)** para não cortar no aço [P]. Cabo sem eletroduto dentro da cavidade **não** é admitido como padrão: usar eletroduto ou cabo com dupla isolação/multipolar fixado [N 6.2.11; ?].
- Caixas **específicas para drywall** (4×2, 4×4, octogonal), fixadas por aletas/travas na placa de gesso ou OSB (ex.: Wavin, Tigre, Krona). Em LSF com OSB + placa cimentícia na face externa, usar caixas com fixação no montante [P].
- **Projeto antes de fechar as paredes**: a montagem LSF exige coordenação prévia entre arquitetura, estrutura e instalações. Os furos para as caixas devem ser marcados no painel antes do fechamento. Isto torna o projeto em planta + elevação ainda mais valioso.
- Horizontais dentro da parede: passar pelos furos dos montantes na altura das caixas (0,30 m e 1,10 m) ou subir/descer ao forro. Evitar rasgos horizontais longos na placa.
- Forro: eletroduto ou eletrocalha sobre o forro, fixado à estrutura do forro ou à tesoura/terça. Com telha sanduíche, a temperatura sob o telhado é moderada (FCT 30–35 °C).
- Isolamento (lã) na cavidade: considerar método A1 (§2.1).
- Equipotencializar a estrutura metálica (§2.9).

Fontes §3: [Engehall: caixa de passagem e distância máxima](https://engehall.com.br/caixa-de-passagem-eletrica/) · [IFSC: dimensionamento de eletrodutos e disjuntores](https://ifsc.kaptiva.com.br/pluginfile.php/270293/mod_resource/content/1/2%29%20Dimensionamento%20dos%20Eletrodutos%20e%20Tipos%20de%20Disjuntores.pdf) · [VIOX: cálculo de ocupação de eletroduto](https://viox.com/pt/how-to-calculate-conduit-fill/) · [Engehall: distribuição de eletrodutos](https://engehall.com.br/como-distribuir-eletrodutos/) · [Sil: tabela do eletricista](https://www.sil.com.br/tabelaeletricista.aspx) · [Wavin: caixas de luz drywall](https://mediahub.wavin.com/m/4cfd7902f4b7d8a8/original/FT-Caixas-de-luz-Drywall.pdf) · [Legrand: soluções de infraestrutura](https://www.legrand.com.br/sites/default/files/perfil/solucao_infraestrutura_0.pdf) · [CBCA: componentes leves](https://www.cbca-acobrasil.org.br/upfiles/downloads/noticias/Componentes-leves.pdf) · [PBQP-H: FAD 070 Steel Frame](https://pbqp-h.mdr.gov.br/wp-content/uploads/2024/08/FAD_070_SteelFrame-final_rev2-limpa.pdf) · [Monitor do Mercado: LSF e precisão antes de fechar paredes](https://monitordomercado.com.br/noticias/imoveis/408662-como-uma-casa-em-light-steel-frame-e-montada-e-por-que-a-obra-exige-precisao-antes-de-fechar-as-paredes/) · [ABCEM: perfis para drywall e LSF](https://www.abcem.org.br/construmetal/2016/downloads/apresentacao/46_ESPECIFICACAO-PARA-PERFIS-DE-DRYWALL-E-LIGHT-STEEL-FRAMING.pdf) · ABNT NBR 9050:2020 (alturas de comandos).

---

## 4. Demanda, quadro e padrão de entrada

### 4.1 Método de demanda típico de concessionária (CEMIG ND-5.1 e similares) [P / ?]

`D (kVA) = a + b + c + d + e + f`, com:

- **a**: iluminação + TUG, aplicando o fator por faixa de carga instalada (tabela abaixo);
- **b**: aparelhos de aquecimento (chuveiro, torneira, aquecedor, ferro), com fator pelo número de aparelhos;
- **c**: ar-condicionado, com fator pelo número de aparelhos;
- **d**: motores/bombas: o maior motor a 100% + demais com fator;
- **e**: outros (forno, cooktop, micro-ondas, secadora…), com fator por quantidade;
- **f**: cargas especiais (carregador veicular: 100%).

**Fator de demanda para iluminação e TUG residencial** (tabela clássica CEMIG, reproduzida em Creder/Cotrim e apostilas) [?: conferir a revisão vigente, Tabela 10 da ND-5.1 2024]:

| Carga instalada de ilum. + TUG (kW) | FD |
|---|---|
| 0 < P ≤ 1 | 0,86 |
| 1 < P ≤ 2 | 0,75 |
| 2 < P ≤ 3 | 0,66 |
| 3 < P ≤ 4 | 0,59 |
| 4 < P ≤ 5 | 0,52 |
| 5 < P ≤ 6 | 0,45 |
| 6 < P ≤ 7 | 0,40 |
| 7 < P ≤ 8 | 0,35 |
| 8 < P ≤ 9 | 0,31 |
| 9 < P ≤ 10 | 0,27 |
| P > 10 | 0,24 |

Aplicação: o FD é o da faixa em que cai a carga **total**, aplicado à carga total (não escalonado). [?] Algumas concessionárias usam versão escalonada ("primeiro kW a 86%, seguinte a 75%…"). Guardar o modo no catálogo.

**Fator de demanda para aparelhos de aquecimento/TUE resistivos por número de aparelhos** (tabela típica) [?]:

| Nº aparelhos | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | ≥ 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FD | 1,00 | 1,00 | 0,84 | 0,76 | 0,70 | 0,65 | 0,60 | 0,57 | 0,54 | 0,52 | 0,49 | 0,48 | 0,46 | 0,45 | 0,44 | 0,43 → 0,40 |

Ar-condicionado residencial (típico): 1–10 aparelhos → 1,00 [?].

Para chalé de 40–150 m², o resultado típico fica entre **6 e 15 kVA**. Exemplo: 3 kW de ilum. + TUG × 0,66 = 1,98; 2 chuveiros 5,5 kW × 1,0 = 11; forno 2 kW + micro-ondas 1,2 kW × ~0,8 ≈ 2,6 → D ≈ 15,6 kVA (o chuveiro domina).

### 4.2 Alimentador do QDC e disjuntor geral

- `Ib_geral = D(VA) / V_FN` (monofásico) · `D / (2 · V_FN)` aprox. para bifásico equilibrado · `D / (√3 · V_FF)` (trifásico).
- Disjuntor geral = disjuntor do padrão de entrada (definido pela concessionária) ou um degrau abaixo; seção do alimentador conforme Iz e ΔV (≤ 1–2% no alimentador, para sobrar ≥ 3% ao terminal dentro dos 5% totais [P]).
- DR geral opcional (4P/2P) ou DRs parciais.

### 4.3 Padrão de entrada (categoria) [P / ?: varia por concessionária]

Cada distribuidora define as categorias por carga instalada ou demanda, com disjuntor e ramal. Ordem de grandeza (rede 127/220 V; CEMIG ND-5.1, Enel, Energisa, Neoenergia):

| Tipo | Ligação | Faixa típica | Disjuntor típico | Ramal típico (Cu) |
|---|---|---|---|---|
| Monofásico (A) | F + N | carga até ~8–12 kW (Energisa: demanda ≤ 8,8 kW em 127 V) | 40–63 A | 6–16 mm² |
| Bifásico (B) | 2F + N | até ~15–25 kW | 40–70 A | 10–25 mm² |
| Trifásico (C) | 3F + N | até ~75 kW (limite BT) | 40–200 A | 10–95 mm² |

Em rede 220/380 V (Nordeste e Centro-Oeste), o monofásico 220 V atende cargas maiores (chuveiro 220 V sem bifásico). **Chuveiro em casa 127 V normalmente força ligação bifásica** (chuveiro em F-F 220 V).

**Recomendação:** catálogo `utilities: { [id]: { name, phaseNeutral, categories: [{ code, phases, maxLoadKw | maxDemandKva, breakerA, cableMm2 }] } }`, começando por CEMIG, Enel SP/RJ/CE, Copel, Celesc, CPFL, Neoenergia, Equatorial. O motor sugere "categoria provável" e **sempre** avisa: "confirmar na norma da sua distribuidora".

Fontes §4: [CEMIG ND-5.1 (PDF, 2025)](https://www.cemig.com.br/wp-content/uploads/2025/10/nd5_1_000001p.pdf) · [CEMIG ND-5.1 (2024)](https://cemig.com.br/wp-content/uploads/2024/11/nd5_1_000001p.docx.pdf) · [UFV GESEP: Aula 8, demanda](https://gesep.ufv.br/wp-content/uploads/2021/08/Aula-8-Demanda-de-uma-instalacao.pdf) · [UFV GESEP: Aula 5, projeto](https://gesep.ufv.br/wp-content/uploads/2021/07/Aula-5-projeto-instalacoes-eletricas.pdf) · [USP: notas de fornecimento (Energisa 8,8 kW)](https://edisciplinas.usp.br/pluginfile.php/5073796/course/section/5917953/FOR.pdf) · [Enel RJ: fornecimento em tensão secundária](https://www.eneldistribuicao.com.br/rj/documentos/CNC-OMBR-MAT-18-0165-EDRJ%20-%20Fornecimento%20de%20Energia%20El%C3%A9trica%20em%20Tens%C3%A3o%20Secund%C3%A1ria.pdf) · [Energisa NDU 001](https://www.energisa.com.br/sites/energisa/files/media/documents/2025-02/NDU%20001%20-%20Vers%C3%A3o%206.3.pdf) · [Celpe: tabela de dimensionamento do padrão](https://servicos.neoenergiapernambuco.com.br/residencial-rural/Documents/Padr%C3%A3o%20de%20Entrada%20-%20PDF%C2%B4S%202021-desc/Tabela%20Dimensionamento%20T%C3%A9cnico%20Celpe%20-%20Padr%C3%A3o%20de%20Entrada.pdf) · [Engehall: dimensionar disjuntor geral](https://engehall.com.br/como-dimensionar-disjuntor-geral/) · [UDESC: manual simplificado do padrão de entrada](https://udesc.br/arquivos/udesc/id_cpmenu/9731/manual_simplificado_padrao_entrada_energia_eletrica_17218302494815_9731.pdf)

---

## 5. Projeto luminotécnico

### 5.1 Iluminâncias de referência por ambiente residencial

A **NBR ISO/CIE 8995-1:2013** (que substituiu a NBR 5413) trata de **locais de trabalho** e não tem tabela residencial. Na prática brasileira continua-se usando a **NBR 5413:1992** (cancelada) para residências, e a **NBR 15575-1** traz mínimos de iluminação artificial para habitação [?: tabela não confirmada nesta pesquisa]. Valores de projeto recomendados (média do plano de trabalho, lux):

| Ambiente | NBR 5413 (geral: mín/méd/máx) | Tarefa localizada (5413) | **Alvo ChaléCAD (geral)** | Mínimo para alerta |
|---|---|---|---|---|
| Sala de estar | 100 / 150 / 200 | leitura 300 / 500 / 750 | **150** (+ abajur/pendente) | 100 |
| Cozinha | 100 / 150 / 200 | fogão, pia, bancada 200 / 300 / 500 | **250** (bancada 300–500) | 150 |
| Dormitório | 100 / 150 / 200 | cama, espelho 200 / 300 / 500 | **150** | 100 |
| Banheiro | 100 / 150 / 200 | espelho 200 / 300 / 500 | **200** (espelho 300+) | 100 |
| Área de serviço / lavanderia | 100 / 150 / 200 [?] | tanque 200 / 300 / 500 | **200** | 100 |
| Circulação, hall, escada | 75 / 100 / 150 | | **100** (escada: 150 nos degraus) | 75 |
| Garagem | 75 / 100 / 150 | | **100** | 75 |
| Escritório/home office | 300 / 500 / 750 (ISO 8995: 500) | | **400** | 300 |
| Varanda/área externa | 30–50 [P] | | **50** | 20 |
| Acesso, caminho externo | 5–20 [P] (balizamento) | | **10** | 5 |

Referência complementar: a EN 12464-1/IES para residências usa 100–300 lx geral e 300–500 lx em tarefas. Mostrar ao usuário em "faixas": **pouca luz / adequado / muita luz**.

### 5.2 Método dos lúmens

- Iluminância média: `E = (N · Φ · Fu · Fm) / A`
- Número de luminárias: `N = (E · A) / (Φ · Fu · Fm)` → arredondar para cima, depois ajustar ao arranjo (grade).
- Φ = fluxo **da luminária** (lm) (para LED, o fluxo do produto inteiro; fluxo de lâmpada × eficiência da luminária quando forem separados).
- **Fm** (fator de manutenção / depreciação): residencial LED limpo **0,80**; cozinha/ambiente com gordura 0,70; externo 0,70 [P].
- **Índice do recinto**: `K = (c · l) / (h · (c + l))`, com c e l as dimensões do cômodo e h a distância da luminária ao plano de trabalho (plano a 0,75 m; cozinha 0,90 m; circulação 0 m [P]). Para cômodo irregular: `K = 2 · A / (h · P)` (A área, P perímetro), equivalente para retângulos.
- **Fu** (fator de utilização): vem da tabela fotométrica do fabricante em função de K e das refletâncias (teto/parede/piso). Aproximação para plafon/painel LED de sobrepor/embutir de distribuição direta, refletâncias 70/50/20 (teto branco, parede clara, piso médio) [P/?]:

| K | 0,6 | 0,8 | 1,0 | 1,25 | 1,5 | 2,0 | 2,5 | 3,0 | 4,0 | 5,0 |
|---|---|---|---|---|---|---|---|---|---|---|
| Fu | 0,36 | 0,44 | 0,50 | 0,56 | 0,60 | 0,66 | 0,70 | 0,73 | 0,77 | 0,80 |

Correções sugeridas: parede escura (30%) → × 0,90; teto escuro/madeira (50%) → × 0,90; spot de facho fechado (≤ 36°) → × 1,05 no plano, mas com uniformidade pior; luminária indireta/pendente com difusor → × 0,75. Interpolação linear. Fórmula fechada aproximada: `Fu ≈ 0,88 · K / (K + 0,8)` (erro ≈ ± 0,03 na faixa 0,6–5) [estimativa própria; calibrar].

Exemplo: sala 4 × 5 m, forro 2,60 m, plano 0,75 → h = 1,85; K = 20 / (1,85 × 9) = 1,20 → Fu ≈ 0,55. Alvo 150 lx: Φtotal = 150 × 20 / (0,55 × 0,8) = 6.818 lm → 4 plafons de 1.800 lm (≈ 18 W cada; 72 W no total; 3,6 W/m²) ou 12 spots de 550 lm.

**Densidade de potência** de referência para validação rápida (LED): 2–5 W/m² em ambientes residenciais [P].

### 5.3 Eficácia e luminárias típicas (LED, mercado BR 2025–2026) [P]

| Tipo | Potência típica | Fluxo típico | lm/W | Uso |
|---|---|---|---|---|
| Lâmpada bulbo A60 (E27) | 9 W / 12 W / 15 W | 806 / 1.050–1.100 / 1.400–1.500 lm | 90–100 | Pendente, plafon com soquete |
| Plafon LED de sobrepor (redondo/quadrado) | 12 / 18 / 24 / 36 W | 1.000 / 1.500–1.800 / 2.000–2.400 / 3.200 lm | 80–100 | Iluminação geral |
| Painel/downlight embutido | 6 / 12 / 18 / 24 W | 450 / 1.000 / 1.500 / 2.000 lm | 75–90 | Forro de gesso |
| Spot embutir (dicroica GU10/MR16 ou integrado) | 4,8–7 W | 350–550 lm | 70–85 | Destaque, iluminação geral em grade |
| Arandela | 5–10 W | 300–800 lm | 60–80 | Parede, banheiro, externa |
| Pendente decorativo | 9–15 W (lâmpada) | 800–1.500 lm | 60–90 (com cúpula) | Mesa de jantar, bancada |
| Fita LED 4,8 W/m | 4,8 W/m | 350–450 lm/m | 70–90 | Sanca, rodapé, móveis |
| Fita LED 9,6–10 W/m | 10 W/m | 800–1.000 lm/m | 80–100 | Sanca de iluminação geral |
| Fita LED 14,4 W/m | 14,4 W/m | 1.200–1.400 lm/m | 85–100 | Sanca forte |
| Balizador/espeto de jardim | 1–5 W | 50–300 lm | 50–70 | Caminhos, escadas externas |
| Refletor LED externo | 20 / 30 / 50 W | 1.800 / 2.700 / 4.500 lm | 85–100 | Fachada, quintal |
| Arandela externa com sensor | 8–12 W | 600–1.000 lm | 70–80 | Acesso |
| Poste/balizador de jardim | 7–12 W | 500–1.000 lm | 70–80 | Áreas externas |

Temperatura de cor: **2700–3000 K** (quente) em salas e quartos; **3000–4000 K** em cozinha, banheiro e serviço; IRC ≥ 80 (≥ 90 em espelho de banheiro). Fita LED exige driver/fonte (12/24 V), com **fonte dimensionada com ≥ 20% de folga** e queda de tensão na fita (máx. ~5 m por alimentação em 12 V, ~10 m em 24 V [P]).

### 5.4 Arranjo das luminárias (como arquitetos posicionam) [P]

- **Grade regular**: Nx × Ny luminárias com Nx/Ny ≈ c/l. Espaçamento entre luminárias S ≤ **SHR × h**, com SHR (spacing-to-height ratio) do fabricante, tipicamente **1,0–1,5** para plafon/painel e **0,8–1,2** para spot de facho médio.
- **Distância à parede ≈ S/2** (S/3 quando há tarefa encostada na parede, como bancada de cozinha ou guarda-roupa).
- Algoritmo: `Nx = round(sqrt(N · c / l))`, `Ny = ceil(N / Nx)`; `Sx = c / Nx`, primeira luminária a `Sx / 2` da parede.
- **Centro do cômodo** para 1 luminária; alinhar com eixos de mobiliário (mesa de jantar: pendente centrado na mesa a 0,70–0,85 m acima do tampo; cama: evitar luz direta sobre o travesseiro; bancada: spots ou fita sob o armário aéreo; espelho de banheiro: arandelas laterais ou luz frontal, nunca só por cima).
- **Pé-direito duplo/mezanino** (comum em chalés): pendentes longos ou spots direcionáveis na parede/viga, e luz indireta para cima no telhado inclinado. Manutenção difícil: preferir arandelas acessíveis.
- **Escada**: balizadores na parede a ~0,30 m do degrau, ou fita sob o corrimão; iluminar o primeiro e o último degrau.

### 5.5 Comando (interruptores)

- NBR 5410 exige **1 ponto de luz comandado por interruptor por cômodo** [N 9.5.2.1.1]. **Não há exigência normativa explícita de three-way (paralelo)**. É boa prática, e a NBR 9050 pede comandos acessíveis nas rotas.
- Regras de boas práticas para o assistente [P]:
  - **Escada**: paralelo (three-way) em cima e embaixo. Em escada com 3+ acessos: paralelo + **intermediário (four-way)**.
  - **Corredor > 5 m** ou com 2+ acessos: paralelo nas extremidades.
  - **Cômodo com 2 portas** distantes > ~3 m: paralelo.
  - **Dormitório**: opcional paralelo porta/cabeceira.
  - **Varanda/externa**: interruptor interno junto à porta; opcional sensor de presença/fotocélula.
  - Interruptor do lado da maçaneta, a 0,10–0,20 m do batente, do lado de **dentro** do cômodo (exceto banheiro/depósito, em que pode ficar fora [P]).
- Quantidade de seções: 1 seção por grupo de luminárias que acende junto (ex.: sala: geral + spots + pendente = interruptor de 3 seções).
- Alternativa moderna: pulsador + relé de impulso, ou interruptores inteligentes (exigem neutro na caixa: **recomendar levar neutro a toda caixa de interruptor**).
- Fiação: interruptor simples = fase + retorno; paralelo = fase + 2 travessas + retorno; intermediário = 4 travessas. Isso define os condutores nos eletrodutos (§3) automaticamente.

### 5.6 Iluminação externa

- Acesso/porta: arandela 600–1.000 lm, preferencialmente com fotocélula ou sensor de presença.
- Caminhos: balizadores a cada 1,5–3 m (5–20 lx).
- Deck/varanda: 30–50 lx; evitar ofuscamento e luz azul (insetos: 2700 K ou âmbar).
- Fachada/árvores: refletores com IP65+, facho estreito.
- Grau de proteção: externo coberto IP44; exposto IP65; balizador de piso IP67.
- Circuitos de tomadas externas: DR 30 mA (§2.7). Iluminação externa a < 2,5 m: considerar DR.

### 5.7 Luz na apresentação 3D (three.js) [nota curta]

- Com `renderer.useLegacyLights = false` (padrão desde r155; unidades físicas), **intensity = candela (cd)**.
- **PointLight**: `intensity = Φ / (4π)` (fonte isotrópica); `light.power = Φ` faz a conversão sozinho.
- **SpotLight**: o three.js usa `power = intensity · π` (convenção, independe do ângulo) → `intensity = Φ / π`. Para um spot de 500 lm: 159 cd. Ângulo: `angle = beamAngle/2` (rad); penumbra 0,3–0,5.
- **RectAreaLight** (painel, fita): `power` em lm, com intensidade em nits (cd/m²). Bom para sanca/fita.
- Distância/decay: `decay = 2` (inverso do quadrado), `distance = 0` ou ~10 m para limitar custo.
- Exige **tone mapping** (`ACESFilmicToneMapping`/`AgXToneMapping`) e exposição ajustada (≈ 0,5–1,0). Sem isso, cenas residenciais em lux reais ficam estouradas ou escuras.
- Desempenho: limitar sombras a 2–4 luzes principais; para muitas luminárias, usar **lightmap/baking** ou clusters. Para a meta de 60 fps, só as N luminárias mais próximas ganham luz real; as demais viram emissivo (`emissiveIntensity`) + bloom.
- Cor: CCT → RGB (2700 K ≈ #FFB46B; 3000 K ≈ #FFC184; 4000 K ≈ #FFD8B0; 6500 K ≈ #FFFFFF, aproximações do locus de Planck).

Fontes §5: [Lar Pontual: projeto luminotécnico (faixas por cômodo)](https://larpontual.com.br/portal/projeto-luminotecnico) · [IFPB: projeto pela NBR ISO/CIE 8995-1](https://repositorio.ifpb.edu.br/bitstream/177683/2811/1/Lucas%20Alves%20Trajano%20-%20Projeto%20de%20ilumina%c3%a7%c3%a3o%20interna%20de%20uma%20escola%20de%20ensino%20fundamental%20e%20m%c3%a9dio%20utilizando%20a%20norma%20NBR%20ISO-%20CIE%208995-1.pdf) · [UFCG: avaliação de iluminação de recintos](https://bdtd.ufcg.edu.br/jspui/bitstream/riufcg/30415/1/AVALIA%c3%87%c3%83O%20DE%20ILUMINA%c3%87%c3%83O%20DE%20RECINTOS%20-%20ANAIS%20V%20SIMEP%20ARTIGO%202017.pdf) · [UnB: desempenho lumínico (NBR 15575)](https://repositorio.unb.br/bitstream/10482/50851/1/ARTIGO_ValidacaoDesempenhoLuminico.pdf) · [Normas.com.br: desempenho das edificações habitacionais](https://www.normas.com.br/visualizar/artigo-tecnico/3314/o-desempenho-das-edificacoes-habitacionais) · [three.js: SpotLight](https://threejs.org/docs/pages/SpotLight.html) · [three.js forum: lighting r155](https://discourse.threejs.org/t/updates-to-lighting-in-three-js-r155/53733/1) · [three.js forum: luminous intensity calculation](https://discourse.threejs.org/t/luminous-intensity-calculation/19242) · EN 12464-1:2021 · IES Lighting Handbook (residential).

---

## 6. UX: como as ferramentas profissionais fazem

### 6.1 Panorama

| Ferramenta | Lançamento de pontos | Circuitos | Eletrodutos/fiação | Saídas |
|---|---|---|---|---|
| **AltoQi QiBuilder (QiElétrico)**, BR, BIM sobre IFC | Biblioteca de símbolos NBR; clique na planta; tomada "snap" na parede com altura pelo tipo; luminárias com fotometria | Atribuição manual por seleção ou distribuição automática; dimensionamento automático (seção, disjuntor, DR, queda de tensão) | **Lançamento automático de eletrodutos** entre pontos e quadro; fiação "passa" automaticamente pelos condutos (calcula condutores em cada trecho e verifica ocupação) | Quadro de cargas, diagrama unifilar e multifilar, lista de materiais, pranchas |
| **Lumine (AltoQi Lumine V4)**, legado BR em CAD | Igual, sobre DWG | Automático com edição | Traçado de conduto manual com fiação automática | Quadro de cargas, unifilar, quantitativos |
| **Revit MEP (Electrical)** | Famílias hospedadas na face da parede/forro (altura pelo "offset") | Selecionar dispositivos → "Power" → escolhe painel; numeração automática dos polos; **Panel Schedule** | Wire (arco/chanfro) 2D com **home run arrow** apontando para o painel; conduíte 3D manual; add-ins como EVOLVE e Automatic Conduit fazem auto-route | Panel schedule, load classification com fatores de demanda, cálculos de queda de tensão (2025+ melhorou o "circuit path") |
| **Archicad MEP Modeler** | Objetos MEP 3D | Fraco em circuitos (foco em rotas) | Rotas 3D de eletrocalha/conduíte com conexões | Listagens |
| **ProfiCAD** | Esquemas elétricos 2D (não é planta BIM) | — | — | Diagramas unifilares/multifilares, lista de materiais |
| **Vectorworks Spotlight/MEP** | Dispositivos com circuito | "Create circuit" com seleção | Fio 2D | Relatórios |

Fluxo típico de projeto no QiBuilder (relatos acadêmicos): (1) configurar projeto (tensão, concessionária, critérios); (2) lançar pontos de luz e comandos; (3) lançar TUG e TUE; (4) lançar quadros e distribuir circuitos; (5) lançar condutos e fiação; (6) gerar pranchas e relatórios.

### 6.2 Lições de UX para um leigo

1. **Começar de um projeto automático e deixar editar** (o ChaléCAD já gera pontos): "Gerar projeto elétrico" → tudo aparece em planta; o usuário move, apaga e adiciona. Isso é melhor que tela em branco.
2. **Paleta de símbolos** curta e visual: Luz de teto · Spot · Pendente · Arandela · Fita LED · Interruptor (1/2/3 seções, paralelo) · Tomada baixa/média/alta · TUE (com lista de equipamentos) · Quadro. Ícones NBR 5444 **e** ícone ilustrativo, com legenda.
3. **Snap inteligente**: tomada/interruptor clicado perto de uma parede → encaixa na face interna do cômodo, perpendicular, com a **altura padrão do tipo** (0,30 / 1,10 / 2,20); evita portas e janelas (afasta para fora do vão); interruptor sugere o lado da maçaneta. Luminária → teto, com sugestão de grade ("distribuir 4 luminárias na sala").
4. **Feedback ao vivo** no cômodo: selo com "lux estimado 180 lx ✓", "tomadas 4/4 mínimas ✓", "DR obrigatório ⚠".
5. **Circuitos automáticos com cores**: cada circuito tem uma cor em planta; arrastar um ponto para outro circuito na lista lateral; botão "redistribuir circuitos". Mostrar barra de carga do circuito (% de In) e queda de tensão.
6. **Eletroduto**: (a) **auto-route** (botão "traçar eletrodutos"): gera árvore mínima pelo forro/piso respeitando as regras de 15 m/3 curvas, criando caixas de passagem quando preciso; (b) **desenhar polilinha** (clique a clique, com snap a caixas e ortogonal); (c) editar vértices. Condutores calculados automaticamente por trecho (marcas de fase/neutro/retorno/terra), com ⌀ do eletroduto auto-dimensionado e destaque vermelho se exceder a ocupação.
7. **Modo "Teto" e modo "Piso"** (camadas): linha contínua × tracejada, como na convenção.
8. **Saídas**: quadro de cargas (tabela por circuito e fase), unifilar gerado (SVG), lista de materiais (cabos por cor/seção em metros com perda, eletrodutos por DN, caixas 4×2/4×4/octogonal, disjuntores, DR, DPS, módulos de tomada/interruptor, espelhos, luminárias), orçamento integrado ao pricebook.
9. **Avisos explicados em linguagem simples**, cada um com o item da norma e um botão "corrigir" (ex.: "Adicionar tomada que falta", "Trocar cabo para 4 mm²").
10. **Vista 3D**: caixas e eletrodutos dentro das paredes LSF, desenhados junto com os montantes, com detecção de conflito com montante sem furo ou com pilar/viga.

Fontes §6: [AltoQi: guia de boas práticas em projetos elétricos](https://lps.altoqi.com.br/hubfs/%5BMKT%5D%20Materiais%20Ricos/Ebooks/%5BEbook%5D%20Guia%20de%20boas%20praticas%20para%20projetos%20eletricos%20(1).pdf) · [ANTAC SBTIC: fluxo no QiBuilder](https://eventos.antac.org.br/index.php/sbtic/article/download/568/805/3391) · [Revista FT: BIM com AltoQi Builder](https://revistaft.com.br/a-aplicacao-da-modelagem-da-informacao-da-construcao-bim-na-facilidade-de-instalacoes-eletricas-com-o-uso-do-altoqi-builder/) · [Hotmart: curso QiBuilder elétrica](https://hotmart.com/pt-br/marketplace/produtos/curso-qibuilder-eletrica/O102081306P) · [Voltimum: BIM capítulo III](https://content.voltimum.com/br/2408/capiii_bim_158.pdf) · [Autodesk: adicionar fiação a circuitos](https://www.autodesk.com/learn/ondemand/course/mep-electrical-design/unit/5ZoFtJJ3cMtpKrzA1PDqrL) · [Autodesk Help: fiação opcional](https://help.autodesk.com/cloudhelp/2020/ENU/Revit-Model/files/GUID-553F57D3-F2A9-4FF8-BD95-C4C190728FEE.htm) · [Revit 2026: Improved Electrical Circuit Path](https://help.autodesk.com/cloudhelp/2026/ENU/Revit-WhatsNew/files/GUID-42130FED-AA81-4D98-BF56-326FAC5D6E1B.htm) · [AUGI: Revit electrical panels](https://augi.com/articles/detail/revit-electrical-panels-explained) · [EVOLVE: Auto Route](https://help-electrical.evolvemep.com/article/wvh6fsawu8-auto-route) · [Autodesk Marketplace: Automatic Conduit](https://marketplace.autodesk.com/apps/22c67788-7b13-4a9c-a81e-3847bc6e92a6) · [Vectorworks: creating a circuit](https://app-help.vectorworks.net/2025/eng/VW2025_Guide/MEP/Creating_a_circuit.htm) · [Engehall: como ler projeto elétrico](https://engehall.com.br/como-ler-projeto-eletrico-predial/)

---

## 7. Simbologia em planta (NBR 5444:1989, cancelada em 11/2014 sem substituta, ainda usada)

A NBR 5444 foi cancelada sem substituição, mas a simbologia continua sendo a convenção de fato em projetos residenciais brasileiros. Alternativa internacional: IEC 60617. Resumo dos símbolos (descrição geométrica para implementar em SVG):

| Elemento | Símbolo usual em planta | Anotações |
|---|---|---|
| **Eletroduto embutido no teto/laje** | Linha contínua | ⌀ ao lado (ex.: "20") |
| **Eletroduto embutido no piso** | Linha tracejada | |
| Eletroduto aparente | Linha traço-ponto | |
| Eletroduto que sobe / desce | Seta perpendicular saindo do ponto (↑ sobe, ↓ desce), às vezes círculo com seta | |
| Condutores no eletroduto | Traços curtos cruzando a linha: **fase** = traço com "bolinha"/barra cheia; **neutro** = traço simples; **retorno** = traço com gancho/meia-lua; **terra (PE)** = traço com barra/"T" | Nº do circuito ao lado de cada traço; seção quando diferente do padrão |
| **Ponto de luz no teto** | Círculo (⌀ ~6–8 mm na escala de impressão) dividido em 4 setores: superior = nº do circuito; esquerdo = potência (W/VA); inferior/direito = letra do comando (a, b, c…) | Ex.: "100 / 2 / a" |
| Ponto de luz na parede (arandela) | Semicírculo/círculo menor encostado na parede com traço | Mesmas anotações |
| Luminária fluorescente/linear (fita, perfil) | Retângulo alongado | |
| Spot/embutido | Círculo pequeno com "x" ou cruz [P] | |
| **Interruptor simples** | Círculo pequeno (⌀ ~3 mm) com letra(s) do comando ("a"; 2 seções "a b") | Nº do circuito ao lado |
| **Interruptor paralelo (three-way)** | Círculo com traço interno/semicírculo preenchido, ou "S3" [P] | Letra do comando |
| Interruptor intermediário (four-way) | Círculo com dois traços / "S4" [P] | |
| Pulsador/campainha | Círculo com ponto / quadrado pequeno | |
| **Tomada baixa** (0,30 m) | Triângulo **vazado** (ou meio triângulo) encostado na parede, ponta para dentro do cômodo | Potência (VA) e nº do circuito |
| **Tomada média** (1,10–1,30 m) | Triângulo com metade preenchida | |
| **Tomada alta** (2,00–2,20 m) | Triângulo **cheio** | |
| Tomada de piso | Triângulo dentro de quadrado | |
| **TUE** | Triângulo com indicação da potência e do equipamento, ou símbolo próprio (ex.: chuveiro: círculo com "CH"/ponto de saída) | |
| **Quadro de distribuição (QDC)** | Retângulo com metade hachurada (embutido) ou vazado (sobrepor) | Nome "QDC" |
| Quadro do medidor/padrão | Retângulo com "M" | |
| Caixa de passagem | Quadrado (no piso, com "X") | |
| Botão de campainha / cigarra | Círculo com ponto / símbolo de campainha | |
| Telefone, TV, dados | Triângulo com "T", "TV", "D" ou símbolo de tomada específico | Infra seca |
| Aterramento | Três traços horizontais decrescentes | |

Observação: há variações regionais e por escritório (ex.: tomada por "meio círculo" no padrão Pirelli/Procobre: meia-lua vazada/meia-cheia/cheia para baixa/média/alta). **Recomendação:** símbolos configuráveis por um `symbolSet: 'NBR5444' | 'Procobre' | 'IEC'`, e sempre **legenda gerada** na prancha.

Fontes §7: [IFPR: NBR 5444 (PDF)](https://wiki.foz.ifpr.edu.br/wiki/images/b/b8/NBR5444.pdf) · [UFV GESEP: Aula 2, normas e simbologia](https://gesep.ufv.br/wp-content/uploads/2021/07/Aula-2-normas-e-simbologia.pdf) · [Normas.com.br: NBR 5444 (status)](https://www.normas.com.br/visualizar/abnt-nbr-nm/7854/abnt-nbr5444-simbolos-graficos-para-instalacoes-eletricas-prediais) · [SENAI SC: instalações elétricas](https://ia601704.us.archive.org/31/items/Material5/InstalaesEltricas-Senai-Sc.pdf) · [FM2S: símbolos elétricos](https://www.fm2s.com.br/blog/simbolos-eletricos) · [IFSC: aula PJI](https://wiki.sj.ifsc.edu.br/images/archive/0/07/20180225144558!Aula_01_-_PJI11101.pdf)

---

## 8. Spec proposta para o ChaléCAD

### 8.1 Princípios

- O **projeto elétrico desenhado** passa a fazer parte do JSON do projeto (fonte de verdade = o que o usuário posicionou), em `project.electrical`. Cálculos (cargas, seções, ΔV, quantitativos, lux) continuam **derivados** por funções puras.
- O estimador atual vira o **gerador do layout inicial** ("Gerar automaticamente"), que preenche `project.electrical` uma vez; depois o usuário edita. Sem `project.electrical`, o motor continua estimando como hoje (compatibilidade).
- Mudança de schema = sessão orquestradora (`packages/engine/src/schema`, `packages/catalog/src/schema.ts`), com `schemaVersion` + migração.
- Coordenadas em metros, z para cima, posições em planta referidas ao nível (`level`), alturas a partir do piso acabado do nível.

### 8.2 Modelo de dados (TypeScript)

```ts
// ---- Projeto (fonte de verdade) ----
type Id = string;

interface ElectricalProject {
  supply: {
    utilityId: string | null;          // chave em catalog.electrical.utilities
    phaseNeutral: 127 | 220;           // tensão F-N
    phases: 1 | 2 | 3;                 // ligação desejada (null = automático)
    earthing: 'TN-C-S' | 'TN-S' | 'TT';
    feederLength: number;              // m, padrão de entrada → QDC (para ΔV e cabo)
    ambientTemp: number;               // °C (padrão 30)
  };
  panels: Panel[];                     // normalmente 1 (QDC); mezanino pode ter 2º
  points: ElecPoint[];                 // tomadas, interruptores, TUE, pontos de luz
  luminaires: Luminaire[];             // ligadas a um ponto de luz (1 ponto : n luminárias)
  conduits: Conduit[];                 // polilinhas (trechos entre nós)
  boxes: Box[];                        // caixas de passagem explícitas (as dos pontos são implícitas)
  circuits: CircuitDef[];              // definição editável (pontos atribuídos, overrides)
  switchGroups: SwitchGroup[];         // comando: quais luminárias cada seção acende
  options: {
    autoCircuits: boolean;             // redistribuir quando pontos mudam
    autoConduits: boolean;             // re-rotear quando pontos mudam
    drPolicy: 'norm' | 'allSockets' | 'all';
    symbolSet: 'NBR5444' | 'Procobre' | 'IEC';
    wetOver6Rule: boolean;             // regra 600 VA × 2 quando > 6 pontos (§1.3)
  };
}

interface Panel {
  id: Id; name: string; level: Id;
  position: [number, number]; wallId: Id | null; height: number; // centro, padrão 1,50
  mounting: 'flush' | 'surface';
  ways: number | null;                 // nº de módulos DIN (null = calcular)
}

type PointKind =
  | 'socket'          // TUG
  | 'socket_tue'      // TUE (com appliance)
  | 'switch'          // simples/paralelo/intermediário, n seções
  | 'light_outlet'    // ponto de luz (teto ou parede)
  | 'data' | 'tv' | 'bell';            // infra seca (sem carga)

interface ElecPoint {
  id: Id; kind: PointKind; level: Id;
  position: [number, number];          // em planta; na face da parede quando hostWallId != null
  hostWallId: Id | null;               // null = teto/piso
  side: 1 | -1 | null;                 // face da parede (para qual cômodo aponta)
  height: number;                      // m acima do piso acabado (0,30 / 1,10 / 2,20 / teto)
  heightClass: 'low' | 'mid' | 'high' | 'ceiling' | 'floor';
  roomId: Id | null;                   // derivável, mas guardado para estabilidade
  mount: 'ceiling' | 'wall' | 'floor';
  // carga
  powerVA: number | null;              // null = regra normativa (100/600 VA, ou soma das luminárias)
  powerFactor: number;                 // padrão 1,0 (resistivo) / 0,92 (LED, eletrônicos) / 0,8 (motor)
  appliance: string | null;            // chave em catalog.electrical.appliances (TUE)
  voltage: 'FN' | 'FF';                // F-N (127/220) ou F-F (220 em rede 127/220)
  modules: number;                     // nº de módulos na caixa (tomada dupla = 2)
  ip: 'IP20' | 'IP44' | 'IP54' | 'IP65';
  circuitId: Id | null;
  // interruptor
  switchType?: 'one_way' | 'two_way' | 'intermediate' | 'dimmer' | 'pulse';
  gangs?: number;                      // nº de seções (teclas)
  locked: boolean;                     // usuário fixou: o auto não move
}

interface Luminaire {
  id: Id; pointId: Id;                 // ponto de luz que a alimenta
  catalogId: string | null;            // catalog.electrical.luminaires
  type: 'plafon' | 'downlight' | 'spot' | 'pendant' | 'wall' | 'strip' | 'bollard' | 'flood';
  position: [number, number, number];  // x, y em planta; z = altura de montagem
  lumens: number; watts: number; cct: number; cri: number;
  beamAngle: number | null;            // graus (spots)
  length: number | null;               // m (fita LED); lumens/watts por metro × length
  lightingFactor: number | null;       // Fu override; null = estimar por K
}

interface SwitchGroup {                // "tecla a do interruptor X (e do paralelo Y) acende luminárias L1, L2"
  id: Id; letter: string;              // 'a', 'b', … (anotação em planta)
  switchPointIds: Id[];                // 1 = simples; 2 = paralelo; 3+ = paralelo + intermediários
  lightPointIds: Id[];
}

interface Conduit {
  id: Id; level: Id;
  path: [number, number, number][];    // polilinha 3D (z = altura acima do piso do nível)
  run: 'ceiling' | 'floor' | 'wall' | 'exposed' | 'underground';
  type: 'corrugated' | 'rigid' | 'flexible_metal' | 'pead';
  dn: number | null;                   // mm; null = dimensionar
  from: NodeRef; to: NodeRef;          // ponto, caixa, QDC
  auto: boolean;                       // gerado pelo auto-route (pode ser re-roteado)
}
type NodeRef = { kind: 'point' | 'box' | 'panel'; id: Id };

interface Box {
  id: Id; level: Id; position: [number, number, number];
  type: '4x2' | '4x4' | 'octagonal' | 'floor' | 'pull';
}

interface CircuitDef {
  id: Id; panelId: Id; number: number; name: string;
  kind: 'lighting' | 'sockets' | 'wet_sockets' | 'tue' | 'mixed' | 'feeder';
  phases: ('R' | 'S' | 'T')[];         // 1 (F-N) ou 2 (F-F) fases atribuídas
  method: 'B1' | 'B2' | 'A1' | 'D' | null; // null = deduzir do percurso
  overrides: { sectionMm2?: number; breakerA?: number; curve?: 'B' | 'C'; drId?: Id | null };
}

// ---- Resultado (derivado, nunca salvo) ----
interface CircuitResult {
  id: Id; powerVA: number; powerW: number; ib: number; voltage: number;
  phases: string[]; method: string; loadedConductors: 2 | 3;
  fca: number; fct: number; iz: number; izCorrected: number;
  sectionMm2: number; neutralMm2: number; peMm2: number;
  breaker: { in: number; curve: 'B' | 'C'; poles: 1 | 2 | 3 };
  dr: { required: boolean; reason: string[]; groupId: Id | null; sensitivityMa: 30 };
  lengthM: number; voltageDropPct: number; voltageDropTotalPct: number;
  sizingReason: 'ampacity' | 'voltage_drop' | 'minimum';
  cable: { phase: number; neutral: number; pe: number; return: number }; // metros por cor
}
interface ConduitResult {
  id: Id; length: number; bends90: number; dn: number;
  conductors: { circuitId: Id; role: 'F' | 'N' | 'PE' | 'R' | 'T'; sectionMm2: number }[];
  fillPct: number; fillLimitPct: number; circuitsCount: number;
}
interface RoomLightingResult {
  roomId: Id; area: number; K: number; fu: number; fm: number;
  lumens: number; avgLux: number; targetLux: number; minLux: number;
  wPerM2: number; status: 'low' | 'ok' | 'high';
}
interface ElectricalReport {
  circuits: CircuitResult[]; conduits: ConduitResult[]; lighting: RoomLightingResult[];
  loadTable: LoadTableRow[];           // quadro de cargas: circuito × fase × VA
  phaseBalance: { R: number; S: number; T: number; imbalancePct: number };
  demand: { installedKw: number; demandKva: number; byGroup: Record<string, number>; method: string };
  entrance: { category: string | null; breakerA: number | null; cableMm2: number | null; note: string };
  panel: { ways: number; reserves: number; main: { in: number; poles: number }; drs: DrGroup[]; dps: DpsSpec };
  bom: BomLine[];                      // lista de materiais
  warnings: EngineWarning[];
  disclaimer: string;                  // DISCLAIMER
}
```

### 8.3 Pipeline de cálculo (ordem)

Tudo puro, rodando no Worker (Comlink), entrada = `Project + Catalog`:

1. **Contexto**: cômodos (polígono, área, perímetro, uso, pé-direito), paredes com faces e vãos (`buildModel`), níveis.
2. **Atribuir cômodo** a cada ponto/luminária (point-in-polygon; pontos na parede → cômodo do lado `side`).
3. **Cargas por ponto** (§1): TUG por regra (100/600 VA, contagem por ambiente molhado, regra > 6 pontos opcional); TUE pelo aparelho; ponto de luz = max(regra de área do cômodo distribuída, Σ luminárias em VA = W/FP).
4. **Verificações de mínimos por cômodo** (§1.1–1.2): nº de pontos de luz, TUG por perímetro, 2 tomadas na bancada, banheiro, varanda.
5. **Iluminação** (§5): por cômodo, K → Fu → E média; densidade W/m²; status pela tabela de alvos.
6. **Comando**: validar `SwitchGroup` (todo ponto de luz tem comando; escada/corredor longo sugere paralelo).
7. **Circuitos**: se `autoCircuits`, (re)agrupar respeitando §1.5 (iluminação × tomadas; cozinha e serviço exclusivos; TUE > 10 A isolada; limite de VA por circuito `circuitMaxA × V`; proximidade espacial). Depois, distribuir fases por *greedy balancing* (maior carga primeiro → fase menos carregada; F-F ocupa duas fases).
8. **Topologia de eletrodutos**: se `autoConduits`, auto-route (abaixo); construir o **grafo** (nós = pontos, caixas, QDC; arestas = trechos de eletroduto). Derivar para cada circuito o caminho no grafo do QDC até cada ponto (árvore de Steiner aproximada por união dos caminhos mínimos).
9. **Condutores por trecho**: para cada trecho, quais circuitos passam e com quais papéis (F, N, PE; retornos e travessas entre interruptor e ponto de luz conforme `SwitchGroup`).
10. **Fatores**: FCA por circuito = pior trecho (nº de circuitos no trecho); FCT pela temperatura do percurso (forro/externo); método (B1, ou A1 se parede com isolamento na cavidade; D enterrado).
11. **Dimensionamento** (§2.10): Ib → In (curva C padrão; B para chuveiro/resistivo opcional) → S por Iz' → ΔV por momentos ao longo da árvore → elevar S se preciso → neutro, PE.
12. **Eletrodutos**: comprimento, curvas por trecho entre caixas (validar 15 m − 3 m/curva, ≤ 3 curvas; inserir caixa de passagem sugerida), DN mínimo pela taxa de ocupação.
13. **DR/DPS/quadro**: DR por regra (§2.7) e política; agrupamento em DRs (≤ ~4–5 circuitos por DR [P]); DPS conforme Uo; nº de módulos DIN = disjuntores (1P = 1 módulo, 2P = 2) + DR (2P = 2 módulos, 4P = 4) + DPS (1 por polo) + geral + reservas (§1.5 item 6) → caixa QDC comercial (12, 18, 24, 36 módulos).
14. **Demanda e entrada** (§4): grupos a–f com fatores do catálogo da concessionária; Ib geral; categoria provável; alimentador (Iz, ΔV ≤ 5% − maior ΔV terminal).
15. **Quantitativos (BOM)**: cabos por seção e cor = Σ (comprimento dos trechos × nº de condutores daquele papel) + **sobra de 0,30 m por caixa por condutor** + perda (catálogo, ~10%); eletrodutos por DN (+ 5–10%); caixas por tipo; curvas/luvas; módulos (tomada 10 A/20 A, interruptor por tipo), suportes, placas/espelhos; disjuntores por In/polos/curva; DR; DPS; barramentos; QDC; luminárias e lâmpadas; haste e cabo de aterramento. Preço via pricebook.
16. **Avisos** (§8.4) + `DISCLAIMER`.

**Auto-route (proposta simples e previsível):**
- Grafo de "corredores" candidatos: (a) forro do nível (grade ortogonal paralela às paredes, sobre a projeção dos cômodos), (b) dentro das paredes (verticais nas posições das caixas; horizontais só nas alturas de 0,30/1,10 m e só se a parede for LSF/drywall), (c) piso (radier), opcional e desligado por padrão.
- Custo = comprimento + penalidade por curva (ex.: 1,5 m) + penalidade por atravessar parede estrutural (furos) + penalidade por mudar de corredor.
- Para cada circuito: árvore de Steiner aproximada (Prim a partir do QDC sobre o grafo, conectando o terminal mais próximo da árvore). Mesclar circuitos que compartilham corredores no mesmo eletroduto até o limite de ocupação (FCA também cresce: preferir ≤ 3–4 circuitos por eletroduto).
- Pós-processo: inserir caixa de passagem quando o trecho viola 15 m − 3 m/curva ou 3 curvas; simplificar colineares.

### 8.4 Validações e avisos (com limiares e base)

| Código | Severidade | Condição | Base |
|---|---|---|---|
| `elec.room.no_light` | erro | cômodo sem ponto de luz no teto (banheiro: aceita arandela) | NBR 5410 9.5.2.1.1 |
| `elec.room.light_no_switch` | erro | ponto de luz sem interruptor (`SwitchGroup`) | 9.5.2.1.1 |
| `elec.room.sockets_min` | erro | TUG < mínimo (3,5 m / 5 m de perímetro; regras de área) | 9.5.2.2.1 |
| `elec.kitchen.counter_sockets` | erro | bancada ≥ 0,30 m sem 2 tomadas acima | 9.5.2.2.1 |
| `elec.bath.socket_zone` | erro | tomada a < 0,60 m do box/banheira (volumes 0–2) | 9.1 |
| `elec.bath.no_socket` | erro | banheiro sem tomada junto ao lavatório | 9.5.2.2.1 |
| `elec.circuit.mixed` | erro/aviso | iluminação e TUG no mesmo circuito fora das condições (Ib ≤ 16 A etc.) | 9.5.3.2 |
| `elec.circuit.wet_shared` | erro | tomada de cozinha/serviço em circuito com outros cômodos | 9.5.3.3 |
| `elec.circuit.tue_shared` | erro | equipamento com In > 10 A sem circuito exclusivo | 9.5.3.4 |
| `elec.circuit.overload` | erro | Ib > In ou In > Iz' | 5.3.4.1 |
| `elec.circuit.load_high` | aviso | carga > 1.270 VA (127 V) / 2.200 VA (220 V) em circuito de TUG/iluminação geral | prática Procobre |
| `elec.circuit.min_section` | erro | seção < 1,5 (iluminação) / 2,5 (força) | 6.2.6.1.1 |
| `elec.vdrop.terminal` | erro | ΔV terminal > 4% (aviso a partir de 3%) | 6.2.7.1 |
| `elec.vdrop.total` | erro | ΔV entrada + alimentador + terminal > 5% | 6.2.7.1 |
| `elec.dr.missing` | erro | circuito em local com chuveiro/banheira, cozinha, serviço, lavanderia, garagem, área externa, sem DR 30 mA (exceto luz ≥ 2,5 m) | 5.1.3.2.2 |
| `elec.dps.missing` | aviso | QDC sem DPS (linha aérea) | 5.4.2 / 6.3.5.2 |
| `elec.pe.missing` | erro | circuito sem PE | 5.1.2.2.3.6 |
| `elec.phase.imbalance` | aviso | desequilíbrio entre fases > 20% | prática |
| `elec.panel.reserves` | aviso | reservas < 2/3/4/15% | 6.5.4.7 |
| `elec.conduit.fill` | erro | ocupação > 53/31/40% | 6.2.11.1.6 |
| `elec.conduit.length` | erro | trecho sem caixa > 15 m − 3 m × curvas (30 m externo) | 6.2.11.1.6 b |
| `elec.conduit.bends` | erro | > 3 curvas de 90° entre caixas | 6.2.11.1.7 |
| `elec.conduit.splice` | info | lembrar que emendas só em caixas | 6.2.8 |
| `elec.lsf.stud_hole` | aviso | eletroduto cruza montante estrutural fora do furo previsto | prática LSF / calculista |
| `elec.lsf.insulation_method` | info | parede com isolamento: método A1 aplicado | Tab. 33 |
| `elec.light.low` / `.high` | aviso / info | E < mínimo do ambiente / E > 2 × alvo | NBR 5413 (ref.), ISO 8995-1 |
| `elec.light.stair_switching` | info | escada/corredor longo sem paralelo | boa prática, NBR 9050 |
| `elec.height.accessibility` | info | interruptor fora de 0,60–1,00 m (só se "modo acessível") | NBR 9050 |
| `elec.entrance.category` | info | categoria provável da entrada + "confirmar com a concessionária" | norma da distribuidora |
| `elec.shower.127v` | aviso | chuveiro F-N em 127 V > 4.400 W → sugerir F-F 220 V | prática |
| `elec.radier.floor_conduit` | info | eletrodutos de piso no radier precisam ser lançados antes da concretagem | prática |

Toda tela/relatório exibe o `DISCLAIMER` (não substitui projeto com ART).

### 8.5 Constantes de catálogo (`packages/catalog`, versionadas)

```ts
electrical: {
  normEdition: 'NBR5410:2004',
  loads: {
    lighting: { baseVA: 100, baseArea: 6, stepVA: 60, stepArea: 4 },        // 9.5.2.1.2
    sockets: {
      generalVA: 100, wetVA: 600, wetHighCount: 3, wetOver6HighCount: 2,    // 9.5.2.2.2
      perimeterStep: { wet: 3.5, living: 5, other: 5 },                     // 9.5.2.2.1
      smallRoomArea: 2.25, mediumRoomArea: 6, counterMinWidth: 0.30, counterSockets: 2,
      bathSocketMinDistFromShower: 0.60,
    },
    tueSeparateAboveA: 10,                                                  // 9.5.3.4
    circuitMaxA: { lighting: 10, sockets: 10, wet_sockets: 16 },            // prática
    mixedCircuitMaxA: 16,                                                   // 9.5.3.2
  },
  appliances: {
    electric_shower: { w: 5500, pf: 1.0, voltage: 'FF', curve: 'B' },
    electric_faucet: { w: 4500, pf: 1.0, voltage: 'FF', curve: 'B' },
    oven: { w: 2500, pf: 1.0 }, cooktop_induction: { w: 6000, pf: 0.98 },
    microwave: { w: 1400, pf: 0.95 }, dishwasher: { w: 1800, pf: 0.95 },
    washer: { w: 1200, pf: 0.9 }, dryer: { w: 3000, pf: 1.0 },
    ac_9k: { w: 950, pf: 0.92, curve: 'C' }, ac_12k: { w: 1300, pf: 0.92, curve: 'C' },
    ac_18k: { w: 1900, pf: 0.92, curve: 'C' }, fridge: { w: 300, pf: 0.8 },
    pump_half_hp: { w: 750, pf: 0.8, curve: 'C', motor: true },
    gate_motor: { w: 400, pf: 0.8, motor: true }, ev_charger_7k: { w: 7400, pf: 1.0, drType: 'A' },
  },
  // Tab. 36 (Cu/PVC 70 °C, 30 °C): [S, B1_2, B1_3, B2_2, B2_3, A1_2, A1_3, D_2, D_3]
  ampacity: [
    [1.5, 17.5, 15.5, 16.5, 15, 14.5, 13.5, 22, 18],
    [2.5, 24, 21, 23, 20, 19.5, 18, 29, 24],
    [4, 32, 28, 30, 27, 26, 24, 38, 31],
    [6, 41, 36, 38, 34, 34, 31, 47, 39],
    [10, 57, 50, 52, 46, 46, 42, 63, 52],
    [16, 76, 68, 69, 62, 61, 56, 81, 67],
    [25, 101, 89, 90, 80, 80, 73, 104, 86],
    [35, 125, 110, 111, 99, 99, 89, 125, 103],
  ],   // [?] colunas A1 e D: conferir no Guia Prysmian antes de usar
  tempFactorPVC: { 10: 1.22, 15: 1.17, 20: 1.12, 25: 1.06, 30: 1.0, 35: 0.94, 40: 0.87, 45: 0.79, 50: 0.71, 55: 0.61, 60: 0.5 },
  groupingFactor: [1.0, 0.8, 0.7, 0.65, 0.6, 0.57, 0.54, 0.52, 0.5, 0.5, 0.5, 0.45, 0.45, 0.45, 0.45, 0.41, 0.41, 0.41, 0.41, 0.38], // índice = n−1; n ≥ 20 → 0,38
  minSection: { lighting: 1.5, power: 2.5, control: 0.5 },
  peRule: [[16, 'same'], [35, 16], [Infinity, 'half']],                     // Tab. 58
  resistance20: { 1.5: 13.3, 2.5: 7.98, 4: 4.95, 6: 3.30, 10: 1.91, 16: 1.21, 25: 0.78, 35: 0.554 }, // Ω/km, classe 5
  resistanceTempFactor70: 1.196,
  voltageDrop: { terminalMaxPct: 4, totalFromDeliveryPct: 5, totalOwnTransformerPct: 7, warnAtPct: 3 },
  breakers: { ratings: [6, 10, 13, 16, 20, 25, 32, 40, 50, 63, 70, 80, 100, 125], defaultCurve: 'C' },
  dr: { sensitivityMa: 30, ratings: [25, 40, 63, 80], excludeLightingAboveM: 2.5,
        requiredRoomUses: ['bathroom', 'kitchen', 'laundry', 'service', 'garage', 'outdoor'], maxCircuitsPerDr: 5 },
  dps: { class: 'II', ucByUo: { 127: 175, 220: 275 }, inMinKa: 5, inDefaultKa: 10, imaxKa: 20,
         upMaxKv: { 127: 1.5, 220: 2.5 }, leadMinMm2: 4 },
  panelReserves: [[6, 2], [12, 3], [30, 4], [Infinity, 0.15]],             // 6.5.4.7
  panelSizes: [8, 12, 18, 24, 36, 48],                                      // módulos DIN
  conduit: {
    fillMax: { 1: 0.53, 2: 0.31, many: 0.40 },
    maxStraight: { indoor: 15, outdoor: 30 }, reducePerBend90: 3, maxBends90: 3,
    corrugated: [ { dn: 16, di: 11.5 }, { dn: 20, di: 15.0 }, { dn: 25, di: 19.5 }, { dn: 32, di: 25.5 }, { dn: 40, di: 32.5 } ], // [?] di por fabricante
    minDn: 20, wastePct: 0.08,
  },
  cableOuterDiameter: { 1.5: 3.0, 2.5: 3.6, 4: 4.2, 6: 4.7, 10: 6.1, 16: 7.2, 25: 8.9, 35: 10.2 }, // mm, flex 750 V
  cable: { slackPerBoxM: 0.3, wastePct: 0.10,
           colors: { N: 'azul-claro', PE: 'verde-amarelo', F: ['preto', 'vermelho', 'branco'], R: 'amarelo' } },
  heights: { low: 0.30, mid: 1.10, high: 2.20, switch: 1.10, wallLight: 2.00, shower: 2.20, panel: 1.50,
             accessibleSwitch: [0.60, 1.00], accessibleSocket: [0.40, 1.00] },
  switchOffsetFromJamb: 0.15,
  demand: {
    // CEMIG ND-5.1 (clássica) [?] conferir revisão vigente
    lightingSockets: { mode: 'flat', table: [[1, 0.86], [2, 0.75], [3, 0.66], [4, 0.59], [5, 0.52], [6, 0.45], [7, 0.40], [8, 0.35], [9, 0.31], [10, 0.27], [Infinity, 0.24]] },
    heating: [1, 1, 0.84, 0.76, 0.70, 0.65, 0.60, 0.57, 0.54, 0.52, 0.49, 0.48, 0.46, 0.45, 0.44, 0.43],
    airConditioning: { upTo10: 1.0 },
    motors: { largestFull: true, othersFactor: 0.5 },   // [?]
  },
  utilities: {
    generic_127: { phaseNeutral: 127, categories: [
      { code: 'M', phases: 1, maxLoadKw: 10, breakerA: 50, cableMm2: 10 },      // [?] ordem de grandeza
      { code: 'B', phases: 2, maxLoadKw: 20, breakerA: 63, cableMm2: 16 },
      { code: 'T', phases: 3, maxLoadKw: 75, breakerA: 100, cableMm2: 35 } ] },
    // cemig, enel_sp, enel_rj, enel_ce, copel, celesc, cpfl, neoenergia, equatorial, energisa…
  },
  stateDefaultPhaseNeutral: { AC: 127, AM: 127, AP: 127, ES: 127, MG: 127, MS: 127, MT: 127, PA: 127, PR: 127,
    RJ: 127, RO: 127, RR: 127, SP: 127, RS: 220, SC: 220, BA: 220, SE: 127, AL: 220, CE: 220, DF: 220, GO: 220,
    MA: 220, PB: 220, PE: 220, PI: 220, RN: 220, TO: 220 },                    // [?] só sugestão inicial; RS/SC/BA mistos
  lighting: {
    targetLux: { living: 150, kitchen: 250, bedroom: 150, bathroom: 200, laundry: 200, circulation: 100,
                 stairs: 150, garage: 100, office: 400, balcony: 50, outdoor: 10 },
    minLux:    { living: 100, kitchen: 150, bedroom: 100, bathroom: 100, laundry: 100, circulation: 75,
                 stairs: 100, garage: 75, office: 300, balcony: 20, outdoor: 5 },
    workPlane: { default: 0.75, kitchen: 0.90, bathroom: 0.90, circulation: 0, stairs: 0, outdoor: 0 },
    maintenanceFactor: { default: 0.8, kitchen: 0.7, outdoor: 0.7 },
    utilization: [[0.6, 0.36], [0.8, 0.44], [1.0, 0.50], [1.25, 0.56], [1.5, 0.60], [2.0, 0.66], [2.5, 0.70], [3.0, 0.73], [4.0, 0.77], [5.0, 0.80]], // K → Fu (70/50/20) [?]
    spacingToHeight: { plafon: 1.4, downlight: 1.2, spot: 1.0, pendant: 1.0 },
    wallDistanceFactor: 0.5,
    ledPowerFactor: 0.92,
  },
  luminaires: [
    { id: 'plafon_18w', type: 'plafon', watts: 18, lumens: 1600, cct: 3000, cri: 80 },
    { id: 'plafon_24w', type: 'plafon', watts: 24, lumens: 2200, cct: 3000, cri: 80 },
    { id: 'downlight_12w', type: 'downlight', watts: 12, lumens: 1000, cct: 3000, cri: 80 },
    { id: 'spot_gu10_6w', type: 'spot', watts: 6, lumens: 480, cct: 2700, cri: 80, beamAngle: 36 },
    { id: 'pendant_a60_9w', type: 'pendant', watts: 9, lumens: 806, cct: 2700, cri: 80, luminaireEff: 0.7 },
    { id: 'wall_8w', type: 'wall', watts: 8, lumens: 600, cct: 3000, cri: 80 },
    { id: 'strip_10w_m', type: 'strip', wattsPerM: 10, lumensPerM: 900, cct: 3000, cri: 90 },
    { id: 'bollard_3w', type: 'bollard', watts: 3, lumens: 150, cct: 3000, cri: 80, ip: 'IP65' },
    { id: 'flood_30w', type: 'flood', watts: 30, lumens: 2700, cct: 4000, cri: 80, ip: 'IP65' },
  ],
}
```

### 8.6 Ordem de implementação sugerida (cards)

1. **Schema + catálogo** (orquestrador): `project.electrical`, `catalog.electrical` (tabelas acima), migração.
2. **Motor: cargas e mínimos** (passos 2–4) + testes com os exemplos numéricos deste documento.
3. **Motor: dimensionamento** (Iz/FCT/FCA/ΔV/disjuntor/PE/DR/DPS), sem eletrodutos ainda (comprimento estimado como hoje).
4. **Motor: grafo de eletrodutos** (condutores por trecho, ocupação, regras de caixa) + auto-route.
5. **Motor: luminotécnico** (K, Fu, lux, grade sugerida) e comando.
6. **Motor: demanda/entrada/quadro/BOM** + orçamento.
7. **Web: ferramenta em planta** (paleta, snap em parede com altura, grade de luminárias, polilinha de eletroduto, cores por circuito, camadas teto/piso, simbologia NBR 5444).
8. **Web: relatórios** (quadro de cargas, unifilar SVG gerado do modelo, lista de materiais, legenda) e luz no 3D.

### 8.7 Testes de referência (valores esperados)

- Iluminação: 6 m² → 100 VA; 9,9 m² → 100; 10 m² → 160; 14 m² → 220.
- TUG: cozinha 3 × 3,5 m (perímetro 13 m) → ceil(13 / 3,5) = 4 pontos → 600 × 3 + 100 = 1.900 VA. Sala 4 × 5 (18 m) → 4 pontos × 100 VA.
- Chuveiro 5.500 W/220 V F-N, B1, FCA 1: Ib = 25 A → In = 25 A → 4 mm² (Iz 32 ≥ 25) → com L = 20 m, ΔV = 2 × 4,95 × 1,196 × 0,02 × 25 / 220 = 2,69% ✓. Com FCA 0,8 (2 circuitos): Iz' = 25,6 ≥ 25 ✓ ainda 4 mm². Mercado usa 6 mm²/32 A para chuveiro de 7.500 W.
- Chuveiro 5.500 W/127 V: Ib = 43,3 A → In = 50 A → 10 mm² (Iz 57) → recomendar F-F 220 V.
- TUG 220 V 2.200 VA: Ib = 10 A → In = 10 A (Ib ≤ In atende), 2,5 mm² (mínimo de força). Se o usuário pedir In = 16 A: exige Iz' ≥ 16 → 2,5 mm² vale com FCA ≥ 0,7 (Iz' = 16,8); com FCA 0,65 (4 circuitos), Iz' = 15,6 < 16 → erro `elec.circuit.overload` → sugerir In = 13 A ou 4 mm².
- Ocupação: 3 circuitos × (F + N + PE) de 2,5 mm² = 9 × 10,2 = 91,8 mm² → DN 20 corrugado (útil 71 mm²) ✗ → DN 25 (119 mm²) ✓.
- Lux: sala 4 × 5, h = 1,85, 4 × 1.800 lm, Fu 0,55, Fm 0,8 → E = 158 lx ✓ (alvo 150).

---

## Lista consolidada de incertezas a resolver antes de tornar regra bloqueante

1. Redação exata da regra "> 6 pontos" das TUG de áreas molhadas (9.5.2.2.2).
2. Colunas A1 e D da Tab. 36 e tabela de queda unitária completa (conferir no Guia Prysmian Rev9).
3. Diâmetros internos dos eletrodutos corrugados por fabricante.
4. Tabelas de demanda e categorias de entrada **por concessionária** (CEMIG ND-5.1 Tab. 1/10; Enel; Copel NTC 901100; Celesc; CPFL GED 13). Começar por 2–3 concessionárias e avisar nas demais.
5. Tabela de iluminância artificial da NBR 15575-1 (habitação) para substituir as referências da NBR 5413 cancelada.
6. Status da revisão da NBR 5410 (DR em todos os circuitos, AFDD, nova potência de iluminação). Acompanhar a publicação.
7. Dimensões de furos de fábrica em montantes LSF (por fabricante de perfil) para a validação `elec.lsf.stud_hole`.
8. Exigências de equipotencialização da estrutura LSF (nº de pontos de ligação ao BEP).
