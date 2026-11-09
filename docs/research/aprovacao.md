# Aprovação e documentação técnica: ART/RRT, prefeitura, normas, memoriais e checklist para o ChaléCAD

Data da pesquisa: 2026-11-09. Escopo: residência unifamiliar de 1 a 2 pavimentos (com mezanino), 30 a 120 m², LSF ou wood frame, radier, telha sanduíche, instalações elétricas e hidrossanitárias com fossa/sumidouro, qualquer estado do Brasil.

Convenções de confiança:
- **[confirmado]**: encontrado em fonte oficial ou catálogo de normas nesta pesquisa.
- **[secundário]**: encontrado só em fonte secundária (artigo, TCC, notícia). Usar com cautela.
- **[a conferir]**: não foi possível confirmar na pesquisa; vem de conhecimento geral e precisa ser verificado no texto oficial antes de virar regra no código.

Aviso geral: as normas ABNT são pagas e o texto integral não foi lido. Todo critério numérico de norma listado aqui como "a conferir" deve ser validado por um profissional habilitado antes de entrar em `packages/catalog` como constante técnica versionada. O ChaléCAD é ferramenta de apoio e não substitui projeto com ART/RRT (ver `DISCLAIMER` em `@chalecad/engine`).

---

## Sumário executivo (achados críticos)

1. **ART vigente**: Resolução Confea nº 1.137, de 31/03/2023 (DOU 05/04/2023), revogou a Res. 1.025/2009. O Plenário do Confea aprovou em 11/12/2025 (Sessão Plenária nº 1132) uma **atualização** da 1.137 que revisa os modelos A, B e D do Anexo I (formulários). Número e vigência da norma de atualização: **a conferir**. [confirmado parcialmente]
2. **RRT vigente**: Lei 12.378/2010 (arts. 45 a 50) e Res. CAU/BR nº 91/2014, alterada pelas Res. 166/2018 e 184/2019. Verificar se há consolidação mais recente. [confirmado parcialmente]
3. **NBR 16970 (LSF)** existe, em 3 partes, publicadas em maio/2022: parte 1 Desempenho, parte 2 Projeto estrutural, parte 3 Interfaces entre sistemas. [confirmado]
4. **NBR 17076:2024** substituiu NBR 7229:1993 e NBR 13969:1997 (tratamento local de esgoto). Novidades relevantes: afastamentos mais restritivos e uso alternado obrigatório das unidades de disposição final; só um tipo de filtro anaeróbio de fluxo ascendente; não trata mais de tanque séptico de câmaras múltiplas. [secundário, vindo de TCC/artigos]
5. **NBR 5444** (símbolos gráficos de instalações elétricas prediais) consta como **cancelada**, sem substituta direta. Na prática os projetistas seguem usando a simbologia da NBR 5444:1989 e/ou legenda própria no projeto. [secundário/catálogo]
6. **NBR 7190** foi reeditada em 2022 em partes (Parte 1 critérios de dimensionamento, 06/2022; demais partes são métodos de ensaio). [confirmado]
7. **Carimbo**: não existe lista única obrigatória por lei; vale a NBR 10582 (carimbo na NBR 6492:2021 também) mais exigências de cada prefeitura/conselho. Os campos mínimos práticos estão na seção 4.4.
8. **Parâmetros urbanísticos** (recuos, TO, CA, TP, gabarito) são municipais. O programa só pode pedir o valor e conferir.
9. **Taxas ART 2026**: tabela base por faixa de contrato (Tabela A). Exemplo Crea-MT 2026: R$ 108,39 até R$ 15.000 e R$ 285,59 acima. Valores variam por Crea. [confirmado para MT]

---

## 1. ART (Confea/Crea)

### 1.1 Base legal
- **Lei nº 6.496, de 07/12/1977**: institui a ART para toda obra ou serviço de engenharia, arquitetura e agronomia. [confirmado, conhecimento geral]
- **Resolução Confea nº 1.137/2023** (31/03/2023): dispõe sobre a ART, o Acervo Técnico-Profissional e o Acervo Operacional. Revoga, entre outras, a Res. 1.025/2009. [confirmado] Fontes:
  - https://netcpa.com.br/noticias/conselho-federal-de-engenharia-e-agronomia-fixados-os-procedimentos-necessarios-para-anotacao-de-responsabilidade-tecnica-art-e-requerimento-de-acervo-tecnico-profissional-e-operacional/15479
  - https://www.coad.com.br/home/noticias-detalhe/118517/confea-fixa-procedimentos-sobre-art-anotacao-de-responsabilidade-tecnica
- **Atualização (dez/2025)**: Confea aprovou ajustes nos modelos A, B e D do Anexo I, procedimentos mais objetivos de comprovação de acervo e uniformização entre Creas. Número da resolução e data de vigência: a conferir. https://www.confea.org.br/confea-atualiza-regras-de-art-e-acervo-tecnico-e-moderniza-o-sistema
- **Resolução Confea nº 1.067/2015**: (valores) regra de que o valor da ART de obra/serviço incide sobre o valor do contrato; a ART múltipla soma as ARTs de rotina (Tabelas A e B). Conferir se ainda vigente após a 1.137. https://www.normasbrasil.com.br/norma/resolucao-1067-2015_303886.html
- **Decisão Plenária Confea nº 0449/2025**: valores de anuidades, serviços e ARTs para 2026. https://www.confea.org.br/profissional/taxas
- Atribuições profissionais: **Res. Confea 218/1973** (atividades), **Res. Confea 1.073/2016** (atribuições de títulos profissionais) e Decisões Normativas por modalidade. Conferir vigência. [a conferir]
- Está em andamento um grupo de trabalho para reformular a norma (ART de substituição, ART complementar, CAT/CAO). https://www.confea.org.br/node/230892

### 1.2 Tipos de ART (Res. 1.137/2023)
Classificação por **forma de registro** (art. 10, conforme resultados): [secundário]
- **ART inicial**: primeira anotação relativa à obra/serviço.
- **ART de substituição**: vinculada à inicial, substitui dados anotados.
- **ART complementar**: proposta/estudos em revisão; verificar se já está na norma atualizada. [a conferir]

Classificação por **modalidade de participação**: [secundário]
- **ART individual** (um profissional), **de coautoria** (mais de um profissional na mesma atividade), **de corresponsabilidade**, **de equipe** (a conferir).

Por **natureza do vínculo/objeto**:
- **ART de obra ou serviço** (modelo A do Anexo I, a conferir): vinculada a contrato (escrito ou verbal), com contratante, valor, período. É a usada para projeto e execução do chalé.
- **ART de cargo ou função** (modelo B, a conferir): vínculo empregatício ou cargo público. Não se aplica ao autor autônomo.
- **ART múltipla** (art. 9, II, conforme resultados): mensal, para obras/serviços de rotina (Tabela B), com um único recolhimento. Não é adequada a projeto de edificação novo; serve a serviços recorrentes. [confirmado parcialmente]
- **ART de obra/serviço de rotina**: arts. 34 e 35 da 1.137. [secundário]
- **Baixa da ART**: arts. 13 a 15; a baixa não exime responsabilidades administrativas, civis e penais. [secundário]
- **ART extemporânea / de regularização**: lançada após o início/fim da atividade; pode ter multa. [a conferir]

### 1.3 Campos do formulário (obra ou serviço)
A lista oficial está no Anexo I da Res. 1.137/2023 e muda com a atualização de 2025; a lista abaixo é a estrutura geral do sistema de ART dos Creas (SITAC/ART Web) e **deve ser conferida contra o formulário vigente de cada Crea**. [a conferir]

**A. Dados do profissional**
- Nome, título profissional, nº de registro no Crea, UF do registro, CPF.
- Tipo de ART (individual, coautoria, corresponsabilidade, equipe), forma de registro (inicial, substituição, complementar).
- Empresa contratada (quando houver): razão social, CNPJ, nº de registro da PJ no Crea.
- Se coautoria/equipe: dados dos demais profissionais e das ARTs vinculadas.

**B. Dados do contratante**
- Nome ou razão social, CPF/CNPJ, endereço completo (logradouro, número, complemento, bairro, cidade, UF, CEP), telefone/e-mail, tipo de contratante (pessoa física, jurídica privada, pública).
- **Proprietário** (quando diferente do contratante): nome, CPF/CNPJ.

**C. Dados do contrato**
- Nº do contrato (ou "verbal"), data de celebração, **valor do contrato (R$)** (base para a taxa), vínculo (contratual, estágio etc.), ação institucional (a conferir), finalidade (residencial, comercial, industrial, etc.), tipo de contratante.
- Data de início e **data prevista de término**.

**D. Local da obra/serviço**
- Endereço completo, bairro, cidade, UF, CEP.
- **Coordenadas geográficas** (latitude e longitude) do local: o sistema pede em muitos Creas (obrigatório para obras; a conferir se na versão atual de cada Crea).
- Tipo de local (urbano/rural), nº de matrícula/inscrição (a conferir).

**E. Atividades técnicas**
- Para cada linha: **Grupo/Modalidade → Nível de atuação → Atividade → Obra/serviço → Complemento**, mais **Quantidade** e **Unidade de medida**. O sistema gera um código hierárquico da tabela de obras/serviços e da tabela de atividades; códigos específicos: a conferir no Crea.
- Descrição complementar (texto livre) com a especificação (ex.: "projeto estrutural em LSF com radier").
- Campo de **observações** e **declarações** (ex.: acessibilidade, "ART de execução com projeto vinculado").

**F. Valores e pagamento**
- Valor da ART (calculado), boleto, data de pagamento, nº da ART (gerado), data de registro.
- Assinaturas: profissional e contratante (digital, gov.br/ICP-Brasil, conforme Crea).

### 1.4 Atividades técnicas típicas de um chalé
Mapeamento sugerido (nomes e códigos exatos: a conferir na tabela do Crea da UF). Unidades usuais seguem entre parênteses.

| Serviço | Atividade típica na ART | Unidade usual |
|---|---|---|
| Projeto arquitetônico (se Eng. Civil com atribuição; o arquiteto usa RRT) | Projeto > edificação residencial | m² |
| Projeto estrutural em LSF / wood frame | Projeto > estrutura metálica/de madeira | m² (área construída) ou t (aço), conforme Crea |
| Projeto de fundação (radier) | Projeto > fundação | m² (área do radier) |
| Projeto de concreto armado (radier) | Projeto > estrutura de concreto | m² ou m³ |
| Projeto elétrico baixa tensão | Projeto > instalações elétricas em BT | kVA ou kW (carga instalada/demanda), ou m² |
| Projeto hidrossanitário (água, esgoto, pluvial) | Projeto > instalações hidrossanitárias | m² ou nº de pontos |
| Projeto de fossa/sumidouro | Projeto > sistema de esgotamento local | un ou m³ |
| Execução de obra (edificação) | Execução > edificação residencial | m² |
| Execução de fundação | Execução > fundação | m² / m³ |
| Execução de instalações elétricas BT | Execução > instalações elétricas | kVA |
| Execução de instalações hidrossanitárias | Execução > instalações hidrossanitárias | m² / un |
| Direção/fiscalização de obra | Direção ou Fiscalização > edificação | m² |
| Laudo/ART de projeto de combate a incêndio (se exigido) | Projeto > PPCI | m² |

Notas:
- Um único contrato pode listar várias atividades em uma mesma ART, cada uma com sua quantidade.
- Profissionais diferentes (estruturas, elétrica, hidráulica) emitem ARTs separadas, ou uma só ART de coautoria/equipe.
- **Atribuições**: engenheiro civil tem atribuição para edificações; engenheiro eletricista, para elétrica; arquitetos usam RRT para arquitetura (e podem fazer estrutural/instalações dentro de suas atribuições em RRT, conforme Lei 12.378). Conferir competência pela Res. 1.073/2016 e pelo Crea. [a conferir]

### 1.5 Taxas (aproximadas)
- Estrutura: **Tabela A** (obra/serviço, por faixa do valor do contrato) e **Tabela B** (rotina, valores menores por faixa). [confirmado]
- **Crea-MT 2026** (Tabela A): até R$ 15.000,00: R$ 108,39; acima de R$ 15.000,00: R$ 285,59. https://www.crea-mt.org.br/portal/wp-content/uploads/2026/01/TABELA-DE-SERVICOS-E-ART-2026.pdf [confirmado]
- A página do Confea também lista valores para um exercício seguinte (R$ 112,48 e R$ 296,35 para as mesmas faixas): não confundir; usar o valor do ano da emissão. https://www.confea.org.br/profissional/taxas
- Outros Creas (SC, RS, MS) publicam tabelas anuais próprias com pequena variação: https://portal.crea-sc.org.br/anuidades-servicos-multas-e-arts-tem-valores-definidos-para-2026/
- **Ordem de grandeza (2026, aproximado)**: R$ 110 a R$ 300 por ART de obra/serviço de chalé. Cada Crea define; um chalé de projeto + execução costuma exigir de 3 a 6 ARTs.
- **No ChaléCAD**: expor `tabelaArt` como dado versionado em `packages/catalog` (por UF e ano), nunca como constante no código, com campo "fonte e data".

---

## 2. RRT (CAU)

### 2.1 Base legal
- **Lei nº 12.378, de 31/12/2010**: regulamenta o exercício da Arquitetura e Urbanismo; arts. 45 a 50 tratam do RRT. [confirmado]
- **Resolução CAU/BR nº 91, de 09/10/2014** (DOU 21/10/2014): dispõe sobre o RRT de projetos, obras e demais serviços técnicos. Alterações: **Res. 166/2018** (RRT múltiplo mensal, art. 8º, II) e **Res. 184/2019** (altera 91 e 93; vigência 120 dias após 31/12/2019). [confirmado] Fontes:
  - https://www.normasbrasil.com.br/norma/resolucao-91-2014_276004.html
  - https://www.normasbrasil.com.br/norma/resolucao-166-2018_366532.html
  - https://www.normasbrasil.com.br/norma/resolucao-184-2019_388331.html
- **Res. CAU/BR nº 21/2012**: atividades e atribuições do arquiteto e urbanista (tabela de atividades técnicas). [a conferir]
- Há consultas públicas recentes sobre indicação de responsabilidade técnica em placas e emissão de certidões (CAU/BR 49 e 51). Não alteram o RRT de projeto, mas verificar. https://www.gov.br/participamaisbrasil/consultapublicacaubr51
- Tabela de valores: reajustada anualmente pelo CAU/BR; valor de 2026 **a conferir**. Ordem de grandeza: algumas dezenas a pouco mais de R$ 100 (RRT simples). [a conferir]

### 2.2 Tipos de RRT
- **RRT Simples** (um serviço/obra, uma taxa), **RRT Extemporâneo** (registrado após início/fim da atividade, pode ter multa), **RRT Retificador** (corrige dados), **RRT Múltiplo Mensal** (obras/serviços de rotina), **RRT de Cargo e Função** (vínculo empregatício/público), **RRT de Equipe**: cada arquiteto registra o seu. Há também **RRT Social** (habitação de interesse social, valor reduzido; requisitos a conferir). [secundário/a conferir]

### 2.3 Campos do RRT (SICCAU)
Estrutura geral (a conferir contra o SICCAU vigente):
- **Profissional**: nome, nº de registro CAU, UF.
- **Empresa** (se houver): razão social, CNPJ, registro CAU da PJ.
- **Contratante**: nome/razão social, CPF/CNPJ, tipo de contratante, endereço.
- **Proprietário** (se diferente).
- **Contrato**: nº (ou verbal), valor do contrato (R$), datas de início e fim previstas, finalidade/tipo de edificação, forma de contratação.
- **Local**: endereço da obra, CEP, município/UF, **coordenadas** (a conferir se obrigatório).
- **Atividades técnicas** (tabela do CAU): grupo > atividade (ex.: "Projeto Arquitetônico", "Projeto de Interiores", "Execução de obra", "Direção de obra", "Projeto Complementar" etc.), **quantidade** e **unidade** (m² para projeto e obra; m, un, etc.).
- **Atividade tipo "Elaboração de Projeto Arquitetônico" para edificação residencial unifamiliar**: quantidade em **m²** de área construída. [a conferir códigos]
- **Observações/declarações**: acessibilidade, ART/RRT vinculados, coautoria.

### 2.4 Atividades equivalentes para um chalé (arquiteto)
| Serviço | Atividade RRT típica | Unidade |
|---|---|---|
| Estudo preliminar, anteprojeto, projeto legal, projeto executivo | Projeto Arquitetônico (por etapa ou global) | m² |
| Compatibilização/coordenação | Coordenação e compatibilização de projetos | m² |
| Projeto de paisagismo | Projeto paisagístico | m² |
| Projeto de interiores | Projeto de interiores | m² |
| Direção/Execução de obra | Direção de obra / Execução de obra | m² |
| Fiscalização | Fiscalização de obra | m² |
| Projeto de estrutura/instalações | Quando dentro das atribuições (Lei 12.378, art. 2º e Res. 21/2012) | m² |

---

## 3. Prefeitura: alvará de construção (residência unifamiliar)

### 3.1 O que é comum no Brasil
Documentos típicos do processo (nomes variam): [consolidado de prática; fontes na seção 3.4]
1. Requerimento assinado pelo proprietário (ou procurador), modelo da prefeitura.
2. Documento de identidade e CPF do proprietário; procuração se aplicável.
3. **Matrícula atualizada** do imóvel (certidão do Cartório de Registro de Imóveis; muitas prefeituras exigem validade de 30 a 90 dias; Curitiba cita 90 dias). [confirmado para Curitiba]
4. **Espelho do IPTU** / comprovante de inscrição municipal / certidão de número.
5. **Levantamento topográfico/planialtimétrico** com ART/RRT (Curitiba exige para alvará de obra; outras cidades exigem em terrenos com declive ou áreas especiais). [confirmado para Curitiba]
6. **Consulta prévia/diretrizes/certidão de uso e ocupação do solo** (zoneamento, parâmetros aplicáveis).
7. **ART ou RRT** de projeto e, quando exigido já na aprovação, de execução (muitas prefeituras exigem a de execução na emissão do alvará).
8. **Projeto arquitetônico** (projeto legal, ver 3.2), geralmente em PDF assinado digitalmente ou em arquivo DWG + PDF.
9. **Memorial descritivo** / formulário de dados da obra (áreas, materiais).
10. Comprovantes de taxa de aprovação/alvará.
11. Quando aplicável: aprovação em órgãos externos (Corpo de Bombeiros para edificações maiores ou mistas, vigilância sanitária para fossa, órgão ambiental para APP/APA/margens, patrimônio histórico, DER/ANAC/Comando da Aeronáutica em áreas especiais).
12. Para **LSF/wood frame**: muitas prefeituras aceitam sem restrição, mas algumas pedem declaração/ART de projeto estrutural e atendimento a NBR 15575 ou DATec/SiNAT (a conferir por município).

### 3.2 Pranchas típicas do projeto legal/simplificado
Mínimo prático (varia por município):
- **Planta de situação** (escala típica 1:500 a 1:2000): localização do lote em relação a ruas e quadra, com norte.
- **Planta de implantação/locação** (1:100 a 1:200): edificação no lote, **recuos frontal, laterais e fundos cotados**, cotas de nível, acessos, calçada, árvores, indicação de fossa/sumidouro e poço (quando há), norte, área permeável hachurada.
- **Plantas baixas** de cada pavimento (1:50 ou 1:75, 1:100): ambientes com nome e área, cotas, esquadrias, indicação dos cortes, níveis.
- **Cortes** (mínimo 2, um transversal e um longitudinal; passando por escada/área molhada, quando houver): pé-direito, alturas, cotas de nível, perfil do terreno.
- **Fachadas** (todas as que forem visíveis, ao menos frontal e uma lateral): cotas de altura, materiais, cobertura.
- **Planta de cobertura** (1:100 ou 1:200): caimentos, inclinação em %, beirais, calhas, cumeeira.
- **Quadro de áreas** (ver 3.3), em geral na própria prancha de implantação.
- Carimbo conforme seção 4.4.
- Detalhes pedidos por município: cálculo de área de iluminação/ventilação (ex.: aberturas mínimas em relação à área do ambiente), acessibilidade, caixa d'água, cerca/muro, calçada com rampa de acesso.

### 3.3 Quadro de áreas (valores que o programa deve pedir)
- Área do terreno (m², da matrícula e do levantamento).
- Área construída total e por pavimento; área computável e não computável (varandas, beirais e garagens podem ter regras específicas).
- **Taxa de ocupação (TO)** = projeção da edificação / área do lote. Compara com TO máxima do zoneamento.
- **Coeficiente de aproveitamento (CA)** = área computável / área do lote. Compara com CA básico/máximo.
- **Taxa de permeabilidade (TP)** = área permeável / área do lote. Compara com TP mínima.
- **Recuos mínimos**: frontal, laterais (podem depender da existência de abertura na parede), fundos.
- **Gabarito** (altura máxima/número de pavimentos), afastamentos de divisa.
- Número de vagas de garagem (quando exigido).
- Observação: **mezanino** pode ou não computar como pavimento/área (conceito municipal). O programa deve permitir marcar "computável: sim/não" por ambiente. [a conferir por município]
- Os valores máximos/mínimos vêm do **plano diretor e da lei de uso e ocupação do solo (zoneamento)** do município. **O programa só pode pedir esses números ao usuário** e comparar; não deve embutir parâmetros municipais.

### 3.4 Exemplos concretos e links
- **Curitiba (PR)**: Decreto Municipal nº 799/2020 regula a tramitação eletrônica de alvará de construção. Documentos obrigatórios citados: matrícula atualizada (90 dias) e levantamento topográfico com ART/RRT/TRT quitada; requerimento assinado pelos proprietários. https://www.contabeis.com.br/legislacao/5955707/decreto-799-2020/ e guia: https://www.bemparana.com.br/noticia/saiba-como-tirar-um-alvara-de-construcao-reforma-ou-ampliacao-de-imovel [confirmado]. Código de obras: Lei 11.095/2004 [a conferir]. Site: https://www.curitiba.pr.gov.br (seção Urbanismo/Licenciamento) [a conferir página].
- **Belo Horizonte (MG)**: Portal da Prefeitura (PBH), publicações de roteiros de licenciamento (capítulos de arquitetura e alvará). https://prefeitura.pbh.gov.br/sites/default/files/estrutura-de-governo/obras-e-infraestrutura/pp-sd-cap8-arq-26.04.10.pdf e https://prefeitura.pbh.gov.br/sites/default/files/estrutura-de-governo/obras-e-infraestrutura/pp-sd-cap17-alv-26.04.14.pdf (documentos antigos de 2010/2014, **a conferir se estão vigentes**). Código de Edificações: Lei 9.725/2009; parâmetros: Lei 11.181/2019 (LPUOS) [a conferir].
- **Florianópolis (SC)**: documentação inclui matrícula, consulta de viabilidade do lote e viabilidade construtiva; ver estudo acadêmico https://repositorio.ifsc.edu.br/bitstreams/553d9524-67eb-44ad-8e91-865f559a4d89/download [secundário]. Plano diretor: LC 482/2014 [a conferir].
- **São Paulo (SP)**: licenciamento digital, alvarás de aprovação e execução e portal de licenciamento. https://prefeitura.sp.gov.br/web/licenciamento (URL **a conferir**; resultados mostram PDFs de alvarás emitidos em https://prefeitura.sp.gov.br/documents/d/licenciamento/). Código de Obras e Edificações: Lei 16.642/2017; zoneamento: Lei 16.402/2016 [a conferir].
- **Joinville (SC)**: Instruções Normativas da SAMA tratam de licenciamento. https://www.joinville.sc.gov.br/wp-content/uploads/2026/02/Instrucao-Normativa-SAMA-no-02-2026.pdf [conteúdo a conferir].
- **Fortaleza (CE)**: "Alvará de Construção Fácil" para residência unifamiliar (índice de aproveitamento conferido no quadro de áreas). https://urbanismoemeioambiente.fortaleza.ce.gov.br/images/urbanismo-e-meio-ambiente/apresentacoes-oficias/fortaleza_online_alvara_de_construcao_facil_residencia_unifamiliar.pdf [confirmado como existente]
- **Guia nacional de boas práticas** (MDIC/Construa Brasil) para obtenção de alvarás: https://www.gov.br/mdic/pt-br/assuntos/sdic/construa-brasil/produtos/22-09-construa-brasil-guia-orientativo-de-boas-praticas-para-obtencao-de-alvaras-de-construcao.pdf
- Cidades turísticas de serra (Campos do Jordão, Gramado, Monte Verde): possuem regras de estética, materiais de fachada, inclinação de telhado e áreas de preservação; **não pesquisadas em profundidade**, a conferir caso a caso. Muitas permitem "projeto simplificado" para unifamiliar até certa área (por exemplo até 70 m² ou 75 m² em alguns municípios; **a conferir**).

### 3.5 O que varia por município
- Nome do processo (aprovação, alvará de construção, licença de obra) e nº de etapas (aprovação do projeto e depois alvará de execução).
- Formato de entrega (físico, PDF, DWG, plataforma própria; assinatura digital ICP-Brasil/gov.br).
- Limites do "projeto simplificado" (área máxima, uso residencial).
- Regras de recuo, gabarito, permeabilidade, vagas, mezanino, beirais.
- Exigência de projeto de fossa/sumidouro no processo de aprovação (onde não há rede de esgoto).
- Escalas e tamanho mínimo de letra; layout de carimbo próprio.
- Exigência de projetos complementares na aprovação (normalmente só na execução, não na aprovação).

---

## 4. Normas de representação e formatação

### 4.1 NBR 6492:2021 — Representação de projetos de arquitetura
- Edição de 2021 existe (documento de 40 páginas); o texto integral **não foi lido**. [confirmado existência]. Referência: https://arquivos.ufrrj.br/arquivos/2021103028882828758439fd707c0a63a/NBR_6492_2021.pdf (cópia acadêmica; usar com cuidado).
- Conteúdo geral (conhecimento geral e edição 1994, a conferir na de 2021): requisitos para elaboração de documentos técnicos de projetos arquitetônicos e urbanísticos: **escalas**, **cotas**, **níveis**, **indicação de norte**, **hachuras**, **legendas**, **simbologia**, **planta-chave**, tipos de linha, tamanho de texto, indicação de cortes e elevações.
- Cada prancha deve conter: carimbo, título do desenho e escala, norte (em plantas), legenda de símbolos, planta-chave quando a planta é fracionada, cotas e níveis, nomes e áreas dos ambientes (planta baixa), indicação de cortes, quadro de esquadrias (quando executivo).
- **Escalas típicas** (conferir na norma e em NBR 8196): situação 1:500 a 1:1000; implantação 1:100 a 1:200; plantas 1:50 a 1:100; cortes e fachadas 1:50 a 1:100; detalhes 1:1 a 1:25.
- **Níveis**: cota de piso acabado referenciada a um RN (nível de referência); indicação de nível do terreno natural e do terreno modificado (corte/aterro).
- **Norte**: indicado nas plantas de situação, implantação, baixa e cobertura (símbolo de norte verdadeiro/magnético, a conferir).

### 4.2 NBR 16636 — Elaboração de projetos de edificações (Partes 1 a 3)
- Parte 1: diretrizes e terminologia; Parte 2: projeto arquitetônico; Parte 3: projetos de estruturas? **A conferir** o título exato de cada parte (os resultados só mostraram a Parte 2, ed. 2017, aplicável a todos os tipos de edificações). Para a Parte 3 (projetos urbanísticos?) não confirmado.
- **Etapas de projeto** (NBR 16636-2): levantamento de dados (LV), programa de necessidades (PN), estudo de viabilidade (EV), **estudo preliminar (EP)**, **anteprojeto (AP) ou pré-executivo (PE)**, **projeto legal (PL)**, **projeto básico (PB, opcional)**, **projeto executivo (PE)**, e acompanhamento de obra/pós-ocupação. [consolidado, a conferir siglas exatas]
- O ChaléCAD deve rotular cada documento exportado com a **etapa** (estudo preliminar, projeto legal, projeto executivo).

### 4.3 Formatos, margens, dobramento, escalas
- **NBR 10068** (folha de desenho: leiaute e dimensões; edição encontrada 1987): série A, A0 a A4; **margem esquerda 25 mm** em todos os formatos; **margem direita 10 mm em A0 e A1 e 7 mm em A2, A3 e A4**. [secundário] Margens superior/inferior: igual à direita (a conferir).
- Dimensões (ISO 216): A0 841x1189 mm, A1 594x841, A2 420x594, A3 297x420, A4 210x297. [conhecimento geral]
- **NBR 13142** (dobramento de cópia): dobrar para A4 com o carimbo visível no canto inferior direito. [a conferir detalhes]
- **NBR 8196** (emprego de escalas): escalas recomendadas 1:1, 1:2, 1:5, 1:10, 1:20, 1:50, 1:100, 1:200, 1:500, 1:1000 e múltiplos. Pode ter sido cancelada/substituída; **a conferir**.
- Normas correlatas de desenho: NBR 8402 (caracteres), NBR 8403 (linhas), NBR 10126 (cotagem), NBR 12298 (hachuras), NBR 10067 (vistas), NBR 14100 (símbolos de prevenção e combate a incêndio). [a conferir vigência de cada uma]

### 4.4 Carimbo/selo (campos)
A NBR 10582 (apresentação da folha para desenho técnico) e a NBR 6492 definem a posição; a lista de campos abaixo é o consenso de prática de prefeituras e conselhos. Posição: **canto inferior direito**, junto à margem direita, largura usual 175 mm (A0/A1) ou 178 mm (a conferir). [a conferir]

**Campos obrigatórios (mínimo para o ChaléCAD):**
1. Título do projeto / nome da obra (ex.: "Residência unifamiliar – Chalé").
2. Conteúdo da prancha (ex.: "Planta baixa – Pavimento térreo").
3. Etapa do projeto (EP, anteprojeto, projeto legal, executivo).
4. **Proprietário/contratante**: nome e CPF/CNPJ.
5. **Endereço da obra**: logradouro, número, bairro, cidade, UF, CEP; inscrição municipal/lote/quadra/matrícula (varia).
6. **Autor do projeto**: nome, título (arquiteto/engenheiro), **nº CAU ou CREA**, e UF.
7. **Responsável técnico pela execução** (quando houver).
8. **Nº da ART/RRT** (projeto e execução).
9. **Escala(s)** (indicar "indicada" se múltiplas).
10. **Data** (emissão).
11. **Folha x/y** (numeração da prancha e total).
12. **Revisão** (letra ou número, data, descrição, autor).
13. **Desenhista/projetista** e **conferência** (iniciais).
14. Assinaturas: proprietário e responsável técnico (espaço ou assinatura digital).
15. Área do terreno e área construída (às vezes no carimbo; quando não está no quadro de áreas).
16. Logo ou nome do escritório/empresa, CNPJ (opcional).
17. Nome do arquivo ou código do documento (opcional, útil para gestão).

**Campos adicionais comuns:** número do processo na prefeitura, espaço reservado para carimbo de aprovação da prefeitura (norma local: costuma-se deixar área livre de ~10x7 cm ou específica, **a conferir**), planta-chave, legenda de materiais, nota "Projeto sujeito a aprovação".

---

## 5. Memoriais e normas estruturais

### 5.1 Memorial descritivo de arquitetura
Conteúdo típico (NBR 16636-2 e prática): [a conferir contra a norma]
- Identificação da obra, do proprietário, do autor e do local (matrícula, inscrição).
- Descrição do terreno e dados urbanísticos (zona, TO, CA, TP, recuos) e quadro de áreas.
- Partido arquitetônico e programa de necessidades.
- Sistema construtivo: fundação (radier), estrutura (LSF ou wood frame), fechamentos externos e internos (placas cimentícias, OSB, gesso acartonado), isolamento termoacústico, impermeabilização.
- Cobertura: estrutura, telha sanduíche (núcleo EPS/PUR/PIR, espessura, espessura de chapas), inclinação, calhas e rufos.
- Esquadrias (material, dimensões, vidros), pisos, revestimentos, forros, pintura, louças e metais.
- Instalações: resumo elétrico, hidrossanitário, tratamento de esgoto, reuso/água de chuva (se aplicável).
- Acessibilidade (NBR 9050:2020, quando aplicável), segurança contra incêndio (se exigida), desempenho (NBR 15575).
- Cuidados na execução e especificações de materiais com normas de referência.

### 5.2 Memorial de cálculo/descritivo estrutural para LSF
Conteúdo mínimo sugerido (NBR 16970-2, NBR 14762, NBR 6120, NBR 6123, NBR 8681): [a conferir seções]
- Descrição do sistema (painéis estruturais, lajes secas/úmidas, contraventamentos, ligações).
- Normas adotadas e versões.
- Materiais: aço (ASTM A653 / NBR 7008? grau, fy, fu, revestimento Z275 ou conforme NBR 15253), parafusos, chapas, placas OSB/cimentícia.
- Perfis adotados: tipo (U enrijecido Ue, guia U, cartola), dimensões, espessuras.
- **Ações**: permanentes (peso próprio, por NBR 6120), sobrecargas (NBR 6120), vento (NBR 6123), combinações (NBR 8681) com coeficientes.
- Modelo de cálculo e verificações: montantes (compressão, flexocompressão), vigas de piso, vergas (flexão, cisalhamento), ligações, estabilidade global, deslocamentos (flechas limites), contraventamento (fitas em X, placas), fixação ao radier (chumbadores).
- Resultados: taxas de utilização por elemento, flechas, reações de apoio ao radier.
- Planta de fôrma/estrutura e **lista de peças** (corte e dobra/tabela de perfis).
- Carregamentos transferidos à fundação.
- **Declarações do profissional**: classe de agressividade/ambiente, vida útil de projeto, premissas, limitações, ART nº.

### 5.3 Normas estruturais e o que declarar/exportar
| Norma | Existência/status | O profissional declara/verifica | Dados para exportar |
|---|---|---|---|
| **ABNT NBR 16970 (partes 1, 2 e 3), 2022** | Existe, publicada em 05/2022. Parte 1: Desempenho; Parte 2: Projeto estrutural; Parte 3: Interfaces entre sistemas (paredes/pisos, esquadrias, instalações). Parte 2 baseada em limites de estado e NBR 14762. [confirmado] Sites: https://www.normas.com.br/visualizar/abnt-nbr-nm/13381/abnt-nbr16970-2-light-steel-framing-sistemas-construtivos-estruturados-em-perfis-leves-de-aco-formados-a-frio-com-fechamentos-em-chapas-delgadas-parte-2-projeto-estrutural | Atendimento a requisitos de projeto estrutural, desempenho e interfaces; premissas e verificações | Peças e perfis, cargas, verificações, detalhes de interface (lista a conferir) |
| **NBR 14762** | Dimensionamento de estruturas de aço de perfis formados a frio (edição 2010, a conferir se há revisão posterior). [confirmado existência] | Verificação de resistência (flambagem local, distorcional, global), ligações | Esforços, taxas de utilização, propriedades efetivas |
| **NBR 15253** | Perfis de aço formados a frio com revestimento metálico para painéis estruturais reticulados em edificações: requisitos gerais (edição 2014, a conferir). [confirmado existência] | Classe de revestimento, espessuras mínimas, material | Especificação do perfil e do revestimento |
| **NBR 6120** | Ações para o cálculo de estruturas de edificações (edição 2019). [a conferir ano] | Cargas permanentes e acidentais adotadas (ex.: sobrecarga de piso residencial) | Tabela de cargas |
| **NBR 6123** | Forças devidas ao vento em edificações (1988, com emenda 2013). [a conferir] | Velocidade básica V0 (isopletas), S1, S2, S3, coeficientes de pressão | V0, categoria de rugosidade, classe, pressões; vem do **município** (V0) |
| **NBR 8681** | Ações e segurança nas estruturas: critérios de combinação (2003). [a conferir] | Coeficientes de ponderação e combinações | Combinações usadas |
| **NBR 6122** | Projeto e execução de fundações (edição 2022, a conferir). | Tipo de fundação, tensão admissível, recalques, premissas geotécnicas | Tensão admissível, nível d'água, tipo de solo, referência à sondagem |
| **NBR 6118** | Projeto de estruturas de concreto (edição 2023, a conferir). | Cobrimento, classe de agressividade, fck, armaduras do radier | fck, aço, cobrimento, detalhamento de armaduras |
| **NBR 6484 / NBR 8036** | 6484: sondagem SPT (2020, a conferir); 8036: programação de sondagens de simples reconhecimento de solos para fundações de edifícios (1983, a conferir). | Número e posição de furos, NSPT, nível d'água | Relatório de sondagem anexado ou referenciado; nº de furos; profundidade |
| **NBR 15575 (partes 1 a 6)** | Desempenho de edificações habitacionais (edição 2021, a conferir). | Declaração de atendimento por parte, vida útil de projeto (VUP), desempenho estrutural, térmico, acústico, estanqueidade, segurança contra incêndio | Memorial/declaração de desempenho, transmitâncias (U), capacidade térmica, resultados |
| **NBR 7190 (2022)** | Reedição em partes. Parte 1: critérios de dimensionamento (06/2022); outras partes: métodos de ensaio (classificação, corpos de prova, peças estruturais, ligações com conectores mecânicos, MLC/CLT). [confirmado] https://www.target.com.br/produtos/normas-tecnicas/46004/nbr7190-1-projeto-de-estruturas-de-madeira-parte-1-criterios-de-dimensionamento | Classe de resistência da madeira, umidade, duração de carga, classe de serviço, ligações | Propriedades de cálculo, esforços, ligações |

Observações:
- **Wood frame (light wood framing)** não tem norma ABNT própria identificada nesta pesquisa; usa-se NBR 7190:2022 + diretrizes do SiNAT/PBQP-H (Diretriz SiNAT para sistemas de madeira com fechamentos em chapas delgadas) e DATec. Número da diretriz: **a conferir**. A pesquisa encontrou documento do PBQP-H relacionado a steel frame (FAD 070): https://pbqp-h.mdr.gov.br/wp-content/uploads/2024/08/FAD_070_SteelFrame-final_rev2-limpa.pdf
- Limites de flecha, coeficientes e demais constantes: tudo de `packages/catalog` com referência de norma e edição.
- Temperatura/umidade e durabilidade do LSF (galvanização mínima) em regiões litorâneas: exigir declaração.

---

## 6. Elétrico

### 6.1 Normas e conteúdo do projeto
- **NBR 5410** (instalações elétricas de baixa tensão): edição 2004 (versão corrigida 2008). Há revisão em andamento; **a conferir** se nova edição já foi publicada. https://www.target.com.br/produtos/normas-tecnicas/28721/nbr5410-instalacoes-eletricas-de-baixa-tensao
- Conteúdo do projeto executivo (NBR 5410, item sobre documentação, e prática):
  - **Planta de pontos e circuitos**: tomadas (TUG/TUE), iluminação, interruptores, eletrodutos, quadros, caixas, aterramento (por pavimento).
  - **Diagrama unifilar** do quadro de distribuição (QD), com disjuntores, DR (dispositivo diferencial residual), DPS (proteção contra surtos), seções de condutores, ligação ao medidor.
  - **Quadro de cargas**: circuito, descrição, tensão, potência (VA/W), corrente, fases, condutor (mm²), proteção, método de instalação, DR.
  - **Quadro de distribuição**: detalhes de montagem, barramentos, identificação.
  - **Memorial descritivo e de cálculo**: critérios (seção mínima, queda de tensão, capacidade de corrente, agrupamento), previsão de cargas (NBR 5410 item 9.5.2: pontos mínimos de tomadas por ambiente, iluminação mínima), cálculo de demanda, aterramento (esquema TN-S, TT), proteção.
  - **Lista de materiais**.
  - Detalhes: padrão de entrada, caixa de medição, aterramento, ponto de entrega.
- Pontos mínimos (a conferir na norma): iluminação mínima 100 VA para ambiente até 6 m² (e +60 VA a cada 4 m² adicionais); tomadas de uso geral (mínimo por ambiente conforme perímetro: cozinha 1 a cada 3,5 m de perímetro; banheiro mínimo 1 junto ao lavatório; demais 1 a cada 5 m). Valores resumidos de conhecimento geral; **conferir antes de implementar**.
- Aterramento e **DR obrigatório** em áreas molhadas e tomadas externas (NBR 5410). [a conferir itens]

### 6.2 NBR 5444
- Símbolos gráficos para instalações elétricas prediais: consta **cancelada** (listagem do catálogo indica data 11/2014) e sem substituição direta; os símbolos ainda são amplamente usados. Fonte: https://www.normas.com.br/visualizar/abnt-nbr-nm/7854/abnt-nbr5444-simbolos-graficos-para-instalacoes-eletricas-prediais [secundário]
- Prática hoje: manter **legenda no próprio projeto** (obrigatória em qualquer caso), baseada na simbologia tradicional e eventualmente nas normas IEC 60617 (símbolos gráficos para diagramas) e nas normas de desenho (NBR 5259, 5280: símbolos literais, a conferir vigência). [a conferir]
- **No ChaléCAD**: exportar sempre legenda; não declarar "conforme NBR 5444".

### 6.3 Concessionárias: padrão de entrada, carga, demanda
- Regra geral (Resolução ANEEL 1.000/2021, **a conferir**): unidades consumidoras com carga instalada até 75 kW são atendidas em **tensão secundária (Grupo B)**. Acima, exigem tensão primária e projeto elétrico específico.
- **Cemig**: norma **ND-5.1** (fornecimento em tensão secundária, rede aérea; edição jul/2022). Contém o cálculo de carga instalada e demanda e os tipos de padrão de entrada. https://www.cemig.com.br/wp-content/uploads/2025/10/nd5_1_000001p.pdf [confirmado existência]. **ND-5.3** (acima de 75 kW, tensão primária) https://www.cemig.com.br/wp-content/uploads/2023/09/nd5_3_000001p.pdf. Em **ND-5.5** há lista de casos "sem projeto" para consumidores com demanda até 327 kVA; **não se aplica diretamente a ND-5.1/residência** (leitura a conferir). https://www.cemig.com.br/wp-content/uploads/2023/08/nd-5.5-concurso-02-23.pdf [secundário]. Limiar de projeto exigido para residência em ND-5.1: **a conferir** (consultar tabelas das seções de carga/demanda e tipos de padrão).
- **Copel (PR)**: NTC **901100** (fornecimento em tensão secundária de distribuição; **a conferir**) e NTC **900100** (critérios de apresentação de projetos de entradas de serviço; a conferir). Limiar de projeto elétrico: **a conferir**.
- **Enel (SP, CE, RJ, GO)**: normas técnicas próprias para entrada e medição (ex.: instruções técnicas por distribuidora); nenhum resultado específico encontrado. **A conferir** em https://www.enel.com.br (seção Normas técnicas).
- **CPFL**: normas GED (ex.: GED-13 para fornecimento em tensão secundária; **a conferir** o número). https://www.cpfl.com.br [a conferir].
- **Padrão de entrada típico** por carga (faixas ilustrativas, a conferir por distribuidora): monofásico (2 fios) para cargas pequenas; bifásico (3 fios); trifásico (4 fios) para cargas maiores, com disjuntor geral de 40 a 150 A ou mais. A classificação depende da **demanda calculada** (kVA) e do número de fases; cada distribuidora tem tabela própria.
- Com **chuveiro elétrico, aquecedor, ar-condicionado e energia solar**, um chalé de 120 m² costuma ser **trifásico**. **Geração distribuída fotovoltaica** exige projeto/ART específica e segue norma da concessionária (por exemplo, Cemig: https://canalsolar.com.br/cemig-divulga-novos-criterios-para-analise-de-conexoes-de-gd/). [fora do escopo inicial]
- O que o ChaléCAD deve extrair para o requerimento de ligação: **carga instalada (kW), demanda (kVA), número de fases, tipo de padrão, disjuntor geral, seção do ramal, tipo de aterramento, endereço, ART do projeto/execução** (quando exigida).

---

## 7. Hidrossanitário

### 7.1 Conteúdo do projeto
- **Água fria** (NBR 5626:2020): planta com ramal, reservatório, barrilete, colunas, ramais; **isométrico**; dimensionamento por vazões e pesos; pressões mínimas e máximas; metais e registros; reservatório (volume, extravasor, limpeza, tampa); alimentação por concessionária/poço. [a conferir o ano 2020: nenhuma busca confirmou, de conhecimento geral]
- **Água quente** (NBR 7198 e NBR 5626, a conferir): aquecedor solar/elétrico/gás, isolamento, retorno.
- **Esgoto sanitário e ventilação** (NBR 8160:1999): planta, isométrico, ralos, caixas sifonadas, caixa de gordura, caixa de inspeção, **desconectores**, tubos de ventilação, declividades mínimas, diâmetros por UHC (unidade Hunter de contribuição). [a conferir edição]
- **Águas pluviais** (NBR 10844:1989): planta de cobertura, calhas, condutores verticais e horizontais; dimensionamento por intensidade de chuva (período de retorno e duração; **dado local: a conferir**) e área de contribuição. [a conferir]
- Captação/aproveitamento de água de chuva: NBR 15527 (a conferir).
- **Detalhes da caixa d'água**: volume (consumo diário x dias), altura/posição, tubulações, ladrão, extravasor, tampa e tela, base/suporte (inclusive peso sobre o LSF).
- **Memorial de cálculo**: consumo, vazões, diâmetros, perdas de carga, UHC, declividades, volume do reservatório, bomba (se houver), pluvial.
- Lista de materiais e quantitativos.

### 7.2 NBR 17076:2024 (tratamento local de esgoto) — substitui NBR 7229 e NBR 13969
- **Confirmação**: NBR 17076:2024 substituiu NBR 7229:1993 e NBR 13969:1997. [secundário: TCC do IFSC] https://repositorio.ifsc.edu.br/items/fb4b10c8-675d-4f4b-a0a3-b727aba16f49 ; UDESC (também aponta a substituição/cancelamento da 7229): https://udesc.br/arquivos/udesc/id_cpmenu/19312/ANLISE_1_17273813706282_19312.pdf
- **O que muda** (secundário, conferir no texto da norma):
  - **Afastamentos** mais restritivos e **uso alternado obrigatório** das unidades de disposição final (duas unidades alternadas).
  - **Não trata tanque séptico de câmaras múltiplas** (a antiga NBR 7229 tratava); define apenas um tipo de **filtro anaeróbio de fluxo ascendente**.
  - Um artigo defende dimensionar tanque com critérios de NBR 8160 em vez dos valores prefixados da 17076 (opinião, não regra).
- **Fórmula antiga (NBR 7229:1993, legado, apenas para comparação)**: V = 1000 + N(C·T + K·Lf), com N nº de contribuintes, C contribuição de despejo (L/pessoa·dia), T tempo de detenção, K taxa de acumulação de lodo, Lf contribuição de lodo fresco. Fórmula e tabelas da NBR 17076: **a conferir** (não confirmadas nesta pesquisa; **não** usar a fórmula antiga como "conforme NBR 17076").
- **Distâncias mínimas**:
  - Antiga NBR 7229: 1,50 m de edificações, limites de terreno, sumidouros, valas e ramal de água. [secundário] 
  - NBR 17076 (reportagem): **15 m entre poço e fossa**, ampliável por laudo de risco. https://olhardigital.com.br/curiosidades/?p=30210 [secundário/jornalismo; **a conferir no texto**]. Distâncias da nova norma até divisa/edificações: **a conferir**.
- **Teste de percolação/infiltração**: em cova; parâmetros (profundidade, saturação, tempo de infiltração por 1 cm) e relação com taxa de aplicação/área de infiltração: **a conferir** na NBR 17076. [A NBR 7229 trazia tabela taxa x tempo de percolação]
- **Disposição final**: sumidouro, vala de infiltração, vala de filtração, valas de infiltração/irrigação; requer nível freático a profundidade mínima (a conferir, normalmente 1,5 a 2 m do fundo) e solo com capacidade de infiltração adequada.
- **O que a vigilância sanitária/prefeitura pede** (varia): projeto e memorial de fossa/filtro/sumidouro, laudo de percolação, localização na implantação (com distâncias de poço, divisas, edificações, cursos d'água), ART/RRT, declaração de ausência de rede pública (certidão da concessionária de saneamento), e eventualmente licença do órgão ambiental. [a conferir por município]
- Referências complementares: CAESB (guia de fossa-sumidouro) https://www.caesb.df.gov.br//images/arquivos_pdf/Fossa-sumidouro.pdf.

---

## 8. Checklist de validação normativa para o ChaléCAD

### 8.1 Tabela de verificações (auto = verificável automaticamente)

| # | Item | Norma/seção | Critério verificável (auto?) | Dado de entrada a pedir |
|---|---|---|---|---|
| 1 | Taxa de ocupação | Plano diretor/zoneamento municipal | Projeção da edificação / área do lote ≤ TO máx (sim) | Área do lote, TO máx |
| 2 | Coeficiente de aproveitamento | Zoneamento municipal | Área computável / lote ≤ CA (sim) | CA, regra de computabilidade (mezanino, varanda, beiral) |
| 3 | Taxa de permeabilidade | Zoneamento municipal | Área permeável / lote ≥ TP mín (sim) | TP mín; materiais permeáveis |
| 4 | Recuos frontal/lateral/fundo | Zoneamento/código de obras | Distâncias mín da edificação às divisas (sim, geometria) | Dimensões do lote (polígono), recuos mín, regra de abertura |
| 5 | Gabarito/altura máxima | Zoneamento | Altura da edificação ≤ máx (sim) | Altura máx, nº de pavimentos |
| 6 | Pé-direito mínimo | Código de obras municipal | Pé-direito ≥ mín por tipo de ambiente (sim) | Valores municipais (ex.: 2,40 m ambientes de permanência; a conferir) |
| 7 | Iluminação e ventilação naturais | Código de obras; NBR 15575 | Área de abertura / área do piso ≥ fração (sim) | Frações mín (ex.: 1/6 ou 1/8; a conferir) |
| 8 | Áreas mínimas de ambientes | Código de obras | Área ≥ mín (sim) | Valores municipais |
| 9 | Acessibilidade (quando aplicável) | NBR 9050:2020 | Largura mínima de portas (0,80 m), circulação, rampas ≤ 8,33% (sim/parcial) | Se há exigência; público/privado |
| 10 | Coerência dos quadros de áreas | NBR 6492 | Soma das áreas = total (sim) | Nenhum |
| 11 | Escala e formato das pranchas | NBR 10068, 6492 | Prancha contida no formato com margens (sim) | Formato preferido |
| 12 | Campos do carimbo preenchidos | NBR 10582, 6492 | Todos os campos obrigatórios não vazios (sim) | Dados da seção 4.4 |
| 13 | Cargas permanentes e sobrecargas | NBR 6120 | Valores usados presentes no catálogo versionado (sim) | Uso da edificação |
| 14 | Vento | NBR 6123 | V0, S1, S2, S3 definidos (sim, cálculo de pressão) | V0 (município/isopleta), topografia, rugosidade, dimensões |
| 15 | Combinações de ações | NBR 8681 | Combinações ELU e ELS geradas (sim) | Nenhum |
| 16 | Verificação de perfis LSF (montantes, vigas, vergas) | NBR 14762; NBR 16970-2 | Taxa de utilização ≤ 1,0 (sim, pré-dimensionamento) | Aço (fy), espessura, perfis |
| 17 | Flechas | NBR 14762/16970-2; limites no catálogo | Flecha ≤ L/limite (sim; limites a conferir) | Limite adotado |
| 18 | Revestimento do aço | NBR 15253 | Classe do revestimento ≥ mín (sim; valores a conferir) | Agressividade/localização (litoral) |
| 19 | Interfaces (parede-piso, esquadrias, instalações) | NBR 16970-3 | Presença de detalhes (parcial; checklist) | Opções de detalhe |
| 20 | Desempenho térmico/acústico | NBR 15575 | U, capacidade térmica, valores no catálogo (parcial) | Zona bioclimática (NBR 15220, a conferir), fechamentos |
| 21 | Segurança estrutural da fundação | NBR 6122, 6118 | Tensão no solo ≤ σ_adm (sim); recalque (parcial) | **Sondagem/tensão admissível do solo**, NA, tipo de solo |
| 22 | Radier: espessura mínima/armação | NBR 6118 | Verificação preliminar (parcial) | fck, aço, cobrimento, classe de agressividade |
| 23 | Sondagem presente e adequada | NBR 6484, 8036 | Nº de furos ≥ mín conforme área (parcial); relatório anexado (sim/não) | Laudo de sondagem |
| 24 | Elétrico: previsão mínima de pontos | NBR 5410 (9.5.2; a conferir) | Pontos de iluminação e tomadas por ambiente ≥ mín (sim) | Plantas dos pontos |
| 25 | Elétrico: seção/proteção/queda de tensão | NBR 5410 | Ib ≤ In ≤ Iz; ΔV ≤ limite (sim) | Comprimentos, método de instalação |
| 26 | Elétrico: DR, DPS, aterramento | NBR 5410 | Presença nos circuitos exigidos (sim) | Esquema de aterramento (TN/TT) |
| 27 | Carga instalada, demanda e padrão de entrada | Norma da concessionária | Demanda calculada, tipo de padrão (parcial) | **Concessionária**, tensão, nº de fases |
| 28 | Água fria: diâmetros, pressões, reservatório | NBR 5626:2020 | Pressões dentro de faixas (sim) | Fonte de água, pressão da rede, nº de moradores |
| 29 | Esgoto: declividades, desconectores, ventilação | NBR 8160 | Declividade mín, diâmetros por UHC (sim) | Aparelhos, rede pública ou fossa |
| 30 | Pluvial: calhas e condutores | NBR 10844 | Vazão ≤ capacidade (sim) | Intensidade de chuva local (município) |
| 31 | Fossa/filtro/sumidouro: dimensionamento | NBR 17076:2024 | Volume útil ≥ mín (sim, após confirmar fórmula) | Nº de contribuintes, tipo de ocupação, **taxa de percolação/teste** |
| 32 | Distâncias de poço, divisa, edificação | NBR 17076:2024 | Distâncias ≥ mín (sim, valores a conferir) | Posição de poço/fossa/sumidouro, divisas |
| 33 | Nível do lençol freático | NBR 17076:2024 | Distância fundo do sumidouro-NA ≥ mín (sim) | Profundidade do NA |
| 34 | ART/RRT informado | Lei 6.496 / Lei 12.378 | Nº preenchido (sim) | Nº ART/RRT por disciplina |
| 35 | Aviso de não substituição de projeto com ART | Interno (`DISCLAIMER`) | Presente em todo documento (sim) | Nenhum |

### 8.2 Dados de entrada a coletar do usuário (agrupados)
- **Lote**: polígono/dimensões, área, orientação (norte), topografia/níveis, matrícula, inscrição, endereço, coordenadas, cidade/UF.
- **Parâmetros urbanísticos municipais**: zona, TO máx, CA, TP mín, recuos (frontal, lateral, fundos e regra de abertura), gabarito, pé-direito mínimo, vagas, regra de mezanino/beiral, fonte (lei, artigo, data).
- **Solo e fundação**: sondagem (tipo, nº de furos, NSPT, profundidade, NA), tensão admissível, classe de agressividade, taxa de percolação.
- **Ambiente**: V0 e categoria de rugosidade, intensidade de chuva local, zona bioclimática.
- **Elétrico**: concessionária, tensão e fases, tipo de ligação (monofásico, bifásico, trifásico), cargas especiais (chuveiro, ar-condicionado, fogão elétrico, carregador de veículo, fotovoltaico).
- **Hidrossanitário**: rede pública de água/esgoto ou poço/fossa, pressão disponível, nº de moradores, reservatório.
- **Responsáveis**: proprietário, autores (arquitetura, estrutura, elétrico, hidro), registro CAU/CREA, nº ART/RRT, empresa executora.

### 8.3 Documentos que o ChaléCAD deve exportar

**Pranchas (PDF vetorial e DXF/DWG quando viável; formato A1/A2/A3 conforme escolha; carimbo completo; norte, escala gráfica e legenda):**
1. Capa/índice de pranchas, com lista de revisões.
2. Planta de situação.
3. Planta de implantação/locação com recuos, níveis, fossa/sumidouro/poço e área permeável.
4. Quadro de áreas e quadro de parâmetros urbanísticos (valores de projeto x limites do município).
5. Plantas baixas (térreo, mezanino/pavimento superior) com áreas, cotas e níveis.
6. Cortes (mínimo 2) com pé-direito e níveis.
7. Fachadas (todas).
8. Planta de cobertura (caimentos, calhas, telha sanduíche).
9. Quadro de esquadrias.
10. Planta de fundação (radier) com cotas e armação (e detalhes).
11. Planta de estrutura LSF por painel (elevações de paredes, vigas de piso, tesouras/terças, contraventamentos, ligações) com lista de perfis.
12. Planta elétrica (pontos e circuitos), diagrama unifilar, quadro de cargas, detalhe do padrão de entrada.
13. Plantas hidrossanitárias: água fria/quente, esgoto, ventilação, pluvial, isométricos, detalhe da caixa d'água.
14. Detalhe de fossa, filtro e sumidouro (ou vala), com distâncias.
15. Legenda de símbolos (inclusive elétrica, sem citar NBR 5444 como vigente).

**Memoriais e relatórios (PDF, com `DISCLAIMER`):**
16. Memorial descritivo de arquitetura.
17. Memorial descritivo e de cálculo estrutural (LSF/wood frame e radier), com premissas, normas (edição), cargas, combinações, resultados e declaração de limitações.
18. Memorial elétrico (carga instalada, demanda, padrão de entrada, cálculo de circuitos) e lista de materiais.
19. Memorial hidrossanitário e de dimensionamento da fossa/sumidouro.
20. Declaração/memorial de desempenho (NBR 15575) com os dados disponíveis (a completar pelo responsável).
21. Quantitativos, lista de peças (corte), peso e orçamento (relatórios já derivados do motor).
22. Relatório de **checklist normativo** (itens do 8.1 com aprovado/reprovado/pendente e a entrada usada).

**Fichas de preenchimento (não substituem o sistema oficial; servem para copiar os dados):**
23. **Ficha de ART (Crea)**: dados do profissional, contratante, proprietário, endereço e coordenadas, valor do contrato, datas, finalidade, atividades técnicas com **quantidade e unidade** (m² de projeto, m² de área construída, kVA da carga instalada, m² do radier, etc.), observações e documentos vinculados. O ChaléCAD gera os valores sugeridos; **a emissão é feita no sistema do Crea**.
24. **Ficha de RRT (CAU)**: idem, com atividades da tabela do CAU.
25. **Ficha do requerimento de alvará** (campos comuns): dados do proprietário, matrícula, inscrição, áreas, TO/CA/TP, nº de pavimentos, responsáveis, ARTs/RRTs.
26. **Ficha para ligação na concessionária**: carga instalada, demanda, número de fases, tipo de padrão, disjuntor geral.
27. **Ficha para vigilância sanitária/prefeitura (fossa)**: nº de contribuintes, volume do tanque, área de infiltração, resultado do teste de percolação, distâncias.
28. **Termo de entrada de dados**: lista dos dados informados pelo usuário e sua fonte (sondagem, lei municipal etc.), com data.

### 8.4 Recomendações de arquitetura para o código
- Cada regra deve declarar `fonte` (norma, edição, seção, data da conferência), `status` (confirmado/a conferir) e `severidade`.
- Valores a conferir não devem produzir "aprovado"; devem sair como "pendente de conferência profissional".
- Parâmetros urbanísticos entram sempre como dados do usuário, nunca em `catalog`.
- Todos os relatórios mostram `DISCLAIMER`: não substitui projeto estrutural com ART/RRT.

---

## 9. Lacunas e próximos passos (a conferir)
1. Texto oficial do Anexo I da Res. Confea 1.137/2023 e da atualização de dez/2025 (campos exatos e códigos de atividade; modelos A, B, D).
2. Número da resolução que atualizou a 1.137 e data de vigência.
3. Valor RRT 2026 e lista oficial de atividades no SICCAU.
4. Texto da NBR 17076:2024: fórmulas de volume, taxas de infiltração, distâncias, alternância, teste de percolação.
5. Texto da NBR 6492:2021, NBR 10582 e NBR 8196 (vigência), NBR 16636 (títulos das partes 1 a 3).
6. Limiar de obrigatoriedade de projeto elétrico e tabela de padrões de entrada em Cemig (ND-5.1), Copel (NTC), Enel e CPFL.
7. Diretriz SiNAT/DATec para wood frame e para LSF (números e vigência).
8. Checklist atual de prefeituras (SP, Curitiba, BH, Florianópolis) e exigência de fossa.
9. Verificar se há nova edição da NBR 5410 e NBR 6123 (revisão em andamento, a conferir).

## Fontes principais
- Confea, taxas: https://www.confea.org.br/profissional/taxas
- Confea, atualização da 1.137: https://www.confea.org.br/confea-atualiza-regras-de-art-e-acervo-tecnico-e-moderniza-o-sistema
- Confea, GT de reformulação: https://www.confea.org.br/node/230892
- Resolução 1.137/2023 (notícia): https://www.coad.com.br/home/noticias-detalhe/118517/confea-fixa-procedimentos-sobre-art-anotacao-de-responsabilidade-tecnica
- Crea-MT, tabela 2026: https://www.crea-mt.org.br/portal/wp-content/uploads/2026/01/TABELA-DE-SERVICOS-E-ART-2026.pdf
- Crea-SC, valores 2026: https://portal.crea-sc.org.br/anuidades-servicos-multas-e-arts-tem-valores-definidos-para-2026/
- CAU/BR Res. 91/2014: https://www.normasbrasil.com.br/norma/resolucao-91-2014_276004.html
- CAU/BR Res. 166/2018 e 184/2019: https://www.normasbrasil.com.br/norma/resolucao-166-2018_366532.html, https://www.normasbrasil.com.br/norma/resolucao-184-2019_388331.html
- NBR 16970-1/2/3: https://www.normas.com.br/visualizar/abnt-nbr-nm/13380/abnt-nbr16970-1-light-steel-framing-sistemas-construtivos-estruturados-em-perfis-leves-de-aco-formados-a-frio-com-fechamentos-em-chapas-delgadas-parte-1-desempenho
- NBR 15253: https://www.normas.com.br/visualizar/abnt-nbr-nm/24619/abnt-nbr15253-perfis-de-aco-formados-a-frio-com-revestimento-metalico-para-paineis-estruturais-reticulados-em-edificacoes-requisitos-gerais
- NBR 7190-1:2022: https://www.target.com.br/produtos/normas-tecnicas/46004/nbr7190-1-projeto-de-estruturas-de-madeira-parte-1-criterios-de-dimensionamento
- NBR 5444 (catálogo): https://www.normas.com.br/visualizar/abnt-nbr-nm/7854/abnt-nbr5444-simbolos-graficos-para-instalacoes-eletricas-prediais
- NBR 17076:2024 (IFSC): https://repositorio.ifsc.edu.br/items/fb4b10c8-675d-4f4b-a0a3-b727aba16f49
- NBR 17076:2024 (UDESC): https://udesc.br/arquivos/udesc/id_cpmenu/19312/ANLISE_1_17273813706282_19312.pdf
- NBR 10068 (cópia acadêmica): https://docente.ifsc.edu.br/gianpaulo.medeiros/MaterialDidatico/Desenho%20Mecatr%c3%b4nica%20/aula%202/NBR%2010068-Folha%20de%20desenho%20-%20Leiaute%20e%20dimensoes.pdf
- Cemig ND-5.1: https://www.cemig.com.br/wp-content/uploads/2025/10/nd5_1_000001p.pdf
- Curitiba, Decreto 799/2020: https://www.contabeis.com.br/legislacao/5955707/decreto-799-2020/
- MDIC, guia de alvarás: https://www.gov.br/mdic/pt-br/assuntos/sdic/construa-brasil/produtos/22-09-construa-brasil-guia-orientativo-de-boas-praticas-para-obtencao-de-alvaras-de-construcao.pdf
