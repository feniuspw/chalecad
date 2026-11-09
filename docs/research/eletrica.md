# Research: electrical and lighting design in ChaléCAD

> Reference research for turning the simplified estimator (`packages/engine/src/installations`) into an electrical and lighting design tool drawn on the floor plan, at engineering level and compliant with Brazilian standards.
> Date: 2026-11-08. Author: research agent. **Does not replace an electrical design with an ART (Anotação de Responsabilidade Técnica, the engineer's liability record).**

## How to read this document

- **[N]** = normative requirement (NBR 5410:2004 unless stated otherwise). **[P]** = market practice (manufacturer manuals, course handouts, utilities). **[?]** = uncertain value or sources disagree. These cases need verification before becoming "blocking" rules.
- ABNT tables are protected by copyright. The values below are those published in manufacturer manuals and catalogs (Prysmian/Pirelli, Procobre, Sil, Nambei), university handouts, and technical guides, which reproduce them from the standard (which in turn follows IEC 60364-5-52).
- **Standard status (Nov/2026):** NBR 5410:2004 (with the 2008 erratum) remains in force. The revision is in public consultation and has not yet been published. Proposals include an RCD (DR) on all residential circuits, an AFDD (arc fault detection device) recommended in bedrooms, and a new power per lighting point. The new NR-10 (Portaria 737, of 05/29/2026) now incorporates requirements from NBR 5410. **Recommendation:** store a `normEdition: 'NBR5410:2004'` in the catalog and keep the limits versioned, so they can be swapped when the revision is published.
  - Sources: [O Setor Elétrico: revisão da NBR 5410](https://www.osetoreletrico.com.br/?p=165324) · [Canal Solar: revisão da 5410](https://canalsolar.com.br/revisao-da-nbr-5410-abrangera-instalacoes-em-vias-publicas/) · [O Setor Elétrico: potência por ponto de iluminação na revisão](https://www.osetoreletrico.com.br/?p=167292) · [Sienge: NBR 5410](https://sienge.com.br/blog/nbr-5410/)

## 0. What already exists in ChaléCAD (and what is missing)

The current estimator (`points.ts`, `circuits.ts`, `constants.installations`) already does:

- lighting points (load 100 VA + 60 VA/4 m²), switch next to the door at 1.10 m, general-purpose outlets (TUG) by perimeter (5 m; 3.5 m in kitchen and laundry; 600 VA for the first 3 in wet areas), specific-purpose outlets (TUE) for shower, washing machine, and refrigerator;
- circuit grouping by bin packing with 2,200 VA per circuit, kitchen and laundry on dedicated circuits, TUE > 1,200 W on its own circuit;
- wire size and breaker from a single `wireTable` (current → size → breaker), length by Manhattan distance × 1.3 + 2.2 m per point, demand = 0.7 × installed load.

Gaps relative to an engineering design (addressed in the sections below):

| Gap | Where the solution is |
|---|---|
| Fixed 220 V voltage; no 127 V and no two-phase (F-F) circuits | §1.6, §8 |
| Wire size from current only, no installation method, grouping (FCA), or temperature (FCT) | §2.1–2.3 |
| No voltage drop check (4% on the final circuit, 5% from the service point) | §2.5 |
| Does not model RCD (DR), SPD (DPS), protective conductor (PE), or grounding scheme | §2.7–2.9 |
| Conduits as length only; no diameter, fill ratio, boxes, bends | §3 |
| Flat demand factor (0.7); no utility (concessionária) table or service entrance category | §4 |
| Lighting only as load (VA); no lux, lumens, luminaire, or control | §5 |
| Points not editable by the user (generated, not drawn) | §6, §8 |
| Bathroom without zone verification (outlet at ≥ 0.60 m from the shower stall) | §1.1, §8.3 |

---

## 1. NBR 5410: load estimation and circuit division (item 9.5)

### 1.1 Lighting points [N 9.5.2.1]

- Each room or space must have **at least 1 fixed ceiling light point, controlled by a switch**.
- In bathrooms, a wall light point (sconce) is allowed, provided it is outside the prohibited zones and at least 0.60 m from the edge of the shower stall or bathtub.
- For outdoor areas the standard sets no minimum. For the outdoor areas of residential units, the power is defined by the designer.

**Minimum lighting load** (only for sizing circuits; not the real power of the LED lamps):

| Room area A (m²) | Minimum load (VA) |
|---|---|
| A ≤ 6 | 100 |
| A > 6 | 100 + 60 × floor((A − 6) / 4) |

Examples: 12 m² → 100 + 60 × 1 = 160 VA; 14 m² → 100 + 60 × 2 = 220 VA. Only **whole multiples** of 4 m² count (floor, not ceil).

> Design note: with LED, the real installed power is far below the normative minimum (e.g., 20 m² living room → standard 280 VA; real LED ≈ 60–90 W). ChaléCAD should use **max(normative load, sum of the real luminaires)** as the circuit design power, and show both.

### 1.2 General-purpose outlets (TUG): quantity [N 9.5.2.2.1]

| Room | Minimum quantity | Notes |
|---|---|---|
| Bathroom | 1 next to the sink | Respect the zones (9.1): outlet **at ≥ 0.60 m from the shower stall/bathtub**; nothing in zones 0, 1, and 2, except SELV or a shaver outlet with an isolation transformer |
| Kitchen, pantry, kitchenette, service area, laundry, and similar | 1 per **3.5 m of perimeter** or fraction | **Above each countertop with width ≥ 0.30 m: at least 2 outlets**, at the same point or at separate points |
| Porch | 1 | If the porch cannot accommodate the point for construction reasons (area < 2 m² or depth < 0.80 m), it may be placed outside, near the access |
| Living room and bedroom | 1 per **5 m of perimeter** or fraction | Spacing as uniform as possible |
| Other rooms (hallway, hall, storage, garage, attic) | A ≤ 2.25 m²: 1 (may be outside the room, up to 0.80 m from the door) · 2.25 < A ≤ 6 m²: 1 · A > 6 m²: 1 per 5 m of perimeter or fraction | |

Formula: `n = max(min_room, ceil(perimeter / step))`, with a step of 3.5 m or 5 m.

> The perimeter is measured along the interior outline of the room. Practice allows subtracting door openings, but the standard says perimeter, so ChaléCAD should use the full perimeter (more conservative).

### 1.3 TUG power [N 9.5.2.2.2]

| Location | Minimum power per point |
|---|---|
| Bathroom, kitchen, pantry, kitchenette, service area, laundry, and similar | **600 VA per point up to 3 points, and 100 VA for the remainder**, counting each room separately. **If the total number of points in this group of rooms exceeds 6**, 600 VA is allowed for the first 2 points of each room and 100 VA for the rest [?: some sources read the rule differently; see note] |
| Other rooms | **100 VA per point** |

Note [?]: the "more than 6 points" clause appears with different wording in handouts. The most common reading: when the group (kitchen + service area + bathroom…) has more than 6 outlets, each room gets 600 VA × 2 + 100 VA × remaining. Implement as an **option** (`wetOver6Rule: true`), with the 600 × 3 rule as the conservative default.

### 1.4 Specific-purpose outlets (TUE) [N 9.5.2.3]

- Power = nominal power of the equipment (VA). When it is not known, use the nominal power of the most powerful equipment that could be connected there, or the typical table below.
- The TUE sits at most 1.5 m from the intended location of the equipment.

Typical powers for pre-registration [P] (Procobre, utility manuals):

| Equipment | Typical power (W) | Usual voltage | Notes |
|---|---|---|---|
| Electric shower | 5,500 (127 V: 4,400–5,500; 220 V: 5,500–7,500) | 220 V preferable | 127 V × 5,500 W = 43 A: requires 10 mm² |
| Electric faucet | 3,500–5,500 | 220 V | |
| Instantaneous heater/boiler | 1,500–3,000 | 220 V | |
| Built-in electric oven | 2,000–3,500 | 220 V | |
| Induction cooktop (4 burners) | 5,000–7,500 | 220 V | |
| Microwave | 1,200–1,500 | | TUE if > 10 A at 127 V |
| Dishwasher | 1,500–2,000 | | |
| Washing machine | 1,000–1,500 | | |
| Dryer | 2,500–3,500 | 220 V | |
| Split air conditioner 9,000 BTU/h | 900–1,000 | 220 V | Inverter ≈ 750 W |
| Split air conditioner 12,000 BTU/h | 1,200–1,400 | 220 V | |
| Split air conditioner 18,000 BTU/h | 1,800–2,000 | 220 V | |
| Refrigerator/freezer | 150–500 | | May be on a TUG; good practice is a TUE |
| Water pump ½ hp | 750 (power factor ~0.8 → ~950 VA) | | Curve C (starting) |
| Electronic gate | 300–500 | | |
| EV charger (wallbox) 7.4 kW | 7,400 | 220 V | Type A or B RCD; dedicated circuit |

### 1.5 Division of the installation into circuits [N 9.5.3]

1. **Lighting and outlets on separate circuits** (rule). Exception [N]: a mixed circuit (lighting + TUG that are not in the kitchen or service area) is allowed if: (a) the design current is ≤ 16 A; (b) not all the lighting is on a single mixed circuit; (c) not all the outlets are on a single mixed circuit. ChaléCAD should **separate by default** and allow mixed only in advanced mode, with validation of these three conditions.
2. **Every point with nominal current > 10 A must have an independent circuit** (TUE). At 127 V that means > 1,270 VA; at 220 V, > 2,200 VA. The current code uses a fixed 1,200 W (conservative at 220 V, correct at 127 V). Replace with `I_n > 10 A`.
3. **Outlets in the kitchen, pantry, kitchenette, service area, laundry, and similar: circuits exclusive to those locations** (they cannot share a circuit with the living room, bedroom, etc.). The bathroom is **not** on this list, but requires an RCD (§2.7).
4. **Maximum load per circuit**: the standard sets no ceiling in VA; the real limit comes from Ib ≤ In ≤ Iz and voltage drop. The practice in manuals (Procobre/Prysmian/Eletropaulo) is to **limit TUG and lighting circuits to about 10 A**: **1,270 VA at 127 V and 2,200 VA at 220 V** [P]. Kitchen circuits usually go up to 16–20 A (2.5 mm²) [P].
5. Two-phase circuits (F-F, 220 V on a 127/220 V network) for large loads; distribute the circuits among the phases to **balance the load** (target imbalance ≤ 10–20% [P]).
6. **Spare capacity in the board** [N 6.5.4.7]: up to 6 circuits → room for 2 spares; 7 to 12 → 3; 13 to 30 → 4; above 30 → 15%.

### 1.6 Voltage by state (UF) [P / ?]

The phase-to-neutral voltage (127 V or 220 V) depends on the utility and sometimes on the municipality (exceptions exist within the same state). Public lists are partial. Suggested default for pre-selection (the user can always change it):

| Phase-neutral 127 V (127/220 V network) | Phase-neutral 220 V (220/380 V network) |
|---|---|
| AC, AM, AP, ES, MG, MS, MT*, PA, PR, RJ*, RO, RR, SP*, RS* (large part), SC* (part), BA* (capital 127 V; interior mixed), SE* | AL, CE, DF, GO, MA, PB, PE, PI, RN, TO, and parts of SC/RS/BA |

\* States with relevant municipal exceptions. Adequate supply range (PRODIST, Module 8): 127 V → 117–133 V; 220 V → 202–231 V.

**Recommendation:** a `supply: { phaseNeutral: 127 | 220, phases: 1 | 2 | 3, utility: string }` field in the project, with the UF only as an initial suggestion.

Sources §1: [Engehall: tomadas por circuito](https://engehall.com.br/disjuntor-para-tomadas-quantas-por-circuito/) · [Engenharia 360: quantas tomadas por cômodo](https://engenharia360.com/quantas-tomadas-deve-ter-em-cada-comodo/) · [UFV GESEP: Aula 6, previsão de cargas](https://gesep.ufv.br/wp-content/uploads/2021/07/Aula-6-previsaodecargas.pdf) · [UFRJ: Inst. Elét. Res. parte 2](https://www.coe.ufrj.br/~kleber/INST_ELET_RES_PARTE_02.pdf) · [IFRN: instalações elétricas parte 1](https://docente.ifrn.edu.br/odailsoncavalcante/disciplinas/eletricidade-instrumental/instalacoes-eletricas-parte-1) · [Voltimum: NBR 5410 em edifícios](https://content.voltimum.com/br/3054/02_ie11_instalaes_eltricas_edifcios_nbr-5410_0.pdf) · [O Setor Elétrico: banheiros](https://www.osetoreletrico.com.br/?p=165060) · [Brilliant Maps: tensões no Brasil](https://brilliantmaps.com/brazil-electricity/) · [Energisa: cartilha nível de tensão](https://www.energisa.com.br/sites/energisa/files/media/documents/2025-10/energisa-cartilha-nivel-tensao.pdf)

---

## 2. Conductor sizing and protection

### 2.1 Current-carrying capacity (Iz) [N Tab. 36]

Copper, PVC insulation 70 °C (flexible cable 450/750 V, "cabinho" type), ambient 30 °C. Currents in amperes.

- **B1**: insulated conductors (or single-core cables) in circular-section conduit embedded in masonry. **This is the method for corrugated conduit embedded in a masonry, drywall, or LSF wall** and for conduit above a ceiling.
- **B2**: multicore cable in conduit embedded in masonry.
- 2 loaded conductors = F-N or F-F circuit; 3 = three-phase (F-F-F). The PE does not count as loaded.

| Size (mm²) | B1, 2 loaded | B1, 3 loaded | B2, 2 loaded | B2, 3 loaded |
|---|---|---|---|---|
| 1.5 | 17.5 | 15.5 | 16.5 | 15 |
| 2.5 | 24 | 21 | 23 | 20 |
| 4 | 32 | 28 | 30 | 27 |
| 6 | 41 | 36 | 38 | 34 |
| 10 | 57 | 50 | 52 | 46 |
| 16 | 76 | 68 | 69 | 62 |
| 25 | 101 | 89 | 90 | 80 |
| 35 | 125 | 110 | 111 | 99 |

Values identical to IEC 60364-5-52, Tab. B.52.4 (PVC column, methods B1/B2), reproduced in Prysmian guides and in handouts (e.g., IFSC: 1.5 mm² B1 = 17.5 A; 4 mm² B1 = 32 A). Some blogs cite 4 mm² = 28 A, which is the value for **3** loaded conductors.

For reference, method **A1** (conductors in conduit embedded in a thermally insulating wall, the case of an LSF wall with glass/rock wool **surrounding** the conduit), 2 loaded: 1.5 → 14.5; 2.5 → 19.5; 4 → 26; 6 → 34; 10 → 46; 16 → 61; 25 → 80; 35 → 99 A. **This matters for LSF chalets with thermoacoustic insulation in the wall**: if the conduit runs immersed in the wool, the correct method is A1, not B1 [N 6.2.5.1, Tab. 33, method 1/A1]. Suggestion: default method B1; switch to A1 automatically when the wall has cavity insulation (`assembly.cavityInsulation = true`).

### 2.2 Temperature correction factor (FCT) [N Tab. 40]

PVC, ambient air temperature:

| °C | 10 | 15 | 20 | 25 | 30 | 35 | 40 | 45 | 50 | 55 | 60 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| FCT | 1.22 | 1.17 | 1.12 | 1.06 | 1.00 | 0.94 | 0.87 | 0.79 | 0.71 | 0.61 | 0.50 |

Default: 30 °C. In an unventilated space under the roof (sandwich roof panel helps, plain metal roofing does not), use 35–40 °C [P].

### 2.3 Grouping correction factor (FCA) [N Tab. 42]

Row 1 (bundle of circuits in conduit or embedded; applies to methods A to F). "n" = number of **circuits** (or multicore cables) in the same conduit/bundle:

| n | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9–11 | 12–15 | 16–19 | ≥ 20 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FCA | 1.00 | 0.80 | 0.70 | 0.65 | 0.60 | 0.57 | 0.54 | 0.52 | 0.50 | 0.45 | 0.41 | 0.38 |

Usage rules:
- A circuit's FCA is that of the **most heavily loaded segment** (the conduit with the most circuits that it passes through). In practice, this is usually the segment leaving the distribution board (QDC).
- [N 6.2.5.5] Circuits whose design current is ≤ 30% of their corrected capacity can be disregarded in the count of n. Implement as an optional refinement.
- Corrected Iz: `Iz' = Iz_tab × FCT × FCA`.

### 2.4 Minimum sizes, neutral, and PE [N 6.2.6, Tab. 47, Tab. 58]

| Circuit | Minimum size (copper) |
|---|---|
| Lighting | 1.5 mm² |
| Power (outlets, TUE) | 2.5 mm² |
| Signaling and control | 0.5 mm² |

- **Neutral**: in a single-phase (F-N) or two-phase circuit with neutral, **same size as the phase**. In three-phase, it may be reduced only above 25 mm² and with harmonic content ≤ 15% (does not occur in a chalet).
- **PE (ground)** [Tab. 58]: S ≤ 16 → PE = S; 16 < S ≤ 35 → PE = 16; S > 35 → PE = S/2.
- **Every circuit must have a PE** [N 5.1.2.2.3.6/6.4]; every outlet is 2P+T (NBR 14136).
- Colors [N 6.1.5.3; practice]: neutral **light blue**; PE **green-yellow** or green; phases in black, red, white, or brown (practice: black/red); switch return in yellow, gray, or another free color [P].

### 2.5 Voltage drop [N 6.2.7]

Limits (relative to nominal voltage):

| Situation | Total limit |
|---|---|
| **Low-voltage supply from the public grid (the chalet's case)** | **5% from the service point** |
| Own transformer or own generator | 7% from the transformer/generator terminals |
| **Final circuits (any case)** | **≤ 4%** |

> Warning: the common statement "4% terminal + 7% total" applies to those with their own transformer. For a residence connected at LV, the total is **5%** (service drop + feeder to the QDC + final circuit). ChaléCAD must validate **ΔV_terminal ≤ 4%** and **ΔV_feeder + ΔV_terminal ≤ 5%**.

**Formula (resistive, sufficient for sizes ≤ 35 mm² and high power factor):**

- Single-phase/two-phase 2-wire (F-N or F-F): `ΔV% = (2 · ρ · L · Ib) / (S · V) · 100`
- Balanced three-phase: `ΔV% = (√3 · ρ · L · Ib) / (S · V_FF) · 100`
- ρ of copper: 0.0172 Ω·mm²/m at 20 °C; **0.0207–0.0217 at 70 °C** (use 0.0217 = 1/46 on the safe side, or ρ20 × (1 + 0.00393 × 50)). Many handouts use 1/56 ≈ 0.0179 (optimistic).
- L in meters (circuit length, one way only), S in mm², V = circuit voltage (127 or 220).

**Alternative by unit drop** (with reactance; Prysmian/Pirelli, non-magnetic conduit, PVC copper), in **V/(A·km)**:

| Size (mm²) | Single-phase, PF 0.8 | Single-phase, PF 0.95 | Three-phase, PF 0.8 | Three-phase, PF 0.95 |
|---|---|---|---|---|
| 1.5 | 23 | 27.4 | 20 | 23.7 |
| 2.5 | 14 | 16.8 | 12 | 14.5 |
| 4 | 9.0 | 10.5 | 7.8 | 9.1 |
| 6 | 5.87 | 7.0 | 5.1 | 6.1 |
| 10 | 3.54 | 4.2 | 3.1 | 3.6 |
| 16 | 2.27 | 2.7 | 2.0 | 2.3 |
| 25 | 1.50 | 1.72 | 1.3 | 1.5 |
| 35 | 1.12 | 1.25 | 0.98 | 1.1 |

[?] Values for 1.5/2.5 mm² confirmed by the Nambei table (23.3 and 14.3 V/A·km single-phase, PF 0.8); 4 and 6 mm² match the USP table (10.6 and 7.07 V/A·km, PF ≈ 0.95). The others come from the classic Pirelli table and should be checked against the Prysmian Guide. Usage: `ΔV(V) = ΔVunit × Ib × L(km)`; `ΔV% = ΔV / V × 100`.

**Implementation recommendation:** compute from the conductor resistance (more transparent and no PF table):

`ΔV% = k · R70(S) · L(km) · Ib / V · 100`, with k = 2 (single/two-phase 2-wire) or √3 (three-phase), and R70 = R20 × 1.196.

R20 of class 5 flexible conductor (NBR NM 280), in Ω/km: 1.5 → 13.3; 2.5 → 7.98; 4 → 4.95; 6 → 3.30; 10 → 1.91; 16 → 1.21; 25 → 0.780; 35 → 0.554.

**Distributed loads** (several points along the circuit): `ΔV = Σ (k · R · Li · Ii)`, with Li the distance from the QDC to point i and Ii the current of that point (electrical moments method). In a branched circuit, sum segment by segment, using the accumulated downstream current of each segment. This is exact for the tree topology of the conduits (§3).

Example: 5,500 W shower at 220 V, Ib = 25 A, L = 15 m, 6 mm²: ΔV% = 2 × 3.30 × 1.196 × 0.015 × 25 / 220 × 100 = **1.35%** (ok).

### 2.6 Overcurrent protection: circuit breakers [N 5.3.4]

- **Coordination**: `Ib ≤ In ≤ Iz'` and `I2 ≤ 1.45 · Iz'`. For NBR NM 60898 / IEC 60898-1 breakers, I2 = 1.45 · In, so the second condition is met automatically when In ≤ Iz'.
- Standard nominal currents (DIN, NBR NM 60898): **6, 10, 13, 16, 20, 25, 32, 40, 50, 63 A** (and 70, 80, 100, 125 A in the molded-case or extended DIN line).
- Curves (instantaneous magnetic trip):

| Curve | Instantaneous trip | Residential use |
|---|---|---|
| B | 3–5 × In | Resistive loads, long circuits (shower, lighting, outlets) |
| C | 5–10 × In | General use; loads with starting current (motors, air conditioning, pump, LED with high-inrush driver). **Market standard in Brazil** |
| D | 10–20 × In | Transformers, heavy motors; almost never in residences |

- Ib of each circuit: `Ib = P(VA) / V` (single/two-phase) or `P / (√3 · V_FF)` (three-phase). For loads in W with power factor < 1: `P(VA) = P(W) / PF`.
- Short-circuit protection (verify `I²t ≤ k²S²`, k = 115 for copper/PVC): for breakers up to 63 A and sizes ≥ 1.5 mm² in a residence, it is met in practice [P]; leave as an informational check.

**Practical table** of size × breaker, B1, 2 loaded, 30 °C:

| Size | Iz (FCA 1.0) | Max In (FCA 1.0) | Iz with FCA 0.7 (3 circuits) | Max In (FCA 0.7) | Max In (FCA 0.6, 5 circuits) |
|---|---|---|---|---|---|
| 1.5 | 17.5 | 16 | 12.3 | 10 | 10 |
| 2.5 | 24 | 20 | 16.8 | 16 | 13 |
| 4 | 32 | 32 | 22.4 | 20 | 16 |
| 6 | 41 | 40 | 28.7 | 25 | 20 |
| 10 | 57 | 50 | 39.9 | 32 | 32 |
| 16 | 76 | 63 | 53.2 | 50 | 40 |
| 25 | 101 | 100 | 70.7 | 63 | 50 |
| 35 | 125 | 125 | 87.5 | 80 | 70 |

The current `wireTable` (1.5 → 10 A; 2.5 → 16 A; 4 → 25 A; 6 → 32 A; 10 → 40 A) is consistent with FCA ≈ 0.7, but should be **replaced by the calculation** (Iz × FCT × FCA, then ΔV).

### 2.7 RCD (DR, residual-current device) [N 5.1.3.2.2]

**High-sensitivity RCD (IΔn ≤ 30 mA) mandatory** on:
1. circuits serving points of use in locations with a **bathtub or shower**;
2. circuits of **outlets in areas outside** the building;
3. circuits of outlets in indoor areas that may feed equipment outdoors;
4. in **residential units**: circuits serving points in **kitchens, kitchenettes, laundries, service areas, garages** and, in general, indoor areas that are wet in normal use or subject to washing.

- **Exception**: lighting points at a height **≥ 2.50 m** can be excluded.
- It can be one RCD per circuit (RCD + breaker or RCBO/DDR) or one general RCD protecting a group. To reduce nuisance tripping, good practice is to split into 2 or more RCDs [P].
- The RCD **does not replace** the breaker (it does not protect against overcurrent, except RCBO/DDR).
- Types: AC (sinusoidal), **A** (sinusoidal + pulsating DC; recommended for electronics, inverters, cooktop, washing machine), F, B (EV charger, photovoltaic). Requiring type A as the default is a proposal in the revision [?].
- Trend (revision in progress): RCD on **all** residential circuits. **ChaléCAD recommendation:** default "30 mA RCD on all outlet circuits and wet areas", with a warning if the user removes it.
- RCD In ≥ In of the upstream breaker of the protected circuits (or ≥ the sum, per manufacturer). Commercial values: 25, 40, 63, 80 A; 2 poles (F-N, F-F) or 4 poles.

### 2.8 SPD (DPS, surge protective device) [N 5.4.2, 6.3.5.2]

- Mandatory [N] when the installation is fed by a **wholly or partly overhead** line in a thunderstorm region (typical case: rural/mountain chalet). In practice, **always provide** one in the QDC.
- **Class II** (8/20 µs test) in the QDC, between each phase and PE and between neutral and PE (TN-S scheme), or phase-neutral + neutral-PE ("3+1" scheme).
- Parameters [N/P]:
  - **Uc ≥ 1.1 · Uo** → for Uo = 127 V: Uc ≥ 140 V (commercial: **175 V**); for Uo = 220 V: Uc ≥ 242 V (commercial: **275 V**). Between N and PE in TN-S: Uc ≥ Uo.
  - **In ≥ 5 kA** (8/20) per protection mode. Practice: In 10–20 kA, Imax 20–40 kA.
  - **Up ≤ 1.5 kV** on a 127/220 V network and ≤ 2.5 kV on 220/380 V (equipment category II).
  - SPD connection conductors: ≥ 4 mm² (copper) and as short as possible (sum ≤ 0.5 m [P]). Provide a backup breaker/fuse per the manufacturer.
- If there is an SPDA (lightning protection system) or a long underground entrance: evaluate a class I SPD at the entrance (NBR 5419). Out of scope for the typical chalet.

### 2.9 Grounding scheme

- Typical residential in Brazil: **TN-C-S**. The utility (concessionária) delivers a grounded neutral at the service entrance (rod in the standard installation); from the service entrance (or the QDC), neutral and PE run **separately** (TN-S) to the loads, and are never joined again after the split.
- Electrode [P]: copper-clad steel rod ⌀ 5/8" × 2.40 m (3 rods in line spaced ≥ 2.4 m when the utility requires); grounding conductor 6–16 mm² depending on the service. Ground resistance: NBR 5410 sets no value; utilities usually ask for ≤ 25 Ω [P/?].
- **Main equipotential bonding (BEP)** next to the QDC or the entrance: connect PE, electrode, metal piping, and **the LSF metal structure** [N 6.4.2.1: conductive elements of the building]. **Important point for LSF:** galvanized steel profiles must be bonded to the BEP (at least one point per structural panel/continuous frame) [P/?].
- TT (own electrode with no connection to the neutral) appears in rural areas. In that case the RCD is the main protection against shock and is mandatory on all circuits.

### 2.10 Conductor sizing algorithm (order)

```
para cada circuito:
  Ib = Pprojeto / (V · fator_fase)
  In = menor disjuntor padronizado ≥ Ib
  FCA = fator do trecho com mais circuitos; FCT = fator da temperatura do percurso
  S = menor seção ≥ Smin(tipo) tal que Iz_tab(método, n_carregados, S) · FCT · FCA ≥ In
  enquanto ΔV%(S) > limite_terminal (4%) ou ΔV_total > 5%: S = próxima seção
  (se S subiu por queda de tensão, In pode continuar igual)
  PE = f(S); neutro = S
  verificar DR obrigatório, curva (B/C) e equilíbrio de fases
```

Sources §2: [Prysmian: Guia de dimensionamento BT Rev9](https://br.prysmian.com/sites/default/files/atoms/files/Guia_de_Dimensionamento-Baixa_Tensao_Rev9.pdf) · [Prysmian: cabos de energia, construção e dimensionamento](https://br.prysmian.com/sites/br.prysmian.com/files/media/documents/Cabos_Energia_Construcao_Dimensionamento.pdf) · [Nambei: tabela do eletricista](https://api.aecweb.com.br/cls/catalogos/nambei/nambei_tabela_do_eletricista.pdf) · [Innovcable: tabelas NBR 5410](https://innovcable.com.br/wp-content/uploads/2025/09/TABELAS-DE-DIMENSIONAMENTO-NBR-5410-INNOVCABLE.pdf) · [IFSC: dimensionamento de condutores 2024](https://wiki.sj.ifsc.edu.br/images/b/ba/Dimensionamento_Condutores2024.pdf) · [IFSC: resolução de exercícios](https://wiki.sj.ifsc.edu.br/images/f/fb/Resolucao_Exercicios_Dim_Condutores_2024.pdf) · [IFPR: condutores e eletrodutos](https://wiki.foz.ifpr.edu.br/wiki/images/8/80/Dimensionamento-Condutores%26Eletrodutos.pdf) · [O Setor Elétrico: Tab. 36](https://www.osetoreletrico.com.br/?p=164354) · [IFRN: instalações BT parte 6](https://docentes.ifrn.edu.br/odailsoncavalcante/disciplinas/instalacoes-eletricas-de-bt-i/instalacoes-eletricas-de-bt-i-parte-6) · [UDESC: projeto residencial](https://www.udesc.br/arquivos/udesc/id_cpmenu/9731/projeto_residencial_3_v5_23_16945136712302_9731.pdf) · [Engehall: disjuntor DR](https://engehall.com.br/disjuntor-dr/) · [Sienge: dispositivo DR](https://sienge.com.br/blog/dispositivo-dr/) · [Siemens: catálogo DR](https://assets.new.siemens.com/siemens/assets/api/uuid:1b21f502-c9f7-4136-bb73-e8d58d6f3c42/catalogodr-junho2019.pdf) · [UDESC: choque elétrico](https://udesc.br/arquivos/udesc/id_cpmenu/9731/choque_eletrico_8_24_17230551344501_9731.pdf) · IEC 60364-5-52:2009, Annex B (Tab. B.52.2–B.52.17).

---

## 3. Conduits, boxes, and heights

### 3.1 Maximum fill ratio [N 6.2.11.1.6]

| Number of conductors in the conduit | Max occupied area (sum of outer areas / usable inner area) |
|---|---|
| 1 | 53% |
| 2 | 31% |
| ≥ 3 | 40% |

Check: `Σ (π · d_ext,i² / 4) ≤ ratio · (π · D_int² / 4)`. The same percentages appear in the NEC (Ch. 9, Tab. 1); NBR 5410 adopts them.

### 3.2 Length between boxes and bends [N 6.2.11.1.6 b / 6.2.11.1.7]

- Continuous **straight** run without a box: **≤ 15 m** indoors; **≤ 30 m** outdoors.
- With bends: **reduce 3 m per 90° bend**. Indoors: 1 bend → 12 m; 2 → 9 m; 3 → 6 m.
- **Maximum of 3 bends of 90° (270° accumulated)** between two boxes.
- Bends of other angles: sum the angles and count in 90° equivalents [P].
- Every conductor splice and tap must be **inside a box** (never inside the conduit) [N 6.2.8].

### 3.3 Conduit diameters [P / ?]

**Flexible corrugated PVC conduit** (NBR 15465; "conduíte", yellow for walls, orange for slab/floor) is the standard in drywall/LSF. Designated by **nominal outer diameter (DN)**:

| DN (mm) | "Inch" equivalent (market) | Approx. inner ⌀ (mm) | Inner area (mm²) | Usable area 40% (mm²) |
|---|---|---|---|---|
| 16 | 3/8" | 11.5 | 104 | 42 |
| 20 | 1/2" | 15.0 | 177 | 71 |
| 25 | 3/4" | 19.5 | 299 | 119 |
| 32 | 1" | 25.5 | 511 | 204 |
| 40 | 1 1/4" | 32.5 | 830 | 332 |

[?] The inner ⌀ of corrugated conduit varies by manufacturer (Tigre, Amanco/Wavin, Krona, Fortlev). The values above are approximate and should be replaced by those of the chosen catalog. Threaded rigid conduit (DN 20/25/32) has a larger inner ⌀: ≈ 16.4/21.3/27.5 mm [?].

Residential practice: **DN 20 (½") minimum for most branches; DN 25 (¾") for drops from the QDC and segments with many circuits; DN 32 (1") for the QDC feeder**. Many designers avoid DN 16.

### 3.4 Outer diameter of conductors [P]

Flexible cable 450/750 V, copper, PVC (e.g., Sil; other manufacturers ± 0.2 mm):

| Size (mm²) | Outer ⌀ (mm) | Outer area (mm²) |
|---|---|---|
| 1.5 | 3.0 | 7.1 |
| 2.5 | 3.6 | 10.2 |
| 4 | 4.2 | 13.9 |
| 6 | 4.7 | 17.3 |
| 10 | 6.1 | 29.2 |
| 16 | 7.2 | 40.7 |
| 25 | 8.9 | 62.2 |
| 35 | 10.2 | 81.7 |

[?] Sil cites 2.9 / 3.4–3.6 / 4.0 / 4.5 / 5.9 mm for 1.5–10 mm²; a generic reference cites 3.0 / 3.6 / 4.2 / 4.7. Use the larger (on the safe side). Values for 16–35 mm² are approximate (1 kV cable is larger).

**Practical table of number of conductors per conduit** (Pirelli/Procobre manual, all with the same size; conduit DN in mm):

| Size \ no. of conductors | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|
| 1.5 | 16 | 16 | 16 | 16 | 16 | 16 | 20 | 20 | 20 |
| 2.5 | 16 | 16 | 16 | 20 | 20 | 20 | 20 | 25 | 25 |
| 4 | 16 | 16 | 20 | 20 | 20 | 25 | 25 | 25 | 25 |
| 6 | 16 | 20 | 20 | 25 | 25 | 25 | 25 | 32 | 32 |
| 10 | 20 | 20 | 25 | 25 | 32 | 32 | 32 | 40 | 40 |
| 16 | 20 | 25 | 25 | 32 | 32 | 40 | 40 | 40 | 40 |

[?] Table based on the inner ⌀ of rigid conduit. With corrugated, **compute from the fill ratio** (§3.1) with the real inner ⌀. ChaléCAD must compute, not look up in a table.

### 3.5 Mounting heights (box center, from finished floor) [P; NBR 9050 for accessibility]

| Point | Usual height | Notes |
|---|---|---|
| Low outlet | **0.30 m** | Standard in living rooms and bedrooms |
| Mid-height outlet | **1.10–1.30 m** | Countertops (countertop 0.90 m + 0.20–0.30 m), desk, sink |
| High outlet | **2.00–2.20 m** | Split air conditioner (≈ 0.30 m below the ceiling), wall TV (1.20–1.60 m), range hood (1.90–2.10 m) |
| Switch | **1.10–1.30 m** (practice 1.10–1.20) | Accessible (NBR 9050): controls **0.60–1.00 m**; outlets 0.40–1.00 m |
| Switch + outlet on the same plate | 1.10 m | Common in hall and bedroom |
| Sconce | 1.80–2.10 m | Bathroom: above the mirror, ≈ 2.00 m |
| Electric shower (box/point) | **2.10–2.30 m** | Point outlet above the valve |
| Doorbell / intercom | 1.20–1.50 m | |
| QDC (center) | 1.50 m (top ≤ 1.80–2.00 m) | NBR 9050: controls 0.40–1.20 m for accessible [?] |
| Ceiling light point | ceiling height | Octagonal 4"×4" box or ceiling box |
| Floor outlet | 0 | Only with an appropriate floor box |

Lateral distance from the switch to the door: **0.10–0.20 m from the frame**, on the latch side (opening side) [P]. The current code uses 0.15 m and the freer side. The door leaf swing direction is not yet considered.

### 3.6 Floor-plan drawing conventions [P]

- Conduit **through the ceiling/false ceiling** (solid line): lighting branches and, in single-story houses with a ceiling, almost everything (drops down the wall to the box).
- Conduit **through the floor/subfloor** (dashed line): low outlets, when the radier (raft slab) has embedded conduits. **In the radier, floor conduits must be laid before the concrete pour**. This weighs on the construction work and ChaléCAD can warn about it.
- Vertical runs: "up" (up arrow) and "down" (down arrow) at transition points.
- On the plan, each conduit is annotated with its **⌀** and the **conductors** that pass through (strokes: phase, neutral, return, ground), numbered by circuit. E.g.: `⌀20 — 1,2 (F-N-T de C1 e C2)`.
- Typical topology: **tree** from the QDC; the circuit goes from box to box (light point → next light point → switch drops from the light point). Low outlets of a room are usually daisy-chained through the wall/floor.

### 3.7 Installation in drywall and LSF [P]

- Walls with C studs (Ue 90 or 140 mm in LSF; 48/70/90 mm in drywall). **The studs have factory holes (punch-outs)** for services, generally oblong (≈ 38 × 64 mm or ⌀ 35–50 mm), spaced along the profile [?: dimensions vary by manufacturer]. Extra holes in structural studs **only with the structural engineer's approval**, never in flanges and never near the ends.
- DN 20/25 corrugated conduit passes through the holes, with a **protection ring (grommet/PVC bushing)** so it does not get cut by the steel [P]. Cable without conduit inside the cavity is **not** accepted as a default: use conduit or double-insulated/multicore cable that is fastened [N 6.2.11; ?].
- **Drywall-specific** boxes (4×2, 4×4, octagonal), fastened by tabs/clamps on the gypsum board or OSB (e.g., Wavin, Tigre, Krona). In LSF with OSB + cement board on the outer face, use boxes fastened to the stud [P].
- **Design before closing the walls**: LSF assembly requires prior coordination among architecture, structure, and services. Box cutouts must be marked on the panel before closing. This makes plan + elevation design even more valuable.
- Horizontal runs inside the wall: pass through the stud holes at box height (0.30 m and 1.10 m) or go up/down to the ceiling. Avoid long horizontal chases in the board.
- Ceiling: conduit or cable tray above the ceiling, fastened to the ceiling frame or to the truss/purlin. With a sandwich roof panel, the temperature under the roof is moderate (FCT 30–35 °C).
- Insulation (wool) in the cavity: consider method A1 (§2.1).
- Bond the metal structure (§2.9).

Sources §3: [Engehall: caixa de passagem e distância máxima](https://engehall.com.br/caixa-de-passagem-eletrica/) · [IFSC: dimensionamento de eletrodutos e disjuntores](https://ifsc.kaptiva.com.br/pluginfile.php/270293/mod_resource/content/1/2%29%20Dimensionamento%20dos%20Eletrodutos%20e%20Tipos%20de%20Disjuntores.pdf) · [VIOX: cálculo de ocupação de eletroduto](https://viox.com/pt/how-to-calculate-conduit-fill/) · [Engehall: distribuição de eletrodutos](https://engehall.com.br/como-distribuir-eletrodutos/) · [Sil: tabela do eletricista](https://www.sil.com.br/tabelaeletricista.aspx) · [Wavin: caixas de luz drywall](https://mediahub.wavin.com/m/4cfd7902f4b7d8a8/original/FT-Caixas-de-luz-Drywall.pdf) · [Legrand: soluções de infraestrutura](https://www.legrand.com.br/sites/default/files/perfil/solucao_infraestrutura_0.pdf) · [CBCA: componentes leves](https://www.cbca-acobrasil.org.br/upfiles/downloads/noticias/Componentes-leves.pdf) · [PBQP-H: FAD 070 Steel Frame](https://pbqp-h.mdr.gov.br/wp-content/uploads/2024/08/FAD_070_SteelFrame-final_rev2-limpa.pdf) · [Monitor do Mercado: LSF e precisão antes de fechar paredes](https://monitordomercado.com.br/noticias/imoveis/408662-como-uma-casa-em-light-steel-frame-e-montada-e-por-que-a-obra-exige-precisao-antes-de-fechar-as-paredes/) · [ABCEM: perfis para drywall e LSF](https://www.abcem.org.br/construmetal/2016/downloads/apresentacao/46_ESPECIFICACAO-PARA-PERFIS-DE-DRYWALL-E-LIGHT-STEEL-FRAMING.pdf) · ABNT NBR 9050:2020 (control heights).

---

## 4. Demand, board, and service entrance

### 4.1 Typical utility demand method (CEMIG ND-5.1 and similar) [P / ?]

`D (kVA) = a + b + c + d + e + f`, where:

- **a**: lighting + TUG, applying the factor per installed-load band (table below);
- **b**: heating appliances (shower, faucet, heater, iron), with a factor by number of appliances;
- **c**: air conditioning, with a factor by number of appliances;
- **d**: motors/pumps: the largest motor at 100% + the others with a factor;
- **e**: others (oven, cooktop, microwave, dryer…), with a factor by quantity;
- **f**: special loads (EV charger: 100%).

**Demand factor for residential lighting and TUG** (classic CEMIG table, reproduced in Creder/Cotrim and handouts) [?: check the current revision, Table 10 of ND-5.1 2024]:

| Installed lighting + TUG load (kW) | FD |
|---|---|
| 0 < P ≤ 1 | 0.86 |
| 1 < P ≤ 2 | 0.75 |
| 2 < P ≤ 3 | 0.66 |
| 3 < P ≤ 4 | 0.59 |
| 4 < P ≤ 5 | 0.52 |
| 5 < P ≤ 6 | 0.45 |
| 6 < P ≤ 7 | 0.40 |
| 7 < P ≤ 8 | 0.35 |
| 8 < P ≤ 9 | 0.31 |
| 9 < P ≤ 10 | 0.27 |
| P > 10 | 0.24 |

Application: the FD is that of the band in which the **total** load falls, applied to the total load (not stepped). [?] Some utilities use a stepped version ("first kW at 86%, next at 75%…"). Store the mode in the catalog.

**Demand factor for resistive heating appliances/TUE by number of appliances** (typical table) [?]:

| No. of appliances | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | ≥ 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FD | 1.00 | 1.00 | 0.84 | 0.76 | 0.70 | 0.65 | 0.60 | 0.57 | 0.54 | 0.52 | 0.49 | 0.48 | 0.46 | 0.45 | 0.44 | 0.43 → 0.40 |

Residential air conditioning (typical): 1–10 appliances → 1.00 [?].

For a 40–150 m² chalet, the typical result is between **6 and 15 kVA**. Example: 3 kW lighting + TUG × 0.66 = 1.98; 2 showers 5.5 kW × 1.0 = 11; oven 2 kW + microwave 1.2 kW × ~0.8 ≈ 2.6 → D ≈ 15.6 kVA (the shower dominates).

### 4.2 QDC feeder and main breaker

- `Ib_main = D(VA) / V_FN` (single-phase) · `D / (2 · V_FN)` approx. for balanced two-phase · `D / (√3 · V_FF)` (three-phase).
- Main breaker = the service entrance breaker (defined by the utility) or one step below; feeder size per Iz and ΔV (≤ 1–2% on the feeder, to leave ≥ 3% for the final circuit within the 5% total [P]).
- Optional general RCD (4P/2P) or partial RCDs.

### 4.3 Service entrance (category) [P / ?: varies by utility]

Each distributor defines categories by installed load or demand, with breaker and service drop. Order of magnitude (127/220 V network; CEMIG ND-5.1, Enel, Energisa, Neoenergia):

| Type | Connection | Typical range | Typical breaker | Typical service drop (Cu) |
|---|---|---|---|---|
| Single-phase (A) | F + N | load up to ~8–12 kW (Energisa: demand ≤ 8.8 kW at 127 V) | 40–63 A | 6–16 mm² |
| Two-phase (B) | 2F + N | up to ~15–25 kW | 40–70 A | 10–25 mm² |
| Three-phase (C) | 3F + N | up to ~75 kW (LV limit) | 40–200 A | 10–95 mm² |

On a 220/380 V network (Northeast and Center-West), single-phase 220 V serves larger loads (220 V shower without two-phase). **A shower in a 127 V house usually forces a two-phase connection** (shower on F-F 220 V).

**Recommendation:** catalog `utilities: { [id]: { name, phaseNeutral, categories: [{ code, phases, maxLoadKw | maxDemandKva, breakerA, cableMm2 }] } }`, starting with CEMIG, Enel SP/RJ/CE, Copel, Celesc, CPFL, Neoenergia, Equatorial. The engine suggests a "probable category" and **always** warns: "confirm against your distributor's standard" (in the UI, in Portuguese: "confirmar na norma da sua distribuidora").

Sources §4: [CEMIG ND-5.1 (PDF, 2025)](https://www.cemig.com.br/wp-content/uploads/2025/10/nd5_1_000001p.pdf) · [CEMIG ND-5.1 (2024)](https://cemig.com.br/wp-content/uploads/2024/11/nd5_1_000001p.docx.pdf) · [UFV GESEP: Aula 8, demanda](https://gesep.ufv.br/wp-content/uploads/2021/08/Aula-8-Demanda-de-uma-instalacao.pdf) · [UFV GESEP: Aula 5, projeto](https://gesep.ufv.br/wp-content/uploads/2021/07/Aula-5-projeto-instalacoes-eletricas.pdf) · [USP: notas de fornecimento (Energisa 8,8 kW)](https://edisciplinas.usp.br/pluginfile.php/5073796/course/section/5917953/FOR.pdf) · [Enel RJ: fornecimento em tensão secundária](https://www.eneldistribuicao.com.br/rj/documentos/CNC-OMBR-MAT-18-0165-EDRJ%20-%20Fornecimento%20de%20Energia%20El%C3%A9trica%20em%20Tens%C3%A3o%20Secund%C3%A1ria.pdf) · [Energisa NDU 001](https://www.energisa.com.br/sites/energisa/files/media/documents/2025-02/NDU%20001%20-%20Vers%C3%A3o%206.3.pdf) · [Celpe: tabela de dimensionamento do padrão](https://servicos.neoenergiapernambuco.com.br/residencial-rural/Documents/Padr%C3%A3o%20de%20Entrada%20-%20PDF%C2%B4S%202021-desc/Tabela%20Dimensionamento%20T%C3%A9cnico%20Celpe%20-%20Padr%C3%A3o%20de%20Entrada.pdf) · [Engehall: dimensionar disjuntor geral](https://engehall.com.br/como-dimensionar-disjuntor-geral/) · [UDESC: manual simplificado do padrão de entrada](https://udesc.br/arquivos/udesc/id_cpmenu/9731/manual_simplificado_padrao_entrada_energia_eletrica_17218302494815_9731.pdf)

---

## 5. Lighting design

### 5.1 Reference illuminances by residential room

**NBR ISO/CIE 8995-1:2013** (which replaced NBR 5413) addresses **workplaces** and has no residential table. In Brazilian practice, **NBR 5413:1992** (withdrawn) continues to be used for residences, and **NBR 15575-1** gives minimum artificial lighting for housing [?: table not confirmed in this research]. Recommended design values (work-plane average, lux):

| Room | NBR 5413 (general: min/avg/max) | Local task (5413) | **ChaléCAD target (general)** | Minimum for warning |
|---|---|---|---|---|
| Living room | 100 / 150 / 200 | reading 300 / 500 / 750 | **150** (+ table lamp/pendant) | 100 |
| Kitchen | 100 / 150 / 200 | stove, sink, countertop 200 / 300 / 500 | **250** (countertop 300–500) | 150 |
| Bedroom | 100 / 150 / 200 | bed, mirror 200 / 300 / 500 | **150** | 100 |
| Bathroom | 100 / 150 / 200 | mirror 200 / 300 / 500 | **200** (mirror 300+) | 100 |
| Service area / laundry | 100 / 150 / 200 [?] | tub 200 / 300 / 500 | **200** | 100 |
| Hallway, hall, stairs | 75 / 100 / 150 | | **100** (stairs: 150 on the treads) | 75 |
| Garage | 75 / 100 / 150 | | **100** | 75 |
| Office/home office | 300 / 500 / 750 (ISO 8995: 500) | | **400** | 300 |
| Porch/outdoor area | 30–50 [P] | | **50** | 20 |
| Access, outdoor path | 5–20 [P] (wayfinding) | | **10** | 5 |

Complementary reference: EN 12464-1/IES for residences uses 100–300 lx general and 300–500 lx for tasks. Show the user "bands": **too little light / adequate / too much light**.

### 5.2 Lumen method

- Average illuminance: `E = (N · Φ · Fu · Fm) / A`
- Number of luminaires: `N = (E · A) / (Φ · Fu · Fm)` → round up, then adjust to the layout (grid).
- Φ = flux **of the luminaire** (lm) (for LED, the flux of the whole product; lamp flux × luminaire efficiency when they are separate).
- **Fm** (maintenance/depreciation factor): clean residential LED **0.80**; kitchen/greasy environment 0.70; outdoor 0.70 [P].
- **Room index**: `K = (c · l) / (h · (c + l))`, with c and l the room dimensions and h the distance from the luminaire to the work plane (plane at 0.75 m; kitchen 0.90 m; hallway 0 m [P]). For an irregular room: `K = 2 · A / (h · P)` (A area, P perimeter), equivalent for rectangles.
- **Fu** (utilization factor): comes from the manufacturer's photometric table as a function of K and the reflectances (ceiling/wall/floor). Approximation for a direct-distribution surface-mounted/recessed LED ceiling light/panel, reflectances 70/50/20 (white ceiling, light wall, medium floor) [P/?]:

| K | 0.6 | 0.8 | 1.0 | 1.25 | 1.5 | 2.0 | 2.5 | 3.0 | 4.0 | 5.0 |
|---|---|---|---|---|---|---|---|---|---|---|
| Fu | 0.36 | 0.44 | 0.50 | 0.56 | 0.60 | 0.66 | 0.70 | 0.73 | 0.77 | 0.80 |

Suggested corrections: dark wall (30%) → × 0.90; dark/wood ceiling (50%) → × 0.90; narrow-beam spot (≤ 36°) → × 1.05 on the plane, but with worse uniformity; indirect luminaire/pendant with diffuser → × 0.75. Linear interpolation. Approximate closed formula: `Fu ≈ 0,88 · K / (K + 0,8)` (error ≈ ± 0.03 over the 0.6–5 range) [own estimate; calibrate].

Example: 4 × 5 m living room, 2.60 m ceiling, plane 0.75 → h = 1.85; K = 20 / (1.85 × 9) = 1.20 → Fu ≈ 0.55. Target 150 lx: Φtotal = 150 × 20 / (0.55 × 0.8) = 6,818 lm → 4 ceiling lights of 1,800 lm (≈ 18 W each; 72 W in total; 3.6 W/m²) or 12 spots of 550 lm.

**Power density** reference for quick validation (LED): 2–5 W/m² in residential rooms [P].

### 5.3 Typical efficacy and luminaires (LED, BR market 2025–2026) [P]

| Type | Typical power | Typical flux | lm/W | Use |
|---|---|---|---|---|
| A60 bulb (E27) | 9 W / 12 W / 15 W | 806 / 1,050–1,100 / 1,400–1,500 lm | 90–100 | Pendant, ceiling light with socket |
| Surface-mounted LED ceiling light (round/square) | 12 / 18 / 24 / 36 W | 1,000 / 1,500–1,800 / 2,000–2,400 / 3,200 lm | 80–100 | General lighting |
| Recessed panel/downlight | 6 / 12 / 18 / 24 W | 450 / 1,000 / 1,500 / 2,000 lm | 75–90 | Plasterboard ceiling |
| Recessed spot (GU10/MR16 halogen-style or integrated) | 4.8–7 W | 350–550 lm | 70–85 | Accent, general lighting in a grid |
| Sconce | 5–10 W | 300–800 lm | 60–80 | Wall, bathroom, outdoor |
| Decorative pendant | 9–15 W (lamp) | 800–1,500 lm | 60–90 (with shade) | Dining table, countertop |
| LED strip 4.8 W/m | 4.8 W/m | 350–450 lm/m | 70–90 | Cove, baseboard, furniture |
| LED strip 9.6–10 W/m | 10 W/m | 800–1,000 lm/m | 80–100 | Cove for general lighting |
| LED strip 14.4 W/m | 14.4 W/m | 1,200–1,400 lm/m | 85–100 | Strong cove |
| Garden bollard/stake light | 1–5 W | 50–300 lm | 50–70 | Paths, outdoor stairs |
| Outdoor LED floodlight | 20 / 30 / 50 W | 1,800 / 2,700 / 4,500 lm | 85–100 | Facade, yard |
| Outdoor sconce with sensor | 8–12 W | 600–1,000 lm | 70–80 | Access |
| Garden post/bollard | 7–12 W | 500–1,000 lm | 70–80 | Outdoor areas |

Color temperature: **2700–3000 K** (warm) in living rooms and bedrooms; **3000–4000 K** in kitchen, bathroom, and service area; CRI ≥ 80 (≥ 90 at the bathroom mirror). LED strip requires a driver/power supply (12/24 V), with the **supply sized with ≥ 20% headroom** and voltage drop along the strip (max ~5 m per feed at 12 V, ~10 m at 24 V [P]).

### 5.4 Luminaire layout (how architects position them) [P]

- **Regular grid**: Nx × Ny luminaires with Nx/Ny ≈ c/l. Spacing between luminaires S ≤ **SHR × h**, with SHR (spacing-to-height ratio) from the manufacturer, typically **1.0–1.5** for ceiling light/panel and **0.8–1.2** for medium-beam spot.
- **Distance to the wall ≈ S/2** (S/3 when there is a task against the wall, such as a kitchen countertop or wardrobe).
- Algorithm: `Nx = round(sqrt(N · c / l))`, `Ny = ceil(N / Nx)`; `Sx = c / Nx`, first luminaire at `Sx / 2` from the wall.
- **Room center** for 1 luminaire; align with furniture axes (dining table: pendant centered on the table 0.70–0.85 m above the tabletop; bed: avoid direct light over the pillow; countertop: spots or strip under the wall cabinet; bathroom mirror: side sconces or front light, never only from above).
- **Double ceiling height/mezzanine (loft)** (common in chalets): long pendants or adjustable spots on the wall/beam, and indirect upward light on the sloped roof. Maintenance is difficult: prefer accessible sconces.
- **Stairs**: bollards on the wall ~0.30 m from the step, or strip under the handrail; illuminate the first and last step.

### 5.5 Control (switches)

- NBR 5410 requires **1 light point controlled by a switch per room** [N 9.5.2.1.1]. **There is no explicit normative requirement for three-way (parallel) switching**. It is good practice, and NBR 9050 asks for accessible controls on routes.
- Good-practice rules for the assistant [P]:
  - **Stairs**: three-way switches at the top and bottom. On stairs with 3+ access points: three-way + **intermediate (four-way)**.
  - **Hallway > 5 m** or with 2+ accesses: three-way at the ends.
  - **Room with 2 doors** more than ~3 m apart: three-way.
  - **Bedroom**: optional three-way door/bedside.
  - **Porch/outdoor**: interior switch next to the door; optional presence sensor/photocell.
  - Switch on the latch side, 0.10–0.20 m from the frame, on the **inside** of the room (except bathroom/storage, where it may be outside [P]).
- Number of sections: 1 section per group of luminaires that turn on together (e.g., living room: general + spots + pendant = 3-section switch).
- Modern alternative: pushbutton + impulse relay, or smart switches (require neutral in the box: **recommend bringing neutral to every switch box**).
- Wiring: simple switch = phase + return; three-way = phase + 2 travelers + return; intermediate = 4 travelers. This automatically defines the conductors in the conduits (§3).

### 5.6 Outdoor lighting

- Access/door: sconce 600–1,000 lm, preferably with photocell or presence sensor.
- Paths: bollards every 1.5–3 m (5–20 lx).
- Deck/porch: 30–50 lx; avoid glare and blue light (insects: 2700 K or amber).
- Facade/trees: floodlights with IP65+, narrow beam.
- Degree of protection: covered outdoor IP44; exposed IP65; floor bollard IP67.
- Outdoor outlet circuits: 30 mA RCD (§2.7). Outdoor lighting below 2.5 m: consider an RCD.

### 5.7 Light in the 3D presentation (three.js) [short note]

- With `renderer.useLegacyLights = false` (default since r155; physical units), **intensity = candela (cd)**.
- **PointLight**: `intensity = Φ / (4π)` (isotropic source); `light.power = Φ` does the conversion itself.
- **SpotLight**: three.js uses `power = intensity · π` (convention, independent of the angle) → `intensity = Φ / π`. For a 500 lm spot: 159 cd. Angle: `angle = beamAngle/2` (rad); penumbra 0.3–0.5.
- **RectAreaLight** (panel, strip): `power` in lm, with intensity in nits (cd/m²). Good for cove/strip.
- Distance/decay: `decay = 2` (inverse square), `distance = 0` or ~10 m to limit cost.
- Requires **tone mapping** (`ACESFilmicToneMapping`/`AgXToneMapping`) and adjusted exposure (≈ 0.5–1.0). Without it, residential scenes at real lux levels come out blown out or dark.
- Performance: limit shadows to 2–4 main lights; for many luminaires, use **lightmaps/baking** or clusters. For the 60 fps target, only the N nearest luminaires get real light; the others become emissive (`emissiveIntensity`) + bloom.
- Color: CCT → RGB (2700 K ≈ #FFB46B; 3000 K ≈ #FFC184; 4000 K ≈ #FFD8B0; 6500 K ≈ #FFFFFF, approximations of the Planckian locus).

Sources §5: [Lar Pontual: projeto luminotécnico (faixas por cômodo)](https://larpontual.com.br/portal/projeto-luminotecnico) · [IFPB: projeto pela NBR ISO/CIE 8995-1](https://repositorio.ifpb.edu.br/bitstream/177683/2811/1/Lucas%20Alves%20Trajano%20-%20Projeto%20de%20ilumina%c3%a7%c3%a3o%20interna%20de%20uma%20escola%20de%20ensino%20fundamental%20e%20m%c3%a9dio%20utilizando%20a%20norma%20NBR%20ISO-%20CIE%208995-1.pdf) · [UFCG: avaliação de iluminação de recintos](https://bdtd.ufcg.edu.br/jspui/bitstream/riufcg/30415/1/AVALIA%c3%87%c3%83O%20DE%20ILUMINA%c3%87%c3%83O%20DE%20RECINTOS%20-%20ANAIS%20V%20SIMEP%20ARTIGO%202017.pdf) · [UnB: desempenho lumínico (NBR 15575)](https://repositorio.unb.br/bitstream/10482/50851/1/ARTIGO_ValidacaoDesempenhoLuminico.pdf) · [Normas.com.br: desempenho das edificações habitacionais](https://www.normas.com.br/visualizar/artigo-tecnico/3314/o-desempenho-das-edificacoes-habitacionais) · [three.js: SpotLight](https://threejs.org/docs/pages/SpotLight.html) · [three.js forum: lighting r155](https://discourse.threejs.org/t/updates-to-lighting-in-three-js-r155/53733/1) · [three.js forum: luminous intensity calculation](https://discourse.threejs.org/t/luminous-intensity-calculation/19242) · EN 12464-1:2021 · IES Lighting Handbook (residential).

---

## 6. UX: how professional tools do it

### 6.1 Overview

| Tool | Point placement | Circuits | Conduits/wiring | Outputs |
|---|---|---|---|---|
| **AltoQi QiBuilder (QiElétrico)**, BR, BIM on IFC | NBR symbol library; click on the plan; outlet "snaps" to the wall with height by type; luminaires with photometry | Manual assignment by selection or automatic distribution; automatic sizing (size, breaker, RCD, voltage drop) | **Automatic conduit routing** between points and board; wiring "passes" automatically through the conduits (computes conductors in each segment and checks fill) | Load schedule, single-line and multi-line diagrams, bill of materials, drawing sheets (pranchas) |
| **Lumine (AltoQi Lumine V4)**, BR legacy in CAD | Same, on DWG | Automatic with editing | Manual conduit routing with automatic wiring | Load schedule, single-line, quantity takeoff |
| **Revit MEP (Electrical)** | Families hosted on the wall/ceiling face (height by "offset") | Select devices → "Power" → choose panel; automatic pole numbering; **Panel Schedule** | 2D wire (arc/chamfer) with **home run arrow** pointing to the panel; manual 3D conduit; add-ins such as EVOLVE and Automatic Conduit do auto-routing | Panel schedule, load classification with demand factors, voltage drop calculations (2025+ improved the "circuit path") |
| **Archicad MEP Modeler** | 3D MEP objects | Weak on circuits (focus on routes) | 3D cable tray/conduit routes with connections | Schedules |
| **ProfiCAD** | 2D electrical schematics (not a BIM plan) | — | — | Single-line/multi-line diagrams, bill of materials |
| **Vectorworks Spotlight/MEP** | Devices with circuit | "Create circuit" with selection | 2D wire | Reports |

Typical design workflow in QiBuilder (academic reports): (1) configure the project (voltage, utility, criteria); (2) place light points and controls; (3) place TUG and TUE; (4) place boards and distribute circuits; (5) place conduits and wiring; (6) generate drawing sheets and reports.

### 6.2 UX lessons for a layperson

1. **Start from an automatic design and let the user edit** (ChaléCAD already generates points): "Gerar projeto elétrico" (Generate electrical design) → everything appears on the plan; the user moves, deletes, and adds. This beats a blank screen.
2. A short, visual **symbol palette**: Ceiling light · Spot · Pendant · Sconce · LED strip · Switch (1/2/3 sections, three-way) · Low/mid/high outlet · TUE (with equipment list) · Board. NBR 5444 icons **and** an illustrative icon, with a legend.
3. **Smart snap**: an outlet/switch clicked near a wall → snaps to the interior face of the room, perpendicular, at the **default height for the type** (0.30 / 1.10 / 2.20); avoids doors and windows (moves out of the opening); the switch suggests the latch side. Luminaire → ceiling, with a grid suggestion ("distribute 4 luminaires in the living room").
4. **Live feedback** in the room: badge with "estimated lux 180 lx ✓", "outlets 4/4 minimum ✓", "RCD required ⚠".
5. **Automatic circuits with colors**: each circuit has a color on the plan; drag a point to another circuit in the side list; "redistribute circuits" button. Show the circuit load bar (% of In) and voltage drop.
6. **Conduit**: (a) **auto-route** ("trace conduits" button): generates a minimal tree through the ceiling/floor respecting the 15 m/3-bend rules, creating pull boxes when needed; (b) **draw a polyline** (click by click, with snap to boxes and orthogonal); (c) edit vertices. Conductors computed automatically per segment (phase/neutral/return/ground marks), with the conduit ⌀ auto-sized and a red highlight if the fill is exceeded.
7. **"Ceiling" mode and "Floor" mode** (layers): solid × dashed line, as in the convention.
8. **Outputs**: load schedule (table by circuit and phase), generated single-line diagram (SVG), bill of materials (cables by color/size in meters with waste, conduits by DN, 4×2/4×4/octagonal boxes, breakers, RCDs, SPDs, outlet/switch modules, plates, luminaires), budget integrated with the pricebook.
9. **Warnings explained in plain language**, each with the standard item and a "fix" button (e.g., "Add missing outlet", "Change cable to 4 mm²").
10. **3D view**: boxes and conduits inside the LSF walls, drawn together with the studs, with conflict detection against a stud without a hole or against a column/beam.

Sources §6: [AltoQi: guia de boas práticas em projetos elétricos](https://lps.altoqi.com.br/hubfs/%5BMKT%5D%20Materiais%20Ricos/Ebooks/%5BEbook%5D%20Guia%20de%20boas%20praticas%20para%20projetos%20eletricos%20(1).pdf) · [ANTAC SBTIC: fluxo no QiBuilder](https://eventos.antac.org.br/index.php/sbtic/article/download/568/805/3391) · [Revista FT: BIM com AltoQi Builder](https://revistaft.com.br/a-aplicacao-da-modelagem-da-informacao-da-construcao-bim-na-facilidade-de-instalacoes-eletricas-com-o-uso-do-altoqi-builder/) · [Hotmart: curso QiBuilder elétrica](https://hotmart.com/pt-br/marketplace/produtos/curso-qibuilder-eletrica/O102081306P) · [Voltimum: BIM capítulo III](https://content.voltimum.com/br/2408/capiii_bim_158.pdf) · [Autodesk: adicionar fiação a circuitos](https://www.autodesk.com/learn/ondemand/course/mep-electrical-design/unit/5ZoFtJJ3cMtpKrzA1PDqrL) · [Autodesk Help: fiação opcional](https://help.autodesk.com/cloudhelp/2020/ENU/Revit-Model/files/GUID-553F57D3-F2A9-4FF8-BD95-C4C190728FEE.htm) · [Revit 2026: Improved Electrical Circuit Path](https://help.autodesk.com/cloudhelp/2026/ENU/Revit-WhatsNew/files/GUID-42130FED-AA81-4D98-BF56-326FAC5D6E1B.htm) · [AUGI: Revit electrical panels](https://augi.com/articles/detail/revit-electrical-panels-explained) · [EVOLVE: Auto Route](https://help-electrical.evolvemep.com/article/wvh6fsawu8-auto-route) · [Autodesk Marketplace: Automatic Conduit](https://marketplace.autodesk.com/apps/22c67788-7b13-4a9c-a81e-3847bc6e92a6) · [Vectorworks: creating a circuit](https://app-help.vectorworks.net/2025/eng/VW2025_Guide/MEP/Creating_a_circuit.htm) · [Engehall: como ler projeto elétrico](https://engehall.com.br/como-ler-projeto-eletrico-predial/)

---

## 7. Plan symbols (NBR 5444:1989, withdrawn in 11/2014 with no replacement, still in use)

NBR 5444 was withdrawn without replacement, but its symbology remains the de facto convention in Brazilian residential projects. International alternative: IEC 60617. Summary of the symbols (geometric description for implementing in SVG):

| Element | Usual plan symbol | Annotations |
|---|---|---|
| **Conduit embedded in ceiling/slab** | Solid line | ⌀ beside it (e.g., "20") |
| **Conduit embedded in floor** | Dashed line | |
| Exposed conduit | Dash-dot line | |
| Conduit going up / down | Perpendicular arrow leaving the point (↑ up, ↓ down), sometimes a circle with an arrow | |
| Conductors in the conduit | Short strokes crossing the line: **phase** = stroke with a dot/solid bar; **neutral** = plain stroke; **return** = stroke with a hook/half-moon; **ground (PE)** = stroke with a bar/"T" | Circuit no. beside each stroke; size when different from the default |
| **Ceiling light point** | Circle (⌀ ~6–8 mm at print scale) divided into 4 sectors: top = circuit no.; left = power (W/VA); bottom/right = control letter (a, b, c…) | E.g.: "100 / 2 / a" |
| Wall light point (sconce) | Semicircle/smaller circle against the wall with a stroke | Same annotations |
| Fluorescent/linear luminaire (strip, profile) | Elongated rectangle | |
| Spot/recessed | Small circle with an "x" or cross [P] | |
| **Simple switch** | Small circle (⌀ ~3 mm) with control letter(s) ("a"; 2 sections "a b") | Circuit no. beside it |
| **Three-way (parallel) switch** | Circle with an internal stroke/filled semicircle, or "S3" [P] | Control letter |
| Intermediate (four-way) switch | Circle with two strokes / "S4" [P] | |
| Pushbutton/doorbell | Circle with a dot / small square | |
| **Low outlet** (0.30 m) | **Hollow** triangle (or half triangle) against the wall, tip pointing into the room | Power (VA) and circuit no. |
| **Mid-height outlet** (1.10–1.30 m) | Triangle with half filled | |
| **High outlet** (2.00–2.20 m) | **Filled** triangle | |
| Floor outlet | Triangle inside a square | |
| **TUE** | Triangle with power and equipment indication, or its own symbol (e.g., shower: circle with "CH"/outlet point) | |
| **Distribution board (QDC)** | Rectangle with half hatched (flush) or hollow (surface) | Name "QDC" |
| Meter/service entrance board | Rectangle with "M" | |
| Pull box | Square (on the floor, with "X") | |
| Doorbell button / buzzer | Circle with a dot / bell symbol | |
| Telephone, TV, data | Triangle with "T", "TV", "D" or a specific outlet symbol | Low-voltage infrastructure |
| Grounding | Three decreasing horizontal strokes | |

Note: there are regional and office variations (e.g., outlet by "half circle" in the Pirelli/Procobre standard: hollow/half-filled/filled half-moon for low/mid/high). **Recommendation:** symbols configurable via a `symbolSet: 'NBR5444' | 'Procobre' | 'IEC'`, and always a **generated legend** on the drawing sheet (prancha).

Sources §7: [IFPR: NBR 5444 (PDF)](https://wiki.foz.ifpr.edu.br/wiki/images/b/b8/NBR5444.pdf) · [UFV GESEP: Aula 2, normas e simbologia](https://gesep.ufv.br/wp-content/uploads/2021/07/Aula-2-normas-e-simbologia.pdf) · [Normas.com.br: NBR 5444 (status)](https://www.normas.com.br/visualizar/abnt-nbr-nm/7854/abnt-nbr5444-simbolos-graficos-para-instalacoes-eletricas-prediais) · [SENAI SC: instalações elétricas](https://ia601704.us.archive.org/31/items/Material5/InstalaesEltricas-Senai-Sc.pdf) · [FM2S: símbolos elétricos](https://www.fm2s.com.br/blog/simbolos-eletricos) · [IFSC: aula PJI](https://wiki.sj.ifsc.edu.br/images/archive/0/07/20180225144558!Aula_01_-_PJI11101.pdf)

---

## 8. Proposed spec for ChaléCAD

### 8.1 Principles

- The **drawn electrical design** becomes part of the project JSON (source of truth = what the user placed), in `project.electrical`. Calculations (loads, sizes, ΔV, quantity takeoff, lux) remain **derived** by pure functions.
- The current estimator becomes the **initial layout generator** ("Gerar automaticamente", Generate automatically), which fills `project.electrical` once; afterwards the user edits. Without `project.electrical`, the engine keeps estimating as today (compatibility).
- Schema change = orchestrator session (`packages/engine/src/schema`, `packages/catalog/src/schema.ts`), with `schemaVersion` + migration.
- Coordinates in meters, z up, plan positions referenced to the level (`level`), heights from the finished floor of the level.

### 8.2 Data model (TypeScript)

```ts
// ---- Projeto (fonte de verdade) ----
type Id = string;

interface ElectricalProject {
  supply: {
    utilityId: string | null;          // chave em catalog.electrical.utilities
    phaseNeutral: 127 | 220;           // tensão F-N
    phases: 1 | 2 | 3;                 // ligação desejada (null = automático)
    earthing: 'TN-C-S' | 'TN-S' | 'TT';
    feederLength: number;              // m, padrão de entrada → QDC (para ΔV e cabo)
    ambientTemp: number;               // °C (padrão 30)
  };
  panels: Panel[];                     // normalmente 1 (QDC); mezanino pode ter 2º
  points: ElecPoint[];                 // tomadas, interruptores, TUE, pontos de luz
  luminaires: Luminaire[];             // ligadas a um ponto de luz (1 ponto : n luminárias)
  conduits: Conduit[];                 // polilinhas (trechos entre nós)
  boxes: Box[];                        // caixas de passagem explícitas (as dos pontos são implícitas)
  circuits: CircuitDef[];              // definição editável (pontos atribuídos, overrides)
  switchGroups: SwitchGroup[];         // comando: quais luminárias cada seção acende
  options: {
    autoCircuits: boolean;             // redistribuir quando pontos mudam
    autoConduits: boolean;             // re-rotear quando pontos mudam
    drPolicy: 'norm' | 'allSockets' | 'all';
    symbolSet: 'NBR5444' | 'Procobre' | 'IEC';
    wetOver6Rule: boolean;             // regra 600 VA × 2 quando > 6 pontos (§1.3)
  };
}

interface Panel {
  id: Id; name: string; level: Id;
  position: [number, number]; wallId: Id | null; height: number; // centro, padrão 1,50
  mounting: 'flush' | 'surface';
  ways: number | null;                 // nº de módulos DIN (null = calcular)
}

type PointKind =
  | 'socket'          // TUG
  | 'socket_tue'      // TUE (com appliance)
  | 'switch'          // simples/paralelo/intermediário, n seções
  | 'light_outlet'    // ponto de luz (teto ou parede)
  | 'data' | 'tv' | 'bell';            // infra seca (sem carga)

interface ElecPoint {
  id: Id; kind: PointKind; level: Id;
  position: [number, number];          // em planta; na face da parede quando hostWallId != null
  hostWallId: Id | null;               // null = teto/piso
  side: 1 | -1 | null;                 // face da parede (para qual cômodo aponta)
  height: number;                      // m acima do piso acabado (0,30 / 1,10 / 2,20 / teto)
  heightClass: 'low' | 'mid' | 'high' | 'ceiling' | 'floor';
  roomId: Id | null;                   // derivável, mas guardado para estabilidade
  mount: 'ceiling' | 'wall' | 'floor';
  // carga
  powerVA: number | null;              // null = regra normativa (100/600 VA, ou soma das luminárias)
  powerFactor: number;                 // padrão 1,0 (resistivo) / 0,92 (LED, eletrônicos) / 0,8 (motor)
  appliance: string | null;            // chave em catalog.electrical.appliances (TUE)
  voltage: 'FN' | 'FF';                // F-N (127/220) ou F-F (220 em rede 127/220)
  modules: number;                     // nº de módulos na caixa (tomada dupla = 2)
  ip: 'IP20' | 'IP44' | 'IP54' | 'IP65';
  circuitId: Id | null;
  // interruptor
  switchType?: 'one_way' | 'two_way' | 'intermediate' | 'dimmer' | 'pulse';
  gangs?: number;                      // nº de seções (teclas)
  locked: boolean;                     // usuário fixou: o auto não move
}

interface Luminaire {
  id: Id; pointId: Id;                 // ponto de luz que a alimenta
  catalogId: string | null;            // catalog.electrical.luminaires
  type: 'plafon' | 'downlight' | 'spot' | 'pendant' | 'wall' | 'strip' | 'bollard' | 'flood';
  position: [number, number, number];  // x, y em planta; z = altura de montagem
  lumens: number; watts: number; cct: number; cri: number;
  beamAngle: number | null;            // graus (spots)
  length: number | null;               // m (fita LED); lumens/watts por metro × length
  lightingFactor: number | null;       // Fu override; null = estimar por K
}

interface SwitchGroup {                // "tecla a do interruptor X (e do paralelo Y) acende luminárias L1, L2"
  id: Id; letter: string;              // 'a', 'b', … (anotação em planta)
  switchPointIds: Id[];                // 1 = simples; 2 = paralelo; 3+ = paralelo + intermediários
  lightPointIds: Id[];
}

interface Conduit {
  id: Id; level: Id;
  path: [number, number, number][];    // polilinha 3D (z = altura acima do piso do nível)
  run: 'ceiling' | 'floor' | 'wall' | 'exposed' | 'underground';
  type: 'corrugated' | 'rigid' | 'flexible_metal' | 'pead';
  dn: number | null;                   // mm; null = dimensionar
  from: NodeRef; to: NodeRef;          // ponto, caixa, QDC
  auto: boolean;                       // gerado pelo auto-route (pode ser re-roteado)
}
type NodeRef = { kind: 'point' | 'box' | 'panel'; id: Id };

interface Box {
  id: Id; level: Id; position: [number, number, number];
  type: '4x2' | '4x4' | 'octagonal' | 'floor' | 'pull';
}

interface CircuitDef {
  id: Id; panelId: Id; number: number; name: string;
  kind: 'lighting' | 'sockets' | 'wet_sockets' | 'tue' | 'mixed' | 'feeder';
  phases: ('R' | 'S' | 'T')[];         // 1 (F-N) ou 2 (F-F) fases atribuídas
  method: 'B1' | 'B2' | 'A1' | 'D' | null; // null = deduzir do percurso
  overrides: { sectionMm2?: number; breakerA?: number; curve?: 'B' | 'C'; drId?: Id | null };
}

// ---- Resultado (derivado, nunca salvo) ----
interface CircuitResult {
  id: Id; powerVA: number; powerW: number; ib: number; voltage: number;
  phases: string[]; method: string; loadedConductors: 2 | 3;
  fca: number; fct: number; iz: number; izCorrected: number;
  sectionMm2: number; neutralMm2: number; peMm2: number;
  breaker: { in: number; curve: 'B' | 'C'; poles: 1 | 2 | 3 };
  dr: { required: boolean; reason: string[]; groupId: Id | null; sensitivityMa: 30 };
  lengthM: number; voltageDropPct: number; voltageDropTotalPct: number;
  sizingReason: 'ampacity' | 'voltage_drop' | 'minimum';
  cable: { phase: number; neutral: number; pe: number; return: number }; // metros por cor
}
interface ConduitResult {
  id: Id; length: number; bends90: number; dn: number;
  conductors: { circuitId: Id; role: 'F' | 'N' | 'PE' | 'R' | 'T'; sectionMm2: number }[];
  fillPct: number; fillLimitPct: number; circuitsCount: number;
}
interface RoomLightingResult {
  roomId: Id; area: number; K: number; fu: number; fm: number;
  lumens: number; avgLux: number; targetLux: number; minLux: number;
  wPerM2: number; status: 'low' | 'ok' | 'high';
}
interface ElectricalReport {
  circuits: CircuitResult[]; conduits: ConduitResult[]; lighting: RoomLightingResult[];
  loadTable: LoadTableRow[];           // quadro de cargas: circuito × fase × VA
  phaseBalance: { R: number; S: number; T: number; imbalancePct: number };
  demand: { installedKw: number; demandKva: number; byGroup: Record<string, number>; method: string };
  entrance: { category: string | null; breakerA: number | null; cableMm2: number | null; note: string };
  panel: { ways: number; reserves: number; main: { in: number; poles: number }; drs: DrGroup[]; dps: DpsSpec };
  bom: BomLine[];                      // lista de materiais
  warnings: EngineWarning[];
  disclaimer: string;                  // DISCLAIMER
}
```

### 8.3 Calculation pipeline (order)

All pure, running in the Worker (Comlink), input = `Project + Catalog`:

1. **Context**: rooms (polygon, area, perimeter, use, ceiling height), walls with faces and openings (`buildModel`), levels.
2. **Assign room** to each point/luminaire (point-in-polygon; wall points → the room on the `side` side).
3. **Loads per point** (§1): TUG by rule (100/600 VA, count per wet room, optional > 6 points rule); TUE by appliance; light point = max(room area rule distributed, Σ luminaires in VA = W/PF).
4. **Per-room minimum checks** (§1.1–1.2): number of light points, TUG by perimeter, 2 outlets on the countertop, bathroom, porch.
5. **Lighting** (§5): per room, K → Fu → average E; W/m² density; status from the target table.
6. **Control**: validate `SwitchGroup` (every light point has a control; stairs/long hallway suggests three-way).
7. **Circuits**: if `autoCircuits`, (re)group respecting §1.5 (lighting × outlets; kitchen and service exclusive; TUE > 10 A isolated; VA limit per circuit `circuitMaxA × V`; spatial proximity). Then distribute phases by *greedy balancing* (largest load first → least loaded phase; F-F occupies two phases).
8. **Conduit topology**: if `autoConduits`, auto-route (below); build the **graph** (nodes = points, boxes, QDC; edges = conduit segments). For each circuit, derive the path in the graph from the QDC to each point (Steiner tree approximated by the union of shortest paths).
9. **Conductors per segment**: for each segment, which circuits pass and in which roles (F, N, PE; returns and travelers between switch and light point per `SwitchGroup`).
10. **Factors**: FCA per circuit = worst segment (number of circuits in the segment); FCT from the route temperature (ceiling/outdoor); method (B1, or A1 if wall with cavity insulation; D buried).
11. **Sizing** (§2.10): Ib → In (curve C default; B for shower/resistive optional) → S by Iz' → ΔV by moments along the tree → raise S if needed → neutral, PE.
12. **Conduits**: length, bends per segment between boxes (validate 15 m − 3 m/bend, ≤ 3 bends; insert suggested pull box), minimum DN from fill ratio.
13. **RCD/SPD/board**: RCD by rule (§2.7) and policy; grouping into RCDs (≤ ~4–5 circuits per RCD [P]); SPD per Uo; number of DIN modules = breakers (1P = 1 module, 2P = 2) + RCD (2P = 2 modules, 4P = 4) + SPD (1 per pole) + main + spares (§1.5 item 6) → commercial QDC enclosure (12, 18, 24, 36 modules).
14. **Demand and service entrance** (§4): groups a–f with factors from the utility catalog; main Ib; probable category; feeder (Iz, ΔV ≤ 5% − largest terminal ΔV).
15. **Quantity takeoff (BOM)**: cables by size and color = Σ (segment length × number of conductors of that role) + **0.30 m slack per box per conductor** + waste (catalog, ~10%); conduits by DN (+ 5–10%); boxes by type; bends/couplings; modules (10 A/20 A outlet, switch by type), supports, plates; breakers by In/poles/curve; RCD; SPD; busbars; QDC; luminaires and lamps; grounding rod and cable. Price via pricebook.
16. **Warnings** (§8.4) + `DISCLAIMER`.

**Auto-route (simple, predictable proposal):**
- Graph of candidate "corridors": (a) the level's ceiling space (orthogonal grid parallel to the walls, over the projection of the rooms), (b) inside the walls (verticals at the box positions; horizontals only at heights of 0.30/1.10 m and only if the wall is LSF/drywall), (c) floor (radier), optional and off by default.
- Cost = length + penalty per bend (e.g., 1.5 m) + penalty for crossing a structural wall (holes) + penalty for changing corridor.
- For each circuit: approximate Steiner tree (Prim from the QDC over the graph, connecting the terminal closest to the tree). Merge circuits that share corridors into the same conduit up to the fill limit (FCA also grows: prefer ≤ 3–4 circuits per conduit).
- Post-processing: insert a pull box when the segment violates 15 m − 3 m/bend or 3 bends; simplify collinear segments.

### 8.4 Validations and warnings (with thresholds and basis)

| Code | Severity | Condition | Basis |
|---|---|---|---|
| `elec.room.no_light` | error | room without a ceiling light point (bathroom: sconce accepted) | NBR 5410 9.5.2.1.1 |
| `elec.room.light_no_switch` | error | light point without a switch (`SwitchGroup`) | 9.5.2.1.1 |
| `elec.room.sockets_min` | error | TUG < minimum (3.5 m / 5 m of perimeter; area rules) | 9.5.2.2.1 |
| `elec.kitchen.counter_sockets` | error | countertop ≥ 0.30 m without 2 outlets above it | 9.5.2.2.1 |
| `elec.bath.socket_zone` | error | outlet at < 0.60 m from the shower stall/bathtub (zones 0–2) | 9.1 |
| `elec.bath.no_socket` | error | bathroom without an outlet next to the sink | 9.5.2.2.1 |
| `elec.circuit.mixed` | error/warning | lighting and TUG on the same circuit outside the conditions (Ib ≤ 16 A etc.) | 9.5.3.2 |
| `elec.circuit.wet_shared` | error | kitchen/service outlet on a circuit with other rooms | 9.5.3.3 |
| `elec.circuit.tue_shared` | error | equipment with In > 10 A without an exclusive circuit | 9.5.3.4 |
| `elec.circuit.overload` | error | Ib > In or In > Iz' | 5.3.4.1 |
| `elec.circuit.load_high` | warning | load > 1,270 VA (127 V) / 2,200 VA (220 V) on a TUG/general lighting circuit | Procobre practice |
| `elec.circuit.min_section` | error | size < 1.5 (lighting) / 2.5 (power) | 6.2.6.1.1 |
| `elec.vdrop.terminal` | error | terminal ΔV > 4% (warning from 3%) | 6.2.7.1 |
| `elec.vdrop.total` | error | service entrance + feeder + terminal ΔV > 5% | 6.2.7.1 |
| `elec.dr.missing` | error | circuit in a location with shower/bathtub, kitchen, service area, laundry, garage, outdoor area, without a 30 mA RCD (except lighting ≥ 2.5 m) | 5.1.3.2.2 |
| `elec.dps.missing` | warning | QDC without SPD (overhead line) | 5.4.2 / 6.3.5.2 |
| `elec.pe.missing` | error | circuit without PE | 5.1.2.2.3.6 |
| `elec.phase.imbalance` | warning | imbalance between phases > 20% | practice |
| `elec.panel.reserves` | warning | spares < 2/3/4/15% | 6.5.4.7 |
| `elec.conduit.fill` | error | fill > 53/31/40% | 6.2.11.1.6 |
| `elec.conduit.length` | error | segment without a box > 15 m − 3 m × bends (30 m outdoor) | 6.2.11.1.6 b |
| `elec.conduit.bends` | error | > 3 bends of 90° between boxes | 6.2.11.1.7 |
| `elec.conduit.splice` | info | remind that splices only in boxes | 6.2.8 |
| `elec.lsf.stud_hole` | warning | conduit crosses a structural stud outside the planned hole | LSF practice / structural engineer |
| `elec.lsf.insulation_method` | info | wall with insulation: method A1 applied | Tab. 33 |
| `elec.light.low` / `.high` | warning / info | E < room minimum / E > 2 × target | NBR 5413 (ref.), ISO 8995-1 |
| `elec.light.stair_switching` | info | stairs/long hallway without three-way | good practice, NBR 9050 |
| `elec.height.accessibility` | info | switch outside 0.60–1.00 m (only in "accessible mode") | NBR 9050 |
| `elec.entrance.category` | info | probable service entrance category + "confirm with the utility (concessionária)" | distributor's standard |
| `elec.shower.127v` | warning | F-N shower at 127 V > 4,400 W → suggest F-F 220 V | practice |
| `elec.radier.floor_conduit` | info | floor conduits in the radier must be laid before the concrete pour | practice |

Every screen/report displays the `DISCLAIMER` (does not replace a design with an ART).

### 8.5 Catalog constants (`packages/catalog`, versioned)

```ts
electrical: {
  normEdition: 'NBR5410:2004',
  loads: {
    lighting: { baseVA: 100, baseArea: 6, stepVA: 60, stepArea: 4 },        // 9.5.2.1.2
    sockets: {
      generalVA: 100, wetVA: 600, wetHighCount: 3, wetOver6HighCount: 2,    // 9.5.2.2.2
      perimeterStep: { wet: 3.5, living: 5, other: 5 },                     // 9.5.2.2.1
      smallRoomArea: 2.25, mediumRoomArea: 6, counterMinWidth: 0.30, counterSockets: 2,
      bathSocketMinDistFromShower: 0.60,
    },
    tueSeparateAboveA: 10,                                                  // 9.5.3.4
    circuitMaxA: { lighting: 10, sockets: 10, wet_sockets: 16 },            // prática
    mixedCircuitMaxA: 16,                                                   // 9.5.3.2
  },
  appliances: {
    electric_shower: { w: 5500, pf: 1.0, voltage: 'FF', curve: 'B' },
    electric_faucet: { w: 4500, pf: 1.0, voltage: 'FF', curve: 'B' },
    oven: { w: 2500, pf: 1.0 }, cooktop_induction: { w: 6000, pf: 0.98 },
    microwave: { w: 1400, pf: 0.95 }, dishwasher: { w: 1800, pf: 0.95 },
    washer: { w: 1200, pf: 0.9 }, dryer: { w: 3000, pf: 1.0 },
    ac_9k: { w: 950, pf: 0.92, curve: 'C' }, ac_12k: { w: 1300, pf: 0.92, curve: 'C' },
    ac_18k: { w: 1900, pf: 0.92, curve: 'C' }, fridge: { w: 300, pf: 0.8 },
    pump_half_hp: { w: 750, pf: 0.8, curve: 'C', motor: true },
    gate_motor: { w: 400, pf: 0.8, motor: true }, ev_charger_7k: { w: 7400, pf: 1.0, drType: 'A' },
  },
  // Tab. 36 (Cu/PVC 70 °C, 30 °C): [S, B1_2, B1_3, B2_2, B2_3, A1_2, A1_3, D_2, D_3]
  ampacity: [
    [1.5, 17.5, 15.5, 16.5, 15, 14.5, 13.5, 22, 18],
    [2.5, 24, 21, 23, 20, 19.5, 18, 29, 24],
    [4, 32, 28, 30, 27, 26, 24, 38, 31],
    [6, 41, 36, 38, 34, 34, 31, 47, 39],
    [10, 57, 50, 52, 46, 46, 42, 63, 52],
    [16, 76, 68, 69, 62, 61, 56, 81, 67],
    [25, 101, 89, 90, 80, 80, 73, 104, 86],
    [35, 125, 110, 111, 99, 99, 89, 125, 103],
  ],   // [?] colunas A1 e D: conferir no Guia Prysmian antes de usar
  tempFactorPVC: { 10: 1.22, 15: 1.17, 20: 1.12, 25: 1.06, 30: 1.0, 35: 0.94, 40: 0.87, 45: 0.79, 50: 0.71, 55: 0.61, 60: 0.5 },
  groupingFactor: [1.0, 0.8, 0.7, 0.65, 0.6, 0.57, 0.54, 0.52, 0.5, 0.5, 0.5, 0.45, 0.45, 0.45, 0.45, 0.41, 0.41, 0.41, 0.41, 0.38], // índice = n−1; n ≥ 20 → 0,38
  minSection: { lighting: 1.5, power: 2.5, control: 0.5 },
  peRule: [[16, 'same'], [35, 16], [Infinity, 'half']],                     // Tab. 58
  resistance20: { 1.5: 13.3, 2.5: 7.98, 4: 4.95, 6: 3.30, 10: 1.91, 16: 1.21, 25: 0.78, 35: 0.554 }, // Ω/km, classe 5
  resistanceTempFactor70: 1.196,
  voltageDrop: { terminalMaxPct: 4, totalFromDeliveryPct: 5, totalOwnTransformerPct: 7, warnAtPct: 3 },
  breakers: { ratings: [6, 10, 13, 16, 20, 25, 32, 40, 50, 63, 70, 80, 100, 125], defaultCurve: 'C' },
  dr: { sensitivityMa: 30, ratings: [25, 40, 63, 80], excludeLightingAboveM: 2.5,
        requiredRoomUses: ['bathroom', 'kitchen', 'laundry', 'service', 'garage', 'outdoor'], maxCircuitsPerDr: 5 },
  dps: { class: 'II', ucByUo: { 127: 175, 220: 275 }, inMinKa: 5, inDefaultKa: 10, imaxKa: 20,
         upMaxKv: { 127: 1.5, 220: 2.5 }, leadMinMm2: 4 },
  panelReserves: [[6, 2], [12, 3], [30, 4], [Infinity, 0.15]],             // 6.5.4.7
  panelSizes: [8, 12, 18, 24, 36, 48],                                      // módulos DIN
  conduit: {
    fillMax: { 1: 0.53, 2: 0.31, many: 0.40 },
    maxStraight: { indoor: 15, outdoor: 30 }, reducePerBend90: 3, maxBends90: 3,
    corrugated: [ { dn: 16, di: 11.5 }, { dn: 20, di: 15.0 }, { dn: 25, di: 19.5 }, { dn: 32, di: 25.5 }, { dn: 40, di: 32.5 } ], // [?] di por fabricante
    minDn: 20, wastePct: 0.08,
  },
  cableOuterDiameter: { 1.5: 3.0, 2.5: 3.6, 4: 4.2, 6: 4.7, 10: 6.1, 16: 7.2, 25: 8.9, 35: 10.2 }, // mm, flex 750 V
  cable: { slackPerBoxM: 0.3, wastePct: 0.10,
           colors: { N: 'azul-claro', PE: 'verde-amarelo', F: ['preto', 'vermelho', 'branco'], R: 'amarelo' } },
  heights: { low: 0.30, mid: 1.10, high: 2.20, switch: 1.10, wallLight: 2.00, shower: 2.20, panel: 1.50,
             accessibleSwitch: [0.60, 1.00], accessibleSocket: [0.40, 1.00] },
  switchOffsetFromJamb: 0.15,
  demand: {
    // CEMIG ND-5.1 (clássica) [?] conferir revisão vigente
    lightingSockets: { mode: 'flat', table: [[1, 0.86], [2, 0.75], [3, 0.66], [4, 0.59], [5, 0.52], [6, 0.45], [7, 0.40], [8, 0.35], [9, 0.31], [10, 0.27], [Infinity, 0.24]] },
    heating: [1, 1, 0.84, 0.76, 0.70, 0.65, 0.60, 0.57, 0.54, 0.52, 0.49, 0.48, 0.46, 0.45, 0.44, 0.43],
    airConditioning: { upTo10: 1.0 },
    motors: { largestFull: true, othersFactor: 0.5 },   // [?]
  },
  utilities: {
    generic_127: { phaseNeutral: 127, categories: [
      { code: 'M', phases: 1, maxLoadKw: 10, breakerA: 50, cableMm2: 10 },      // [?] ordem de grandeza
      { code: 'B', phases: 2, maxLoadKw: 20, breakerA: 63, cableMm2: 16 },
      { code: 'T', phases: 3, maxLoadKw: 75, breakerA: 100, cableMm2: 35 } ] },
    // cemig, enel_sp, enel_rj, enel_ce, copel, celesc, cpfl, neoenergia, equatorial, energisa…
  },
  stateDefaultPhaseNeutral: { AC: 127, AM: 127, AP: 127, ES: 127, MG: 127, MS: 127, MT: 127, PA: 127, PR: 127,
    RJ: 127, RO: 127, RR: 127, SP: 127, RS: 220, SC: 220, BA: 220, SE: 127, AL: 220, CE: 220, DF: 220, GO: 220,
    MA: 220, PB: 220, PE: 220, PI: 220, RN: 220, TO: 220 },                    // [?] só sugestão inicial; RS/SC/BA mistos
  lighting: {
    targetLux: { living: 150, kitchen: 250, bedroom: 150, bathroom: 200, laundry: 200, circulation: 100,
                 stairs: 150, garage: 100, office: 400, balcony: 50, outdoor: 10 },
    minLux:    { living: 100, kitchen: 150, bedroom: 100, bathroom: 100, laundry: 100, circulation: 75,
                 stairs: 100, garage: 75, office: 300, balcony: 20, outdoor: 5 },
    workPlane: { default: 0.75, kitchen: 0.90, bathroom: 0.90, circulation: 0, stairs: 0, outdoor: 0 },
    maintenanceFactor: { default: 0.8, kitchen: 0.7, outdoor: 0.7 },
    utilization: [[0.6, 0.36], [0.8, 0.44], [1.0, 0.50], [1.25, 0.56], [1.5, 0.60], [2.0, 0.66], [2.5, 0.70], [3.0, 0.73], [4.0, 0.77], [5.0, 0.80]], // K → Fu (70/50/20) [?]
    spacingToHeight: { plafon: 1.4, downlight: 1.2, spot: 1.0, pendant: 1.0 },
    wallDistanceFactor: 0.5,
    ledPowerFactor: 0.92,
  },
  luminaires: [
    { id: 'plafon_18w', type: 'plafon', watts: 18, lumens: 1600, cct: 3000, cri: 80 },
    { id: 'plafon_24w', type: 'plafon', watts: 24, lumens: 2200, cct: 3000, cri: 80 },
    { id: 'downlight_12w', type: 'downlight', watts: 12, lumens: 1000, cct: 3000, cri: 80 },
    { id: 'spot_gu10_6w', type: 'spot', watts: 6, lumens: 480, cct: 2700, cri: 80, beamAngle: 36 },
    { id: 'pendant_a60_9w', type: 'pendant', watts: 9, lumens: 806, cct: 2700, cri: 80, luminaireEff: 0.7 },
    { id: 'wall_8w', type: 'wall', watts: 8, lumens: 600, cct: 3000, cri: 80 },
    { id: 'strip_10w_m', type: 'strip', wattsPerM: 10, lumensPerM: 900, cct: 3000, cri: 90 },
    { id: 'bollard_3w', type: 'bollard', watts: 3, lumens: 150, cct: 3000, cri: 80, ip: 'IP65' },
    { id: 'flood_30w', type: 'flood', watts: 30, lumens: 2700, cct: 4000, cri: 80, ip: 'IP65' },
  ],
}
```

### 8.6 Suggested implementation order (cards)

1. **Schema + catalog** (orchestrator): `project.electrical`, `catalog.electrical` (tables above), migration.
2. **Engine: loads and minimums** (steps 2–4) + tests with the numerical examples in this document.
3. **Engine: sizing** (Iz/FCT/FCA/ΔV/breaker/PE/RCD/SPD), without conduits yet (length estimated as today).
4. **Engine: conduit graph** (conductors per segment, fill, box rules) + auto-route.
5. **Engine: lighting design** (K, Fu, lux, suggested grid) and control.
6. **Engine: demand/service entrance/board/BOM** + budget.
7. **Web: plan tool** (palette, wall snap with height, luminaire grid, conduit polyline, colors by circuit, ceiling/floor layers, NBR 5444 symbology).
8. **Web: reports** (load schedule, single-line diagram SVG generated from the model, bill of materials, legend) and light in 3D.

### 8.7 Reference tests (expected values)

- Lighting: 6 m² → 100 VA; 9.9 m² → 100; 10 m² → 160; 14 m² → 220.
- TUG: kitchen 3 × 3.5 m (perimeter 13 m) → ceil(13 / 3.5) = 4 points → 600 × 3 + 100 = 1,900 VA. Living room 4 × 5 (18 m) → 4 points × 100 VA.
- Shower 5,500 W/220 V F-N, B1, FCA 1: Ib = 25 A → In = 25 A → 4 mm² (Iz 32 ≥ 25) → with L = 20 m, ΔV = 2 × 4.95 × 1.196 × 0.02 × 25 / 220 = 2.69% ✓. With FCA 0.8 (2 circuits): Iz' = 25.6 ≥ 25 ✓ still 4 mm². The market uses 6 mm²/32 A for a 7,500 W shower.
- Shower 5,500 W/127 V: Ib = 43.3 A → In = 50 A → 10 mm² (Iz 57) → recommend F-F 220 V.
- TUG 220 V 2,200 VA: Ib = 10 A → In = 10 A (Ib ≤ In holds), 2.5 mm² (power minimum). If the user asks for In = 16 A: requires Iz' ≥ 16 → 2.5 mm² works with FCA ≥ 0.7 (Iz' = 16.8); with FCA 0.65 (4 circuits), Iz' = 15.6 < 16 → error `elec.circuit.overload` → suggest In = 13 A or 4 mm².
- Fill: 3 circuits × (F + N + PE) of 2.5 mm² = 9 × 10.2 = 91.8 mm² → DN 20 corrugated (usable 71 mm²) ✗ → DN 25 (119 mm²) ✓.
- Lux: living room 4 × 5, h = 1.85, 4 × 1,800 lm, Fu 0.55, Fm 0.8 → E = 158 lx ✓ (target 150).

---

## Consolidated list of uncertainties to resolve before making a rule blocking

1. Exact wording of the "> 6 points" rule for TUG in wet areas (9.5.2.2.2).
2. A1 and D columns of Tab. 36 and the complete unit voltage drop table (check against the Prysmian Guide Rev9).
3. Inner diameters of corrugated conduits by manufacturer.
4. Demand tables and service entrance categories **per utility (concessionária)** (CEMIG ND-5.1 Tab. 1/10; Enel; Copel NTC 901100; Celesc; CPFL GED 13). Start with 2–3 utilities and warn for the rest.
5. Artificial illuminance table of NBR 15575-1 (housing) to replace the references to the withdrawn NBR 5413.
6. Status of the NBR 5410 revision (RCD on all circuits, AFDD, new lighting power). Track the publication.
7. Dimensions of factory holes in LSF studs (by profile manufacturer) for the `elec.lsf.stud_hole` validation.
8. Equipotential bonding requirements for the LSF structure (number of connection points to the BEP).
