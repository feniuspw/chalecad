# Approval and Technical Documentation: ART/RRT, City Hall, Standards, Descriptive Specifications, and Checklist for ChaléCAD

Research date: 2026-11-09. Scope: single-family home of 1 to 2 floors (with mezzanine/loft), 30 to 120 m², LSF (light steel frame) or wood frame, radier (raft slab), sandwich roof panel, electrical and plumbing/sanitary installations with septic tank/soakaway pit, any state in Brazil.

Confidence conventions:
- **[confirmado]** (confirmed): found in an official source or standards catalog during this research.
- **[secundário]** (secondary): found only in a secondary source (article, thesis, news). Use with caution.
- **[a conferir]** (to verify): could not be confirmed in the research; comes from general knowledge and must be checked against the official text before becoming a rule in the code.

General notice: ABNT standards are paid and the full text was not read. Every numeric standard criterion listed here as "a conferir" must be validated by a licensed professional before entering `packages/catalog` as a versioned technical constant. ChaléCAD is a support tool and does not replace a project with ART/RRT (see `DISCLAIMER` in `@chalecad/engine`).

---

## Executive summary (critical findings)

1. **Current ART**: Confea Resolution No. 1.137, of 03/31/2023 (DOU 04/05/2023), revoked Res. 1.025/2009. On 12/11/2025 the Confea Plenary (Plenary Session No. 1132) approved an **update** to 1.137 that revises models A, B, and D of Annex I (forms). Number and effective date of the update rule: **a conferir**. [partially confirmed]
2. **Current RRT**: Law 12.378/2010 (arts. 45 to 50) and CAU/BR Res. No. 91/2014, amended by Res. 166/2018 and 184/2019. Check whether a more recent consolidation exists. [partially confirmed]
3. **NBR 16970 (LSF)** exists, in 3 parts, published in May 2022: part 1 Performance, part 2 Structural design, part 3 Interfaces between systems. [confirmado]
4. **NBR 17076:2024** replaced NBR 7229:1993 and NBR 13969:1997 (on-site sewage treatment). Relevant changes: more restrictive setback distances and mandatory alternating use of the final disposal units; only one type of upflow anaerobic filter; no longer covers the multi-chamber septic tank. [secundário, from theses/articles]
5. **NBR 5444** (graphic symbols for building electrical installations) is listed as **canceled**, with no direct replacement. In practice, designers keep using the NBR 5444:1989 symbology and/or a legend of their own in the project. [secundário/catalog]
6. **NBR 7190** was reissued in 2022 in parts (Part 1 design criteria, 06/2022; the other parts are test methods). [confirmado]
7. **Title block (carimbo)**: there is no single list mandated by law; NBR 10582 applies (title block also in NBR 6492:2021) plus the requirements of each city hall/council. The practical minimum fields are in section 4.4.
8. **Urban planning parameters** (setbacks, TO (site coverage), CA (floor-area ratio), TP (permeability rate), height limit) are municipal. The program can only ask for the value and check it.
9. **ART fees 2026**: base table by contract bracket (Table A). Example Crea-MT 2026: R$ 108,39 up to R$ 15.000 and R$ 285,59 above. Values vary by Crea. [confirmado for MT]

---

## 1. ART (Confea/Crea)

ART = Anotação de Responsabilidade Técnica (the engineer's technical liability record); Confea/Crea = the federal and regional engineering councils.

### 1.1 Legal basis
- **Law No. 6.496, of 12/07/1977**: establishes the ART for every engineering, architecture, and agronomy work or service. [confirmado, general knowledge]
- **Confea Resolution No. 1.137/2023** (03/31/2023): governs the ART, the Professional Technical Collection (Acervo Técnico-Profissional) and the Operational Collection (Acervo Operacional). Revokes, among others, Res. 1.025/2009. [confirmado] Sources:
  - https://netcpa.com.br/noticias/conselho-federal-de-engenharia-e-agronomia-fixados-os-procedimentos-necessarios-para-anotacao-de-responsabilidade-tecnica-art-e-requerimento-de-acervo-tecnico-profissional-e-operacional/15479
  - https://www.coad.com.br/home/noticias-detalhe/118517/confea-fixa-procedimentos-sobre-art-anotacao-de-responsabilidade-tecnica
- **Update (Dec 2025)**: Confea approved adjustments to models A, B, and D of Annex I, more objective procedures for proving technical collections, and uniformity among Creas. Resolution number and effective date: a conferir. https://www.confea.org.br/confea-atualiza-regras-de-art-e-acervo-tecnico-e-moderniza-o-sistema
- **Confea Resolution No. 1.067/2015**: (fees) rule that the ART fee for a work/service is based on the contract value; the multiple ART adds up the routine ARTs (Tables A and B). Check whether still in force after 1.137. https://www.normasbrasil.com.br/norma/resolucao-1067-2015_303886.html
- **Confea Plenary Decision No. 0449/2025**: annual fees, service fees, and ART fees for 2026. https://www.confea.org.br/profissional/taxas
- Professional attributions: **Confea Res. 218/1973** (activities), **Confea Res. 1.073/2016** (attributions of professional titles), and Normative Decisions by modality. Check validity. [a conferir]
- A working group is under way to reformulate the rule (substitution ART, complementary ART, CAT/CAO). https://www.confea.org.br/node/230892

### 1.2 ART types (Res. 1.137/2023)
Classification by **form of registration** (art. 10, per the results): [secundário]
- **Initial ART**: first record for the work/service.
- **Substitution ART**: linked to the initial one, replaces recorded data.
- **Complementary ART**: proposal/studies under review; check whether it is already in the updated rule. [a conferir]

Classification by **participation modality**: [secundário]
- **Individual ART** (one professional), **co-authorship** (more than one professional in the same activity), **joint responsibility**, **team** (a conferir).

By **nature of the link/object**:
- **Work or service ART** (model A of Annex I, a conferir): tied to a contract (written or verbal), with client, value, period. This is the one used for the chalet's design and construction.
- **Position or function ART** (model B, a conferir): employment relationship or public office. Does not apply to the self-employed author.
- **Multiple ART** (art. 9, II, per the results): monthly, for routine works/services (Table B), with a single payment. Not suitable for a new building project; serves recurring services. [partially confirmed]
- **Routine work/service ART**: arts. 34 and 35 of 1.137. [secundário]
- **ART closure (baixa)**: arts. 13 to 15; closure does not release administrative, civil, and criminal liability. [secundário]
- **Late / regularization ART**: filed after the activity started/ended; may carry a fine. [a conferir]

### 1.3 Form fields (work or service)
The official list is in Annex I of Res. 1.137/2023 and changes with the 2025 update; the list below is the general structure of the Creas' ART system (SITAC/ART Web) and **must be checked against each Crea's current form**. [a conferir]

**A. Professional data**
- Name, professional title, Crea registration number, registration state (UF), CPF (individual taxpayer ID).
- ART type (individual, co-authorship, joint responsibility, team), form of registration (initial, substitution, complementary).
- Contracted company (when applicable): corporate name, CNPJ (company taxpayer ID), company registration number at the Crea.
- If co-authorship/team: data of the other professionals and of the linked ARTs.

**B. Client data**
- Name or corporate name, CPF/CNPJ, full address (street, number, complement, neighborhood, city, UF, CEP (postal code)), phone/e-mail, client type (individual, private legal entity, public).
- **Owner** (when different from the client): name, CPF/CNPJ.

**C. Contract data**
- Contract no. (or "verbal"), signing date, **contract value (R$)** (basis for the fee), relationship (contractual, internship, etc.), institutional action (a conferir), purpose (residential, commercial, industrial, etc.), client type.
- Start date and **expected end date**.

**D. Work/service site**
- Full address, neighborhood, city, UF, CEP.
- **Geographic coordinates** (latitude and longitude) of the site: many Creas ask for them (mandatory for works; a conferir whether in each Crea's current version).
- Site type (urban/rural), matrícula (property registry number)/registration no. (a conferir).

**E. Technical activities**
- For each line: **Group/Modality → Level of action → Activity → Work/service → Complement**, plus **Quantity** and **Unit of measure**. The system generates a hierarchical code from the works/services table and the activities table; specific codes: a conferir at the Crea.
- Complementary description (free text) with the specification (e.g., "structural design in LSF with radier").
- **Remarks** and **declarations** fields (e.g., accessibility, "execution ART with linked project").

**F. Values and payment**
- ART value (calculated), payment slip, payment date, ART no. (generated), registration date.
- Signatures: professional and client (digital, gov.br/ICP-Brasil, depending on the Crea).

### 1.4 Typical technical activities for a chalet
Suggested mapping (exact names and codes: a conferir in the table of the state's Crea). Usual units follow in parentheses.

| Service | Typical activity in the ART | Usual unit |
|---|---|---|
| Architectural design (if a Civil Engineer with attribution; the architect uses RRT) | Design > residential building | m² |
| Structural design in LSF / wood frame | Design > metal/timber structure | m² (built area) or t (steel), depending on the Crea |
| Foundation design (radier) | Design > foundation | m² (radier area) |
| Reinforced concrete design (radier) | Design > concrete structure | m² or m³ |
| Low-voltage electrical design | Design > low-voltage (BT) electrical installations | kVA or kW (installed load/demand), or m² |
| Plumbing/sanitary design (water, sewage, stormwater) | Design > plumbing/sanitary installations | m² or number of points |
| Septic tank/soakaway design | Design > on-site sewage system | un or m³ |
| Construction execution (building) | Execution > residential building | m² |
| Foundation execution | Execution > foundation | m² / m³ |
| Execution of low-voltage electrical installations | Execution > electrical installations | kVA |
| Execution of plumbing/sanitary installations | Execution > plumbing/sanitary installations | m² / un |
| Construction management/inspection | Management or Inspection > building | m² |
| Fire-protection design report/ART (if required) | Design > PPCI (fire prevention and protection plan) | m² |

Notes:
- A single contract can list several activities in one ART, each with its own quantity.
- Different professionals (structures, electrical, plumbing) issue separate ARTs, or a single co-authorship/team ART.
- **Attributions**: civil engineers have attribution for buildings; electrical engineers, for electrical work; architects use RRT for architecture (and may do structural/installations design within their attributions under RRT, per Law 12.378). Check competence via Res. 1.073/2016 and the Crea. [a conferir]

### 1.5 Fees (approximate)
- Structure: **Table A** (work/service, by contract value bracket) and **Table B** (routine, lower values by bracket). [confirmado]
- **Crea-MT 2026** (Table A): up to R$ 15.000,00: R$ 108,39; above R$ 15.000,00: R$ 285,59. https://www.crea-mt.org.br/portal/wp-content/uploads/2026/01/TABELA-DE-SERVICOS-E-ART-2026.pdf [confirmado]
- The Confea page also lists values for a following fiscal year (R$ 112,48 and R$ 296,35 for the same brackets): do not confuse them; use the value for the year of issue. https://www.confea.org.br/profissional/taxas
- Other Creas (SC, RS, MS) publish their own annual tables with small variations: https://portal.crea-sc.org.br/anuidades-servicos-multas-e-arts-tem-valores-definidos-para-2026/
- **Order of magnitude (2026, approximate)**: R$ 110 to R$ 300 per work/service ART for a chalet. Each Crea sets its own; a design + construction chalet usually requires 3 to 6 ARTs.
- **In ChaléCAD**: expose `tabelaArt` as versioned data in `packages/catalog` (by UF and year), never as a constant in the code, with a "source and date" field.

---

## 2. RRT (CAU)

RRT = Registro de Responsabilidade Técnica (the architect's equivalent of the ART); CAU = Conselho de Arquitetura e Urbanismo (the architects' council).

### 2.1 Legal basis
- **Law No. 12.378, of 12/31/2010**: regulates the practice of Architecture and Urbanism; arts. 45 to 50 cover the RRT. [confirmado]
- **CAU/BR Resolution No. 91, of 10/09/2014** (DOU 10/21/2014): governs the RRT for projects, works, and other technical services. Amendments: **Res. 166/2018** (monthly multiple RRT, art. 8, II) and **Res. 184/2019** (amends 91 and 93; effective 120 days after 12/31/2019). [confirmado] Sources:
  - https://www.normasbrasil.com.br/norma/resolucao-91-2014_276004.html
  - https://www.normasbrasil.com.br/norma/resolucao-166-2018_366532.html
  - https://www.normasbrasil.com.br/norma/resolucao-184-2019_388331.html
- **CAU/BR Res. No. 21/2012**: activities and attributions of the architect and urbanist (table of technical activities). [a conferir]
- There are recent public consultations on indicating technical responsibility on signs and on issuing certificates (CAU/BR 49 and 51). They do not change the design RRT, but check. https://www.gov.br/participamaisbrasil/consultapublicacaubr51
- Fee table: adjusted annually by CAU/BR; 2026 value **a conferir**. Order of magnitude: a few tens to slightly over R$ 100 (simple RRT). [a conferir]

### 2.2 RRT types
- **Simple RRT** (one service/work, one fee), **Late RRT** (registered after the activity started/ended, may carry a fine), **Rectifying RRT** (corrects data), **Monthly Multiple RRT** (routine works/services), **Position and Function RRT** (employment/public relationship), **Team RRT**: each architect registers their own. There is also the **Social RRT** (social-interest housing, reduced fee; requirements a conferir). [secundário/a conferir]

### 2.3 RRT fields (SICCAU)
General structure (a conferir against the current SICCAU):
- **Professional**: name, CAU registration no., UF.
- **Company** (if any): corporate name, CNPJ, company CAU registration.
- **Client**: name/corporate name, CPF/CNPJ, client type, address.
- **Owner** (if different).
- **Contract**: no. (or verbal), contract value (R$), expected start and end dates, purpose/building type, form of contracting.
- **Site**: work address, CEP, city/UF, **coordinates** (a conferir whether mandatory).
- **Technical activities** (CAU table): group > activity (e.g., "Projeto Arquitetônico" (Architectural Design), "Projeto de Interiores" (Interior Design), "Execução de obra" (Construction Execution), "Direção de obra" (Construction Management), "Projeto Complementar" (Complementary Design), etc.), **quantity** and **unit** (m² for design and works; m, un, etc.).
- **Activity type "Elaboração de Projeto Arquitetônico" (Architectural Design Development) for a single-family residential building**: quantity in **m²** of built area. [a conferir codes]
- **Remarks/declarations**: accessibility, linked ART/RRT, co-authorship.

### 2.4 Equivalent activities for a chalet (architect)
| Service | Typical RRT activity | Unit |
|---|---|---|
| Preliminary study, preliminary design, legal design, detailed design | Architectural Design (by stage or overall) | m² |
| Compatibility/coordination | Design coordination and compatibility | m² |
| Landscaping design | Landscape design | m² |
| Interior design | Interior design | m² |
| Construction management/execution | Construction management / Construction execution | m² |
| Inspection | Construction inspection | m² |
| Structure/installations design | When within attributions (Law 12.378, art. 2 and Res. 21/2012) | m² |

---

## 3. City Hall: building permit (alvará de construção), single-family home

### 3.1 What is common in Brazil
Typical documents in the process (names vary): [consolidated from practice; sources in section 3.4]
1. Request form signed by the owner (or attorney-in-fact), on the city hall's template.
2. Owner's ID and CPF; power of attorney if applicable.
3. **Updated matrícula** of the property (certificate from the Real Estate Registry Office; many city halls require validity of 30 to 90 days; Curitiba cites 90 days). [confirmed for Curitiba]
4. **IPTU statement** (property tax) / municipal registration proof / street-number certificate.
5. **Topographic/planialtimetric survey** with ART/RRT (Curitiba requires it for a construction permit; other cities require it on sloped lots or special areas). [confirmed for Curitiba]
6. **Prior consultation/guidelines/land use and occupation certificate** (zoning, applicable parameters).
7. **ART or RRT** for design and, when already required at approval, for execution (many city halls require the execution one when issuing the permit).
8. **Architectural design** (legal design, see 3.2), generally as a digitally signed PDF or as a DWG + PDF file.
9. **Memorial descritivo** (descriptive specification) / work data form (areas, materials).
10. Proof of payment of the approval/permit fee.
11. When applicable: approval by external agencies (Fire Department for larger or mixed-use buildings, health surveillance for the septic tank, environmental agency for APP/APA/waterfront areas, historic heritage, DER/ANAC/Air Force Command in special areas).
12. For **LSF/wood frame**: many city halls accept it without restriction, but some ask for a structural design declaration/ART and compliance with NBR 15575 or DATec/SiNAT (a conferir per municipality).

### 3.2 Typical sheets (pranchas) of the legal/simplified design
Practical minimum (varies by municipality):
- **Site plan (planta de situação)** (typical scale 1:500 to 1:2000): location of the lot in relation to streets and block, with north.
- **Layout/staking plan (planta de implantação/locação)** (1:100 to 1:200): building on the lot, **dimensioned front, side, and rear setbacks**, level elevations, accesses, sidewalk, trees, indication of septic tank/soakaway and well (when present), north, hatched permeable area.
- **Floor plans** of each floor (1:50 or 1:75, 1:100): rooms with name and area, dimensions, frames/openings, section markers, levels.
- **Sections** (minimum 2, one transverse and one longitudinal; passing through the stairs/wet area, when present): ceiling height, heights, level elevations, terrain profile.
- **Elevations** (all that are visible, at least front and one side): height dimensions, materials, roof.
- **Roof plan** (1:100 or 1:200): slopes, inclination in %, eaves, gutters, ridge.
- **Area schedule** (see 3.3), usually on the layout sheet itself.
- Title block (carimbo) as in section 4.4.
- Details requested by the municipality: lighting/ventilation area calculation (e.g., minimum openings relative to room area), accessibility, water tank, fence/wall, sidewalk with access ramp.

### 3.3 Area schedule (values the program must ask for)
- Lot area (m², from the matrícula and from the survey).
- Total built area and per floor; computable and non-computable area (porches, eaves, and garages may have specific rules).
- **Taxa de ocupação (TO)** (site coverage) = building projection / lot area. Compared with the zoning's maximum TO.
- **Coeficiente de aproveitamento (CA)** (floor-area ratio) = computable area / lot area. Compared with basic/maximum CA.
- **Taxa de permeabilidade (TP)** (permeability rate) = permeable area / lot area. Compared with minimum TP.
- **Minimum setbacks**: front, sides (may depend on whether the wall has an opening), rear.
- **Height limit (gabarito)** (maximum height/number of floors), boundary clearances.
- Number of parking spaces (when required).
- Note: a **mezzanine** may or may not count as a floor/area (municipal concept). The program must allow marking "computable: yes/no" per room. [a conferir per municipality]
- The maximum/minimum values come from the municipality's **master plan and land use and occupation law (zoning)**. **The program can only ask the user for these numbers** and compare; it must not embed municipal parameters.

### 3.4 Concrete examples and links
- **Curitiba (PR)**: Municipal Decree No. 799/2020 regulates the electronic processing of the building permit. Mandatory documents cited: updated matrícula (90 days) and topographic survey with paid ART/RRT/TRT; request signed by the owners. https://www.contabeis.com.br/legislacao/5955707/decreto-799-2020/ and guide: https://www.bemparana.com.br/noticia/saiba-como-tirar-um-alvara-de-construcao-reforma-ou-ampliacao-de-imovel [confirmado]. Building code: Law 11.095/2004 [a conferir]. Site: https://www.curitiba.pr.gov.br (Urbanism/Licensing section) [page a conferir].
- **Belo Horizonte (MG)**: City Hall portal (PBH), published licensing guides (architecture and permit chapters). https://prefeitura.pbh.gov.br/sites/default/files/estrutura-de-governo/obras-e-infraestrutura/pp-sd-cap8-arq-26.04.10.pdf and https://prefeitura.pbh.gov.br/sites/default/files/estrutura-de-governo/obras-e-infraestrutura/pp-sd-cap17-alv-26.04.14.pdf (old 2010/2014 documents, **a conferir whether still in force**). Building Code: Law 9.725/2009; parameters: Law 11.181/2019 (LPUOS) [a conferir].
- **Florianópolis (SC)**: documentation includes matrícula, lot feasibility consultation, and construction feasibility; see academic study https://repositorio.ifsc.edu.br/bitstreams/553d9524-67eb-44ad-8e91-865f559a4d89/download [secundário]. Master plan: LC 482/2014 [a conferir].
- **São Paulo (SP)**: digital licensing, approval and execution permits, and licensing portal. https://prefeitura.sp.gov.br/web/licenciamento (URL **a conferir**; results show PDFs of issued permits at https://prefeitura.sp.gov.br/documents/d/licenciamento/). Works and Buildings Code: Law 16.642/2017; zoning: Law 16.402/2016 [a conferir].
- **Joinville (SC)**: SAMA Normative Instructions cover licensing. https://www.joinville.sc.gov.br/wp-content/uploads/2026/02/Instrucao-Normativa-SAMA-no-02-2026.pdf [content a conferir].
- **Fortaleza (CE)**: "Alvará de Construção Fácil" (Easy Building Permit) for single-family homes (utilization index checked in the area schedule). https://urbanismoemeioambiente.fortaleza.ce.gov.br/images/urbanismo-e-meio-ambiente/apresentacoes-oficias/fortaleza_online_alvara_de_construcao_facil_residencia_unifamiliar.pdf [confirmed as existing]
- **National good-practices guide** (MDIC/Construa Brasil) for obtaining permits: https://www.gov.br/mdic/pt-br/assuntos/sdic/construa-brasil/produtos/22-09-construa-brasil-guia-orientativo-de-boas-praticas-para-obtencao-de-alvaras-de-construcao.pdf
- Mountain tourist towns (Campos do Jordão, Gramado, Monte Verde): have rules on aesthetics, facade materials, roof pitch, and preservation areas; **not researched in depth**, to be checked case by case. Many allow a "simplified project" for single-family homes up to a certain area (for example up to 70 m² or 75 m² in some municipalities; **a conferir**).

### 3.5 What varies by municipality
- Name of the process (approval, building permit, work license) and number of stages (design approval and then execution permit).
- Delivery format (paper, PDF, DWG, own platform; ICP-Brasil/gov.br digital signature).
- Limits of the "simplified project" (maximum area, residential use).
- Rules for setbacks, height limit, permeability, parking, mezzanine, eaves.
- Requirement of a septic tank/soakaway design in the approval process (where there is no sewer network).
- Scales and minimum letter size; own title block layout.
- Requirement of complementary designs at approval (normally only at execution, not at approval).

---

## 4. Representation and formatting standards

### 4.1 NBR 6492:2021 — Representation of architectural projects
- The 2021 edition exists (a 40-page document); the full text was **not read**. [existence confirmed]. Reference: https://arquivos.ufrrj.br/arquivos/2021103028882828758439fd707c0a63a/NBR_6492_2021.pdf (academic copy; use with care).
- General content (general knowledge and the 1994 edition, a conferir in the 2021 one): requirements for preparing technical documents of architectural and urban projects: **scales**, **dimensions**, **levels**, **north indication**, **hatching**, **legends**, **symbology**, **key plan**, line types, text size, indication of sections and elevations.
- Each sheet must contain: title block, drawing title and scale, north (on plans), symbol legend, key plan when the plan is split, dimensions and levels, room names and areas (floor plan), section markers, window/door schedule (when detailed/executive).
- **Typical scales** (check in the standard and in NBR 8196): site 1:500 to 1:1000; layout 1:100 to 1:200; plans 1:50 to 1:100; sections and elevations 1:50 to 1:100; details 1:1 to 1:25.
- **Levels**: finished floor elevation referenced to an RN (reference level); indication of the natural ground level and the modified ground level (cut/fill).
- **North**: indicated on site, layout, floor, and roof plans (true/magnetic north symbol, a conferir).

### 4.2 NBR 16636 — Preparation of building projects (Parts 1 to 3)
- Part 1: guidelines and terminology; Part 2: architectural design; Part 3: structural designs? **A conferir** the exact title of each part (the results only showed Part 2, 2017 ed., applicable to all building types). For Part 3 (urban designs?) not confirmed.
- **Design stages** (NBR 16636-2): data survey (LV), needs program (PN), feasibility study (EV), **preliminary study (EP)**, **preliminary design (AP) or pre-executive (PE)**, **legal design (PL)**, **basic design (PB, optional)**, **detailed design (PE)**, and construction follow-up/post-occupancy. [consolidated, a conferir exact acronyms]
- ChaléCAD must label each exported document with the **stage** (preliminary study, legal design, detailed design).

### 4.3 Formats, margins, folding, scales
- **NBR 10068** (drawing sheet: layout and dimensions; edition found 1987): A series, A0 to A4; **left margin 25 mm** in all formats; **right margin 10 mm in A0 and A1 and 7 mm in A2, A3, and A4**. [secundário] Top/bottom margins: same as right (a conferir).
- Dimensions (ISO 216): A0 841x1189 mm, A1 594x841, A2 420x594, A3 297x420, A4 210x297. [general knowledge]
- **NBR 13142** (folding of copies): fold to A4 with the title block visible in the lower right corner. [details a conferir]
- **NBR 8196** (use of scales): recommended scales 1:1, 1:2, 1:5, 1:10, 1:20, 1:50, 1:100, 1:200, 1:500, 1:1000 and multiples. May have been canceled/replaced; **a conferir**.
- Related drawing standards: NBR 8402 (characters), NBR 8403 (lines), NBR 10126 (dimensioning), NBR 12298 (hatching), NBR 10067 (views), NBR 14100 (fire prevention and fighting symbols). [validity of each a conferir]

### 4.4 Title block / stamp (fields)
NBR 10582 (presentation of the technical drawing sheet) and NBR 6492 define the position; the field list below is the practice consensus of city halls and councils. Position: **lower right corner**, along the right margin, usual width 175 mm (A0/A1) or 178 mm (a conferir). [a conferir]

**Mandatory fields (minimum for ChaléCAD):**
1. Project title / work name (e.g., "Residência unifamiliar – Chalé").
2. Sheet content (e.g., "Planta baixa – Pavimento térreo").
3. Project stage (EP, preliminary design, legal design, detailed).
4. **Owner/client**: name and CPF/CNPJ.
5. **Work address**: street, number, neighborhood, city, UF, CEP; municipal registration/lot/block/matrícula (varies).
6. **Project author**: name, title (architect/engineer), **CAU or CREA no.**, and UF.
7. **Technical person responsible for execution** (when applicable).
8. **ART/RRT no.** (design and execution).
9. **Scale(s)** (indicate "indicada" (as indicated) if multiple).
10. **Date** (issue).
11. **Sheet x/y** (sheet number and total).
12. **Revision** (letter or number, date, description, author).
13. **Drafter/designer** and **checker** (initials).
14. Signatures: owner and technical person responsible (space or digital signature).
15. Lot area and built area (sometimes in the title block; when not in the area schedule).
16. Logo or name of the firm/company, CNPJ (optional).
17. File name or document code (optional, useful for management).

**Common additional fields:** city hall process number, space reserved for the city hall approval stamp (local rule: a free area of about 10x7 cm or a specific one is usually left, **a conferir**), key plan, materials legend, note "Projeto sujeito a aprovação" (Project subject to approval).

---

## 5. Specifications and structural standards

### 5.1 Architectural memorial descritivo (descriptive specification)
Typical content (NBR 16636-2 and practice): [a conferir against the standard]
- Identification of the work, owner, author, and location (matrícula, registration).
- Description of the lot and urban data (zone, TO, CA, TP, setbacks) and area schedule.
- Architectural concept and needs program.
- Construction system: foundation (radier), structure (LSF or wood frame), external and internal closures (cement boards, OSB, drywall), thermoacoustic insulation, waterproofing.
- Roof: structure, sandwich roof panel (EPS/PUR/PIR core, thickness, sheet thickness), pitch, gutters and flashings.
- Frames/openings (material, dimensions, glazing), floors, finishes, ceilings, paint, fixtures and fittings.
- Installations: electrical summary, plumbing/sanitary, sewage treatment, reuse/rainwater (if applicable).
- Accessibility (NBR 9050:2020, when applicable), fire safety (if required), performance (NBR 15575).
- Execution care and material specifications with reference standards.

### 5.2 Structural calculation/descriptive memorial for LSF
Suggested minimum content (NBR 16970-2, NBR 14762, NBR 6120, NBR 6123, NBR 8681): [a conferir sections]
- System description (structural panels, dry/wet slabs, bracing, connections).
- Standards adopted and versions.
- Materials: steel (ASTM A653 / NBR 7008? grade, fy, fu, coating Z275 or per NBR 15253), screws, plates, OSB/cement boards.
- Profiles adopted: type (lipped channel Ue, track U, hat section), dimensions, thicknesses.
- **Actions**: permanent (self-weight, per NBR 6120), live loads (NBR 6120), wind (NBR 6123), combinations (NBR 8681) with coefficients.
- Calculation model and checks: studs (compression, combined bending and compression), floor beams, headers (bending, shear), connections, global stability, displacements (deflection limits), bracing (X straps, boards), anchorage to the radier (anchor bolts).
- Results: utilization ratios per element, deflections, support reactions on the radier.
- Framing/structure plan and **parts list** (cut and bend/profile table).
- Loads transferred to the foundation.
- **Professional's declarations**: exposure/environment class, design service life, assumptions, limitations, ART no.

### 5.3 Structural standards and what to declare/export
| Standard | Existence/status | What the professional declares/verifies | Data to export |
|---|---|---|---|
| **ABNT NBR 16970 (parts 1, 2, and 3), 2022** | Exists, published 05/2022. Part 1: Performance; Part 2: Structural design; Part 3: Interfaces between systems (walls/floors, frames, installations). Part 2 based on limit states and NBR 14762. [confirmado] Sites: https://www.normas.com.br/visualizar/abnt-nbr-nm/13381/abnt-nbr16970-2-light-steel-framing-sistemas-construtivos-estruturados-em-perfis-leves-de-aco-formados-a-frio-com-fechamentos-em-chapas-delgadas-parte-2-projeto-estrutural | Compliance with structural design, performance, and interface requirements; assumptions and checks | Parts and profiles, loads, checks, interface details (list a conferir) |
| **NBR 14762** | Design of cold-formed steel profile structures (2010 edition, check whether a later revision exists). [existence confirmed] | Strength verification (local, distortional, global buckling), connections | Forces, utilization ratios, effective properties |
| **NBR 15253** | Cold-formed steel profiles with metallic coating for lattice structural panels in buildings: general requirements (2014 edition, a conferir). [existence confirmed] | Coating class, minimum thicknesses, material | Profile and coating specification |
| **NBR 6120** | Actions for the calculation of building structures (2019 edition). [year a conferir] | Permanent and live loads adopted (e.g., residential floor live load) | Load table |
| **NBR 6123** | Wind forces on buildings (1988, with 2013 amendment). [a conferir] | Basic speed V0 (isopleths), S1, S2, S3, pressure coefficients | V0, roughness category, class, pressures; comes from the **municipality** (V0) |
| **NBR 8681** | Actions and safety in structures: combination criteria (2003). [a conferir] | Weighting coefficients and combinations | Combinations used |
| **NBR 6122** | Design and execution of foundations (2022 edition, a conferir). | Foundation type, allowable stress, settlements, geotechnical assumptions | Allowable stress, water table, soil type, reference to the soil survey |
| **NBR 6118** | Design of concrete structures (2023 edition, a conferir). | Cover, aggressiveness class, fck, radier reinforcement | fck, steel, cover, reinforcement detailing |
| **NBR 6484 / NBR 8036** | 6484: SPT soil sounding (2020, a conferir); 8036: programming of simple soil reconnaissance borings for building foundations (1983, a conferir). | Number and position of boreholes, NSPT, water table | Attached or referenced survey report; number of boreholes; depth |
| **NBR 15575 (parts 1 to 6)** | Performance of residential buildings (2021 edition, a conferir). | Declaration of compliance by part, design service life (VUP), structural, thermal, acoustic performance, watertightness, fire safety | Performance memorial/declaration, transmittances (U), thermal capacity, results |
| **NBR 7190 (2022)** | Reissued in parts. Part 1: design criteria (06/2022); other parts: test methods (classification, specimens, structural pieces, connections with mechanical fasteners, glulam/CLT). [confirmado] https://www.target.com.br/produtos/normas-tecnicas/46004/nbr7190-1-projeto-de-estruturas-de-madeira-parte-1-criterios-de-dimensionamento | Timber strength class, moisture, load duration, service class, connections | Design properties, forces, connections |

Notes:
- **Wood frame (light wood framing)** has no ABNT standard of its own identified in this research; NBR 7190:2022 is used along with SiNAT/PBQP-H guidelines (SiNAT Guideline for timber systems with thin-sheet closures) and DATec. Guideline number: **a conferir**. The research found a PBQP-H document related to steel frame (FAD 070): https://pbqp-h.mdr.gov.br/wp-content/uploads/2024/08/FAD_070_SteelFrame-final_rev2-limpa.pdf
- Deflection limits, coefficients, and other constants: all from `packages/catalog` with standard and edition reference.
- Temperature/humidity and durability of LSF (minimum galvanizing) in coastal regions: require a declaration.

---

## 6. Electrical

### 6.1 Standards and project content
- **NBR 5410** (low-voltage electrical installations): 2004 edition (corrected version 2008). A revision is under way; **a conferir** whether a new edition has been published. https://www.target.com.br/produtos/normas-tecnicas/28721/nbr5410-instalacoes-eletricas-de-baixa-tensao
- Detailed design content (NBR 5410, documentation item, and practice):
  - **Points and circuits plan**: outlets (TUG/TUE, general-purpose/specific-purpose), lighting, switches, conduits, boards, boxes, grounding (per floor).
  - **Single-line diagram** of the distribution board (QD), with breakers, RCD (DR, residual-current device), SPD (DPS, surge protection), conductor cross-sections, connection to the meter.
  - **Load schedule**: circuit, description, voltage, power (VA/W), current, phases, conductor (mm²), protection, installation method, RCD.
  - **Distribution board**: assembly details, busbars, identification.
  - **Descriptive and calculation memorial**: criteria (minimum cross-section, voltage drop, current capacity, grouping), load forecast (NBR 5410 item 9.5.2: minimum outlet points per room, minimum lighting), demand calculation, grounding (TN-S, TT scheme), protection.
  - **Materials list**.
  - Details: service entrance standard, metering box, grounding, delivery point.
- Minimum points (a conferir in the standard): minimum lighting 100 VA for a room up to 6 m² (and +60 VA for each additional 4 m²); general-purpose outlets (minimum per room by perimeter: kitchen 1 per 3.5 m of perimeter; bathroom minimum 1 next to the sink; others 1 per 5 m). Values summarized from general knowledge; **check before implementing**.
- Grounding and **mandatory RCD (DR)** in wet areas and outdoor outlets (NBR 5410). [items a conferir]

### 6.2 NBR 5444
- Graphic symbols for building electrical installations: listed as **canceled** (the catalog listing indicates a date of 11/2014) and with no direct replacement; the symbols are still widely used. Source: https://www.normas.com.br/visualizar/abnt-nbr-nm/7854/abnt-nbr5444-simbolos-graficos-para-instalacoes-eletricas-prediais [secundário]
- Current practice: keep a **legend in the project itself** (mandatory in any case), based on the traditional symbology and possibly on IEC 60617 (graphic symbols for diagrams) and drawing standards (NBR 5259, 5280: letter symbols, validity a conferir). [a conferir]
- **In ChaléCAD**: always export a legend; do not declare "conforme NBR 5444".

### 6.3 Utilities (concessionárias): service entrance standard, load, demand
- General rule (ANEEL Resolution 1.000/2021, **a conferir**): consumer units with installed load up to 75 kW are served at **secondary voltage (Group B)**. Above that, they require primary voltage and a specific electrical design.
- **Cemig**: standard **ND-5.1** (supply at secondary voltage, overhead network; Jul/2022 edition). Contains the installed load and demand calculation and the service entrance types. https://www.cemig.com.br/wp-content/uploads/2025/10/nd5_1_000001p.pdf [existence confirmed]. **ND-5.3** (above 75 kW, primary voltage) https://www.cemig.com.br/wp-content/uploads/2023/09/nd5_3_000001p.pdf. **ND-5.5** has a list of "no project" cases for consumers with demand up to 327 kVA; **does not apply directly to ND-5.1/residential** (reading a conferir). https://www.cemig.com.br/wp-content/uploads/2023/08/nd-5.5-concurso-02-23.pdf [secundário]. Project-required threshold for a home under ND-5.1: **a conferir** (consult the tables in the load/demand and entrance-type sections).
- **Copel (PR)**: NTC **901100** (supply at secondary distribution voltage; **a conferir**) and NTC **900100** (criteria for submitting service entrance projects; a conferir). Electrical project threshold: **a conferir**.
- **Enel (SP, CE, RJ, GO)**: own technical standards for service entrance and metering (e.g., technical instructions per distributor); no specific result found. **A conferir** at https://www.enel.com.br (Technical standards section).
- **CPFL**: GED standards (e.g., GED-13 for supply at secondary voltage; **number a conferir**). https://www.cpfl.com.br [a conferir].
- **Typical service entrance** by load (illustrative brackets, a conferir per distributor): single-phase (2 wires) for small loads; two-phase (3 wires); three-phase (4 wires) for larger loads, with a main breaker of 40 to 150 A or more. Classification depends on the **calculated demand** (kVA) and the number of phases; each distributor has its own table.
- With an **electric shower, heater, air conditioning, and solar power**, a 120 m² chalet is usually **three-phase**. **Photovoltaic distributed generation** requires a specific project/ART and follows the utility's standard (for example, Cemig: https://canalsolar.com.br/cemig-divulga-novos-criterios-para-analise-de-conexoes-de-gd/). [out of initial scope]
- What ChaléCAD must extract for the connection request: **installed load (kW), demand (kVA), number of phases, entrance type, main breaker, service drop cross-section, grounding type, address, design/execution ART** (when required).

---

## 7. Plumbing and sanitary

### 7.1 Project content
- **Cold water** (NBR 5626:2020): plan with service line, tank, header, risers, branches; **isometric**; sizing by flows and weights; minimum and maximum pressures; fixtures and valves; tank (volume, overflow, cleaning, lid); supply from utility/well. [a conferir the year 2020: no search confirmed it, from general knowledge]
- **Hot water** (NBR 7198 and NBR 5626, a conferir): solar/electric/gas heater, insulation, return line.
- **Sanitary sewage and venting** (NBR 8160:1999): plan, isometric, floor drains, siphoned boxes, grease trap, inspection box, **traps (desconectores)**, vent pipes, minimum slopes, diameters by UHC (Hunter contribution unit). [edition a conferir]
- **Stormwater** (NBR 10844:1989): roof plan, gutters, vertical and horizontal leaders; sizing by rainfall intensity (return period and duration; **local data: a conferir**) and contribution area. [a conferir]
- Rainwater harvesting/use: NBR 15527 (a conferir).
- **Water tank details**: volume (daily consumption x days), height/position, piping, overflow, vent, lid and screen, base/support (including weight on the LSF).
- **Calculation memorial**: consumption, flows, diameters, head losses, UHC, slopes, tank volume, pump (if any), stormwater.
- Materials list and quantity takeoff.

### 7.2 NBR 17076:2024 (on-site sewage treatment) — replaces NBR 7229 and NBR 13969
- **Confirmation**: NBR 17076:2024 replaced NBR 7229:1993 and NBR 13969:1997. [secundário: IFSC thesis] https://repositorio.ifsc.edu.br/items/fb4b10c8-675d-4f4b-a0a3-b727aba16f49 ; UDESC (also points to the replacement/cancellation of 7229): https://udesc.br/arquivos/udesc/id_cpmenu/19312/ANLISE_1_17273813706282_19312.pdf
- **What changes** (secondary, check in the standard's text):
  - More restrictive **setback distances** and **mandatory alternating use** of the final disposal units (two alternating units).
  - **Does not cover multi-chamber septic tanks** (the old NBR 7229 did); defines only one type of **upflow anaerobic filter**.
  - One article advocates sizing the tank with NBR 8160 criteria instead of the preset values of 17076 (opinion, not a rule).
- **Old formula (NBR 7229:1993, legacy, for comparison only)**: V = 1000 + N(C·T + K·Lf), with N = number of contributors, C = wastewater contribution (L/person·day), T = detention time, K = sludge accumulation rate, Lf = fresh sludge contribution. NBR 17076 formula and tables: **a conferir** (not confirmed in this research; **do not** use the old formula as "conforme NBR 17076").
- **Minimum distances**:
  - Old NBR 7229: 1.50 m from buildings, lot boundaries, soakaways, trenches, and water service line. [secundário]
  - NBR 17076 (news report): **15 m between well and septic tank**, extendable by a risk report. https://olhardigital.com.br/curiosidades/?p=30210 [secondary/journalism; **a conferir in the text**]. Distances of the new standard to boundary/buildings: **a conferir**.
- **Percolation/infiltration test**: in a pit; parameters (depth, saturation, infiltration time per 1 cm) and relation to application rate/infiltration area: **a conferir** in NBR 17076. [NBR 7229 had a rate x percolation time table]
- **Final disposal**: soakaway, infiltration trench, filtration trench, infiltration/irrigation trenches; requires the water table at a minimum depth (a conferir, normally 1.5 to 2 m from the bottom) and soil with adequate infiltration capacity.
- **What health surveillance/city hall asks for** (varies): septic tank/filter/soakaway design and memorial, percolation report, location on the layout (with distances to well, boundaries, buildings, watercourses), ART/RRT, declaration of absence of a public network (certificate from the sanitation utility), and possibly a license from the environmental agency. [a conferir per municipality]
- Complementary references: CAESB (septic tank-soakaway guide) https://www.caesb.df.gov.br//images/arquivos_pdf/Fossa-sumidouro.pdf.

---

## 8. Normative validation checklist for ChaléCAD

### 8.1 Verification table (auto = automatically verifiable)

| # | Item | Standard/section | Verifiable criterion (auto?) | Input data to request |
|---|---|---|---|---|
| 1 | Site coverage (TO) | Municipal master plan/zoning | Building projection / lot area ≤ max TO (yes) | Lot area, max TO |
| 2 | Floor-area ratio (CA) | Municipal zoning | Computable area / lot ≤ CA (yes) | CA, computability rule (mezzanine, porch, eave) |
| 3 | Permeability rate (TP) | Municipal zoning | Permeable area / lot ≥ min TP (yes) | Min TP; permeable materials |
| 4 | Front/side/rear setbacks | Zoning/building code | Min distances from building to boundaries (yes, geometry) | Lot dimensions (polygon), min setbacks, opening rule |
| 5 | Height limit/maximum height | Zoning | Building height ≤ max (yes) | Max height, number of floors |
| 6 | Minimum ceiling height | Municipal building code | Ceiling height ≥ min per room type (yes) | Municipal values (e.g., 2.40 m for habitable rooms; a conferir) |
| 7 | Natural lighting and ventilation | Building code; NBR 15575 | Opening area / floor area ≥ fraction (yes) | Min fractions (e.g., 1/6 or 1/8; a conferir) |
| 8 | Minimum room areas | Building code | Area ≥ min (yes) | Municipal values |
| 9 | Accessibility (when applicable) | NBR 9050:2020 | Minimum door width (0.80 m), circulation, ramps ≤ 8.33% (yes/partial) | Whether required; public/private |
| 10 | Consistency of area schedules | NBR 6492 | Sum of areas = total (yes) | None |
| 11 | Sheet scale and format | NBR 10068, 6492 | Sheet fits within the format with margins (yes) | Preferred format |
| 12 | Title block fields filled in | NBR 10582, 6492 | All mandatory fields non-empty (yes) | Data from section 4.4 |
| 13 | Permanent and live loads | NBR 6120 | Values used are present in the versioned catalog (yes) | Building use |
| 14 | Wind | NBR 6123 | V0, S1, S2, S3 defined (yes, pressure calculation) | V0 (municipality/isopleth), topography, roughness, dimensions |
| 15 | Action combinations | NBR 8681 | ULS and SLS combinations generated (yes) | None |
| 16 | LSF profile checks (studs, beams, headers) | NBR 14762; NBR 16970-2 | Utilization ratio ≤ 1.0 (yes, preliminary sizing) | Steel (fy), thickness, profiles |
| 17 | Deflections | NBR 14762/16970-2; limits in catalog | Deflection ≤ L/limit (yes; limits a conferir) | Adopted limit |
| 18 | Steel coating | NBR 15253 | Coating class ≥ min (yes; values a conferir) | Aggressiveness/location (coast) |
| 19 | Interfaces (wall-floor, frames, installations) | NBR 16970-3 | Presence of details (partial; checklist) | Detail options |
| 20 | Thermal/acoustic performance | NBR 15575 | U, thermal capacity, values in the catalog (partial) | Bioclimatic zone (NBR 15220, a conferir), closures |
| 21 | Foundation structural safety | NBR 6122, 6118 | Soil stress ≤ σ_adm (yes); settlement (partial) | **Soil survey/allowable soil stress**, water table, soil type |
| 22 | Radier: minimum thickness/reinforcement | NBR 6118 | Preliminary check (partial) | fck, steel, cover, aggressiveness class |
| 23 | Soil survey present and adequate | NBR 6484, 8036 | Number of boreholes ≥ min per area (partial); report attached (yes/no) | Soil survey report |
| 24 | Electrical: minimum points | NBR 5410 (9.5.2; a conferir) | Lighting points and outlets per room ≥ min (yes) | Point plans |
| 25 | Electrical: cross-section/protection/voltage drop | NBR 5410 | Ib ≤ In ≤ Iz; ΔV ≤ limit (yes) | Lengths, installation method |
| 26 | Electrical: RCD, SPD, grounding | NBR 5410 | Present on required circuits (yes) | Grounding scheme (TN/TT) |
| 27 | Installed load, demand, and service entrance | Utility standard | Calculated demand, entrance type (partial) | **Utility (concessionária)**, voltage, number of phases |
| 28 | Cold water: diameters, pressures, tank | NBR 5626:2020 | Pressures within ranges (yes) | Water source, network pressure, number of residents |
| 29 | Sewage: slopes, traps, venting | NBR 8160 | Min slope, diameters by UHC (yes) | Fixtures, public network or septic tank |
| 30 | Stormwater: gutters and leaders | NBR 10844 | Flow ≤ capacity (yes) | Local rainfall intensity (municipality) |
| 31 | Septic tank/filter/soakaway: sizing | NBR 17076:2024 | Useful volume ≥ min (yes, after confirming formula) | Number of contributors, occupancy type, **percolation rate/test** |
| 32 | Distances to well, boundary, building | NBR 17076:2024 | Distances ≥ min (yes, values a conferir) | Position of well/septic tank/soakaway, boundaries |
| 33 | Water table level | NBR 17076:2024 | Distance soakaway bottom to water table ≥ min (yes) | Water table depth |
| 34 | ART/RRT provided | Law 6.496 / Law 12.378 | Number filled in (yes) | ART/RRT no. per discipline |
| 35 | Notice that it does not replace a project with ART | Internal (`DISCLAIMER`) | Present in every document (yes) | None |

### 8.2 Input data to collect from the user (grouped)
- **Lot**: polygon/dimensions, area, orientation (north), topography/levels, matrícula, registration, address, coordinates, city/UF.
- **Municipal urban parameters**: zone, max TO, CA, min TP, setbacks (front, side, rear, and opening rule), height limit, minimum ceiling height, parking, mezzanine/eave rule, source (law, article, date).
- **Soil and foundation**: soil survey (type, number of boreholes, NSPT, depth, water table), allowable stress, aggressiveness class, percolation rate.
- **Environment**: V0 and roughness category, local rainfall intensity, bioclimatic zone.
- **Electrical**: utility, voltage and phases, connection type (single-phase, two-phase, three-phase), special loads (shower, air conditioning, electric stove, vehicle charger, photovoltaic).
- **Plumbing/sanitary**: public water/sewer network or well/septic tank, available pressure, number of residents, tank.
- **Responsible parties**: owner, authors (architecture, structure, electrical, plumbing), CAU/CREA registration, ART/RRT no., contractor.

### 8.3 Documents ChaléCAD must export

**Sheets (vector PDF and DXF/DWG when feasible; A1/A2/A3 format by choice; full title block; north, graphic scale, and legend):**
1. Cover/sheet index, with revision list.
2. Site plan.
3. Layout/staking plan with setbacks, levels, septic tank/soakaway/well, and permeable area.
4. Area schedule and urban parameters schedule (project values x municipal limits).
5. Floor plans (ground floor, mezzanine/upper floor) with areas, dimensions, and levels.
6. Sections (minimum 2) with ceiling height and levels.
7. Elevations (all).
8. Roof plan (slopes, gutters, sandwich roof panel).
9. Window/door schedule.
10. Foundation plan (radier) with dimensions and reinforcement (and details).
11. LSF structure plan per panel (wall elevations, floor beams, trusses/purlins, bracing, connections) with profile list.
12. Electrical plan (points and circuits), single-line diagram, load schedule, service entrance detail.
13. Plumbing/sanitary plans: cold/hot water, sewage, venting, stormwater, isometrics, water tank detail.
14. Septic tank, filter, and soakaway (or trench) detail, with distances.
15. Symbol legend (including electrical, without citing NBR 5444 as in force).

**Memorials and reports (PDF, with `DISCLAIMER`):**
16. Architectural memorial descritivo (descriptive specification).
17. Structural descriptive and calculation memorial (LSF/wood frame and radier), with assumptions, standards (edition), loads, combinations, results, and statement of limitations.
18. Electrical memorial (installed load, demand, service entrance, circuit calculation) and materials list.
19. Plumbing/sanitary memorial and septic tank/soakaway sizing.
20. Performance statement/memorial (NBR 15575) with the available data (to be completed by the responsible party).
21. Quantity takeoff, parts list (cut), weight, and budget (reports already derived by the engine).
22. **Normative checklist** report (items in 8.1 with approved/failed/pending and the input used).

**Fill-in forms (they do not replace the official system; they serve to copy the data):**
23. **ART form (Crea)**: data of the professional, client, owner, address and coordinates, contract value, dates, purpose, technical activities with **quantity and unit** (m² of design, m² of built area, kVA of installed load, m² of radier, etc.), remarks, and linked documents. ChaléCAD generates the suggested values; **issuance is done in the Crea's system**.
24. **RRT form (CAU)**: same, with activities from the CAU table.
25. **Building permit request form** (common fields): owner data, matrícula, registration, areas, TO/CA/TP, number of floors, responsible parties, ARTs/RRTs.
26. **Utility connection form**: installed load, demand, number of phases, entrance type, main breaker.
27. **Form for health surveillance/city hall (septic tank)**: number of contributors, tank volume, infiltration area, percolation test result, distances.
28. **Data entry record**: list of the data entered by the user and its source (soil survey, municipal law, etc.), with date.

### 8.4 Architecture recommendations for the code
- Each rule must declare `fonte` (standard, edition, section, verification date), `status` (confirmed/a conferir), and `severidade` (severity).
- Values marked a conferir must not produce "approved"; they must come out as "pendente de conferência profissional" (pending professional verification).
- Urban parameters always enter as user data, never in `catalog`.
- All reports show `DISCLAIMER`: does not replace a structural project with ART/RRT.

---

## 9. Gaps and next steps (a conferir)
1. Official text of Annex I of Confea Res. 1.137/2023 and of the Dec/2025 update (exact fields and activity codes; models A, B, D).
2. Number of the resolution that updated 1.137 and its effective date.
3. 2026 RRT fee and official list of activities in SICCAU.
4. Text of NBR 17076:2024: volume formulas, infiltration rates, distances, alternation, percolation test.
5. Text of NBR 6492:2021, NBR 10582, and NBR 8196 (validity), NBR 16636 (titles of parts 1 to 3).
6. Threshold for mandatory electrical project and service entrance table at Cemig (ND-5.1), Copel (NTC), Enel, and CPFL.
7. SiNAT/DATec guideline for wood frame and for LSF (numbers and validity).
8. Current checklist of city halls (SP, Curitiba, BH, Florianópolis) and septic tank requirement.
9. Check whether there is a new edition of NBR 5410 and NBR 6123 (revision under way, a conferir).

## Main sources
- Confea, fees: https://www.confea.org.br/profissional/taxas
- Confea, 1.137 update: https://www.confea.org.br/confea-atualiza-regras-de-art-e-acervo-tecnico-e-moderniza-o-sistema
- Confea, reformulation working group: https://www.confea.org.br/node/230892
- Resolution 1.137/2023 (news): https://www.coad.com.br/home/noticias-detalhe/118517/confea-fixa-procedimentos-sobre-art-anotacao-de-responsabilidade-tecnica
- Crea-MT, 2026 table: https://www.crea-mt.org.br/portal/wp-content/uploads/2026/01/TABELA-DE-SERVICOS-E-ART-2026.pdf
- Crea-SC, 2026 values: https://portal.crea-sc.org.br/anuidades-servicos-multas-e-arts-tem-valores-definidos-para-2026/
- CAU/BR Res. 91/2014: https://www.normasbrasil.com.br/norma/resolucao-91-2014_276004.html
- CAU/BR Res. 166/2018 and 184/2019: https://www.normasbrasil.com.br/norma/resolucao-166-2018_366532.html, https://www.normasbrasil.com.br/norma/resolucao-184-2019_388331.html
- NBR 16970-1/2/3: https://www.normas.com.br/visualizar/abnt-nbr-nm/13380/abnt-nbr16970-1-light-steel-framing-sistemas-construtivos-estruturados-em-perfis-leves-de-aco-formados-a-frio-com-fechamentos-em-chapas-delgadas-parte-1-desempenho
- NBR 15253: https://www.normas.com.br/visualizar/abnt-nbr-nm/24619/abnt-nbr15253-perfis-de-aco-formados-a-frio-com-revestimento-metalico-para-paineis-estruturais-reticulados-em-edificacoes-requisitos-gerais
- NBR 7190-1:2022: https://www.target.com.br/produtos/normas-tecnicas/46004/nbr7190-1-projeto-de-estruturas-de-madeira-parte-1-criterios-de-dimensionamento
- NBR 5444 (catalog): https://www.normas.com.br/visualizar/abnt-nbr-nm/7854/abnt-nbr5444-simbolos-graficos-para-instalacoes-eletricas-prediais
- NBR 17076:2024 (IFSC): https://repositorio.ifsc.edu.br/items/fb4b10c8-675d-4f4b-a0a3-b727aba16f49
- NBR 17076:2024 (UDESC): https://udesc.br/arquivos/udesc/id_cpmenu/19312/ANLISE_1_17273813706282_19312.pdf
- NBR 10068 (academic copy): https://docente.ifsc.edu.br/gianpaulo.medeiros/MaterialDidatico/Desenho%20Mecatr%c3%b4nica%20/aula%202/NBR%2010068-Folha%20de%20desenho%20-%20Leiaute%20e%20dimensoes.pdf
- Cemig ND-5.1: https://www.cemig.com.br/wp-content/uploads/2025/10/nd5_1_000001p.pdf
- Curitiba, Decree 799/2020: https://www.contabeis.com.br/legislacao/5955707/decreto-799-2020/
- MDIC, permit guide: https://www.gov.br/mdic/pt-br/assuntos/sdic/construa-brasil/produtos/22-09-construa-brasil-guia-orientativo-de-boas-praticas-para-obtencao-de-alvaras-de-construcao.pdf
