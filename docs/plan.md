# Plan

## Phase 0: foundation ✅
- [x] F0-T01 monorepo scaffold
- [x] F0-T02/T03 contracts (project schema v1, engine results, catalog schema), fixtures
- [x] F0-T04 catalog data
- [x] F0-T05 loadProject and buildModel
- [x] F0-T06 3D scene and visual shell (landing, editor, UI components)
- [x] F0-T07 JSON → Worker → scene integration (absorbed by F1-W1)

## Phase 1: MVP
Parallel streams: engine (E) and editor (W).
- [x] F1-E1 LSF piece generator
- [x] F1-E2 quantity takeoff, cutting plan, and weight
- [x] F1-E3 cost estimate, alerts, and computeAll (after E1+E2)
- [x] F1-W1 store, Worker, autosave, assistant, properties
- [x] F1-W2 results panel and CSV (after W1)
- [x] F1-W3 editing tools, 2D floor plan, skeleton, exploded view (after W1)
- [x] F1-W4 SQLite, projects, versions, PDF (after W1)
- [x] Closeout: 6.5 x 8.5 in < 300 ms, steel 21.9–24.7 kg/m²

## Phase 2: structure and extras
- [x] F2-E1 structural engine
- [x] F2-E2 shed roof, flat roof, deck, wall, fence
- [x] F2-W* heat map, Structure tab, extras in the editor, variant comparison

## Phase 3: AI and data
- [x] F3-E1 gambrel, L/T modules, construction roadmap, engineer package
- [x] F3-W* AI analyst (tool use, patches), SINAPI CSV

## Phase 4: sloped terrain
- [x] F4-E1 building pad, cut/fill, slopes, retaining wall, machines
- [x] F4-W* terrain in 3D and in the assistant

## Phase 5: edit mode and presentation
- [x] F5-E1/W1 rooms, per-room checks, finishes with procedural textures
- [x] F5-W2 presentation mode (real sun, sky, shadows, post-processing, first person, image)

## Phase 6: furniture
- [x] F6-E1 furniture in the engine (circulation, door, low ceiling, water) and ventilation by openable area
- [x] F6-W1 library, drag and drop, procedural 3D, Mobiliar
- [x] F6-W2 visual polish (facade from outside, stars, stairs on the walkway)

## Phase 7: utilities and technical documentation
- [x] F7-E1/W1 estimated electrical and plumbing utilities
- [x] F7-W2 DXF export

## Phase 8: wood frame, first steps, and construction
- [x] F8-E1/W1 wood frame (NBR 7190)
- [x] F8-W2 ready-made templates, tour, and shortcuts
- [x] F8-W3 Obra (Construction) tab (schedule and purchasing)

## Phase 9: performance
- [x] F9-E1/W1 thermal (NBR 15575), solar photovoltaic, and rainwater harvesting

## Phase 10: sharing and quality
- [x] F10-W1 Ver projeto (View project) page (read-only)
- [x] F10-W2 e2e for the new flows

## Phase 11: assistant for beginners
- [x] F11-E1 water tank tower and pressure (NBR 5626)
- [x] F11-W1 "Me ajude a montar" (Help me build) assistant and tower in the editor

## Phase 12: usability and realism
- [x] F12-W2 glossary, explained alerts, search in properties
- [x] collapsible panels, regional labor
- [x] F12-W1 procedural realistic rendering

## Phase 13: assistant and presentation quality
- [x] F13-W1 assistant generates chalets that pass the checks; ready-made templates conformed
- [x] F13-W2 ready-made views, batch photos, and 360° video

## Closeout (2026-11-07)
- Exit criteria verified: valid JSON loads and renders (F0); 6.5 x 8.5 chalet computes everything in ~3 ms (< 300 ms) (F1); structural checks with ratios and colors, extras, shed roof, flat roof, and variant comparison (F2); AI with tool use citing tools, gambrel and L/T, roadmap, and engineer package (F3); terrain with cut/fill tested against manual calculation (F4).
- Known open items: the example's steel index (~15.5 kg/m²) is below the spec's 21.9–24.7 range (see decisions.md #11); structural validation by an engineer not done; AI not tested with a real key; automatic SINAPI import not implemented (price import via CSV is); Supabase not configured (local SQLite mode).

## Phase 17: legal approval and documentation for ART/RRT
- [x] F17-E1 approval report (code compliance check, zoning indices, area schedule, ART/RRT, drawing sheets, descriptive specifications)
- [x] F17-W1 ABNT drawing sheets (pranchas) with title block (carimbo), architecture (site location, site plan, floor plans, sections, elevations, roof) and vector PDF
- [x] F17-W2 engineering sheet contents (foundation, structure, electrical, plumbing)
- [x] F17-W3 "Aprovação" (Approval) screen (legal data, lot, check with professional's review, ART/RRT form, descriptive specifications, .zip package)

## Phase 18: deck, terrain with pads and retaining wall, lighting
- [ ] F18-D deck aligned to the outer face, structure (joists, beams, piers (pilotis) down to the finished ground, foundations), stairs and guardrail per the standard
- [ ] F18-T leveled areas drawn on the terrain (pads) and retaining walls suggested at the edges
- [ ] F18-L lighting: real ceiling height, automatic switch, single engine grid, live lux
