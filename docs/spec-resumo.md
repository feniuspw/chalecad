# ChaléCAD: spec (operational summary)

> The full version of the user's spec (Nov 7, 2026, Leonardo Villela Costa) is in `~/Documents/Projects/chalecad/docs/spec.md`. This summary covers what is needed to implement.

## Vision
A web app where the self-builder designs a chalet in 3D, parametrically, and instantly gets a bill of materials, structure weight, preliminary sizing with alerts, and a cost estimate. An AI reads this data and suggests improvements. It does not replace a structural design with an ART (Anotação de Responsabilidade Técnica, the engineer's liability record): this appears in the interface and in every report.

Goal: from "I have an idea" to "I have a 3D model, a shopping list by supplier, a budget by stage, and a package to take to the engineer".

## Phases
0. **Foundation:** monorepo, Zod schema, catalog, 3D scene with grid and camera. Exit: a valid JSON loads and renders a volume.
1. **MVP:** gable box with mezzanine (loft) and A-frame; interior walls, openings, stairs; LSF quantity takeoff; radier (raft slab); sandwich roof panel; cost estimate with editable price base; CSV and PDF export. Exit: a 6.5 x 8.5 m chalet with mezzanine produces a bill of materials in < 300 ms and steel between 21.9 and 24.7 kg/m².
2. **Structure and extras:** weight and load engine, utilization ratios with colors (green < 0.7 ≤ yellow ≤ 1.0 < red), shed roof, flat roof, porch/deck, wall, fence, side-by-side variant comparison (cost and weight).
3. **AI and data:** analyst AI with tool use (`getProject`, `getQuantities`, `getStructuralReport`, `getBudget`, `proposePatch`, `simulateVariant`), JSON patches approved by the user, construction roadmap, engineer package, SINAPI by state (import), gambrel typologies and combined modules (L, T). Exit: every AI answer containing a number cites a tool.
4. **Sloped terrain:** slope, building pad with margins per side, balanced cut and fill, volume of earth and its destination, slope/embankment and retaining wall, machine cost. Exit: volumes match manual calculation.

## Editor
- Parametric first, free-form later: typology assistant → sliders and typed measurements → move objects in 3D with snap.
- Flow: typology and dimensions → interior walls, openings, mezzanine, stairs, eaves → construction system and layers → real-time side panel (area, materials, weight, cost, alerts) → AI analysis → export (PDF with plans and list, CSV by supplier, JSON).
- Views: orbital 3D, floor plan per level, 2D sections and elevations. Modes: finished, skeleton (profiles only), exploded by layers, load heat map (Phase 2).
- Tools: interior wall, opening, stairs (straight, L-shaped, ship's ladder), mezzanine by polygon, dimension, measure.
- Snap to a 10 cm grid and to the stud modulation (40/60 cm), with a warning when an opening breaks the modulation inefficiently.
- Unlimited undo/redo, local autosave, named versions. pt-BR, meters and reais.

## Quantity takeoff
Piece by piece from the generated panels (not by a kg/m² index; the 21.9–24.7 kg/m² index is only a sanity check with an alert). Pipeline: project → panels → pieces with length → cutting plan on bars (1D bin packing on 3 m and 6 m bars) → boards and supplies → purchase list. LSF structure with tracks, studs, double studs at corners, jack studs, headers, built-up studs, blockers, straps; mezzanine with beams, rim board, blockers, 18 mm OSB; roof with rafters/trusses and purlins/hat channels; fasteners (screws, anchor bolts per meter of track, hold-downs). Cladding by net area with board pagination and waste. Radier (area + edge, concrete, mesh, plastic sheeting, gravel, formwork, pipes at marked points). Flooring (burnished/polished cement: hardener, sealer, joints). Roof (sloped area, panels by effective width 0.98 m, ridge, flashing, gutters, screws). Extras (wall, fence, deck). Output by stage (foundation, structure, cladding, roof, flooring, finishing) with item, purchase unit, quantity, waste, weight; each line traceable to the pieces in 3D.

## Structure (Phase 2)
Never "approved": only "within the usual range" or "needs engineer review". Self-weight piece by piece (concrete 2,500 kg/m³). Loads per NBR 6120/6123 (mezzanine and roof live load; wind by V0, category, height: pressure on the facade and suction on the roof). Load path: roof panel → purlins → rafters → track → studs → radier. Simplified NBR 14762 checks: stud (compression with buckling, bending from wind, interaction), mezzanine beams and rafters (moment, shear, deflection L/350 floor, L/250 roof), headers, bracing per direction, uplift anchorage, soil pressure x allowable stress. Red suggests the next profile or a smaller spacing with the impact on cost and weight.

## Cost estimate
Purchase list × price base; separates material, labor, and freight. "I do it" ("eu faço") stages zero out labor. Base editable in the interface and importable by CSV; prices > 90 days flagged as outdated. Freight = distance × weight per stage × R$/t·km. Outputs: total, R$/m², chart by stage, min/max range, contingency (15%), disbursement schedule.

Reference prices (Nov/2026): LSF stud 90x0.95 6 m bar R$ 112–135; track 90x0.95 R$ 103–111; stud 140x0.95 R$ 144; 200x0.95 R$ 180; 10 mm cement board R$ 48/m²; 12.5 drywall board 1.20x2.40 R$ 89; EPS 30 sandwich roof panel R$ 80–160/m²; radier 10–15 cm (SINAPI, material + labor) R$ 188–246/m²; backhoe with operator R$ 1,600–2,600/day.

## AI
Works on the engines' results, never invents numbers; cites only numbers coming from tools; patches approved by the user; key on the server; fixed ART notice.

## Stack
Strict TypeScript, pnpm + Turborepo, Next.js App Router, R3F + drei, Zustand + Immer (patches for undo/redo and AI), Zod, Web Worker via Comlink, Tailwind + shadcn-style components, Recharts, Drizzle (local SQLite / Supabase cloud), @react-pdf/renderer, Anthropic SDK, Vitest, Playwright.

## General criteria
- Changing a parameter updates 3D, materials, weight, and cost in < 300 ms.
- Clicking a line in the bill of materials highlights the pieces in 3D.
- A saved and reopened project reproduces exactly the same results.
- 60 fps in skeleton mode with 2,000 profiles.
- ART notice on the results screen and in every PDF.
- Engines with unit tests for every formula.
