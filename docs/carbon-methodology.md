# Carbon accounting method for the CAFI Metrics Hub — method 2.0

Status: Phases 1 and 2 implemented (`pipeline/carbon/`, `config/carbon/`). This document is the reference for the engine; the factor library on the Climate impact page is generated from `config/carbon/factors.yml`, so values there are authoritative. Section 8 gives the results of the current build.

## 1. Purpose and quality bar

The Hub turns activity indicators (hectares, stoves, protected forest) into greenhouse-gas results that must survive three audiences: CAFI's own results reporting, host-country national accounting (FREL, NDC, Article 6), and private partners' corporate inventories and insetting claims. One estimate cannot serve all three, because they use different accounting logics. The method therefore keeps two ledgers (section 2) fed by one quantification engine (section 4), and records who may claim what (section 2.3).

The quality bar is the one the market and regulators now apply:

- **Factors and science:** IPCC 2006 Guidelines and 2019 Refinement (Vol. 4 AFOLU; Vol. 2 energy), AR6 GWP100 values, national data where they exist (DRC FREL 2018 and later technical annexes; Republic of Congo, Gabon and Cameroon FRELs; CDM TOOL33 national fNRB).
- **Inventory lens:** GHG Protocol Land Sector and Removals Standard v1.1 (2025/26) and Guidance v1.0: stock-change accounting within defined boundaries, removals and emissions reported separately, no netting, traceability, reversal monitoring, pools disclosed.
- **Intervention lens:** ISO 14064-2 structure (baseline scenario, project scenario, leakage, monitoring) with the methodologies the Integrity Council for the Voluntary Carbon Market has approved as meeting the Core Carbon Principles: Verra VM0047 v1.1 for afforestation, reforestation and revegetation (ARR); Verra VM0048 with VMD0055 jurisdictional allocated baselines, Verra JNR and ART TREES v2 for avoided deforestation; Gold Standard Metered & Measured Energy Cooking Devices, Gold Standard TPDDTEC v4 and Verra VM0050 for cooking. The CDM small-scale cookstove method AMS-II.G, on which the current coefficients rest, was rejected by the ICVCM in March 2025 and is not used as a reference.
- **Principles:** transparency (every number traceable to a factor with a source and a version), accuracy (Tier 1 only where nothing better exists, with a documented path to Tier 2 and 3), conservativeness (defaults at the conservative end; uncertainty deductions when confidence intervals are wide), completeness (project emissions and leakage counted, not only benefits), consistency (same engine, same vintages, same strata across programmes), no double counting (claims register).

## 2. Two ledgers and a claims register

### 2.1 Inventory ledger (attributional)

What the LSR Standard asks of a company, applied to CAFI's portfolio. For each land cohort inside a defined boundary, the ledger reports, per year:

- gross CO2 removals = increase in carbon stocks in the monitored pools (above-ground biomass, below-ground biomass; dead wood and litter when measured; soil organic carbon only with soil sampling or a validated Tier 3 model);
- gross emissions = carbon stock losses (harvest, fire, mortality, reversals) and non-CO2 emissions from project activities (biomass burning, fertiliser N2O, charcoal kilns);
- net stock change, shown but never used to net removals against emissions in the headline.

No counterfactual enters this ledger. Avoided deforestation, avoided fuelwood use and "what would have happened otherwise" are not inventory quantities; the Standard treats them as contribution claims reported separately. This ledger is what a company sourcing from a CAFI-supported landscape can take into its Scope 3 FLAG inventory when the hectares are inside its sourcing boundary and traceable.

### 2.2 Intervention ledger (consequential)

What a results-based payment, a credit or an NDC contribution needs. For each cohort, per vintage year:

    net GHG benefit = (baseline emissions − project emissions) + (project removals − baseline removals) − leakage − non-permanence buffer

computed ex ante (expected, from defaults) and ex post (from monitoring data as it arrives), with a confidence interval. This ledger contains everything in the inventory ledger plus avoided deforestation and degradation, displaced non-renewable fuelwood, and a counterfactual baseline for removals (land that would not have regrown).

### 2.3 Claims register

Each cohort carries a claim status: CAFI contribution only; counted in a host-country FREL/ERPA programme (for example the Mai-Ndombe FCPF emission-reductions programme area in DRC); claimed in a company inventory (Scope 3 FLAG); issued as an inset unit or a credit (registry and serial range); transferred under Article 6 with corresponding adjustment. The dashboard shows the status next to the result so that the same tonne is never presented twice as additional to someone's balance. The register starts empty and is filled from `config/carbon/claims.yml`; the project classification already identifies private-sector and PES projects where overlap is most likely.

## 3. Architecture

    ┌──────────────────────────────────────────────────────────────────────────┐
    │ 1 Activity data        ProjectData.xlsx cohorts · MPTF projects ·        │
    │                        surveys (ENR-02/03) · remote sensing (CLM-02,     │
    │                        alerts, biomass maps) · polygons (SPATIAL tags)   │
    ├──────────────────────────────────────────────────────────────────────────┤
    │ 2 Stratification       country → FAO ecological zone → forest stratum    │
    │                        (FREL classes) → soil class → system type         │
    ├──────────────────────────────────────────────────────────────────────────┤
    │ 3 Factor library       versioned parameters: value, distribution, tier,  │
    │                        applicability, source, valid-from                 │
    ├──────────────────────────────────────────────────────────────────────────┤
    │ 4 Quantification       modules per archetype: ARR · REDD · ALM ·         │
    │   engine               cooking · fuelwood supply; cohort × year          │
    ├──────────────────────────────────────────────────────────────────────────┤
    │ 5 Uncertainty          Monte Carlo over the library distributions;       │
    │                        p5 / mean / p95; conservativeness deduction       │
    ├──────────────────────────────────────────────────────────────────────────┤
    │ 6 Ledgers              inventory · intervention (ex ante / ex post) ·    │
    │                        claims register                                   │
    ├──────────────────────────────────────────────────────────────────────────┤
    │ 7 Reporting & QA       Climate page (two views, bands, vintages) ·       │
    │                        Methodology page generated from the library ·     │
    │                        Data-quality checks · git audit trail             │
    └──────────────────────────────────────────────────────────────────────────┘

**Cohorts.** The unit of accounting is the cohort: programme × MPTF project × indicator × country × stratum × vintage year × quantity. Cohorts are derived from the year-on-year increase of each cumulative indicator row; carry-forward years create no cohort; decreases are logged as potential reversals for the data-quality page. Every result is a sum over cohorts, so a hectare planted in 2019 and one planted in 2024 are never treated alike.

**Stratification.** Each programme is assigned a default stratum from its country and province (FAO Global Ecological Zone: tropical rainforest for the central basin and coastal Gabon/Congo; tropical moist deciduous for the savanna-forest mosaics of Kwilu, Mai-Ndombe south, Kwango, Bateke, Kasaï; tropical shrubland where applicable), a forest stratum from the national FREL classes, and an IPCC soil class (low-activity clay for most of the basin; sandy for the Bateke plateau). Programme-level overrides live in `config/carbon/strata.yml`. The system type (rotational woodlot, shaded perennial, alley cropping, assisted natural regeneration, protected forest, improved stove, LPG) comes from the indicator, its sub-indicator label, and the project activities in the reference workbook.

**Factor library.** One record per parameter: id, value, unit, distribution (normal, lognormal or triangular with its parameters), tier (1 default, 2 national, 3 measured), applicability (stratum, system type, country), source with table number, version and valid-from date. Factors are never edited in place; a new version is added and the old one kept, so any past result can be reproduced.

**Engine.** Pure functions `cohort → yearly series` per module, vectorised with NumPy so Monte Carlo is cheap. Deterministic seed for reproducible builds. Output per cohort-year: stock by pool, removals, emissions, baseline, leakage, buffer, net, and the percentile bands.

**Reporting.** `metrics.json` keeps today's structure; a new `carbon.json` carries the two ledgers per record-year with p5/mean/p95, the factor library, the strata and the claims register. The Climate page gains a ledger toggle (Inventory | Intervention), an ex-ante/ex-post toggle, uncertainty bands on every figure, a breakdown by archetype and pool, and the factor table with provenance. The Methodology page is generated from the library so text and numbers cannot drift apart.

## 4. Quantification modules

Conventions: carbon fraction CF = 0.47 (IPCC 2006 Table 4.3); CO2/C = 44/12; GWP100 from AR6: CH4 (biogenic) 27.0, N2O 273. Growth is counted from the year after establishment. Biomass stocks in tonnes of carbon per hectare; results in tCO2e.

### 4.1 ARR — afforestation, reforestation, revegetation and assisted natural regeneration

Reference: VM0047 v1.1 (CCP-approved), CDM AR-ACM0003, IPCC 2019 Ch. 4 and Ch. 5. Covers FOR-01 (natural regeneration), FOR-02 (plantations), AGR-02 (deforestation-free perennial crops), AGR-03 (agroforestry).

**Project stock trajectory per cohort.** Linear growth to a cap, Tier 1 (a Chapman-Richards curve replaces it when Tier 3 plot data exist):

    C(a) = min(G · a, Cmax)        G = growth (tC/ha/yr, AGB + BGB), a = age in years

- Permanent systems (natural regeneration, perennial crops, conservation plantings): Cmax = G × maturity (IPCC Table 5.1: 20 years for perennial systems) or the mature stock of the target forest class from the national FREL, whichever is lower.
- Harvested systems (wood-energy plantations, acacia-cassava agroforestry): the credited stock is the **long-term average** over the rotation, as required by the VCS AFOLU rules for projects with harvesting: Cmax = G × rotation / 2. Harvested carbon is not credited as storage; its fate is handled by the fuelwood module (4.5).

**Baseline.** VM0047's area-based approach sets the baseline from a dynamic performance benchmark: stock change on matched control areas measured by remote sensing. Ex ante, before control data exist, the baseline is the Tier 1 regrowth of the pre-project land use: zero for savanna under recurrent fire and for degraded land kept in cultivation (conservative), and the IPCC fallow regrowth where the pre-project use was a fallow cycle. Ex post, the benchmark is computed from the same biomass-map time series used for CLM-02 on buffer areas around each programme, which replaces the default.

**Pools.** AGB and BGB (root-to-shoot ratio by zone, IPCC 2019 Table 4.4). Dead wood and litter omitted (conservative) unless measured. Soil organic carbon is excluded from the inventory ledger unless sampled; in the intervention ledger it is reported as a separate indicative line with the IPCC Tier 1 stock-change method, never added to the headline.

**Project emissions.** Site preparation by burning (IPCC Vol. 4 Eq. 2.27 with savanna fuel loads) where reported; nursery and transport fuel treated as de minimis (< 1 %) and disclosed.

**Leakage.** Activity-shifting leakage is zero when the land was degraded or unused; when agroforestry displaces food production, the VM0047 leakage assessment applies (default deduction 10 % until the programme documents that yields were maintained).

**Non-permanence.** VCS AFOLU Non-Permanence Risk Tool v4.2 logic: a risk score from internal, external and natural risks sets the buffer (minimum 10 %). Ex-ante defaults: 20 % for planted systems, 25 % for fire-exclusion regeneration on savanna. Reversals detected by alerts or by a decrease in reported area reduce the cohort's stock in the year observed.

**Survival.** FOR-02 and AGR-02/03 report surviving area at the reporting date, so mortality is already in the activity data; the data-quality page flags cohorts whose area declines.

### 4.2 REDD — avoided unplanned deforestation and degradation

Reference: VM0048 v1.0 with VMD0055 (jurisdictional activity data allocated by a deforestation-risk map), consistent with ART TREES v2 and the FCPF Methodological Framework for nesting. Covers FOR-04 (forest under conservation); FOR-03 (sustainable forest management) joins later as improved forest management once logging-intensity data exist (VM0035/VM0045 logic).

**Baseline.** The jurisdictional reference level is the national FREL (for DRC: 2018 submission and subsequent technical annexes; for Congo, Gabon and Cameroon: their UNFCCC FRELs). The jurisdictional annual deforestation is allocated to the project area in proportion to deforestation risk (distance to roads, settlements, recent clearing), so a remote protected block gets a lower baseline than a forest at the agricultural frontier. Ex ante, before the risk map is run, the allocation uses the province-level FREL activity data divided by province forest area.

**Emission factor.** Per forest stratum from the national FREL (DRC Table 7-3: dense humid terra firme 203.6 tC/ha total biomass, secondary forest 111.5, dry/open forest 66.8; post-conversion cropland mosaic 15.5), net of the post-conversion stock, converted with 44/12. Soil and dead-wood emissions after deforestation added when the FREL includes them.

**Effectiveness (ex post).** Avoided deforestation = (allocated baseline rate − observed rate in the project area) × area × EF. The observed rate is CLM-02, computed by the Secretariat from remote sensing. Ex ante, before CLM-02 exists, effectiveness defaults to 41 % of the baseline (global matched estimate of protected-area effect, Wolf et al. 2021).

**Leakage.** Activity-shifting leakage per VM0048: default 20 % deduction, replaced by the leakage-belt monitoring result when available. Market leakage not applicable to subsistence-driven deforestation.

**Non-permanence.** Buffer from the risk tool; ex-ante default 20 %.

**Nesting and claims.** Where the programme area overlaps a national ER programme (Mai-Ndombe ERPA), the cohort's claim status records that the reductions are already accounted in that programme; the Hub shows CAFI's contribution without adding it to a second balance.

### 4.3 ALM — agricultural land management

Reference: VM0042 v2.1, IPCC 2019 Ch. 5. Covers AGR-01 (improved food-crop varieties).

Soil organic carbon change = SOCref × (F_LU × F_MG × F_I after − before) / 20 years, with IPCC 2019 Table 2.3 reference stocks and Table 5.5 factors, applied only for the 20-year transition and only to hectares that stay under the practice. Reported as indicative Tier 1 in the intervention ledger; enters the inventory ledger only with soil sampling or a validated model. Nitrous oxide from any fertiliser introduced is counted as a project emission (IPCC Tier 1, EF1 = 1 %). No avoided deforestation is attributed to intensification: neither VM0042 nor the LSR Standard allows it without a measured land-use counterfactual, which is what CLM-02 provides under the REDD module at landscape level.

### 4.4 Cooking — improved and clean cooking devices

Reference: Gold Standard Metered & Measured Energy Cooking Devices v1.2 for metered fuels (LPG, electric, pellets), Gold Standard TPDDTEC v4 and Verra VM0050 for distributed biomass stoves, all CCP-approved in March 2025 with conditions on fNRB, baseline fuel use and usage monitoring. Covers ENR-01 with ENR-02 (adoption) and ENR-03 (fuel savings) as monitoring parameters.

Per device and year:

    ER = B_baseline × S × U × [ fNRB × EF_CO2 + EF_nonCO2 ] × (1 − L)

- B_baseline: baseline woody biomass per household (t/yr, wood equivalent). Default until a kitchen performance test exists: 0.5 t/person/yr (CDM TOOL33) × 5.3 persons (DRC DHS). Charcoal users: charcoal mass × 4.0 wood-to-charcoal (TOOL33), plus kiln methane (0.030 tCH4/t charcoal) in both scenarios.
- S: fuel saving, from ENR-03 per programme; default 35 % until reported (TPDDTEC requires test-based values for CCP projects, so the default is flagged).
- U: usage, from ENR-02; default 75 % until reported, with drop-off of 10 points per year after year 2 (Gold Standard usage-survey experience).
- fNRB: national default from CDM TOOL33 v03.1 (2025, MoFuSS-based): DRC 0.42, CAR 0.42, Cameroon 0.38, Equatorial Guinea 0.31, Gabon 0.18, Republic of Congo 0.16; sub-national MoFuSS values when the programme's supply shed is known.
- EF_CO2 = 112 tCO2/TJ × 0.0156 TJ/t = 1.75 tCO2 per t wood (IPCC 2006 Vol. 2 Table 2.5), applied to the non-renewable share only.
- EF_nonCO2 = (300 kg CH4 × 27.0 + 4 kg N2O × 273) per TJ × 0.0156 = 0.14 tCO2e per t wood, applied to all wood saved.
- L: leakage 5 % (continued use of old stoves and diversion of saved wood).
- Device life: 5 years for improved biomass stoves, 10 for LPG/electric, unless monitoring shows otherwise. Project emissions from LPG (63.1 tCO2/TJ) and from electricity (grid factor) are subtracted for clean-fuel solutions.

No ex-ante figure is shown as "committed" beyond the device life. Inventory ledger: none (avoided emissions are not inventory quantities); companies distributing stoves may report the project emissions only.

### 4.5 Fuelwood supply — plantations and agroforestry wood displacing non-renewable biomass

Reference: logic of CDM AMS-I.E and Gold Standard renewable-biomass supply requirements, applied ex post only. When a wood-energy plantation or agroforestry cohort is harvested and the wood or charcoal is sold into a market supplied by non-renewable biomass, displaced emissions = harvested dry mass × share used as fuel × fNRB × 1.72 tCO2 per t dry matter × (1 − leakage 5 %). This needs harvest and sales records; until then it is shown as a potential, not added to any ledger total. Standing-stock removals (4.1) and displacement are additive because one is the average stock on the land and the other is the fate of the harvested flow; harvested carbon is never counted as storage.

## 5. Cross-cutting rules

- **Vintages and ex ante / ex post.** Every cohort-year result is tagged ex ante (defaults) or ex post (monitoring data applied). The dashboard defaults to the ex-post series where it exists and labels the rest.
- **Uncertainty.** Each library parameter has a distribution from its source (IPCC ±% at 95 %, SD from Table 4.9, TOOL33 SD). Fractions (fNRB, usage, savings, effectiveness) use a beta distribution with that mean and SD, so they stay in (0, 1) and keep their mean; other parameters use normal or triangular distributions. The engine draws 2,000 independent samples per parameter for each indicator × stratum, seeded per key so results do not depend on row order, propagates them through the module's per-unit value, and publishes the 5th and 95th percentiles as ratios to the central value; the record series are multiplied by those ratios. No conservativeness deduction is applied: the central value is shown with its band.
- **Reversals.** Decreases in reported area, fire alerts or forest-loss alerts inside a cohort reduce its stock in that year; the buffer absorbs the loss in the intervention ledger; the inventory ledger reports it as an emission.
- **Double counting.** Claims register (2.3); overlapping cohorts (same hectare reported under two indicators, for example LUT-02 and FOR-04) are flagged by the data-quality checks and counted once in carbon.
- **Transparency.** Factor library versions, strata and claims are in git; each published result carries the method version (`carbon.method = 2.0`) and the data timestamp; the Methodology page is generated from the library.
- **Tier escalation.** Rules in `archetypes.yml` say which monitored indicator replaces which default: ENR-02 → U, ENR-03 → S, CLM-02 → effectiveness, biomass-map benchmark → ARR baseline, survival threshold → mortality, soil sampling → SOC into inventory. The engine applies the best available tier per cohort and records which tier produced each number.

## 6. Parameter library, version 2.0

Generated from `config/carbon/factors.yml`, which is authoritative; the Climate impact page shows the same table.

| Id | Value | Distribution | Tier | Source |
|---|---|---|---|---|
| `cf` | 0.47 tC per t dry matter | normal ±3 % (95 %) | 1 | IPCC 2006 Vol. 4 Table 4.3 (tropical, whole tree) |
| `root_shoot` | rainforest 0.37 · moist 0.232 t root per t shoot | normal ±90 % (95 %) | 1 | IPCC 2006 Table 4.4 (tropical rainforest); IPCC 2019 Table 4.4 (Africa, tropical moist deciduous) |
| `g_anr` | 2.9 t d.m./ha/yr above ground | normal sd 1.0 | 1 | IPCC 2019 Vol. 4 Table 4.9, Africa, tropical moist deciduous, secondary forest ≤ 20 years |
| `g_plantation` | moist 9 · rainforest 6 t d.m./ha/yr above ground | triangular 3–15 | 1 | IPCC 2019 Vol. 4 Table 4.10, Africa, other broadleaf plantations ≤ 20 years |
| `g_alley` | 3.34 tC/ha/yr above + below ground | normal ±22 % (95 %) | 1 | IPCC 2019 Vol. 4 Table 5.2 (Cardinael et al. 2018), Africa tropical moist, alley cropping 2.75 + 0.59 |
| `g_shaded_perennial` | 2.26 tC/ha/yr above + below ground | normal ±34 % (95 %) | 1 | IPCC 2019 Vol. 4 Table 5.2, Africa tropical moist, shaded perennial 1.82 + 0.44 |
| `maturity_perennial` | 20 years | normal ±50 % (95 %) | 1 | IPCC 2019 Vol. 4 Table 5.1, harvest/maturity cycle of perennial systems |
| `rotation_woodenergy` | 10 years | triangular 8–12 | 2 | Acacia wood-energy systems of the Bateke plateau (Mampu, Ibi); confirm per programme · to confirm |
| `horizon` | 20 years | fixed | 1 | IPCC default transition period; crediting horizon for ex-ante figures |
| `cmax_anr_gain` | 87.7 tC/ha | normal ±30 % (95 %) | 2 | DRC FREL 2018 Table 7-3: secondary forest 111.5 minus savanna 23.8 tC/ha (total biomass) |
| `buffer_arr` | 0.2 fraction | fixed | 1 | VCS AFOLU Non-Permanence Risk Tool v4.2 logic, ex-ante default for planted systems |
| `buffer_arr_fire` | 0.25 fraction | fixed | 1 | VCS AFOLU Non-Permanence Risk Tool v4.2 logic, fire-exclusion regeneration on savanna |
| `buffer_redd` | 0.2 fraction | fixed | 1 | VCS AFOLU Non-Permanence Risk Tool v4.2 logic, ex-ante default |
| `leakage_arr` | 0.0 fraction | fixed | 1 | VM0047 v1.1: no activity-shifting leakage when the land was degraded or unused |
| `leakage_redd` | 0.2 fraction | fixed | 1 | VM0048 activity-shifting default pending leakage-belt monitoring |
| `leakage_cooking` | 0.05 fraction | fixed | 1 | TPDDTEC v4 / AMS-II.G adjustment factor 0.95 |
| `leakage_fuelwood` | 0.05 fraction | fixed | 1 | Renewable-biomass supply (AMS-I.E logic) leakage adjustment |
| `defor_rate` | DRC 0.007 · default 0.005 fraction of forest per year | triangular 0.003–0.011 | 2 | DRC FREL 2010–2014 national activity data (≈1.1 %/yr) scaled by the 36 % lower 2015–2018 emissions reported in the UNFCCC technical annex; other countries: placeholder until their FREL activity data are loaded · to confirm |
| `ef_deforestation` | DRC 466 · default 466 tCO2e/ha | normal ±20 % (95 %) | 2 | DRC FREL 2018 Table 7-3 biomass by stratum net of post-conversion stock (dense terra firme 690, secondary 352, dry/open 158), weighted by 2010–2014 activity data |
| `effectiveness_default` | 0.41 fraction | beta ±50 % (95 %) | 1 | Wolf et al. 2021, Nature Ecol. Evol. 5:520–529: protected areas 41 % lower forest loss than matched controls · replaced by CLM-02 |
| `soc_ref` | lac 38 · sandy 27 tC/ha (0–30 cm) | normal ±5 % (95 %) | 1 | IPCC 2019 Vol. 4 Table 2.3, tropical moist |
| `f_lu_cultivated` | 0.83 factor | normal ±11 % (95 %) | 1 | IPCC 2019 Vol. 4 Table 5.5, long-term cultivated, tropical moist/wet |
| `f_i_high` | 1.11 factor | normal ±10 % (95 %) | 1 | IPCC 2019 Vol. 4 Table 5.5, high input without manure, tropical moist/wet |
| `soc_period` | 20 years | fixed | 1 | IPCC default transition period for soil stock changes |
| `wood_per_capita` | 0.5 t wood/person/yr | normal ±30 % (95 %) | 1 | CDM TOOL33 v03.1 (2025), average annual woody biomass consumption per person |
| `household_size` | 5.3 persons | normal ±10 % (95 %) | 2 | DRC EDS-RDC III 2023-24 summary report (5.3 persons per household), unchanged from DHS 2013-14 |
| `fuel_savings` | 0.35 fraction | beta ±30 % (95 %) | 1 | Default until kitchen performance tests are reported · replaced by ENR-03 |
| `usage` | 0.75 fraction | beta ±20 % (95 %) | 1 | Default until adoption surveys are reported · replaced by ENR-02 |
| `usage_dropoff` | 0.1 fraction per year after year 2 | fixed | 1 | Gold Standard usage-survey experience |
| `device_life` | 5 years | fixed | 1 | Gold Standard practice for improved biomass stoves |
| `fnrb` | DRC 0.42 · CAR 0.42 · Cameroon 0.38 · Equatorial Guinea 0.31 · Gabon 0.18 · Congo 0.16 · default 0.39 fraction | beta sd 0.17 | 2 | CDM TOOL33 v03.1 (2025) Table 3 national defaults; standard deviations from Ghilardi & Bailis 2024 Table 5 (MoFuSS), sampled as a beta distribution bounded in (0, 1) |
| `ef_wood_co2` | 1.747 tCO2 per t wood | normal ±5 % (95 %) | 1 | IPCC 2006 Vol. 2 Table 2.5: 112 tCO2/TJ × NCV 0.0156 TJ/t |
| `ef_wood_nonco2` | 0.143 tCO2e per t wood | normal ±50 % (95 %) | 1 | IPCC 2006 Vol. 2 Table 2.5: CH4 300 kg/TJ, N2O 4 kg/TJ; AR6 GWP100 |
| `fuel_share` | 0.5 fraction | triangular 0.3–0.8 | 1 | Assumption: share of plantation and agroforestry wood sold as fuel; replace with harvest and sales records · to confirm |

## 7. What each indicator yields per unit (defaults, DRC moist deciduous stratum)

| Indicator | Inventory ledger (removals, full cycle) | Intervention ledger (net, full cycle, before buffer) | Today's coefficient |
|---|---|---|---|
| FOR-01 natural regeneration | 123 tCO2e/ha over 20 y | 123 | 37 |
| FOR-02 plantation, wood energy | 95 (long-term average) | 95 + displacement potential 31 (ex post only) | 347 |
| AGR-03 agroforestry, alley cropping | 61 (long-term average) | 61 + displacement potential 20 (ex post only) | 347 |
| AGR-02 shaded perennial crops | 166 over 20 y | 166 | 347 |
| AGR-01 improved food crops | 0 (soil not sampled); indicative 13 | indicative 13 | 44 |
| ENR-01 improved stove | 0 | 2.9 per stove over 5 y | 37 |
| FOR-04 forest under conservation | 0 | 21 per ha over 20 y (ex ante) | 19 |

## 8. Indicative portfolio effect (October 2026 data, as of 2025, central values)

| | Previous coefficients | Inventory ledger (removals) | Intervention ledger (net, after leakage and buffer) |
|---|---|---|---|
| Expected, full cycle | 31.4 Mt CO2e | 13.4 Mt CO2e (p5–p95: 7.1–19.9) | 11.0 Mt CO2e (p5–p95: 5.7–16.3) |
| Realised to date | 9.6 Mt CO2e | 1.8 Mt CO2e | 1.7 Mt CO2e |
| Shown apart | — | — | indicative soil carbon 0.6 Mt; fuelwood displacement potential 0.5 Mt |

Bands come from 2,000 Monte Carlo draws per parameter over the library distributions, per indicator and stratum, seeded per key. The drop against the previous coefficients is driven by the long-term-average rule for harvested systems, the cookstove parameters (national fNRB, five-year device life, usage drop-off), the non-permanence buffer, and the removal of the 50 % avoided-deforestation add-on on agriculture; natural regeneration rises.

## 9. Implementation in this repository

Phase 1 (engine and two ledgers, Tier 1/2 defaults):

- `config/carbon/factors.yml`, `strata.yml`, `archetypes.yml`, `claims.yml`.
- `pipeline/carbon/`: `library.py` (factors, distributions), `cohorts.py` (vintages, FIFO retirement), `modules.py` (ARR, REDD, ALM, cooking; fuelwood displacement inside ARR), `engine.py` (strata, tier escalation, Monte Carlo bands, ledgers, claims), called from `pipeline/build.py`, which embeds the results in `web/public/data/metrics.json` (`records[].co2` and the `carbon` block).
- Dashboard: Climate page v2 (ledger toggle, ex-ante/ex-post, bands, archetype and pool breakdown, factor table with provenance), Methodology page generated from the library, Project and Programme pages show claim status, Data-quality page gains carbon checks (cohort decreases, missing stratum, overlapping hectares, defaults still in use).
- Tests: golden values per module against hand calculations in this document; property tests (monotonic growth, cap respected, rotation halving, device life cut-off, vintage sums equal totals); reproducible Monte Carlo.
- Documentation: this file becomes `docs/carbon-methodology.md` (EN) with an FR summary on the Methodology page.

Phase 2 (monitoring data, implemented): ENR-02, ENR-03 and CLM-02 rows reported by a programme replace the usage, fuel-saving and effectiveness defaults for that programme (`CarbonEngine.observe`); CLM-02 rows whose label says baseline/reference supply the programme's own baseline, otherwise the allocated rate × protected area is used; `config/carbon/overrides.yml` holds programme-measured parameters (Tier 3); records carry `basis` (ex ante / ex post) and the list of monitored parameters; reversals larger than the buffer raise a warning; private-sector projects get a derived `corporate_inventory` claim to confirm; household size confirmed at 5.3 by EDS-RDC III 2023-24.

Phase 3 (spatial): programme polygons; biomass-map time series for the ARR performance benchmark and CLM-02; deforestation-risk allocation of the jurisdictional baseline (VMD0055 logic); alert-based reversal detection; strata derived from maps instead of country defaults.

## 10. Decisions taken (Phase 1)

1. Two-ledger design and claims register adopted.
2. Headline: intervention net benefit (expected, full cycle) with its p5–p95 band on the Overview; inventory removals and realised-to-date shown beside it; the Climate page switches between ledgers and between expected and realised.
3. Harvested systems credited at long-term average (VCS rule).
4. Soil carbon and displaced fuelwood shown as indicative/potential only.
5. Defaults: rotation 10 years, buffer 20 % (25 % fire-exclusion), REDD leakage 20 %, effectiveness 41 % ex ante; natural regeneration uses the savanna-mosaic growth rate in every zone (the rainforest secondary-forest rate describes regrowth after clearing, not savanna succession). All flagged defaults are replaced by monitoring data under the tier-escalation rules.
6. Implementation notes: cohorts retire oldest-first on a reported decrease and the released stock is booked as an emission; growth is counted from the year after establishment; Monte Carlo bands are computed per indicator × stratum on the per-unit value and applied to the record series; the Phase 2 and 3 items of section 9 remain open.

## 11. Sources

IPCC 2006 Guidelines Vol. 2 Ch. 2 and Vol. 4 Ch. 4; IPCC 2019 Refinement Vol. 4 Ch. 2, 4, 5; IPCC AR6 WG1 Table 7.15 (GWP100). GHG Protocol Land Sector and Removals Standard v1.1 and Guidance v1.0 (2026). ISO 14064-2:2019. Verra VM0047 v1.1, VM0048 v1.0 and VMD0055, VM0042 v2.1, VM0050, VCS AFOLU Requirements and AFOLU Non-Permanence Risk Tool v4.2. Gold Standard Metered & Measured Energy Cooking Devices v1.2, TPDDTEC v4. ICVCM assessment decisions (Nov 2024, Dec 2024, Mar 2025, Oct 2025). ART TREES v2.0; FCPF Methodological Framework. CDM TOOL33 v03.1 (2025); Ghilardi & Bailis 2024 (MoFuSS fNRB). DRC NERF/FREL 2018 and UNFCCC technical annex; Republic of Congo, Gabon and Cameroon FRELs. Cardinael et al. 2018; Requena Suarez et al. 2019; Wolf et al. 2021. DRC DHS 2013-14. Berkeley Carbon Trading Project cookstove assessments.


## 12. Review corrections (October 2026)

- Monte Carlo bands are ratios to the central value (not to the draw mean) and fractions use beta distributions; the published p95 for countries with a wide fNRB spread (Gabon, Congo) is therefore wider than in the first build.
- Bands are seeded per indicator × stratum, so adding or reordering rows does not move them.
- The tier shown on a result is the weakest input's tier.
- Flow indicators (`Annual / Flow` in the reference workbook, e.g. AGR-01) are stored cumulated in the sheet like every other code; a lower value is a reporting gap, never land taken out, so no cohort is retired and no emission is booked. CLM-02 must be entered as hectares deforested per year; a series that rises every year is flagged as a probable running total.
- `defor_rate` keeps setting the baseline after CLM-02 is reported; only `effectiveness_default` is replaced.
- Outcome and programme achievement averages cap each indicator at 100 % (the indicator's own figure stays uncapped), so one over-achieving indicator no longer lifts the average above what the others justify.
- The progress meter on the Overview compares the expected net benefit with the carbon the programmes' own final targets would deliver (the same factors applied to the indicator targets). The former 168 Mt "anticipated portfolio CO₂" constant, carried over from the previous report, was removed in October 2026 because it had no source and was not an output of this method.
