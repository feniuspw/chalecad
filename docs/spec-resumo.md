# ChaléCAD: spec (resumo operacional)

> Versão integral da spec do usuário (Nov 7, 2026, Leonardo Villela Costa) está em `~/Documents/Projects/chalecad/docs/spec.md`. Este resumo cobre o necessário para implementar.

## Visão
App web em que o autoconstrutor desenha um chalé em 3D, de forma paramétrica, e recebe na hora lista de materiais, peso da estrutura, pré-dimensionamento com alertas e estimativa de custo. Uma IA lê esses dados e sugere melhorias. Não substitui projeto estrutural com ART: isso aparece na interface e em todo relatório.

Objetivo: de "tenho uma ideia" para "tenho modelo 3D, lista de compras por fornecedor, orçamento por etapa e pacote para levar ao engenheiro".

## Fases
0. **Fundação:** monorepo, schema Zod, catálogo, cena 3D com grade e câmera. Saída: JSON válido carrega e renderiza um volume.
1. **MVP:** caixa duas águas com mezanino e A-frame; paredes internas, aberturas, escada; quantitativos LSF; radier; telha sanduíche; orçamento com base editável; exportação CSV e PDF. Saída: chalé 6,5 x 8,5 m com mezanino gera lista de materiais em < 300 ms e aço entre 21,9 e 24,7 kg/m².
2. **Estrutura e extras:** motor de peso e cargas, taxas de uso com cores (verde < 0,7 ≤ amarelo ≤ 1,0 < vermelho), meia-água, telhado plano, varanda/deck, muro, cerca, comparação lado a lado de variantes (custo e peso).
3. **IA e dados:** IA analista com tool use (`getProject`, `getQuantities`, `getStructuralReport`, `getBudget`, `proposePatch`, `simulateVariant`), patches JSON aprovados pelo usuário, roteiro de obra, pacote para engenheiro, SINAPI por UF (importação), tipologias gambrel e módulos combinados (L, T). Saída: toda resposta da IA com número cita uma ferramenta.
4. **Terreno inclinado:** inclinação, platô com margens por lado, corte e aterro compensado, volume de terra e destino, talude e muro de arrimo, custo de máquina. Saída: volumes batem com cálculo manual.

## Editor
- Paramétrico primeiro, livre depois: assistente de tipologia → sliders e medidas digitadas → mover objetos no 3D com snap.
- Fluxo: tipologia e dimensões → paredes internas, aberturas, mezanino, escada, beirais → sistema construtivo e camadas → painel lateral em tempo real (área, materiais, peso, custo, alertas) → análise da IA → exportar (PDF com plantas e lista, CSV por fornecedor, JSON).
- Vistas: 3D orbital, planta por nível, cortes e fachadas 2D. Modos: acabado, esqueleto (só perfis), explodido por camadas, mapa de calor de carga (Fase 2).
- Ferramentas: parede interna, abertura, escada (reta, em L, marinheiro), mezanino por polígono, cota, medir.
- Snap em grade de 10 cm e na modulação dos montantes (40/60 cm), com aviso quando abertura corta a modulação de forma ineficiente.
- Undo/redo ilimitado, autosave local, versões nomeadas. pt-BR, metros e reais.

## Quantitativos
Peça por peça a partir dos painéis gerados (não por índice kg/m²; o índice 21,9–24,7 kg/m² é só sanidade com alerta). Pipeline: projeto → painéis → peças com comprimento → plano de corte em barras (bin packing 1D em barras de 3 e 6 m) → placas e insumos → lista de compra. Estrutura LSF com guias, montantes, montantes duplos nos cantos, ombreiras, vergas, montantes de composição, bloqueadores, fitas; mezanino com vigas, sanefa, bloqueadores, OSB 18; cobertura com caibros/tesouras e terças/cartolas; fixações (parafusos, chumbadores por metro de guia, hold-downs). Fechamentos por área líquida com paginação de placas e perda. Radier (área + borda, concreto, tela, lona, brita, forma, tubulações nos pontos marcados). Piso (cimento queimado/polido: endurecedor, selador, juntas). Cobertura (área inclinada, telhas por largura útil 0,98 m, cumeeira, rufos, calhas, parafusos). Extras (muro, cerca, deck). Saída por etapa (fundação, estrutura, fechamento, cobertura, piso, acabamento) com item, unidade de compra, quantidade, perda, peso; cada linha rastreável até as peças no 3D.

## Estrutura (Fase 2)
Nunca "aprovado": só "dentro da faixa usual" ou "precisa de revisão do engenheiro". Peso próprio peça a peça (concreto 2.500 kg/m³). Cargas NBR 6120/6123 (sobrecarga de mezanino e cobertura; vento por V0, categoria, altura: pressão na fachada e sucção no telhado). Caminho de carga telha → terças → caibros → guia → montantes → radier. Verificações simplificadas NBR 14762: montante (compressão com flambagem, flexão por vento, interação), vigas do mezanino e caibros (momento, cortante, flecha L/350 piso, L/250 cobertura), vergas, contraventamento por direção, ancoragem contra arrancamento, pressão no solo x tensão admissível. Vermelho sugere próximo perfil ou espaçamento menor com impacto em custo e peso.

## Orçamento
Lista de compra × base de preços; separa material, mão de obra e frete. Etapas "eu faço" zeram mão de obra. Base editável na interface e importável por CSV; preços > 90 dias como desatualizados. Frete = distância × peso por etapa × R$/t·km. Saídas: total, R$/m², gráfico por etapa, faixa mín/máx, contingência (15%), cronograma de desembolso.

Preços de referência (nov/2026): montante LSF 90x0,95 barra 6 m R$ 112–135; guia 90x0,95 R$ 103–111; montante 140x0,95 R$ 144; 200x0,95 R$ 180; placa cimentícia 10 mm R$ 48/m²; drywall 12,5 placa 1,20x2,40 R$ 89; telha sanduíche EPS 30 R$ 80–160/m²; radier 10–15 cm (SINAPI, material + mão de obra) R$ 188–246/m²; retroescavadeira com operador R$ 1.600–2.600/diária.

## IA
Trabalha sobre resultados dos motores, nunca inventa números; cita só números vindos de ferramentas; patches aprovados pelo usuário; chave no servidor; aviso fixo de ART.

## Stack
TypeScript estrito, pnpm + Turborepo, Next.js App Router, R3F + drei, Zustand + Immer (patches para undo/redo e IA), Zod, Web Worker via Comlink, Tailwind + componentes estilo shadcn, Recharts, Drizzle (SQLite local / Supabase nuvem), @react-pdf/renderer, Anthropic SDK, Vitest, Playwright.

## Critérios gerais
- Mudar parâmetro atualiza 3D, materiais, peso e custo em < 300 ms.
- Clicar numa linha da lista de materiais destaca as peças no 3D.
- Projeto salvo e reaberto reproduz exatamente os mesmos resultados.
- 60 fps no modo esqueleto com 2.000 perfis.
- Aviso de ART na tela de resultados e em todo PDF.
- Motores com testes unitários para cada fórmula.
