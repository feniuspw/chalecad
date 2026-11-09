# ChaléCAD

Editor web paramétrico de chalés em 3D (light steel frame ou wood frame, radier, telha sanduíche). Você desenha a casa e recebe na hora:

- a lista de materiais com o plano de corte;
- o peso da estrutura;
- um pré-dimensionamento com alertas;
- o orçamento;
- a documentação para aprovação.

> Estimativa para planejamento. Não substitui projeto estrutural com ART de engenheiro habilitado.

## O que faz

- **Modelagem 3D paramétrica.** Tipologias:
  - duas águas com mezanino, A-frame, meia-água, telhado plano e gambrel;
  - plantas em L/T e anexos.
  Inclui cômodos, aberturas, escadas e móveis. Há planta 2D, vista explodida e mapa de calor da estrutura.
- **Motor puro em TypeScript** (`@chalecad/engine`): peças LSF e wood frame, quantitativos, peso, verificações estruturais simplificadas (NBR 14762, 6120, 6123 e 7190), orçamento com mão de obra regional, cronograma e compras.
- **Terreno inclinado:** platô, corte e aterro, taludes, muros de arrimo, máquinas e caminhões.
- **Extras:** deck, muro, cerca e torre da caixa d'água.
- **Instalações estimadas:**
  - elétrica: pontos, circuitos, quadro e unifilar (NBR 5410);
  - hidrossanitária: água fria, esgoto e fossa (NBR 5626 e 8160).
- **Desempenho:** térmico (NBR 15575), solar fotovoltaico e água de chuva.
- **Aprovação legal:**
  - verificação normativa com parecer do profissional;
  - índices urbanísticos (TO, CA, permeabilidade, recuos);
  - ficha para ART (CREA) e RRT (CAU);
  - memoriais;
  - pranchas ABNT com carimbo em PDF vetorial e DXF;
  - pacote .zip para a prefeitura.
- **Apresentação:** sol real pela localização, céu, sombras, renderização realista com texturas CC0, primeira pessoa, fotos em lote e vídeo 360°.
- **Para leigos:** assistente "Me ajude a montar", modelos prontos, tour, glossário e alertas explicados.
- **IA analista** (opcional): lê o projeto e propõe mudanças (Claude, via tool use).

## Rodar local

Pré-requisitos: Node 22+ e pnpm 11.

```bash
pnpm install
cp .env.example apps/web/.env.local   # DATA_MODE=sqlite, AI_ENABLED=false
pnpm db:migrate                       # cria apps/web/data/chalecad.sqlite
pnpm dev                              # http://localhost:3000 (modo desenvolvimento)
```

Para a versão otimizada, que abre bem mais rápido, use `pnpm app` (build + start em http://localhost:3000).

Para ligar a IA analista, defina em `apps/web/.env.local`:
- `AI_ENABLED=true`;
- `ANTHROPIC_API_KEY=...`.

O modelo padrão é `claude-opus-5-5`; troque com `AI_MODEL`.

## Testes

```bash
pnpm test        # motor, catálogo e app (Vitest)
pnpm typecheck
pnpm lint
pnpm e2e         # Playwright (sobe o app)
```

## Estrutura

- `packages/engine`: motor puro, sem React, Three ou Node. Tem o schema Zod do projeto, geometria, peças, quantitativos, peso, estrutura, orçamento, terreno, instalações, desempenho, aprovação e relatórios. O projeto é um único JSON versionado; tudo o mais é derivado por funções puras.
- `packages/catalog`: perfis, materiais, composições, base de preços (nov/2026) e constantes técnicas versionadas.
- `packages/ui`: componentes visuais.
- `apps/web`: Next.js 16, React Three Fiber, Zustand e Tailwind 4. O cálculo roda em Web Worker (Comlink).

## Documentos

- `docs/spec.md`: especificação.
- `docs/plan.md`: plano por fase.
- `docs/decisions.md`: decisões.
- `docs/research/`: pesquisas (normas, aprovação).
- `docs/tasks/`: cards executados.

As texturas são da Poly Haven (CC0): veja `apps/web/public/textures/LICENSE.md`.
