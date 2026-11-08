# Pesquisa: projeto hidrossanitário em planta para o ChaléCAD

> Status: pesquisa (nov/2026). Nenhum código foi alterado. Este documento alimenta um futuro card de engine/catalog/UI.
> Escopo: chalés de 40 a 150 m², 1 ou 2 níveis (mezanino), caixa d'água em torre sobre o banheiro de cima, alimentação por gravidade e esgoto para rede pública ou fossa.
>
> **Aviso de fontes.** As normas ABNT são pagas e não estão disponíveis na íntegra. Os números abaixo vêm dos valores de engenharia **reproduzidos em apostilas universitárias, catálogos e manuais de fabricantes** (Tigre, Amanco Wavin, Lorenzetti, Komeco, Rinnai, UFPR, USP, CAPES etc.), que por sua vez transcrevem as tabelas da NBR 5626:1998, NBR 8160:1999, NBR 10844:1989, NBR 7229:1993 e NBR 13969:1997. Cada valor traz a indicação **[confirmado]** (visto em fonte consultada nesta pesquisa), **[usual]** (amplamente publicado, mas não reconferido aqui) ou **[incerto]** (conferir na norma antes de usar em validação bloqueante).
>
> Todo resultado que sair desta ferramenta deve exibir o `DISCLAIMER` do motor: não substitui projeto hidrossanitário com ART/RRT.

---

## 0. O que já existe no repositório (ponto de partida)

- `packages/engine/src/installations/points.ts` cria pontos `water_cold`, `water_hot`, `sewer` (40 ou 100 mm) e `drain` (caixa sifonada) a partir dos móveis (`furn_shower`, `furn_toilet`, `furn_bath_sink`, `furn_kitchen_sink`, `furn_tank`, `furn_washer`, `furn_bathtub`) e posiciona a caixa d'água (`TankInfo`, com torre opcional).
- `tank.ts` dimensiona a caixa: `ocupantes × waterPerPerson × reserveDays`, arredondando para `tankSizes` (constantes em `packages/catalog`).
- `pipes.ts` estima comprimentos com distância Manhattan × `routingFactor` (sem traçado real).
- `index.ts → pressureWarnings` verifica só a **coluna estática** (fundo da caixa − cota do ponto) contra 1,0 m (chuveiro) e 0,5 m (demais), **sem perdas de carga**. As constantes estão fixas no código (`SHOWER_POINT_HEIGHT = 2.1`, `MIN_COLUMN_*`), o que fere a regra "toda constante técnica vem de `packages/catalog`".

**Lacunas que esta pesquisa cobre:** traçado real em planta, vazões por simultaneidade, escolha de DN, perdas distribuídas e localizadas, pressão dinâmica por ponto, esgoto com UHC, declividade e ventilação, pluvial, fossa e lista de materiais.

**Achado importante para o código atual.** O critério "1 m abaixo da caixa basta" (usado hoje e repetido em manuais de chuveiro) **não garante** 10 kPa dinâmicos. No Exemplo 1 (seção 9), com 1,50 m de coluna estática, sobram só 0,62 m.c.a. no chuveiro depois das perdas. A torre precisa de cerca de 1,9 m de desnível, ou de tubos maiores.

---

## 1. Água fria e quente: NBR 5626:2020

### 1.1 Situação normativa (importante para o motor)

- A **NBR 5626:2020** cancelou e substituiu a NBR 5626:1998 (água fria) e a **NBR 7198:1993** (água quente), que passaram a formar uma só norma. [confirmado: SindusCon-PR, CBIC]
- A versão de 2020 **retirou o roteiro de cálculo, as tabelas de pesos relativos e a tabela de diâmetros** da versão de 1998, e não impõe método de vazão. A vazão de projeto de cada peça pode ser **estimada ou obtida do fabricante**, e a verificação passa a usar curvas vazão × pressão dos aparelhos. [confirmado: trabalhos UFPB/UFT/ANTAC]
- Novo critério: **queda de pressão de no máximo 10 %** no chuveiro quando ele opera junto com outro aparelho, em relação à pressão de projeto. [confirmado: UFT]
- Na prática de mercado (AltoQi, apostilas, TCCs de 2024 a 2026), o **método dos pesos relativos da versão de 1998 (raiz quadrada)** continua sendo o mais usado e é aceito porque a norma deixa o método a critério do projetista. Material da USP recomenda a fórmula universal (Darcy-Weisbach) para a perda de carga sob a 2020. [confirmado]

**Decisão sugerida:** implementar o método dos pesos (1998) como padrão, com o limite de 10 % da versão de 2020 como verificação extra. Deixar a fórmula de perda de carga selecionável (Fair-Whipple-Hsiao por padrão, Darcy-Weisbach como opção). Documentar no relatório: "vazões pelo método dos pesos relativos (prática consagrada; NBR 5626:2020 permite método a critério do projetista)".

### 1.2 Limites de pressão e velocidade

| Grandeza | Valor | Origem | Status |
|---|---|---|---|
| Pressão dinâmica mínima nos pontos de utilização | **10 kPa (≈1,0 m.c.a.)** | NBR 5626:1998 5.3.5.2 | [confirmado] |
| Exceção: ponto da caixa de descarga (bacia com caixa acoplada) | **5 kPa (0,5 m.c.a.)** | idem | [confirmado] |
| Exceção: ponto da válvula de descarga | **15 kPa (1,5 m.c.a.)**; na prática válvulas pedem bem mais (ver fabricante) | idem | [confirmado] |
| Pressão dinâmica mínima em qualquer ponto da rede (barrilete, colunas) | **5 kPa (0,5 m.c.a.)** | NBR 5626:1998 | [usual] |
| Pressão estática máxima nos pontos de utilização | **400 kPa (≈40 m.c.a.)** | 1998 5.3.5.3; mantido em 2020 (questões de concurso citando a 2020) | [confirmado] |
| Sobrepressão de golpe de aríete | ≤ **200 kPa** acima da pressão de serviço | 1998 | [confirmado] |
| Velocidade máxima em qualquer trecho | **3 m/s** | 1998 5.3.4 | [confirmado] |
| Queda de pressão no chuveiro em uso simultâneo | ≤ **10 %** da pressão de projeto | 2020 | [confirmado] |
| Chuveiros elétricos (Lorenzetti, Hydra) | faixa de funcionamento **10 kPa (1 m.c.a.) a 400 kPa (40 m.c.a.)**; manual sugere instalar o chuveiro "no mínimo 1 m abaixo da caixa" | manuais | [confirmado] |
| Aquecedor a gás de passagem | acionamento de **1 a 4 m.c.a.** conforme o modelo (Komeco Slim BP: > 2 m.c.a.; Rinnai E27: mínimo 4 m.c.a., ideal 7 a 30 m.c.a.); Komeco Digital recomenda ≥ **10 m.c.a.** no ponto mais alto | manuais | [confirmado] |

Conversão adotada: 1 m.c.a. = 9,80665 kPa. A norma de 1998 usa "10 kPa ≈ 1 m.c.a." nas tabelas. **Sugestão:** o motor trabalha em m.c.a. internamente e mostra kPa com fator 9,80665. Os limites no catálogo ficam em kPa, como na norma.

### 1.3 Vazões e pesos relativos (NBR 5626:1998, Tabela A.1)

Fórmula de simultaneidade (método da raiz quadrada):

```
Q = 0,30 · √(ΣP)      Q em L/s, ΣP = soma dos pesos a jusante do trecho
```

Regra prática para o motor: `Q_trecho = max(0,30·√ΣP, maior vazão unitária a jusante)`. Isso evita que um sub-ramal de um único aparelho fique com vazão menor que a do próprio aparelho (ex.: chuveiro elétrico, 0,3·√0,1 = 0,095 < 0,10 L/s).

**Água fria** [confirmado: stecine/UFRN, slides NBR 5626/98]

| Aparelho | Peça de utilização | Vazão de projeto (L/s) | Peso |
|---|---|---|---|
| Bacia sanitária | caixa de descarga (acoplada) | 0,15 | 0,3 |
| Bacia sanitária | válvula de descarga | 1,70 | 32 |
| Banheira | misturador (AF) | 0,30 | 1,0 |
| Bebedouro | registro de pressão | 0,10 | 0,1 |
| Bidê | misturador (AF) | 0,10 | 0,1 |
| Chuveiro ou ducha | misturador (AF) | 0,20 | 0,4 |
| Chuveiro elétrico | registro de pressão | 0,10 | 0,1 |
| Lavadora de pratos ou de roupas | registro de pressão | 0,30 | 1,0 |
| Lavatório | torneira ou misturador (AF) | 0,15 | 0,3 |
| Mictório cerâmico com sifão integrado | válvula de descarga | 0,50 | 2,8 |
| Mictório cerâmico sem sifão integrado | caixa, registro ou válvula | 0,15 | 0,3 |
| Pia | torneira ou misturador (AF) | 0,25 | 0,7 |
| Pia | torneira elétrica | 0,10 | 0,1 |
| Tanque | torneira | 0,25 | 0,7 |
| Torneira de jardim ou lavagem | torneira | 0,20 | 0,4 |

**Água quente** [confirmado: mesma fonte]

| Aparelho | Vazão (L/s) | Peso |
|---|---|---|
| Banheira (misturador AQ) | 0,30 | 1,0 |
| Bidê (misturador AQ) | 0,10 | 0,1 |
| Chuveiro/ducha (misturador AQ) | 0,20 | 0,5 |
| Lavatório (misturador AQ) | 0,20 | 0,5 |
| Pia (misturador AQ) | 0,25 | 0,7 |
| Lavadora de pratos/roupas | 0,30 | 1,0 |

Observação: algumas apostilas antigas dão chuveiro 0,5 e lavatório 0,5 também na água fria, porque copiam a NB-92/1980. Use a tabela acima.

**Diâmetros mínimos de sub-ramal (PVC soldável, DE em mm)** [confirmado: stecine]: chuveiro 20, lavatório 20, bacia com caixa 20, pia 20, bidê 20, banheira 20, **tanque 25**, **máquina de lavar 25**, aquecedor de alta pressão 20, **aquecedor de baixa pressão 25**, válvula de descarga 40 (1½") [usual: muitas válvulas pedem DN 50 em baixa pressão].

### 1.4 Tubos: diâmetros nominais e internos

**PVC rígido soldável (NBR 5648), classe 15** [usual: catálogo Tigre/Amanco; DE e espessura padronizados]

| DE (mm) | Ref. rosca | Espessura (mm) | **DI (mm)** | Área interna (cm²) |
|---|---|---|---|---|
| 20 | ½" | 1,5 | **17,0** | 2,27 |
| 25 | ¾" | 1,7 | **21,6** | 3,66 |
| 32 | 1" | 2,1 | **27,8** | 6,07 |
| 40 | 1¼" | 2,4 | **35,2** | 9,73 |
| 50 | 1½" | 3,0 | **44,0** | 15,21 |
| 60 | 2" | 3,3 | 53,4 | 22,40 |
| 75 | 2½" | 4,2 | 66,6 | 34,84 |

**PPR PN 20 (água quente)** [usual: série SDR 6]: 20×3,4 → DI 13,2; 25×4,2 → DI 16,6; 32×5,4 → DI 21,2; 40×6,7 → DI 26,6; 50×8,3 → DI 33,4. Trabalha até cerca de 70 °C contínuo (pico de 95 °C).
**PEX (SDR 7,4)** [usual]: 16×2,2 → DI 11,6; 20×2,8 → DI 14,4; 25×3,5 → DI 18,0; 32×4,4 → DI 23,2.
**CPVC (Tigre Aquatherm)**: DE 15, 22, 28, 35, 42, 54 mm; até 80 °C. Pegar os DI no catálogo Tigre (FT Aquatherm 2025) antes de cadastrar. [incerto: DI não conferidos]

> Atenção: no PPR e no PEX o DI é bem menor que no PVC de mesmo DE. Um PPR 25 tem praticamente o DI de um PVC 20, então a perda de carga na água quente deve usar o DI do material, nunca o DE.

### 1.5 Perda de carga distribuída

**Fair-Whipple-Hsiao (FWH), tubos lisos (PVC, cobre, PPR/PEX), água fria.** Forma de origem: `Q = 55,934·J^0,571·D^2,714` (SI). Isolando J:

```
J = 0,000869 · Q^1,75 / D^4,75        J [m/m], Q [m³/s], D = diâmetro INTERNO [m]
```

Forma da NBR 5626:1998, Anexo A (unidades práticas):

```
J = 8,69·10^6 · Q^1,75 · d^-4,75      J [kPa/m], Q [L/s], d [mm]
```

As duas formas coincidem se adotarmos 1 m.c.a. = 10 kPa (8,69·10⁶ × 10⁻⁹ = 0,00869 kPa/m = 0,000869 m/m). Muitas apostilas trazem 0,0008695. A diferença entre os coeficientes é desprezível (< 0,1 %). [confirmado: forma e expoentes vistos em aula da USP (PHD0313); constante deduzida da forma em Q]

- Para **tubos rugosos** (aço galvanizado): `J = 0,002021·Q^1,88/D^4,88` (SI) ou `20,2·10⁶·Q^1,88·d^-4,88` (kPa/m). [confirmado: USP]
- Para **água quente** em cobre/plástico (FWH): `Q = 63,281·J^0,571·D^2,714`, o que dá `J ≈ 0,000701·Q^1,75/D^4,75`. Algumas fontes arredondam para 0,000692. [usual]
- Validade: DN ½" a 2" (12,7 a 50,8 mm), ou seja, toda a rede de um chalé. [confirmado: UEG]

**Hazen-Williams (opcional):**

```
J = 10,643 · Q^1,852 · C^-1,852 · D^-4,87       J [m/m], Q [m³/s], D [m]
```

| Material | C |
|---|---|
| PVC, PEX, PPR, polietileno (novos, mantêm o valor ao longo da vida útil) | 150 (140 conservador) |
| Cobre | 130 a 140 |
| Aço galvanizado | 120 a 125 (100 se usado) |

[confirmado: tabelas da USP e da ULisboa, servidos.ar]. Em DN pequenos, o Hazen-Williams com C = 150 dá perdas cerca de 20 % **menores** que o FWH (ver números na seção 9). Por isso o FWH é o padrão mais conservador.

**Darcy-Weisbach (fórmula universal, preferida por material da USP sob a 2020):** `hf = f·(L/D)·v²/2g`, com f por Swamee-Jain `f = 0,25 / [log10(ε/(3,7D) + 5,74/Re^0,9)]²`, rugosidade do PVC ε ≈ 0,0015 mm [usual] e ν = 1,0·10⁻⁶ m²/s a 20 °C. Para água quente a 60 °C, ν ≈ 0,47·10⁻⁶.

### 1.6 Perdas localizadas: comprimentos equivalentes (PVC rígido, m)

Tabela clássica dos catálogos Tigre e da NBR 5626:1998 (ábaco/anexo), reproduzida em apostilas. As colunas DN 20 e 25 foram **[confirmadas]** (stecine/UFRN). As demais são **[usuais]** (mesma tabela nos catálogos Tigre e no livro do Macintyre).

| Peça | 20 | 25 | 32 | 40 | 50 |
|---|---|---|---|---|---|
| Joelho 90° | 1,1 | 1,2 | 1,5 | 2,0 | 3,2 |
| Joelho 45° | 0,4 | 0,5 | 0,7 | 1,0 | 1,0 |
| Curva 90° | 0,4 | 0,5 | 0,6 | 0,7 | 1,2 |
| Curva 45° | 0,2 | 0,3 | 0,4 | 0,5 | 0,6 |
| Tê 90° passagem direta | 0,7 | 0,8 | 0,9 | 1,5 | 2,2 |
| Tê 90° saída de lado | 2,3 | 2,4 | 3,1 | 4,6 | 7,3 |
| Tê 90° saída bilateral | 2,3 | 2,4 | 3,1 | 4,6 | 7,3 |
| Entrada normal (saída da caixa d'água, tubo rente) | 0,3 | 0,4 | 0,5 | 0,6 | 1,0 |
| Entrada de borda (tubo reentrante na caixa) | 0,9 | 1,0 | 1,2 | 1,8 | 2,3 |
| Saída de canalização | 0,8 | 0,9 | 1,3 | 1,4 | 3,2 |
| Registro de gaveta aberto | 0,1 | 0,2 | 0,3 | 0,4 | 0,7 |
| Registro de globo aberto | 11,1 | 11,4 | 15,0 | 22,0 | 35,8 |
| Registro de ângulo aberto | 5,9 | 6,1 | 8,4 | 10,5 | 17,0 |
| Válvula de retenção leve | 2,5 | 2,7 | 3,8 | 4,9 | 6,8 |
| Válvula de pé com crivo | 8,1 | 9,5 | 13,3 | 15,5 | 18,3 |

- **Registro de pressão** (o registro de chuveiro e de lavatório): as apostilas o tratam como **registro de globo**. É o maior termo de perda num sub-ramal de chuveiro (11,1 m equivalentes em DN 20). [usual] Fabricantes (Docol, Deca) publicam curvas próprias. Estudos da Unipampa mostraram que os valores tabelados de registros de esfera estão subdimensionados em DN 20 a 32. [confirmado] **Sugestão:** `registro_pressao = registro_globo` no catálogo, com nota.
- **Registro de esfera** (comum em PPR/PEX): usar o valor do registro de gaveta como mínimo. [incerto]
- **Conexões de PPR/PEX**: usar os coeficientes K do fabricante (Amanco Wavin FT-PEX traz cerca de 0,28 m.c.a. por joelho de latão num exemplo). Para o MVP, aplicar a tabela de PVC pelo DI equivalente. [incerto]
- Simplificação aceita para pré-dimensionamento (AltoQi e apostilas): **acréscimo de 20 a 40 % no comprimento real** quando as conexões ainda não estão definidas. O ChaléCAD pode inferir as conexões pelo traçado: cada vértice da polilinha vira um joelho 90° (ou 45° conforme o ângulo), cada nó de ramificação vira um tê, e o tipo do tê (direta ou lateral) é decidido pelo alinhamento.

### 1.7 Dimensionamento: passo a passo (método dos pesos)

1. **Árvore** a partir da saída da caixa: barrilete → colunas (descidas verticais) → ramais (por cômodo, após o registro de gaveta do ambiente) → sub-ramais (até cada ponto).
2. Para cada trecho: ΣP a jusante → `Q = max(0,3√ΣP, q_max)`.
3. **DN inicial:** o menor DN comercial com `v = Q/A ≤ v_alvo` e DN ≥ DN mínimo do sub-ramal (1.3). Use `v_alvo = 2,0 m/s` como padrão (margem de conforto e ruído) e mantenha `v ≤ 3,0 m/s` como limite de norma. [v_alvo é escolha de projeto; o critério antigo da NB-92, v ≤ 14√D, também pode ser oferecido]
4. **Perda por trecho:** `hf = J·(L_real + ΣL_eq)`.
5. **Pressão disponível em cada nó** (do montante para o jusante): `P_jusante = P_montante + (z_montante − z_jusante) − hf`. Na saída da caixa, `P = 0` com nível de referência no **fundo da caixa** (nível mínimo, conservador). A carga cinética v²/2g é desprezada, como na prática usual (v ≤ 2 m/s dá v²/2g ≤ 0,2 m). [usual]
6. **Verificar** `P_ponto ≥ P_min(aparelho)` e `P ≥ 5 kPa` em todos os nós intermediários. Atenção aos trechos do barrilete que **sobem** acima do fundo da caixa: geram pressão negativa e ar preso.
7. **Se falhar**, aumentar um DN nos trechos do caminho crítico com maior `hf`, um de cada vez, até passar ou até esgotar os DN. Se ainda falhar, propor elevar a caixa (altura necessária = `P_min + Σhf − (z_caixa − z_ponto)` a mais) ou um pressurizador.
8. **Estática máxima:** `z_fundo_ou_nível_máx − z_ponto ≤ 40 m.c.a.` (só importa com alimentação direta da rua ou pressurizador).

**Barrilete e colunas em chalé:** com uma caixa só, o "barrilete" é a saída da caixa com o registro geral, de onde saem uma ou duas descidas (banheiro de cima e térreo). Recomenda-se **registro de gaveta na saída da caixa** e **registro de gaveta em cada ambiente molhado** (o código atual já orça `water_valve` por cômodo molhado e um geral). Se houver aquecedor de passagem, convém uma descida exclusiva para ele (alimentação do aquecedor). [usual]

### 1.8 Reservatório: volume e posição

| Parâmetro | Valor | Status |
|---|---|---|
| Reserva mínima | ≥ **24 h** de consumo (NBR 5626) | [confirmado: stecine] |
| Reserva usual em residências / códigos de obras | **1 a 2 dias**. Para chalé rural com abastecimento intermitente ou poço, usar **2 dias** | [confirmado: apostila USP/slides] |
| Volume mínimo de reservatório | 500 L | [confirmado: stecine] |
| Taxa de ocupação | **2 pessoas por dormitório** social + 1 por dormitório de serviço | [confirmado] |
| Consumo per capita | residência popular ou rural 120 a 150; padrão médio 150 a 250 L/pessoa·dia (tabelas variam; Macintyre dá popular 150, médio 250, luxo 300) | [confirmado: slides] |
| Água quente (para aquecedor de acumulação/solar) | casa popular ou rural 36; residência 45 L/pessoa·dia | [confirmado: stecine] |
| Evitar reserva > 3 dias (renovação/potabilidade) | prática | [usual] |

**Sugestão para chalé:** 150 L/pessoa·dia, 2 pessoas/dormitório, 2 dias. Exemplo: 2 dormitórios → 4 pessoas × 150 × 2 = 1.200 L → caixa comercial de 1.500 L (ou 1.000 L com 1 dia). O catálogo já tem `waterPerPerson`, `reserveDays` e `personsPerBedroom`. Basta revisar os valores.

**Posição/altura:** a pressão é medida a partir do **fundo** da caixa (saída do barrilete). Regras práticas:
- Desnível estático mínimo para o chuveiro mais alto: `H ≥ P_min + Σhf`. Num chalé com mezanino, isso fica tipicamente entre **1,8 e 2,5 m** acima do ponto do chuveiro (ver Exemplo 1), e não 1,0 m.
- Saída do barrilete na lateral, poucos cm acima do fundo; dreno de limpeza no fundo; extravasor com DN acima do da alimentação (ex.: alimentação 25, extravasor 32 ou 40). [usual]
- Peso cheio (água + caixa) já é informado para o engenheiro (`install.tank_load`).

### 1.9 Água quente (NBR 5626:2020, ex-NBR 7198)

- Sistemas típicos de chalé: (a) **chuveiro elétrico** (sem rede de AQ); (b) **aquecedor de passagem a gás** com rede de AQ em PPR/CPVC/PEX; (c) **solar com boiler** (acumulação) e apoio.
- Vazões e pesos de AQ: tabela 1.3. Tubos: usar o DI real (1.4).
- Aquecedor de passagem: vazão a ΔT: `Q[L/min] = P[kW]·60 / (4,186·ΔT)`. Ex.: 26 kW com ΔT = 20 °C dá 18,6 L/min, o suficiente para 1 ducha (12 L/min) mais 1 lavatório. Vazões de AQ por peça (stecine): ducha 12, chuveiro 6, lavatório 9, pia 15 L/min. [confirmado]
- **Pressão mínima do aquecedor** (1 a 4 m.c.a. para acionar, 7 a 10 m.c.a. ideal) quase nunca é atingida por gravidade em chalé. Se houver aquecedor a gás, o motor deve emitir aviso de pressurizador. [confirmado: manuais]
- Solar: volume do boiler `V = V_consumo·(T_uso − T_fria)/(T_arm − T_fria)`. Ex.: 460 L/dia × (40 − 20)/(50 − 20) ≈ 307 L. [confirmado: stecine]
- Temperatura máxima, isolamento, anti-Legionella e misturadores: requisitos da 2020 **não conferidos** aqui. [incerto] Sugestão: aviso "isolar a tubulação de AQ" e "registro misturador" sem limites numéricos bloqueantes.
- Chuveiro elétrico: temperatura máxima de entrada de 50 °C (manual Hydra), o que importa se houver solar alimentando o chuveiro. [confirmado]

### 1.10 Pressurizador: quando recomendar

| Situação (pressão dinâmica calculada) | Ação sugerida | Severidade |
|---|---|---|
| Chuveiro elétrico < 10 kPa (1,0 m.c.a.) | elevar a caixa em ΔH calculado, aumentar DN no caminho crítico **ou** pressurizador | `warn` (mezanino) / `info` (térreo, já é assim hoje) |
| Ducha/misturador < 10 kPa | idem; ducha de alta vazão costuma pedir 20 kPa ou mais (ver fabricante) | `warn` |
| Aquecedor de passagem a gás < mínimo do modelo (padrão 2 m.c.a.; ideal ≥ 7 m.c.a.) | pressurizador na alimentação de AF do aquecedor e das duchas | `warn` |
| Bacia com caixa acoplada < 5 kPa | elevar a caixa | `warn` |
| Qualquer nó < 5 kPa ou trecho acima do fundo da caixa | refazer o traçado | `error` |
| Queda > 10 % no chuveiro com outro aparelho aberto (2020) | aumentar o DN dos trechos compartilhados | `info`/`warn` |
| Estática > 400 kPa | válvula redutora de pressão | `error` |

Prática de instalação do pressurizador (Rowa, Komeco, Lorenzetti) [usual]: abaixo do fundo da caixa, com sucção "afogada", de preferência numa saída exclusiva da caixa. Pressurizadores residenciais entregam cerca de 10 a 30 m.c.a.

**Fontes da seção 1:** [SindusCon-PR, NBR 5626:2020](https://sindusconpr.com.br/abnt-publica-norma-sobre-sistemas-prediais-de-agua-fria-e-agua-quente/) · [CBIC](https://cbic.org.br/abnt-publica-norma-sobre-sistemas-prediais-de-agua-fria-e-agua-quente/) · [UFT, mudanças da 2020](https://sistemas.uft.edu.br/periodicos/index.php/desafios/article/download/13066/22572/86989) · [UFPB, TCC 2024](https://repositorio.ufpb.br/jspui/bitstream/123456789/35984/1/2024_1_TCC_Igor_Melo_Vidal.pdf) · [Sistemas de água fria e quente: tabelas de pesos, Leq, sub-ramais](https://stecine.azureedge.net/repositorio/sistemas_de_agua_potavel_fria_e_quente_para_edificios/index.html) · [Slides de água fria predial: limites de 1998](https://pt.slideshare.net/slideshow/inst-agua-fria-predial-hidraulica/48236364) · [Slides de consumo per capita e reservação](https://pt.slideshare.net/slideshow/aula-de-instalacoes-prediais-de-gua-fria/42772185) · [USP PHD0313, perdas de carga (FWH)](https://edisciplinas.usp.br/pluginfile.php/4211268/mod_resource/content/7/PHD0313%20-%20Aula%203%20-%20Condutos%20For%C3%A7ados%20e%20Perdas%20de%20Carga.pdf) · [UEG, comparação de equações](https://www.revista.ueg.br/index.php/mirante/article/view/17550/12016) · [Unipampa, Leq de conexões de PVC](https://dspace.unipampa.edu.br/bitstream/riu/1902/1/QUANTIFICA%c3%87%c3%83O%20DA%20PERDA%20DE%20CARGA%20EM%20CONEX%c3%95ES%20DE%20PVC%20SOLD%c3%81VEL-%20DETERMINA%c3%87%c3%83O%20DOS%20COEFICIENTES%20K%20E%20COMPRIMENTOS%20EQUIVALENTES.pdf) · [Amanco Wavin FT PEX](https://mediahub.wavin.com/m/3ed0280a9782fb30/original/FT-PEX.pdf) · [Tigre FT Aquatherm](https://tigresite.s3.amazonaws.com/2025/10/FT_Aquatherm_2025-Rev-Final.pdf) · [Tabelas Hazen-Williams, USP](https://edisciplinas.usp.br/pluginfile.php/5340345/mod_resource/content/1/Tabelas%20para%20dimensionamento%20hidr%C3%A1ulico.pdf) · [ULisboa, tabela de C](https://fenix.isa.ulisboa.pt/qubEdu/disciplinas/mecfl/2015-2016/1-semestre/lateral/material-pedagogico/tabelas-para-aulas-praticas/tabela-3) · [Lorenzetti, manual Loren Shower](https://www.lorenzetti.com.br/manuais/lorenshower/manual.pdf) · [Hydra, manual Gorducha](https://bravalumi.cdn.magazord.com.br/img/2022/11/produto/6596/manual-do-produto-ducha-gorducha-e-ducha-banhao-v7.pdf) · [Komeco, Slim BP](https://www.komeco.com.br/arquivos/manuais/aquecimento-gas/slim/manual-aquecimento-gas-linha-slim-07m-bp.pdf) · [Komeco, Digital 20](https://www.komeco.com.br/arquivos/manuais/aquecimento-gas/digital/manual-aquecimento-gas-linha-digital-20.pdf)

---

## 2. Esgoto sanitário: NBR 8160:1999

### 2.1 UHC e ramal de descarga por aparelho (Tabela 3)

Valores reproduzidos em apostilas (USP, CAPES). Bacia (6/100), chuveiro (2/40), lavatório (1/40) e tanque (3/40) foram **[confirmados]**. Os demais são **[usuais]**.

| Aparelho | UHC | DN mínimo do ramal de descarga |
|---|---|---|
| Bacia sanitária | 6 | **100** (obrigatório, não se reduz) |
| Banheira (residencial) | 2 | 40 |
| Bebedouro | 0,5 | 40 |
| Bidê | 1 | 40 |
| Chuveiro residencial | 2 | 40 |
| Chuveiro coletivo | 4 | 40 |
| Lavatório residencial | 1 | 40 |
| Lavatório de uso geral | 2 | 40 |
| Mictório com válvula de descarga | 6 | 75 |
| Mictório com caixa de descarga | 5 | 50 |
| Pia de cozinha residencial | 3 | 50 |
| Pia de cozinha industrial (preparo / lavagem de panelas) | 3 / 4 | 50 |
| Tanque de lavar roupa | 3 | 40 |
| Máquina de lavar louça | 2 | 50 |
| Máquina de lavar roupa | 3 | 50 |

**Aparelhos não listados (Tabela 4)** [usual]: DN 40 → 2 UHC; 50 → 3; 75 → 5; 100 → 6.

### 2.2 Ramais de esgoto, tubos de queda e subcoletores

**Ramal de esgoto (Tabela 5), máximo de UHC** [confirmado: DN 50 = 6, DN 75 = 20, DN 100 = 160; DN 40 = 3 é usual]

| DN | 40 | 50 | 75 | 100 |
|---|---|---|---|---|
| UHC máx. | 3 | 6 | 20 | 160 |

**Tubo de queda (Tabela 6), UHC máx.** [usual]

| DN | Prédio até 3 pavimentos | Prédio com mais de 3 pavimentos |
|---|---|---|
| 40 | 4 | 8 |
| 50 | 10 | 24 |
| 75 | 30 | 70 |
| 100 | 240 | 500 |
| 150 | 960 | 1.900 |

Tubo de queda que recebe bacia: **DN 100**. Tubo de queda de pia de cozinha ou de máquina de lavar: recomenda-se DN ≥ 75 (espuma e gordura). [incerto quanto ao texto exato]

**Subcoletor e coletor predial (Tabela 7), UHC máx. por declividade** [usual]

| DN | 0,5 % | 1 % | 2 % | 4 % |
|---|---|---|---|---|
| 100 | 180 | 216 | 250 | 300 |
| 150 | — | 700 | 840 | 1.000 |
| 200 | 1.400 | 1.600 | 1.920 | 2.300 |

Um chalé tem de 15 a 40 UHC, então o subcoletor fica **sempre em DN 100**. Não há coletor de esgoto sanitário abaixo de DN 100.

### 2.3 Declividades

| DN | Declividade mínima | Status |
|---|---|---|
| ≤ 75 | **2 %** | [usual, consagrado] |
| ≥ 100 | **1 %** | [usual, consagrado] |
| Máxima recomendada | **5 %** | [usual] |

### 2.4 Desconectores, caixas e inspeção

- **Caixa sifonada** (desconector do banheiro): recebe lavatório, chuveiro, bidê e ralos. **A bacia nunca entra nela** (a bacia tem sifão próprio e vai direto ao ramal DN 100). Capacidade [usual]: CS DN 100 até 6 UHC, DN 125 até 10, DN 150 até 15. Saída DN 50 (ou 75). Fecho hídrico ≥ 50 mm.
- **Caixa de gordura** (pia de cozinha; a NBR 8160 exige caixa de gordura para efluentes com gordura) [confirmado: UFRGS, Caesb]:

| Tipo | Uso | Formato | Ø interno | Parte submersa do septo | Volume de retenção | Saída |
|---|---|---|---|---|---|---|
| Pequena (CGP) | 1 cozinha | cilíndrica | 0,30 m | 0,20 m | 18 L | DN 75 |
| Simples (CGS) | 1 a 2 cozinhas | cilíndrica | 0,40 m | 0,20 m | 31 L | DN 75 |
| Dupla (CGD) | 2 a 12 cozinhas | cilíndrica | 0,60 m | 0,35 m | 120 L | DN 100 |

  Para chalé: **CGP ou CGS** (comercial: Tigre/Amanco DN 100 de cerca de 19 L). Estudos da UFRGS indicam baixa eficiência dessas caixas, então convém sugerir CGS mesmo com 1 cozinha. Diâmetros de saída: [usual].
- **Caixa de inspeção (CI)** [usual]: interna mínima 0,60 m (circular Ø 0,60 ou quadrada 0,60 × 0,60); profundidade máxima 1,00 m (acima disso, poço de visita); distância máxima **25 m** entre dispositivos de inspeção; distância máxima **15 m** entre a ligação com o coletor público e a CI mais próxima; ramais de bacia, CG e CS com até **10 m** até o dispositivo de inspeção; CI em toda mudança de direção, de declividade ou de diâmetro da rede enterrada e na junção de subcoletores. A concessionária do DF exige tampa de CI ≥ 0,60 m. [confirmado: Caesb]
- Rede enterrada: mudanças de direção com curvas de 45° ou CI. Nunca usar joelho de 90° no plano horizontal da rede enterrada. [usual]

### 2.5 Ventilação

- **Distância máxima do desconector ao tubo ventilador (Tabela 8)** [confirmado: USP, CAPES]:

| DN do ramal de descarga | 40 | 50 | 75 | 100 |
|---|---|---|---|---|
| Distância máxima (m) | 1,00 | 1,20 | 1,80 | 2,40 |

- **Ramal de ventilação (Tabela 9)** [usual]: grupo **sem** bacia: até 12 UHC → DN 40; 13 a 18 → DN 50; 19 a 36 → DN 75. Grupo **com** bacia: até 17 UHC → DN 50; 18 a 60 → DN 75.
- **Prédio de um pavimento:** deve haver pelo menos **um tubo ventilador** ligado à CI ou em junção ao coletor/subcoletor ou ao ramal de descarga de uma bacia, prolongado acima da cobertura. Em residência com no máximo 3 bacias, o tubo ventilador pode ser **DN 75**. [confirmado: apostila CAPES/Krona]
- Dispensa de ventilação do ramal da bacia quando o ramal é exclusivo, liga direto ao tubo de queda e tem até 2,40 m (lista completa de condições não confirmada). [incerto]
- Terminal do ventilador [usual]: ≥ **0,30 m** acima da cobertura (≥ 2,00 m se a laje for usada como terraço); ≥ **4,00 m** na horizontal de janelas e portas, ou ≥ 1,00 m acima da verga delas.
- Ventilação nunca se liga a tubos de águas pluviais. A coluna de ventilação sobe sempre com aclive (sem sifonar).

Um estudo da ANTAC considera as distâncias da Tabela 8 muito conservadoras. Mesmo assim, o motor usa os valores da norma.

**Fontes da seção 2:** [USP, esgoto sanitário (tabelas UHC/ventilação)](https://edisciplinas.usp.br/pluginfile.php/2924543/mod_resource/content/3/Esgoto.pdf) · [CAPES, instalações prediais de esgoto](https://educapes.capes.gov.br/bitstream/capes/921421/2/Instala%C3%A7%C3%B5es%20prediais%20de%20esgoto%20sanit%C3%A1rio.pdf) · [USP PHD0313 aula 9](https://edisciplinas.usp.br/pluginfile.php/2924615/mod_resource/content/8/PHD0313%20-%20Aula%209%20-%20Instala%C3%A7%C3%B5es%20de%20Esgotamento%20Sanit%C3%A1rio.pdf) · [UFRGS, caixas de gordura](https://seer.ufrgs.br/ambienteconstruido/article/download/5362/3287) · [Caesb, orientação de ligação](https://s3.caesb.df.gov.br/www/prod/site1/orientacao-ligacao-novo.pdf) · [Krona, catálogo técnico de esgoto 2024](https://www.krona.com.br/wp-content/uploads/2022/10/Catalogo-Tecnico-Esgoto-Janeiro-2024.pdf) · [ANTAC, distâncias de ventilação](https://eventos.antac.org.br/index.php/sispred/article/download/2963/3687/14807) · [Amanco Wavin, caixa de gordura e inspeção](https://mediahub.wavin.com/m/39134152730601d7/original/FT-Caixa-de-Gordura-e-Inspecao.pdf)

---

## 3. Águas pluviais: NBR 10844:1989 (resumo)

- **Vazão de projeto:** `Q = I·A/60`, com Q em L/min, I em mm/h e A em m². [confirmado]
- **Período de retorno:** 1 ano para áreas pavimentadas onde empoçamento é tolerável, **5 anos para coberturas e terraços**, 25 anos onde não se tolera empoçamento nem extravasamento. Duração de 5 min. [confirmado: ArchDaily]
- **Intensidade:** pela tabela de cidades da norma (Tabela 5) ou por cartas regionais. Para **área de projeção ≤ 100 m²** pode-se adotar **I = 150 mm/h** (5.1.3). [usual; não reconferido]. Exemplos usuais (Tr = 5 anos): São Paulo 172 mm/h; Rio (Jardim Botânico) 167; Curitiba 204; Belo Horizonte 227. [incerto: conferir]
- **Área de contribuição de telhado inclinado:** `A = (a + h/2)·b`, sendo a a projeção horizontal da água, h a altura da cumeeira em relação à calha e b o comprimento da calha. [usual]
- **Calha:** Manning-Strickler `Q = K·(S/n)·Rh^(2/3)·i^(1/2)`, com K = 60.000 (Q em L/min, S em m², Rh em m, i em m/m). n = 0,011 para plástico, fibrocimento, aço e metal não ferroso. Declividade mínima de **0,5 %**. [confirmado]
- **Capacidade de calhas semicirculares (n = 0,011), L/min (Tabela 4)** [usual]:

| Ø interno (mm) | 0,5 % | 1 % | 2 % |
|---|---|---|---|
| 100 | 130 | 183 | 256 |
| 125 | 236 | 333 | 466 |
| 150 | 384 | 541 | 757 |
| 200 | 829 | 1.167 | 1.634 |

- **Condutor vertical:** pelos ábacos da norma (Q, lâmina H na calha, comprimento L). **Diâmetro mínimo de 70 mm** (75 mm comercial em PVC; apostila da USP cita D ≥ 75). Se houver mudança de direção a até 4 m da saída da calha, a vazão é majorada (Tabela 2). Regra empírica de pré-dimensionamento: cerca de 1 cm² de seção de condutor por m² de telhado. [incerto: regra de bolso, usar só como aviso]
- **Condutor horizontal:** declividade mínima de 0,5 % (1 % quando possível), com inspeção a cada 20 m e nas mudanças de direção. [confirmado: 0,5 %/1 %]
- **Para o ChaléCAD:** cada água do telhado (já modelada com caimento) gera área e vazão. O usuário só posiciona as descidas, e o motor sugere calha Ø 100/125 e condutor Ø 75/100, além de alertar se a vazão por descida passar da capacidade.

**Fontes:** [USP, águas pluviais](https://edisciplinas.usp.br/pluginfile.php/4535394/mod_resource/content/6/%C3%81guas%20Pluviais%202019%20SQ.pdf) · [USP PHD0313 aula 11](https://edisciplinas.usp.br/pluginfile.php/2924631/mod_resource/content/7/PHD0313%20-%20Aula%2011%20-%20Instala%C3%A7%C3%B5es%20de%20%C3%81guas%20Pluviais.pdf) · [ArchDaily, pré-dimensionar calha](https://www.archdaily.com/pt/1004622/como-pre-dimensionar-uma-calha) · [UFPB, TCC de águas pluviais](https://repositorio.ufpb.br/jspui/bitstream/123456789/35934/1/Trabalho-de-Conclusao-de-Curso-Luis-Felipe-Boudoux-Guimaraes-de-Sa.pdf) · [Amanco Wavin FT Calha Pluvial](https://mediahub.wavin.com/m/7868518c2d6e8d10/original/FT-Calha-Pluvial.pdf)

---

## 4. Fossa séptica, filtro e sumidouro: NBR 7229:1993 e NBR 13969:1997

Para chalé rural sem rede coletora: **tanque séptico → filtro anaeróbio → sumidouro** (ou vala de infiltração).

### 4.1 Tanque séptico (NBR 7229) [confirmado: transcrição das Tabelas 1 a 4]

```
V = 1000 + N·(C·T + K·Lf)        V em litros
```

**Tabela 1: contribuição C e lodo fresco Lf (por pessoa)**

| Ocupação | C (L/dia) | Lf (L/dia) |
|---|---|---|
| Residência padrão alto | 160 | 1 |
| Residência padrão médio | 130 | 1 |
| Residência padrão baixo | 100 | 1 |
| Hotel (sem cozinha e lavanderia) | 100 | 1 |
| Alojamento provisório | 80 | 1 |

**Tabela 2: período de detenção T (função de N·C)**

| Contribuição diária (L) | ≤ 1.500 | 1.501 a 3.000 | 3.001 a 4.500 | 4.501 a 6.000 | 6.001 a 7.500 | 7.501 a 9.000 | > 9.000 |
|---|---|---|---|---|---|---|---|
| T (dias) | 1,00 | 0,92 | 0,83 | 0,75 | 0,67 | 0,58 | 0,50 |

**Tabela 3: taxa de acumulação de lodo K (dias)**

| Intervalo entre limpezas | t ≤ 10 °C | 10 < t ≤ 20 °C | t > 20 °C |
|---|---|---|---|
| 1 ano | 94 | 65 | 57 |
| 2 anos | 134 | 105 | 97 |
| 3 anos | 174 | 145 | 137 |
| 4 anos | 214 | 185 | 177 |
| 5 anos | 254 | 225 | 217 |

(t = temperatura média do mês mais frio)

**Tabela 4: profundidade útil:** V ≤ 6 m³: 1,20 a 2,20 m; 6 a 10 m³: 1,50 a 2,50 m; > 10 m³: 1,80 a 2,80 m.
**Dimensões mínimas:** Ø interno 1,10 m (cilíndrico); largura 0,80 m e relação comprimento/largura de 2:1 a 4:1 (prismático).
**Distâncias mínimas:** 1,50 m de construções, divisas, sumidouros, valas e ramal predial de água; 3,0 m de árvores e da rede pública de água; **15 m de poços freáticos e corpos d'água**.

### 4.2 Filtro anaeróbio e sumidouro (NBR 13969)

- Filtro anaeróbio: `Vu = 1,6·N·C·T`, com **mínimo de 1.000 L** e altura do leito filtrante de 1,20 m (com fundo falso). [confirmado: UFPR] T do filtro para contribuição ≤ 1.500 L/dia: 1,17 d (t < 15 °C), 1,00 d (15 a 25 °C), 0,92 d (> 25 °C). [usual]
- Sumidouro: área de infiltração `A = N·C / Ci` (m²), com **Ci = 490/(t + 2,5)** em L/m²·dia, sendo t o tempo, em min, para baixar 1 cm no teste de percolação. Adotar o menor Ci medido. [confirmado: CEHOP-SE] A área conta fundo e paredes. Fundo do sumidouro ≥ 1,50 m acima do lençol freático. [usual]
- Sem teste de percolação, o motor deve **exigir Ci informado** (ou usar 40 L/m²·dia como hipótese conservadora, com aviso). [sugestão]

**Fontes:** [Slides com a NBR 7229 (Tabelas 1 a 4, distâncias)](https://pt.slideshare.net/slideshow/nbr-7229/51039959) · [UFPR TH029, tanque séptico e filtro](https://docs.ufpr.br/~rtkishi.dhs/TH029/TH029_09_Tanqueseptico.pdf) · [CEHOP-SE, especificação de filtro e sumidouro](https://orse-portal.cehop.se.gov.br/wp-content/uploads/2025/08/ES00112.pdf) · [NBR 7229 (Prefeitura de Macaé)](https://macae.rj.gov.br/midia/uploads/NBR%207229%20de%201993%20-%20Projeto%20Constru%C3%A7%C3%A3o%20e%20Opera%C3%A7%C3%A3o%20de%20Sistemas%20de%20Tanques%20Septicos.pdf) · [Unicamp, intervalos de limpeza](https://www.prp.unicamp.br/inscricao-congresso/resumos/2023P21870A38713O349.pdf)

---

## 5. Gás (NBR 15526 / NBR 13103): só para o aquecedor

Só é relevante quando `waterHeater === 'gas'`.
- **NBR 15526** trata das redes de distribuição interna de GN e GLP (dimensionamento por perda de pressão, materiais, abrigo de cilindros). **NBR 13103** trata da instalação dos aparelhos a gás (volume do ambiente, ventilação permanente, chaminé). [usual]
- Regras para o MVP, como **avisos qualitativos**: aquecedor de passagem fora de banheiro e dormitório, em área ventilada ou externa, com duto de exaustão para o exterior; cilindros de GLP em abrigo externo ventilado; tubulação de gás em cobre ou multicamada; registro de corte antes do aparelho.
- Consumo estimado: `ṁ_GLP [kg/h] ≈ P[kW]·3,6 / 46` (PCI do GLP ≈ 46 MJ/kg). Ex.: 26 kW consomem ≈ 2,0 kg/h, mais do que a taxa de vaporização contínua de um P13 (≈ 0,6 kg/h) [incerto]. Por isso o aviso seria "use P45 ou bateria de cilindros".
- Cor: tubulação de gás em **amarelo** na planta.

---

## 6. Como as ferramentas profissionais fazem (UX)

| Ferramenta | Entrada em planta | Traçado | Cálculo | Saídas |
|---|---|---|---|---|
| **AltoQi Builder/QiBuilder Hidrossanitário** (BR) | o usuário posiciona as **peças** no ambiente; os pontos de utilização nascem nas **cotas corretas** automaticamente | lança condutos **com as conexões**, a partir dos pontos e do traçado desejado (polilinha); prumadas por pavimento | dimensionamento conforme as normas brasileiras (pesos, FWH/universal, UHC); pressão final do ponto pelo caminho completo; resultados validados contra cálculo manual (ANTAC) | **isométricos** automáticos, relatório de pressões por **ponto crítico**, lista de materiais |
| **Revit MEP** | famílias de aparelho com **conectores** e *fixture units* | *Generate Layout* (autorroteamento de sistemas conectados); inclinação definida antes de gerar as soluções; *System Inspector* verifica a conectividade | dimensionamento por **atrito e/ou velocidade**; FU → vazão pela IPC 2006 (Hunter); **relatório de perda de pressão** (HTML/CSV) pelo *System Browser*, **indisponível para sistemas por gravidade** (esgoto) | plantas, cortes, tabelas |
| **Archicad MEP Designer** (AC29+) | objetos da biblioteca com portas de conexão | rota desenhada com **inclinação digitada no Tracker** (em %), herdada pelos segmentos novos; o *Connection Solver* resolve junções inclinadas | (cálculo limitado; foco em modelagem) | 3D/IFC |
| **h2x** (nuvem, AU/UK) | desenho em planta sobre PDF | rápido, em 2D | dimensionamento e pressão automáticos | relatórios |

**Lições para o ChaléCAD:**
1. **A peça gera o ponto** (como no AltoQi). O ChaléCAD já faz isso a partir dos móveis (`points.ts`). Falta só o usuário poder arrastar o ponto e ajustar a altura.
2. **O traçado é uma polilinha por sistema**, com *snap* nas paredes e nos pontos. Os vértices viram conexões, sem o usuário escolher "joelho" ou "tê".
3. **Autorroteamento como sugestão editável** (Revit *Generate Layout*): um botão "Sugerir traçado" cria a árvore Manhattan pelas paredes (o que `pipes.ts` já estima) e o usuário corrige.
4. **Esgoto com declividade automática** (Archicad): o usuário desenha em planta e o motor calcula as cotas de fundo a partir do ponto mais alto, com `i` padrão pelo DN. Aparece um aviso se a cota final ficar abaixo da CI ou da fossa.
5. **Pressão como "selo" no ponto** e relatório do caminho crítico (AltoQi). Diferente do Revit, o esgoto também recebe verificação, com UHC, DN, declividade e ventilação.
6. **Isométrico por ambiente** gerado automaticamente (AltoQi), que é o desenho que o encanador usa.

### 6.1 Proposta de UX simples para chalé

- **Aba "Hidráulica"** com seletor de nível (térreo/mezanino) e chips de sistema: `Água fria`, `Água quente`, `Esgoto`, `Ventilação`, `Pluvial`, `Gás`. Os demais sistemas ficam esmaecidos.
- **Pontos**: aparecem sozinhos com os móveis; um clique abre um painel com aparelho, altura do ponto, vazão e peso (editáveis, com "padrão NBR"). Ícone de alerta quando falta pressão.
- **Caixa d'água**: arrastar sobre a torre; o campo "altura do fundo" mostra ao vivo a pressão no **chuveiro mais desfavorável** ("Chuveiro do mezanino: 0,62 m.c.a. de 1,00 necessários → eleve +0,40 m ou use tubo de 32").
- **Desenho**: ferramenta "Tubo" (atalho T) com *snap* em parede, ponto e tubo existente; **Shift** para ortogonal; clicar num tubo cria um tê. **Prumada** (subida/descida entre níveis) com a tecla P ou por um símbolo automático quando o tubo liga pontos de níveis diferentes.
- **Botão "Gerar traçado automático"** por sistema (substitui o desenho que existir, com desfazer).
- **Rótulos automáticos**: DN em cada trecho ("Ø25"), seta de fluxo e "i = 1 %" no esgoto, nomes das colunas (AF-1, TQ-1, TV-1).
- **Painel de resultados**: tabela por ponto (P disponível, P mínima, status), por trecho (ΣP, Q, DN, v, J, hf) e por ramal de esgoto (UHC, DN, i, ventilação OK).
- **Isométrico** por banheiro, cozinha e lavanderia (SVG gerado a partir das cotas) e **lista de materiais** (tubos por DN, conexões contadas pelo traçado, registros, caixas).
- **Modo leigo vs. engenheiro**: o modo leigo mostra semáforo e frases; o modo engenheiro mostra a memória de cálculo completa (com o `DISCLAIMER`).

**Fontes da seção 6:** [AltoQi, e-book "10 motivos"](https://lps.altoqi.com.br/hubfs/%5BMKT%5D%20Materiais%20Ricos/Ebooks/%5BEbook%5D%2010%20motivos%20para%20utilizar%20um%20software%20para%20projetos%20hidrossanitario.pdf) · [ANTAC, AltoQi vs. cálculo manual](https://eventos.antac.org.br/index.php/sbtic/article/download/7418/5932/34307) · [IFSC, TCC com relatórios do AltoQi](https://repositorio.ifsc.edu.br/bitstreams/787a2b96-de79-4cf9-b1ae-6ff85836bc96/download) · [Revit, pressure loss report](https://help.autodesk.com/cloudhelp/2020/ENU/Revit-Model/files/GUID-3A1DE269-1524-48AB-88B5-82F1E0A968A3.htm) · [Revit, pipe sizing](https://help.autodesk.com/cloudhelp/2014/ENU/Revit/files/GUID-3E022D29-E44A-49B6-ADAA-053C4D7E0E76.htm) · [Revit, FU → vazão](https://help.autodesk.com/cloudhelp/2020/ENU/Revit-Model/files/GUID-E1121308-E1E5-4AF1-B2FA-913CBD35F656.htm) · [Archicad 30, edição de rotas MEP](https://help.graphisoft.com/AC/30/INT/Topics/085_MEPDesigner/085_MEPDesigner-8.html) · [Archicad 29, inclinações](https://help.graphisoft.com/AC/29/INT/_AC29_Help/005_NewFeatures/005_NewFeatures-46.htm) · [h2x Engineering](https://www.h2xengineering.com/?p=47)

---

## 7. Símbolos e cores em planta

Não há norma brasileira que fixe cores de **desenho**. A **NBR 6493** trata das cores de **pintura** de tubulações aparentes (água = verde; gases não liquefeitos = amarelo etc.). Cada escritório ou software define sua legenda. Um memorial da SES-SP usa "verde emblema" para água fria e "verde claro" para pluvial. [confirmado] Proposta coerente com AltoQi e com a prática:

| Sistema | Cor (hex sugerido) | Traço | Rótulos |
|---|---|---|---|
| Água fria (AF) | azul `#1E88E5` (verde `#2E7D32` como alternativa de tema) | contínuo | AF-1, Ø25 |
| Água quente (AQ) | vermelho `#E53935` | contínuo | AQ-1, Ø22 |
| Esgoto primário (após o desconector, com gases) | marrom `#6D4C41` | contínuo, mais grosso | TQ-1, Ø100, i = 1 % |
| Esgoto secundário (antes do desconector: lavatório/chuveiro → CS) | marrom-claro `#A1887F` | tracejado | Ø40 |
| Ventilação | verde `#43A047` | traço-ponto | TV-1, CV-1, Ø50 |
| Águas pluviais | ciano `#00ACC1` | tracejado longo | AP-1, Ø75 |
| Gás | amarelo `#F9A825` | contínuo fino | G |

Símbolos (planta):
- Ponto de água: círculo cheio pequeno com a altura ("h = 2,10").
- Prumada: círculo com seta (↑ sobe / ↓ desce) e rótulo (AF-1, TQ-1, TV-1).
- Registro de gaveta: dois triângulos opostos (gravata-borboleta). Registro de pressão: gravata com haste em T. Registro de esfera: gravata com círculo.
- Caixa sifonada: quadrado com círculo e "CS". Ralo seco: círculo "RS". Caixa de gordura: "CG". Caixa de inspeção: quadrado 60 × 60 "CI". Tanque séptico "TS", filtro "FA", sumidouro "SU".
- Caixa d'água: retângulo com "RS 1.500 L" e cota do fundo.
- Seta de fluxo no esgoto e no pluvial.

**Fontes:** [Memorial da SES-SP com cores](https://www.saude.sp.gov.br/resources/ses/perfil/cidadao/licitacoes-cga/memorial_descritivo_hidraulica.pdf) · [PBH, caderno de projetos (legendas)](https://prefeitura.pbh.gov.br/sites/default/files/estrutura-de-governo/obras-e-infraestrutura/pp-sd-cap27-251113.pdf) · [UFU, uso de BIM (cores por sistema)](https://repositorio.ufu.br/bitstream/123456789/33570/3/UsoSistemasBIM.pdf)

---

## 8. Alturas usuais dos pontos (catálogos/prática) [usual]

| Aparelho | Água (m do piso) | Esgoto (m do piso) |
|---|---|---|
| Chuveiro / ducha | 2,10 a 2,20 (registro a 1,10 a 1,30) | ralo/CS no piso |
| Lavatório | 0,60 | 0,50 a 0,55 |
| Bacia com caixa acoplada | 0,20 a 0,30 (lateral) | saída no piso, Ø100 |
| Pia de cozinha | 0,60 (sob a bancada) ou 1,10 (torneira de parede) | 0,50 a 0,60 |
| Tanque | 0,90 a 1,10 | 0,50 a 0,60 |
| Máquina de lavar | 0,90 a 1,10 | 0,75 a 0,90 (com sifão) |
| Filtro | 1,80 | — |
| Aquecedor de passagem | conforme o fabricante (≈1,20 a 1,50) | — |

O motor atual usa 2,10 m no chuveiro e 1,0 m nos demais pontos. Essas alturas devem ir para o catálogo (`fixtureDefaults[kind].waterHeight`).

---

## 9. Exemplos numéricos resolvidos (para testes unitários)

Convenções comuns: FWH para tubo liso `J = 0,000869·Q^1,75/D^4,75` (SI, D interno); PVC soldável DI 17,0 / 21,6 / 27,8 mm; Leq da tabela 1.6; registro de pressão = registro de globo; carga cinética desprezada; referência no **fundo da caixa**; `Q = max(0,3√ΣP, q_max)`. Os valores foram calculados com script e arredondados para 4 casas. Tolerância sugerida nos testes: ±0,005 m em hf e ±0,01 m.c.a. em P.

### Chalé-modelo

- Térreo em z = 0; mezanino em z = 2,80 m.
- **Caixa na torre: fundo em z = 6,40 m.** Barrilete a cerca de 6,30 m.
- Mezanino: banheiro com bacia com caixa acoplada (0,3), lavatório (0,3) e **chuveiro elétrico** (0,1). ΣP = 0,7.
- Térreo: pia de cozinha (0,7), tanque (0,7), máquina de lavar (1,0) e banheiro com bacia (0,3), lavatório (0,3) e chuveiro elétrico (0,1). ΣP = 3,1.
- Total ΣP = 3,8.

Árvore de AF:

```
Caixa ─B1─ N1 ─C1─ N2(reg. banho sup.) ─R1─ N3 ─S1─ Chuveiro mezanino (z = 4,90)
               └─C2─ N4 ─R2─ N5 ─S2─ Pia da cozinha (z = 1,00)
                         └─(ramal banho térreo, ΣP 0,7: não entra no caminho)
```

| Trecho | ΣP | Q (L/s) | DN (DI) | L real (m) | Conexões (Leq, m) | ΣLeq | v (m/s) | J (m/m) | hf (m) |
|---|---|---|---|---|---|---|---|---|---|
| B1 caixa → N1 | 3,8 | 0,5848 | 32 (27,8) | 1,5 | entrada normal 0,5 + reg. gaveta 0,3 + joelho 90° 1,5 | 2,3 | 0,963 | 0,04700 | **0,1786** |
| C1 N1 → N2 | 0,7 | 0,2510 | 25 (21,6) | 3,0 (1,0 vert. + 2,0 hor.) | tê lateral 2,4 + 2 joelhos 2,4 + reg. gaveta 0,2 | 5,0 | 0,685 | 0,03546 | **0,2837** |
| R1 N2 → N3 | 0,7 | 0,2510 | 25 (21,6) | 1,2 | joelho 90° 1,2 | 1,2 | 0,685 | 0,03546 | **0,0851** |
| S1 N3 → chuveiro | 0,1 | 0,1000 (q_max) | 20 (17,0) | 0,6 | tê lateral 2,3 + reg. pressão 11,1 + joelho 1,1 | 14,5 | 0,441 | 0,02210 | **0,3337** |
| C2 N1 → N4 | 3,1 | 0,5282 | 32 (27,8) | 4,8 (1,0 hor. + 3,8 vert.) | tê direta 0,9 + joelho 1,5 + reg. gaveta 0,3 | 2,7 | 0,870 | 0,03933 | **0,2950** |
| R2 N4 → N5 | 2,4 | 0,4648 | 25 (21,6) | 4,0 | tê lateral 2,4 + joelho 1,2 | 3,6 | 1,268 | 0,10423 | **0,7922** |
| S2 N5 → pia | 0,7 | 0,2510 | 20 (17,0) | 2,0 | tê lateral 2,3 + 2 joelhos 2,2 + reg. gaveta 0,1 | 4,6 | 1,106 | 0,11061 | **0,7301** |

### Exemplo 1: chuveiro do mezanino sob a torre (1,50 m abaixo do fundo da caixa)

- Coluna estática: 6,40 − 4,90 = **1,50 m**.
- Σhf = 0,1786 + 0,2837 + 0,0851 + 0,3337 = **0,8811 m**.
- **P dinâmica = 1,50 − 0,8811 = 0,6189 m.c.a. ≈ 6,07 kPa < 10 kPa → FALHA** (`install.pressure`, warn).
- Correções calculadas:
  - (a) **Elevar a caixa** em `1,00 − 0,6189 = 0,381 m` → fundo ≥ 6,79 m (coluna de 1,88 m). Arredondando para +0,40 m, P = 1,019 m.c.a. OK (as perdas não mudam).
  - (b) **Aumentar o DN** de C1 e R1 para 32 e de S1 para 25 (conexões trocadas pelos Leq de DN 32/25): hf(C1) = 0,1005; hf(R1) = 0,0289; hf(S1) = 0,1105 → **P = 1,50 − (0,1786 + 0,1005 + 0,0289 + 0,1105) = 1,0815 m.c.a. OK**.
  - Só S1 em DN 25 (sem mexer em C1/R1): P = 0,842 m.c.a., ainda falha.
- Variante **ducha** (misturador, 0,20 L/s, peso 0,4; ΣP total 4,1, banheiro de cima 1,0): hf = 0,1909 + 0,3876 + 0,1163 + 1,1224 = 1,8172 → **P = −0,32 m.c.a.**, falha grave (pressurizador ou caixa muito mais alta).
- Comparação Hazen-Williams (C = 150) no mesmo caminho: J de 0,03873 / 0,02763 / 0,02763 / 0,01613 m/m → Σhf ≈ 0,147 + 0,221 + 0,066 + 0,244 = 0,678 → P ≈ 0,82 m.c.a. O FWH é mais conservador.

### Exemplo 2: pia da cozinha no térreo (mesmo chalé)

- Coluna estática: 6,40 − 1,00 = **5,40 m**.
- Σhf = B1 0,1786 + C2 0,2950 + R2 0,7922 + S2 0,7301 = **1,9958 m**.
- **P = 5,40 − 1,9958 = 3,4042 m.c.a. ≈ 33,4 kPa ≥ 10 kPa → OK.** Todas as velocidades ≤ 1,27 m/s (< 3 m/s).
- Lição: no térreo sob uma torre a pressão sobra; quem controla o projeto é o chuveiro de cima.

### Exemplo 3: chalé térreo com caixa no forro (sem torre)

- Fundo da caixa em z = 3,20 m e chuveiro em z = 2,10 m → coluna estática de **1,10 m** (o código atual aceitaria: ≥ 1,0).
- A barrilete DN 25, ΣP 3,1, Q 0,5282, L 2,0 + Leq (entrada 0,4 + gaveta 0,2 + joelho 1,2) = 3,8 → v 1,441, J 0,13040, hf 0,4955.
- B ramal do banho DN 25, ΣP 0,7, L 3,0 + Leq 3,8 (tê lateral 2,4, joelho 1,2, gaveta 0,2) → hf 0,2412.
- C sub-ramal do chuveiro DN 20, 0,10 L/s, L 0,8 + Leq 14,5 → hf 0,3381.
- **P = 1,10 − 1,0748 = 0,0252 m.c.a. → FALHA** (info no térreo, como hoje). O caso típico pede pressurizador. Este teste mostra que a verificação só estática dá falso "OK".

### Exemplo 4: esgoto do chalé-modelo (UHC → DN)

| Trecho | Contribuintes | ΣUHC | DN (regra) | i mín. |
|---|---|---|---|---|
| Lavatório → CS (sup.) | lavatório | 1 | 40 (Tab. 3) | 2 % |
| Chuveiro → CS (sup.) | chuveiro (ralo na CS) | 2 | 40 | 2 % |
| CS → ramal da bacia | lav + chuveiro | 3 | **50** (saída da CS; ramal de esgoto ≤ 6 UHC) | 2 % |
| Bacia → TQ-1 | bacia + CS | 9 | **100** (bacia) | 1 % |
| TQ-1 (mezanino → térreo) | banho superior | 9 | **100** (recebe bacia; Tab. 6: 240) | vertical |
| Pia → CG | pia | 3 | 50 | 2 % |
| CG → CI | pia | 3 | 75 (saída CGP/CGS) | 2 % |
| Tanque + máquina → CS/CI | 3 + 3 | 6 | 50 (≤ 6) → recomendado 75 por espuma | 2 % |
| Banho térreo → CI | 6 + 1 + 2 | 9 | 100 | 1 % |
| **Subcoletor final** | todos | **9 + 9 + 3 + 6 = 27** | **100** (Tab. 7, 1 %: 216) | 1 % |

- Ventilação: o ramal da bacia (DN 100) precisa ter um ventilador a ≤ 2,40 m do sifão; a saída da CS (DN 50) a ≤ 1,20 m. O ramal de ventilação de um grupo com bacia e 9 UHC (≤ 17) é **DN 50**. O tubo ventilador primário (prolongamento do TQ-1) pode ser DN 75 (residência com ≤ 3 bacias), saindo ≥ 0,30 m acima do telhado.
- Cotas: ramal da bacia de 2,0 m a 1 % → queda de 0,02 m. Subcoletor de 12 m até a CI a 1 % → queda de 0,12 m. Se a geratriz inferior na saída da casa estiver a −0,30 m, chega à CI a −0,42 m (profundidade de CI ≤ 1,00 m: OK).

### Exemplo 5: fossa para chalé de 3 dormitórios (sem rede)

- N = 6 (2 por dormitório); padrão médio C = 130 L, Lf = 1; N·C = 780 L/dia ≤ 1.500 → T = 1,00; limpeza a cada 2 anos e mês mais frio entre 10 e 20 °C → K = 105.
- **V = 1000 + 6·(130·1,00 + 105·1) = 1000 + 6·235 = 2.410 L.** Profundidade útil entre 1,20 e 2,20 m. Cilíndrico com Ø ≥ 1,10 m: Ø 1,50 m → área 1,767 m² → h = 1,36 m. OK.
- Filtro anaeróbio: Vu = 1,6·6·130·1,00 = **1.248 L** (≥ 1.000).
- Sumidouro com teste de percolação t = 5 min/cm: Ci = 490/7,5 = **65,3 L/m²·dia** → A = 780/65,3 = **11,94 m²**. Com Ø 1,50 m: fundo 1,767 m² + parede π·1,5·h → h = (11,94 − 1,767)/4,712 = **2,16 m** de altura útil de infiltração.

### Exemplo 6: calha de um telhado de uma água

- a = 4,0 m (projeção), h = 1,2 m, b = 6,0 m → A = (4,0 + 0,6)·6,0 = **27,6 m²**; I = 150 mm/h → **Q = 150·27,6/60 = 69 L/min**.
- Calha semicircular Ø 100 a 0,5 %: capacidade de 130 L/min ≥ 69 → OK. Condutor Ø 75 (≥ 70): OK.

---

## 10. Spec proposta para o ChaléCAD

> Os tipos abaixo são proposta. Schemas (`packages/engine/src/schema`, `packages/catalog/src/schema.ts`) só mudam pela sessão orquestradora.

### 10.1 Modelo de dados (projeto, fonte de verdade)

```ts
// --- packages/engine/src/schema/plumbing.ts (proposta) ---
type PlumbingSystem = 'cold' | 'hot' | 'sewer' | 'vent' | 'rain' | 'gas';
type PipeMaterial = 'pvc_soldavel' | 'ppr_pn20' | 'cpvc' | 'pex' | 'cobre' | 'pvc_esgoto' | 'pvc_esgoto_reforcado';

type FixtureKind =
  | 'toilet_tank' | 'toilet_valve' | 'lavatory' | 'shower_mixer' | 'shower_electric'
  | 'kitchen_sink' | 'laundry_tub' | 'washing_machine' | 'dishwasher' | 'bathtub'
  | 'garden_tap' | 'bidet' | 'water_heater_gas' | 'water_heater_solar' | 'filter';

interface PlumbingFixture {
  id: string;
  kind: FixtureKind;
  level: string;                 // id do nível
  position: [number, number];    // m, planta (x, y)
  furnitureId?: string | null;   // vínculo com o móvel que o gerou
  waterHeight?: number;          // m do piso; padrão no catálogo
  sewerHeight?: number;          // m do piso
  /** Sobrescritas do usuário (padrão no catálogo por kind). */
  flowLps?: number;              // q de projeto
  weight?: number;               // peso relativo (AF)
  hotWeight?: number;            // peso relativo (AQ)
  uhc?: number;
  minPressureKpa?: number;       // ex.: aquecedor 20, ducha 20
  hasHot?: boolean;
}

interface WaterTank {
  id: string;
  level: string;
  position: [number, number];
  bottomZ: number;               // cota absoluta do fundo (m): referência de pressão
  liters: number;                // calculado por padrão, editável
  towerId?: string | null;
}

/** Nó do grafo: ponto livre, junção, prumada ou conexão com um aparelho/caixa. */
interface PipeNode {
  id: string;
  level: string;
  position: [number, number];
  z: number;                     // cota absoluta (m); no esgoto é a geratriz inferior
  ref?: { kind: 'fixture' | 'tank' | 'device'; id: string; port?: 'cold' | 'hot' | 'sewer' };
}

interface PipeSegment {
  id: string;
  system: PlumbingSystem;
  from: string;                  // PipeNode.id (montante, no sentido do escoamento)
  to: string;
  /** Vértices intermediários em planta; cada vértice = joelho/curva. */
  path: [number, number][];
  dn?: number | null;            // null = o motor dimensiona
  material?: PipeMaterial;
  slope?: number | null;         // m/m; esgoto/pluvial; null = mínimo por DN
  locked?: boolean;              // usuário fixou o DN
}

/** Dispositivos em linha ou terminais. */
interface PlumbingDevice {
  id: string;
  kind: 'gate_valve' | 'pressure_valve' | 'ball_valve' | 'check_valve'
      | 'siphon_box' | 'dry_drain' | 'grease_trap' | 'inspection_box'
      | 'septic_tank' | 'anaerobic_filter' | 'soakaway' | 'pressurizer'
      | 'gutter_outlet' | 'vent_terminal' | 'sewer_connection' | 'water_meter';
  nodeId: string;
  params?: Record<string, number>; // ex.: grease_trap {liters: 31}; pressurizer {headM: 15}
}

interface PlumbingProject {
  enabled: boolean;
  fixtures: PlumbingFixture[];
  tank: WaterTank | null;
  nodes: PipeNode[];
  segments: PipeSegment[];
  devices: PlumbingDevice[];
  settings: {
    headLoss: 'fwh' | 'hazen' | 'darcy';
    velocityTarget: number;      // m/s (padrão 2,0)
    sewerDisposal: 'public' | 'septic';
    septic?: { cleaningYears: 1|2|3|4|5; coldMonthTemp: number; percolationMinPerCm?: number; standard: 'alto'|'medio'|'baixo' };
    rainIntensity?: number;      // mm/h (padrão 150)
    autoRoute: boolean;          // traçado gerado (true) vs. desenhado
  };
}
```

**Regra:** geometria derivada (comprimentos 3D, conexões, cotas de esgoto) **não é salva**. O projeto guarda os nós, os segmentos e as escolhas do usuário. Se `autoRoute = true`, nem os segmentos são salvos: o motor os gera por função pura a partir dos aparelhos e da caixa (mantendo o comportamento atual de `pipes.ts`).

### 10.2 Resultado (derivado)

```ts
interface WaterSegmentResult {
  id: string; system: 'cold'|'hot';
  sumWeights: number; flowLps: number; dn: number; di: number;
  velocity: number; lengthReal: number; fittings: { kind: string; count: number; leq: number }[];
  leqTotal: number; jMperM: number; headLoss: number;
}
interface WaterPointResult {
  fixtureId: string; z: number; staticHead: number; headLossPath: number;
  dynamicHead: number; dynamicKpa: number; minKpa: number; ok: boolean;
  criticalPath: string[];      // ids dos segmentos da caixa até o ponto
  requiredTankRise: number;    // m adicionais para atender (0 se ok)
}
interface SewerSegmentResult {
  id: string; uhc: number; dn: number; slope: number; zFrom: number; zTo: number;
  kind: 'ramal_descarga'|'ramal_esgoto'|'tubo_queda'|'subcoletor'|'coletor';
  ventOk: boolean; ventDistance?: number;
}
interface PlumbingReport {
  water: { segments: WaterSegmentResult[]; points: WaterPointResult[] };
  sewer: { segments: SewerSegmentResult[]; totalUhc: number };
  rain?: { downpipes: { id: string; areaM2: number; flowLpm: number; dn: number; gutterOk: boolean }[] };
  septic?: { tankLiters: number; filterLiters: number; soakawayAreaM2: number; depthM: number };
  tank: { liters: number; dailyLiters: number; occupants: number; fullKg: number };
  materials: { itemId: string; qty: number; unit: 'm'|'un' }[];
  warnings: EngineWarning[];
}
```

### 10.3 Pipeline de água fria e quente (função pura `computeWater`)

1. **Montar o grafo** do sistema (`cold` ou `hot`) a partir de nós e segmentos. Validar: é uma **árvore** com raiz na caixa (AF) ou no aquecedor (AQ). Sem ciclos e sem aparelho solto (`plumbing.disconnected`).
2. **Geometria 3D:** comprimento de cada segmento = Σ trechos em planta + |Δz| das prumadas. Conexões inferidas: vértice com ângulo de 80° a 100° vira joelho 90°; de 35° a 55° vira joelho 45°; nó com 3 ligações vira tê (direta se o trecho de saída é colinear com o de entrada, lateral caso contrário); um nó com mudança de nível vira 2 joelhos; nó de caixa vira "entrada normal"; dispositivos viram registros. O Leq de cada conexão vem do catálogo pelo DN.
3. **Acumular pesos** em pós-ordem: `ΣP(seg) = Σ pesos dos aparelhos a jusante`; `q_max(seg)`.
4. `Q = max(0,3·√ΣP, q_max)`.
5. **DN:** se `locked`, usa o DN do usuário; senão, o menor DN com `v ≤ velocityTarget` e `DN ≥ DN mínimo do aparelho` (sub-ramal), sem ficar menor que o DN de jusante (DN não aumenta no sentido do escoamento).
6. **Perda:** `hf = J(Q, DI, material)·(L + ΣLeq)`.
7. **Pressão** em pré-ordem: `H(caixa) = 0` em `z = bottomZ`; `H(nó) = H(pai) + (z_pai − z_nó) − hf`. Pressão no ponto = H no nó do aparelho (z = cota do ponto).
8. **Otimização** (opcional, se `autoSize`): enquanto existir ponto com falha, aumentar um DN no segmento não travado de maior `hf` do caminho crítico; repetir (limite de 20 iterações).
9. **Verificação dos 10 % (2020):** para cada chuveiro, recalcular H com só o chuveiro aberto (`Q = q_chuveiro` no caminho) e comparar com o H de projeto (simultâneo). Se a diferença for > 10 % do H isolado, emitir aviso.
10. **AQ:** mesmo algoritmo com os pesos de AQ, o DI do material e o J de água quente. A raiz é o aquecedor, e a pressão de entrada do aquecedor = H no nó de AF que o alimenta, menos a perda interna do aquecedor (catálogo: padrão 2 m.c.a. [incerto]).

### 10.4 Pipeline de esgoto (`computeSewer`)

1. Grafo dirigido dos aparelhos até a saída (`sewer_connection` ou `septic_tank`). Precisa ser uma árvore convergente.
2. **UHC** acumulado de jusante para montante (soma simples, sem simultaneidade).
3. **Classificar trechos:** ligado direto ao aparelho = ramal de descarga; após CS/CG = ramal de esgoto; vertical entre níveis = tubo de queda; horizontal enterrado no térreo = subcoletor ou coletor.
4. **DN:** máximo entre o DN mínimo do aparelho (Tab. 3), o DN pela tabela da classe (Tab. 5/6/7) e o DN de montante (não reduz no sentido do escoamento). Trecho com bacia a montante ≥ 100.
5. **Declividade:** se `slope = null`, 2 % para DN ≤ 75 e 1 % para DN ≥ 100. Validar 0,5 % ≤ i ≤ 5 % e i ≥ mínimo do DN.
6. **Cotas:** a partir da cota de saída de cada aparelho (piso − altura do sifão), `z_to = z_from − i·L`. Na confluência vale a menor cota. Profundidade da CI ≤ 1,00 m. A cota de chegada deve ficar acima da cota de entrada da fossa ou da rede (`sewer.too_deep`).
7. **Ventilação:** para cada desconector (sifão de bacia, CS, CG), achar a distância pela tubulação até o tubo ventilador mais próximo e comparar com a Tab. 8. Verificar o DN do ramal de ventilação (Tab. 9). Exigir ao menos 1 ventilador que saia acima do telhado (`vent_terminal` com z ≥ telhado + 0,30).
8. **Dispositivos:** CS DN 100 com ≤ 6 UHC; pia de cozinha exige CG antes da CI; CI a cada ≤ 25 m e ≤ 15 m da ligação; ramal de bacia/CS/CG com ≤ 10 m até a CI.
9. **Fossa** (se `septic`): seção 4, com N vindo de `installations.occupants`.

### 10.5 Avisos (códigos, limiares, base)

| Código | Condição | Severidade | Base |
|---|---|---|---|
| `water.pressure_low` | P_dyn < minKpa do aparelho (10 kPa padrão; 5 caixa acoplada; 15 válvula; aquecedor conforme catálogo) | warn (mezanino) / info (térreo) | NBR 5626:1998 5.3.5.2 |
| `water.pressure_network` | qualquer nó com H < 0,5 m.c.a. (5 kPa) ou acima do fundo da caixa | error | NBR 5626 |
| `water.static_high` | estática > 400 kPa | error | NBR 5626 |
| `water.velocity_high` | v > 3,0 m/s (error); v > velocityTarget (info) | error/info | NBR 5626 |
| `water.shower_drop` | queda > 10 % no chuveiro em uso simultâneo | warn | NBR 5626:2020 |
| `water.tank_rise` | mensagem com o ΔH necessário para o ponto crítico | info | derivado |
| `water.pressurizer` | aquecedor a gás com P < mínimo; ou ducha com P < 20 kPa | warn | manuais |
| `water.dn_min` | DN do sub-ramal < mínimo do aparelho | warn | NBR 5626:1998 |
| `water.tank_small` | volume < 1 dia de consumo, ou < 500 L | warn | NBR 5626 |
| `water.disconnected` | aparelho sem ligação ao reservatório | error | — |
| `sewer.toilet_dn` | ramal da bacia < 100 | error | NBR 8160 Tab. 3 |
| `sewer.uhc_exceeded` | UHC > capacidade do DN (Tab. 5/6/7) | error | NBR 8160 |
| `sewer.slope` | i < 2 % (DN ≤ 75), i < 1 % (DN ≥ 100) ou i > 5 % | error/warn | NBR 8160 |
| `sewer.dn_reduction` | DN diminui no sentido do escoamento | error | NBR 8160 |
| `sewer.vent_distance` | desconector além de 1,00/1,20/1,80/2,40 m do ventilador | warn | NBR 8160 Tab. 8 |
| `sewer.no_vent` | nenhum tubo ventilador acima da cobertura | error | NBR 8160 |
| `sewer.vent_terminal` | terminal < 0,30 m acima do telhado ou < 4 m de janela (sem estar 1 m acima da verga) | warn | NBR 8160 |
| `sewer.toilet_in_siphon_box` | bacia ligada a caixa sifonada | error | NBR 8160 |
| `sewer.grease_trap` | pia de cozinha sem CG | warn | NBR 8160 |
| `sewer.inspection_spacing` | > 25 m entre CIs; > 15 m até a ligação; > 10 m de bacia/CS/CG à CI | warn | NBR 8160 |
| `sewer.inspection_depth` | CI com profundidade > 1,00 m | warn | NBR 8160 |
| `septic.distance` | tanque a < 1,5 m de construção/divisa ou < 15 m de poço | warn | NBR 7229 5.1 |
| `septic.no_percolation` | sumidouro sem Ci informado | info | NBR 13969 |
| `rain.gutter_capacity` | Q > capacidade da calha (Tab. 4 / Manning) | warn | NBR 10844 |
| `rain.downpipe_min` | condutor vertical < 70 mm | warn | NBR 10844 |
| `rain.slope` | calha < 0,5 % | warn | NBR 10844 |

Toda mensagem leva `refs` (ids de segmentos, pontos e dispositivos) para destacar na planta. O relatório inclui o `DISCLAIMER`.

### 10.6 Constantes de catálogo (`packages/catalog`)

Sugestão: novo bloco `constants.plumbing`, versionado com `source` em cada tabela.

```jsonc
{
  "plumbing": {
    "version": "2026-11",
    "units": { "kPaPerMca": 9.80665 },
    "water": {
      "simultaneityC": 0.30,                    // Q = C·√ΣP (L/s)
      "minDynamicKpa": { "default": 10, "toilet_tank": 5, "toilet_valve": 15, "network": 5 },
      "maxStaticKpa": 400,
      "maxSurgeKpa": 200,
      "maxVelocity": 3.0,
      "velocityTarget": 2.0,
      "showerSimultaneousDropMax": 0.10,
      "pressureReference": "tank_bottom",
      "fixtures": {
        "toilet_tank":      { "q": 0.15, "w": 0.3, "wHot": 0,   "dnMin": 20, "uhc": 6, "sewerDn": 100, "waterH": 0.25, "sewerH": 0.0 },
        "toilet_valve":     { "q": 1.70, "w": 32,  "wHot": 0,   "dnMin": 40, "uhc": 6, "sewerDn": 100, "waterH": 1.10, "sewerH": 0.0 },
        "lavatory":         { "q": 0.15, "w": 0.3, "qHot": 0.20, "wHot": 0.5, "dnMin": 20, "uhc": 1, "sewerDn": 40, "waterH": 0.60, "sewerH": 0.50 },
        "shower_mixer":     { "q": 0.20, "w": 0.4, "qHot": 0.20, "wHot": 0.5, "dnMin": 20, "uhc": 2, "sewerDn": 40, "waterH": 2.20, "sewerH": 0.0, "minKpa": 10 },
        "shower_electric":  { "q": 0.10, "w": 0.1, "wHot": 0,   "dnMin": 20, "uhc": 2, "sewerDn": 40, "waterH": 2.10, "sewerH": 0.0, "minKpa": 10 },
        "kitchen_sink":     { "q": 0.25, "w": 0.7, "qHot": 0.25, "wHot": 0.7, "dnMin": 20, "uhc": 3, "sewerDn": 50, "waterH": 0.60, "sewerH": 0.55, "needsGreaseTrap": true },
        "laundry_tub":      { "q": 0.25, "w": 0.7, "wHot": 0,   "dnMin": 25, "uhc": 3, "sewerDn": 40, "waterH": 1.00, "sewerH": 0.55 },
        "washing_machine":  { "q": 0.30, "w": 1.0, "wHot": 0,   "dnMin": 25, "uhc": 3, "sewerDn": 50, "waterH": 1.00, "sewerH": 0.80 },
        "dishwasher":       { "q": 0.30, "w": 1.0, "wHot": 0,   "dnMin": 20, "uhc": 2, "sewerDn": 50, "waterH": 0.60, "sewerH": 0.55 },
        "bathtub":          { "q": 0.30, "w": 1.0, "qHot": 0.30, "wHot": 1.0, "dnMin": 20, "uhc": 2, "sewerDn": 40, "waterH": 0.70, "sewerH": 0.0 },
        "bidet":            { "q": 0.10, "w": 0.1, "qHot": 0.10, "wHot": 0.1, "dnMin": 20, "uhc": 1, "sewerDn": 40, "waterH": 0.30, "sewerH": 0.0 },
        "garden_tap":       { "q": 0.20, "w": 0.4, "wHot": 0,   "dnMin": 20, "uhc": 0, "waterH": 0.60 },
        "water_heater_gas": { "minKpa": 20, "internalLossMca": 2.0 }   // [incerto] conferir fabricante
      },
      "pipes": {
        "pvc_soldavel": { "hazenC": 150, "fwh": "smooth", "sizes": [
          { "dn": 20, "di": 0.0170 }, { "dn": 25, "di": 0.0216 }, { "dn": 32, "di": 0.0278 },
          { "dn": 40, "di": 0.0352 }, { "dn": 50, "di": 0.0440 }, { "dn": 60, "di": 0.0534 } ] },
        "ppr_pn20": { "hazenC": 150, "fwh": "smooth", "maxTempC": 70, "sizes": [
          { "dn": 20, "di": 0.0132 }, { "dn": 25, "di": 0.0166 }, { "dn": 32, "di": 0.0212 }, { "dn": 40, "di": 0.0266 } ] },
        "pex": { "hazenC": 150, "fwh": "smooth", "sizes": [
          { "dn": 16, "di": 0.0116 }, { "dn": 20, "di": 0.0144 }, { "dn": 25, "di": 0.0180 }, { "dn": 32, "di": 0.0232 } ] }
      },
      "headLoss": {
        "fwh": { "smoothCold": { "k": 0.000869, "qExp": 1.75, "dExp": 4.75 },
                 "smoothHot":  { "k": 0.000701, "qExp": 1.75, "dExp": 4.75 },
                 "rough":      { "k": 0.002021, "qExp": 1.88, "dExp": 4.88 } },
        "hazen": { "k": 10.643, "qExp": 1.852, "dExp": 4.87 },
        "darcy": { "roughnessM": { "pvc_soldavel": 1.5e-6, "ppr_pn20": 7e-6, "pex": 7e-6 }, "nu20": 1.0e-6, "nu60": 4.7e-7 }
      },
      // Comprimentos equivalentes (m) por DN de PVC: índices = [20, 25, 32, 40, 50]
      "leq": {
        "dn": [20, 25, 32, 40, 50],
        "elbow90":       [1.1, 1.2, 1.5, 2.0, 3.2],
        "elbow45":       [0.4, 0.5, 0.7, 1.0, 1.0],
        "bend90":        [0.4, 0.5, 0.6, 0.7, 1.2],
        "bend45":        [0.2, 0.3, 0.4, 0.5, 0.6],
        "teeStraight":   [0.7, 0.8, 0.9, 1.5, 2.2],
        "teeBranch":     [2.3, 2.4, 3.1, 4.6, 7.3],
        "entranceNormal":[0.3, 0.4, 0.5, 0.6, 1.0],
        "entranceBorda": [0.9, 1.0, 1.2, 1.8, 2.3],
        "exit":          [0.8, 0.9, 1.3, 1.4, 3.2],
        "gateValve":     [0.1, 0.2, 0.3, 0.4, 0.7],
        "globeValve":    [11.1, 11.4, 15.0, 22.0, 35.8],
        "pressureValve": [11.1, 11.4, 15.0, 22.0, 35.8],   // = globo (prática de apostilas)
        "angleValve":    [5.9, 6.1, 8.4, 10.5, 17.0],
        "checkValveLight":[2.5, 2.7, 3.8, 4.9, 6.8]
      },
      "reservoir": { "litersPerPerson": 150, "reserveDays": 2, "personsPerBedroom": 2, "minLiters": 500,
                     "tankSizes": [500, 750, 1000, 1500, 2000, 3000, 5000] },
      "pressurizerSuggestKpa": { "showerElectric": 10, "showerMixer": 20, "gasHeater": 20 }
    },
    "sewer": {
      "slopeMin": { "upTo75": 0.02, "from100": 0.01 }, "slopeMax": 0.05,
      "unlistedFixtureUhcByDn": { "40": 2, "50": 3, "75": 5, "100": 6 },
      "branchMaxUhc":  { "40": 3, "50": 6, "75": 20, "100": 160 },
      "stackMaxUhc":   { "upTo3Floors": { "40": 4, "50": 10, "75": 30, "100": 240, "150": 960 },
                         "over3Floors": { "40": 8, "50": 24, "75": 70, "100": 500, "150": 1900 } },
      "collectorMaxUhc": { "100": { "0.005": 180, "0.01": 216, "0.02": 250, "0.04": 300 },
                           "150": { "0.01": 700, "0.02": 840, "0.04": 1000 } },
      "ventMaxDistance": { "40": 1.00, "50": 1.20, "75": 1.80, "100": 2.40 },
      "ventBranchDn": { "noToilet": [[12, 40], [18, 50], [36, 75]], "withToilet": [[17, 50], [60, 75]] },
      "ventTerminal": { "aboveRoof": 0.30, "aboveTerrace": 2.00, "fromOpeningH": 4.00, "aboveLintel": 1.00 },
      "primaryVentDnResidentialUpTo3Toilets": 75,
      "siphonBoxMaxUhc": { "100": 6, "125": 10, "150": 15 },
      "greaseTraps": [
        { "id": "CGP", "maxKitchens": 1,  "diameter": 0.30, "septum": 0.20, "liters": 18,  "outDn": 75 },
        { "id": "CGS", "maxKitchens": 2,  "diameter": 0.40, "septum": 0.20, "liters": 31,  "outDn": 75 },
        { "id": "CGD", "maxKitchens": 12, "diameter": 0.60, "septum": 0.35, "liters": 120, "outDn": 100 } ],
      "inspection": { "minSide": 0.60, "maxDepth": 1.00, "maxSpacing": 25, "maxToConnection": 15, "maxFromTrap": 10 }
    },
    "rain": {
      "defaultIntensity": 150, "returnPeriodRoof": 5, "manningK": 60000,
      "manningN": { "pvc": 0.011, "metal": 0.011, "fibrocimento": 0.011, "concreto_alisado": 0.012, "ceramica": 0.013 },
      "gutterMinSlope": 0.005, "downpipeMinDn": 70, "horizontalMinSlope": 0.005,
      "semicircularGutterLpm": { "100": [130, 183, 256], "125": [236, 333, 466], "150": [384, 541, 757], "200": [829, 1167, 1634] },
      "semicircularSlopes": [0.005, 0.01, 0.02]
    },
    "septic": {
      "contribution": { "alto": { "C": 160, "Lf": 1 }, "medio": { "C": 130, "Lf": 1 }, "baixo": { "C": 100, "Lf": 1 } },
      "detention": [[1500, 1.00], [3000, 0.92], [4500, 0.83], [6000, 0.75], [7500, 0.67], [9000, 0.58], [null, 0.50]],
      "sludgeK": { "1": [94, 65, 57], "2": [134, 105, 97], "3": [174, 145, 137], "4": [214, 185, 177], "5": [254, 225, 217] },
      "sludgeKTempBands": [10, 20],
      "depth": [[6, 1.20, 2.20], [10, 1.50, 2.50], [null, 1.80, 2.80]],
      "minDiameter": 1.10, "minWidth": 0.80,
      "distances": { "building": 1.5, "boundary": 1.5, "waterMain": 3.0, "tree": 3.0, "well": 15.0, "waterBody": 15.0 },
      "filter": { "factor": 1.6, "minLiters": 1000, "bedHeight": 1.20, "T_upTo1500": [1.17, 1.00, 0.92] },
      "soakaway": { "ciFormula": { "a": 490, "b": 2.5 }, "defaultCi": 40, "minToWaterTable": 1.5 }
    },
    "colors": { "cold": "#1E88E5", "hot": "#E53935", "sewer": "#6D4C41", "sewerSecondary": "#A1887F",
                "vent": "#43A047", "rain": "#00ACC1", "gas": "#F9A825" }
  }
}
```

### 10.7 Testes unitários sugeridos (a partir da seção 9)

```ts
// packages/engine/src/plumbing/water.test.ts (proposta)
it('FWH: J(0,1 L/s, DI 17,0) = 0,02210 m/m', ...);              // ±1e-4
it('FWH: J(0,5848 L/s, DI 27,8) = 0,04700 m/m', ...);
it('Q = max(0,3√ΣP, qmax): ΣP 0,1 elétrico → 0,10; ΣP 3,8 → 0,5848', ...);
it('Ex.1 chuveiro do mezanino: P = 0,619 m.c.a., falha, ΔH necessário = 0,381 m', ...);
it('Ex.1b com C1/R1 DN32 e S1 DN25: P = 1,082 m.c.a., ok', ...);
it('Ex.2 pia térreo: P = 3,404 m.c.a., ok; v máx. = 1,268 m/s', ...);
it('Ex.3 caixa no forro: P = 0,025 m.c.a., falha (só estática daria ok)', ...);
it('Inferência de conexões: polilinha com 2 vértices ortogonais = 2 joelhos 90°', ...);
// packages/engine/src/plumbing/sewer.test.ts
it('Ex.4: subcoletor 27 UHC → DN100 a 1 %; ramal da bacia sempre DN100', ...);
it('CS com lav + chuveiro = 3 UHC → saída DN50; ventilação ≤ 1,20 m', ...);
it('slope null: DN50 → 2 %, DN100 → 1 %; cota final = z0 − Σ i·L', ...);
// packages/engine/src/plumbing/septic.test.ts
it('Ex.5: N=6, médio, 2 anos, 10–20 °C → V = 2410 L; filtro 1248 L; sumidouro 11,94 m² (t = 5)', ...);
// rain
it('Ex.6: A = 27,6 m², I = 150 → Q = 69 L/min; calha Ø100 a 0,5 % ok', ...);
```

### 10.8 Fases sugeridas

1. **Engine (sem UI):** catálogo `plumbing` + `computeWater` sobre o traçado **automático** atual (árvore Manhattan de `pipes.ts`, agora com nós e conexões) → substitui `pressureWarnings` (perdas incluídas) e tira as constantes fixas de `index.ts`.
2. **Esgoto:** UHC, DN, declividade, cotas, CS/CG/CI e ventilação automáticos, com avisos.
3. **UI de planta:** camadas por sistema, símbolos, selo de pressão, painel de resultados.
4. **Edição:** ferramenta de tubo (polilinha), prumadas, registros, travamento de DN, "gerar traçado".
5. **Isométrico + lista de materiais** (conexões contadas pelo grafo, no lugar de `pipe_fittings` por ponto).
6. **Pluvial, fossa e gás** (avisos e dimensionamento simples).

---

## 11. Incertezas a resolver antes de validações bloqueantes

1. Texto exato da NBR 5626:2020 sobre pressão dinâmica mínima (mantido em 10 kPa? passou a ser "conforme fabricante"?) e velocidade máxima. As fontes acessíveis confirmam só a remoção do método dos pesos, a regra dos 10 % e os 400 kPa.
2. Leq do **registro de pressão** (usar globo, 11,1 m em DN 20, é conservador; fabricantes podem dar menos) e dos registros de esfera.
3. Colunas DN 32 a 50 da tabela de Leq e as Tabelas 6, 7 e 9 da NBR 8160 (valores usuais, não reconferidos aqui).
4. Condições completas de dispensa de ventilação e o DN do ventilador primário em residências (DN 75 com ≤ 3 bacias foi visto numa fonte secundária).
5. Intensidades pluviométricas por cidade (Tabela 5 da NBR 10844) e regra de condutor vertical (ábaco).
6. Perda interna e pressão mínima dos aquecedores a gás: cadastrar por modelo, com padrão conservador de 2 m.c.a.
7. Requisitos de temperatura e anti-Legionella da parte de água quente da NBR 5626:2020.
