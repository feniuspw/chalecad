# ChaléCAD

Parametric 3D web editor for chalets (light steel frame or wood frame, radier (raft slab), sandwich roof panel). You draw the house and instantly get:

- the bill of materials with the cutting plan;
- the weight of the structure;
- a preliminary sizing with alerts;
- the cost estimate;
- the documentation for approval.

> Planning estimate. It does not replace a structural design with an ART (Anotação de Responsabilidade Técnica, the engineer's liability record) from a licensed engineer.

## What it does

- **Parametric 3D modeling.** Typologies:
  - gable roof with mezzanine (loft), A-frame, shed roof, flat roof, and gambrel;
  - L/T-shaped floor plans and annexes.
  Includes rooms, openings, stairs, and furniture. There is a 2D floor plan, an exploded view, and a structure heat map.
- **Pure TypeScript engine** (`@chalecad/engine`): LSF and wood frame pieces, quantity takeoff, weight, simplified structural checks (NBR 14762, 6120, 6123, and 7190), cost estimate with regional labor, schedule, and purchasing.
- **Sloped terrain:** building pad, cut and fill, slopes/embankments, retaining walls, machines, and trucks.
- **Extras:** deck, wall, fence, and water tank tower.
- **Estimated utilities:**
  - electrical: points, circuits, distribution board, and single-line diagram (NBR 5410);
  - plumbing and sewage: cold water, sewage, and septic tank (NBR 5626 and 8160).
- **Performance:** thermal (NBR 15575), solar photovoltaic, and rainwater harvesting.
- **Legal approval:**
  - code compliance check with the professional's review;
  - zoning indices (TO, CA, permeability, setbacks);
  - ART (CREA) and RRT (CAU; the architect's equivalent) forms;
  - descriptive specifications (memoriais);
  - ABNT drawing sheets (pranchas) with title block (carimbo) in vector PDF and DXF;
  - .zip package for the city hall.
- **Presentation:** real sun by location, sky, shadows, realistic rendering with CC0 textures, first person, batch photos, and 360° video.
- **For beginners:** "Me ajude a montar" (Help me build) assistant, ready-made templates, tour, glossary, and explained alerts.
- **AI analyst** (optional): reads the project and proposes changes (Claude, via tool use).

## Run locally

Prerequisites: Node 22+ and pnpm 11.

```bash
pnpm install
cp .env.example apps/web/.env.local   # DATA_MODE=sqlite, AI_ENABLED=false
pnpm db:migrate                       # creates apps/web/data/chalecad.sqlite
pnpm dev                              # http://localhost:3000 (development mode)
```

For the optimized version, which opens much faster, use `pnpm app` (build + start at http://localhost:3000).

To enable the AI analyst, set in `apps/web/.env.local`:
- `AI_ENABLED=true`;
- `ANTHROPIC_API_KEY=...`.

The default model is `claude-opus-5-5`; override it with `AI_MODEL`.

## Tests

```bash
pnpm test        # engine, catalog and app (Vitest)
pnpm typecheck
pnpm lint
pnpm e2e         # Playwright (starts the app)
```

## Structure

- `packages/engine`: pure engine, with no React, Three, or Node. It holds the project's Zod schema, geometry, pieces, quantity takeoff, weight, structure, cost estimate, terrain, utilities, performance, approval, and reports. The project is a single versioned JSON; everything else is derived by pure functions.
- `packages/catalog`: profiles, materials, assemblies, price base (Nov/2026), and versioned technical constants.
- `packages/ui`: visual components.
- `apps/web`: Next.js 16, React Three Fiber, Zustand, and Tailwind 4. Calculation runs in a Web Worker (Comlink).

## Documents

- `docs/spec.md`: specification.
- `docs/plan.md`: plan by phase.
- `docs/decisions.md`: decisions.
- `docs/research/`: research (standards, approval).
- `docs/tasks/`: executed cards.

The textures are from Poly Haven (CC0): see `apps/web/public/textures/LICENSE.md`.

## License

MIT: see `LICENSE`. The textures keep their own CC0 license.
