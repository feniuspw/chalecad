# Plano

## Fase 0 — fundação ✅
- [x] F0-T01 scaffold do monorepo
- [x] F0-T02/T03 contratos (schema do projeto v1, resultados do motor, schema do catálogo), fixtures
- [x] F0-T04 dados do catálogo
- [x] F0-T05 loadProject e buildModel
- [x] F0-T06 cena 3D e casca visual (landing, editor, componentes de UI)
- [x] F0-T07 integração JSON → Worker → cena (absorvido pelo F1-W1)

## Fase 1 — MVP
Fluxos paralelos: motor (E) e editor (W).
- [x] F1-E1 gerador de peças LSF
- [x] F1-E2 quantitativos, plano de corte e peso
- [x] F1-E3 orçamento, alertas e computeAll (depois de E1+E2)
- [x] F1-W1 store, Worker, autosave, assistente, propriedades
- [x] F1-W2 painel de resultados e CSV (depois de W1)
- [x] F1-W3 ferramentas de edição, planta 2D, esqueleto, explodido (depois de W1)
- [x] F1-W4 SQLite, projetos, versões, PDF (depois de W1)
- [x] Fechamento: 6,5 x 8,5 em < 300 ms, aço 21,9–24,7 kg/m²

## Fase 2 — estrutura e extras
- [x] F2-E1 motor estrutural
- [x] F2-E2 meia-água, telhado plano, deck, muro, cerca
- [x] F2-W* mapa de calor, aba Estrutura, extras no editor, comparação de variantes

## Fase 3 — IA e dados
- [x] F3-E1 gambrel, módulos L/T, roteiro de obra, pacote do engenheiro
- [x] F3-W* IA analista (tool use, patches), SINAPI CSV

## Fase 4 — terreno inclinado
- [x] F4-E1 platô, corte/aterro, taludes, arrimo, máquinas
- [x] F4-W* terreno no 3D e no assistente

## Fase 5 — modo de edição e apresentação
- [x] F5-E1/W1 cômodos, verificações por cômodo, acabamentos com texturas procedurais
- [x] F5-W2 modo apresentação (sol real, céu, sombras, pós-processamento, primeira pessoa, imagem)

## Fase 6 — móveis
- [x] F6-E1 móveis no motor (circulação, porta, teto baixo, água) e ventilação pela área que abre
- [x] F6-W1 biblioteca, arrastar e soltar, 3D procedural, Mobiliar
- [x] F6-W2 acabamento visual (fachada por fora, estrelas, escadas no passeio)

## Fase 7 — instalações e documentação técnica
- [x] F7-E1/W1 instalações elétricas e hidráulicas estimadas
- [x] F7-W2 exportação DXF

## Fase 8 — wood frame, primeiros passos e obra
- [x] F8-E1/W1 wood frame (NBR 7190)
- [x] F8-W2 modelos prontos, tour e atalhos
- [x] F8-W3 aba Obra (cronograma e compras)

## Fase 9 — desempenho
- [x] F9-E1/W1 térmico (NBR 15575), solar fotovoltaico e água de chuva

## Fase 10 — compartilhar e qualidade
- [x] F10-W1 página Ver projeto (somente leitura)
- [x] F10-W2 e2e dos fluxos novos

## Fase 11 — assistente para leigos
- [x] F11-E1 torre da caixa d'água e pressão (NBR 5626)
- [x] F11-W1 assistente "Me ajude a montar" e torre no editor

## Fase 12 — usabilidade e realismo
- [x] F12-W2 glossário, alertas explicados, busca nas propriedades
- [x] painéis recolhíveis, mão de obra regional
- [x] F12-W1 renderização realista procedural

## Fase 13 — qualidade do assistente e apresentação
- [x] F13-W1 assistente gera chalés dentro das verificações; modelos prontos conformados
- [x] F13-W2 vistas prontas, fotos em lote e vídeo 360°

## Fechamento (2026-11-07)
- Critérios de saída verificados: JSON válido carrega e renderiza (F0); chalé 6,5 x 8,5 calcula tudo em ~3 ms (< 300 ms) (F1); verificações estruturais com taxas e cores, extras, meia-água, telhado plano e comparação de variantes (F2); IA com tool use citando ferramentas, gambrel e L/T, roteiro e pacote do engenheiro (F3); terreno com corte/aterro testado contra cálculo manual (F4).
- Pendências conhecidas: índice de aço do exemplo (~15,5 kg/m²) abaixo da faixa 21,9–24,7 da spec (ver decisions.md #11); validação estrutural por engenheiro não feita; IA não testada com chave real; importação automática do SINAPI não implementada (importação de preços por CSV sim); Supabase não configurado (modo local SQLite).

## Fase 17 — aprovação legal e documentação para ART/RRT
- [ ] F17-E1 relatório de aprovação (verificação normativa, índices urbanísticos, quadro de áreas, ART/RRT, pranchas, memoriais)
- [ ] F17-W1 pranchas ABNT com carimbo, arquitetura (situação, implantação, plantas, cortes, fachadas, cobertura) e PDF vetorial
- [ ] F17-W2 conteúdos das pranchas de engenharia (fundação, estrutura, elétrica, hidrossanitária)
- [ ] F17-W3 tela Aprovação (dados legais, lote, verificação com parecer, ficha ART/RRT, memoriais, pacote .zip)
