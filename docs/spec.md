# ChaléCAD: spec da plataforma de criação de chalés

Nov 7, 2026 · Leonardo Villela Costa

## Visão e escopo

ChaléCAD é uma aplicação web em que o usuário desenha um chalé em 3D, de forma paramétrica, e recebe na hora a lista de materiais, o peso da estrutura, um pré-dimensionamento com alertas e uma estimativa de custo. Uma IA lê esses dados e sugere melhorias.

**Público:** autoconstrutor que quer planejar e orçar antes de contratar engenheiro. A ferramenta não substitui projeto estrutural com ART, e isso aparece na interface e em todo relatório exportado.

**Objetivo final:** sair de "tenho uma ideia" para "tenho um modelo 3D, uma lista de compras por fornecedor, um orçamento por etapa e um pacote para levar ao engenheiro".

**MVP (fase 1):**

- Terreno plano apenas.
- Sistema construtivo Light Steel Frame (LSF), com fundação radier.
- Tipologias: caixa com telhado de duas águas e mezanino, e A-frame.
- Cobertura em telha sanduíche.
- Paredes internas, aberturas e escada. Quantitativos, peso próprio e orçamento em reais, com base de preços editável. Cargas, taxas de uso e alertas estruturais entram na fase 2.

**Fora do escopo do MVP, previsto no roadmap:** terreno em aclive (platô, corte e aterro, talude, muro de arrimo), wood frame e alvenaria, elétrica e hidráulica detalhadas, exportação IFC/DXF, colaboração multiusuário.

**Fora do escopo definitivo:** cálculo estrutural com validade legal, emissão de ART, aprovação na prefeitura.

## Tipologias suportadas

Cada tipologia é um gerador paramétrico: o usuário ajusta parâmetros e o gerador produz a geometria, os painéis e as peças. Toda tipologia sai do mesmo modelo de dados.

| Tipologia | Parâmetros principais | Fase |
| --- | --- | --- |
| Caixa duas águas com mezanino | largura, profundidade, pé-direito, inclinação do telhado (graus ou %), beiral, área e posição do mezanino | 1 |
| A-frame | base, altura da cumeeira (ou ângulo), profundidade, mezanino opcional, empenas abertas ou fechadas | 1 |
| Meia-água (shed) | largura, profundidade, altura baixa e alta, beiral | 2 |
| Caixa com telhado plano | largura, profundidade, pé-direito, platibanda, caimento | 2 |
| Gambrel / celeiro | largura, profundidade, dois ângulos de água | 3 |
| Módulos combinados (L, T) | união de dois volumes com encontro de telhado | 3 |
| Varanda / deck | lado, profundidade, cobertura opcional, guarda-corpo | 2 |
| Muro | comprimento, altura, sistema (bloco de concreto, bloco estrutural, steel frame com placa), fundação (sapata corrida, baldrame) | 2 |
| Cerca | perímetro desenhado, altura, tipo de mourão e espaçamento, tela, mureta de bloco embaixo | 2 |
| Muro de arrimo e talude | altura, tipo (gabião, concreto armado, bloco), drenagem | 4, com terreno inclinado |

Aberturas (portas, janelas, claraboias) são objetos posicionados em qualquer parede ou água de telhado e alteram painéis, vergas e ombreiras.

## Editor 3D e fluxo do usuário

O editor é paramétrico primeiro e livre depois: o usuário parte de uma tipologia, ajusta por sliders e medidas digitadas, e só então move objetos no 3D com snap.

**Fluxo:**

1. Escolhe a tipologia e as dimensões básicas num assistente.
2. Ajusta no editor: paredes internas, aberturas, mezanino, escada, beirais.
3. Escolhe o sistema construtivo e as camadas de cada parede (externa, interna, área molhada).
4. Vê o painel lateral atualizar em tempo real: área, materiais, peso, custo e alertas.
5. Pede a análise da IA.
6. Exporta: PDF com plantas e lista de materiais, CSV por fornecedor, JSON do projeto.

**Funcionalidades do editor:**

- Vistas: 3D orbital, planta por nível (térreo, mezanino, cobertura), cortes e fachadas em 2D.
- Modos de visualização: acabado, esqueleto (só perfis de aço), explodido por camadas, mapa de calor de carga (este na fase 2, junto com o motor estrutural).
- Ferramentas: desenhar parede interna, inserir abertura, escada (reta, em L, marinheiro), mezanino por polígono, cota, medir.
- Snap em grade de 10 cm e na modulação dos montantes (40 ou 60 cm), com aviso quando uma abertura corta a modulação de forma ineficiente.
- Undo/redo ilimitado, autosave local e versões nomeadas.
- Comparação lado a lado de duas variantes (ex.: duas águas x A-frame) com diferença de custo e peso (fase 2).
- Unidades em metros e reais, com idioma pt-BR padrão.

## Modelo de dados

O projeto é um único JSON versionado, validado por schema (Zod). A geometria 3D, os quantitativos e o orçamento são derivados dele por funções puras, nunca salvos como fonte de verdade.

```json
{
  "schemaVersion": 1,
  "meta": { "name": "Chalé São Lourenço", "region": "MG", "currency": "BRL" },
  "site": { "type": "flat" },
  "typology": {
    "kind": "gable_mezzanine",
    "width": 6.5, "depth": 8.5, "wallHeight": 2.8,
    "roofPitchDeg": 35, "eave": 0.6
  },
  "system": {
    "structure": "lsf",
    "studSpacing": 0.6,
    "profiles": { "wallStud": "Ue90x40x0.95", "joist": "Ue200x40x1.25", "rafter": "Ue140x40x0.95" },
    "foundation": { "kind": "radier", "thickness": 0.12 }
  },
  "levels": [
    { "id": "L0", "elevation": 0, "floor": "burnished_concrete" },
    { "id": "L1", "elevation": 2.8, "polygon": [[0,5],[6.5,5],[6.5,8.5],[0,8.5]], "deck": "osb18", "guardrail": true }
  ],
  "walls": [
    { "id": "w1", "level": "L0", "from": [0,0], "to": [6.5,0], "assembly": "ext_cement_osb_wool_drywall" }
  ],
  "openings": [
    { "id": "o1", "wall": "w1", "type": "door", "offset": 2.0, "width": 0.9, "height": 2.1 }
  ],
  "stairs": [ { "id": "s1", "type": "straight", "from": "L0", "to": "L1", "position": [0.2,3.0], "rotationDeg": 90 } ],
  "roof": { "cladding": "sandwich_eps30", "ridgeAxis": "depth" },
  "extras": [ { "kind": "fence", "path": [[-5,-5],[15,-5],[15,15],[-5,15]], "height": 2.5 } ],
  "priceBookId": "default-2026-11"
}
```

**Catálogos separados do projeto:**

- `assemblies`: composição de cada parede, piso e cobertura em camadas, com espessura e consumo por m² (ex.: placa cimentícia 10 mm, membrana, OSB 11,1 mm, lã de PET 50 mm, drywall 12,5 mm).
- `profiles`: perfis de aço com alma, mesa, espessura, massa por metro e propriedades de seção.
- `materials`: peso específico, unidade de compra (barra 6 m, placa 1,20 x 2,40 m, m³, saco), perda padrão.
- `priceBooks`: preço por item, data, fonte e região.

## Motor de quantitativos

O motor conta peça por peça a partir dos painéis gerados, não por índice de kg/m². O índice (21,9 a 24,7 kg de aço por m² em residências LSF) só serve como teste de sanidade: fora dessa faixa, o app mostra um alerta.

**Pipeline:** projeto JSON → painéis (paredes, pisos, tesouras) → peças com comprimento → plano de corte em barras → consumo de placas e insumos → lista de compra.

**Estrutura LSF:**

- Cada parede vira um painel com guia superior e inferior, montantes na modulação, montantes duplos nos cantos e encontros, ombreiras, vergas e montantes de composição nas aberturas, bloqueadores e fita de travamento.
- Mezanino: vigas de piso no vão, sanefa, bloqueadores, OSB 18 mm.
- Cobertura: tesouras ou caibros conforme a tipologia, terças ou cartolas no espaçamento da telha sanduíche.
- Plano de corte: bin packing 1D em barras de 3 m e 6 m, minimizando sobra. Mostra sobra total e quantidade de barras.
- Fixação: parafusos perfil-perfil, placa-perfil, chumbadores ou parabolts no radier por metro de guia inferior, conectores (hold-downs) nas extremidades de painéis.

**Fechamentos:** área líquida por face (descontando aberturas) → placas inteiras com paginação no tamanho de compra e perda configurável → juntas, fita, massa, membrana, lã isolante.

**Fundação radier:** área da projeção + borda, volume de concreto, tela soldada, lona, brita, forma de borda, tubulações embutidas (pontos de esgoto e água marcados no projeto).

**Piso:** cimento queimado ou polido sobre o radier: área, endurecedor, selador, juntas de dilatação.

**Cobertura:** área inclinada real, número de telhas por comprimento de água (largura útil 0,98 m), cumeeira, rufos, calhas, parafusos com vedação.

**Extras:** muro (blocos, graute, ferro, sapata corrida), cerca (mourões, tela, mureta), deck.

**Saída:** tabela por etapa (fundação, estrutura, fechamento, cobertura, piso, acabamento) com item, unidade de compra, quantidade, perda aplicada e peso. Cada linha é rastreável até a peça no 3D (clique na linha destaca as peças).

## Peso e pré-dimensionamento estrutural

O motor estrutural faz verificações simplificadas para orientar o desenho e gerar alertas. Ele nunca declara a estrutura "aprovada": o resultado é sempre "dentro da faixa usual" ou "precisa de revisão do engenheiro".

**Peso próprio:** soma de cada peça e camada (massa por metro dos perfis, kg/m² das placas, densidade do concreto 2.500 kg/m³). Mostra peso por elemento e total.

**Cargas (referência NBR 6120 e NBR 6123, valores configuráveis):**

- Permanentes: peso próprio calculado.
- Sobrecarga de uso: mezanino residencial e cobertura.
- Vento: velocidade básica por região (V0), categoria de terreno, altura. Gera pressão na fachada e sucção no telhado, o caso que costuma governar estruturas leves.

**Caminho de carga:** telha → terças → tesouras/caibros → guia superior → montantes → guia inferior → radier. O mezanino descarrega nas paredes de apoio. O app desenha esse caminho no modo "mapa de calor".

**Verificações simplificadas (NBR 14762, perfis formados a frio):**

- Montante: compressão axial com flambagem, flexão por vento, interação.
- Vigas do mezanino e caibros: momento, cortante e flecha (limite L/350 piso, L/250 cobertura, configurável).
- Vergas: vão da abertura x perfil escolhido.
- Contraventamento: exige OSB estrutural ou fitas em X nas paredes; alerta se a soma de paredes contraventadas por direção for baixa.
- Ancoragem: força de arrancamento por vento x ancoragens previstas.
- Radier: pressão média no solo x tensão admissível informada pelo usuário (padrão conservador quando não há sondagem).

**Saída:** cada elemento recebe uma taxa de uso (solicitação / resistência) e uma cor: verde abaixo de 0,7, amarelo de 0,7 a 1,0, vermelho acima de 1,0. Vermelho sugere o próximo perfil ou espaçamento menor, com o impacto em custo e peso.

**Implementação:** funções puras em TypeScript num pacote separado (`@chalecad/engine`), com testes contra exemplos resolvidos de literatura e casos validados por engenheiro antes de liberar a fase.

## Orçamento e base de preços

O orçamento multiplica a lista de compra pela base de preços ativa e separa material, mão de obra e frete. O usuário pode marcar etapas como "eu faço" para zerar a mão de obra delas.

**Base de preços:**

- Preço por item com unidade de compra, data, fonte (loja, SINAPI, cotação manual) e UF.
- Editável na interface e importável por CSV. O usuário pode colar a cotação do fornecedor.
- Preços com mais de 90 dias aparecem como desatualizados.
- Fase 3: atualização semiautomática a partir do SINAPI mensal por UF.

**Valores iniciais da base (referência nov/2026, a revisar):**

| Item | Unidade | Preço de referência |
| --- | --- | --- |
| Montante LSF 90 x 0,95 mm | barra 6 m | R$ 112 a 135 |
| Guia LSF 90 x 0,95 mm | barra 6 m | R$ 103 a 111 |
| Montante LSF 140 x 0,95 mm | barra 6 m | R$ 144 |
| Montante LSF 200 x 0,95 mm | barra 6 m | R$ 180 |
| Placa cimentícia 10 mm | m² | R$ 48 |
| Drywall 12,5 mm | placa 1,20 x 2,40 m | R$ 89 |
| Telha sanduíche EPS 30 mm | m² | R$ 80 a 160 |
| Radier 10 a 15 cm (material e mão de obra, SINAPI) | m² | R$ 188 a 246 |
| Retroescavadeira com operador | diária | R$ 1.600 a 2.600 |

**Frete:** distância do fornecedor ao terreno x peso total por etapa (o motor de peso já fornece). Faixa de preço por tonelada-km configurável.

**Saídas:** total e R$/m², gráfico por etapa, faixa mínimo/máximo quando o preço é faixa, contingência configurável (padrão 15%), cronograma de desembolso se o usuário informar a duração das etapas.

## IA analista

A IA trabalha sobre os resultados calculados pelos motores, nunca inventa números. Ela recebe o JSON do projeto, os quantitativos, as taxas de uso estruturais e o orçamento, e responde com análise e propostas de alteração.

**Capacidades:**

- Revisão do projeto: aponta elementos amarelos e vermelhos, desperdício de corte, aberturas fora da modulação, paredes sem contraventamento.
- Otimização de custo: propõe variantes (espaçamento 40 x 60 cm, outra inclinação, mezanino menor) e o app recalcula cada uma com o motor real antes de mostrar.
- Perguntas em linguagem natural: "quanto economizo trocando placa cimentícia por OSB com siding?", "o que mais pesa no orçamento?".
- Edição por comando: "aumenta o mezanino em 1 m" vira um patch JSON que o usuário aprova antes de aplicar.
- Roteiro de obra para autoconstrutor: sequência de montagem por painel, ferramentas, lista do que comprar primeiro.
- Pacote para o engenheiro: resumo das premissas, cargas, pontos de atenção e perguntas abertas.

**Implementação:**

- API da Anthropic (Claude) com tool use. Ferramentas expostas ao modelo: `getProject`, `getQuantities`, `getStructuralReport`, `getBudget`, `proposePatch`, `simulateVariant`.
- `simulateVariant` roda o motor real e devolve o resultado; a IA só cita números vindos de ferramentas.
- Chamada feita pelo backend, com chave no servidor e limite de uso por usuário.
- Resposta com aviso fixo de que não substitui projeto estrutural com ART.

## Stack e arquitetura

TypeScript de ponta a ponta, monorepo, com o motor de cálculo num pacote isolado que roda igual no navegador e no servidor. O app recalcula em tempo real sem depender da rede.

[Diagrama de arquitetura: Navegador (Editor 3D React + R3F; Motores em Web Worker com @chalecad/engine; Autosave IndexedDB) <-> HTTPS <-> Servidor (API Next.js; Postgres/Supabase; IA analista via Claude API com tool use)]

O editor manda o JSON do projeto ao Web Worker e recebe geometria, quantitativos, estrutura e orçamento; o servidor só persiste dados e intermedeia a IA.

| Camada | Escolha | Motivo |
| --- | --- | --- |
| Linguagem | TypeScript estrito | um tipo para o modelo em todo o sistema |
| Monorepo | pnpm workspaces + Turborepo | `apps/web`, `packages/engine`, `packages/catalog`, `packages/ui` |
| Front-end | Next.js (App Router) + React | rotas, SSR da landing, route handlers como API |
| 3D | Three.js via React Three Fiber + drei | ecossistema maduro, instancing para milhares de perfis |
| Geometria | three-bvh-csg para recortes de aberturas | booleanas em tempo real |
| Estado | Zustand + Immer, com patches para undo/redo | patches JSON reaproveitados pela IA |
| Validação | Zod | schema do projeto e dos catálogos |
| Cálculo | Web Worker via Comlink | não trava a interface |
| UI | Tailwind + shadcn/ui | painéis, formulários, tabelas |
| Gráficos | Recharts | orçamento por etapa |
| Banco e auth | Supabase (Postgres, Auth, Storage), acessado via Drizzle ORM | rápido de subir, RLS por usuário |
| PDF | @react-pdf/renderer | plantas 2D em SVG e listas |
| IA | Anthropic SDK com tool use | análise e patches aprovados pelo usuário |
| Testes | Vitest (motores), Playwright (fluxos) | motores com cobertura alta |
| Deploy | Vercel + Supabase | custo baixo no início |

**Regras de arquitetura:**

- `packages/engine` não importa React, Three.js nem nada de browser. Entrada e saída em JSON serializável.
- Toda constante técnica (perdas, cargas, limites de flecha) vem de `packages/catalog`, versionada, nunca fixa no código.
- A renderização usa instancing por tipo de perfil para manter 60 fps com 2.000+ peças.

### Opção para rodar 100% local

O mesmo código roda local ou na nuvem trocando só variáveis de ambiente. Isso funciona porque todo acesso a dados passa por Drizzle ORM e por uma interface `StorageAdapter`, nunca pelo SDK do Supabase direto nos componentes.

| Camada | Nuvem | Local (recomendado para começar) | Local mínimo |
| --- | --- | --- | --- |
| Banco | Supabase Postgres | Supabase CLI (`supabase start`, sobe Postgres, Auth e Storage em Docker) | SQLite em arquivo via Drizzle |
| Login | Supabase Auth | Supabase Auth local | sem login, usuário único |
| Arquivos (PDF, imagens) | Supabase Storage | Supabase Storage local | pasta `./data/files` |
| IA | Anthropic API | Anthropic API (precisa de internet e `ANTHROPIC_API_KEY`) | IA desligada por flag |
| App | Vercel | `pnpm dev` em localhost:3000 | `pnpm dev` |

**Pré-requisitos locais:** Node 22 LTS, pnpm 9, Docker Desktop (só para a coluna Supabase CLI), Git.

**Subir local:**

```bash
pnpm install
supabase start              # ou pule e use DATA_MODE=sqlite
cp .env.example .env.local  # DATA_MODE=supabase|sqlite, AI_ENABLED=true|false
pnpm db:migrate
pnpm dev
```

O motor de cálculo não depende de nada disso: `pnpm --filter @chalecad/engine test` roda sem banco, sem rede e sem navegador.

## Desenvolvimento com agentes

O desenvolvimento roda no Claude Code com uma sessão principal em **Opus 5.5** (`claude-opus-5-5`), que pensa, quebra a spec, escreve os contratos e revisa. A sessão lança no máximo **3 subagents Sonnet** em paralelo para executar. O Opus não escreve features grandes, e os subagents não decidem arquitetura.

**Preparação do repositório:**

1. Exporte este doc em Markdown e salve como `docs/spec.md`.
2. Crie `CLAUDE.md` na raiz com as regras de arquitetura desta spec e os comandos `pnpm test`, `pnpm typecheck` e `pnpm lint`.
3. Crie o subagent em `.claude/agents/implementer.md` (ver arquivo no repositório).

**Ciclo de trabalho por fase:**

1. **Planejar (Opus):** lê `docs/spec.md` e escreve `docs/plan.md` com a fase quebrada em tarefas de 1 a 4 horas, dependências entre elas e quais podem rodar em paralelo. Para e pede seu ok.
2. **Contratar (Opus):** antes de qualquer paralelismo, escreve ele mesmo os tipos e schemas Zod compartilhados e as fixtures JSON de teste. Contrato é o que permite 3 agentes trabalharem sem se pisar.
3. **Escrever cards (Opus):** cada tarefa vira `docs/tasks/F1-T03.md` com objetivo, arquivos que pode alterar, entradas e saídas (tipos), testes de aceite e o que está fora do escopo.
4. **Executar (até 3 Sonnet):** o Opus escolhe até 3 cards sem dependência entre si e sem arquivo em comum, e lança um subagent `implementer` por card, cada um no seu git worktree.
5. **Revisar e integrar (Opus):** lê cada diff, roda a suíte completa, faz merge e marca o card como feito no `plan.md`. Falhou: devolve ao subagent com o erro, no máximo 2 tentativas, depois assume ou replaneja.
6. **Fechar a fase:** o Opus confere os critérios de saída do roadmap, roda o app e para pedindo seu ok antes da próxima fase.

**Regras de paralelismo:**

- Nunca 2 subagents no mesmo pacote ao mesmo tempo.
- Schema, catálogo e `CLAUDE.md` só mudam pela sessão Opus.
- Um commit por card, com o ID no título.
- Tarefa com dúvida de requisito volta para o Opus, que pergunta a você.

**Exemplo de primeira rodada paralela (Fase 1):**

| Subagent | Card | Pacote |
| --- | --- | --- |
| Sonnet 1 | Gerador de painéis de parede LSF a partir do JSON | `packages/engine` |
| Sonnet 2 | Cena 3D que renderiza painéis a partir de uma fixture | `apps/web` |
| Sonnet 3 | Catálogo de perfis, materiais e base de preços inicial | `packages/catalog` |

## Roadmap, critérios de aceite

Cada fase só começa quando a anterior passa no seu critério de saída.

1. **Fase 0, fundação:** monorepo, schema Zod do projeto, catálogo de perfis e materiais, cena 3D vazia com grade e câmera.
   - Saída: um JSON válido carrega e renderiza um volume simples.
2. **Fase 1, MVP:** caixa duas águas com mezanino e A-frame, paredes internas, aberturas, escada, quantitativos LSF, radier, telha sanduíche, orçamento com base editável, exportação CSV e PDF.
   - Saída: chalé de 6,5 x 8,5 m com mezanino gera lista de materiais em menos de 300 ms e consumo de aço dentro da faixa de 21,9 a 24,7 kg/m².
3. **Fase 2, estrutura e extras:** motor de peso e cargas, taxas de uso com cores, meia-água, telhado plano, varanda, muro e cerca, comparação de variantes.
   - Saída: casos de teste revisados por engenheiro passam com erro abaixo de 10%.
4. **Fase 3, IA e dados:** IA analista com tool use, patches aprovados, roteiro de obra, pacote para engenheiro, SINAPI por UF, tipologias gambrel e módulos combinados (L, T).
   - Saída: toda resposta da IA com número cita uma ferramenta.
5. **Fase 4, terreno inclinado:** curvas de nível ou inclinação, platô com margens por lado, corte e aterro compensado, volume de terra e destino, talude e muro de arrimo, custo de máquina.
   - Saída: volumes de corte batem com cálculo manual em terrenos de teste.

**Critérios de aceite gerais:**

- [ ] Mudar qualquer parâmetro atualiza 3D, materiais, peso e custo em menos de 300 ms.
- [ ] Clicar numa linha da lista de materiais destaca as peças no 3D.
- [ ] Projeto salvo e reaberto reproduz exatamente os mesmos resultados.
- [ ] 60 fps no modo esqueleto com 2.000 perfis num notebook comum.
- [ ] Aviso de "não substitui projeto com ART" na tela de resultados e em todo PDF.
- [ ] Motores com testes unitários para cada fórmula.
