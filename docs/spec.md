# ChaléCAD: chalet creation platform spec

Nov 7, 2026 · Leonardo Villela Costa

## Vision and scope

ChaléCAD is a web application where the user designs a chalet in 3D, parametrically, and instantly gets the bill of materials, the structure weight, a preliminary sizing with alerts, and a cost estimate. An AI reads this data and suggests improvements.

**Audience:** self-builders who want to plan and budget before hiring an engineer. The tool does not replace a structural design with an ART (Anotação de Responsabilidade Técnica, the engineer's liability record), and this appears in the interface and in every exported report.

**Final goal:** go from "I have an idea" to "I have a 3D model, a shopping list by supplier, a budget by stage, and a package to take to the engineer".

**MVP (phase 1):**

- Flat terrain only.
- Light Steel Frame (LSF) construction system, with radier (raft slab) foundation.
- Typologies: box with gable roof and mezzanine (loft), and A-frame.
- Sandwich roof panel cladding.
- Interior walls, openings, and stairs. Quantity takeoff, self-weight, and cost estimate in reais, with an editable price base. Loads, utilization ratios, and structural alerts come in phase 2.

**Out of MVP scope, planned in the roadmap:** sloped terrain (building pad, cut and fill, slope/embankment, retaining wall), wood frame and masonry, detailed electrical and plumbing, IFC/DXF export, multi-user collaboration.

**Permanently out of scope:** structural calculation with legal validity, issuing an ART, city hall approval.

## Supported typologies

Each typology is a parametric generator: the user adjusts parameters and the generator produces the geometry, panels, and pieces. Every typology comes from the same data model.

| Typology | Main parameters | Phase |
| --- | --- | --- |
| Gable box with mezzanine | width, depth, ceiling height, roof pitch (degrees or %), eave, mezzanine area and position | 1 |
| A-frame | base, ridge height (or angle), depth, optional mezzanine, open or closed gable ends | 1 |
| Shed roof | width, depth, low and high height, eave | 2 |
| Box with flat roof | width, depth, ceiling height, parapet, slope | 2 |
| Gambrel / barn | width, depth, two roof angles | 3 |
| Combined modules (L, T) | union of two volumes with a roof junction | 3 |
| Porch / deck | side, depth, optional roof, guardrail | 2 |
| Wall | length, height, system (concrete block, structural block, steel frame with board), foundation (strip footing, grade beam) | 2 |
| Fence | drawn perimeter, height, post type and spacing, mesh, block low wall underneath | 2 |
| Retaining wall and slope/embankment | height, type (gabion, reinforced concrete, block), drainage | 4, with sloped terrain |

Openings (doors, windows, skylights) are objects placed on any wall or roof plane and change panels, headers, and jack studs.

## 3D editor and user flow

The editor is parametric first and free-form later: the user starts from a typology, adjusts it with sliders and typed measurements, and only then moves objects in 3D with snap.

**Flow:**

1. Chooses the typology and basic dimensions in an assistant.
2. Adjusts in the editor: interior walls, openings, mezzanine, stairs, eaves.
3. Chooses the construction system and the layers of each wall (exterior, interior, wet area).
4. Sees the side panel update in real time: area, materials, weight, cost, and alerts.
5. Requests the AI analysis.
6. Exports: PDF with plans and bill of materials, CSV by supplier, project JSON.

**Editor features:**

- Views: orbital 3D, floor plan per level (ground floor, mezzanine, roof), 2D sections and elevations.
- Visualization modes: finished, skeleton (steel profiles only), exploded by layers, load heat map (this one in phase 2, together with the structural engine).
- Tools: draw interior wall, insert opening, stairs (straight, L-shaped, ship's ladder), mezzanine by polygon, dimension, measure.
- Snap to a 10 cm grid and to the stud modulation (40 or 60 cm), with a warning when an opening breaks the modulation inefficiently.
- Unlimited undo/redo, local autosave, and named versions.
- Side-by-side comparison of two variants (e.g., gable x A-frame) with cost and weight difference (phase 2).
- Units in meters and reais, with pt-BR as the default language.

## Data model

The project is a single versioned JSON, validated by a schema (Zod). The 3D geometry, quantity takeoff, and cost estimate are derived from it by pure functions, never saved as the source of truth.

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

**Catalogs separate from the project:**

- `assemblies`: composition of each wall, floor, and roof in layers, with thickness and consumption per m² (e.g., 10 mm cement board, membrane, 11.1 mm OSB, 50 mm PET wool, 12.5 mm drywall).
- `profiles`: steel profiles with web, flange, thickness, mass per meter, and section properties.
- `materials`: specific weight, purchase unit (6 m bar, 1.20 x 2.40 m board, m³, bag), default waste.
- `priceBooks`: price per item, date, source, and region.

## Quantity takeoff engine

The engine counts piece by piece from the generated panels, not by a kg/m² index. The index (21.9 to 24.7 kg of steel per m² in LSF homes) only serves as a sanity test: outside this range, the app shows an alert.

**Pipeline:** project JSON → panels (walls, floors, trusses) → pieces with length → cutting plan on bars → consumption of boards and supplies → purchase list.

**LSF structure:**

- Each wall becomes a panel with top and bottom track, studs at the modulation, double studs at corners and junctions, jack studs, headers, and built-up studs at openings, blockers, and bracing strap.
- Mezzanine: floor joists across the span, rim board, blockers, 18 mm OSB.
- Roof: trusses or rafters depending on the typology, purlins or hat channels at the sandwich roof panel spacing.
- Cutting plan: 1D bin packing on 3 m and 6 m bars, minimizing leftovers. Shows total leftover and number of bars.
- Fastening: profile-to-profile screws, board-to-profile screws, anchor bolts or parabolts into the radier per meter of bottom track, connectors (hold-downs) at the ends of panels.

**Cladding:** net area per face (discounting openings) → whole boards with pagination at the purchase size and configurable waste → joints, tape, compound, membrane, insulation wool.

**Radier foundation:** projection area + edge, concrete volume, welded mesh, plastic sheeting, gravel, edge formwork, embedded pipes (sewage and water points marked in the project).

**Flooring:** burnished or polished cement over the radier: area, hardener, sealer, expansion joints.

**Roof:** real sloped area, number of panels per roof plane length (effective width 0.98 m), ridge, flashing, gutters, screws with sealing.

**Extras:** wall (blocks, grout, rebar, strip footing), fence (posts, mesh, low wall), deck.

**Output:** table by stage (foundation, structure, cladding, roof, flooring, finishing) with item, purchase unit, quantity, applied waste, and weight. Each line is traceable to the piece in 3D (clicking the line highlights the pieces).

## Weight and preliminary structural sizing

The structural engine performs simplified checks to guide the design and generate alerts. It never declares the structure "approved": the result is always "within the usual range" or "needs engineer review".

**Self-weight:** sum of each piece and layer (mass per meter of profiles, kg/m² of boards, concrete density 2,500 kg/m³). Shows weight per element and total.

**Loads (reference NBR 6120 and NBR 6123, configurable values):**

- Permanent: calculated self-weight.
- Live load: residential mezzanine and roof.
- Wind: basic speed by region (V0), terrain category, height. Generates pressure on the facade and suction on the roof, the case that usually governs light structures.

**Load path:** roof panel → purlins → trusses/rafters → top track → studs → bottom track → radier. The mezzanine unloads onto the supporting walls. The app draws this path in "heat map" mode.

**Simplified checks (NBR 14762, cold-formed profiles):**

- Stud: axial compression with buckling, bending from wind, interaction.
- Mezzanine beams and rafters: moment, shear, and deflection (limit L/350 floor, L/250 roof, configurable).
- Headers: opening span x chosen profile.
- Bracing: requires structural OSB or X straps on the walls; alert if the sum of braced walls per direction is low.
- Anchorage: wind uplift force x planned anchors.
- Radier: average soil pressure x allowable stress provided by the user (conservative default when there is no soil survey).

**Output:** each element receives a utilization ratio (demand / resistance) and a color: green below 0.7, yellow from 0.7 to 1.0, red above 1.0. Red suggests the next profile or a smaller spacing, with the impact on cost and weight.

**Implementation:** pure TypeScript functions in a separate package (`@chalecad/engine`), with tests against worked examples from the literature and cases validated by an engineer before releasing the phase.

## Cost estimate and price base

The cost estimate multiplies the purchase list by the active price base and separates material, labor, and freight. The user can mark stages as "eu faço" ("I do it") to zero out their labor.

**Price base:**

- Price per item with purchase unit, date, source (store, SINAPI, manual quote), and state (UF).
- Editable in the interface and importable by CSV. The user can paste the supplier's quote.
- Prices older than 90 days show as outdated.
- Phase 3: semi-automatic update from the monthly SINAPI by state.

**Initial base values (reference Nov/2026, to be reviewed):**

| Item | Unit | Reference price |
| --- | --- | --- |
| LSF stud 90 x 0.95 mm | 6 m bar | R$ 112 to 135 |
| LSF track 90 x 0.95 mm | 6 m bar | R$ 103 to 111 |
| LSF stud 140 x 0.95 mm | 6 m bar | R$ 144 |
| LSF stud 200 x 0.95 mm | 6 m bar | R$ 180 |
| 10 mm cement board | m² | R$ 48 |
| 12.5 mm drywall | 1.20 x 2.40 m board | R$ 89 |
| 30 mm EPS sandwich roof panel | m² | R$ 80 to 160 |
| Radier 10 to 15 cm (material and labor, SINAPI) | m² | R$ 188 to 246 |
| Backhoe with operator | day | R$ 1,600 to 2,600 |

**Freight:** distance from the supplier to the site x total weight per stage (the weight engine already provides it). Configurable price range per ton-km.

**Outputs:** total and R$/m², chart by stage, minimum/maximum range when the price is a range, configurable contingency (default 15%), disbursement schedule if the user provides the duration of the stages.

## Analyst AI

The AI works on the results calculated by the engines and never invents numbers. It receives the project JSON, the quantity takeoff, the structural utilization ratios, and the cost estimate, and responds with analysis and change proposals.

**Capabilities:**

- Project review: points out yellow and red elements, cutting waste, openings outside the modulation, walls without bracing.
- Cost optimization: proposes variants (40 x 60 cm spacing, another pitch, smaller mezzanine) and the app recalculates each one with the real engine before showing it.
- Natural-language questions: "how much do I save by swapping cement board for OSB with siding?", "what weighs most in the budget?".
- Command-based editing: "increase the mezzanine by 1 m" becomes a JSON patch that the user approves before applying.
- Construction roadmap for self-builders: assembly sequence by panel, tools, list of what to buy first.
- Engineer package: summary of assumptions, loads, points of attention, and open questions.

**Implementation:**

- Anthropic API (Claude) with tool use. Tools exposed to the model: `getProject`, `getQuantities`, `getStructuralReport`, `getBudget`, `proposePatch`, `simulateVariant`.
- `simulateVariant` runs the real engine and returns the result; the AI only cites numbers coming from tools.
- Call made by the backend, with the key on the server and a per-user usage limit.
- Response with a fixed notice that it does not replace a structural design with an ART.

## Stack and architecture

TypeScript end to end, monorepo, with the calculation engine in an isolated package that runs the same in the browser and on the server. The app recalculates in real time without depending on the network.

[Architecture diagram: Browser (React + R3F 3D editor; engines in a Web Worker with @chalecad/engine; IndexedDB autosave) <-> HTTPS <-> Server (Next.js API; Postgres/Supabase; analyst AI via Claude API with tool use)]

The editor sends the project JSON to the Web Worker and receives geometry, quantity takeoff, structure, and cost estimate; the server only persists data and mediates the AI.

| Layer | Choice | Reason |
| --- | --- | --- |
| Language | Strict TypeScript | one type for the model across the whole system |
| Monorepo | pnpm workspaces + Turborepo | `apps/web`, `packages/engine`, `packages/catalog`, `packages/ui` |
| Front end | Next.js (App Router) + React | routes, landing SSR, route handlers as API |
| 3D | Three.js via React Three Fiber + drei | mature ecosystem, instancing for thousands of profiles |
| Geometry | three-bvh-csg for opening cutouts | real-time booleans |
| State | Zustand + Immer, with patches for undo/redo | JSON patches reused by the AI |
| Validation | Zod | project and catalog schemas |
| Calculation | Web Worker via Comlink | does not freeze the interface |
| UI | Tailwind + shadcn/ui | panels, forms, tables |
| Charts | Recharts | budget by stage |
| Database and auth | Supabase (Postgres, Auth, Storage), accessed via Drizzle ORM | quick to set up, per-user RLS |
| PDF | @react-pdf/renderer | 2D plans in SVG and lists |
| AI | Anthropic SDK with tool use | analysis and user-approved patches |
| Tests | Vitest (engines), Playwright (flows) | high engine coverage |
| Deploy | Vercel + Supabase | low cost at the start |

**Architecture rules:**

- `packages/engine` does not import React, Three.js, or anything browser-specific. Input and output are serializable JSON.
- Every technical constant (losses, loads, deflection limits) comes from `packages/catalog`, versioned, never hard-coded.
- Rendering uses instancing per profile type to keep 60 fps with 2,000+ pieces.

### Option to run 100% locally

The same code runs locally or in the cloud by changing only environment variables. This works because all data access goes through Drizzle ORM and a `StorageAdapter` interface, never through the Supabase SDK directly in components.

| Layer | Cloud | Local (recommended to start) | Minimal local |
| --- | --- | --- | --- |
| Database | Supabase Postgres | Supabase CLI (`supabase start`, brings up Postgres, Auth, and Storage in Docker) | SQLite file via Drizzle |
| Login | Supabase Auth | Local Supabase Auth | no login, single user |
| Files (PDF, images) | Supabase Storage | Local Supabase Storage | `./data/files` folder |
| AI | Anthropic API | Anthropic API (needs internet and `ANTHROPIC_API_KEY`) | AI turned off by flag |
| App | Vercel | `pnpm dev` at localhost:3000 | `pnpm dev` |

**Local prerequisites:** Node 22 LTS, pnpm 9, Docker Desktop (only for the Supabase CLI column), Git.

**Run locally:**

```bash
pnpm install
supabase start              # ou pule e use DATA_MODE=sqlite
cp .env.example .env.local  # DATA_MODE=supabase|sqlite, AI_ENABLED=true|false
pnpm db:migrate
pnpm dev
```

The calculation engine does not depend on any of this: `pnpm --filter @chalecad/engine test` runs with no database, no network, and no browser.

## Development with agents

Development runs in Claude Code with a main session on **Opus 5.5** (`claude-opus-5-5`), which thinks, breaks down the spec, writes the contracts, and reviews. The session launches at most **3 Sonnet subagents** in parallel to execute. Opus does not write large features, and the subagents do not decide architecture.

**Repository setup:**

1. Export this doc as Markdown and save it as `docs/spec.md`.
2. Create `CLAUDE.md` at the root with this spec's architecture rules and the commands `pnpm test`, `pnpm typecheck`, and `pnpm lint`.
3. Create the subagent at `.claude/agents/implementer.md` (see the file in the repository).

**Work cycle per phase:**

1. **Plan (Opus):** reads `docs/spec.md` and writes `docs/plan.md` with the phase broken into tasks of 1 to 4 hours, dependencies between them, and which can run in parallel. Stops and asks for your ok.
2. **Contract (Opus):** before any parallelism, writes the shared types, Zod schemas, and JSON test fixtures itself. The contract is what lets 3 agents work without stepping on each other.
3. **Write cards (Opus):** each task becomes `docs/tasks/F1-T03.md` with objective, files it may change, inputs and outputs (types), acceptance tests, and what is out of scope.
4. **Execute (up to 3 Sonnet):** Opus picks up to 3 cards with no dependency among them and no file in common, and launches one `implementer` subagent per card, each in its own git worktree.
5. **Review and integrate (Opus):** reads each diff, runs the full suite, merges, and marks the card as done in `plan.md`. If it fails: returns it to the subagent with the error, at most 2 attempts, then takes over or replans.
6. **Close the phase:** Opus checks the roadmap's exit criteria, runs the app, and stops asking for your ok before the next phase.

**Parallelism rules:**

- Never 2 subagents in the same package at the same time.
- Schema, catalog, and `CLAUDE.md` only change through the Opus session.
- One commit per card, with the ID in the title.
- A task with a requirements doubt goes back to Opus, which asks you.

**Example of a first parallel round (Phase 1):**

| Subagent | Card | Package |
| --- | --- | --- |
| Sonnet 1 | LSF wall panel generator from the JSON | `packages/engine` |
| Sonnet 2 | 3D scene that renders panels from a fixture | `apps/web` |
| Sonnet 3 | Catalog of profiles, materials, and initial price base | `packages/catalog` |

## Roadmap, acceptance criteria

Each phase only starts when the previous one passes its exit criterion.

1. **Phase 0, foundation:** monorepo, project Zod schema, catalog of profiles and materials, empty 3D scene with grid and camera.
   - Exit: a valid JSON loads and renders a simple volume.
2. **Phase 1, MVP:** gable box with mezzanine and A-frame, interior walls, openings, stairs, LSF quantity takeoff, radier, sandwich roof panel, cost estimate with editable base, CSV and PDF export.
   - Exit: a 6.5 x 8.5 m chalet with mezzanine produces a bill of materials in under 300 ms and steel consumption within the 21.9 to 24.7 kg/m² range.
3. **Phase 2, structure and extras:** weight and load engine, utilization ratios with colors, shed roof, flat roof, porch, wall, and fence, variant comparison.
   - Exit: test cases reviewed by an engineer pass with error below 10%.
4. **Phase 3, AI and data:** analyst AI with tool use, approved patches, construction roadmap, engineer package, SINAPI by state, gambrel typologies and combined modules (L, T).
   - Exit: every AI answer containing a number cites a tool.
5. **Phase 4, sloped terrain:** contour lines or slope, building pad with margins per side, balanced cut and fill, volume of earth and its destination, slope/embankment and retaining wall, machine cost.
   - Exit: cut volumes match manual calculation on test terrains.

**General acceptance criteria:**

- [ ] Changing any parameter updates 3D, materials, weight, and cost in under 300 ms.
- [ ] Clicking a line in the bill of materials highlights the pieces in 3D.
- [ ] A saved and reopened project reproduces exactly the same results.
- [ ] 60 fps in skeleton mode with 2,000 profiles on an ordinary laptop.
- [ ] "Does not replace a design with an ART" notice on the results screen and in every PDF.
- [ ] Engines with unit tests for every formula.
