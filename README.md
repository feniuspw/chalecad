# ChaléCAD

Desenhe um chalé em 3D, de forma paramétrica, e receba na hora a lista de materiais, o peso da estrutura, um pré-dimensionamento com alertas e uma estimativa de custo.

> Estimativa para planejamento. Não substitui projeto estrutural com ART de engenheiro habilitado.

## Rodar local

Pré-requisitos: Node 22+, pnpm 11.

```bash
pnpm install
cp .env.example apps/web/.env.local   # DATA_MODE=sqlite, AI_ENABLED=false
pnpm db:migrate                       # cria apps/web/data/chalecad.sqlite
pnpm dev                              # http://localhost:3000 (modo desenvolvimento)
```

Versão otimizada (abre bem mais rápido): `pnpm app` (build + start em http://localhost:3000).

IA analista: em `apps/web/.env.local`, `AI_ENABLED=true` e `ANTHROPIC_API_KEY=...` (modelo padrão `claude-opus-5-5`, troque com `AI_MODEL`).

## Testes

```bash
pnpm test        # motor, catálogo e app (Vitest)
pnpm typecheck
pnpm lint
pnpm e2e         # Playwright (sobe o app)
```

## Estrutura

- `packages/engine`: motor puro (sem React/Three/Node): schema Zod do projeto, geometria, peças LSF, quantitativos e plano de corte, peso, estrutura (NBR 14762/6120/6123 simplificadas), orçamento, terreno, relatórios.
- `packages/catalog`: perfis, materiais, composições, base de preços (nov/2026) e constantes técnicas.
- `packages/ui`: componentes visuais.
- `apps/web`: Next.js 16 + React Three Fiber; cálculo em Web Worker.

Documentos: `docs/spec.md` (spec), `docs/plan.md` (plano por fase), `docs/decisions.md` (decisões), `docs/tasks/` (cards executados).
