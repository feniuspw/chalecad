# ChaléCAD

Parametric 3D web editor for chalets (LSF, radier (raft slab), sandwich roof panel) with quantity takeoff, weight, preliminary sizing, and cost estimate. Spec: `docs/spec.md`. Decisions: `docs/decisions.md`. Plan: `docs/plan.md`. Cards: `docs/tasks/<ID>.md`.

## Commands

```bash
pnpm install
pnpm dev                                   # apps/web at localhost:3000
pnpm test                                  # Vitest in all packages (Turborepo)
pnpm typecheck                             # tsc --noEmit in all packages
pnpm lint                                  # ESLint
pnpm --filter @chalecad/engine test        # engine in isolation: no database, network, or browser
pnpm e2e                                   # Playwright (apps/web)
```

Local environment: `DATA_MODE=sqlite` and `AI_ENABLED=false` (see `.env.example`).

## Structure

- `apps/web`: Next.js 16 (App Router) + React Three Fiber + drei, Zustand + Immer, Tailwind 4, Comlink (Web Worker).
- `packages/engine`: `@chalecad/engine`. Project Zod schema (`src/schema`) and pure functions: `buildModel`, `generatePieces`, quantity takeoff, weight, structure, cost estimate, terrain, `computeAll`.
- `packages/catalog`: `@chalecad/catalog`. Profiles, materials, assemblies, price base, and versioned technical constants.
- `packages/ui`: `@chalecad/ui`. Shared visual components (shadcn style).

## Architecture rules

- The project is a single versioned JSON (`schemaVersion`), validated by Zod. Geometry, quantity takeoff, and cost estimate are derived by pure functions, never saved as the source of truth.
- `packages/engine` and `packages/catalog` do not import React, Three.js, Node, or anything browser-specific. Input and output are serializable JSON.
- Every technical constant (losses, loads, deflection limits, densities) comes from `packages/catalog`. Never hard-coded in the engine.
- Calculation runs in a Web Worker via Comlink.
- Rendering uses instancing per profile type (target: 60 fps with 2,000+ pieces).
- Data access only via Drizzle ORM and the `StorageAdapter` interface.
- Engine coordinates: [x, y, z] with z up; the scene converts to y-up in `apps/web/lib/three/convert.ts`.
- Internal units: meters, degrees, kg, BRL. UI in Brazilian Portuguese (pt-BR).
- Every result/report shows the notice that it does not replace a structural design with an ART (Anotação de Responsabilidade Técnica, the engineer's liability record) (`DISCLAIMER` in `@chalecad/engine`).
- Strict TypeScript (`strict`, `noUncheckedIndexedAccess`).

## Collaboration rules (orchestrator + subagents)

- Schemas (`packages/engine/src/schema`, `packages/catalog/src/schema.ts`) and this file only change through the orchestrator session.
- The `implementer` subagent executes exactly one card and only touches the files listed under "Pode alterar" (Allowed changes).
- One commit per card, with the ID in the title (e.g., `F1-E1: gerador de peças LSF`).
- Before finishing any card: `pnpm typecheck` and the package's tests green.
