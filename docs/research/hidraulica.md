# Research: plan-based plumbing design (water supply, sewer, stormwater) for ChaléCAD

> Status: research (Nov 2026). No code was changed. This document feeds a future engine/catalog/UI card.
> Scope: chalets of 40 to 150 m², 1 or 2 levels (mezzanine), water tank on a tower above the upper bathroom, gravity-fed supply, and sewer to the public network or a septic tank.
>
> **Note on sources.** ABNT standards are paywalled and not available in full. The numbers below come from engineering values **reproduced in university course notes, catalogs, and manufacturer manuals** (Tigre, Amanco Wavin, Lorenzetti, Komeco, Rinnai, UFPR, USP, CAPES, etc.), which in turn transcribe the tables of NBR 5626:1998, NBR 8160:1999, NBR 10844:1989, NBR 7229:1993, and NBR 13969:1997. Each value carries a tag: **[confirmado]** (confirmed: seen in a source consulted for this research), **[usual]** (usual: widely published, but not re-checked here), or **[incerto]** (uncertain: check against the standard before using in a blocking validation).
>
> Every result this tool produces must display the engine's `DISCLAIMER`: it does not replace a plumbing design with ART (Anotação de Responsabilidade Técnica, the engineer's liability record) / RRT (the architect's equivalent).

---

## 0. What already exists in the repository (starting point)

- `packages/engine/src/installations/points.ts` creates `water_cold`, `water_hot`, `sewer` (40 or 100 mm), and `drain` (siphoned floor drain box) points from the furniture (`furn_shower`, `furn_toilet`, `furn_bath_sink`, `furn_kitchen_sink`, `furn_tank`, `furn_washer`, `furn_bathtub`) and positions the water tank (`TankInfo`, with an optional tower).
- `tank.ts` sizes the tank: `occupants × waterPerPerson × reserveDays`, rounded to `tankSizes` (constants in `packages/catalog`).
- `pipes.ts` estimates lengths using Manhattan distance × `routingFactor` (no real routing).
- `index.ts → pressureWarnings` checks only the **static column** (tank bottom − point elevation) against 1.0 m (shower) and 0.5 m (others), **with no head losses**. The constants are hardcoded (`SHOWER_POINT_HEIGHT = 2.1`, `MIN_COLUMN_*`), which violates the rule "every technical constant comes from `packages/catalog`".

**Gaps this research covers:** real routing on the plan, flow rates by simultaneity, pipe DN selection, distributed and local head losses, dynamic pressure per point, sewer with UHC (hydraulic contribution units), slope and venting, stormwater, septic tank, and the bill of materials.

**Important finding for the current code.** The criterion "1 m below the tank is enough" (used today and repeated in shower manuals) **does not guarantee** 10 kPa of dynamic pressure. In Example 1 (section 9), with 1.50 m of static column, only 0.62 m.c.a. remains at the shower after the losses. The tower needs about 1.9 m of elevation difference, or larger pipes.

---

## 1. Cold and hot water: NBR 5626:2020

### 1.1 Regulatory status (important for the engine)

- **NBR 5626:2020** canceled and replaced NBR 5626:1998 (cold water) and **NBR 7198:1993** (hot water), which now form a single standard. [confirmado: SindusCon-PR, CBIC]
- The 2020 version **removed the calculation procedure, the relative-weight tables, and the diameter table** of the 1998 version, and does not impose a flow method. The design flow of each fixture may be **estimated or obtained from the manufacturer**, and verification now uses fixture flow × pressure curves. [confirmado: UFPB/UFT/ANTAC papers]
- New criterion: a **pressure drop of at most 10%** at the shower when it operates together with another fixture, relative to the design pressure. [confirmado: UFT]
- In market practice (AltoQi, course notes, undergraduate theses from 2024 to 2026), the **1998 relative-weights method (square root)** is still the most used and is accepted because the standard leaves the method to the designer's discretion. USP material recommends the universal formula (Darcy-Weisbach) for head loss under the 2020 version. [confirmado]

**Suggested decision:** implement the weights method (1998) as the default, with the 2020 10% limit as an extra check. Make the head-loss formula selectable (Fair-Whipple-Hsiao by default, Darcy-Weisbach as an option). Document in the report: "flows by the relative-weights method (established practice; NBR 5626:2020 allows the method at the designer's discretion)".

### 1.2 Pressure and velocity limits

| Quantity | Value | Origin | Status |
|---|---|---|---|
| Minimum dynamic pressure at points of use | **10 kPa (≈1.0 m.c.a.)** | NBR 5626:1998 5.3.5.2 | [confirmado] |
| Exception: flush tank point (toilet with attached tank) | **5 kPa (0.5 m.c.a.)** | same | [confirmado] |
| Exception: flushometer valve point | **15 kPa (1.5 m.c.a.)**; in practice valves require much more (see manufacturer) | same | [confirmado] |
| Minimum dynamic pressure at any point of the network (manifold, columns) | **5 kPa (0.5 m.c.a.)** | NBR 5626:1998 | [usual] |
| Maximum static pressure at points of use | **400 kPa (≈40 m.c.a.)** | 1998 5.3.5.3; kept in 2020 (exam questions citing the 2020 version) | [confirmado] |
| Water hammer overpressure | ≤ **200 kPa** above service pressure | 1998 | [confirmado] |
| Maximum velocity in any segment | **3 m/s** | 1998 5.3.4 | [confirmado] |
| Pressure drop at the shower in simultaneous use | ≤ **10%** of design pressure | 2020 | [confirmado] |
| Electric showers (Lorenzetti, Hydra) | operating range **10 kPa (1 m.c.a.) to 400 kPa (40 m.c.a.)**; manual suggests installing the shower "at least 1 m below the tank" | manuals | [confirmado] |
| Gas instantaneous water heater | activation at **1 to 4 m.c.a.** depending on the model (Komeco Slim BP: > 2 m.c.a.; Rinnai E27: minimum 4 m.c.a., ideal 7 to 30 m.c.a.); Komeco Digital recommends ≥ **10 m.c.a.** at the highest point | manuals | [confirmado] |

Conversion adopted: 1 m.c.a. = 9.80665 kPa. The 1998 standard uses "10 kPa ≈ 1 m.c.a." in its tables. **Suggestion:** the engine works in m.c.a. internally and shows kPa with the factor 9.80665. The limits in the catalog stay in kPa, as in the standard.

### 1.3 Flows and relative weights (NBR 5626:1998, Table A.1)

Simultaneity formula (square-root method):

```
Q = 0,30 · √(ΣP)      Q em L/s, ΣP = soma dos pesos a jusante do trecho
```

Practical rule for the engine: `Q_segment = max(0.30·√ΣP, largest unit flow downstream)`. This prevents a single-fixture branch from ending up with a flow lower than that of the fixture itself (e.g., electric shower, 0.3·√0.1 = 0.095 < 0.10 L/s).

**Cold water** [confirmado: stecine/UFRN, NBR 5626/98 slides]

| Fixture | Point of use | Design flow (L/s) | Weight |
|---|---|---|---|
| Toilet | flush tank (attached) | 0.15 | 0.3 |
| Toilet | flushometer valve | 1.70 | 32 |
| Bathtub | mixer (cold water) | 0.30 | 1.0 |
| Drinking fountain | pressure valve | 0.10 | 0.1 |
| Bidet | mixer (cold water) | 0.10 | 0.1 |
| Shower or spray | mixer (cold water) | 0.20 | 0.4 |
| Electric shower | pressure valve | 0.10 | 0.1 |
| Dishwasher or washing machine | pressure valve | 0.30 | 1.0 |
| Lavatory | faucet or mixer (cold water) | 0.15 | 0.3 |
| Ceramic urinal with integral siphon | flushometer valve | 0.50 | 2.8 |
| Ceramic urinal without integral siphon | tank, valve, or flushometer | 0.15 | 0.3 |
| Sink | faucet or mixer (cold water) | 0.25 | 0.7 |
| Sink | electric faucet | 0.10 | 0.1 |
| Laundry tub | faucet | 0.25 | 0.7 |
| Garden or wash-down faucet | faucet | 0.20 | 0.4 |

**Hot water** [confirmado: same source]

| Fixture | Flow (L/s) | Weight |
|---|---|---|
| Bathtub (hot water mixer) | 0.30 | 1.0 |
| Bidet (hot water mixer) | 0.10 | 0.1 |
| Shower/spray (hot water mixer) | 0.20 | 0.5 |
| Lavatory (hot water mixer) | 0.20 | 0.5 |
| Sink (hot water mixer) | 0.25 | 0.7 |
| Dishwasher/washing machine | 0.30 | 1.0 |

Note: some older course notes give shower 0.5 and lavatory 0.5 for cold water as well, because they copy NB-92/1980. Use the table above.

**Minimum branch pipe diameters (soldered PVC, OD in mm)** [confirmado: stecine]: shower 20, lavatory 20, toilet with tank 20, sink 20, bidet 20, bathtub 20, **laundry tub 25**, **washing machine 25**, high-pressure water heater 20, **low-pressure water heater 25**, flushometer valve 40 (1½") [usual: many valves require DN 50 at low pressure].

### 1.4 Pipes: nominal and internal diameters

**Rigid soldered PVC (NBR 5648), class 15** [usual: Tigre/Amanco catalog; OD and wall thickness standardized]

| OD (mm) | Thread ref. | Wall (mm) | **ID (mm)** | Internal area (cm²) |
|---|---|---|---|---|
| 20 | ½" | 1.5 | **17.0** | 2.27 |
| 25 | ¾" | 1.7 | **21.6** | 3.66 |
| 32 | 1" | 2.1 | **27.8** | 6.07 |
| 40 | 1¼" | 2.4 | **35.2** | 9.73 |
| 50 | 1½" | 3.0 | **44.0** | 15.21 |
| 60 | 2" | 3.3 | 53.4 | 22.40 |
| 75 | 2½" | 4.2 | 66.6 | 34.84 |

**PPR PN 20 (hot water)** [usual: SDR 6 series]: 20×3.4 → ID 13.2; 25×4.2 → ID 16.6; 32×5.4 → ID 21.2; 40×6.7 → ID 26.6; 50×8.3 → ID 33.4. Works up to about 70 °C continuous (peak of 95 °C).
**PEX (SDR 7.4)** [usual]: 16×2.2 → ID 11.6; 20×2.8 → ID 14.4; 25×3.5 → ID 18.0; 32×4.4 → ID 23.2.
**CPVC (Tigre Aquatherm)**: OD 15, 22, 28, 35, 42, 54 mm; up to 80 °C. Get the IDs from the Tigre catalog (FT Aquatherm 2025) before registering them. [incerto: IDs not checked]

> Warning: in PPR and PEX the ID is much smaller than in PVC of the same OD. A PPR 25 has practically the ID of a PVC 20, so head loss in hot water must use the material's ID, never the OD.

### 1.5 Distributed head loss

**Fair-Whipple-Hsiao (FWH), smooth pipes (PVC, copper, PPR/PEX), cold water.** Original form: `Q = 55,934·J^0,571·D^2,714` (SI). Solving for J:

```
J = 0,000869 · Q^1,75 / D^4,75        J [m/m], Q [m³/s], D = diâmetro INTERNO [m]
```

Form from NBR 5626:1998, Annex A (practical units):

```
J = 8,69·10^6 · Q^1,75 · d^-4,75      J [kPa/m], Q [L/s], d [mm]
```

The two forms coincide if we adopt 1 m.c.a. = 10 kPa (8.69·10⁶ × 10⁻⁹ = 0.00869 kPa/m = 0.000869 m/m). Many course notes give 0.0008695. The difference between the coefficients is negligible (< 0.1%). [confirmado: form and exponents seen in a USP lecture (PHD0313); constant derived from the Q form]

- For **rough pipes** (galvanized steel): `J = 0,002021·Q^1,88/D^4,88` (SI) or `20,2·10⁶·Q^1,88·d^-4,88` (kPa/m). [confirmado: USP]
- For **hot water** in copper/plastic (FWH): `Q = 63,281·J^0,571·D^2,714`, which gives `J ≈ 0,000701·Q^1,75/D^4,75`. Some sources round to 0.000692. [usual]
- Validity: DN ½" to 2" (12.7 to 50.8 mm), i.e., the entire network of a chalet. [confirmado: UEG]

**Hazen-Williams (optional):**

```
J = 10,643 · Q^1,852 · C^-1,852 · D^-4,87       J [m/m], Q [m³/s], D [m]
```

| Material | C |
|---|---|
| PVC, PEX, PPR, polyethylene (new, keep the value over their service life) | 150 (140 conservative) |
| Copper | 130 to 140 |
| Galvanized steel | 120 to 125 (100 if used) |

[confirmado: USP and ULisboa tables, servidos.ar]. At small DNs, Hazen-Williams with C = 150 gives losses about 20% **lower** than FWH (see numbers in section 9). That is why FWH is the more conservative default.

**Darcy-Weisbach (universal formula, preferred by USP material under the 2020 version):** `hf = f·(L/D)·v²/2g`, with f from Swamee-Jain `f = 0,25 / [log10(ε/(3,7D) + 5,74/Re^0,9)]²`, PVC roughness ε ≈ 0.0015 mm [usual] and ν = 1.0·10⁻⁶ m²/s at 20 °C. For hot water at 60 °C, ν ≈ 0.47·10⁻⁶.

### 1.6 Local losses: equivalent lengths (rigid PVC, m)

Classic table from Tigre catalogs and NBR 5626:1998 (chart/annex), reproduced in course notes. The DN 20 and 25 columns were **[confirmadas]** (stecine/UFRN). The others are **[usuais]** (same table in Tigre catalogs and in Macintyre's book).

| Fitting | 20 | 25 | 32 | 40 | 50 |
|---|---|---|---|---|---|
| 90° elbow | 1.1 | 1.2 | 1.5 | 2.0 | 3.2 |
| 45° elbow | 0.4 | 0.5 | 0.7 | 1.0 | 1.0 |
| 90° bend | 0.4 | 0.5 | 0.6 | 0.7 | 1.2 |
| 45° bend | 0.2 | 0.3 | 0.4 | 0.5 | 0.6 |
| 90° tee, straight run | 0.7 | 0.8 | 0.9 | 1.5 | 2.2 |
| 90° tee, side outlet | 2.3 | 2.4 | 3.1 | 4.6 | 7.3 |
| 90° tee, bilateral outlet | 2.3 | 2.4 | 3.1 | 4.6 | 7.3 |
| Normal entrance (tank outlet, flush pipe) | 0.3 | 0.4 | 0.5 | 0.6 | 1.0 |
| Edge entrance (pipe protruding into the tank) | 0.9 | 1.0 | 1.2 | 1.8 | 2.3 |
| Pipe outlet | 0.8 | 0.9 | 1.3 | 1.4 | 3.2 |
| Gate valve, open | 0.1 | 0.2 | 0.3 | 0.4 | 0.7 |
| Globe valve, open | 11.1 | 11.4 | 15.0 | 22.0 | 35.8 |
| Angle valve, open | 5.9 | 6.1 | 8.4 | 10.5 | 17.0 |
| Light check valve | 2.5 | 2.7 | 3.8 | 4.9 | 6.8 |
| Foot valve with strainer | 8.1 | 9.5 | 13.3 | 15.5 | 18.3 |

- **Pressure valve** (the shower and lavatory valve): course notes treat it as a **globe valve**. It is the largest loss term in a shower branch (11.1 equivalent meters at DN 20). [usual] Manufacturers (Docol, Deca) publish their own curves. Studies from Unipampa showed that the tabulated values for ball valves are undersized at DN 20 to 32. [confirmado] **Suggestion:** `registro_pressao = registro_globo` in the catalog, with a note.
- **Ball valve** (common in PPR/PEX): use the gate valve value as a minimum. [incerto]
- **PPR/PEX fittings**: use the manufacturer's K coefficients (Amanco Wavin FT-PEX gives about 0.28 m.c.a. per brass elbow in one example). For the MVP, apply the PVC table by equivalent ID. [incerto]
- Simplification accepted for preliminary sizing (AltoQi and course notes): **add 20 to 40% to the actual length** when the fittings are not yet defined. ChaléCAD can infer the fittings from the routing: each polyline vertex becomes a 90° elbow (or 45° depending on the angle), each branching node becomes a tee, and the tee type (straight or side) is decided by alignment.

### 1.7 Sizing: step by step (weights method)

1. **Tree** starting at the tank outlet: manifold (barrilete) → columns (vertical drops) → branches (per room, after the room's gate valve) → sub-branches (up to each point).
2. For each segment: ΣP downstream → `Q = max(0.3√ΣP, q_max)`.
3. **Initial DN:** the smallest commercial DN with `v = Q/A ≤ v_target` and DN ≥ the minimum sub-branch DN (1.3). Use `v_target = 2.0 m/s` as the default (comfort and noise margin) and keep `v ≤ 3.0 m/s` as the standard's limit. [v_target is a design choice; the old NB-92 criterion, v ≤ 14√D, can also be offered]
4. **Loss per segment:** `hf = J·(L_real + ΣL_eq)`.
5. **Available pressure at each node** (upstream to downstream): `P_downstream = P_upstream + (z_upstream − z_downstream) − hf`. At the tank outlet, `P = 0` with the reference level at the **tank bottom** (minimum level, conservative). The kinetic head v²/2g is neglected, as in usual practice (v ≤ 2 m/s gives v²/2g ≤ 0.2 m). [usual]
6. **Check** `P_point ≥ P_min(fixture)` and `P ≥ 5 kPa` at all intermediate nodes. Watch out for manifold segments that **rise** above the tank bottom: they create negative pressure and trapped air.
7. **If it fails**, increase one DN on the critical-path segments with the largest `hf`, one at a time, until it passes or the DNs run out. If it still fails, propose raising the tank (required height = `P_min + Σhf − (z_tank − z_point)` extra) or a booster pump.
8. **Maximum static:** `z_bottom_or_max_level − z_point ≤ 40 m.c.a.` (only matters with direct street supply or a booster pump).

**Manifold and columns in a chalet:** with a single tank, the "barrilete" (manifold) is the tank outlet with the main valve, from which one or two drops leave (upper bathroom and ground floor). A **gate valve at the tank outlet** and a **gate valve in each wet room** are recommended (the current code already budgets a `water_valve` per wet room and one main valve). If there is an instantaneous water heater, a dedicated drop for it is advisable (heater supply). [usual]

### 1.8 Tank: volume and position

| Parameter | Value | Status |
|---|---|---|
| Minimum reserve | ≥ **24 h** of consumption (NBR 5626) | [confirmado: stecine] |
| Usual reserve in houses / building codes | **1 to 2 days**. For a rural chalet with intermittent supply or a well, use **2 days** | [confirmado: USP notes/slides] |
| Minimum tank volume | 500 L | [confirmado: stecine] |
| Occupancy rate | **2 people per social bedroom** + 1 per service bedroom | [confirmado] |
| Per capita consumption | popular or rural housing 120 to 150; medium standard 150 to 250 L/person·day (tables vary; Macintyre gives popular 150, medium 250, luxury 300) | [confirmado: slides] |
| Hot water (for storage/solar heater) | popular or rural house 36; residence 45 L/person·day | [confirmado: stecine] |
| Avoid reserve > 3 days (turnover/potability) | practice | [usual] |

**Suggestion for a chalet:** 150 L/person·day, 2 people/bedroom, 2 days. Example: 2 bedrooms → 4 people × 150 × 2 = 1,200 L → commercial tank of 1,500 L (or 1,000 L with 1 day). The catalog already has `waterPerPerson`, `reserveDays`, and `personsPerBedroom`. Only the values need revising.

**Position/height:** pressure is measured from the tank **bottom** (manifold outlet). Practical rules:
- Minimum static head for the highest shower: `H ≥ P_min + Σhf`. In a chalet with a mezzanine, this is typically between **1.8 and 2.5 m** above the shower point (see Example 1), not 1.0 m.
- Manifold outlet on the side, a few cm above the bottom; cleanout drain at the bottom; overflow with a DN larger than the supply (e.g., supply 25, overflow 32 or 40). [usual]
- Full weight (water + tank) is already reported to the engineer (`install.tank_load`).

### 1.9 Hot water (NBR 5626:2020, formerly NBR 7198)

- Typical chalet systems: (a) **electric shower** (no hot water network); (b) **gas instantaneous heater** with a hot water network in PPR/CPVC/PEX; (c) **solar with storage tank (boiler)** and backup.
- Hot water flows and weights: table 1.3. Pipes: use the real ID (1.4).
- Instantaneous heater: flow at ΔT: `Q[L/min] = P[kW]·60 / (4,186·ΔT)`. E.g., 26 kW with ΔT = 20 °C gives 18.6 L/min, enough for 1 spray shower (12 L/min) plus 1 lavatory. Hot water flows per fixture (stecine): spray shower 12, shower 6, lavatory 9, sink 15 L/min. [confirmado]
- **Minimum heater pressure** (1 to 4 m.c.a. to activate, 7 to 10 m.c.a. ideal) is almost never reached by gravity in a chalet. If there is a gas heater, the engine must issue a booster pump warning. [confirmado: manuals]
- Solar: boiler volume `V = V_consumption·(T_use − T_cold)/(T_storage − T_cold)`. E.g., 460 L/day × (40 − 20)/(50 − 20) ≈ 307 L. [confirmado: stecine]
- Maximum temperature, insulation, anti-Legionella, and mixers: 2020 requirements **not checked** here. [incerto] Suggestion: warnings "insulate the hot water piping" and "mixing valve" with no blocking numeric limits.
- Electric shower: maximum inlet temperature of 50 °C (Hydra manual), which matters if solar feeds the shower. [confirmado]

### 1.10 Booster pump: when to recommend

| Situation (calculated dynamic pressure) | Suggested action | Severity |
|---|---|---|
| Electric shower < 10 kPa (1.0 m.c.a.) | raise the tank by the calculated ΔH, increase DN on the critical path **or** booster pump | `warn` (mezzanine) / `info` (ground floor, as it is today) |
| Spray shower/mixer < 10 kPa | same; high-flow sprays usually require 20 kPa or more (see manufacturer) | `warn` |
| Gas instantaneous heater < model minimum (default 2 m.c.a.; ideal ≥ 7 m.c.a.) | booster pump on the cold water supply of the heater and sprays | `warn` |
| Toilet with attached tank < 5 kPa | raise the tank | `warn` |
| Any node < 5 kPa or segment above the tank bottom | redo the routing | `error` |
| Drop > 10% at the shower with another fixture open (2020) | increase DN of the shared segments | `info`/`warn` |
| Static > 400 kPa | pressure-reducing valve | `error` |

Booster pump installation practice (Rowa, Komeco, Lorenzetti) [usual]: below the tank bottom, with "flooded" suction, preferably on a dedicated tank outlet. Residential boosters deliver about 10 to 30 m.c.a.

**Sources for section 1:** [SindusCon-PR, NBR 5626:2020](https://sindusconpr.com.br/abnt-publica-norma-sobre-sistemas-prediais-de-agua-fria-e-agua-quente/) · [CBIC](https://cbic.org.br/abnt-publica-norma-sobre-sistemas-prediais-de-agua-fria-e-agua-quente/) · [UFT, 2020 changes](https://sistemas.uft.edu.br/periodicos/index.php/desafios/article/download/13066/22572/86989) · [UFPB, thesis 2024](https://repositorio.ufpb.br/jspui/bitstream/123456789/35984/1/2024_1_TCC_Igor_Melo_Vidal.pdf) · [Cold and hot water systems: weight tables, Leq, branches](https://stecine.azureedge.net/repositorio/sistemas_de_agua_potavel_fria_e_quente_para_edificios/index.html) · [Slides on building cold water: 1998 limits](https://pt.slideshare.net/slideshow/inst-agua-fria-predial-hidraulica/48236364) · [Slides on per capita consumption and storage](https://pt.slideshare.net/slideshow/aula-de-instalacoes-prediais-de-gua-fria/42772185) · [USP PHD0313, head losses (FWH)](https://edisciplinas.usp.br/pluginfile.php/4211268/mod_resource/content/7/PHD0313%20-%20Aula%203%20-%20Condutos%20For%C3%A7ados%20e%20Perdas%20de%20Carga.pdf) · [UEG, comparison of equations](https://www.revista.ueg.br/index.php/mirante/article/view/17550/12016) · [Unipampa, Leq of PVC fittings](https://dspace.unipampa.edu.br/bitstream/riu/1902/1/QUANTIFICA%c3%87%c3%83O%20DA%20PERDA%20DE%20CARGA%20EM%20CONEX%c3%95ES%20DE%20PVC%20SOLD%c3%81VEL-%20DETERMINA%c3%87%c3%83O%20DOS%20COEFICIENTES%20K%20E%20COMPRIMENTOS%20EQUIVALENTES.pdf) · [Amanco Wavin FT PEX](https://mediahub.wavin.com/m/3ed0280a9782fb30/original/FT-PEX.pdf) · [Tigre FT Aquatherm](https://tigresite.s3.amazonaws.com/2025/10/FT_Aquatherm_2025-Rev-Final.pdf) · [Hazen-Williams tables, USP](https://edisciplinas.usp.br/pluginfile.php/5340345/mod_resource/content/1/Tabelas%20para%20dimensionamento%20hidr%C3%A1ulico.pdf) · [ULisboa, C table](https://fenix.isa.ulisboa.pt/qubEdu/disciplinas/mecfl/2015-2016/1-semestre/lateral/material-pedagogico/tabelas-para-aulas-praticas/tabela-3) · [Lorenzetti, Loren Shower manual](https://www.lorenzetti.com.br/manuais/lorenshower/manual.pdf) · [Hydra, Gorducha manual](https://bravalumi.cdn.magazord.com.br/img/2022/11/produto/6596/manual-do-produto-ducha-gorducha-e-ducha-banhao-v7.pdf) · [Komeco, Slim BP](https://www.komeco.com.br/arquivos/manuais/aquecimento-gas/slim/manual-aquecimento-gas-linha-slim-07m-bp.pdf) · [Komeco, Digital 20](https://www.komeco.com.br/arquivos/manuais/aquecimento-gas/digital/manual-aquecimento-gas-linha-digital-20.pdf)

---

## 2. Sanitary sewer: NBR 8160:1999

### 2.1 UHC and discharge branch per fixture (Table 3)

Values reproduced in course notes (USP, CAPES). Toilet (6/100), shower (2/40), lavatory (1/40), and laundry tub (3/40) were **[confirmados]**. The rest are **[usuais]**.

| Fixture | UHC | Minimum DN of the discharge branch |
|---|---|---|
| Toilet | 6 | **100** (mandatory, not reduced) |
| Bathtub (residential) | 2 | 40 |
| Drinking fountain | 0.5 | 40 |
| Bidet | 1 | 40 |
| Residential shower | 2 | 40 |
| Collective shower | 4 | 40 |
| Residential lavatory | 1 | 40 |
| General-use lavatory | 2 | 40 |
| Urinal with flushometer valve | 6 | 75 |
| Urinal with flush tank | 5 | 50 |
| Residential kitchen sink | 3 | 50 |
| Industrial kitchen sink (prep / pot washing) | 3 / 4 | 50 |
| Laundry tub | 3 | 40 |
| Dishwasher | 2 | 50 |
| Washing machine | 3 | 50 |

**Fixtures not listed (Table 4)** [usual]: DN 40 → 2 UHC; 50 → 3; 75 → 5; 100 → 6.

### 2.2 Sewer branches, stacks, and sub-collectors

**Sewer branch (Table 5), maximum UHC** [confirmado: DN 50 = 6, DN 75 = 20, DN 100 = 160; DN 40 = 3 is usual]

| DN | 40 | 50 | 75 | 100 |
|---|---|---|---|---|
| Max. UHC | 3 | 6 | 20 | 160 |

**Stack (Table 6), max. UHC** [usual]

| DN | Building up to 3 floors | Building with more than 3 floors |
|---|---|---|
| 40 | 4 | 8 |
| 50 | 10 | 24 |
| 75 | 30 | 70 |
| 100 | 240 | 500 |
| 150 | 960 | 1,900 |

Stack receiving a toilet: **DN 100**. Stack for a kitchen sink or washing machine: DN ≥ 75 is recommended (foam and grease). [incerto as to the exact text]

**Sub-collector and building collector (Table 7), max. UHC by slope** [usual]

| DN | 0.5% | 1% | 2% | 4% |
|---|---|---|---|---|
| 100 | 180 | 216 | 250 | 300 |
| 150 | — | 700 | 840 | 1,000 |
| 200 | 1,400 | 1,600 | 1,920 | 2,300 |

A chalet has 15 to 40 UHC, so the sub-collector is **always DN 100**. There is no sanitary sewer collector below DN 100.

### 2.3 Slopes

| DN | Minimum slope | Status |
|---|---|---|
| ≤ 75 | **2%** | [usual, established] |
| ≥ 100 | **1%** | [usual, established] |
| Maximum recommended | **5%** | [usual] |

### 2.4 Traps, boxes, and inspection

- **Siphoned floor drain box (caixa sifonada)** (the bathroom's trap): receives lavatory, shower, bidet, and drains. **The toilet never enters it** (the toilet has its own trap and goes straight to the DN 100 branch). Capacity [usual]: CS DN 100 up to 6 UHC, DN 125 up to 10, DN 150 up to 15. Outlet DN 50 (or 75). Water seal ≥ 50 mm.
- **Grease trap (caixa de gordura)** (kitchen sink; NBR 8160 requires a grease trap for greasy effluents) [confirmado: UFRGS, Caesb]:

| Type | Use | Shape | Internal Ø | Submerged part of the baffle | Retention volume | Outlet |
|---|---|---|---|---|---|---|
| Small (CGP) | 1 kitchen | cylindrical | 0.30 m | 0.20 m | 18 L | DN 75 |
| Simple (CGS) | 1 to 2 kitchens | cylindrical | 0.40 m | 0.20 m | 31 L | DN 75 |
| Double (CGD) | 2 to 12 kitchens | cylindrical | 0.60 m | 0.35 m | 120 L | DN 100 |

  For a chalet: **CGP or CGS** (commercial: Tigre/Amanco DN 100 of about 19 L). UFRGS studies indicate low efficiency of these boxes, so it is advisable to suggest CGS even with 1 kitchen. Outlet diameters: [usual].
- **Inspection box (CI)** [usual]: minimum internal size 0.60 m (circular Ø 0.60 or square 0.60 × 0.60); maximum depth 1.00 m (beyond that, a manhole); maximum distance of **25 m** between inspection devices; maximum distance of **15 m** between the connection to the public collector and the nearest CI; toilet, CG, and CS branches up to **10 m** to the inspection device; CI at every change of direction, slope, or diameter of the buried network and at the junction of sub-collectors. The utility (concessionária) of the DF requires a CI cover ≥ 0.60 m. [confirmado: Caesb]
- Buried network: changes of direction with 45° bends or CI. Never use a 90° elbow in the horizontal plane of the buried network. [usual]

### 2.5 Venting

- **Maximum distance from the trap to the vent pipe (Table 8)** [confirmado: USP, CAPES]:

| DN of the discharge branch | 40 | 50 | 75 | 100 |
|---|---|---|---|---|
| Maximum distance (m) | 1.00 | 1.20 | 1.80 | 2.40 |

- **Vent branch (Table 9)** [usual]: group **without** toilet: up to 12 UHC → DN 40; 13 to 18 → DN 50; 19 to 36 → DN 75. Group **with** toilet: up to 17 UHC → DN 50; 18 to 60 → DN 75.
- **Single-story building:** there must be at least **one vent pipe** connected to the CI or at a junction with the collector/sub-collector or with the discharge branch of a toilet, extended above the roof. In a house with at most 3 toilets, the vent pipe may be **DN 75**. [confirmado: CAPES/Krona course notes]
- Venting of the toilet branch is waived when the branch is dedicated, connects directly to the stack, and is up to 2.40 m long (full list of conditions not confirmed). [incerto]
- Vent terminal [usual]: ≥ **0.30 m** above the roof (≥ 2.00 m if the slab is used as a terrace); ≥ **4.00 m** horizontally from windows and doors, or ≥ 1.00 m above their header.
- Venting is never connected to stormwater pipes. The vent column always rises with an upward slope (no siphoning).

An ANTAC study considers the Table 8 distances very conservative. Even so, the engine uses the standard's values.

**Sources for section 2:** [USP, sanitary sewer (UHC/venting tables)](https://edisciplinas.usp.br/pluginfile.php/2924543/mod_resource/content/3/Esgoto.pdf) · [CAPES, building sewer installations](https://educapes.capes.gov.br/bitstream/capes/921421/2/Instala%C3%A7%C3%B5es%20prediais%20de%20esgoto%20sanit%C3%A1rio.pdf) · [USP PHD0313 lecture 9](https://edisciplinas.usp.br/pluginfile.php/2924615/mod_resource/content/8/PHD0313%20-%20Aula%209%20-%20Instala%C3%A7%C3%B5es%20de%20Esgotamento%20Sanit%C3%A1rio.pdf) · [UFRGS, grease traps](https://seer.ufrgs.br/ambienteconstruido/article/download/5362/3287) · [Caesb, connection guidance](https://s3.caesb.df.gov.br/www/prod/site1/orientacao-ligacao-novo.pdf) · [Krona, sewer technical catalog 2024](https://www.krona.com.br/wp-content/uploads/2022/10/Catalogo-Tecnico-Esgoto-Janeiro-2024.pdf) · [ANTAC, venting distances](https://eventos.antac.org.br/index.php/sispred/article/download/2963/3687/14807) · [Amanco Wavin, grease and inspection box](https://mediahub.wavin.com/m/39134152730601d7/original/FT-Caixa-de-Gordura-e-Inspecao.pdf)

---

## 3. Stormwater: NBR 10844:1989 (summary)

- **Design flow:** `Q = I·A/60`, with Q in L/min, I in mm/h, and A in m². [confirmado]
- **Return period:** 1 year for paved areas where ponding is tolerable, **5 years for roofs and terraces**, 25 years where neither ponding nor overflow is tolerated. Duration of 5 min. [confirmado: ArchDaily]
- **Intensity:** from the standard's city table (Table 5) or regional charts. For a **projected area ≤ 100 m²**, **I = 150 mm/h** may be adopted (5.1.3). [usual; not re-checked]. Usual examples (Tr = 5 years): São Paulo 172 mm/h; Rio (Jardim Botânico) 167; Curitiba 204; Belo Horizonte 227. [incerto: check]
- **Contribution area of a pitched roof:** `A = (a + h/2)·b`, where a is the horizontal projection of the roof plane, h is the ridge height relative to the gutter, and b is the gutter length. [usual]
- **Gutter:** Manning-Strickler `Q = K·(S/n)·Rh^(2/3)·i^(1/2)`, with K = 60,000 (Q in L/min, S in m², Rh in m, i in m/m). n = 0.011 for plastic, fiber cement, steel, and nonferrous metal. Minimum slope of **0.5%**. [confirmado]
- **Capacity of semicircular gutters (n = 0.011), L/min (Table 4)** [usual]:

| Internal Ø (mm) | 0.5% | 1% | 2% |
|---|---|---|---|
| 100 | 130 | 183 | 256 |
| 125 | 236 | 333 | 466 |
| 150 | 384 | 541 | 757 |
| 200 | 829 | 1,167 | 1,634 |

- **Vertical leader:** from the standard's charts (Q, gutter head H, length L). **Minimum diameter of 70 mm** (75 mm commercial in PVC; a USP course note cites D ≥ 75). If there is a change of direction within 4 m of the gutter outlet, the flow is increased (Table 2). Rule of thumb for preliminary sizing: about 1 cm² of leader cross-section per m² of roof. [incerto: rule of thumb, use only as a warning]
- **Horizontal leader:** minimum slope of 0.5% (1% when possible), with inspection every 20 m and at changes of direction. [confirmado: 0.5%/1%]
- **For ChaléCAD:** each roof plane (already modeled with its pitch) yields an area and a flow. The user only places the downspouts, and the engine suggests a gutter Ø 100/125 and a leader Ø 75/100, and warns if the flow per downspout exceeds capacity.

**Sources:** [USP, stormwater](https://edisciplinas.usp.br/pluginfile.php/4535394/mod_resource/content/6/%C3%81guas%20Pluviais%202019%20SQ.pdf) · [USP PHD0313 lecture 11](https://edisciplinas.usp.br/pluginfile.php/2924631/mod_resource/content/7/PHD0313%20-%20Aula%2011%20-%20Instala%C3%A7%C3%B5es%20de%20%C3%81guas%20Pluviais.pdf) · [ArchDaily, preliminary gutter sizing](https://www.archdaily.com/pt/1004622/como-pre-dimensionar-uma-calha) · [UFPB, stormwater thesis](https://repositorio.ufpb.br/jspui/bitstream/123456789/35934/1/Trabalho-de-Conclusao-de-Curso-Luis-Felipe-Boudoux-Guimaraes-de-Sa.pdf) · [Amanco Wavin FT Calha Pluvial](https://mediahub.wavin.com/m/7868518c2d6e8d10/original/FT-Calha-Pluvial.pdf)

---

## 4. Septic tank, filter, and soakaway pit: NBR 7229:1993 and NBR 13969:1997

For a rural chalet without a sewer network: **septic tank → anaerobic filter → soakaway pit (sumidouro)** (or infiltration trench).

### 4.1 Septic tank (NBR 7229) [confirmado: transcription of Tables 1 to 4]

```
V = 1000 + N·(C·T + K·Lf)        V em litros
```

**Table 1: contribution C and fresh sludge Lf (per person)**

| Occupancy | C (L/day) | Lf (L/day) |
|---|---|---|
| High-standard residence | 160 | 1 |
| Medium-standard residence | 130 | 1 |
| Low-standard residence | 100 | 1 |
| Hotel (without kitchen and laundry) | 100 | 1 |
| Temporary lodging | 80 | 1 |

**Table 2: detention period T (function of N·C)**

| Daily contribution (L) | ≤ 1,500 | 1,501 to 3,000 | 3,001 to 4,500 | 4,501 to 6,000 | 6,001 to 7,500 | 7,501 to 9,000 | > 9,000 |
|---|---|---|---|---|---|---|---|
| T (days) | 1.00 | 0.92 | 0.83 | 0.75 | 0.67 | 0.58 | 0.50 |

**Table 3: sludge accumulation rate K (days)**

| Interval between cleanings | t ≤ 10 °C | 10 < t ≤ 20 °C | t > 20 °C |
|---|---|---|---|
| 1 year | 94 | 65 | 57 |
| 2 years | 134 | 105 | 97 |
| 3 years | 174 | 145 | 137 |
| 4 years | 214 | 185 | 177 |
| 5 years | 254 | 225 | 217 |

(t = average temperature of the coldest month)

**Table 4: useful depth:** V ≤ 6 m³: 1.20 to 2.20 m; 6 to 10 m³: 1.50 to 2.50 m; > 10 m³: 1.80 to 2.80 m.
**Minimum dimensions:** internal Ø 1.10 m (cylindrical); width 0.80 m and length/width ratio of 2:1 to 4:1 (prismatic).
**Minimum distances:** 1.50 m from buildings, property lines, soakaway pits, trenches, and the water service line; 3.0 m from trees and the public water network; **15 m from shallow wells and water bodies**.

### 4.2 Anaerobic filter and soakaway pit (NBR 13969)

- Anaerobic filter: `Vu = 1,6·N·C·T`, with a **minimum of 1,000 L** and a filter bed height of 1.20 m (with false bottom). [confirmado: UFPR] Filter T for contribution ≤ 1,500 L/day: 1.17 d (t < 15 °C), 1.00 d (15 to 25 °C), 0.92 d (> 25 °C). [usual]
- Soakaway pit: infiltration area `A = N·C / Ci` (m²), with **Ci = 490/(t + 2,5)** in L/m²·day, where t is the time, in min, for the water level to drop 1 cm in the percolation test. Adopt the lowest measured Ci. [confirmado: CEHOP-SE] The area counts the bottom and walls. Pit bottom ≥ 1.50 m above the water table. [usual]
- Without a percolation test, the engine must **require Ci as input** (or use 40 L/m²·day as a conservative assumption, with a warning). [suggestion]

**Sources:** [Slides with NBR 7229 (Tables 1 to 4, distances)](https://pt.slideshare.net/slideshow/nbr-7229/51039959) · [UFPR TH029, septic tank and filter](https://docs.ufpr.br/~rtkishi.dhs/TH029/TH029_09_Tanqueseptico.pdf) · [CEHOP-SE, filter and soakaway pit specification](https://orse-portal.cehop.se.gov.br/wp-content/uploads/2025/08/ES00112.pdf) · [NBR 7229 (Macaé City Hall)](https://macae.rj.gov.br/midia/uploads/NBR%207229%20de%201993%20-%20Projeto%20Constru%C3%A7%C3%A3o%20e%20Opera%C3%A7%C3%A3o%20de%20Sistemas%20de%20Tanques%20Septicos.pdf) · [Unicamp, cleaning intervals](https://www.prp.unicamp.br/inscricao-congresso/resumos/2023P21870A38713O349.pdf)

---

## 5. Gas (NBR 15526 / NBR 13103): water heater only

Only relevant when `waterHeater === 'gas'`.
- **NBR 15526** covers internal natural gas (NG) and LPG distribution networks (sizing by pressure loss, materials, cylinder enclosures). **NBR 13103** covers the installation of gas appliances (room volume, permanent ventilation, flue). [usual]
- Rules for the MVP, as **qualitative warnings**: instantaneous heater outside bathrooms and bedrooms, in a ventilated or outdoor area, with an exhaust duct to the outside; LPG cylinders in a ventilated outdoor enclosure; gas piping in copper or multilayer; shutoff valve before the appliance.
- Estimated consumption: `ṁ_GLP [kg/h] ≈ P[kW]·3,6 / 46` (LPG lower heating value ≈ 46 MJ/kg). E.g., 26 kW consumes ≈ 2.0 kg/h, more than the continuous vaporization rate of a P13 cylinder (≈ 0.6 kg/h) [incerto]. Hence the warning would be "use P45 or a cylinder bank".
- Color: gas piping in **yellow** on the plan.

---

## 6. How professional tools do it (UX)

| Tool | Plan input | Routing | Calculation | Outputs |
|---|---|---|---|---|
| **AltoQi Builder/QiBuilder Hidrossanitário** (BR) | the user places the **fixtures** in the room; points of use are created automatically at the **correct heights** | lays out conduits **with fittings**, from the points and the desired routing (polyline); risers per floor | sizing per the Brazilian standards (weights, FWH/universal, UHC); final point pressure along the full path; results validated against manual calculation (ANTAC) | automatic **isometrics**, pressure report per **critical point**, bill of materials |
| **Revit MEP** | fixture families with **connectors** and *fixture units* | *Generate Layout* (auto-routing of connected systems); slope set before generating the solutions; *System Inspector* checks connectivity | sizing by **friction and/or velocity**; FU → flow per IPC 2006 (Hunter); **pressure loss report** (HTML/CSV) via the *System Browser*, **unavailable for gravity systems** (sewer) | plans, sections, schedules |
| **Archicad MEP Designer** (AC29+) | library objects with connection ports | route drawn with **slope typed in the Tracker** (in %), inherited by new segments; the *Connection Solver* resolves sloped junctions | (limited calculation; focus on modeling) | 3D/IFC |
| **h2x** (cloud, AU/UK) | drawing in plan over a PDF | fast, in 2D | automatic sizing and pressure | reports |

**Lessons for ChaléCAD:**
1. **The fixture generates the point** (as in AltoQi). ChaléCAD already does this from the furniture (`points.ts`). The only missing piece is letting the user drag the point and adjust its height.
2. **The routing is one polyline per system**, with *snap* to walls and points. The vertices become fittings, without the user choosing "elbow" or "tee".
3. **Auto-routing as an editable suggestion** (Revit *Generate Layout*): a "Sugerir traçado" (Suggest routing) button creates the Manhattan tree along the walls (what `pipes.ts` already estimates) and the user corrects it.
4. **Sewer with automatic slope** (Archicad): the user draws on the plan and the engine computes the invert elevations from the highest point, with a default `i` by DN. A warning appears if the final elevation ends up below the CI or the septic tank.
5. **Pressure as a "badge" on the point** and a critical-path report (AltoQi). Unlike Revit, sewer is also verified, with UHC, DN, slope, and venting.
6. **Isometric per room** generated automatically (AltoQi), which is the drawing the plumber uses.

### 6.1 Proposal for a simple UX for a chalet

- **"Hidráulica" (Plumbing) tab** with a level selector (ground floor/mezzanine) and system chips: `Água fria`, `Água quente`, `Esgoto`, `Ventilação`, `Pluvial`, `Gás` (cold water, hot water, sewer, venting, stormwater, gas). The other systems are dimmed.
- **Points**: appear on their own with the furniture; a click opens a panel with fixture, point height, flow, and weight (editable, with "padrão NBR" (NBR default)). Warning icon when pressure is lacking.
- **Water tank**: drag onto the tower; the "altura do fundo" (bottom height) field shows live the pressure at the **most unfavorable shower** ("Chuveiro do mezanino: 0,62 m.c.a. de 1,00 necessários → eleve +0,40 m ou use tubo de 32").
- **Drawing**: "Tubo" (Pipe) tool (shortcut T) with *snap* to walls, points, and existing pipes; **Shift** for orthogonal; clicking on a pipe creates a tee. **Riser** (rise/drop between levels) with the P key or an automatic symbol when the pipe connects points at different levels.
- **"Gerar traçado automático" (Generate automatic routing) button** per system (replaces any existing drawing, with undo).
- **Automatic labels**: DN on each segment ("Ø25"), flow arrow and "i = 1 %" on the sewer, column names (AF-1, TQ-1, TV-1).
- **Results panel**: table per point (available P, minimum P, status), per segment (ΣP, Q, DN, v, J, hf), and per sewer branch (UHC, DN, i, venting OK).
- **Isometric** per bathroom, kitchen, and laundry (SVG generated from the elevations) and **bill of materials** (pipes by DN, fittings counted from the routing, valves, boxes).
- **Layperson vs. engineer mode**: layperson mode shows a traffic light and plain sentences; engineer mode shows the full calculation report (with the `DISCLAIMER`).

**Sources for section 6:** [AltoQi, e-book "10 reasons"](https://lps.altoqi.com.br/hubfs/%5BMKT%5D%20Materiais%20Ricos/Ebooks/%5BEbook%5D%2010%20motivos%20para%20utilizar%20um%20software%20para%20projetos%20hidrossanitario.pdf) · [ANTAC, AltoQi vs. manual calculation](https://eventos.antac.org.br/index.php/sbtic/article/download/7418/5932/34307) · [IFSC, thesis with AltoQi reports](https://repositorio.ifsc.edu.br/bitstreams/787a2b96-de79-4cf9-b1ae-6ff85836bc96/download) · [Revit, pressure loss report](https://help.autodesk.com/cloudhelp/2020/ENU/Revit-Model/files/GUID-3A1DE269-1524-48AB-88B5-82F1E0A968A3.htm) · [Revit, pipe sizing](https://help.autodesk.com/cloudhelp/2014/ENU/Revit/files/GUID-3E022D29-E44A-49B6-ADAA-053C4D7E0E76.htm) · [Revit, FU → flow](https://help.autodesk.com/cloudhelp/2020/ENU/Revit-Model/files/GUID-E1121308-E1E5-4AF1-B2FA-913CBD35F656.htm) · [Archicad 30, MEP route editing](https://help.graphisoft.com/AC/30/INT/Topics/085_MEPDesigner/085_MEPDesigner-8.html) · [Archicad 29, slopes](https://help.graphisoft.com/AC/29/INT/_AC29_Help/005_NewFeatures/005_NewFeatures-46.htm) · [h2x Engineering](https://www.h2xengineering.com/?p=47)

---

## 7. Symbols and colors on the plan

There is no Brazilian standard that fixes **drawing** colors. **NBR 6493** covers the **paint** colors of exposed piping (water = green; non-liquefied gases = yellow, etc.). Each firm or software defines its own legend. A descriptive specification (memorial descritivo) from SES-SP uses "verde emblema" (emblem green) for cold water and "verde claro" (light green) for stormwater. [confirmado] Proposal consistent with AltoQi and with practice:

| System | Color (suggested hex) | Line style | Labels |
|---|---|---|---|
| Cold water (AF) | blue `#1E88E5` (green `#2E7D32` as a theme alternative) | solid | AF-1, Ø25 |
| Hot water (AQ) | red `#E53935` | solid | AQ-1, Ø22 |
| Primary sewer (after the trap, with gases) | brown `#6D4C41` | solid, thicker | TQ-1, Ø100, i = 1 % |
| Secondary sewer (before the trap: lavatory/shower → CS) | light brown `#A1887F` | dashed | Ø40 |
| Venting | green `#43A047` | dash-dot | TV-1, CV-1, Ø50 |
| Stormwater | cyan `#00ACC1` | long dash | AP-1, Ø75 |
| Gas | yellow `#F9A825` | thin solid | G |

Symbols (plan):
- Water point: small filled circle with the height ("h = 2,10").
- Riser: circle with an arrow (↑ rises / ↓ drops) and label (AF-1, TQ-1, TV-1).
- Gate valve: two opposed triangles (bow tie). Pressure valve: bow tie with a T-shaped stem. Ball valve: bow tie with a circle.
- Siphoned floor drain box: square with a circle and "CS". Dry drain: circle "RS". Grease trap: "CG". Inspection box: 60 × 60 square "CI". Septic tank "TS", filter "FA", soakaway pit "SU".
- Water tank: rectangle with "RS 1.500 L" and the bottom elevation.
- Flow arrow on sewer and stormwater.

**Sources:** [SES-SP descriptive specification with colors](https://www.saude.sp.gov.br/resources/ses/perfil/cidadao/licitacoes-cga/memorial_descritivo_hidraulica.pdf) · [PBH, project handbook (legends)](https://prefeitura.pbh.gov.br/sites/default/files/estrutura-de-governo/obras-e-infraestrutura/pp-sd-cap27-251113.pdf) · [UFU, use of BIM (colors per system)](https://repositorio.ufu.br/bitstream/123456789/33570/3/UsoSistemasBIM.pdf)

---

## 8. Usual point heights (catalogs/practice) [usual]

| Fixture | Water (m above floor) | Sewer (m above floor) |
|---|---|---|
| Shower / spray | 2.10 to 2.20 (valve at 1.10 to 1.30) | drain/CS at floor level |
| Lavatory | 0.60 | 0.50 to 0.55 |
| Toilet with attached tank | 0.20 to 0.30 (side) | outlet at floor, Ø100 |
| Kitchen sink | 0.60 (under the countertop) or 1.10 (wall faucet) | 0.50 to 0.60 |
| Laundry tub | 0.90 to 1.10 | 0.50 to 0.60 |
| Washing machine | 0.90 to 1.10 | 0.75 to 0.90 (with siphon) |
| Water filter | 1.80 | — |
| Instantaneous heater | per manufacturer (≈1.20 to 1.50) | — |

The current engine uses 2.10 m for the shower and 1.0 m for the other points. These heights should move to the catalog (`fixtureDefaults[kind].waterHeight`).

---

## 9. Worked numerical examples (for unit tests)

Common conventions: FWH for smooth pipe `J = 0,000869·Q^1,75/D^4,75` (SI, internal D); soldered PVC ID 17.0 / 21.6 / 27.8 mm; Leq from table 1.6; pressure valve = globe valve; kinetic head neglected; reference at the **tank bottom**; `Q = max(0,3√ΣP, q_max)`. The values were computed with a script and rounded to 4 decimal places. Suggested test tolerance: ±0.005 m on hf and ±0.01 m.c.a. on P.

### Model chalet

- Ground floor at z = 0; mezzanine at z = 2.80 m.
- **Tank on the tower: bottom at z = 6.40 m.** Manifold at about 6.30 m.
- Mezzanine: bathroom with a toilet with attached tank (0.3), lavatory (0.3), and **electric shower** (0.1). ΣP = 0.7.
- Ground floor: kitchen sink (0.7), laundry tub (0.7), washing machine (1.0), and bathroom with toilet (0.3), lavatory (0.3), and electric shower (0.1). ΣP = 3.1.
- Total ΣP = 3.8.

Cold water (AF) tree:

```
Caixa ─B1─ N1 ─C1─ N2(reg. banho sup.) ─R1─ N3 ─S1─ Chuveiro mezanino (z = 4,90)
               └─C2─ N4 ─R2─ N5 ─S2─ Pia da cozinha (z = 1,00)
                         └─(ramal banho térreo, ΣP 0,7: não entra no caminho)
```

| Segment | ΣP | Q (L/s) | DN (ID) | Real L (m) | Fittings (Leq, m) | ΣLeq | v (m/s) | J (m/m) | hf (m) |
|---|---|---|---|---|---|---|---|---|---|
| B1 tank → N1 | 3.8 | 0.5848 | 32 (27.8) | 1.5 | normal entrance 0.5 + gate valve 0.3 + 90° elbow 1.5 | 2.3 | 0.963 | 0.04700 | **0.1786** |
| C1 N1 → N2 | 0.7 | 0.2510 | 25 (21.6) | 3.0 (1.0 vert. + 2.0 horiz.) | side tee 2.4 + 2 elbows 2.4 + gate valve 0.2 | 5.0 | 0.685 | 0.03546 | **0.2837** |
| R1 N2 → N3 | 0.7 | 0.2510 | 25 (21.6) | 1.2 | 90° elbow 1.2 | 1.2 | 0.685 | 0.03546 | **0.0851** |
| S1 N3 → shower | 0.1 | 0.1000 (q_max) | 20 (17.0) | 0.6 | side tee 2.3 + pressure valve 11.1 + elbow 1.1 | 14.5 | 0.441 | 0.02210 | **0.3337** |
| C2 N1 → N4 | 3.1 | 0.5282 | 32 (27.8) | 4.8 (1.0 horiz. + 3.8 vert.) | straight tee 0.9 + elbow 1.5 + gate valve 0.3 | 2.7 | 0.870 | 0.03933 | **0.2950** |
| R2 N4 → N5 | 2.4 | 0.4648 | 25 (21.6) | 4.0 | side tee 2.4 + elbow 1.2 | 3.6 | 1.268 | 0.10423 | **0.7922** |
| S2 N5 → sink | 0.7 | 0.2510 | 20 (17.0) | 2.0 | side tee 2.3 + 2 elbows 2.2 + gate valve 0.1 | 4.6 | 1.106 | 0.11061 | **0.7301** |

### Example 1: mezzanine shower under the tower (1.50 m below the tank bottom)

- Static column: 6.40 − 4.90 = **1.50 m**.
- Σhf = 0.1786 + 0.2837 + 0.0851 + 0.3337 = **0.8811 m**.
- **Dynamic P = 1.50 − 0.8811 = 0.6189 m.c.a. ≈ 6.07 kPa < 10 kPa → FAIL** (`install.pressure`, warn).
- Calculated corrections:
  - (a) **Raise the tank** by `1,00 − 0,6189 = 0,381 m` → bottom ≥ 6.79 m (1.88 m column). Rounding to +0.40 m, P = 1.019 m.c.a. OK (the losses do not change).
  - (b) **Increase the DN** of C1 and R1 to 32 and of S1 to 25 (fittings swapped for the Leq of DN 32/25): hf(C1) = 0.1005; hf(R1) = 0.0289; hf(S1) = 0.1105 → **P = 1.50 − (0.1786 + 0.1005 + 0.0289 + 0.1105) = 1.0815 m.c.a. OK**.
  - Only S1 at DN 25 (leaving C1/R1 alone): P = 0.842 m.c.a., still fails.
- **Spray shower** variant (mixer, 0.20 L/s, weight 0.4; total ΣP 4.1, upper bathroom 1.0): hf = 0.1909 + 0.3876 + 0.1163 + 1.1224 = 1.8172 → **P = −0.32 m.c.a.**, severe failure (booster pump or a much taller tank).
- Hazen-Williams comparison (C = 150) on the same path: J of 0.03873 / 0.02763 / 0.02763 / 0.01613 m/m → Σhf ≈ 0.147 + 0.221 + 0.066 + 0.244 = 0.678 → P ≈ 0.82 m.c.a. FWH is more conservative.

### Example 2: ground-floor kitchen sink (same chalet)

- Static column: 6.40 − 1.00 = **5.40 m**.
- Σhf = B1 0.1786 + C2 0.2950 + R2 0.7922 + S2 0.7301 = **1.9958 m**.
- **P = 5.40 − 1.9958 = 3.4042 m.c.a. ≈ 33.4 kPa ≥ 10 kPa → OK.** All velocities ≤ 1.27 m/s (< 3 m/s).
- Lesson: on the ground floor under a tower there is pressure to spare; the upstairs shower is what controls the design.

### Example 3: single-story chalet with the tank in the ceiling void (no tower)

- Tank bottom at z = 3.20 m and shower at z = 2.10 m → static column of **1.10 m** (the current code would accept it: ≥ 1.0).
- A manifold DN 25, ΣP 3.1, Q 0.5282, L 2.0 + Leq (entrance 0.4 + gate 0.2 + elbow 1.2) = 3.8 → v 1.441, J 0.13040, hf 0.4955.
- B bathroom branch DN 25, ΣP 0.7, L 3.0 + Leq 3.8 (side tee 2.4, elbow 1.2, gate 0.2) → hf 0.2412.
- C shower sub-branch DN 20, 0.10 L/s, L 0.8 + Leq 14.5 → hf 0.3381.
- **P = 1.10 − 1.0748 = 0.0252 m.c.a. → FAIL** (info on the ground floor, as today). The typical case calls for a booster pump. This test shows that a static-only check gives a false "OK".

### Example 4: model chalet sewer (UHC → DN)

| Segment | Contributors | ΣUHC | DN (rule) | Min. i |
|---|---|---|---|---|
| Lavatory → CS (upper) | lavatory | 1 | 40 (Tab. 3) | 2% |
| Shower → CS (upper) | shower (drain in the CS) | 2 | 40 | 2% |
| CS → toilet branch | lav + shower | 3 | **50** (CS outlet; sewer branch ≤ 6 UHC) | 2% |
| Toilet → TQ-1 | toilet + CS | 9 | **100** (toilet) | 1% |
| TQ-1 (mezzanine → ground floor) | upper bathroom | 9 | **100** (receives toilet; Tab. 6: 240) | vertical |
| Sink → CG | sink | 3 | 50 | 2% |
| CG → CI | sink | 3 | 75 (CGP/CGS outlet) | 2% |
| Laundry tub + machine → CS/CI | 3 + 3 | 6 | 50 (≤ 6) → 75 recommended due to foam | 2% |
| Ground-floor bathroom → CI | 6 + 1 + 2 | 9 | 100 | 1% |
| **Final sub-collector** | all | **9 + 9 + 3 + 6 = 27** | **100** (Tab. 7, 1%: 216) | 1% |

- Venting: the toilet branch (DN 100) must have a vent within 2.40 m of the trap; the CS outlet (DN 50) within 1.20 m. The vent branch for a group with a toilet and 9 UHC (≤ 17) is **DN 50**. The primary vent pipe (extension of TQ-1) may be DN 75 (house with ≤ 3 toilets), exiting ≥ 0.30 m above the roof.
- Elevations: toilet branch of 2.0 m at 1% → drop of 0.02 m. Sub-collector of 12 m to the CI at 1% → drop of 0.12 m. If the pipe invert at the house exit is at −0.30 m, it reaches the CI at −0.42 m (CI depth ≤ 1.00 m: OK).

### Example 5: septic system for a 3-bedroom chalet (no sewer network)

- N = 6 (2 per bedroom); medium standard C = 130 L, Lf = 1; N·C = 780 L/day ≤ 1,500 → T = 1.00; cleaning every 2 years and coldest month between 10 and 20 °C → K = 105.
- **V = 1000 + 6·(130·1,00 + 105·1) = 1000 + 6·235 = 2.410 L.** Useful depth between 1.20 and 2.20 m. Cylindrical with Ø ≥ 1.10 m: Ø 1.50 m → area 1.767 m² → h = 1.36 m. OK.
- Anaerobic filter: Vu = 1.6·6·130·1.00 = **1,248 L** (≥ 1,000).
- Soakaway pit with percolation test t = 5 min/cm: Ci = 490/7.5 = **65.3 L/m²·day** → A = 780/65.3 = **11.94 m²**. With Ø 1.50 m: bottom 1.767 m² + wall π·1.5·h → h = (11.94 − 1.767)/4.712 = **2.16 m** of useful infiltration height.

### Example 6: gutter for a single-slope roof

- a = 4.0 m (projection), h = 1.2 m, b = 6.0 m → A = (4.0 + 0.6)·6.0 = **27.6 m²**; I = 150 mm/h → **Q = 150·27.6/60 = 69 L/min**.
- Semicircular gutter Ø 100 at 0.5%: capacity of 130 L/min ≥ 69 → OK. Leader Ø 75 (≥ 70): OK.

---

## 10. Proposed spec for ChaléCAD

> The types below are a proposal. Schemas (`packages/engine/src/schema`, `packages/catalog/src/schema.ts`) only change through the orchestrator session.

### 10.1 Data model (project, source of truth)

```ts
// --- packages/engine/src/schema/plumbing.ts (proposta) ---
type PlumbingSystem = 'cold' | 'hot' | 'sewer' | 'vent' | 'rain' | 'gas';
type PipeMaterial = 'pvc_soldavel' | 'ppr_pn20' | 'cpvc' | 'pex' | 'cobre' | 'pvc_esgoto' | 'pvc_esgoto_reforcado';

type FixtureKind =
  | 'toilet_tank' | 'toilet_valve' | 'lavatory' | 'shower_mixer' | 'shower_electric'
  | 'kitchen_sink' | 'laundry_tub' | 'washing_machine' | 'dishwasher' | 'bathtub'
  | 'garden_tap' | 'bidet' | 'water_heater_gas' | 'water_heater_solar' | 'filter';

interface PlumbingFixture {
  id: string;
  kind: FixtureKind;
  level: string;                 // id do nível
  position: [number, number];    // m, planta (x, y)
  furnitureId?: string | null;   // vínculo com o móvel que o gerou
  waterHeight?: number;          // m do piso; padrão no catálogo
  sewerHeight?: number;          // m do piso
  /** Sobrescritas do usuário (padrão no catálogo por kind). */
  flowLps?: number;              // q de projeto
  weight?: number;               // peso relativo (AF)
  hotWeight?: number;            // peso relativo (AQ)
  uhc?: number;
  minPressureKpa?: number;       // ex.: aquecedor 20, ducha 20
  hasHot?: boolean;
}

interface WaterTank {
  id: string;
  level: string;
  position: [number, number];
  bottomZ: number;               // cota absoluta do fundo (m): referência de pressão
  liters: number;                // calculado por padrão, editável
  towerId?: string | null;
}

/** Nó do grafo: ponto livre, junção, prumada ou conexão com um aparelho/caixa. */
interface PipeNode {
  id: string;
  level: string;
  position: [number, number];
  z: number;                     // cota absoluta (m); no esgoto é a geratriz inferior
  ref?: { kind: 'fixture' | 'tank' | 'device'; id: string; port?: 'cold' | 'hot' | 'sewer' };
}

interface PipeSegment {
  id: string;
  system: PlumbingSystem;
  from: string;                  // PipeNode.id (montante, no sentido do escoamento)
  to: string;
  /** Vértices intermediários em planta; cada vértice = joelho/curva. */
  path: [number, number][];
  dn?: number | null;            // null = o motor dimensiona
  material?: PipeMaterial;
  slope?: number | null;         // m/m; esgoto/pluvial; null = mínimo por DN
  locked?: boolean;              // usuário fixou o DN
}

/** Dispositivos em linha ou terminais. */
interface PlumbingDevice {
  id: string;
  kind: 'gate_valve' | 'pressure_valve' | 'ball_valve' | 'check_valve'
      | 'siphon_box' | 'dry_drain' | 'grease_trap' | 'inspection_box'
      | 'septic_tank' | 'anaerobic_filter' | 'soakaway' | 'pressurizer'
      | 'gutter_outlet' | 'vent_terminal' | 'sewer_connection' | 'water_meter';
  nodeId: string;
  params?: Record<string, number>; // ex.: grease_trap {liters: 31}; pressurizer {headM: 15}
}

interface PlumbingProject {
  enabled: boolean;
  fixtures: PlumbingFixture[];
  tank: WaterTank | null;
  nodes: PipeNode[];
  segments: PipeSegment[];
  devices: PlumbingDevice[];
  settings: {
    headLoss: 'fwh' | 'hazen' | 'darcy';
    velocityTarget: number;      // m/s (padrão 2,0)
    sewerDisposal: 'public' | 'septic';
    septic?: { cleaningYears: 1|2|3|4|5; coldMonthTemp: number; percolationMinPerCm?: number; standard: 'alto'|'medio'|'baixo' };
    rainIntensity?: number;      // mm/h (padrão 150)
    autoRoute: boolean;          // traçado gerado (true) vs. desenhado
  };
}
```

**Rule:** derived geometry (3D lengths, fittings, sewer elevations) is **not saved**. The project stores the nodes, the segments, and the user's choices. If `autoRoute = true`, not even the segments are saved: the engine generates them by a pure function from the fixtures and the tank (preserving the current behavior of `pipes.ts`).

### 10.2 Result (derived)

```ts
interface WaterSegmentResult {
  id: string; system: 'cold'|'hot';
  sumWeights: number; flowLps: number; dn: number; di: number;
  velocity: number; lengthReal: number; fittings: { kind: string; count: number; leq: number }[];
  leqTotal: number; jMperM: number; headLoss: number;
}
interface WaterPointResult {
  fixtureId: string; z: number; staticHead: number; headLossPath: number;
  dynamicHead: number; dynamicKpa: number; minKpa: number; ok: boolean;
  criticalPath: string[];      // ids dos segmentos da caixa até o ponto
  requiredTankRise: number;    // m adicionais para atender (0 se ok)
}
interface SewerSegmentResult {
  id: string; uhc: number; dn: number; slope: number; zFrom: number; zTo: number;
  kind: 'ramal_descarga'|'ramal_esgoto'|'tubo_queda'|'subcoletor'|'coletor';
  ventOk: boolean; ventDistance?: number;
}
interface PlumbingReport {
  water: { segments: WaterSegmentResult[]; points: WaterPointResult[] };
  sewer: { segments: SewerSegmentResult[]; totalUhc: number };
  rain?: { downpipes: { id: string; areaM2: number; flowLpm: number; dn: number; gutterOk: boolean }[] };
  septic?: { tankLiters: number; filterLiters: number; soakawayAreaM2: number; depthM: number };
  tank: { liters: number; dailyLiters: number; occupants: number; fullKg: number };
  materials: { itemId: string; qty: number; unit: 'm'|'un' }[];
  warnings: EngineWarning[];
}
```

### 10.3 Cold and hot water pipeline (pure function `computeWater`)

1. **Build the graph** of the system (`cold` or `hot`) from nodes and segments. Validate: it is a **tree** rooted at the tank (AF) or at the heater (AQ). No cycles and no loose fixture (`plumbing.disconnected`).
2. **3D geometry:** length of each segment = Σ plan-view runs + |Δz| of the risers. Inferred fittings: a vertex with an angle of 80° to 100° becomes a 90° elbow; 35° to 55° becomes a 45° elbow; a node with 3 connections becomes a tee (straight if the outgoing run is collinear with the incoming one, side otherwise); a node with a level change becomes 2 elbows; a tank node becomes a "normal entrance"; devices become valves. The Leq of each fitting comes from the catalog by DN.
3. **Accumulate weights** in post-order: `ΣP(seg) = Σ weights of the fixtures downstream`; `q_max(seg)`.
4. `Q = max(0,3·√ΣP, q_max)`.
5. **DN:** if `locked`, use the user's DN; otherwise, the smallest DN with `v ≤ velocityTarget` and `DN ≥ minimum DN of the fixture` (sub-branch), without becoming smaller than the downstream DN (DN does not increase in the flow direction).
6. **Loss:** `hf = J(Q, DI, material)·(L + ΣLeq)`.
7. **Pressure** in pre-order: `H(tank) = 0` at `z = bottomZ`; `H(node) = H(parent) + (z_parent − z_node) − hf`. Pressure at the point = H at the fixture's node (z = point elevation).
8. **Optimization** (optional, if `autoSize`): while a point fails, increase one DN on the unlocked segment with the largest `hf` on the critical path; repeat (limit of 20 iterations).
9. **10% check (2020):** for each shower, recompute H with only that shower open (`Q = q_shower` on the path) and compare with the design H (simultaneous). If the difference is > 10% of the isolated H, issue a warning.
10. **AQ:** same algorithm with the AQ weights, the material's ID, and the hot water J. The root is the heater, and the heater's inlet pressure = H at the AF node that feeds it, minus the heater's internal loss (catalog: default 2 m.c.a. [incerto]).

### 10.4 Sewer pipeline (`computeSewer`)

1. Directed graph from the fixtures to the outlet (`sewer_connection` or `septic_tank`). It must be a converging tree.
2. **UHC** accumulated from downstream to upstream (simple sum, no simultaneity).
3. **Classify segments:** directly connected to the fixture = discharge branch; after CS/CG = sewer branch; vertical between levels = stack; horizontal buried on the ground floor = sub-collector or collector.
4. **DN:** maximum of the fixture's minimum DN (Tab. 3), the DN from the class table (Tab. 5/6/7), and the upstream DN (does not reduce in the flow direction). A segment with a toilet upstream ≥ 100.
5. **Slope:** if `slope = null`, 2% for DN ≤ 75 and 1% for DN ≥ 100. Validate 0.5% ≤ i ≤ 5% and i ≥ the DN's minimum.
6. **Elevations:** starting from each fixture's outlet elevation (floor − trap height), `z_to = z_from − i·L`. At a confluence the lowest elevation prevails. CI depth ≤ 1.00 m. The arrival elevation must be above the septic tank's or the network's inlet elevation (`sewer.too_deep`).
7. **Venting:** for each trap (toilet siphon, CS, CG), find the distance along the piping to the nearest vent pipe and compare with Tab. 8. Check the vent branch DN (Tab. 9). Require at least 1 vent exiting above the roof (`vent_terminal` with z ≥ roof + 0.30).
8. **Devices:** CS DN 100 with ≤ 6 UHC; a kitchen sink requires a CG before the CI; CI every ≤ 25 m and ≤ 15 m from the connection; toilet/CS/CG branch with ≤ 10 m to the CI.
9. **Septic tank** (if `septic`): section 4, with N coming from `installations.occupants`.

### 10.5 Warnings (codes, thresholds, basis)

| Code | Condition | Severity | Basis |
|---|---|---|---|
| `water.pressure_low` | P_dyn < the fixture's minKpa (10 kPa default; 5 attached tank; 15 valve; heater per catalog) | warn (mezzanine) / info (ground floor) | NBR 5626:1998 5.3.5.2 |
| `water.pressure_network` | any node with H < 0.5 m.c.a. (5 kPa) or above the tank bottom | error | NBR 5626 |
| `water.static_high` | static > 400 kPa | error | NBR 5626 |
| `water.velocity_high` | v > 3.0 m/s (error); v > velocityTarget (info) | error/info | NBR 5626 |
| `water.shower_drop` | drop > 10% at the shower in simultaneous use | warn | NBR 5626:2020 |
| `water.tank_rise` | message with the ΔH required for the critical point | info | derived |
| `water.pressurizer` | gas heater with P < minimum; or spray shower with P < 20 kPa | warn | manuals |
| `water.dn_min` | sub-branch DN < the fixture's minimum | warn | NBR 5626:1998 |
| `water.tank_small` | volume < 1 day of consumption, or < 500 L | warn | NBR 5626 |
| `water.disconnected` | fixture with no connection to the tank | error | — |
| `sewer.toilet_dn` | toilet branch < 100 | error | NBR 8160 Tab. 3 |
| `sewer.uhc_exceeded` | UHC > capacity of the DN (Tab. 5/6/7) | error | NBR 8160 |
| `sewer.slope` | i < 2% (DN ≤ 75), i < 1% (DN ≥ 100), or i > 5% | error/warn | NBR 8160 |
| `sewer.dn_reduction` | DN decreases in the flow direction | error | NBR 8160 |
| `sewer.vent_distance` | trap beyond 1.00/1.20/1.80/2.40 m from the vent | warn | NBR 8160 Tab. 8 |
| `sewer.no_vent` | no vent pipe above the roof | error | NBR 8160 |
| `sewer.vent_terminal` | terminal < 0.30 m above the roof or < 4 m from a window (without being 1 m above the header) | warn | NBR 8160 |
| `sewer.toilet_in_siphon_box` | toilet connected to a siphoned floor drain box | error | NBR 8160 |
| `sewer.grease_trap` | kitchen sink without a CG | warn | NBR 8160 |
| `sewer.inspection_spacing` | > 25 m between CIs; > 15 m to the connection; > 10 m from toilet/CS/CG to the CI | warn | NBR 8160 |
| `sewer.inspection_depth` | CI with depth > 1.00 m | warn | NBR 8160 |
| `septic.distance` | tank < 1.5 m from a building/property line or < 15 m from a well | warn | NBR 7229 5.1 |
| `septic.no_percolation` | soakaway pit without Ci provided | info | NBR 13969 |
| `rain.gutter_capacity` | Q > gutter capacity (Tab. 4 / Manning) | warn | NBR 10844 |
| `rain.downpipe_min` | vertical leader < 70 mm | warn | NBR 10844 |
| `rain.slope` | gutter < 0.5% | warn | NBR 10844 |

Every message carries `refs` (ids of segments, points, and devices) to highlight on the plan. The report includes the `DISCLAIMER`.

### 10.6 Catalog constants (`packages/catalog`)

Suggestion: a new `constants.plumbing` block, versioned with a `source` on each table.

```jsonc
{
  "plumbing": {
    "version": "2026-11",
    "units": { "kPaPerMca": 9.80665 },
    "water": {
      "simultaneityC": 0.30,                    // Q = C·√ΣP (L/s)
      "minDynamicKpa": { "default": 10, "toilet_tank": 5, "toilet_valve": 15, "network": 5 },
      "maxStaticKpa": 400,
      "maxSurgeKpa": 200,
      "maxVelocity": 3.0,
      "velocityTarget": 2.0,
      "showerSimultaneousDropMax": 0.10,
      "pressureReference": "tank_bottom",
      "fixtures": {
        "toilet_tank":      { "q": 0.15, "w": 0.3, "wHot": 0,   "dnMin": 20, "uhc": 6, "sewerDn": 100, "waterH": 0.25, "sewerH": 0.0 },
        "toilet_valve":     { "q": 1.70, "w": 32,  "wHot": 0,   "dnMin": 40, "uhc": 6, "sewerDn": 100, "waterH": 1.10, "sewerH": 0.0 },
        "lavatory":         { "q": 0.15, "w": 0.3, "qHot": 0.20, "wHot": 0.5, "dnMin": 20, "uhc": 1, "sewerDn": 40, "waterH": 0.60, "sewerH": 0.50 },
        "shower_mixer":     { "q": 0.20, "w": 0.4, "qHot": 0.20, "wHot": 0.5, "dnMin": 20, "uhc": 2, "sewerDn": 40, "waterH": 2.20, "sewerH": 0.0, "minKpa": 10 },
        "shower_electric":  { "q": 0.10, "w": 0.1, "wHot": 0,   "dnMin": 20, "uhc": 2, "sewerDn": 40, "waterH": 2.10, "sewerH": 0.0, "minKpa": 10 },
        "kitchen_sink":     { "q": 0.25, "w": 0.7, "qHot": 0.25, "wHot": 0.7, "dnMin": 20, "uhc": 3, "sewerDn": 50, "waterH": 0.60, "sewerH": 0.55, "needsGreaseTrap": true },
        "laundry_tub":      { "q": 0.25, "w": 0.7, "wHot": 0,   "dnMin": 25, "uhc": 3, "sewerDn": 40, "waterH": 1.00, "sewerH": 0.55 },
        "washing_machine":  { "q": 0.30, "w": 1.0, "wHot": 0,   "dnMin": 25, "uhc": 3, "sewerDn": 50, "waterH": 1.00, "sewerH": 0.80 },
        "dishwasher":       { "q": 0.30, "w": 1.0, "wHot": 0,   "dnMin": 20, "uhc": 2, "sewerDn": 50, "waterH": 0.60, "sewerH": 0.55 },
        "bathtub":          { "q": 0.30, "w": 1.0, "qHot": 0.30, "wHot": 1.0, "dnMin": 20, "uhc": 2, "sewerDn": 40, "waterH": 0.70, "sewerH": 0.0 },
        "bidet":            { "q": 0.10, "w": 0.1, "qHot": 0.10, "wHot": 0.1, "dnMin": 20, "uhc": 1, "sewerDn": 40, "waterH": 0.30, "sewerH": 0.0 },
        "garden_tap":       { "q": 0.20, "w": 0.4, "wHot": 0,   "dnMin": 20, "uhc": 0, "waterH": 0.60 },
        "water_heater_gas": { "minKpa": 20, "internalLossMca": 2.0 }   // [incerto] conferir fabricante
      },
      "pipes": {
        "pvc_soldavel": { "hazenC": 150, "fwh": "smooth", "sizes": [
          { "dn": 20, "di": 0.0170 }, { "dn": 25, "di": 0.0216 }, { "dn": 32, "di": 0.0278 },
          { "dn": 40, "di": 0.0352 }, { "dn": 50, "di": 0.0440 }, { "dn": 60, "di": 0.0534 } ] },
        "ppr_pn20": { "hazenC": 150, "fwh": "smooth", "maxTempC": 70, "sizes": [
          { "dn": 20, "di": 0.0132 }, { "dn": 25, "di": 0.0166 }, { "dn": 32, "di": 0.0212 }, { "dn": 40, "di": 0.0266 } ] },
        "pex": { "hazenC": 150, "fwh": "smooth", "sizes": [
          { "dn": 16, "di": 0.0116 }, { "dn": 20, "di": 0.0144 }, { "dn": 25, "di": 0.0180 }, { "dn": 32, "di": 0.0232 } ] }
      },
      "headLoss": {
        "fwh": { "smoothCold": { "k": 0.000869, "qExp": 1.75, "dExp": 4.75 },
                 "smoothHot":  { "k": 0.000701, "qExp": 1.75, "dExp": 4.75 },
                 "rough":      { "k": 0.002021, "qExp": 1.88, "dExp": 4.88 } },
        "hazen": { "k": 10.643, "qExp": 1.852, "dExp": 4.87 },
        "darcy": { "roughnessM": { "pvc_soldavel": 1.5e-6, "ppr_pn20": 7e-6, "pex": 7e-6 }, "nu20": 1.0e-6, "nu60": 4.7e-7 }
      },
      // Comprimentos equivalentes (m) por DN de PVC: índices = [20, 25, 32, 40, 50]
      "leq": {
        "dn": [20, 25, 32, 40, 50],
        "elbow90":       [1.1, 1.2, 1.5, 2.0, 3.2],
        "elbow45":       [0.4, 0.5, 0.7, 1.0, 1.0],
        "bend90":        [0.4, 0.5, 0.6, 0.7, 1.2],
        "bend45":        [0.2, 0.3, 0.4, 0.5, 0.6],
        "teeStraight":   [0.7, 0.8, 0.9, 1.5, 2.2],
        "teeBranch":     [2.3, 2.4, 3.1, 4.6, 7.3],
        "entranceNormal":[0.3, 0.4, 0.5, 0.6, 1.0],
        "entranceBorda": [0.9, 1.0, 1.2, 1.8, 2.3],
        "exit":          [0.8, 0.9, 1.3, 1.4, 3.2],
        "gateValve":     [0.1, 0.2, 0.3, 0.4, 0.7],
        "globeValve":    [11.1, 11.4, 15.0, 22.0, 35.8],
        "pressureValve": [11.1, 11.4, 15.0, 22.0, 35.8],   // = globo (prática de apostilas)
        "angleValve":    [5.9, 6.1, 8.4, 10.5, 17.0],
        "checkValveLight":[2.5, 2.7, 3.8, 4.9, 6.8]
      },
      "reservoir": { "litersPerPerson": 150, "reserveDays": 2, "personsPerBedroom": 2, "minLiters": 500,
                     "tankSizes": [500, 750, 1000, 1500, 2000, 3000, 5000] },
      "pressurizerSuggestKpa": { "showerElectric": 10, "showerMixer": 20, "gasHeater": 20 }
    },
    "sewer": {
      "slopeMin": { "upTo75": 0.02, "from100": 0.01 }, "slopeMax": 0.05,
      "unlistedFixtureUhcByDn": { "40": 2, "50": 3, "75": 5, "100": 6 },
      "branchMaxUhc":  { "40": 3, "50": 6, "75": 20, "100": 160 },
      "stackMaxUhc":   { "upTo3Floors": { "40": 4, "50": 10, "75": 30, "100": 240, "150": 960 },
                         "over3Floors": { "40": 8, "50": 24, "75": 70, "100": 500, "150": 1900 } },
      "collectorMaxUhc": { "100": { "0.005": 180, "0.01": 216, "0.02": 250, "0.04": 300 },
                           "150": { "0.01": 700, "0.02": 840, "0.04": 1000 } },
      "ventMaxDistance": { "40": 1.00, "50": 1.20, "75": 1.80, "100": 2.40 },
      "ventBranchDn": { "noToilet": [[12, 40], [18, 50], [36, 75]], "withToilet": [[17, 50], [60, 75]] },
      "ventTerminal": { "aboveRoof": 0.30, "aboveTerrace": 2.00, "fromOpeningH": 4.00, "aboveLintel": 1.00 },
      "primaryVentDnResidentialUpTo3Toilets": 75,
      "siphonBoxMaxUhc": { "100": 6, "125": 10, "150": 15 },
      "greaseTraps": [
        { "id": "CGP", "maxKitchens": 1,  "diameter": 0.30, "septum": 0.20, "liters": 18,  "outDn": 75 },
        { "id": "CGS", "maxKitchens": 2,  "diameter": 0.40, "septum": 0.20, "liters": 31,  "outDn": 75 },
        { "id": "CGD", "maxKitchens": 12, "diameter": 0.60, "septum": 0.35, "liters": 120, "outDn": 100 } ],
      "inspection": { "minSide": 0.60, "maxDepth": 1.00, "maxSpacing": 25, "maxToConnection": 15, "maxFromTrap": 10 }
    },
    "rain": {
      "defaultIntensity": 150, "returnPeriodRoof": 5, "manningK": 60000,
      "manningN": { "pvc": 0.011, "metal": 0.011, "fibrocimento": 0.011, "concreto_alisado": 0.012, "ceramica": 0.013 },
      "gutterMinSlope": 0.005, "downpipeMinDn": 70, "horizontalMinSlope": 0.005,
      "semicircularGutterLpm": { "100": [130, 183, 256], "125": [236, 333, 466], "150": [384, 541, 757], "200": [829, 1167, 1634] },
      "semicircularSlopes": [0.005, 0.01, 0.02]
    },
    "septic": {
      "contribution": { "alto": { "C": 160, "Lf": 1 }, "medio": { "C": 130, "Lf": 1 }, "baixo": { "C": 100, "Lf": 1 } },
      "detention": [[1500, 1.00], [3000, 0.92], [4500, 0.83], [6000, 0.75], [7500, 0.67], [9000, 0.58], [null, 0.50]],
      "sludgeK": { "1": [94, 65, 57], "2": [134, 105, 97], "3": [174, 145, 137], "4": [214, 185, 177], "5": [254, 225, 217] },
      "sludgeKTempBands": [10, 20],
      "depth": [[6, 1.20, 2.20], [10, 1.50, 2.50], [null, 1.80, 2.80]],
      "minDiameter": 1.10, "minWidth": 0.80,
      "distances": { "building": 1.5, "boundary": 1.5, "waterMain": 3.0, "tree": 3.0, "well": 15.0, "waterBody": 15.0 },
      "filter": { "factor": 1.6, "minLiters": 1000, "bedHeight": 1.20, "T_upTo1500": [1.17, 1.00, 0.92] },
      "soakaway": { "ciFormula": { "a": 490, "b": 2.5 }, "defaultCi": 40, "minToWaterTable": 1.5 }
    },
    "colors": { "cold": "#1E88E5", "hot": "#E53935", "sewer": "#6D4C41", "sewerSecondary": "#A1887F",
                "vent": "#43A047", "rain": "#00ACC1", "gas": "#F9A825" }
  }
}
```

### 10.7 Suggested unit tests (from section 9)

```ts
// packages/engine/src/plumbing/water.test.ts (proposta)
it('FWH: J(0,1 L/s, DI 17,0) = 0,02210 m/m', ...);              // ±1e-4
it('FWH: J(0,5848 L/s, DI 27,8) = 0,04700 m/m', ...);
it('Q = max(0,3√ΣP, qmax): ΣP 0,1 elétrico → 0,10; ΣP 3,8 → 0,5848', ...);
it('Ex.1 chuveiro do mezanino: P = 0,619 m.c.a., falha, ΔH necessário = 0,381 m', ...);
it('Ex.1b com C1/R1 DN32 e S1 DN25: P = 1,082 m.c.a., ok', ...);
it('Ex.2 pia térreo: P = 3,404 m.c.a., ok; v máx. = 1,268 m/s', ...);
it('Ex.3 caixa no forro: P = 0,025 m.c.a., falha (só estática daria ok)', ...);
it('Inferência de conexões: polilinha com 2 vértices ortogonais = 2 joelhos 90°', ...);
// packages/engine/src/plumbing/sewer.test.ts
it('Ex.4: subcoletor 27 UHC → DN100 a 1 %; ramal da bacia sempre DN100', ...);
it('CS com lav + chuveiro = 3 UHC → saída DN50; ventilação ≤ 1,20 m', ...);
it('slope null: DN50 → 2 %, DN100 → 1 %; cota final = z0 − Σ i·L', ...);
// packages/engine/src/plumbing/septic.test.ts
it('Ex.5: N=6, médio, 2 anos, 10–20 °C → V = 2410 L; filtro 1248 L; sumidouro 11,94 m² (t = 5)', ...);
// rain
it('Ex.6: A = 27,6 m², I = 150 → Q = 69 L/min; calha Ø100 a 0,5 % ok', ...);
```

### 10.8 Suggested phases

1. **Engine (no UI):** `plumbing` catalog + `computeWater` over the current **automatic** routing (the Manhattan tree from `pipes.ts`, now with nodes and fittings) → replaces `pressureWarnings` (losses included) and removes the hardcoded constants from `index.ts`.
2. **Sewer:** UHC, DN, slope, elevations, CS/CG/CI, and venting automatic, with warnings.
3. **Plan UI:** layers per system, symbols, pressure badge, results panel.
4. **Editing:** pipe tool (polyline), risers, valves, DN locking, "generate routing".
5. **Isometric + bill of materials** (fittings counted from the graph, in place of `pipe_fittings` per point).
6. **Stormwater, septic tank, and gas** (warnings and simple sizing).

---

## 11. Uncertainties to resolve before blocking validations

1. Exact text of NBR 5626:2020 on minimum dynamic pressure (kept at 10 kPa? changed to "per manufacturer"?) and maximum velocity. The accessible sources confirm only the removal of the weights method, the 10% rule, and the 400 kPa.
2. Leq of the **pressure valve** (using globe, 11.1 m at DN 20, is conservative; manufacturers may give less) and of ball valves.
3. DN 32 to 50 columns of the Leq table and Tables 6, 7, and 9 of NBR 8160 (usual values, not re-checked here).
4. Full conditions for waiving venting and the primary vent DN in houses (DN 75 with ≤ 3 toilets was seen in a secondary source).
5. Rainfall intensities per city (Table 5 of NBR 10844) and the vertical leader rule (chart).
6. Internal loss and minimum pressure of gas heaters: register per model, with a conservative default of 2 m.c.a.
7. Temperature and anti-Legionella requirements of the hot water part of NBR 5626:2020.
