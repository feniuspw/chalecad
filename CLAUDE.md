# ChaléCAD

Editor web paramétrico de chalés em 3D (LSF, radier, telha sanduíche) com quantitativos, peso, pré-dimensionamento e orçamento. Spec: `docs/spec.md`. Decisões: `docs/decisions.md`. Plano: `docs/plan.md`. Cards: `docs/tasks/<ID>.md`.

## Comandos

```bash
pnpm install
pnpm dev                                   # apps/web em localhost:3000
pnpm test                                  # Vitest em todos os pacotes (Turborepo)
pnpm typecheck                             # tsc --noEmit em todos os pacotes
pnpm lint                                  # ESLint
pnpm --filter @chalecad/engine test        # motor isolado: sem banco, rede ou navegador
pnpm e2e                                   # Playwright (apps/web)
```

Ambiente local: `DATA_MODE=sqlite` e `AI_ENABLED=false` (ver `.env.example`).

## Estrutura

- `apps/web`: Next.js 16 (App Router) + React Three Fiber + drei, Zustand + Immer, Tailwind 4, Comlink (Web Worker).
- `packages/engine`: `@chalecad/engine`. Schema Zod do projeto (`src/schema`) e funções puras: `buildModel`, `generatePieces`, quantitativos, peso, estrutura, orçamento, terreno, `computeAll`.
- `packages/catalog`: `@chalecad/catalog`. Perfis, materiais, assemblies, base de preços e constantes técnicas versionadas.
- `packages/ui`: `@chalecad/ui`. Componentes visuais compartilhados (estilo shadcn).

## Regras de arquitetura

- O projeto é um único JSON versionado (`schemaVersion`), validado por Zod. Geometria, quantitativos e orçamento são derivados por funções puras, nunca salvos como fonte de verdade.
- `packages/engine` e `packages/catalog` não importam React, Three.js, Node nem nada de browser. Entrada e saída em JSON serializável.
- Toda constante técnica (perdas, cargas, limites de flecha, densidades) vem de `packages/catalog`. Nunca fixa no código do motor.
- Cálculo roda em Web Worker via Comlink.
- Renderização com instancing por tipo de perfil (meta: 60 fps com 2.000+ peças).
- Acesso a dados só via Drizzle ORM e a interface `StorageAdapter`.
- Coordenadas do motor: [x, y, z] com z para cima; a cena converte para y-up em `apps/web/lib/three/convert.ts`.
- Unidades internas: metros, graus, kg, BRL. Interface em pt-BR.
- Todo resultado/relatório mostra o aviso de que não substitui projeto estrutural com ART (`DISCLAIMER` em `@chalecad/engine`).
- TypeScript estrito (`strict`, `noUncheckedIndexedAccess`).

## Regras de colaboração (orquestrador + subagents)

- Schemas (`packages/engine/src/schema`, `packages/catalog/src/schema.ts`) e este arquivo só mudam pela sessão orquestradora.
- Subagent `implementer` executa exatamente um card e só toca os arquivos listados em "Pode alterar".
- Um commit por card, com o ID no título (ex.: `F1-E1: gerador de peças LSF`).
- Antes de terminar qualquer card: `pnpm typecheck` e testes do pacote verdes.
